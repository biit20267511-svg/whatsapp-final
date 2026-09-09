import asyncio
import os
import jwt
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from database import NO_ID, db
from events import ADMIN_CHANNEL, bus

router = APIRouter(prefix="", tags=["stream"])


@router.get("/stream")
async def stream(request: Request, token: str = ""):
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
        user = await db.users.find_one({"id": payload.get("sub")}, NO_ID)
        if user and user.get("role") == "SUPER_ADMIN":
            restaurant_id = ADMIN_CHANNEL
        else:
            restaurant_id = user.get("restaurant_id") if user else None
    except Exception:
        restaurant_id = None
    if not restaurant_id: return JSONResponse({"detail": "Not authenticated"}, status_code=401)

    async def events():
        queue = await bus.subscribe(restaurant_id)
        try:
            yield "event: ready\ndata: connected\n\n"
            while not await request.is_disconnected():
                try: yield f"data: {await asyncio.wait_for(queue.get(), timeout=20)}\n\n"
                except asyncio.TimeoutError: yield ": heartbeat\n\n"
        finally: bus.unsubscribe(restaurant_id, queue)
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})