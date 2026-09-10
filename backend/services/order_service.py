import re

from database import db, new_id, next_order_number, now_iso

ORDER_STATUSES = ["New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Delivered", "Picked Up", "Cancelled"]
DELIVERY_FLOW = ["New", "Confirmed", "Preparing", "Ready", "Out for Delivery", "Delivered"]
PICKUP_FLOW = ["New", "Confirmed", "Preparing", "Ready", "Picked Up"]


def allowed_statuses(order_type: str | None) -> list[str]:
    return [*(PICKUP_FLOW if order_type == "pickup" else DELIVERY_FLOW), "Cancelled"]


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


def match_variant(item: dict, variant_name: str | None):
    variants = item.get("variants") or []
    if not variants:
        return None, None
    wanted = (variant_name or "").strip().lower()
    for variant in variants:
        if wanted and (variant["name"].lower() == wanted or wanted in variant["name"].lower() or variant["name"].lower() in wanted):
            return variant, None
    return None, [v["name"] for v in variants]


def match_addons(item: dict, addon_names: list[str] | None):
    chosen, unknown = [], []
    for wanted in addon_names or []:
        w = wanted.strip().lower()
        found = next((a for a in item.get("addons") or [] if a["name"].lower() == w or w in a["name"].lower() or a["name"].lower() in w), None)
        (chosen if found else unknown).append(found or wanted)
    return chosen, unknown


def active_zones(restaurant: dict) -> list[dict]:
    return [z for z in restaurant.get("delivery_zones") or [] if z.get("active", True)]


def zones_enabled(restaurant: dict) -> bool:
    return restaurant.get("delivery_mode") == "zones" and bool(active_zones(restaurant))


def find_zone(restaurant: dict, text: str | None) -> dict | None:
    """Match an area/address string against configured zones (name + aliases, case-insensitive)."""
    haystack = re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower())
    if not haystack.strip():
        return None
    best = None
    for zone in active_zones(restaurant):
        for label in [zone["name"], *zone.get("aliases", [])]:
            needle = re.sub(r"[^a-z0-9 ]+", " ", label.lower()).strip()
            if needle and re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack):
                if not best or len(needle) > len(best[0]):
                    best = (needle, zone)
    return best[1] if best else None


def delivery_fee_for(restaurant: dict, zone: dict | None) -> float:
    if zones_enabled(restaurant) and zone:
        return float(zone.get("fee", 0))
    return float(restaurant.get("delivery_fee", 0))


def min_order_for(restaurant: dict, zone: dict | None) -> float:
    if zones_enabled(restaurant) and zone and zone.get("min_order") is not None:
        return float(zone["min_order"])
    return float(restaurant.get("min_order", 0) or 0)


def compute_totals(restaurant: dict, cart: list, order_type: str | None, zone: dict | None = None) -> dict:
    items, subtotal = [], 0.0
    for cart_item in cart:
        line_total = round(float(cart_item["unit_price"]) * int(cart_item["qty"]), 2)
        subtotal += line_total
        items.append({**cart_item, "qty": int(cart_item["qty"]), "line_total": line_total})
    delivery_fee = delivery_fee_for(restaurant, zone) if order_type == "delivery" else 0.0
    return {"items": items, "subtotal": round(subtotal, 2), "delivery_fee": round(delivery_fee, 2),
            "delivery_zone": zone["name"] if (zone and order_type == "delivery") else None,
            "total": round(subtotal + delivery_fee, 2), "currency": restaurant.get("currency", "PKR")}


def estimate_eta(restaurant: dict, order_type: str | None, zone: dict | None = None) -> dict:
    prep_min, prep_max = int(restaurant.get("prep_time_min", 20)), int(restaurant.get("prep_time_max", 30))
    if order_type == "delivery":
        ride_min = int(zone["eta_min"]) if zone and zone.get("eta_min") else int(restaurant.get("delivery_time_min", 15))
        ride_max = ride_min + 10 if zone and zone.get("eta_min") else int(restaurant.get("delivery_time_max", 20))
        return {"eta_min": prep_min + ride_min, "eta_max": prep_max + ride_max}
    return {"eta_min": prep_min, "eta_max": prep_max}


def conversation_zone(restaurant: dict, conversation: dict) -> dict | None:
    zone_id = conversation.get("delivery_zone_id")
    return next((z for z in active_zones(restaurant) if z["id"] == zone_id), None) if zone_id else None


async def create_order(*, restaurant: dict, conversation: dict, customer: dict) -> dict:
    order_type = conversation.get("order_type") or "delivery"
    zone = conversation_zone(restaurant, conversation) if order_type == "delivery" else None
    totals = compute_totals(restaurant, conversation.get("cart", []), order_type, zone)
    eta = estimate_eta(restaurant, order_type, zone)
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
