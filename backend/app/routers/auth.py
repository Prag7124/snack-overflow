import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
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


def _send_reset_email(to_email: str, user_name: str, reset_token: str) -> bool:
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_pass = os.getenv("SMTP_PASS", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    reset_link = f"{frontend_url}/?reset_token={reset_token}"

    if not smtp_host or not smtp_user or not smtp_pass:
        print(f"\n[DEV MAIL] Password reset link for {to_email}: {reset_link}\n")
        return False

    msg = EmailMessage()
    msg["Subject"] = "Snack Overflow — Reset Your Pantry Password"
    msg["From"] = f"Snack Overflow Pantry <{smtp_user}>"
    msg["To"] = to_email
    msg.set_content(
        f"Hi {user_name},\n\n"
        f"We received a request to reset your Snack Overflow password.\n"
        f"Click the link below within 15 minutes to choose a new password:\n\n"
        f"{reset_link}\n\n"
        f"If you didn't request this, you can safely ignore this email."
    )

    with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
    return True


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

    try:
        email_sent = _send_reset_email(user.email, user.name, reset_token)
    except Exception as exc:
        raise AppError(502, "EMAIL_SEND_FAILED", f"Failed to send reset email: {exc}")

    return {
        "message": (
            f"Password reset link sent to {user.email}. Please check your inbox (and spam folder)."
            if email_sent
            else f"SMTP not configured in backend/.env yet — reset link printed to backend terminal for {user.email}."
        ),
        "email_sent": email_sent,
    }


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        decoded = jwt.decode(payload.token.strip(), RESET_SECRET, algorithms=[RESET_ALGO])
    except jwt.ExpiredSignatureError:
        raise AppError(400, "RESET_TOKEN_EXPIRED", "Reset link has expired. Please request a new one.")
    except jwt.InvalidTokenError:
        raise AppError(400, "INVALID_RESET_TOKEN", "Invalid password reset link.")

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
