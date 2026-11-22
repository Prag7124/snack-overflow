import os
import re
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

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

OFF_TOPIC_KEYWORDS = {
    "weather", "movie", "cricket", "football", "stock market", "bitcoin", "crypto",
    "write code", "python script", "javascript", "politics", "news", "president",
    "prime minister", "translate", "poem", "essay", "joke",
}


async def _build_pantry_context(
    db: AsyncSession,
) -> tuple[list[Snack], dict, dict, list[RestockRecommendation]]:
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
                reasons.append("out of stock")
            elif s.status == "running_low":
                reasons.append(f"running low ({s.quantity} left, threshold {s.low_stock_threshold})")
            if votes > 0:
                reasons.append(f"{votes} team upvote(s)")
            if consumed_7d > 0:
                reasons.append(f"{consumed_7d} grabbed in 7d")

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
                    reason=", ".join(reasons).capitalize() or "Maintain buffer",
                )
            )

    priority_rank = {"high": 0, "medium": 1, "low": 2}
    recommendations.sort(key=lambda r: (priority_rank[r.priority], -r.vote_count, -r.consumed_7d))
    return snacks, votes_map, consumed_map, recommendations


async def _call_gemini(prompt: str) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
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


def _smart_local_answer(
    question: str,
    role: str,
    snacks: list[Snack],
    votes_map: dict,
    consumed_map: dict,
    recs: list[RestockRecommendation],
) -> str:
    q = question.lower().strip()

    if any(bad in q for bad in OFF_TOPIC_KEYWORDS):
        return (
            "I'm Snack Overflow's Pantry Copilot—I only help with office pantry stock, "
            "snack recommendations, nutrition/cravings, and restock planning!"
        )

    # Check if user asked about a specific snack by name
    matched_snacks = [
        s for s in snacks if any(word in s.name.lower() for word in re.findall(r"[a-z]{3,}", q) if word not in {"what", "which", "have", "many", "left", "stock", "snack", "snacks", "available", "recommend", "suggest", "most", "popular", "restock"})
    ]
    if matched_snacks:
        details = []
        for s in matched_snacks:
            v = votes_map.get(s.id, 0)
            c = consumed_map.get(s.id, 0)
            if role == "admin":
                details.append(
                    f"{s.name} ({s.category}): {s.quantity} in stock [status: {s.status}], {v} upvote(s), {c} grabbed in 7d"
                )
            else:
                avail = f"{s.quantity} left in the pantry" if s.quantity > 0 else "currently out of stock (upvote it so Admin restocks!)"
                details.append(f"{s.name} ({s.category}) — {avail} ({v} team votes)")
        return "Here is what I found: " + "; ".join(details) + "."

    # Category-specific questions
    for cat in ("sweet", "savoury", "drink", "healthy-ish"):
        cat_keyword = "healthy" if cat == "healthy-ish" else cat
        if cat_keyword in q:
            in_cat = [s for s in snacks if s.category == cat and s.quantity > 0]
            if not in_cat:
                out_cat = [s.name for s in snacks if s.category == cat]
                return f"No {cat} snacks are currently in stock ({', '.join(out_cat) or 'none listed'}). Upvote one to request a restock!"
            listed = ", ".join(f"{s.name} ({s.quantity} left)" for s in in_cat)
            return f"Available {cat} options right now: {listed}."

    # Popular / most voted / trending
    if any(k in q for k in ("vote", "popular", "favorite", "favourite", "trending", "demand")):
        ranked = sorted(snacks, key=lambda s: (votes_map.get(s.id, 0), consumed_map.get(s.id, 0)), reverse=True)
        top = [f"{s.name} ({votes_map.get(s.id, 0)} votes, {s.quantity} left)" for s in ranked[:4]]
        return f"Top requested snacks by team votes & demand: {', '.join(top)}."

    # Admin vs Member general fallback
    if role == "admin":
        urgent = [f"{r.snack_name} (order +{r.suggested_restock_qty})" for r in recs[:4]]
        total_units = sum(s.quantity for s in snacks)
        return (
            f"Admin Inventory Snapshot: {total_units} total units across {len(snacks)} snacks. "
            + (f"Top restock priorities: {', '.join(urgent)}." if urgent else "All items are above low-stock thresholds.")
        )
    else:
        available = [s for s in snacks if s.quantity > 0]
        if not available:
            return "The pantry is currently empty! Upvote your favorite snacks so Admin prioritizes them."
        picks = sorted(available, key=lambda s: s.quantity, reverse=True)[:4]
        return (
            f"Fresh picks available to grab right now: "
            + ", ".join(f"{s.name} ({s.quantity} left, {s.category})" for s in picks)
            + ". Ask me about sweet, savoury, drinks, healthy-ish, or any specific snack!"
        )


