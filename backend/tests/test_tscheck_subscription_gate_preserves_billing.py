"""Criterion: Restaurant subscription gate preserves billing access.

Creates its own tscheck restaurant (starts ACTIVE), verifies a protected dashboard
API works, then suspends the tenant via the admin API and verifies protected APIs
are blocked (402) while /billing stays reachable.
"""
import uuid
from datetime import date

from tests.helpers import SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, auth_headers, login


def _create_and_login_restaurant(client, admin_headers, suffix):
    r = client.post(
        "/admin/restaurants",
        headers=admin_headers,
        json={
            "restaurant_name": f"tscheck-gate-{suffix}",
            "owner_name": "TS Gate Owner",
            "email": f"tscheck-gate-{suffix}@example.com",
            "phone": "03000000002",
            "whatsapp_number": "03000000002",
            "address": "3 Test St",
            "city": "Islamabad",
            "delivery_fee": 100,
            "prep_time_min": 15,
            "delivery_time_min": 20,
            "monthly_price": 5000,
            "setup_fee": 0,
            "start_date": date.today().isoformat(),
            "duration_days": 30,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    rid = body["restaurant"]["id"]
    creds = body["credentials"]
    login_r = client.post("/auth/login", json={"email": creds["username"], "password": creds["password"]})
    assert login_r.status_code == 200, login_r.text
    return rid, login_r.json()["access_token"]


def test_active_restaurant_can_use_dashboard_apis(client):
    admin_token = login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    admin_headers = auth_headers(admin_token)
    rid, tenant_token = _create_and_login_restaurant(client, admin_headers, uuid.uuid4().hex[:8])

    r = client.get("/billing", headers=auth_headers(tenant_token))
    assert r.status_code == 200, r.text
    assert r.json()["subscription"]["status"] == "ACTIVE"

    orders = client.get("/orders", headers=auth_headers(tenant_token))
    assert orders.status_code == 200, orders.text


def test_suspended_tenant_blocked_from_protected_api_but_billing_accessible(client):
    admin_token = login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    admin_headers = auth_headers(admin_token)
    rid, tenant_token = _create_and_login_restaurant(client, admin_headers, uuid.uuid4().hex[:8])

    suspend = client.patch(f"/admin/restaurants/{rid}/status", headers=admin_headers, json={"status": "SUSPENDED"})
    assert suspend.status_code == 200, suspend.text

    tenant_headers = auth_headers(tenant_token)
    blocked = client.get("/orders", headers=tenant_headers)
    assert blocked.status_code == 402, blocked.text
    assert blocked.json()["detail"]["code"] == "SUBSCRIPTION_BLOCKED"

    still_billing = client.get("/billing", headers=tenant_headers)
    assert still_billing.status_code == 200, still_billing.text
    assert still_billing.json()["subscription"]["status"] == "SUSPENDED"
