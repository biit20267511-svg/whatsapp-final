from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_restaurant_id
from database import NO_ID, clean, clean_list, db, now_iso
from events import bus
from services.reservation_service import RESERVATION_STATUSES

router = APIRouter(prefix="/reservations", tags=["reservations"])


class StatusBody(BaseModel):
    status: str


@router.get("")
async def list_reservations(rid: str = Depends(get_current_restaurant_id), status: str | None = None, date: str | None = None):
    query: dict = {"restaurant_id": rid}
    if status:
        query["status"] = status
    if date:
        query["date"] = date
    return clean_list(await db.reservations.find(query, NO_ID).sort([("date", 1), ("time", 1)]).to_list(500))


@router.patch("/{reservation_id}/status")
async def update_status(reservation_id: str, body: StatusBody, rid: str = Depends(get_current_restaurant_id)):
    if body.status not in RESERVATION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    reservation = clean(await db.reservations.find_one({"id": reservation_id, "restaurant_id": rid}, NO_ID))
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    history = reservation.get("status_history", []) + [{"status": body.status, "at": now_iso()}]
    await db.reservations.update_one({"id": reservation_id, "restaurant_id": rid}, {"$set": {"status": body.status, "updated_at": now_iso(), "status_history": history}})
    reservation.update({"status": body.status, "status_history": history})
    await bus.publish(rid, "reservation_update", {"reservation": reservation})
    return reservation
