from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_restaurant_id
from database import NO_ID, clean, clean_list, db

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("")
async def list_customers(rid: str = Depends(get_current_restaurant_id)):
    return clean_list(await db.customers.find({"restaurant_id": rid}, NO_ID).sort("last_order_at", -1).to_list(500))


@router.get("/{customer_id}")
async def get_customer(customer_id: str, rid: str = Depends(get_current_restaurant_id)):
    customer = clean(await db.customers.find_one({"id": customer_id, "restaurant_id": rid}, NO_ID))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    orders = clean_list(await db.orders.find({"restaurant_id": rid, "customer_id": customer_id}, NO_ID).sort("created_at", -1).to_list(200))
    conversation = clean(await db.conversations.find_one({"restaurant_id": rid, "customer_id": customer_id}, NO_ID, sort=[("created_at", -1)]))
    messages = clean_list(await db.messages.find({"conversation_id": conversation["id"]}, NO_ID).sort("created_at", -1).to_list(20)) if conversation else []
    return {"customer": customer, "orders": orders, "conversation": conversation, "messages": list(reversed(messages))}