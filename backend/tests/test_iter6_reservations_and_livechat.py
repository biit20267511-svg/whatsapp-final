"""Iteration 6: Reservations feature + Live Chat inbox backend flows."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"email": "owner@pizzapalace.pk", "password": "palace123"}


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json=OWNER, timeout=15)
    assert r.status_code == 200
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _ai_reply(body):
    msgs = body.get("messages") or []
    ai = [m for m in msgs if m.get("sender") == "ai"]
    return ai[-1]["text"] if ai else ""


# ---------- restaurant reservations_enabled toggle ----------
def test_restaurant_reservations_toggle_persists(owner_token):
    # Turn OFF
    r = requests.put(f"{API}/restaurant", headers=_h(owner_token), json={"reservations_enabled": False}, timeout=15)
    assert r.status_code == 200, r.text
    g = requests.get(f"{API}/restaurant", headers=_h(owner_token), timeout=15).json()
    assert g.get("reservations_enabled") is False
    # Turn back ON (restore default state)
    r2 = requests.put(f"{API}/restaurant", headers=_h(owner_token), json={"reservations_enabled": True}, timeout=15)
    assert r2.status_code == 200
    g2 = requests.get(f"{API}/restaurant", headers=_h(owner_token), timeout=15).json()
    assert g2.get("reservations_enabled") is True


# ---------- Reservations OFF: AI politely declines ----------
def test_ai_declines_reservation_when_disabled(owner_token):
    # Ensure OFF
    requests.put(f"{API}/restaurant", headers=_h(owner_token), json={"reservations_enabled": False}, timeout=15)
    time.sleep(0.3)
    phone = f"+9232010{int(time.time()) % 100000:05d}"
    before = requests.get(f"{API}/reservations", headers=_h(owner_token), timeout=15).json()
    before_ids = {r.get("id") for r in before}

    payload = {"phone": phone, "name": "Ali",
               "text": "I'd like to book a table for 4 tomorrow at 8pm please."}
    r = requests.post(f"{API}/simulator/message", json=payload, headers=_h(owner_token), timeout=60)
    assert r.status_code == 200, r.text
    reply = _ai_reply(r.json()).lower()
    # AI should not confirm a reservation number and should not create one
    assert "r-" not in reply or "reservation" not in reply or "not" in reply or "sorry" in reply or "delivery" in reply or "pickup" in reply, f"AI seems to accept reservation while disabled: {reply}"
    time.sleep(0.5)
    after = requests.get(f"{API}/reservations", headers=_h(owner_token), timeout=15).json()
    new_ones = [r for r in after if r.get("id") not in before_ids and r.get("customer_phone", "").endswith(phone[-6:])]
    assert not new_ones, f"reservation was created while feature disabled: {new_ones}"
    # Restore
    requests.put(f"{API}/restaurant", headers=_h(owner_token), json={"reservations_enabled": True}, timeout=15)


# ---------- Reservations ON: AI books ----------
@pytest.fixture(scope="module")
def booked_reservation(owner_token):
    # Ensure ON
    requests.put(f"{API}/restaurant", headers=_h(owner_token), json={"reservations_enabled": True}, timeout=15)
    time.sleep(0.3)
    phone = f"+9232011{int(time.time()) % 100000:05d}"
    payload = {
        "phone": phone,
        "name": "TestGuest",
        "text": "Please book a table for 4 tomorrow at 8pm, name TestGuest, window seat preferred. My contact is this whatsapp number.",
    }
    r = requests.post(f"{API}/simulator/message", json=payload, headers=_h(owner_token), timeout=90)
    assert r.status_code == 200, r.text
    time.sleep(1.0)
    return phone


def test_ai_books_reservation_when_enabled(owner_token, booked_reservation):
    phone = booked_reservation
    reservations = requests.get(f"{API}/reservations", headers=_h(owner_token), timeout=15).json()
    tail = phone[-6:]
    mine = [r for r in reservations if str(r.get("customer_phone", "")).endswith(tail)]
    assert mine, f"no reservation created for ...{tail}. Full list: {[r.get('customer_phone') for r in reservations]}"
    res = mine[0]
    assert isinstance(res.get("reservation_number"), int) and res["reservation_number"] > 0, f"bad reservation_number: {res}"
    assert res.get("party_size") == 4, f"party_size mismatch: {res}"
    # date YYYY-MM-DD
    assert res.get("date") and len(res["date"]) == 10 and res["date"][4] == "-", f"bad date: {res.get('date')}"
    # time HH:MM
    assert res.get("time") and len(res["time"]) == 5 and res["time"][2] == ":", f"bad time: {res.get('time')}"
    assert res.get("status") in ("Pending", "Confirmed"), f"unexpected initial status: {res.get('status')}"


def test_reservation_status_lifecycle_and_invalid_400(owner_token, booked_reservation):
    phone = booked_reservation
    reservations = requests.get(f"{API}/reservations", headers=_h(owner_token), timeout=15).json()
    tail = phone[-6:]
    mine = [r for r in reservations if str(r.get("customer_phone", "")).endswith(tail)]
    assert mine
    rid = mine[0]["id"]

    # Invalid status -> 400
    bad = requests.patch(f"{API}/reservations/{rid}/status", headers=_h(owner_token), json={"status": "Bogus"}, timeout=15)
    assert bad.status_code == 400, bad.text

    # Valid transitions
    for status in ("Confirmed", "Seated", "Completed"):
        ok = requests.patch(f"{API}/reservations/{rid}/status", headers=_h(owner_token), json={"status": status}, timeout=15)
        assert ok.status_code == 200, ok.text
        assert ok.json().get("status") == status

    # Verify persistence
    reservations = requests.get(f"{API}/reservations", headers=_h(owner_token), timeout=15).json()
    r = [x for x in reservations if x["id"] == rid][0]
    assert r["status"] == "Completed"


def test_reservation_status_404_on_missing(owner_token):
    r = requests.patch(f"{API}/reservations/does-not-exist/status", headers=_h(owner_token), json={"status": "Confirmed"}, timeout=15)
    assert r.status_code in (404, 400)


# ---------- Live chat inbox endpoints ----------
def test_conversations_list_and_messages(owner_token):
    convos = requests.get(f"{API}/conversations", headers=_h(owner_token), timeout=15).json()
    assert isinstance(convos, list)
    assert convos, "No conversations exist to test"
    first = convos[0]
    assert "id" in first and "customer_phone" in first and "ai_active" in first
    msgs = requests.get(f"{API}/conversations/{first['id']}/messages", headers=_h(owner_token), timeout=15).json()
    assert "conversation" in msgs and "messages" in msgs


def test_conversation_handoff_and_human_reply(owner_token):
    convos = requests.get(f"{API}/conversations", headers=_h(owner_token), timeout=15).json()
    assert convos
    cid = convos[0]["id"]

    # Handoff to human
    h = requests.post(f"{API}/conversations/{cid}/handoff", headers=_h(owner_token), json={"ai_active": False}, timeout=15)
    assert h.status_code == 200, h.text
    assert h.json().get("ai_active") is False

    # Reply as staff
    reply_text = f"Staff test reply {int(time.time())}"
    rep = requests.post(f"{API}/conversations/{cid}/reply", headers=_h(owner_token), json={"text": reply_text}, timeout=15)
    assert rep.status_code == 200, rep.text
    msg = rep.json().get("message", {})
    assert msg.get("sender") == "human" and msg.get("text") == reply_text

    # Message appears in thread
    thread = requests.get(f"{API}/conversations/{cid}/messages", headers=_h(owner_token), timeout=15).json()
    texts = [m.get("text") for m in thread["messages"]]
    assert reply_text in texts

    # Restore AI
    h2 = requests.post(f"{API}/conversations/{cid}/handoff", headers=_h(owner_token), json={"ai_active": True}, timeout=15)
    assert h2.status_code == 200


def test_handoff_404_on_unknown_conversation(owner_token):
    r = requests.post(f"{API}/conversations/nope-nope/handoff", headers=_h(owner_token), json={"ai_active": False}, timeout=15)
    assert r.status_code == 404
