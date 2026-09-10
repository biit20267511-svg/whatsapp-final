"""Controlled AI ordering: the model can phrase and classify, while tools own all business mutations."""
import json
import logging
import os
from datetime import datetime, timezone

import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage

from database import NO_ID, db
from services import order_service

logger = logging.getLogger(__name__)
FALLBACK = "Sorry, I'm having a little trouble right now. Please try again or ask our team for help."
BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
GEMINI_DEFAULT_MODEL = "gemini-3-flash-preview"


def resolve_llm(ai_settings: dict) -> tuple[str, str, str]:
    """Returns (provider, api_key, model). Tenant key wins; platform env key is the fallback."""
    provider = (ai_settings.get("provider") or "tabiai").lower()
    tenant_key = (ai_settings.get("api_key") or "").strip()
    model = (ai_settings.get("model") or "").strip()
    if provider == "gemini":
        if not model or not model.startswith("gemini"):
            model = os.environ.get("AI_MODEL", GEMINI_DEFAULT_MODEL)
        return "gemini", tenant_key or os.environ.get("EMERGENT_LLM_KEY", ""), model
    if not model or model.startswith("gemini"):
        model = os.environ.get("TABIAI_MODEL", "claude-opus-5")
    return "tabiai", tenant_key or os.environ.get("TABIAI_API_KEY", ""), model
TOOLS = [{"type": "function", "function": {"name": "add_to_cart", "description": "Add a menu item by name. If the item has sizes/variants (e.g. Half/Full, Small/Large) pass the chosen variant; pass chosen add-ons by name.",
          "parameters": {"type": "object", "properties": {"item_name": {"type": "string"}, "quantity": {"type": "integer"}, "variant": {"type": "string", "description": "Variant/size name exactly as listed in the menu"}, "addons": {"type": "array", "items": {"type": "string"}, "description": "Add-on names exactly as listed in the menu"}}, "required": ["item_name"]}}},
         {"type": "function", "function": {"name": "remove_from_cart", "description": "Remove an item by name.", "parameters": {"type": "object", "properties": {"item_name": {"type": "string"}}, "required": ["item_name"]}}},
         {"type": "function", "function": {"name": "calculate_cart", "description": "Calculate the current cart.", "parameters": {"type": "object", "properties": {}}}},
         {"type": "function", "function": {"name": "set_order_type", "description": "Set delivery or pickup.", "parameters": {"type": "object", "properties": {"order_type": {"type": "string", "enum": ["delivery", "pickup"]}}, "required": ["order_type"]}}},
         {"type": "function", "function": {"name": "check_delivery_area", "description": "Check whether we deliver to an area/locality and get its delivery charges. Call as soon as the customer mentions their area or address for delivery.", "parameters": {"type": "object", "properties": {"area": {"type": "string", "description": "Area, locality, block, or full address text the customer gave"}}, "required": ["area"]}}},
         {"type": "function", "function": {"name": "set_customer_details", "description": "Save customer name, delivery address, and an active contact number the rider can call.", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "address": {"type": "string", "description": "Complete address: house/flat number, street or block, area and city"}, "contact_number": {"type": "string", "description": "Active phone number for calls (may be their WhatsApp number if they confirm it is reachable)"}}}}},
         {"type": "function", "function": {"name": "create_order", "description": "Place an explicitly confirmed order.", "parameters": {"type": "object", "properties": {}}}},
         {"type": "function", "function": {"name": "get_order_status", "description": "Look up an order number.", "parameters": {"type": "object", "properties": {"order_number": {"type": "integer"}}, "required": ["order_number"]}}},
         {"type": "function", "function": {"name": "request_human_support", "description": "Hand this chat to staff.", "parameters": {"type": "object", "properties": {"reason": {"type": "string"}}}}},
         {"type": "function", "function": {"name": "book_reservation", "description": "Book a table reservation (only when the restaurant offers reservations).", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "party_size": {"type": "integer"}, "date": {"type": "string", "description": "YYYY-MM-DD"}, "time": {"type": "string", "description": "HH:MM 24-hour"}, "notes": {"type": "string", "description": "Special requests, e.g. window seat, birthday"}}, "required": ["party_size", "date", "time"]}}}]


def _item_line(i):
    variants = i.get("variants") or []
    addons = i.get("addons") or []
    price = " / ".join(f"{v['name']} {float(v['price']):.0f}" for v in variants) if variants else f"{float(i['price']):.0f}"
    extra = " [Add-ons: " + ", ".join(f"{a['name']} +{float(a['price']):.0f}" for a in addons) + "]" if addons else ""
    return f"- {i['name']} — {price} {i.get('description', '')}{extra}"


