import re, secrets, string
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user, hash_password, verify_password
from database import NO_ID, clean, clean_list, db, new_id, now_iso
from models.admin import AdminProfileUpdate, AdminSettingsUpdate, CredentialsUpdate, ExtendBody, ReminderBody, RestaurantCreate, RestaurantUpdate, StatusUpdate
from services.subscription_service import DEFAULT_MONTHLY, DEFAULT_SETUP, audit, ensure_subscription, parse_day, today

router = APIRouter(prefix="/admin", tags=["admin"])

async def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "SUPER_ADMIN": raise HTTPException(status_code=403, detail="Super Admin access required")
    return user

def generated_username(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "restaurant"
    return f"{base}_{secrets.randbelow(90)+10}"

def generated_password() -> str:
    alphabet = string.ascii_letters + string.digits + "@#%"
    return "".join(secrets.choice(alphabet) for _ in range(14))

async def settings_doc():
    item = await db.admin_settings.find_one({"id": "platform"}, NO_ID)
    if not item:
        item = {"id": "platform", "monthly_price": DEFAULT_MONTHLY, "setup_fee": DEFAULT_SETUP, "reminder_template": "Salam! Aapki [Restaurant Name] AI WhatsApp ordering subscription [Date] ko expire hone wali hai. Please apni monthly payment complete kar dein taake service continuously active rahe. Shukriya."}
        await db.admin_settings.insert_one({**item})
    return clean(item)

async def expanded_restaurants():
    restaurants = clean_list(await db.restaurants.find({}, NO_ID).sort("created_at", -1).to_list(1000)); result=[]
    for restaurant in restaurants:
        sub = await ensure_subscription(restaurant["id"]); user = clean(await db.users.find_one({"restaurant_id": restaurant["id"]}, NO_ID)); wa = clean(await db.whatsapp_connections.find_one({"restaurant_id": restaurant["id"]}, NO_ID)) or {}
        result.append({**restaurant, "owner": user.get("name") if user else "", "email": user.get("email") if user else "", "username": user.get("username") if user else "", "subscription": sub, "whatsapp_status": wa.get("status", "disconnected")})
    return result

@router.get("/summary")
async def summary(user: dict = Depends(require_admin)):
    restaurants = await expanded_restaurants(); orders = await db.orders.find({}, NO_ID).to_list(5000); customers = await db.customers.count_documents({}); today_text = today().isoformat()
    active = [r for r in restaurants if r["subscription"]["status"] in ("ACTIVE","TRIAL","EXPIRING_SOON")]
    return {"total_restaurants": len(restaurants), "active_restaurants": len(active), "trial_restaurants": sum(r["subscription"]["status"]=="TRIAL" for r in restaurants), "expiring_soon": sum(r["subscription"]["status"]=="EXPIRING_SOON" for r in restaurants), "expired": sum(r["subscription"]["status"] in ("EXPIRED","SUSPENDED") for r in restaurants), "mrr": sum(float(r["subscription"].get("monthly_price",0)) for r in active), "total_orders": len(orders), "today_orders": sum(str(o.get("created_at","")).startswith(today_text) for o in orders), "total_customers": customers, "total_revenue": sum(float(o.get("total",0)) for o in orders if o.get("status") != "Cancelled")}

@router.get("/restaurants")
async def restaurants(search: str = "", status: str = "", user: dict = Depends(require_admin)):
    rows = await expanded_restaurants()
    if search: rows=[r for r in rows if search.lower() in f"{r.get('name','')} {r.get('owner','')} {r.get('email','')}".lower()]
    if status: rows=[r for r in rows if r["subscription"]["status"]==status]
    return rows

def username_query(username: str):
    return {"username": {"$regex": f"^{re.escape(username)}$", "$options": "i"}}

@router.post("/restaurants")
async def create_restaurant(body: RestaurantCreate, user: dict = Depends(require_admin)):
    if await db.users.find_one({"email": body.email.lower().strip()}): raise HTTPException(status_code=400, detail="Email already registered")
    username = (body.username or "").strip() or generated_username(body.restaurant_name); password = (body.password or "").strip() or generated_password()
    if await db.users.find_one(username_query(username)):
        if body.username: raise HTTPException(status_code=400, detail="Username already taken. Choose a different one.")
        username = generated_username(body.restaurant_name)
    rid, uid, start = new_id(), new_id(), parse_day(body.start_date); end = start + timedelta(days=body.duration_days)
    restaurant = {"id": rid, "name": body.restaurant_name, "owner_name": body.owner_name, "phone": body.phone, "whatsapp_number": body.whatsapp_number, "address": body.address, "city": body.city, "currency": "PKR", "delivery_fee": body.delivery_fee, "prep_time_min": body.prep_time_min, "prep_time_max": body.prep_time_min+10, "delivery_time_min": body.delivery_time_min, "delivery_time_max": body.delivery_time_min+10, "created_at": now_iso()}
    await db.restaurants.insert_one(restaurant); await db.users.insert_one({"id": uid, "email": body.email.lower(), "username": username, "password_hash": hash_password(password), "name": body.owner_name, "role": "RESTAURANT_ADMIN", "restaurant_id": rid, "must_change_password": True, "created_at": now_iso()})
    await db.subscriptions.insert_one({"id": new_id(), "restaurant_id": rid, "plan": "AI Restaurant Assistant", "status": "ACTIVE", "payment_status": "PENDING", "start_date": start.isoformat(), "end_date": end.isoformat(), "next_payment_date": end.isoformat(), "monthly_price": body.monthly_price, "setup_fee": body.setup_fee, "last_payment_date": None, "created_at": now_iso(), "updated_at": now_iso()})
    await db.whatsapp_connections.insert_one({"id": new_id(), "restaurant_id": rid, "provider": "simulator", "status": "connected", "connected_number": "Simulator", "logs": [], "created_at": now_iso()}); await db.ai_settings.insert_one({"id": new_id(), "restaurant_id": rid, "provider": "gemini", "model": "gemini-3-flash-preview", "personality": "friendly restaurant receptionist", "created_at": now_iso()})
    await audit(user["id"], "CREATED_RESTAURANT", rid, {"email": body.email.lower()})
    return {"restaurant": clean(restaurant), "credentials": {"username": username, "password": password, "login_url": "/login"}}

@router.get("/restaurants/{restaurant_id}")
async def restaurant_detail(restaurant_id: str, user: dict = Depends(require_admin)):
    restaurant = clean(await db.restaurants.find_one({"id": restaurant_id}, NO_ID))
    if not restaurant: raise HTTPException(status_code=404, detail="Restaurant not found")
    sub = await ensure_subscription(restaurant_id)
    owner = clean(await db.users.find_one({"restaurant_id": restaurant_id}, NO_ID)) or {}
    owner.pop("password_hash", None)
    wa = clean(await db.whatsapp_connections.find_one({"restaurant_id": restaurant_id}, NO_ID)) or {}
    payments = clean_list(await db.payments.find({"restaurant_id": restaurant_id}, NO_ID).sort("paid_at", -1).to_list(100))
    orders = await db.orders.find({"restaurant_id": restaurant_id}, NO_ID).sort("created_at", -1).to_list(2000)
    today_text = today().isoformat()
    recent = [{"id": o["id"], "order_number": o.get("order_number"), "customer_name": o.get("customer_name", ""), "total": o.get("total", 0), "status": o.get("status", ""), "created_at": o.get("created_at", "")} for o in clean_list(orders[:10])]
    stats = {"total_orders": len(orders), "today_orders": sum(str(o.get("created_at", "")).startswith(today_text) for o in orders), "total_revenue": sum(float(o.get("total", 0)) for o in orders if o.get("status") != "Cancelled"), "total_customers": await db.customers.count_documents({"restaurant_id": restaurant_id}), "menu_items": await db.menu_items.count_documents({"restaurant_id": restaurant_id})}
    notifications = clean_list(await db.notifications.find({"restaurant_id": restaurant_id}, NO_ID).sort("created_at", -1).to_list(10))
    return {"restaurant": restaurant, "owner": {"name": owner.get("name", ""), "email": owner.get("email", ""), "username": owner.get("username", ""), "must_change_password": owner.get("must_change_password", False), "created_at": owner.get("created_at", "")}, "subscription": sub, "whatsapp": {"provider": wa.get("provider", "simulator"), "status": wa.get("status", "disconnected"), "connected_number": wa.get("connected_number", "")}, "payments": payments, "recent_orders": recent, "stats": stats, "notifications": notifications}

@router.put("/restaurants/{restaurant_id}/credentials")
async def update_credentials(restaurant_id: str, body: CredentialsUpdate, user: dict = Depends(require_admin)):
    account = await db.users.find_one({"restaurant_id": restaurant_id})
    if not account: raise HTTPException(status_code=404, detail="Restaurant account not found")
    changes = {}
    if body.email and body.email.lower() != account.get("email"):
        if await db.users.find_one({"email": body.email.lower(), "id": {"$ne": account["id"]}}): raise HTTPException(status_code=400, detail="Email already registered")
        changes["email"] = body.email.lower()
    if body.username and body.username.strip() and body.username.strip() != account.get("username"):
        username = body.username.strip()
        existing = await db.users.find_one({**username_query(username), "id": {"$ne": account["id"]}})
        if existing: raise HTTPException(status_code=400, detail="Username already taken")
        changes["username"] = username
    if body.new_password and body.new_password.strip():
        if len(body.new_password.strip()) < 6: raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        changes["password_hash"] = hash_password(body.new_password.strip()); changes["must_change_password"] = True
    if not changes: raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"id": account["id"]}, {"$set": changes})
    await audit(user["id"], "UPDATED_CREDENTIALS", restaurant_id, {k: v for k, v in changes.items() if k != "password_hash"})
    return {"ok": True, "username": changes.get("username", account.get("username")), "email": changes.get("email", account.get("email")), "password_changed": "password_hash" in changes}

