import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env", override=False)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

NO_ID = {"_id": 0}


def clean(doc):
    if not doc:
        return doc
    return {k: v for k, v in doc.items() if k != "_id"}


def clean_list(docs):
    return [clean(d) for d in docs]


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def next_order_number(restaurant_id: str) -> int:
    key = f"orders:{restaurant_id}"
    doc = await db.counters.find_one_and_update(
        {"id": key},
        {"$inc": {"seq": 1}, "$setOnInsert": {"id": key}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"]
    if seq < 1001:
        await db.counters.update_one({"id": key}, {"$set": {"seq": 1001}})
        return 1001
    return seq