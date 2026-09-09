"""Free QR-based WhatsApp provider backed by the persistent Node Baileys gateway."""
import os
import logging
import httpx

from database import now_iso
from .base import ConnectionStatus, WhatsAppProvider

logger = logging.getLogger(__name__)


class BaileysProvider(WhatsAppProvider):
    name = "baileys"

    @property
    def gateway(self) -> str:
        return (os.environ.get("WHATSAPP_GATEWAY_URL") or "http://localhost:3001").rstrip("/")

    def _headers(self) -> dict:
        return {"x-gateway-secret": os.environ.get("WHATSAPP_GATEWAY_SECRET", "")}

    def _url(self, suffix: str) -> str:
        return f"{self.gateway}/instance/{self.restaurant_id}/{suffix}"

    async def connect(self) -> ConnectionStatus:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(self._url("connect"), headers=self._headers())
                data = response.json() if response.content else {}
            return ConnectionStatus(status=data.get("status", "connecting"), qr_code=data.get("qr"), connected_number=data.get("number"), last_connected_at=now_iso() if data.get("status") == "connected" else None, detail="Scan this QR code with WhatsApp → Linked Devices" if data.get("qr") else None, logs=[f"{now_iso()} — baileys connect ({data.get('status')})"])
        except Exception as exc:
            return ConnectionStatus(status="error", detail=f"Gateway unreachable: {exc}")

    async def disconnect(self) -> ConnectionStatus:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                await client.post(self._url("logout"), headers=self._headers())
        except Exception:
            pass
        return ConnectionStatus(status="disconnected", detail="Logged out", logs=[f"{now_iso()} — baileys disconnected"])

    async def send_message(self, to_phone: str, text: str) -> bool:
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=25) as client:
                    response = await client.post(self._url("send"), headers=self._headers(), json={"to": to_phone, "text": text})
                    if response.status_code < 300:
                        return True
                    logger.warning("Baileys send attempt %s failed status=%s body=%s", attempt + 1, response.status_code, response.text[:300])
            except Exception as exc:
                logger.warning("Baileys send attempt %s errored: %s", attempt + 1, exc)
        return False

    async def get_connection_status(self) -> ConnectionStatus:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(self._url("status"), headers=self._headers())
                data = response.json() if response.content else {}
            return ConnectionStatus(status=data.get("status", "disconnected"), qr_code=data.get("qr"), connected_number=data.get("number"), last_connected_at=now_iso() if data.get("status") == "connected" else None)
        except Exception as exc:
            return ConnectionStatus(status="error", detail=f"Gateway unreachable: {exc}")

    async def get_qr_code(self) -> ConnectionStatus:
        return await self.connect()