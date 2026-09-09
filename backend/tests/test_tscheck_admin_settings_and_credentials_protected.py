"""Criterion: Super Admin settings and credential changes are protected.

- Platform prices / reminder template are editable via PUT /admin/settings.
- Changing admin profile (email/password) requires current password and produces
  an audit log entry. This test restores the admin's original profile at the end
  so the seeded super admin credentials keep working for later tests.
"""
import uuid

from tests.helpers import SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, auth_headers, login


def test_platform_settings_are_editable(client):
    token = login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    headers = auth_headers(token)

    original = client.get("/admin/settings", headers=headers)
    assert original.status_code == 200, original.text
    orig_price = original.json()["monthly_price"]

    new_price = 6543
    r = client.put("/admin/settings", headers=headers, json={"monthly_price": new_price})
    assert r.status_code == 200, r.text
    assert r.json()["monthly_price"] == new_price

    # restore
    restore = client.put("/admin/settings", headers=headers, json={"monthly_price": orig_price})
    assert restore.status_code == 200
    assert restore.json()["monthly_price"] == orig_price


def test_profile_update_requires_current_password_and_audits(client):
    token = login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    headers = auth_headers(token)

    # wrong current password is rejected
    wrong = client.put(
        "/admin/profile",
        headers=headers,
        json={"current_password": "definitely-wrong", "new_password": "irrelevant"},
    )
    assert wrong.status_code == 400, wrong.text

    # correct current password allows a rotation; rotate password then rotate straight back
    temp_password = f"Tscheck!{uuid.uuid4().hex[:8]}"
    ok = client.put(
        "/admin/profile",
        headers=headers,
        json={"current_password": SUPER_ADMIN_PASSWORD, "new_password": temp_password},
    )
    assert ok.status_code == 200, ok.text

    relogin = client.post("/auth/login", json={"email": SUPER_ADMIN_EMAIL, "password": temp_password})
    assert relogin.status_code == 200, relogin.text
    new_token = relogin.json()["access_token"]

    restore = client.put(
        "/admin/profile",
        headers=auth_headers(new_token),
        json={"current_password": temp_password, "new_password": SUPER_ADMIN_PASSWORD},
    )
    assert restore.status_code == 200, restore.text

    audits = client.get("/admin/audit-logs", headers=auth_headers(new_token))
    assert audits.status_code == 200, audits.text
    actions = [a["action"] for a in audits.json()]
    assert "UPDATED_ADMIN_PROFILE" in actions
