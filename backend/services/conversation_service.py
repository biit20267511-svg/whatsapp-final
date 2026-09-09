import logging
import re

from database import NO_ID, db, new_id, now_iso
from events import bus
from services import ai_service
from whatsapp.base import IncomingMessage
from whatsapp.service import whatsapp_service

logger = logging.getLogger(__name__)
_DOUBLE_BOLD = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)


def normalize_whatsapp_text(text: str) -> str:
    """Convert model Markdown bold to WhatsApp bold before storage or delivery."""
    return _DOUBLE_BOLD.sub(r"*\1*", text)


async def _get_or_create_customer(restaurant_id: str, phone: str, name: str | None) -> dict:
    customer = await db.customers.find_one({"restaurant_id": restaurant_id, "phone": phone}, NO_ID)
    if customer:
        return customer
    customer = {"id": new_id(), "restaurant_id": restaurant_id, "phone": phone, "name": name or "",
                "total_orders": 0, "total_spent": 0.0, "last_order_at": None, "created_at": now_iso()}
    await db.customers.insert_one({**customer})
    return customer


async def _get_or_create_conversation(restaurant_id: str, customer: dict, provider: str) -> dict:
    conversation = await db.conversations.find_one({"restaurant_id": restaurant_id, "customer_id": customer["id"]},
                                                    NO_ID, sort=[("created_at", -1)])
    if conversation:
        if conversation.get("provider") != provider:
            await db.conversations.update_one({"id": conversation["id"]}, {"$set": {"provider": provider}})
            conversation["provider"] = provider
        return conversation
    conversation = {"id": new_id(), "restaurant_id": restaurant_id, "customer_id": customer["id"],
                    "customer_phone": customer["phone"], "customer_name": customer.get("name") or "",
                    "provider": provider, "state": "GREETING", "cart": [], "order_type": None,
                    "address": None, "ai_active": True, "last_message_at": now_iso(), "created_at": now_iso()}
    await db.conversations.insert_one({**conversation})
    return conversation


async def _save_message(conversation, restaurant_id, direction, sender, text, provider, msg_type="text"):
    message = {"id": new_id(), "restaurant_id": restaurant_id, "conversation_id": conversation["id"],
               "customer_id": conversation["customer_id"], "direction": direction, "sender": sender,
               "text": text, "msg_type": msg_type, "provider": provider, "created_at": now_iso()}
    await db.messages.insert_one({**message})
    await db.conversations.update_one({"id": conversation["id"]}, {"$set": {"last_message_at": now_iso()}})
    await bus.publish(restaurant_id, "message", {"conversation_id": conversation["id"], "message": message})
    return message


async def handle_incoming(msg: IncomingMessage) -> dict | None:
    from services.subscription_service import ensure_subscription
    subscription = await ensure_subscription(msg.restaurant_id)
    if subscription.get("status") in {"EXPIRED", "SUSPENDED"}:
        logger.warning("AI blocked for restaurant=%s subscription=%s", msg.restaurant_id, subscription.get("status"))
        return None
    restaurant = await db.restaurants.find_one({"id": msg.restaurant_id}, NO_ID)
    if not restaurant:
        return None
    customer = await _get_or_create_customer(msg.restaurant_id, msg.customer_phone, msg.customer_name)
    conversation = await _get_or_create_conversation(msg.restaurant_id, customer, msg.provider)
    await _save_message(conversation, msg.restaurant_id, "in", "customer", msg.text, msg.provider)
    if not conversation.get("ai_active", True):
        await bus.publish(msg.restaurant_id, "handoff_pending", {"conversation_id": conversation["id"]})
        return None
    settings = await db.ai_settings.find_one({"restaurant_id": msg.restaurant_id}, NO_ID) or {}
    categories = await db.menu_categories.find({"restaurant_id": msg.restaurant_id}, NO_ID).sort("sort_order", 1).to_list(100)
    items = await db.menu_items.find({"restaurant_id": msg.restaurant_id}, NO_ID).to_list(500)
    recent = await db.messages.find({"conversation_id": conversation["id"]}, NO_ID).sort("created_at", -1).to_list(10)
    reply, created_order = await ai_service.generate_reply(
        restaurant=restaurant, ai_settings=settings, conversation=conversation, customer=customer,
        categories=categories, items=items, recent_messages=list(reversed(recent)), incoming_text=msg.text)
    reply = normalize_whatsapp_text(reply)
    reply_message = await _save_message(conversation, msg.restaurant_id, "out", "ai", reply, msg.provider)
    try:
        sent = await whatsapp_service.send_customer_message(msg.restaurant_id, msg.customer_phone, reply)
        if not sent:
            logger.warning("outbound reply was not accepted by provider=%s phone=%s", msg.provider, msg.customer_phone)
    except Exception as exc:
        logger.warning("send failed provider=%s phone=%s: %s", msg.provider, msg.customer_phone, exc)
    if created_order:
        await bus.publish(msg.restaurant_id, "new_order", {"order": created_order})
    return reply_message