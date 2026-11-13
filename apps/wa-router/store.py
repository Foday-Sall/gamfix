"""Chat state store for the wa-router bot.

Per-phone-number conversation state, persisted to /data/state.json so a
container restart does not strand users mid-report. Also keeps a bounded
set of already-processed message ids (GOWA redelivers webhooks on retries).
"""
import json
import os
import tempfile
import threading
import time
from collections import OrderedDict

from config import STATE_DIR, STATE_TTL_MIN

_LOCK = threading.Lock()

# chat phone -> state dict
_CHATS: "OrderedDict[str, dict]" = OrderedDict()
# recent message ids -> timestamp (bounded)
_SEEN: "OrderedDict[str, float]" = OrderedDict()

_STATE_FILE = os.path.join(STATE_DIR, "state.json")
_SEEN_FILE = os.path.join(STATE_DIR, "seen.json")
_MAX_SEEN = 2000


def _atomic_write(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def load() -> None:
    """Load persisted state at startup. Corrupt files start fresh — the bot
    simply greets again, which is always safe."""
    global _CHATS, _SEEN
    try:
        with open(_STATE_FILE, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        if isinstance(raw, dict):
            _CHATS = OrderedDict(raw)
    except Exception:
        _CHATS = OrderedDict()
    try:
        with open(_SEEN_FILE, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        if isinstance(raw, dict):
            _SEEN = OrderedDict(raw)
    except Exception:
        _SEEN = OrderedDict()


def _persist_states() -> None:
    try:
        _atomic_write(_STATE_FILE, dict(_CHATS))
    except Exception as exc:  # pragma: no cover - disk issues only
        print("wa-router: persist states failed:", exc, flush=True)


def _persist_seen() -> None:
    try:
        _atomic_write(_SEEN_FILE, dict(_SEEN))
    except Exception as exc:  # pragma: no cover
        print("wa-router: persist seen failed:", exc, flush=True)


def is_new_message(message_id: str) -> bool:
    """True the first time a message id is seen; GOWA retries duplicates."""
    with _LOCK:
        if message_id in _SEEN:
            return False
        _SEEN[message_id] = time.time()
        while len(_SEEN) > _MAX_SEEN:
            _SEEN.popitem(last=False)
        _persist_seen()
        return True


def get_chat(phone: str) -> dict | None:
    with _LOCK:
        chat = _CHATS.get(phone)
        if not chat:
            return None
        if time.time() - float(chat.get("updated_at", 0)) > STATE_TTL_MIN * 60:
            del _CHATS[phone]
            _persist_states()
            return None
        return chat


def set_chat(phone: str, state: str, name: str = "", data: dict | None = None) -> dict:
    """Create or reset a chat with the given state, preserving nothing."""
    chat = {
        "phone": phone,
        "state": state,
        "name": name,
        "data": data or {},
        "updated_at": time.time(),
    }
    with _LOCK:
        _CHATS[phone] = chat
        _persist_states()
    return chat


def update_chat(chat: dict, state: str | None = None, data_merge: dict | None = None, data: dict | None = None) -> dict:
    with _LOCK:
        if state is not None:
            chat["state"] = state
        if data is not None:
            chat["data"] = dict(data)
        if data_merge:
            chat["data"].update(data_merge)
        chat["updated_at"] = time.time()
        _CHATS[chat["phone"]] = chat
        _persist_states()
    return chat


def clear_chat(phone: str) -> None:
    with _LOCK:
        if phone in _CHATS:
            del _CHATS[phone]
            _persist_states()


def reset_expired() -> None:
    """Drop chats older than the TTL (called opportunistically)."""
    with _LOCK:
        now = time.time()
        stale = [p for p, c in _CHATS.items() if now - float(c.get("updated_at", 0)) > STATE_TTL_MIN * 60]
        for phone in stale:
            del _CHATS[phone]
        if stale:
            _persist_states()
