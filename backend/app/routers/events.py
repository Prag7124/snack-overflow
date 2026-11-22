import asyncio
import json
from uuid import UUID
import jwt
from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from app.auth import JWT_ALGORITHM, JWT_SECRET
from app.errors import AppError
from app.sse import broadcaster

router = APIRouter(prefix="/events", tags=["Real-Time Events"])


def _verify_stream_token(request: Request, token: str | None) -> str:
    raw_token = token
    if not raw_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            raw_token = auth_header.split(" ", 1)[1].strip()
    if not raw_token:
        raise AppError(401, "UNAUTHORIZED", "Missing authentication token for event stream")
    try:
        payload = jwt.decode(raw_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        UUID(str(user_id))
        return str(user_id)
    except Exception:
        raise AppError(401, "INVALID_TOKEN", "Invalid or expired stream token")


@router.get("/stream")
async def stream_events(
    request: Request,
    token: str | None = Query(default=None),
):
    _verify_stream_token(request, token)
    queue = broadcaster.subscribe()

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'data': {'status': 'live'}})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat comment keeps proxies/connections alive
                    yield ": keepalive\n\n"
        finally:
            broadcaster.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
