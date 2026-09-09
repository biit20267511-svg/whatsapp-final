"""Criterion: Manual subscription management works.

Creates its own tscheck restaurant, then exercises Send Reminder (creates a
notification) and Payment Received (marks paid, extends expiry, restores ACTIVE).
"""
import uuid
from datetime import date

from tests.helpers import SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, auth_headers, login


def _create_restaurant(client, headers, suffix):
    r = client.post(
        "/admin/restaurants",
        headers=headers,
        json={
            "restaurant_name": f"tscheck-sub-{suffix}",
            "owner_name": "TS Sub Owner",
            "email": f"tscheck-sub-{suffix}@example.com",
            "phone": "03000000001",
            "whatsapp_number": "03000000001",
            "address": "2 Test St",
            "city": "Lahore",
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
    return r.json()["restaurant"]["id"]


def test_subscriptions_list_shows_status_expiry_price(client):
    token = login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    headers = auth_headers(token)
    rid = _create_restaurant(client, headers, uuid.uuid4().hex[:8])

    r = client.get("/admin/subscriptions", headers=headers)
    assert r.status_code == 200, r.text
    row = next(x for x in r.json() if x["id"] == rid)
    sub = row["subscription"]
    assert sub["status"] in {"ACTIVE", "TRIAL", "EXPIRING_SOON", "EXPIRED", "SUSPENDED"}
    assert sub["end_date"]
    assert float(sub["monthly_price"]) == 5000


def test_send_reminder_creates_notification(client):
    token = login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    headers = auth_headers(token)
    rid = _create_restaurant(client, headers, uuid.uuid4().hex[:8])

    r = client.post("/admin/reminders", headers=headers, json={"restaurant_id": rid})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["type"] == "SUBSCRIPTION_REMINDER"
    assert body["restaurant_id"] == rid
    assert body["status"] == "CREATED"


def test_payment_received_marks_paid_and_extends_active(client):
    token = login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    headers = auth_headers(token)
    rid = _create_restaurant(client, headers, uuid.uuid4().hex[:8])

    # suspend first, to prove payment restores ACTIVE access
    suspend = client.patch(f"/admin/restaurants/{rid}/status", headers=headers, json={"status": "SUSPENDED"})
    assert suspend.status_code == 200, suspend.text
    assert suspend.json()["status"] == "SUSPENDED"

    before = client.get("/admin/subscriptions", headers=headers)
    before_end = next(x for x in before.json() if x["id"] == rid)["subscription"]["end_date"]

    r = client.post(f"/admin/restaurants/{rid}/payment", headers=headers)
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["status"] == "ACTIVE"
    assert sub["payment_status"] == "PAID"
    assert sub["end_date"] > before_end
