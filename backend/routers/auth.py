import os
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from auth import create_access_token, get_current_user, hash_password, verify_password
from database import NO_ID, clean, db, new_id, now_iso

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    name: str
    restaurant_name: str


class LoginBody(BaseModel):
    email: str
    password: str


async def _default_restaurant(name):
    rid = new_id()
    await db.restaurants.insert_one({"id": rid, "name": name, "description": "", "address": "", "city": "", "currency": "PKR", "delivery_fee": 150, "min_order": 0, "prep_time_min": 20, "prep_time_max": 30, "delivery_time_min": 15, "delivery_time_max": 20, "ai_greeting": f"Welcome to {name}! How can I help?", "created_at": now_iso()})
    await db.whatsapp_connections.insert_one({"id": new_id(), "restaurant_id": rid, "provider": "simulator", "status": "connected", "connected_number": "Simulator", "logs": [], "created_at": now_iso()})
    await db.ai_settings.insert_one({"id": new_id(), "restaurant_id": rid, "provider": "gemini", "model": os.environ.get("AI_MODEL", "gemini-3-flash-preview"), "personality": "friendly restaurant receptionist", "upsell_enabled": True, "human_handoff_enabled": True, "created_at": now_iso()})
    return rid


@router.post("/register")
async def register(body: RegisterBody):
    raise HTTPException(status_code=403, detail="Self-service registration is disabled. Contact the Super Admin.")
    # Kept below for future controlled self-service onboarding.
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    rid, uid = await _default_restaurant(body.restaurant_name), new_id()
    await db.users.insert_one({"id": uid, "email": email, "password_hash": hash_password(body.password), "name": body.name, "role": "owner", "restaurant_id": rid, "created_at": now_iso()})
    return {"access_token": create_access_token(uid, email), "token_type": "bearer", "user": {"id": uid, "email": email, "name": body.name, "restaurant_id": rid}}


@router.post("/login")
async def login(body: LoginBody):
    identifier = body.email.strip()
    email = identifier.lower()
    # Username matching is case-insensitive so credentials typed with any casing work.
    user = await db.users.find_one({"$or": [{"email": email}, {"username": {"$regex": f"^{re.escape(identifier)}$", "$options": "i"}}]})
    if not user or not (verify_password(body.password, user["password_hash"]) or verify_password(body.password.strip(), user["password_hash"])):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token": create_access_token(user["id"], user["email"]), "token_type": "bearer", "user": {"id": user["id"], "email": user["email"], "name": user.get("name"), "role": user.get("role"), "restaurant_id": user.get("restaurant_id")}}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    restaurant = clean(await db.restaurants.find_one({"id": user.get("restaurant_id")}, NO_ID)) if user.get("restaurant_id") else None
    subscription = None
    if user.get("restaurant_id"):
        from services.subscription_service import ensure_subscription
        subscription = await ensure_subscription(user["restaurant_id"])
    return {"user": user, "restaurant": restaurant, "subscription": subscription}