from database import NO_ID, db
from .baileys import BaileysProvider
from .evolution import EvolutionApiProvider
from .meta import MetaCloudProvider
from .simulator import SimulatorProvider

_PROVIDERS = {"simulator": SimulatorProvider, "evolution": EvolutionApiProvider, "meta": MetaCloudProvider, "baileys": BaileysProvider}


async def get_whatsapp_provider(restaurant_id):
    config = await db.whatsapp_connections.find_one({"restaurant_id": restaurant_id}, NO_ID) or {"provider": "simulator"}
    return _PROVIDERS.get(config.get("provider", "simulator"), SimulatorProvider)(restaurant_id, config)


class WhatsAppService:
    async def send_customer_message(self, restaurant_id, to_phone, text):
        return await (await get_whatsapp_provider(restaurant_id)).send_message(to_phone, text)

    async def send_order_notification(self, restaurant_id, to_phone, text):
        return await (await get_whatsapp_provider(restaurant_id)).send_message(to_phone, text)

    async def send_human_reply(self, restaurant_id, to_phone, text):
        return await (await get_whatsapp_provider(restaurant_id)).send_message(to_phone, text)


whatsapp_service = WhatsAppService()