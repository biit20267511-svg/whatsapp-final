from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_restaurant_id, get_current_user
from database import NO_ID, clean, clean_list, db, new_id, now_iso
from models.admin import GoogleSheetsConfigBody
from services.subscription_service import ensure_subscription

router = APIRouter(tags=["billing"])

async def rid_for(user):
    rid=user.get("restaurant_id")
    if not rid: raise HTTPException(403,"Restaurant account required")
    return rid

@router.get("/billing")
async def billing(user: dict=Depends(get_current_user)):
    rid=await rid_for(user); return {"subscription":await ensure_subscription(rid),"payments":clean_list(await db.payments.find({"restaurant_id":rid},NO_ID).sort("paid_at",-1).to_list(50))}

@router.get("/google-sheets/config")
async def sheets_config(rid: str=Depends(get_current_restaurant_id)):
    item=clean(await db.google_sheet_connections.find_one({"restaurant_id":rid},NO_ID)) or {}
    return {"spreadsheet_id":item.get("spreadsheet_id",""),"google_client_id":item.get("google_client_id",""),"google_client_secret_masked":"••••" if item.get("google_client_secret") else "","status":item.get("status","NOT_CONFIGURED"),"tabs":["Orders","Customers","Order Items","Messages","Daily Summary"],"callback_url":"/api/oauth/sheets/callback"}

@router.put("/google-sheets/config")
async def update_sheets(body: GoogleSheetsConfigBody,rid:str=Depends(get_current_restaurant_id)):
    data={"spreadsheet_id":body.spreadsheet_id,"google_client_id":body.google_client_id,"status":"READY_FOR_OAUTH" if body.google_client_id and body.spreadsheet_id else "NOT_CONFIGURED","updated_at":now_iso()}
    if body.google_client_secret: data["google_client_secret"]=body.google_client_secret
    await db.google_sheet_connections.update_one({"restaurant_id":rid},{"$set":data,"$setOnInsert":{"id":new_id(),"restaurant_id":rid,"created_at":now_iso()}},upsert=True); item=clean(await db.google_sheet_connections.find_one({"restaurant_id":rid},NO_ID)) or {}; return {"spreadsheet_id":item.get("spreadsheet_id",""),"google_client_id":item.get("google_client_id",""),"google_client_secret_masked":"••••" if item.get("google_client_secret") else "","status":item.get("status","NOT_CONFIGURED"),"tabs":["Orders","Customers","Order Items","Messages","Daily Summary"],"callback_url":"/api/oauth/sheets/callback"}

@router.get("/google-sheets/jobs")
async def sheet_jobs(rid:str=Depends(get_current_restaurant_id)):
    return clean_list(await db.google_sync_jobs.find({"restaurant_id":rid},NO_ID).sort("created_at",-1).to_list(50))