def _menu_text(categories, items):
    groups = {}
    for item in items:
        if item.get("available", True):
            groups.setdefault(item["category_id"], []).append(item)
    return "\n".join([f"### {category['name']}\n" + "\n".join(_item_line(i) for i in groups.get(category["id"], [])) for category in categories if groups.get(category["id"])]) or "(No menu configured)"


def _delivery_rules(restaurant):
    if restaurant.get("delivery_enabled") is False:
        return "DELIVERY: Not offered — only pickup. If asked, politely say we do not deliver and offer pickup."
    if order_service.zones_enabled(restaurant):
        zones = "; ".join(f"{z['name']} (charges {float(z.get('fee', 0)):.0f}" + (f", min order {float(z['min_order']):.0f}" if z.get("min_order") is not None else "") + ")" for z in order_service.active_zones(restaurant))
        outside = ("We do NOT deliver outside these areas: apologise politely, say the area is out of our delivery range, and offer pickup instead."
                   if restaurant.get("restrict_to_zones", True) else
                   f"For areas not listed, standard delivery charges of {float(restaurant.get('delivery_fee', 0)):.0f} apply.")
        return f"DELIVERY AREAS & CHARGES (zone-wise): {zones}. As soon as the customer mentions an area/address for delivery, call check_delivery_area and tell them the charges for their area. {outside} Never guess delivery charges — always use the tool result."
    areas = restaurant.get("delivery_areas")
    return f"DELIVERY: Flat delivery charges {float(restaurant.get('delivery_fee', 0)):.0f}." + (f" We deliver in: {areas}." if areas else "")


def _system_prompt(restaurant, settings, conversation, customer, categories, items, recent):
    history = "\n".join(f"{'Customer' if m['direction'] == 'in' else 'You'}: {m['text']}" for m in recent[-8:])
    today = datetime.now(timezone.utc).date().isoformat()
    reservations_rule = (
        f"RESERVATIONS: This restaurant accepts table reservations. To book, collect guest name, party size, date and time, then call book_reservation (convert dates to YYYY-MM-DD and time to HH:MM 24-hour; today is {today})."
        if restaurant.get("reservations_enabled")
        else "RESERVATIONS: Not offered — if asked, politely say we do not take table reservations; offer delivery or pickup instead."
    )
    return f"""You are the short, warm WhatsApp ordering assistant for {restaurant['name']}.
Personality: {settings.get('personality') or 'friendly restaurant receptionist'}. {settings.get('language_behavior') or 'Reply in the customer language: English, Urdu script, or Roman Urdu.'}
Only use the configured menu and call tools for every cart, detail, total, and order action. Never invent prices.
Items with sizes (Half/Full, Small/Large etc.) MUST have a variant chosen — ask which size if the customer did not say. Offer listed add-ons only.
Use WhatsApp formatting only: bold text uses one asterisk on each side (*bold*), never Markdown double asterisks (**bold**).
When the customer explicitly confirms a complete summary, call create_order immediately.
For delivery collect a name and a COMPLETE address — it must include a house/flat number, street or block, area AND city. If any part is missing, politely ask for the missing part before confirming.
Also ask for an active contact number the rider/staff can call. If the customer says this WhatsApp number is reachable for calls, save it via set_customer_details as contact_number. Do not repeat the question once a contact number is saved.
For pickup collect a name and an active contact number.
{_delivery_rules(restaurant)}
{reservations_rule}
MENU:\n{_menu_text(categories, items)}
CART: {conversation.get('cart', [])}\nORDER TYPE: {conversation.get('order_type') or 'not set'}\nDELIVERY AREA: {conversation.get('delivery_zone_name') or 'not set'}\nCUSTOMER: {conversation.get('customer_name') or customer.get('name') or 'unknown'}\nADDRESS: {conversation.get('address') or 'not provided'}\nCONTACT NUMBER: {conversation.get('contact_number') or 'not provided'}
RECENT:\n{history or '(first message)'}"""


def _address_complete(address: str) -> bool:
    text = (address or "").strip()
    return any(ch.isdigit() for ch in text) and len(text.split()) >= 3