@router.get("/restock-plan", response_model=CopilotResponse)
async def get_restock_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    snacks, votes_map, consumed_map, recs = await _build_pantry_context(db)
    role = current_user.role

    if role == "admin":
        summary_lines = [
            f"- {r.snack_name} [{r.priority.upper()}]: qty={r.current_quantity}, votes={r.vote_count}, 7d_consumed={r.consumed_7d} -> order +{r.suggested_restock_qty}"
            for r in recs[:6]
        ]
        prompt = (
            "You are Snack Overflow's Operations AI for a Pantry Admin. "
            "Give a sharp 3-sentence procurement & restock briefing based on this live data:\n"
            + ("\n".join(summary_lines) or "All snacks are well-stocked.")
        )
        ai_answer = await _call_gemini(prompt)
        if ai_answer:
            return CopilotResponse(answer=ai_answer, role_mode="admin", source="gemini", recommendations=recs)

        if not recs:
            fallback = "Operations check: All snacks are comfortably above low-stock thresholds—no restock orders needed today."
        else:
            top_names = ", ".join(f"{r.snack_name} (+{r.suggested_restock_qty})" for r in recs[:3])
            fallback = (
                f"Procurement alert: {len(recs)} snack(s) require restocking based on 7-day consumption velocity and team upvotes. "
                f"Immediate order queue: {top_names}."
            )
        return CopilotResponse(answer=fallback, role_mode="admin", source="smart-fallback", recommendations=recs)

    # Member briefing: personalized snack guide + what to upvote
    in_stock = [f"{s.name} ({s.category}, {s.quantity} left)" for s in snacks if s.quantity > 0][:6]
    out_of_stock = [s.name for s in snacks if s.quantity == 0][:4]
    prompt = (
        "You are Snack Overflow's Friendly Pantry Concierge for an office team member. "
        "In 3 short sentences, highlight what tasty snacks are freshly stocked right now and which out-of-stock favorites they should upvote:\n"
        f"In stock: {', '.join(in_stock) or 'none'}\nOut of stock: {', '.join(out_of_stock) or 'none'}"
    )
    ai_answer = await _call_gemini(prompt)
    if ai_answer:
        return CopilotResponse(answer=ai_answer, role_mode="member", source="gemini", recommendations=recs[:4])

    available_count = sum(1 for s in snacks if s.quantity > 0)
    top_picks = ", ".join(s.name for s in snacks if s.quantity > 0)[:80]
    fallback = (
        f"Welcome to the pantry! {available_count} of {len(snacks)} snacks are ready to grab right now ({top_picks}). "
        + (f"Missing {', '.join(out_of_stock[:2])}? Tap ▲ Vote on their cards to boost them to the top of Admin's restock list!" if out_of_stock else "Ask me for sweet, savoury, drink, or healthy-ish picks!")
    )
    return CopilotResponse(answer=fallback, role_mode="member", source="smart-fallback", recommendations=recs[:4])


@router.post("/ask", response_model=CopilotResponse)
async def ask_copilot(
    payload: CopilotAskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    snacks, votes_map, consumed_map, recs = await _build_pantry_context(db)
    role = current_user.role

    inventory_snapshot = "\n".join(
        f"- {s.name} ({s.category}): qty={s.quantity}, status={s.status}, votes={votes_map.get(s.id, 0)}, 7d_grabbed={consumed_map.get(s.id, 0)}"
        for s in snacks
    )
    role_instruction = (
        "You are speaking to a Pantry ADMIN. Focus on inventory counts, restock quantities, consumption velocity, and budget/procurement priorities."
        if role == "admin"
        else "You are speaking to a Pantry MEMBER. Focus on snack recommendations, dietary/category choices, availability, and upvoting out-of-stock favorites."
    )
    prompt = (
        f"You are Snack Overflow's domain-locked Pantry Copilot. {role_instruction} "
        "STRICT RULE: Only answer questions about the office pantry, snacks, nutrition/cravings, or restocking. "
        "If the user asks anything unrelated (coding, weather, math, general trivia), politely decline in 1 sentence. "
        f"Use ONLY this live pantry inventory:\n{inventory_snapshot}\n\nUser question: {payload.question}"
    )

    ai_answer = await _call_gemini(prompt)
    if ai_answer:
        return CopilotResponse(answer=ai_answer, role_mode=role, source="gemini", recommendations=recs[:4])

    smart_answer = _smart_local_answer(payload.question, role, snacks, votes_map, consumed_map, recs)
    return CopilotResponse(answer=smart_answer, role_mode=role, source="smart-fallback", recommendations=recs[:4])
