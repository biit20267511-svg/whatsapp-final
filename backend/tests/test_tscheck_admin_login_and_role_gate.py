"""Criterion: Super Admin can log in and only SUPER_ADMIN can access /admin.

Happy path: admin login returns a token and /admin/summary succeeds.
Failure case: restaurant owner login succeeds but gets 403 from an admin API.
"""
from tests.helpers import OWNER_EMAIL, OWNER_PASSWORD, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, auth_headers, login


def test_super_admin_login_and_summary_access(client):
    token = login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    r = client.get("/admin/summary", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "total_restaurants" in body and "mrr" in body


def test_restaurant_owner_forbidden_from_admin_api(client):
    token = login(client, OWNER_EMAIL, OWNER_PASSWORD)
    r = client.get("/admin/summary", headers=auth_headers(token))
    assert r.status_code == 403, r.text
    assert "Super Admin" in r.json().get("detail", "")
