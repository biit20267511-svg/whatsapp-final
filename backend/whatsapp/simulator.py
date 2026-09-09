from database import now_iso
from .base import ConnectionStatus, WhatsAppProvider


class SimulatorProvider(WhatsAppProvider):
    name = "simulator"

    async def connect(self):
        return await self.get_connection_status()

    async def disconnect(self):
        return ConnectionStatus(status="disconnected", detail="Simulator stopped")

    async def send_message(self, to_phone: str, text: str) -> bool:
        return True

    async def get_connection_status(self):
        return ConnectionStatus(status="connected", connected_number="Simulator", last_connected_at=now_iso(),
                                detail="Built-in test simulator is always connected")