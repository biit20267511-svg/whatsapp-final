from database import db, new_id, next_order_number, now_iso

ORDER_STATUSES = ["New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Delivered", "Cancelled"]


def match_menu_item(menu_items: list, name: str):
    if not name:
        return None
    normalized = name.strip().lower()
    for item in menu_items:
        if item["name"].strip().lower() == normalized:
            return item
    for item in menu_items:
        item_name = item["name"].strip().lower()
        if normalized in item_name or item_name in normalized:
            return item
    tokens = set(normalized.split())
    return next((item for item in menu_items if set(item["name"].lower().split()) & tokens), None)


def compute_totals(restaurant: dict, cart: list, order_type: str | None) -> dict:
    items, subtotal = [], 0.0
    for cart_item in cart:
        line_total = round(float(cart_item["unit_price"]) * int(cart_item["qty"]), 2)
        subtotal += line_total
        items.append({**cart_item, "qty": int(cart_item["qty"]), "line_total": line_total})
    delivery_fee = float(restaurant.get("delivery_fee", 0)) if order_type == "delivery" else 0.0
    return {"items": items, "subtotal": round(subtotal, 2), "delivery_fee": round(delivery_fee, 2),
            "total": round(subtotal + delivery_fee, 2), "currency": restaurant.get("currency", "PKR")}


def estimate_eta(restaurant: dict, order_type: str | None) -> dict:
    prep_min, prep_max = int(restaurant.get("prep_time_min", 20)), int(restaurant.get("prep_time_max", 30))
    if order_type == "delivery":
        return {"eta_min": prep_min + int(restaurant.get("delivery_time_min", 15)),
                "eta_max": prep_max + int(restaurant.get("delivery_time_max", 20))}
    return {"eta_min": prep_min, "eta_max": prep_max}


async def create_order(*, restaurant: dict, conversation: dict, customer: dict) -> dict:
    order_type = conversation.get("order_type") or "delivery"
    totals = compute_totals(restaurant, conversation.get("cart", []), order_type)
    eta = estimate_eta(restaurant, order_type)
    created = now_iso()
    order = {"id": new_id(), "restaurant_id": restaurant["id"], "customer_id": customer["id"],
             "conversation_id": conversation["id"], "order_number": await next_order_number(restaurant["id"]),
             "customer_name": conversation.get("customer_name") or customer.get("name") or "Customer",
             "customer_phone": conversation.get("customer_phone") or customer.get("phone"),
             "order_type": order_type, "address": conversation.get("address") if order_type == "delivery" else None,
             "contact_number": conversation.get("contact_number") or conversation.get("customer_phone") or customer.get("phone"),
             **totals, "status": "New", **eta,
             "status_history": [{"status": "New", "at": created}], "created_at": created, "updated_at": created}
    await db.orders.insert_one({**order})
    await db.customers.update_one({"id": customer["id"]}, {"$inc": {"total_orders": 1, "total_spent": totals["total"]},
                                                          "$set": {"last_order_at": created, "name": order["customer_name"]}})
    return order