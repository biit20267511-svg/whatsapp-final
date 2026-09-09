from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_restaurant_id
from database import NO_ID, clean, clean_list, db, new_id, now_iso

router = APIRouter(prefix="/menu", tags=["menu"])


class CategoryBody(BaseModel):
    name: str
    sort_order: int = 99


class ItemBody(BaseModel):
    category_id: str
    name: str
    description: str = ""
    price: float
    available: bool = True
    image_url: str = ""
    addon_item_ids: list[str] = []
    tags: list[str] = []
    original_price: float | None = None


class ItemUpdate(BaseModel):
    category_id: str | None = None
    name: str | None = None
    description: str | None = None
    price: float | None = None
    available: bool | None = None
    image_url: str | None = None
    addon_item_ids: list[str] | None = None
    tags: list[str] | None = None
    original_price: float | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None


class BulkAvailability(BaseModel):
    category_id: str
    available: bool


class BulkPrice(BaseModel):
    category_id: str
    percent: float


@router.get("")
async def get_menu(rid: str = Depends(get_current_restaurant_id)):
    categories = clean_list(await db.menu_categories.find({"restaurant_id": rid}, NO_ID).sort("sort_order", 1).to_list(200))
    items = clean_list(await db.menu_items.find({"restaurant_id": rid}, NO_ID).to_list(1000))
    return {"categories": categories, "items": items}


@router.post("/categories")
async def create_category(body: CategoryBody, rid: str = Depends(get_current_restaurant_id)):
    doc = {"id": new_id(), "restaurant_id": rid, **body.model_dump(), "created_at": now_iso()}
    await db.menu_categories.insert_one(doc)
    return clean(doc)


@router.put("/categories/{category_id}")
async def update_category(category_id: str, body: CategoryUpdate, rid: str = Depends(get_current_restaurant_id)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.menu_categories.update_one({"id": category_id, "restaurant_id": rid}, {"$set": updates})
    return clean(await db.menu_categories.find_one({"id": category_id, "restaurant_id": rid}, NO_ID))


@router.post("/bulk-availability")
async def bulk_availability(body: BulkAvailability, rid: str = Depends(get_current_restaurant_id)):
    result = await db.menu_items.update_many({"category_id": body.category_id, "restaurant_id": rid}, {"$set": {"available": body.available}})
    return {"ok": True, "updated": result.modified_count}


@router.post("/bulk-price")
async def bulk_price(body: BulkPrice, rid: str = Depends(get_current_restaurant_id)):
    if not -90 <= body.percent <= 500:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Percent must be between -90 and 500")
    items = await db.menu_items.find({"category_id": body.category_id, "restaurant_id": rid}).to_list(1000)
    for item in items:
        new_price = round(float(item.get("price", 0)) * (1 + body.percent / 100))
        await db.menu_items.update_one({"_id": item["_id"]}, {"$set": {"price": float(new_price)}})
    return {"ok": True, "updated": len(items)}


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, rid: str = Depends(get_current_restaurant_id)):
    await db.menu_categories.delete_one({"id": category_id, "restaurant_id": rid})
    await db.menu_items.delete_many({"category_id": category_id, "restaurant_id": rid})
    return {"ok": True}


@router.post("/items")
async def create_item(body: ItemBody, rid: str = Depends(get_current_restaurant_id)):
    doc = {"id": new_id(), "restaurant_id": rid, **body.model_dump(), "created_at": now_iso()}
    await db.menu_items.insert_one(doc)
    return clean(doc)


@router.put("/items/{item_id}")
async def update_item(item_id: str, body: ItemUpdate, rid: str = Depends(get_current_restaurant_id)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.menu_items.update_one({"id": item_id, "restaurant_id": rid}, {"$set": updates})
    return clean(await db.menu_items.find_one({"id": item_id, "restaurant_id": rid}, NO_ID))


@router.delete("/items/{item_id}")
async def delete_item(item_id: str, rid: str = Depends(get_current_restaurant_id)):
    await db.menu_items.delete_one({"id": item_id, "restaurant_id": rid})
    return {"ok": True}