"""GOWA (chat device) client — sends the bot's replies.

Deliberately human-slow: WhatsApp flags accounts that answer machine-fast,
so every reply waits a randomized beat, flips a typing indicator first
(best effort, ignored if the endpoint is absent in this GOWA build), and
each chat has a minimum gap between replies.
"""
import base64
import random
import threading
import time

import requests

import config

_SEND_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


def _auth_header() -> str:
    raw = f"{config.GOWA_BASIC_AUTH_USER}:{config.GOWA_BASIC_AUTH_PASS}".encode()
    return "Basic " + base64.b64encode(raw).decode()


_DEVICE_ID = {"value": config.GOWA_DEVICE_ID, "checked_at": 0.0}


def _device_id() -> str:
    """Device id for sends: env override, else auto-detect the first device
    registered on this gowa-chat (works right after the QR scan). Cached
    for 5 minutes; empty string when no device exists yet."""
    if _DEVICE_ID["value"]:
        return _DEVICE_ID["value"]
    now = time.time()
    if now - _DEVICE_ID["checked_at"] < 300:
        return ""
    _DEVICE_ID["checked_at"] = now
    try:
        r = requests.get(
            config.GOWA_BASE_URL + "/devices",
            headers={"Authorization": _auth_header()},
            timeout=8,
        )
        data = r.json()
        rows = data.get("results", data) if isinstance(data, dict) else data
        if isinstance(rows, list):
            for row in rows:
                did = row.get("device_id") or row.get("id") if isinstance(row, dict) else None
                if did:
                    _DEVICE_ID["value"] = str(did)
                    print("wa-router: auto-detected device_id", _DEVICE_ID["value"], flush=True)
                    break
    except Exception:
        pass
    return _DEVICE_ID["value"]


def _device_headers() -> dict:
    headers = {"Authorization": _auth_header()}
    did = _device_id()
    if did:
        headers["X-Device-Id"] = did
    return headers


def _lock_for(phone: str) -> threading.Lock:
    with _LOCKS_GUARD:
        if phone not in _SEND_LOCKS:
            _SEND_LOCKS[phone] = threading.Lock()
        return _SEND_LOCKS[phone]


def _presence(phone: str, action: str) -> None:
    """Typing indicator — optional in GOWA builds; failures are silent."""
    try:
        requests.post(
            config.GOWA_BASE_URL + "/send/chat-presence",
            json={"phone": phone, "action": action},
            headers=_device_headers(),
            timeout=8,
        )
    except Exception:
        pass


def send_text(phone: str, message: str) -> tuple[bool, str]:
    """Send one text message with human pacing. Returns (ok, error-ish info).
    Never raises — a failed WhatsApp delivery must not crash the webhook.
    The per-chat lock plus the random in-lock delay guarantees replies in one
    chat are always spaced at least REPLY_DELAY_MIN apart."""
    with _lock_for(phone):
        time.sleep(random.uniform(config.REPLY_DELAY_MIN, config.REPLY_DELAY_MAX))
        _presence(phone, "start")
        try:
            r = requests.post(
                config.GOWA_BASE_URL + "/send/message",
                json={"phone": phone, "message": message},
                headers=_device_headers(),
                timeout=20,
            )
            ok = 200 <= r.status_code < 300
            detail = "" if ok else f"gowa {r.status_code}: {r.text[:160]}"
        except Exception as exc:
            ok, detail = False, f"gowa unreachable: {type(exc).__name__}"
        finally:
            _presence(phone, "stop")
        return ok, detail
