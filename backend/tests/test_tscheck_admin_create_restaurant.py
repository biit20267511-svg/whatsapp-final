"""Criterion: Super Admin can create a restaurant with generated one-time credentials."""
import uuid
from datetime import date

from tests.helpers import SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, auth_headers, login


def test_create_restaurant_returns_credentials_and_appears_in_list(client):
    token = login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    headers = auth_headers(token)
    suffix = uuid.uuid4().hex[:8]
    name = f"tscheck-restaurant-{suffix}"
    email = f"tscheck-{suffix}@example.com"

    r = client.post(
        "/admin/restaurants",
        headers=headers,
        json={
            "restaurant_name": name,
            "owner_name": "TS Check Owner",
            "email": email,
            "phone": "03000000000",
            "whatsapp_number": "03000000000",
            "address": "1 Test St",
            "city": "Karachi",
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
    creds = body["credentials"]
    assert creds["username"], "username should be generated"
    assert creds["password"], "password should be generated"
    assert creds["login_url"]
    rid = body["restaurant"]["id"]

    listing = client.get("/admin/restaurants", headers=headers)
    assert listing.status_code == 200
    ids = [row["id"] for row in listing.json()]
    assert rid in ids, "newly created restaurant should appear in Restaurants list"

    # the generated credentials must actually work for login
    login_r = client.post("/auth/login", json={"email": creds["username"], "password": creds["password"]})
    assert login_r.status_code == 200, login_r.text
    assert login_r.json()["user"]["restaurant_id"] == rid
