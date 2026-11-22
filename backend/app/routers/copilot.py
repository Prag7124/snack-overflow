import os
from datetime import datetime, timedelta, timezone
import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user
from app.database import get_db
from app.models import Activity, Snack, User, Vote
from app.schemas import CopilotAskRequest, CopilotResponse, RestockRecommendation

router = APIRouter(prefix="/copilot", tags=["Pantry Copilot"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


async def _build_pantry_context(db: AsyncSession) -> list[RestockRecommendation]:
    snacks = (await db.execute(select(Snack).order_by(Snack.name.asc()))).scalars().all()

    vote_rows = (
        await db.execute(select(Vote.snack_id, func.count(Vote.id)).group_by(Vote.snack_id))
    ).all()
    votes_map = dict(vote_rows)

    since_7d = datetime.now(timezone.utc) - timedelta(days=7)
    consumed_rows = (
        await db.execute(
            select(Activity.snack_id, func.sum(Activity.amount))
            .where(Activity.action == "consumed", Activity.created_at >= since_7d)
            .group_by(Activity.snack_id)
        )
    ).all()
    consumed_map = {sid: int(total) for sid, total in consumed_rows}

    recommendations: list[RestockRecommendation] = []
    for s in snacks:
        votes = votes_map.get(s.id, 0)
        consumed_7d = consumed_map.get(s.id, 0)
        target_buffer = max(s.low_stock_threshold * 2, consumed_7d + 4, 8)
        needed = max(0, target_buffer - s.quantity)

        if s.status == "gone" or (s.status == "running_low" and votes >= 1):
            priority = "high"
        elif s.status == "running_low" or votes >= 2 or consumed_7d >= 5:
            priority = "medium"
        else:
            priority = "low"

        if priority in ("high", "medium") and needed > 0:
            reasons = []
            if s.status == "gone":
                reasons.append("completely out of stock")
            elif s.status == "running_low":
                reasons.append(f"running low ({s.quantity} left, threshold {s.low_stock_threshold})")
            if votes > 0:
                reasons.append(f"{votes} team upvote(s)")
            if consumed_7d > 0:
                reasons.append(f"{consumed_7d} consumed in last 7d")

            recommendations.append(
                RestockRecommendation(
                    snack_id=s.id,
                    snack_name=s.name,
                    category=s.category,
                    current_quantity=s.quantity,
                    status=s.status,
                    vote_count=votes,
                    consumed_7d=consumed_7d,
                    suggested_restock_qty=needed,
                    priority=priority,
                    reason=", ".join(reasons).capitalize() or "Maintain healthy pantry buffer",
                )
            )

    priority_rank = {"high": 0, "medium": 1, "low": 2}
    recommendations.sort(key=lambda r: (priority_rank[r.priority], -r.vote_count, -r.consumed_7d))
    return recommendations


async def _call_gemini(prompt: str) -> str | None:
    if not GEMINI_API_KEY:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                return None
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None


@router.get("/restock-plan", response_model=CopilotResponse)
async def get_restock_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recs = await _build_pantry_context(db)
    summary_lines = [
        f"- {r.snack_name} [{r.priority.upper()}]: qty={r.current_quantity}, votes={r.vote_count}, 7d_consumed={r.consumed_7d} -> order +{r.suggested_restock_qty}"
        for r in recs[:6]
    ]
    context_text = "\n".join(summary_lines) or "All snacks are currently well-stocked."

    prompt = (
        "You are Snack Overflow's Pantry Copilot for an engineering office. "
        "Write a concise, actionable 3-sentence restock briefing based on this live pantry data:\n"
        f"{context_text}"
    )
    ai_answer = await _call_gemini(prompt)
    if ai_answer:
        return CopilotResponse(answer=ai_answer, source="gemini", recommendations=recs)

    if not recs:
        fallback = "Pantry health looks great! Every snack is comfortably above its low-stock threshold with no urgent restocks needed."
    else:
        top_names = ", ".join(f"{r.snack_name} (+{r.suggested_restock_qty})" for r in recs[:3])
        fallback = (
            f"Priority restock alert: {len(recs)} snack(s) need attention based on current stock, team upvotes, and 7-day consumption velocity. "
            f"Top items to order immediately: {top_names}."
        )
    return CopilotResponse(answer=fallback, source="smart-fallback", recommendations=recs)


@router.post("/ask", response_model=CopilotResponse)
async def ask_copilot(
    payload: CopilotAskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    snacks = (await db.execute(select(Snack).order_by(Snack.name.asc()))).scalars().all()
    recs = await _build_pantry_context(db)

    inventory_snapshot = "\n".join(
        f"- {s.name} ({s.category}): qty={s.quantity}, status={s.status}" for s in snacks
    )
    prompt = (
        "You are Snack Overflow's Pantry Copilot. Answer the user's question concisely using ONLY this real-time pantry inventory:\n"
        f"{inventory_snapshot}\n\nUser question: {payload.question}"
    )

    ai_answer = await _call_gemini(prompt)
    if ai_answer:
        return CopilotResponse(answer=ai_answer, source="gemini", recommendations=recs[:4])

    q = payload.question.lower()
    if "low" in q or "out" in q or "gone" in q or "restock" in q:
        urgent = [s.name for s in snacks if s.status in ("gone", "running_low")]
        answer = (
            f"Currently running low or out of stock: {', '.join(urgent)}."
            if urgent
            else "Nothing is currently running low or out of stock!"
        )
    elif "healthy" in q:
        healthy = [f"{s.name} ({s.quantity})" for s in snacks if s.category == "healthy-ish" and s.quantity > 0]
        answer = (
            f"Available healthy-ish snacks right now: {', '.join(healthy)}."
            if healthy
            else "All healthy-ish snacks are currently out of stock—consider upvoting your favorites!"
        )
    else:
        in_stock = [f"{s.name} ({s.quantity})" for s in snacks if s.quantity > 0]
        answer = f"We currently have {len(in_stock)} snacks in stock, including: {', '.join(in_stock[:5])}."

    return CopilotResponse(answer=answer, source="smart-fallback", recommendations=recs[:4])
