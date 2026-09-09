import os
import uuid

import anyio
import requests as http
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from auth import get_current_restaurant_id
from database import db, new_id, now_iso

router = APIRouter(prefix="/uploads", tags=["uploads"])

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "waautoma"
ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
MAX_BYTES = 5 * 1024 * 1024

_storage_key = None


def init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = http.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = http.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = http.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str) -> bytes:
    key = init_storage()
    resp = http.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = http.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content


@router.post("/image")
async def upload_image(file: UploadFile = File(...), rid: str = Depends(get_current_restaurant_id)):
    ext = ALLOWED.get((file.content_type or "").lower())
    if not ext:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP or GIF images are allowed")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")
    path = f"{APP_NAME}/menu/{rid}/{uuid.uuid4()}.{ext}"
    try:
        result = await anyio.to_thread.run_sync(lambda: _put_object(path, data, file.content_type))
    except Exception:
        raise HTTPException(status_code=502, detail="Image upload failed — please try again")
    await db.files.insert_one({"id": new_id(), "restaurant_id": rid, "storage_path": result["path"], "original_filename": file.filename, "content_type": file.content_type, "size": result.get("size", len(data)), "is_deleted": False, "created_at": now_iso()})
    return {"url": f"/api/uploads/files/{result['path']}", "path": result["path"]}


@router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data = await anyio.to_thread.run_sync(lambda: _get_object(path))
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch file")
    return Response(content=data, media_type=record.get("content_type") or "image/jpeg", headers={"Cache-Control": "public, max-age=86400"})
