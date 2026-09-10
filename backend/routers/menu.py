import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_restaurant_id
from database import NO_ID, clean, clean_list, db, new_id, now_iso

router = APIRouter(prefix="/menu", tags=["menu"])


class CategoryBody(BaseModel):
    name: str
    sort_order: int = 99


class ItemOption(BaseModel):
    name: str
    price: float = Field(default=0, ge=0)


class ItemBody(BaseModel):
    category_id: str
    name: str
    description: str = ""
    price: float = Field(ge=0)
    available: bool = True
    image_url: str = ""
    addon_item_ids: list[str] = []
    tags: list[str] = []
    original_price: float | None = None
    variants: list[ItemOption] = []
    addons: list[ItemOption] = []


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
    variants: list[ItemOption] | None = None
    addons: list[ItemOption] | None = None


class CategoriesBulk(BaseModel):
    names: list[str]


class ItemsBulk(BaseModel):
    category_id: str
    lines: list[str]


PRICE_RE = re.compile(r"(\d[\d,]*)\s*$")


def parse_quick_line(line: str) -> dict | None:
    """'Chicken Karahi 1200' | 'Chicken Karahi | Half 700 / Full 1300' | 'Zinger Burger - 650 - crispy fillet'."""
    parts = [p.strip() for p in re.split(r"\s*[|]\s*", line.strip()) if p.strip()]
    if not parts:
        return None
    if len(parts) >= 2 and "/" in parts[1]:
        variants = []
        for chunk in parts[1].split("/"):
            m = PRICE_RE.search(chunk.strip())
            if m:
                variants.append({"name": chunk.strip()[: m.start()].strip(" -:") or f"Option {len(variants) + 1}", "price": float(m.group(1).replace(",", ""))})
        if variants:
            return {"name": parts[0].strip(" -:"), "price": min(v["price"] for v in variants), "variants": variants, "description": parts[2] if len(parts) > 2 else ""}
    head = parts[0] if len(parts) == 1 else f"{parts[0]} {parts[1]}"
    segments = [s.strip() for s in re.split(r"\s+-\s+|\s*:\s*", head) if s.strip()]
    for idx, seg in enumerate(segments):
        m = PRICE_RE.search(seg)
        if m and (idx > 0 or seg[: m.start()].strip()):
            name = " ".join([*segments[:idx], seg[: m.start()].strip(" -:")]).strip()
            desc = " ".join([*segments[idx + 1:], *(parts[2:] if len(parts) > 2 else [])]).strip()
            if name:
                return {"name": name, "price": float(m.group(1).replace(",", "")), "variants": [], "description": desc}
    return None


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


@router.post("/categories/bulk")
async def create_categories_bulk(body: CategoriesBulk, rid: str = Depends(get_current_restaurant_id)):
    existing = {c["name"].lower() for c in await db.menu_categories.find({"restaurant_id": rid}, {"name": 1}).to_list(500)}
    order = await db.menu_categories.count_documents({"restaurant_id": rid})
    created = []
    for name in body.names:
        name = name.strip()
        if not name or name.lower() in existing:
            continue
        order += 1
        doc = {"id": new_id(), "restaurant_id": rid, "name": name, "sort_order": order, "created_at": now_iso()}
        await db.menu_categories.insert_one(doc)
        created.append(clean(doc)); existing.add(name.lower())
    return {"created": created, "skipped": len(body.names) - len(created)}


@router.post("/items/bulk")
async def create_items_bulk(body: ItemsBulk, rid: str = Depends(get_current_restaurant_id)):
    if not await db.menu_categories.find_one({"id": body.category_id, "restaurant_id": rid}):
        raise HTTPException(status_code=404, detail="Category not found")
    created, failed = [], []
    for line in body.lines:
        parsed = parse_quick_line(line)
        if not parsed:
            if line.strip():
                failed.append(line.strip())
            continue
        doc = {"id": new_id(), "restaurant_id": rid, "category_id": body.category_id, **parsed, "available": True, "image_url": "", "addon_item_ids": [], "tags": [], "addons": [], "original_price": None, "created_at": now_iso()}
        await db.menu_items.insert_one(doc)
        created.append(clean(doc))
    return {"created": created, "failed": failed}


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
        from fastapi import HTTPException as _HE
        raise _HE(status_code=400, detail="Percent must be between -90 and 500")
    items = await db.menu_items.find({"category_id": body.category_id, "restaurant_id": rid}).to_list(1000)
    for item in items:
        factor = 1 + body.percent / 100
        updates = {"price": float(round(float(item.get("price", 0)) * factor))}
        if item.get("variants"):
            updates["variants"] = [{**v, "price": float(round(float(v["price"]) * factor))} for v in item["variants"]]
        await db.menu_items.update_one({"_id": item["_id"]}, {"$set": updates})
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