from database import db, new_id, now_iso
from events import bus

RESERVATION_STATUSES = ["Pending", "Confirmed", "Seated", "Completed", "Cancelled", "No-show"]


async def next_reservation_number(restaurant_id: str) -> int:
    key = f"reservations:{restaurant_id}"
    doc = await db.counters.find_one_and_update(
        {"id": key},
        {"$inc": {"seq": 1}, "$setOnInsert": {"id": key}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"]
    if seq < 101:
        await db.counters.update_one({"id": key}, {"$set": {"seq": 101}})
        return 101
    return seq


async def create_reservation(*, restaurant: dict, conversation: dict, customer: dict, name: str, party_size: int, date: str, time: str, notes: str = "") -> dict:
    created = now_iso()
    doc = {"id": new_id(), "restaurant_id": restaurant["id"], "customer_id": customer["id"],
           "conversation_id": conversation["id"], "reservation_number": await next_reservation_number(restaurant["id"]),
           "customer_name": name, "customer_phone": conversation.get("customer_phone") or customer.get("phone"),
           "contact_number": conversation.get("contact_number") or conversation.get("customer_phone") or customer.get("phone"),
           "party_size": int(party_size), "date": date, "time": time, "notes": notes,
           "status": "Pending", "status_history": [{"status": "Pending", "at": created}],
           "created_at": created, "updated_at": created}
    await db.reservations.insert_one({**doc})
    await bus.publish(restaurant["id"], "new_reservation", {"reservation": doc})
    return doc
