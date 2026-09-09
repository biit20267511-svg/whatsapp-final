from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_restaurant_id
from database import NO_ID, clean, clean_list, db, now_iso
from events import bus
from services import notification_service
from services.order_service import ORDER_STATUSES

router = APIRouter(prefix="/orders", tags=["orders"])


class StatusBody(BaseModel):
    status: str


@router.get("")
async def list_orders(rid: str = Depends(get_current_restaurant_id), status: str | None = None):
    query = {"restaurant_id": rid}
    if status:
        query["status"] = status
    return clean_list(await db.orders.find(query, NO_ID).sort("created_at", -1).to_list(500))


@router.get("/{order_id}")
async def get_order(order_id: str, rid: str = Depends(get_current_restaurant_id)):
    order = clean(await db.orders.find_one({"id": order_id, "restaurant_id": rid}, NO_ID))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/{order_id}/status")
async def update_status(order_id: str, body: StatusBody, rid: str = Depends(get_current_restaurant_id)):
    if body.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    order = clean(await db.orders.find_one({"id": order_id, "restaurant_id": rid}, NO_ID))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    history = order.get("status_history", []) + [{"status": body.status, "at": now_iso()}]
    await db.orders.update_one({"id": order_id, "restaurant_id": rid}, {"$set": {"status": body.status, "updated_at": now_iso(), "status_history": history}})
    order.update({"status": body.status, "status_history": history})
    await bus.publish(rid, "order_update", {"order": order})
    await notification_service.notify_status_change(order, body.status)
    return order