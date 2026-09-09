import os
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)

# MongoDB connection
from database import client
import seed
from routers import (admin, analytics, auth, billing, conversations, customers, menu, orders,
                     reservations, restaurant, simulator, stream, uploads, webhooks, whatsapp)


app = FastAPI(title="AI Restaurant Ordering SaaS")


@app.on_event("startup")
async def seed_demo_data():
    await seed.seed()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "AI Restaurant Ordering SaaS API", "status": "ok"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

for router in (auth.router, admin.router, billing.router, restaurant.router, menu.router, orders.router, customers.router,
               analytics.router, whatsapp.router, conversations.router, simulator.router,
               webhooks.router, stream.router, uploads.router, reservations.router):
    api_router.include_router(router)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
