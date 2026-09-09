import os

from auth import hash_password, verify_password
from database import NO_ID, db, new_id, now_iso
from services.subscription_service import ensure_subscription

DEMO_RESTAURANT_ID = "demo-pizza-palace"


async def seed():
    await db.users.create_index("email", unique=True)
    await db.customers.create_index([("restaurant_id", 1), ("phone", 1)])
    restaurant = await db.restaurants.find_one({"id": DEMO_RESTAURANT_ID}, NO_ID)
    if not restaurant:
        restaurant = {"id": DEMO_RESTAURANT_ID, "name": "Pizza Palace", "description": "Fast food & pizza — Lahore's favourite since 2015.", "address": "Main Boulevard, Gulberg III", "city": "Lahore", "opening_hours": "Mon-Sun, 12:00 PM – 2:00 AM", "delivery_areas": "Gulberg, DHA, Model Town, Johar Town", "delivery_fee": 150, "min_order": 500, "prep_time_min": 20, "prep_time_max": 30, "delivery_time_min": 15, "delivery_time_max": 20, "currency": "PKR", "ai_greeting": "Assalam-o-Alaikum! Welcome to Pizza Palace 🍕 How can I help you today?", "created_at": now_iso()}
        await db.restaurants.insert_one(restaurant)
    email, password = os.environ.get("ADMIN_EMAIL", "owner@pizzapalace.pk").lower(), os.environ.get("ADMIN_PASSWORD", "palace123")
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({"id": new_id(), "email": email, "password_hash": hash_password(password), "name": "Pizza Palace Owner", "role": "owner", "restaurant_id": DEMO_RESTAURANT_ID, "created_at": now_iso()})
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password), "restaurant_id": DEMO_RESTAURANT_ID}})
    await db.users.update_one({"email": email}, {"$set": {"role": "RESTAURANT_ADMIN", "username": "pizza_palace"}})
    super_email = os.environ.get("SUPER_ADMIN_EMAIL", "admin@restaurantai.pk").lower()
    super_password = os.environ.get("SUPER_ADMIN_PASSWORD", "ChangeMe@2026")
    super_admin = await db.users.find_one({"email": super_email})
    if not super_admin:
        await db.users.insert_one({"id": new_id(), "email": super_email, "username": "superadmin", "password_hash": hash_password(super_password), "name": "Platform Super Admin", "role": "SUPER_ADMIN", "restaurant_id": None, "must_change_password": True, "created_at": now_iso()})
    await ensure_subscription(DEMO_RESTAURANT_ID)
    if not await db.whatsapp_connections.find_one({"restaurant_id": DEMO_RESTAURANT_ID}):
        await db.whatsapp_connections.insert_one({"id": new_id(), "restaurant_id": DEMO_RESTAURANT_ID, "provider": "simulator", "status": "connected", "connected_number": "Simulator", "logs": [f"{now_iso()} — simulator ready"], "created_at": now_iso()})
    if not await db.ai_settings.find_one({"restaurant_id": DEMO_RESTAURANT_ID}):
        await db.ai_settings.insert_one({"id": new_id(), "restaurant_id": DEMO_RESTAURANT_ID, "provider": "gemini", "model": os.environ.get("AI_MODEL", "gemini-3-flash-preview"), "personality": "friendly Pakistani restaurant receptionist", "language_behavior": "Auto-detect and reply in English, Urdu or Roman Urdu", "upsell_enabled": True, "max_upsell_attempts": 1, "human_handoff_enabled": True, "created_at": now_iso()})
    if await db.menu_items.count_documents({"restaurant_id": DEMO_RESTAURANT_ID}) == 0:
        categories = [("Burgers", 1), ("Pizza", 2), ("Fries", 3), ("Drinks", 4), ("Desserts", 5)]
        category_ids = {}
        for name, sort_order in categories:
            category_ids[name] = new_id(); await db.menu_categories.insert_one({"id": category_ids[name], "restaurant_id": DEMO_RESTAURANT_ID, "name": name, "sort_order": sort_order, "created_at": now_iso()})
        menu = [("Burgers", "Zinger Burger", "Crispy fried chicken fillet with mayo & lettuce", 650), ("Burgers", "Beef Burger", "Juicy grilled beef patty with cheese", 750), ("Pizza", "Large Pizza", "Large signature pizza", 1499), ("Fries", "Regular Fries", "Golden crispy fries", 250), ("Drinks", "Coke", "Chilled 345ml can", 120), ("Desserts", "Brownie", "Warm chocolate fudge brownie", 350)]
        for category, name, description, price in menu:
            await db.menu_items.insert_one({"id": new_id(), "restaurant_id": DEMO_RESTAURANT_ID, "category_id": category_ids[category], "name": name, "description": description, "price": price, "available": True, "image_url": "", "addon_item_ids": [], "created_at": now_iso()})
