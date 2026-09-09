"""Criterion: Restaurant tenant isolation and existing dashboard remain functional.

Uses the seeded demo owner (owner@pizzapalace.pk) read-only: only GET calls,
no mutation of seeded rows.
"""
from tests.helpers import OWNER_EMAIL, OWNER_PASSWORD, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, auth_headers, login


def test_owner_reaches_only_own_dashboard_and_dashboard_apis_work(client):
    token = login(client, OWNER_EMAIL, OWNER_PASSWORD)
    headers = auth_headers(token)

    me = client.get("/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    rid = me.json()["user"]["restaurant_id"]
    assert rid == "demo-pizza-palace" or me.json()["restaurant"]["name"]

    orders = client.get("/orders", headers=headers)
    assert orders.status_code == 200, orders.text
    for o in orders.json():
        assert o.get("restaurant_id", rid) == rid

    menu = client.get("/menu", headers=headers)
    assert menu.status_code == 200, menu.text

    customers = client.get("/customers", headers=headers)
    assert customers.status_code == 200, customers.text


def test_restaurant_owner_cannot_access_admin_routes(client):
    token = login(client, OWNER_EMAIL, OWNER_PASSWORD)
    headers = auth_headers(token)

    r = client.get("/admin/restaurants", headers=headers)
    assert r.status_code == 403, r.text
