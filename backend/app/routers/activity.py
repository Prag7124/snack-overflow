from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import require_admin
from app.database import get_db
from app.models import Activity, Snack, User
from app.schemas import ActivityAction, ActivityOut, ActivitySummaryOut

router = APIRouter(prefix="/activity", tags=["Activity"])


@router.get("", response_model=ActivitySummaryOut)
async def get_activity_feed(
    action: ActivityAction | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            Activity.id,
            User.name.label("user_name"),
            User.email.label("user_email"),
            Snack.name.label("snack_name"),
            Activity.action,
            Activity.amount,
            Activity.created_at,
        )
        .join(User, Activity.user_id == User.id)
        .join(Snack, Activity.snack_id == Snack.id)
        .order_by(desc(Activity.created_at))
        .limit(limit)
    )
    if action:
        stmt = stmt.where(Activity.action == action)

    rows = (await db.execute(stmt)).all()
    items = [
        ActivityOut(
            id=r.id,
            user_name=r.user_name,
            user_email=r.user_email,
            snack_name=r.snack_name,
            action=r.action,
            amount=r.amount,
            created_at=r.created_at,
        )
        for r in rows
    ]

    since_7d = datetime.now(timezone.utc) - timedelta(days=7)

    consumed_7d_res = await db.execute(
        select(func.coalesce(func.sum(Activity.amount), 0)).where(
            Activity.action == "consumed", Activity.created_at >= since_7d
        )
    )
    total_consumed_7d = int(consumed_7d_res.scalar_one())

    restocked_7d_res = await db.execute(
        select(func.coalesce(func.sum(Activity.amount), 0)).where(
            Activity.action == "restocked", Activity.created_at >= since_7d
        )
    )
    total_restocked_7d = int(restocked_7d_res.scalar_one())

    top_snack_res = await db.execute(
        select(Snack.name, func.sum(Activity.amount).label("total"))
        .join(Snack, Activity.snack_id == Snack.id)
        .where(Activity.action == "consumed", Activity.created_at >= since_7d)
        .group_by(Snack.name)
        .order_by(desc("total"))
        .limit(1)
    )
    top_row = top_snack_res.first()
    top_consumed_snack = top_row.name if top_row else None

    return ActivitySummaryOut(
        total_consumed_7d=total_consumed_7d,
        total_restocked_7d=total_restocked_7d,
        top_consumed_snack=top_consumed_snack,
        items=items,
    )
