import asyncio
import json
from typing import Dict, Set


ADMIN_CHANNEL = "__admin__"


class EventBus:
    def __init__(self):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}

    async def subscribe(self, restaurant_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.setdefault(restaurant_id, set()).add(queue)
        return queue

    def unsubscribe(self, restaurant_id: str, queue: asyncio.Queue):
        subscribers = self._subscribers.get(restaurant_id)
        if subscribers and queue in subscribers:
            subscribers.discard(queue)
            if not subscribers:
                self._subscribers.pop(restaurant_id, None)

    async def publish(self, restaurant_id: str, event_type: str, data: dict):
        payload = json.dumps({"type": event_type, "data": data})
        for queue in list(self._subscribers.get(restaurant_id, set())):
            await queue.put(payload)
        # Mirror every tenant event to Super Admin subscribers so the admin panel stays live.
        if restaurant_id != ADMIN_CHANNEL:
            admin_payload = json.dumps({"type": event_type, "restaurant_id": restaurant_id, "data": data})
            for queue in list(self._subscribers.get(ADMIN_CHANNEL, set())):
                await queue.put(admin_payload)


bus = EventBus()