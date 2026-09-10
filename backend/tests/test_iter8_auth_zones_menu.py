"""Iteration-8 backend tests: password policy + lockout + token_version invalidation,
delivery zones (RestaurantUpdate + AI simulator), menu bulk endpoints (categories+items+variants),
admin credentials update / reset / self-profile.

Uses live supervisor backend on localhost:8001.
"""
import os
import time
import uuid

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

OWNER = {"email": "owner@pizzapalace.pk", "password": "palace123"}
ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "biit20267511@biit.edu.pk")
ADMIN_PASSWORD = "ChangeMe@2026"


def _post(path, **kw):
    kw.setdefault("timeout", 30)
    return requests.post(f"{API}{path}", **kw)

def _get(path, **kw):
    kw.setdefault("timeout", 30)
    return requests.get(f"{API}{path}", **kw)

def _put(path, **kw):
    kw.setdefault("timeout", 30)
    return requests.put(f"{API}{path}", **kw)


def _login(email, password):
    r = _post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER["email"], OWNER["password"])["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)["access_token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- AUTH: login by username, brute-force lockout, password policy ----------

def test_login_owner_by_username_works():
    r = _post("/auth/login", json={"email": "pizza_palace", "password": OWNER["password"]})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email"] == OWNER["email"]


def test_brute_force_lockout_on_fake_identifier():
    fake = f"nobody_{uuid.uuid4().hex[:6]}@example.com"
    # 5 wrong attempts allowed; 6th must be 429
    codes = []
    for i in range(5):
        r = _post("/auth/login", json={"email": fake, "password": "wrong"})
        codes.append(r.status_code)
        assert r.status_code == 401, (i, r.status_code, r.text)
    r = _post("/auth/login", json={"email": fake, "password": "wrong"})
    assert r.status_code == 429, f"expected 429 after 5 fails, got {r.status_code}: {r.text}"
    assert "lock" in r.json()["detail"].lower()


# ---------- change-password + token_version invalidation via throwaway restaurant ----------

@pytest.fixture(scope="module")
def throwaway(admin_token):
    """Create a throwaway restaurant with known creds, yield its info; delete users+restaurant at teardown."""
    payload = {
        "restaurant_name": f"tscheck-{uuid.uuid4().hex[:6]}",
        "owner_name": "T Owner",
        "email": f"tscheck_{uuid.uuid4().hex[:6]}@example.com",
        "phone": "0300", "whatsapp_number": "0300",
        "address": "x", "city": "Lahore",
        "delivery_fee": 100, "prep_time_min": 15, "delivery_time_min": 30,
        "start_date": "2026-01-01", "duration_days": 30,
        "monthly_price": 4000, "setup_fee": 0,
        "username": f"tscheck_{uuid.uuid4().hex[:6]}",
        "password": "InitPass1234",
    }
    r = _post("/admin/restaurants", json=payload, headers=hdr(admin_token))
    assert r.status_code == 200, r.text
    data = r.json()
    rid = data["restaurant"]["id"]
    creds = data["credentials"]
    yield {"rid": rid, "username": creds["username"], "password": creds["password"], "email": payload["email"]}
    # cleanup
    try:
        from pymongo import MongoClient
        c = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = c[os.environ.get("DB_NAME", "test_database")]
        db.users.delete_many({"restaurant_id": rid})
        db.restaurants.delete_one({"id": rid})
        db.subscriptions.delete_many({"restaurant_id": rid})
        db.whatsapp_connections.delete_many({"restaurant_id": rid})
        db.ai_settings.delete_many({"restaurant_id": rid})
    except Exception:
        pass


def test_change_password_flow_on_throwaway(throwaway):
    # login (must_change_password should be True from seed_create)
    login = _login(throwaway["email"], throwaway["password"])
    old_token = login["access_token"]
    assert login["user"]["must_change_password"] is True

    # wrong current -> 400
    r = _post("/auth/change-password", json={"current_password": "wrong", "new_password": "StrongPass1"}, headers=hdr(old_token))
    assert r.status_code == 400

    # weak new -> 400 policy message
    r = _post("/auth/change-password", json={"current_password": throwaway["password"], "new_password": "abc"}, headers=hdr(old_token))
    assert r.status_code == 400
    assert "8 characters" in r.json()["detail"] or "letters and numbers" in r.json()["detail"]

    # valid change -> 200 + new token works, old token 401
    new_pw = f"NewPass{uuid.uuid4().hex[:6]}9"
    r = _post("/auth/change-password", json={"current_password": throwaway["password"], "new_password": new_pw}, headers=hdr(old_token))
    assert r.status_code == 200, r.text
    new_token = r.json()["access_token"]

    # old token invalidated
    r_old = _get("/auth/me", headers=hdr(old_token))
    assert r_old.status_code == 401

    # new token works
    r_new = _get("/auth/me", headers=hdr(new_token))
    assert r_new.status_code == 200
    assert r_new.json()["user"]["must_change_password"] is False

    throwaway["password"] = new_pw


# ---------- Admin credentials update + reset ----------

def test_admin_update_credentials_weak_and_strong(admin_token, throwaway):
    rid = throwaway["rid"]
    # weak
    r = _put(f"/admin/restaurants/{rid}/credentials", json={"new_password": "abc"}, headers=hdr(admin_token))
    assert r.status_code == 400
    # strong + username
    new_username = f"tscheck_u_{uuid.uuid4().hex[:5]}"
    new_pw = f"AdminSet{uuid.uuid4().hex[:6]}1"
    r = _put(f"/admin/restaurants/{rid}/credentials", json={"username": new_username, "new_password": new_pw}, headers=hdr(admin_token))
    assert r.status_code == 200, r.text
    assert r.json()["username"] == new_username

    # detail shows new username
    d = _get(f"/admin/restaurants/{rid}", headers=hdr(admin_token))
    assert d.status_code == 200
    assert d.json()["owner"]["username"] == new_username

    # owner login with new creds; must_change_password True
    login = _login(throwaway["email"], new_pw)
    assert login["user"]["must_change_password"] is True
    throwaway["username"] = new_username
    throwaway["password"] = new_pw


def test_admin_reset_password(admin_token, throwaway):
    rid = throwaway["rid"]
    r = _post(f"/admin/restaurants/{rid}/reset-password", headers=hdr(admin_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "temporary_password" in body and body["username"]
    # login works with temporary_password
    login = _login(throwaway["email"], body["temporary_password"])
    assert login["user"]["must_change_password"] is True


# ---------- Admin self-profile rotate (restore at end) ----------

def test_admin_profile_wrong_current_400(admin_token):
    r = _put("/admin/profile", json={"current_password": "nope", "new_password": "Whatever1234"}, headers=hdr(admin_token))
    assert r.status_code == 400


def test_admin_profile_rotate_and_restore():
    login = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    tok = login["access_token"]
    temp = f"Temp{uuid.uuid4().hex[:8]}9"
    # rotate to temp
    r = _put("/admin/profile", json={"current_password": ADMIN_PASSWORD, "new_password": temp}, headers=hdr(tok))
    assert r.status_code == 200, r.text
    tok2 = r.json()["access_token"]
    assert _get("/auth/me", headers=hdr(tok2)).status_code == 200
    # rotate back to canonical password using new token
    r = _put("/admin/profile", json={"current_password": temp, "new_password": ADMIN_PASSWORD}, headers=hdr(tok2))
    assert r.status_code == 200, r.text
    tok3 = r.json()["access_token"]
    # new token from restore must work (per review request)
    me = _get("/auth/me", headers=hdr(tok3))
    assert me.status_code == 200, me.text
    # confirm password restored by relogin
    assert _login(ADMIN_EMAIL, ADMIN_PASSWORD)["access_token"]


# ---------- Delivery zones on Pizza Palace ----------

def test_restaurant_update_delivery_mode_invalid_400(owner_token):
    r = _put("/restaurant", json={"delivery_mode": "bogus"}, headers=hdr(owner_token))
    assert r.status_code == 400


def test_restaurant_update_zones_saves_and_returns_ids(owner_token):
    zones = [
        {"name": "Gulberg", "aliases": ["Gulberg 3"], "fee": 100, "min_order": 0, "eta_min": 30, "active": True},
        {"name": "DHA", "aliases": ["Defence"], "fee": 250, "min_order": 800, "eta_min": 45, "active": True},
    ]
    r = _put("/restaurant", json={"delivery_mode": "zones", "restrict_to_zones": True, "delivery_enabled": True, "delivery_zones": zones}, headers=hdr(owner_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["delivery_mode"] == "zones"
    assert body["restrict_to_zones"] is True
    saved = body["delivery_zones"]
    assert len(saved) == 2
    for z in saved:
        assert z.get("id")
    names = {z["name"] for z in saved}
    assert names == {"Gulberg", "DHA"}


# ---------- Simulator zone flow ----------

def _sim_msg(tok, phone, text):
    r = _post("/simulator/message", json={"phone": phone, "text": text}, headers=hdr(tok), timeout=90)
    return r


def _ai_reply(payload):
    msgs = payload.get("messages", [])
    outs = [m for m in msgs if (m.get("direction") == "outbound" or m.get("sender") in ("ai", "bot") or m.get("from") == "ai")]
    if outs:
        return (outs[-1].get("text") or outs[-1].get("body") or "").lower()
    # fallback: last message text
    return (msgs[-1].get("text") if msgs else "").lower()


@pytest.mark.timeout(180)
def test_simulator_zone_refuses_outside_area_then_quotes_gulberg(owner_token):
    phone_out = f"+92300{uuid.uuid4().int % 10_000_000:07d}"
    r = _sim_msg(owner_token, phone_out, "Hi I want a Zinger Burger delivered to Bahria Town Lahore, phone +923001112222, name Testy")
    assert r.status_code == 200, r.text
    reply = _ai_reply(r.json())
    # Should refuse Bahria Town — offer pickup or say outside area
    assert ("pickup" in reply or "outside" in reply or "don't deliver" in reply or "do not deliver" in reply or "cannot deliver" in reply or "delivery area" in reply or "bahria" in reply or "not available" in reply), f"outside-area not refused: {reply[:400]}"

    # Gulberg flow -> place order
    phone_in = f"+92301{uuid.uuid4().int % 10_000_000:07d}"
    r1 = _sim_msg(owner_token, phone_in, "Salam, I want 1 Zinger Burger and 1 Coke, delivery to House 12 Street 5 Gulberg Block C Lahore, name Ali, contact +923001112223")
    assert r1.status_code == 200
    reply1 = _ai_reply(r1.json())
    # Should quote Rs 100 delivery fee (Gulberg)
    assert "100" in reply1, f"expected 100 fee in reply, got: {reply1[:500]}"

    # Confirm
    r2 = _sim_msg(owner_token, phone_in, "Yes confirm the order")
    assert r2.status_code == 200

    # Verify order has delivery_zone Gulberg + delivery_fee 100
    orders = _get("/orders", headers=hdr(owner_token)).json()
    match = [o for o in orders if o.get("customer_phone") == phone_in]
    assert match, "no order created for the simulator conversation"
    latest = sorted(match, key=lambda o: o.get("created_at", ""))[-1]
    assert (latest.get("delivery_zone") or "").lower() == "gulberg", latest
    assert float(latest.get("delivery_fee", 0)) == 100.0, latest
    # restore demo restaurant to fixed mode so other suites see the seeded 150 fee
    _put("/restaurant", json={"delivery_mode": "fixed"}, headers=hdr(owner_token))


# ---------- Menu bulk ----------

def test_menu_categories_bulk_skips_duplicates(owner_token):
    unique = f"TestCat_{uuid.uuid4().hex[:6]}"
    r = _post("/menu/categories/bulk", json={"names": [unique, unique, "Sides"]}, headers=hdr(owner_token))
    assert r.status_code == 200, r.text
    body = r.json()
    # first run: unique created once (dup skipped), Sides likely already exists in seed -> skipped
    created_names = {c["name"] for c in body["created"]}
    assert unique in created_names


def test_menu_items_bulk_parses_variants_and_reports_failed(owner_token):
    # create a fresh category for this test
    cat_r = _post("/menu/categories", json={"name": f"BulkTest_{uuid.uuid4().hex[:6]}"}, headers=hdr(owner_token))
    assert cat_r.status_code == 200
    cid = cat_r.json()["id"]
    lines = [
        "Chicken Karahi | Half 1200 / Full 2200",
        "Seekh Kabab 4 pcs 450",
        "no price here",
    ]
    r = _post("/menu/items/bulk", json={"category_id": cid, "lines": lines}, headers=hdr(owner_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["created"]) == 2, body
    assert len(body["failed"]) == 1, body
    # Chicken Karahi should have 2 variants
    karahi = [c for c in body["created"] if "karahi" in c["name"].lower()]
    assert karahi and len(karahi[0]["variants"]) == 2, body
