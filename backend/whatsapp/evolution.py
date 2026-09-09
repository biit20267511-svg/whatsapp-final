import os
import httpx

from database import now_iso
from .base import ConnectionStatus, WhatsAppProvider


class EvolutionApiProvider(WhatsAppProvider):
    name = "evolution"

    @property
    def base_url(self):
        return (self.config.get("evolution_api_url") or os.environ.get("EVOLUTION_API_URL") or "").rstrip("/")

    @property
    def api_key(self):
        return self.config.get("evolution_api_key") or os.environ.get("EVOLUTION_API_KEY") or ""

    @property
    def instance(self):
        return self.config.get("evolution_instance_name") or f"rest_{self.restaurant_id[:8]}"

    def _headers(self):
        return {"apikey": self.api_key, "Content-Type": "application/json"}

    def _configured(self):
        return bool(self.base_url and self.api_key)

    async def connect(self):
        if not self._configured():
            return ConnectionStatus(status="disconnected", detail="Evolution API URL and key are not configured.", logs=[f"{now_iso()} — missing URL/key"])
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                await client.post(f"{self.base_url}/instance/create", headers=self._headers(), json={"instanceName": self.instance, "qrcode": True, "integration": "WHATSAPP-BAILEYS"})
                response = await client.get(f"{self.base_url}/instance/connect/{self.instance}", headers=self._headers())
                data = response.json() if response.content else {}
            qr = data.get("base64") or (data.get("qrcode") or {}).get("base64")
            return ConnectionStatus(status="connecting" if qr else "disconnected", qr_code=qr, detail="Scan this QR code with WhatsApp → Linked Devices")
        except Exception as exc:
            return ConnectionStatus(status="error", detail=f"Evolution connect failed: {exc}")

    async def disconnect(self):
        return ConnectionStatus(status="disconnected", detail="Instance logged out")

    async def send_message(self, to_phone, text):
        if not self._configured():
            return False
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(f"{self.base_url}/message/sendText/{self.instance}", headers=self._headers(), json={"number": to_phone, "text": text})
                return response.status_code < 300
        except Exception:
            return False

    async def get_connection_status(self):
        return ConnectionStatus(status="disconnected", detail="Evolution API not configured") if not self._configured() else ConnectionStatus(status="disconnected")