"""Shared login helpers for backend tests."""
import httpx

SUPER_ADMIN_EMAIL = "admin@restaurantai.pk"
SUPER_ADMIN_PASSWORD = "ChangeMe@2026"
OWNER_EMAIL = "owner@pizzapalace.pk"
OWNER_PASSWORD = "palace123"


def login(client: httpx.Client, email: str, password: str) -> str:
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