async def _check_delivery_area(restaurant, conversation, area_text):
    if restaurant.get("delivery_enabled") is False:
        return {"error": "delivery_not_offered", "hint": "we only offer pickup"}
    if not order_service.zones_enabled(restaurant):
        return {"ok": True, "deliverable": True, "delivery_fee": float(restaurant.get("delivery_fee", 0)), "note": "flat delivery charges apply"}
    zone = order_service.find_zone(restaurant, area_text)
    if zone:
        conversation["delivery_zone_id"], conversation["delivery_zone_name"] = zone["id"], zone["name"]
        await db.conversations.update_one({"id": conversation["id"]}, {"$set": {"delivery_zone_id": zone["id"], "delivery_zone_name": zone["name"]}})
        result = {"ok": True, "deliverable": True, "zone": zone["name"], "delivery_fee": float(zone.get("fee", 0))}
        if zone.get("min_order") is not None:
            result["min_order"] = float(zone["min_order"])
        if zone.get("eta_min"):
            result["delivery_time_min"] = int(zone["eta_min"])
        return result
    zones = [z["name"] for z in order_service.active_zones(restaurant)]
    if restaurant.get("restrict_to_zones", True):
        await db.conversations.update_one({"id": conversation["id"]}, {"$set": {"delivery_zone_id": None, "delivery_zone_name": None}})
        return {"error": "outside_delivery_area", "deliverable": False, "area": area_text, "we_deliver_to": zones, "hint": "apologise, say we do not deliver there, list our delivery areas briefly and offer pickup"}
    await db.conversations.update_one({"id": conversation["id"]}, {"$set": {"delivery_zone_id": None, "delivery_zone_name": "Other area"}})
    return {"ok": True, "deliverable": True, "zone": None, "delivery_fee": float(restaurant.get("delivery_fee", 0)), "note": "area not in zone list — standard charges apply"}


