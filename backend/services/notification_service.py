import logging

from database import NO_ID, db, new_id, now_iso
from events import bus
from whatsapp.service import whatsapp_service

logger = logging.getLogger(__name__)
STATUS_MESSAGES = {
    "Confirmed": "Good news! Your order #{n} has been confirmed. We're getting it ready. 🎉",
    "Preparing": "Your order #{n} is now being prepared in our kitchen. 👨‍🍳",
    "Ready": "Your order #{n} is ready!",
    "Out for Delivery": "Your order #{n} is out for delivery. It'll reach you soon! 🛵",
    "Delivered": "Your order #{n} has been delivered. Thank you for ordering — enjoy your meal! 🙏",
    "Cancelled": "Your order #{n} has been cancelled. Please contact us if you have any questions.",
}


async def notify_status_change(order: dict, new_status: str):
    template = STATUS_MESSAGES.get(new_status)
    if not template:
        return
    text = template.format(n=order["order_number"])
    conversation = await db.conversations.find_one({"id": order.get("conversation_id")}, NO_ID)
    if not conversation:
        conversation = await db.conversations.find_one({"restaurant_id": order["restaurant_id"], "customer_id": order["customer_id"]}, NO_ID,
                                                        sort=[("created_at", -1)])
    if conversation:
        message = {"id": new_id(), "restaurant_id": order["restaurant_id"], "conversation_id": conversation["id"],
                   "customer_id": order["customer_id"], "direction": "out", "sender": "system", "text": text,
                   "msg_type": "status_update", "provider": conversation.get("provider", "simulator"), "created_at": now_iso()}
        await db.messages.insert_one({**message})
        await bus.publish(order["restaurant_id"], "message", {"conversation_id": conversation["id"], "message": message})
    try:
        await whatsapp_service.send_order_notification(order["restaurant_id"], order["customer_phone"], text)
    except Exception as exc:
        logger.warning("status notify send failed: %s", exc)