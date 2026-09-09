from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_restaurant_id
from database import NO_ID, clean, db

router = APIRouter(prefix="/restaurant", tags=["restaurant"])


class RestaurantUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    whatsapp_number: str | None = None
    contact_number: str | None = None
    address: str | None = None
    city: str | None = None
    opening_hours: str | None = None
    delivery_areas: str | None = None
    delivery_fee: float | None = None
    min_order: float | None = None
    prep_time_min: int | None = None
    prep_time_max: int | None = None
    delivery_time_min: int | None = None
    delivery_time_max: int | None = None
    currency: str | None = None
    ai_greeting: str | None = None
    reservations_enabled: bool | None = None


class AISettingsUpdate(BaseModel):
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
    personality: str | None = None
    language_behavior: str | None = None
    upsell_enabled: bool | None = None
    max_upsell_attempts: int | None = None
    human_handoff_enabled: bool | None = None


def _mask_key(value: str) -> str:
    if not value:
        return ""
    return value[:6] + "••••" + value[-4:] if len(value) > 12 else "••••"


def _public_ai_settings(doc: dict | None) -> dict:
    doc = dict(doc or {})
    key = doc.pop("api_key", "") or ""
    doc["api_key_masked"] = _mask_key(key)
    doc["has_api_key"] = bool(key)
    return doc


@router.get("")
async def get_restaurant(rid: str = Depends(get_current_restaurant_id)):
    return clean(await db.restaurants.find_one({"id": rid}, NO_ID))


@router.put("")
async def update_restaurant(body: RestaurantUpdate, rid: str = Depends(get_current_restaurant_id)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.restaurants.update_one({"id": rid}, {"$set": updates})
    return clean(await db.restaurants.find_one({"id": rid}, NO_ID))


@router.get("/ai-settings")
async def get_ai_settings(rid: str = Depends(get_current_restaurant_id)):
    return _public_ai_settings(clean(await db.ai_settings.find_one({"restaurant_id": rid}, NO_ID)))


@router.put("/ai-settings")
async def update_ai_settings(body: AISettingsUpdate, rid: str = Depends(get_current_restaurant_id)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "api_key" in updates:
        updates["api_key"] = updates["api_key"].strip()
    if updates:
        await db.ai_settings.update_one({"restaurant_id": rid}, {"$set": updates})
    return _public_ai_settings(clean(await db.ai_settings.find_one({"restaurant_id": rid}, NO_ID)))


@router.post("/ai-settings/test")
async def test_ai_settings(rid: str = Depends(get_current_restaurant_id)):
    from services.ai_service import test_connection
    settings = clean(await db.ai_settings.find_one({"restaurant_id": rid}, NO_ID)) or {}
    return await test_connection(settings)