from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user, require_admin
from app.database import get_db
from app.errors import AppError
from app.models import Activity, Order, OrderItem, Snack, User
from app.schemas import OrderCreateRequest, OrderItemOut, OrderOut
from app.sse import broadcaster

router = APIRouter(prefix="/orders", tags=["Orders"])


def _format_order(order: Order, user: User) -> OrderOut:
    return OrderOut(
        id=order.id,
        order_code=order.order_code,
        user_id=order.user_id,
        user_name=user.name,
        user_email=user.email,
        status=order.status,
        total_items=sum(i.quantity for i in order.items),
        items=[
            OrderItemOut(
                snack_id=i.snack_id,
                snack_name=i.snack_name,
                quantity=i.quantity,
            )
            for i in order.items
        ],
        created_at=order.created_at,
    )


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    payload: OrderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Merge duplicate snack_ids if passed in the same tray
    merged: dict[UUID, int] = {}
    for item in payload.items:
        merged[item.snack_id] = merged.get(item.snack_id, 0) + item.quantity

    seq_res = await db.execute(text("SELECT nextval('order_number_seq')"))
    order_num = seq_res.scalar_one()
    order_code = f"ORD-{order_num}"

    order = Order(
        order_code=order_code,
        user_id=current_user.id,
        status="pending_pickup",
    )
    db.add(order)
    await db.flush()

    updated_snacks_for_sse: list[Snack] = []

    # Sort by snack_id to prevent deadlocks under concurrent multi-item checkouts
    for snack_id in sorted(merged.keys(), key=str):
        qty = merged[snack_id]
        snack_res = await db.execute(select(Snack).where(Snack.id == snack_id))
        snack = snack_res.scalar_one_or_none()
        if not snack:
            await db.rollback()
            raise AppError(404, "SNACK_NOT_FOUND", f"Snack {snack_id} not found")

        upd = await db.execute(
            update(Snack)
            .where(Snack.id == snack_id, Snack.quantity >= qty)
            .values(quantity=Snack.quantity - qty)
            .returning(Snack.quantity)
        )
        new_qty = upd.scalar_one_or_none()
        if new_qty is None:
            await db.rollback()
            raise AppError(
                400,
                "OUT_OF_STOCK",
                f"Not enough '{snack.name}' left in stock (requested {qty}, available {snack.quantity})",
            )

        db.add(
            OrderItem(
                order_id=order.id,
                snack_id=snack.id,
                snack_name=snack.name,
                quantity=qty,
            )
        )
        db.add(
            Activity(
                user_id=current_user.id,
                snack_id=snack.id,
                action="consumed",
                amount=qty,
                order_code=order_code,
            )
        )
        snack.quantity = new_qty
        updated_snacks_for_sse.append(snack)

    await db.commit()
    await db.refresh(order)

    for s in updated_snacks_for_sse:
        await broadcaster.publish(
            "snack.updated",
            {
                "id": str(s.id),
                "name": s.name,
                "image_url": s.image_url,
                "quantity": s.quantity,
                "status": s.status,
                "actor": current_user.name,
                "action": "ordered",
                "amount": merged[s.id],
                "order_code": order_code,
            },
        )

    formatted = _format_order(order, current_user)
    await broadcaster.publish("order.created", formatted.model_dump())
    return formatted


@router.get("", response_model=list[OrderOut])
async def list_orders(
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Order, User)
        .join(User, Order.user_id == User.id)
        .order_by(Order.created_at.desc())
        .limit(limit)
    )
    if current_user.role != "admin":
        stmt = stmt.where(Order.user_id == current_user.id)
    if status:
        stmt = stmt.where(Order.status == status)
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where((Order.order_code.ilike(q)) | (User.name.ilike(q)))

    rows = (await db.execute(stmt)).all()
    return [_format_order(order, u) for order, u in rows]


@router.post("/{order_id}/handover", response_model=OrderOut)
async def mark_order_handed_over(
    order_id: UUID,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Order, User).join(User, Order.user_id == User.id).where(Order.id == order_id)
    )
    row = res.one_or_none()
    if not row:
        raise AppError(404, "ORDER_NOT_FOUND", "Order not found")

    order, order_owner = row
    order.status = "handed_over"
    await db.commit()
    await db.refresh(order)

    formatted = _format_order(order, order_owner)
    await broadcaster.publish("order.updated", formatted.model_dump())
    return formatted
