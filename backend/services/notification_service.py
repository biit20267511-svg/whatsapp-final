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
    "Picked Up": "Thank you for collecting order #{n}, {name}! Enjoy your meal — hope to see you again soon. 🙏",
    "Cancelled": "Your order #{n} has been cancelled. Please contact us if you have any questions.",
}
PICKUP_READY = "🛍️ *Order #{n} is ready for pickup!*\n{name}, you can now collect your order from *{restaurant}*{address}.\nPlease mention order number *#{n}* at the counter. Total: {currency} {total:,.0f}. See you soon! 😊"


async def _status_text(order: dict, new_status: str) -> str | None:
    if new_status == "Ready" and order.get("order_type") == "pickup":
        restaurant = await db.restaurants.find_one({"id": order["restaurant_id"]}, NO_ID) or {}
        address = ", ".join(p for p in [restaurant.get("address"), restaurant.get("city")] if p)
        return PICKUP_READY.format(n=order["order_number"], name=order.get("customer_name") or "Dear customer", restaurant=restaurant.get("name", "our restaurant"),
                                   address=f" ({address})" if address else "", currency=order.get("currency", "PKR"), total=float(order.get("total", 0)))
    template = STATUS_MESSAGES.get(new_status)
    return template.format(n=order["order_number"], name=order.get("customer_name") or "") if template else None


async def notify_status_change(order: dict, new_status: str):
    text = await _status_text(order, new_status)
    if not text:
        return
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