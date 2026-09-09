import os
from fastapi import APIRouter, HTTPException, Request, Response
from database import NO_ID, db, now_iso
from services import conversation_service
from whatsapp.base import IncomingMessage

router = APIRouter(prefix="/webhooks/whatsapp", tags=["webhooks"])

@router.get("/meta")
async def meta_verify(request: Request):
    params = request.query_params; token = params.get("hub.verify_token")
    conn = await db.whatsapp_connections.find_one({"meta_verify_token": token}, NO_ID)
    if params.get("hub.mode") == "subscribe" and (token == os.environ.get("META_VERIFY_TOKEN", "") or conn):
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")

@router.post("/meta")
async def meta_webhook(request: Request):
    body = await request.json()
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {}) or {}; metadata = value.get("metadata", {}) or {}
            conn = await db.whatsapp_connections.find_one({"meta_phone_number_id": metadata.get("phone_number_id")}, NO_ID)
            if not conn: continue
            contacts = {c.get("wa_id"): c.get("profile", {}).get("name") for c in value.get("contacts", [])}
            for message in value.get("messages", []):
                if message.get("type") == "text":
                    await conversation_service.handle_incoming(IncomingMessage(restaurant_id=conn["restaurant_id"], provider="meta", customer_phone=message.get("from", ""), message_id=message.get("id", ""), text=(message.get("text") or {}).get("body", ""), timestamp=now_iso(), customer_name=contacts.get(message.get("from", ""))))
    return {"ok": True}

@router.post("/evolution/{restaurant_id}")
async def evolution_webhook(restaurant_id: str, request: Request):
    body = await request.json(); data = body.get("data", {}); key = data.get("key", {}); text = (data.get("message", {}) or {}).get("conversation", "")
    if not key.get("fromMe") and key.get("remoteJid") and text:
        await conversation_service.handle_incoming(IncomingMessage(restaurant_id=restaurant_id, provider="evolution", customer_phone=key["remoteJid"].split("@")[0], message_id=key.get("id", ""), text=text, timestamp=now_iso()))
    return {"ok": True}

@router.post("/baileys/{restaurant_id}")
async def baileys_webhook(restaurant_id: str, request: Request):
    secret = os.environ.get("WHATSAPP_GATEWAY_SECRET")
    if secret and request.headers.get("x-gateway-secret") != secret:
        raise HTTPException(status_code=401, detail="unauthorized")
    body = await request.json(); phone = (body.get("phone") or "").strip(); text = (body.get("text") or "").strip()
    if phone and text:
        await conversation_service.handle_incoming(IncomingMessage(restaurant_id=restaurant_id, provider="baileys", customer_phone=phone, message_id=body.get("messageId", ""), text=text, timestamp=body.get("timestamp") or now_iso(), customer_name=body.get("pushName")))
    return {"ok": True}