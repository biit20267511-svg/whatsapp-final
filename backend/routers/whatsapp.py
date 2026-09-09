import os
import httpx
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from auth import get_current_restaurant_id
from database import NO_ID, clean, db, now_iso
from whatsapp.service import get_whatsapp_provider

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


class ProviderBody(BaseModel): provider: str
class EvolutionConfig(BaseModel):
    evolution_api_url: str | None = None
    evolution_api_key: str | None = None
    evolution_instance_name: str | None = None
class MetaConfig(BaseModel):
    meta_app_id: str | None = None
    meta_app_secret: str | None = None
    meta_graph_api_url: str | None = None
    meta_access_token: str | None = None
    meta_phone_number_id: str | None = None
    meta_waba_id: str | None = None
    meta_verify_token: str | None = None

class SendBody(BaseModel):
    to: str
    text: str


def _mask(value): return "" if not value else ("••••" if len(value) <= 6 else value[:3] + "••••" + value[-3:])
META_SECRETS = {"meta_app_secret", "meta_access_token"}


async def _get_conn(rid):
    conn = await db.whatsapp_connections.find_one({"restaurant_id": rid}, NO_ID)
    if not conn:
        conn = {"id": rid, "restaurant_id": rid, "provider": "simulator", "status": "connected", "logs": []}
        await db.whatsapp_connections.insert_one(conn)
    return conn


def _public(conn, base_url=None):
    conn = clean(conn) or {}; app_url = (base_url or os.environ.get("APP_URL", "")).rstrip("/")
    return {"provider": conn.get("provider", "simulator"), "status": conn.get("status", "disconnected"), "connected_number": conn.get("connected_number"), "last_connected_at": conn.get("last_connected_at"), "logs": conn.get("logs", [])[-15:], "evolution": {"evolution_api_url": conn.get("evolution_api_url", ""), "evolution_api_key_masked": _mask(conn.get("evolution_api_key", "")), "evolution_instance_name": conn.get("evolution_instance_name", ""), "configured": bool(conn.get("evolution_api_url") or os.environ.get("EVOLUTION_API_URL"))}, "meta": {"meta_app_id": conn.get("meta_app_id", ""), "meta_app_secret_masked": _mask(conn.get("meta_app_secret", "")), "meta_graph_api_url": conn.get("meta_graph_api_url", "https://graph.facebook.com/v21.0"), "meta_phone_number_id": conn.get("meta_phone_number_id", ""), "meta_waba_id": conn.get("meta_waba_id", ""), "meta_access_token_masked": _mask(conn.get("meta_access_token", "")), "meta_verify_token_masked": _mask(conn.get("meta_verify_token", "")), "webhook_url": f"{app_url}/api/webhooks/whatsapp/meta", "configured": bool(conn.get("meta_access_token") and conn.get("meta_phone_number_id"))}, "evolution_webhook_url": f"{app_url}/api/webhooks/whatsapp/evolution/{conn.get('restaurant_id')}"}


@router.get("/config")
async def get_config(request: Request, rid: str = Depends(get_current_restaurant_id)):
    return _public(await _get_conn(rid))


@router.post("/provider")
async def set_provider(body: ProviderBody, rid: str = Depends(get_current_restaurant_id)):
    await db.whatsapp_connections.update_one({"restaurant_id": rid}, {"$set": {"provider": body.provider, "status": "connected" if body.provider == "simulator" else "disconnected"}, "$push": {"logs": f"{now_iso()} — provider switched to {body.provider}"}})
    return _public(await _get_conn(rid))


@router.put("/evolution")
async def set_evolution(body: EvolutionConfig, rid: str = Depends(get_current_restaurant_id)):
    await db.whatsapp_connections.update_one({"restaurant_id": rid}, {"$set": {k: v for k, v in body.model_dump().items() if v is not None}})
    return _public(await _get_conn(rid))


@router.put("/meta")
async def set_meta(body: MetaConfig, rid: str = Depends(get_current_restaurant_id)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None and (k not in META_SECRETS or v.strip())}
    if updates:
        await db.whatsapp_connections.update_one({"restaurant_id": rid}, {"$set": updates})
    return _public(await _get_conn(rid))


@router.post("/connect")
async def connect(rid: str = Depends(get_current_restaurant_id)):
    provider = await get_whatsapp_provider(rid); status = await provider.connect()
    await db.whatsapp_connections.update_one({"restaurant_id": rid}, {"$set": {"status": status.status, "connected_number": status.connected_number, "last_connected_at": status.last_connected_at}, "$push": {"logs": {"$each": status.logs or []}}})
    result = _public(await _get_conn(rid)); result.update({"qr_code": status.qr_code, "detail": status.detail}); return result


@router.post("/disconnect")
async def disconnect(rid: str = Depends(get_current_restaurant_id)):
    status = await (await get_whatsapp_provider(rid)).disconnect()
    await db.whatsapp_connections.update_one({"restaurant_id": rid}, {"$set": {"status": status.status, "connected_number": None}})
    return _public(await _get_conn(rid))


@router.get("/gateway-health")
async def gateway_health(rid: str = Depends(get_current_restaurant_id)):
    url = (os.environ.get("WHATSAPP_GATEWAY_URL") or "http://localhost:3001").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=3) as http:
            resp = await http.get(f"{url}/health")
            ok = resp.status_code == 200 and resp.json().get("ok") is True
    except Exception:
        ok = False
    return {"ok": ok, "checked_at": now_iso()}


@router.get("/status")
async def status(rid: str = Depends(get_current_restaurant_id)):
    st = await (await get_whatsapp_provider(rid)).get_connection_status()
    await db.whatsapp_connections.update_one({"restaurant_id": rid}, {"$set": {"status": st.status}})
    result = _public(await _get_conn(rid)); result.update({"detail": st.detail, "qr_code": st.qr_code}); return result


@router.post("/send")
async def send_message(body: SendBody, rid: str = Depends(get_current_restaurant_id)):
    provider = await get_whatsapp_provider(rid)
    sent = await provider.send_message(body.to.strip(), body.text.strip())
    if not sent:
        raise HTTPException(status_code=409, detail="WhatsApp provider is not connected")
    return {"ok": True}