@router.put("/restaurants/{restaurant_id}")
async def update_restaurant(restaurant_id: str, body: RestaurantUpdate, user: dict = Depends(require_admin)):
    data={k:v for k,v in body.model_dump().items() if v is not None and k not in {"owner_name","monthly_price"}}
    if data: await db.restaurants.update_one({"id":restaurant_id},{"$set":data})
    if body.owner_name: await db.users.update_one({"restaurant_id":restaurant_id},{"$set":{"name":body.owner_name}})
    if body.monthly_price is not None: await db.subscriptions.update_one({"restaurant_id":restaurant_id},{"$set":{"monthly_price":body.monthly_price}})
    await audit(user["id"],"UPDATED_RESTAURANT",restaurant_id,body.model_dump(exclude_none=True)); return {"ok":True}

@router.patch("/restaurants/{restaurant_id}/status")
async def set_status(restaurant_id: str, body: StatusUpdate, user: dict = Depends(require_admin)):
    if body.status not in {"ACTIVE","SUSPENDED"}: raise HTTPException(400,"Invalid status")
    await db.subscriptions.update_one({"restaurant_id":restaurant_id},{"$set":{"status":body.status,"updated_at":now_iso()}}); await audit(user["id"],body.status+"_RESTAURANT",restaurant_id); return await ensure_subscription(restaurant_id)