async def _dispatch(name, args, restaurant, items, conversation_id, customer):
    conversation = await db.conversations.find_one({"id": conversation_id}, NO_ID)
    cart = conversation.get("cart", [])
    zone = lambda: order_service.conversation_zone(restaurant, conversation)
    totals = lambda: order_service.compute_totals(restaurant, cart, conversation.get("order_type"), zone())
    if name == "add_to_cart":
        item = order_service.match_menu_item(items, args.get("item_name", ""))
        if not item or not item.get("available", True):
            return {"error": "item_not_found", "available_items": [i["name"] for i in items if i.get("available", True)]}
        variant, options = order_service.match_variant(item, args.get("variant"))
        if options:
            return {"error": "variant_required", "item": item["name"], "options": options, "hint": "ask the customer which size/variant they want"}
        addons, unknown = order_service.match_addons(item, args.get("addons"))
        if unknown:
            return {"error": "addon_not_found", "unknown": unknown, "available_addons": [a["name"] for a in item.get("addons") or []]}
        unit_price = float(variant["price"] if variant else item["price"]) + sum(float(a["price"]) for a in addons)
        label = item["name"] + (f" ({variant['name']})" if variant else "") + (f" + {', '.join(a['name'] for a in addons)}" if addons else "")
        quantity = max(1, int(args.get("quantity", 1) or 1))
        existing = next((c for c in cart if c["item_id"] == item["id"] and c.get("name") == label), None)
        if existing:
            existing["qty"] += quantity
        else:
            cart.append({"item_id": item["id"], "name": label, "variant": variant["name"] if variant else None, "addons": [a["name"] for a in addons], "unit_price": round(unit_price, 2), "qty": quantity})
        await db.conversations.update_one({"id": conversation_id}, {"$set": {"cart": cart, "state": "SELECTING_ITEMS"}})
        return {"ok": True, "cart": cart, "totals": totals()}
    if name == "remove_from_cart":
        item = order_service.match_menu_item(items, args.get("item_name", ""))
        cart = [c for c in cart if not item or c["item_id"] != item["id"]]
        await db.conversations.update_one({"id": conversation_id}, {"$set": {"cart": cart}})
        return {"ok": True, "cart": cart, "totals": totals()}
    if name == "calculate_cart":
        return {"cart": cart, "totals": totals()}
    if name == "set_order_type":
        order_type = args.get("order_type")
        if order_type == "delivery" and restaurant.get("delivery_enabled") is False:
            return {"error": "delivery_not_offered", "hint": "we only offer pickup"}
        conversation["order_type"] = order_type
        await db.conversations.update_one({"id": conversation_id}, {"$set": {"order_type": order_type}})
        return {"ok": True, "order_type": order_type, "totals": totals()}
    if name == "check_delivery_area":
        return await _check_delivery_area(restaurant, conversation, args.get("area", ""))
    if name == "set_customer_details":
        updates = {k: args[k] for k in ("name", "address", "contact_number") if args.get(k)}
        error = None
        if "address" in updates and not _address_complete(updates["address"]):
            updates.pop("address")
            error = {"error": "address_incomplete", "required": "house/flat number, street or block, area and city — ask the customer for the missing parts"}
        zone_info = None
        if "address" in updates and order_service.zones_enabled(restaurant) and not conversation.get("delivery_zone_id"):
            zone_info = await _check_delivery_area(restaurant, conversation, updates["address"])
            if zone_info.get("error") == "outside_delivery_area":
                return zone_info
        if updates:
            if "name" in updates:
                conversation["customer_name"] = updates["name"]
                await db.customers.update_one({"id": customer["id"]}, {"$set": {"name": updates["name"]}})
            await db.conversations.update_one({"id": conversation_id}, {"$set": {"customer_name": conversation.get("customer_name", ""), **updates}})
        return error or {"ok": True, **updates, **({"delivery": zone_info} if zone_info else {})}
    if name == "create_order":
        if not cart or not conversation.get("order_type"):
            return {"error": "missing_order_details"}
        if conversation["order_type"] == "delivery" and not _address_complete(conversation.get("address") or ""):
            return {"error": "address_incomplete", "required": "house/flat number, street or block, area and city"}
        if conversation["order_type"] == "delivery" and order_service.zones_enabled(restaurant) and not zone():
            check = await _check_delivery_area(restaurant, conversation, conversation.get("address") or "")
            if check.get("error"):
                return {**check, "hint": "ask the customer which area they are in, or offer pickup"}
        if not (conversation.get("customer_name") or customer.get("name")):
            return {"error": "name_missing"}
        minimum = order_service.min_order_for(restaurant, zone() if conversation["order_type"] == "delivery" else None)
        if totals()["subtotal"] < minimum:
            return {"error": "below_minimum", "minimum": minimum}
        recent = await db.orders.find_one({"conversation_id": conversation_id}, NO_ID, sort=[("created_at", -1)])
        if recent:
            try:
                age = (datetime.now(timezone.utc) - datetime.fromisoformat(recent["created_at"])).total_seconds()
            except Exception:
                age = None
            same_items = sorted((i["item_id"], int(i["qty"])) for i in recent.get("items", [])) == sorted((c["item_id"], int(c["qty"])) for c in cart)
            if age is not None and age < 120 and same_items:
                return {"ok": True, "duplicate_prevented": True, "order_number": recent["order_number"], "total": recent["total"],
                        "note": "This exact order was already placed moments ago. Do NOT place it again — tell the customer their order is already confirmed with this order number."}
        order = await order_service.create_order(restaurant=restaurant, conversation=conversation, customer=customer)
        await db.conversations.update_one({"id": conversation_id}, {"$set": {"cart": [], "state": "ORDER_PLACED", "last_order_number": order["order_number"], "last_order_id": order["id"]}})
        return {"_order_created": True, "order": order, "order_number": order["order_number"], "total": order["total"]}
    if name == "get_order_status":
        order = await db.orders.find_one({"restaurant_id": restaurant["id"], "order_number": int(args.get("order_number", 0))}, NO_ID)
        return {"order_number": order["order_number"], "status": order["status"], "total": order["total"]} if order else {"error": "order_not_found"}
    if name == "request_human_support":
        await db.conversations.update_one({"id": conversation_id}, {"$set": {"ai_active": False, "state": "HUMAN_HANDOFF"}})
        return {"ok": True, "handoff": True}
    if name == "book_reservation":
        if not restaurant.get("reservations_enabled"):
            return {"error": "reservations_not_offered", "hint": "politely explain we do not take table reservations; offer delivery or pickup"}
        party = int(args.get("party_size") or 0)
        res_date, res_time = (args.get("date") or "").strip(), (args.get("time") or "").strip()
        guest = (args.get("name") or conversation.get("customer_name") or customer.get("name") or "").strip()
        if party < 1 or not res_date or not res_time:
            return {"error": "missing_reservation_details", "required": "party_size, date (YYYY-MM-DD) and time (HH:MM)"}
        if not guest:
            return {"error": "name_missing"}
        from services import reservation_service
        reservation = await reservation_service.create_reservation(restaurant=restaurant, conversation=conversation, customer=customer, name=guest, party_size=party, date=res_date, time=res_time, notes=(args.get("notes") or "").strip())
        return {"ok": True, "reservation_number": reservation["reservation_number"], "date": res_date, "time": res_time, "party_size": party, "name": guest}
    return {"error": "unknown_tool"}


