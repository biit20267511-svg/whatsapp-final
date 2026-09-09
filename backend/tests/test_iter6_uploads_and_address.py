"""Iteration 6: Uploads (menu photos) + AI address+contact validation."""
import io
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baileys-gateway-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"email": "owner@pizzapalace.pk", "password": "palace123"}


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json=OWNER, timeout=15)
    assert r.status_code == 200
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- uploads ----------
# Minimal 1x1 JPEG bytes
_JPG_BYTES = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
    "07090908"
    "0a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434"
    "1f27393d38323c2e333432ffc0000b0801000100010111"
    "00ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b510"
    "000201030302040305050404000001"
    "7d01020300041105122131410613516107227114328191a1082342b1c11552d1f024336272"
    "82090a161718191a25262728292a3435363738393a434445464748494a535455565758595a"
    "636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5"
    "a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5"
    "e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd0ffd9"
)


def test_upload_image_jpg_success_and_serve(owner_token):
    files = {"file": ("test.jpg", io.BytesIO(_JPG_BYTES), "image/jpeg")}
    r = requests.post(f"{API}/uploads/image", headers=_h(owner_token), files=files, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "url" in body and body["url"].startswith("/api/uploads/files/")
    # fetch via public URL
    url = f"{BASE_URL}{body['url']}"
    g = requests.get(url, timeout=30)
    assert g.status_code == 200
    ctype = g.headers.get("content-type", "")
    assert "image" in ctype, f"expected image content-type, got {ctype}"
    assert len(g.content) > 0


def test_upload_image_rejects_text_400(owner_token):
    files = {"file": ("bad.txt", io.BytesIO(b"hello"), "text/plain")}
    r = requests.post(f"{API}/uploads/image", headers=_h(owner_token), files=files, timeout=30)
    assert r.status_code == 400
    assert "image" in r.text.lower() or "allowed" in r.text.lower()


def test_upload_image_no_token_401():
    files = {"file": ("test.jpg", io.BytesIO(_JPG_BYTES), "image/jpeg")}
    r = requests.post(f"{API}/uploads/image", files=files, timeout=30)
    assert r.status_code in (401, 403)


# ---------- AI address + contact validation via simulator ----------
@pytest.fixture(scope="module")
def sim_phone():
    return f"+9232176{int(time.time()) % 100000:05d}"


def _ai_reply(body):
    msgs = body.get("messages") or []
    ai = [m for m in msgs if m.get("sender") == "ai"]
    return ai[-1]["text"] if ai else ""


def test_ai_asks_for_address_or_contact_when_incomplete(sim_phone, owner_token):
    payload = {
        "phone": sim_phone,
        "name": "Hamza",
        "text": "I want 1 beef burger delivered to Gulberg. My name is Hamza.",
    }
    r = requests.post(f"{API}/simulator/message", json=payload, headers=_h(owner_token), timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    reply = _ai_reply(body).lower()
    conv = body.get("conversation", {})
    # No order should have been placed yet
    assert not conv.get("last_order_id"), f"order was placed prematurely: {conv}"
    # Reply should ask about address details (house/street/city) or contact number
    ask_address = any(k in reply for k in ("house", "street", "block", "city", "flat", "address", "complete"))
    ask_contact = any(k in reply for k in ("contact", "phone", "number", "call"))
    assert ask_address or ask_contact, f"AI should ask for missing address/contact, got: {reply}"


def test_ai_places_order_after_full_address_and_contact(sim_phone, owner_token):
    # Provide complete address + reaffirm whatsapp # ok for calls
    payload1 = {
        "phone": sim_phone,
        "name": "Hamza",
        "text": "Address: House 45, Street 7, Gulberg III, Lahore. You can call me on this WhatsApp number.",
    }
    r = requests.post(f"{API}/simulator/message", json=payload1, headers=_h(owner_token), timeout=60)
    assert r.status_code == 200

    # Confirm
    r2 = requests.post(
        f"{API}/simulator/message",
        json={"phone": sim_phone, "name": "Hamza", "text": "yes confirm"},
        headers=_h(owner_token),
        timeout=60,
    )
    assert r2.status_code == 200
    time.sleep(1.0)

    # Order should now exist for this phone with address containing 'House 45' and a contact_number
    orders = requests.get(f"{API}/orders", headers=_h(owner_token), timeout=15).json()
    if isinstance(orders, dict):
        orders = orders.get("orders") or orders.get("items") or []
    tail = sim_phone[-6:]
    mine = [o for o in orders if str(o.get("customer_phone", "")).endswith(tail)]
    assert mine, f"no order found for phone ...{tail}"
    order = mine[0]
    addr = (order.get("address") or "").lower()
    assert "house 45" in addr, f"address missing 'House 45': {order.get('address')}"
    assert order.get("contact_number"), f"contact_number missing on order: {order}"
