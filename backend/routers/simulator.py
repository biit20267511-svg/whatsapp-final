from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_restaurant_id
from database import NO_ID, clean, clean_list, db
from services import conversation_service
from whatsapp.base import IncomingMessage

router = APIRouter(prefix="/simulator", tags=["simulator"])


class SimMessage(BaseModel):
    phone: str
    name: str | None = None
    text: str


async def _load(rid, phone):
    customer = clean(await db.customers.find_one({"restaurant_id": rid, "phone": phone}, NO_ID))
    if not customer: return {"conversation": None, "messages": []}
    conversation = clean(await db.conversations.find_one({"restaurant_id": rid, "customer_id": customer["id"]}, NO_ID, sort=[("created_at", -1)]))
    if not conversation: return {"conversation": None, "messages": []}
    return {"conversation": conversation, "messages": clean_list(await db.messages.find({"conversation_id": conversation["id"]}, NO_ID).sort("created_at", 1).to_list(500))}


@router.post("/message")
async def send_sim_message(body: SimMessage, rid: str = Depends(get_current_restaurant_id)):
    phone = body.phone.strip()
    await conversation_service.handle_incoming(IncomingMessage(restaurant_id=rid, provider="simulator", customer_phone=phone, message_id=f"sim-{phone}", text=body.text, timestamp="", customer_name=body.name))
    return await _load(rid, phone)


@router.get("/messages")
async def get_sim_messages(phone: str, rid: str = Depends(get_current_restaurant_id)):
    return await _load(rid, phone.strip())