from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from auth import get_current_restaurant_id
from database import NO_ID, db

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def summary(rid: str = Depends(get_current_restaurant_id)):
    orders = await db.orders.find({"restaurant_id": rid}, NO_ID).to_list(2000)
    now, today = datetime.now(timezone.utc), datetime.now(timezone.utc).date()
    totals = {"today_orders": 0, "today_sales": 0.0, "week_sales": 0.0, "month_sales": 0.0, "pending_orders": 0, "completed_orders": 0, "total_sales": 0.0, "counted": 0}
    counts, revenue = defaultdict(int), defaultdict(float)
    for order in orders:
        try:
            created = datetime.fromisoformat(order.get("created_at", ""))
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
        except Exception:
            created = now
        valid = order.get("status") != "Cancelled"
        if valid:
            totals["total_sales"] += order.get("total", 0); totals["counted"] += 1
            if created.date() == today: totals["today_orders"] += 1; totals["today_sales"] += order.get("total", 0)
            if created >= now - timedelta(days=7): totals["week_sales"] += order.get("total", 0)
            if created >= now - timedelta(days=30): totals["month_sales"] += order.get("total", 0)
        if order.get("status") in ("New", "Confirmed", "Preparing", "Ready", "Out for Delivery"): totals["pending_orders"] += 1
        if order.get("status") == "Delivered": totals["completed_orders"] += 1
        for item in order.get("items", []): counts[item["name"]] += item.get("qty", 0); revenue[item["name"]] += item.get("line_total", 0)
    top = sorted(counts.items(), key=lambda pair: pair[1], reverse=True)[:5]
    return {"today_orders": totals["today_orders"], "today_sales": round(totals["today_sales"], 0), "week_sales": round(totals["week_sales"], 0), "month_sales": round(totals["month_sales"], 0), "pending_orders": totals["pending_orders"], "completed_orders": totals["completed_orders"], "average_order_value": round(totals["total_sales"] / totals["counted"], 0) if totals["counted"] else 0, "total_orders": len(orders), "top_items": [{"name": n, "qty": q, "revenue": round(revenue[n], 0)} for n, q in top]}