@router.post("/restaurants/{restaurant_id}/payment")
async def payment_received(restaurant_id: str, user: dict = Depends(require_admin)):
    sub=await ensure_subscription(restaurant_id); base=max(parse_day(sub.get("end_date")),today()); end=base+timedelta(days=30)
    payment={"id":new_id(),"restaurant_id":restaurant_id,"amount":sub.get("monthly_price",DEFAULT_MONTHLY),"status":"PAID","paid_at":now_iso(),"period_end":end.isoformat()}; await db.payments.insert_one(payment)
    await db.subscriptions.update_one({"restaurant_id":restaurant_id},{"$set":{"status":"ACTIVE","payment_status":"PAID","last_payment_date":today().isoformat(),"end_date":end.isoformat(),"next_payment_date":end.isoformat(),"updated_at":now_iso()}}); await audit(user["id"],"PAYMENT_RECEIVED",restaurant_id,{"amount":payment["amount"]}); return await ensure_subscription(restaurant_id)

@router.post("/restaurants/{restaurant_id}/extend")
async def extend(restaurant_id: str, body: ExtendBody, user: dict = Depends(require_admin)):
    sub=await ensure_subscription(restaurant_id); end=max(parse_day(sub.get("end_date")),today())+timedelta(days=body.days); await db.subscriptions.update_one({"restaurant_id":restaurant_id},{"$set":{"end_date":end.isoformat(),"next_payment_date":end.isoformat(),"status":"ACTIVE","updated_at":now_iso()}}); await audit(user["id"],"EXTENDED_SUBSCRIPTION",restaurant_id,{"days":body.days}); return await ensure_subscription(restaurant_id)

