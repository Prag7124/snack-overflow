import os
from pathlib import Path
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user, require_admin
from app.database import get_db
from app.errors import AppError
from app.models import Activity, Snack, User, Vote
from app.schemas import (
    SnackCategory,
    SnackCreate,
    SnackOut,
    SnackStatus,
    SnackUpdate,
    StockAdjustRequest,
)
from app.sse import broadcaster

router = APIRouter(prefix="/snacks", tags=["Snacks"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


async def _serialize_snack(
    snack: Snack, db: AsyncSession, current_user: User
) -> SnackOut:
    vote_count_res = await db.execute(
        select(func.count(Vote.id)).where(Vote.snack_id == snack.id)
    )
    vote_count = vote_count_res.scalar_one()

    user_vote_res = await db.execute(
        select(Vote.id).where(
            Vote.snack_id == snack.id, Vote.user_id == current_user.id
        )
    )
    user_has_voted = user_vote_res.scalar_one_or_none() is not None

    return SnackOut(
        id=snack.id,
        name=snack.name,
        category=snack.category,
        quantity=snack.quantity,
        low_stock_threshold=snack.low_stock_threshold,
        image_url=snack.image_url,
        status=snack.status,
        vote_count=vote_count,
        user_has_voted=user_has_voted,
        created_at=snack.created_at,
    )


@router.post("/upload-image")
async def upload_snack_image(
    file: UploadFile = File(...),
    admin_user: User = Depends(require_admin),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AppError(
            400,
            "INVALID_IMAGE_TYPE",
            "Only .jpg, .jpeg, .png, .webp, or .gif images are supported",
        )
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise AppError(400, "IMAGE_TOO_LARGE", "Image must be smaller than 5 MB")

    filename = f"{uuid4().hex}{ext}"
    dest = UPLOAD_DIR / filename
    dest.write_bytes(content)
    return {"image_url": f"http://127.0.0.1:8000/uploads/{filename}"}


@router.get("", response_model=list[SnackOut])
async def list_snacks(
    category: SnackCategory | None = Query(default=None),
    status: SnackStatus | None = Query(default=None),
    search: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Snack).order_by(Snack.name.asc())
    if category:
        stmt = stmt.where(Snack.category == category)
    if search:
        stmt = stmt.where(Snack.name.ilike(f"%{search.strip()}%"))

    result = await db.execute(stmt)
    snacks = result.scalars().all()

    counts_res = await db.execute(
        select(Vote.snack_id, func.count(Vote.id)).group_by(Vote.snack_id)
    )
    vote_counts = dict(counts_res.all())

    user_votes_res = await db.execute(
        select(Vote.snack_id).where(Vote.user_id == current_user.id)
    )
    user_voted_ids = set(user_votes_res.scalars().all())

    items: list[SnackOut] = []
    for s in snacks:
        if status and s.status != status:
            continue
        items.append(
            SnackOut(
                id=s.id,
                name=s.name,
                category=s.category,
                quantity=s.quantity,
                low_stock_threshold=s.low_stock_threshold,
                image_url=s.image_url,
                status=s.status,
                vote_count=vote_counts.get(s.id, 0),
                user_has_voted=s.id in user_voted_ids,
                created_at=s.created_at,
            )
        )
    return items


@router.post("", response_model=SnackOut, status_code=201)
async def create_snack(
    payload: SnackCreate,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    snack = Snack(
        name=payload.name.strip(),
        category=payload.category,
        quantity=payload.quantity,
        low_stock_threshold=payload.low_stock_threshold,
        image_url=payload.image_url,
    )
    db.add(snack)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise AppError(409, "DUPLICATE_SNACK", f"Snack '{payload.name}' already exists")

    if payload.quantity > 0:
        db.add(
            Activity(
                user_id=admin_user.id,
                snack_id=snack.id,
                action="restocked",
                amount=payload.quantity,
            )
        )

    await db.commit()
    await db.refresh(snack)
    serialized = await _serialize_snack(snack, db, admin_user)
    await broadcaster.publish("snack.created", serialized.model_dump())
    return serialized


@router.patch("/{snack_id}", response_model=SnackOut)
async def update_snack(
    snack_id: UUID,
    payload: SnackUpdate,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Snack).where(Snack.id == snack_id))
    snack = result.scalar_one_or_none()
    if not snack:
        raise AppError(404, "SNACK_NOT_FOUND", "Snack not found")

    if payload.name is not None:
        snack.name = payload.name.strip()
    if payload.category is not None:
        snack.category = payload.category
    if payload.low_stock_threshold is not None:
        snack.low_stock_threshold = payload.low_stock_threshold
    if payload.image_url is not None:
        snack.image_url = payload.image_url

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise AppError(409, "DUPLICATE_SNACK", "Another snack with this name already exists")

    await db.refresh(snack)
    serialized = await _serialize_snack(snack, db, admin_user)
    await broadcaster.publish("snack.updated", serialized.model_dump())
    return serialized


@router.delete("/{snack_id}", status_code=204)
async def delete_snack(
    snack_id: UUID,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Snack).where(Snack.id == snack_id))
    snack = result.scalar_one_or_none()
    if not snack:
        raise AppError(404, "SNACK_NOT_FOUND", "Snack not found")

    await db.delete(snack)
    await db.commit()
    await broadcaster.publish("snack.deleted", {"id": str(snack_id)})


@router.post("/{snack_id}/consume", response_model=SnackOut)
async def consume_snack(
    snack_id: UUID,
    payload: StockAdjustRequest = StockAdjustRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        update(Snack)
        .where(Snack.id == snack_id, Snack.quantity >= payload.amount)
        .values(quantity=Snack.quantity - payload.amount)
        .returning(Snack.id)
    )
    res = await db.execute(stmt)
    updated_id = res.scalar_one_or_none()

    if not updated_id:
        await db.rollback()
        exists_res = await db.execute(select(Snack.quantity).where(Snack.id == snack_id))
        current_qty = exists_res.scalar_one_or_none()
        if current_qty is None:
            raise AppError(404, "SNACK_NOT_FOUND", "Snack not found")
        raise AppError(
            400,
            "OUT_OF_STOCK",
            f"Not enough stock available (requested {payload.amount}, available {current_qty})",
        )

    db.add(
        Activity(
            user_id=current_user.id,
            snack_id=snack_id,
            action="consumed",
            amount=payload.amount,
        )
    )
    await db.commit()

    snack_res = await db.execute(select(Snack).where(Snack.id == snack_id))
    snack = snack_res.scalar_one()
    serialized = await _serialize_snack(snack, db, current_user)
    await broadcaster.publish(
        "snack.updated",
        {
            "id": str(snack.id),
            "name": snack.name,
            "image_url": snack.image_url,
            "quantity": snack.quantity,
            "status": snack.status,
            "vote_count": serialized.vote_count,
            "actor": current_user.name,
            "action": "consumed",
            "amount": payload.amount,
        },
    )
    return serialized


@router.post("/{snack_id}/restock", response_model=SnackOut)
async def restock_snack(
    snack_id: UUID,
    payload: StockAdjustRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        update(Snack)
        .where(Snack.id == snack_id)
        .values(quantity=Snack.quantity + payload.amount)
        .returning(Snack.id)
    )
    res = await db.execute(stmt)
    updated_id = res.scalar_one_or_none()

    if not updated_id:
        await db.rollback()
        raise AppError(404, "SNACK_NOT_FOUND", "Snack not found")

    db.add(
        Activity(
            user_id=admin_user.id,
            snack_id=snack_id,
            action="restocked",
            amount=payload.amount,
        )
    )
    await db.commit()

    snack_res = await db.execute(select(Snack).where(Snack.id == snack_id))
    snack = snack_res.scalar_one()
    serialized = await _serialize_snack(snack, db, admin_user)
    await broadcaster.publish(
        "snack.updated",
        {
            "id": str(snack.id),
            "name": snack.name,
            "image_url": snack.image_url,
            "quantity": snack.quantity,
            "status": snack.status,
            "vote_count": serialized.vote_count,
            "actor": admin_user.name,
            "action": "restocked",
            "amount": payload.amount,
        },
    )
    return serialized


@router.post("/{snack_id}/vote", response_model=SnackOut)
async def vote_snack(
    snack_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    snack_res = await db.execute(select(Snack).where(Snack.id == snack_id))
    snack = snack_res.scalar_one_or_none()
    if not snack:
        raise AppError(404, "SNACK_NOT_FOUND", "Snack not found")

    existing_res = await db.execute(
        select(Vote.id).where(Vote.user_id == current_user.id, Vote.snack_id == snack_id)
    )
    if existing_res.scalar_one_or_none() is None:
        db.add(Vote(user_id=current_user.id, snack_id=snack_id))
        db.add(
            Activity(
                user_id=current_user.id,
                snack_id=snack_id,
                action="voted",
                amount=1,
            )
        )
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()

    serialized = await _serialize_snack(snack, db, current_user)
    await broadcaster.publish(
        "vote.updated",
        {"id": str(snack.id), "vote_count": serialized.vote_count},
    )
    return serialized


@router.delete("/{snack_id}/vote", response_model=SnackOut)
async def unvote_snack(
    snack_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    snack_res = await db.execute(select(Snack).where(Snack.id == snack_id))
    snack = snack_res.scalar_one_or_none()
    if not snack:
        raise AppError(404, "SNACK_NOT_FOUND", "Snack not found")

    await db.execute(
        delete(Vote).where(Vote.user_id == current_user.id, Vote.snack_id == snack_id)
    )
    await db.commit()

    serialized = await _serialize_snack(snack, db, current_user)
    await broadcaster.publish(
        "vote.updated",
        {"id": str(snack.id), "vote_count": serialized.vote_count},
    )
    return serialized
