import os
import httpx

from database import now_iso
from .base import ConnectionStatus, WhatsAppProvider


class MetaCloudProvider(WhatsAppProvider):
    name = "meta"

    @property
    def graph_url(self):
        return (self.config.get("meta_graph_api_url") or os.environ.get("META_GRAPH_API_URL") or "https://graph.facebook.com/v21.0").rstrip("/")

    @property
    def access_token(self):
        return self.config.get("meta_access_token") or os.environ.get("META_ACCESS_TOKEN") or ""

    @property
    def phone_number_id(self):
        return self.config.get("meta_phone_number_id") or os.environ.get("META_PHONE_NUMBER_ID") or ""

    def _configured(self):
        return bool(self.access_token and self.phone_number_id)

    async def connect(self):
        return await self.get_connection_status()

    async def disconnect(self):
        return ConnectionStatus(status="disconnected", detail="Meta connection is stateless; credentials retained")

    async def send_message(self, to_phone, text):
        if not self._configured():
            return False
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(f"{self.graph_url}/{self.phone_number_id}/messages", headers={"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}, json={"messaging_product": "whatsapp", "to": to_phone, "type": "text", "text": {"body": text}})
                return response.status_code < 300
        except Exception:
            return False

    async def get_connection_status(self):
        if not self._configured():
            return ConnectionStatus(status="disconnected", detail="Meta credentials not configured")
        return ConnectionStatus(status="connected", last_connected_at=now_iso())