import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import (check_lockout, clear_failed_logins, create_access_token, get_current_user, hash_password,
                  public_user, record_failed_login, rotate_credentials, validate_password, verify_password)
from database import NO_ID, clean, db, now_iso

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str
    password: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.post("/register")
async def register():
    raise HTTPException(status_code=403, detail="Self-service registration is disabled. Contact the Super Admin.")


@router.post("/login")
async def login(body: LoginBody):
    identifier = body.email.strip().lower()
    if not identifier or not body.password:
        raise HTTPException(status_code=400, detail="Email/username and password are required")
    await check_lockout(identifier)
    user = await db.users.find_one({"$or": [{"email": identifier}, {"username": {"$regex": f"^{re.escape(identifier)}$", "$options": "i"}}]})
    if not user or not verify_password(body.password.strip(), user["password_hash"]):
        remaining = await record_failed_login(identifier)
        detail = "Invalid email or password" + (f" — {remaining} attempt(s) left before a 15 minute lock" if remaining <= 2 else "")
        raise HTTPException(status_code=401, detail=detail)
    await clear_failed_logins(identifier)
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now_iso()}})
    return {"access_token": create_access_token(user["id"], user["email"], user.get("token_version", 0)), "token_type": "bearer", "user": public_user(user)}


@router.post("/change-password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    stored = await db.users.find_one({"id": user["id"]})
    if not verify_password(body.current_password, stored["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_password = validate_password(body.new_password)
    if verify_password(new_password, stored["password_hash"]):
        raise HTTPException(status_code=400, detail="New password must be different from the current one")
    version = await rotate_credentials(user["id"], {"password_hash": hash_password(new_password), "must_change_password": False})
    return {"ok": True, "access_token": create_access_token(user["id"], user["email"], version)}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    restaurant = clean(await db.restaurants.find_one({"id": user.get("restaurant_id")}, NO_ID)) if user.get("restaurant_id") else None
    subscription = None
    if user.get("restaurant_id"):
        from services.subscription_service import ensure_subscription
        subscription = await ensure_subscription(user["restaurant_id"])
    return {"user": public_user(user), "restaurant": restaurant, "subscription": subscription}
