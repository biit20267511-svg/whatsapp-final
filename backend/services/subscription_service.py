from datetime import date, timedelta
from database import NO_ID, db, new_id, now_iso

DEFAULT_MONTHLY = 5000.0
DEFAULT_SETUP = 5000.0

def today() -> date:
    return date.today()

def parse_day(value: str | None) -> date:
    try: return date.fromisoformat(value or "")
    except ValueError: return today()

def status_for(subscription: dict) -> str:
    if subscription.get("status") == "SUSPENDED": return "SUSPENDED"
    remaining = (parse_day(subscription.get("end_date")) - today()).days
    if remaining < 0: return "EXPIRED"
    if remaining <= 7: return "EXPIRING_SOON"
    return "ACTIVE" if subscription.get("status") != "TRIAL" else "TRIAL"

async def ensure_subscription(restaurant_id: str, days: int = 30) -> dict:
    item = await db.subscriptions.find_one({"restaurant_id": restaurant_id}, NO_ID)
    if not item:
        start = today(); end = start + timedelta(days=days)
        item = {"id": new_id(), "restaurant_id": restaurant_id, "plan": "AI Restaurant Assistant", "status": "ACTIVE", "payment_status": "PAID", "start_date": start.isoformat(), "end_date": end.isoformat(), "next_payment_date": end.isoformat(), "monthly_price": DEFAULT_MONTHLY, "setup_fee": DEFAULT_SETUP, "last_payment_date": start.isoformat(), "created_at": now_iso(), "updated_at": now_iso()}
        await db.subscriptions.insert_one({**item})
    current = status_for(item)
    if current != item.get("status") and item.get("status") != "TRIAL":
        await db.subscriptions.update_one({"id": item["id"]}, {"$set": {"status": current, "updated_at": now_iso()}}); item["status"] = current
    item["days_remaining"] = (parse_day(item.get("end_date")) - today()).days
    return item

async def audit(user_id: str, action: str, target_id: str, metadata: dict | None = None):
    await db.audit_logs.insert_one({"id": new_id(), "user_id": user_id, "action": action, "target_id": target_id, "metadata": metadata or {}, "timestamp": now_iso()})