async def _tabiai_reply(*, api_key, model, system_prompt, incoming_text, restaurant, items, conversation_id, customer):
    base = (os.environ.get("TABIAI_BASE_URL") or "https://tabitoken.com/v1").rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "User-Agent": BROWSER_UA}
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": incoming_text}]
    created_order, content = None, ""
    async with httpx.AsyncClient(timeout=90) as http:
        for _ in range(7):
            resp = await http.post(f"{base}/chat/completions", headers=headers,
                                   json={"model": model, "messages": messages, "tools": TOOLS, "tool_choice": "auto", "max_tokens": 1024})
            resp.raise_for_status()
            message = resp.json()["choices"][0]["message"]
            content = (message.get("content") or "").strip()
            tool_calls = message.get("tool_calls") or []
            if not tool_calls:
                return content, created_order
            messages.append({"role": "assistant", "content": message.get("content") or "", "tool_calls": tool_calls})
            for tool_call in tool_calls:
                fn = tool_call.get("function", {})
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except Exception:
                    args = {}
                result = await _dispatch(fn.get("name"), args, restaurant, items, conversation_id, customer)
                if result.get("_order_created"):
                    created_order = result.pop("order")
                    result.pop("_order_created", None)
                messages.append({"role": "tool", "tool_call_id": tool_call.get("id"), "content": json.dumps(result, default=str)})
    return content, created_order


async def _gemini_reply(*, api_key, model, system_prompt, incoming_text, restaurant, items, conversation_id, customer):
    chat = (LlmChat(api_key=api_key, session_id=conversation_id, system_message=system_prompt)
            .with_model("gemini", model)
            .with_tools(TOOLS, tool_choice="auto"))
    response = await chat.send_message_with_tools(UserMessage(text=incoming_text))
    created_order = None
    for _ in range(6):
        if not getattr(response, "tool_calls", None):
            break
        for tool_call in response.tool_calls:
            try:
                args = tool_call.arguments if isinstance(tool_call.arguments, dict) else json.loads(tool_call.arguments or "{}")
            except Exception:
                args = {}
            result = await _dispatch(tool_call.name, args, restaurant, items, conversation_id, customer)
            if result.get("_order_created"):
                created_order = result.pop("order")
                result.pop("_order_created", None)
            chat.add_tool_result(tool_call.id, json.dumps(result, default=str))
        response = await chat.send_message_with_tools()
    return (response.content or "").strip(), created_order


async def generate_reply(*, restaurant, ai_settings, conversation, customer, categories, items, recent_messages, incoming_text):
    provider, api_key, model = resolve_llm(ai_settings)
    system_prompt = _system_prompt(restaurant, ai_settings, conversation, customer, categories, items, recent_messages)
    kwargs = dict(api_key=api_key, model=model, system_prompt=system_prompt, incoming_text=incoming_text,
                  restaurant=restaurant, items=items, conversation_id=conversation["id"], customer=customer)
    try:
        reply, created_order = await (_tabiai_reply(**kwargs) if provider == "tabiai" else _gemini_reply(**kwargs))
        return (reply or "Ji, main aap ki kya madad kar sakta hoon?"), created_order
    except Exception as exc:
        logger.exception("AI generate_reply failed (provider=%s model=%s): %s", provider, model, exc)
        return FALLBACK, None


async def test_connection(ai_settings: dict) -> dict:
    provider, api_key, model = resolve_llm(ai_settings)
    if not api_key:
        return {"ok": False, "provider": provider, "model": model, "detail": "No API key configured for this provider."}
    try:
        if provider == "tabiai":
            base = (os.environ.get("TABIAI_BASE_URL") or "https://tabitoken.com/v1").rstrip("/")
            async with httpx.AsyncClient(timeout=45) as http:
                resp = await http.post(f"{base}/chat/completions",
                                       headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "User-Agent": BROWSER_UA},
                                       json={"model": model, "messages": [{"role": "user", "content": "Reply with the single word: ok"}], "max_tokens": 10})
                resp.raise_for_status()
                reply = (resp.json()["choices"][0]["message"].get("content") or "").strip()
        else:
            chat = LlmChat(api_key=api_key, session_id="settings-test", system_message="You are a connection test.").with_model("gemini", model)
            reply = ((await chat.send_message(UserMessage(text="Reply with the single word: ok"))) or "").strip()
        return {"ok": True, "provider": provider, "model": model, "detail": reply[:80] or "connected"}
    except httpx.HTTPStatusError as exc:
        return {"ok": False, "provider": provider, "model": model, "detail": f"Provider returned {exc.response.status_code} — check API key and model name."}
    except Exception as exc:
        logger.warning("AI test_connection failed: %s", exc)
        return {"ok": False, "provider": provider, "model": model, "detail": "Connection failed — check API key, model name and network."}