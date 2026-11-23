import os
from datetime import datetime, timedelta, timezone
from uuid import UUID
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    verify_password,
)
from app.database import get_db
from app.errors import AppError
from app.models import User
from app.schemas import (
    CreateUserRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
)

load_dotenv()

router = APIRouter(prefix="/auth", tags=["Auth"])

RESET_SECRET = os.getenv("JWT_SECRET", os.getenv("SECRET_KEY", "dev-secret-change-me"))
RESET_ALGO = "HS256"


def _user_to_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        name=u.name,
        email=u.email,
        role=u.role,
        created_at=u.created_at or datetime.now(timezone.utc),
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email.lower().strip()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")

    token = create_access_token(user)
    return TokenResponse(access_token=token, user=_user_to_out(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return _user_to_out(current_user)


@router.get("/users", response_model=list[UserOut])
async def list_users(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    return [_user_to_out(u) for u in rows]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    payload: CreateUserRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    clean_email = payload.email.lower().strip()
    existing = await db.execute(select(User.id).where(User.email == clean_email))
    if existing.scalar_one_or_none() is not None:
        raise AppError(409, "EMAIL_EXISTS", f"A user with email '{clean_email}' already exists")

    new_user = User(
        name=payload.name.strip(),
        email=clean_email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(new_user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AppError(400, "USER_CREATE_FAILED", f"Database constraint error: {exc.orig}")

    return _user_to_out(new_user)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin_user.id:
        raise AppError(400, "CANNOT_DELETE_SELF", "You cannot delete your own currently logged-in admin account")

    res = await db.execute(select(User).where(User.id == user_id))
    target = res.scalar_one_or_none()
    if not target:
        raise AppError(404, "USER_NOT_FOUND", "Team member not found")

    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    clean_email = payload.email.lower().strip()
    res = await db.execute(select(User).where(User.email == clean_email))
    user = res.scalar_one_or_none()

    # Strict active-account check: removed ex-employees or unknown emails are blocked
    if not user:
        raise AppError(
            404,
            "ACCOUNT_NOT_FOUND",
            "No active employee or admin account exists for this email. Contact your Pantry Admin.",
        )

    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    reset_token = jwt.encode(
        {"sub": str(user.id), "purpose": "password_reset", "exp": expire},
        RESET_SECRET,
        algorithm=RESET_ALGO,
    )

    return {
        "message": f"Account verified for {user.name} ({user.email}). Set your new password below.",
        "reset_token": reset_token,
    }


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        decoded = jwt.decode(payload.token.strip(), RESET_SECRET, algorithms=[RESET_ALGO])
    except jwt.ExpiredSignatureError:
        raise AppError(400, "RESET_TOKEN_EXPIRED", "Reset session has expired. Please verify your email again.")
    except jwt.InvalidTokenError:
        raise AppError(400, "INVALID_RESET_TOKEN", "Invalid password reset session.")

    if decoded.get("purpose") != "password_reset":
        raise AppError(400, "INVALID_RESET_TOKEN", "Invalid token purpose.")

    user_id = decoded.get("sub")
    res = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = res.scalar_one_or_none()

    if not user:
        raise AppError(
            403,
            "ACCOUNT_REVOKED",
            "This workspace account has been removed by an Admin and cannot reset its password.",
        )

    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"message": "Password updated successfully! You can now sign in with your new password."}
