import os
import re
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

from database import NO_ID, db, now_iso

JWT_ALGORITHM = "HS256"
ACCESS_TTL_DAYS = 7
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
PASSWORD_RULES = "Password must be at least 8 characters and include letters and numbers"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def validate_password(password: str) -> str:
    password = (password or "").strip()
    if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail=PASSWORD_RULES)
    return password


def validate_username(username: str) -> str:
    username = (username or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_.]{3,32}", username):
        raise HTTPException(status_code=400, detail="Username must be 3-32 characters: letters, numbers, dot or underscore only")
    return username


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "type": "access", "tv": int(token_version or 0),
               "exp": datetime.now(timezone.utc) + timedelta(days=ACCESS_TTL_DAYS)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def public_user(user: dict) -> dict:
    return {"id": user["id"], "email": user["email"], "username": user.get("username"), "name": user.get("name"),
            "role": user.get("role"), "restaurant_id": user.get("restaurant_id"),
            "must_change_password": bool(user.get("must_change_password", False))}


async def rotate_credentials(user_id: str, changes: dict) -> int:
    """Apply credential changes and invalidate every existing session for that user."""
    stored = await db.users.find_one({"id": user_id}, {"token_version": 1})
    version = int((stored or {}).get("token_version", 0)) + 1
    await db.users.update_one({"id": user_id}, {"$set": {**changes, "token_version": version, "credentials_updated_at": now_iso()}})
    return version


async def check_lockout(identifier: str):
    attempt = await db.login_attempts.find_one({"identifier": identifier}, NO_ID)
    locked_until = (attempt or {}).get("locked_until")
    if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
        remaining = int((datetime.fromisoformat(locked_until) - datetime.now(timezone.utc)).total_seconds() // 60) + 1
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Account locked for {remaining} more minute(s).")


async def record_failed_login(identifier: str) -> int:
    attempt = await db.login_attempts.find_one({"identifier": identifier}, NO_ID) or {"count": 0}
    count = int(attempt.get("count", 0)) + 1
    updates = {"count": count, "last_failed_at": now_iso()}
    if count >= MAX_FAILED_ATTEMPTS:
        updates.update({"count": 0, "locked_until": (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()})
    await db.login_attempts.update_one({"identifier": identifier}, {"$set": updates}, upsert=True)
    return MAX_FAILED_ATTEMPTS - count if count < MAX_FAILED_ATTEMPTS else 0


async def clear_failed_logins(identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})


def _extract_token(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    return header[7:] if header.startswith("Bearer ") else request.cookies.get("access_token")


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"id": payload["sub"]}, NO_ID)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if int(payload.get("tv", 0)) != int(user.get("token_version", 0)):
        raise HTTPException(status_code=401, detail="Session expired because credentials were changed. Please sign in again.")
    user.pop("password_hash", None)
    return user


async def get_current_restaurant_id(user: dict = Depends(get_current_user)) -> str:
    rid = user.get("restaurant_id")
    if not rid:
        raise HTTPException(status_code=403, detail="No restaurant associated with this account")
    from services.subscription_service import ensure_subscription
    subscription = await ensure_subscription(rid)
    if subscription.get("status") in {"EXPIRED", "SUSPENDED"}:
        raise HTTPException(status_code=402, detail={"code": "SUBSCRIPTION_BLOCKED", "status": subscription.get("status"), "message": "Your subscription has expired. Please complete your payment to continue using the platform."})
    return rid
