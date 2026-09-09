from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class IncomingMessage:
    restaurant_id: str
    provider: str
    customer_phone: str
    message_id: str
    text: str
    timestamp: str
    customer_name: str | None = None


@dataclass
class ConnectionStatus:
    status: str
    connected_number: str | None = None
    last_connected_at: str | None = None
    qr_code: str | None = None
    detail: str | None = None
    logs: list = field(default_factory=list)


class WhatsAppProvider(ABC):
    name = "base"

    def __init__(self, restaurant_id: str, config: dict):
        self.restaurant_id, self.config = restaurant_id, config or {}

    @abstractmethod
    async def connect(self) -> ConnectionStatus: ...

    @abstractmethod
    async def disconnect(self) -> ConnectionStatus: ...

    @abstractmethod
    async def send_message(self, to_phone: str, text: str) -> bool: ...

    @abstractmethod
    async def get_connection_status(self) -> ConnectionStatus: ...

    async def get_qr_code(self) -> ConnectionStatus:
        return await self.connect()