@router.post("/restaurants/{restaurant_id}/reset-password")
async def reset_password(restaurant_id: str, user: dict = Depends(require_admin)):
    password=generated_password(); await db.users.update_one({"restaurant_id":restaurant_id},{"$set":{"password_hash":hash_password(password),"must_change_password":True}}); await audit(user["id"],"RESET_PASSWORD",restaurant_id); return {"temporary_password":password}

@router.get("/subscriptions")
async def subscriptions(user: dict = Depends(require_admin)): return await expanded_restaurants()

@router.post("/reminders")
async def reminder(body: ReminderBody, user: dict = Depends(require_admin)):
    restaurant=await db.restaurants.find_one({"id":body.restaurant_id},NO_ID); sub=await ensure_subscription(body.restaurant_id); settings=await settings_doc(); message=settings["reminder_template"].replace("[Restaurant Name]",restaurant.get("name","Restaurant")).replace("[Date]",sub["end_date"]); note={"id":new_id(),"restaurant_id":body.restaurant_id,"type":"SUBSCRIPTION_REMINDER","message":message,"status":"CREATED","created_at":now_iso()}; await db.notifications.insert_one(note); await audit(user["id"],"SENT_REMINDER",body.restaurant_id); return clean(note)

@router.get("/audit-logs")
async def audit_logs(user: dict = Depends(require_admin)): return clean_list(await db.audit_logs.find({},NO_ID).sort("timestamp",-1).to_list(200))

@router.get("/settings")
async def get_settings(user: dict = Depends(require_admin)): return await settings_doc()

@router.put("/settings")
async def update_settings(body: AdminSettingsUpdate, user: dict = Depends(require_admin)):
    data={k:v for k,v in body.model_dump().items() if v is not None}; await db.admin_settings.update_one({"id":"platform"},{"$set":data},upsert=True); await audit(user["id"],"UPDATED_PLATFORM_SETTINGS","platform",data); return await settings_doc()

@router.put("/profile")
async def update_profile(body: AdminProfileUpdate, user: dict = Depends(require_admin)):
    stored=await db.users.find_one({"id":user["id"]})
    if not stored or not verify_password(body.current_password,stored["password_hash"]): raise HTTPException(400,"Current password is incorrect")
    changes={}
    if body.email: changes["email"]=body.email.lower()
    if body.new_password: changes["password_hash"]=hash_password(body.new_password)
    if changes: await db.users.update_one({"id":user["id"]},{"$set":changes})
    await audit(user["id"],"UPDATED_ADMIN_PROFILE",user["id"]); return {"ok":True}