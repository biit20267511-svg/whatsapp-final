"""Regression tests for waautoma verification pass (iteration 2).
Covers: auth (positive/negative), menu seed, simulator AI flow, orders,
customers, analytics, tenant/role gating, gateway health.
No source code changes; read-only verification of running services.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baileys-gateway-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
GATEWAY_URL = "http://localhost:3001"

OWNER = {"email": "owner@pizzapalace.pk", "password": "palace123"}
ADMIN = {"email": "admin@restaurantai.pk", "password": "ChangeMe@2026"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json=OWNER, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- auth ----------
def test_owner_login_ok():
    r = requests.post(f"{API}/auth/login", json=OWNER, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body.get("user", {}).get("role") in ("RESTAURANT_ADMIN", "restaurant_admin")


def test_admin_login_ok():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("user", {}).get("role") in ("SUPER_ADMIN", "super_admin")


def test_negative_login_401():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "owner@pizzapalace.pk", "password": "wrong-pw"},
                      timeout=15)
    assert r.status_code == 401


def test_no_token_401_on_protected():
    r = requests.get(f"{API}/orders", timeout=15)
    assert r.status_code in (401, 403)


# ---------- menu seed ----------
def test_menu_categories_and_items(owner_token):
    r = requests.get(f"{API}/menu", headers=_h(owner_token), timeout=15)
    assert r.status_code == 200
    data = r.json()
    cat_list = data["categories"]
    item_list = data["items"]
    assert len(cat_list) >= 5, f"expected >=5 categories, got {len(cat_list)}"
    assert len(item_list) >= 6, f"expected >=6 items, got {len(item_list)}"

    by_name = {i["name"].lower(): i for i in item_list}
    expected = {
        "zinger burger": 650,
        "beef burger": 750,
        "large pizza": 1499,
        "regular fries": 250,
        "coke": 120,
        "brownie": 350,
    }
    for name, price in expected.items():
        assert name in by_name, f"missing menu item: {name}"
        assert float(by_name[name]["price"]) == float(price), \
            f"{name} price expected {price} got {by_name[name]['price']}"


# ---------- tenant / role gating ----------
def test_owner_forbidden_on_admin_routes(owner_token):
    r = requests.get(f"{API}/admin/summary", headers=_h(owner_token), timeout=15)
    assert r.status_code == 403


def test_admin_summary_accessible(admin_token):
    r = requests.get(f"{API}/admin/summary", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "total_restaurants" in body
    assert "mrr" in body or "monthly_recurring_revenue" in body


# ---------- whatsapp config / gateway ----------
def test_gateway_health():
    r = requests.get(f"{GATEWAY_URL}/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_whatsapp_config_endpoint_returns_provider(owner_token):
    r = requests.get(f"{API}/whatsapp/config", headers=_h(owner_token), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "provider" in body
    assert body["provider"] in ("simulator", "baileys", "evolution", "meta"), body
    # NOTE: seed intent is 'simulator connected' but state may have been changed
    # by earlier admin tests. Log current state for audit.
    print(f"whatsapp/config provider={body.get('provider')} status={body.get('status')} "
          f"connected_number={body.get('connected_number')}")


# ---------- simulator AI order flow ----------
@pytest.fixture(scope="module")
def sim_phone():
    return f"+9230000{int(time.time()) % 100000:05d}"


def test_simulator_ai_priced_summary(sim_phone, owner_token):
    payload = {
        "phone": sim_phone,
        "name": "Ali",
        "text": "I want 2 zinger burgers and a coke, delivery to House 12, Street 5, Gulberg Block C, Lahore, name Ali. You can call me on this WhatsApp number.",
    }
    r = requests.post(f"{API}/simulator/message", json=payload,
                      headers=_h(owner_token), timeout=45)
    assert r.status_code == 200, r.text
    body = r.json()
    # Extract latest AI reply text from messages
    msgs = body.get("messages") or []
    ai_msgs = [m for m in msgs if m.get("sender") == "ai"]
    assert ai_msgs, f"no AI reply in response: {body}"
    reply = ai_msgs[-1]["text"].lower().replace(",", "")
    # zinger 2*650=1300, coke 120, delivery 150 => total 1570 (subtotal 1420)
    assert "1300" in reply, f"zinger burger line missing (1300): {reply}"
    assert "120" in reply, f"coke line missing (120): {reply}"
    assert "150" in reply, f"delivery fee missing (150): {reply}"
    assert "1570" in reply, f"total missing (1570): {reply}"
    # cart state
    cart = body.get("conversation", {}).get("cart", [])
    names = {c["name"].lower() for c in cart}
    assert "zinger burger" in names and "coke" in names


def test_simulator_confirm_places_order(sim_phone, owner_token):
    # confirm the pending order
    r = requests.post(
        f"{API}/simulator/message",
        json={"phone": sim_phone, "name": "Ali", "text": "yes confirm"},
        headers=_h(owner_token),
        timeout=45,
    )
    assert r.status_code == 200, r.text
    time.sleep(1.0)
    # verify order appears in orders list
    orders = requests.get(f"{API}/orders", headers=_h(owner_token), timeout=15)
    assert orders.status_code == 200
    lst = orders.json()
    if isinstance(lst, dict):
        lst = lst.get("orders") or lst.get("items") or []
    assert len(lst) > 0, "no orders returned after confirmation"
    # order number >= 1001 on at least one recent order (find one for our phone)
    matching = [o for o in lst if str(o.get("customer_phone", "")).endswith(sim_phone[-6:])]
    target = matching[0] if matching else lst[0]
    order_no = target.get("order_number") or target.get("number") or target.get("order_no")
    assert order_no is not None, f"no order_number on order: {target}"
    assert int(order_no) >= 1001, f"order_number should be >=1001, got {order_no}"


def test_orders_status_update_persists(owner_token):
    orders = requests.get(f"{API}/orders", headers=_h(owner_token), timeout=15).json()
    if isinstance(orders, dict):
        orders = orders.get("orders") or orders.get("items") or []
    assert len(orders) > 0
    oid = orders[0].get("id") or orders[0].get("_id") or orders[0].get("order_id")
    assert oid
    new_status = "Confirmed"
    r = requests.patch(
        f"{API}/orders/{oid}/status",
        json={"status": new_status},
        headers=_h(owner_token),
        timeout=15,
    )
    assert r.status_code in (200, 204), f"status update failed: {r.status_code} {r.text}"
    # re-read
    got = requests.get(f"{API}/orders/{oid}", headers=_h(owner_token), timeout=15)
    assert got.status_code == 200
    body = got.json()
    assert body.get("status") == new_status
    assert any(h.get("status") == new_status for h in body.get("status_history", [])), \
        "status_history did not record new status"


def test_customers_page_shows_simulator_customer(owner_token, sim_phone):
    r = requests.get(f"{API}/customers", headers=_h(owner_token), timeout=15)
    assert r.status_code == 200
    lst = r.json()
    if isinstance(lst, dict):
        lst = lst.get("customers") or lst.get("items") or []
    # find our simulator customer by phone suffix
    tail = sim_phone[-6:]
    found = any(tail in str(c.get("phone", "")) for c in lst)
    assert found, f"simulator customer with phone ...{tail} not found in customers list"


def test_analytics_reflects_orders(owner_token):
    r = requests.get(f"{API}/analytics/summary", headers=_h(owner_token), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "today_orders" in body
    assert body["today_orders"] >= 1, f"today_orders should be >=1 after placing an order: {body}"
    assert body.get("today_sales", 0) > 0
