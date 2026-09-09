import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

from database import NO_ID, db

JWT_ALGORITHM = "HS256"
ACCESS_TTL_DAYS = 7


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=ACCESS_TTL_DAYS),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


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