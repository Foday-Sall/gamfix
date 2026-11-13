"""wa-router — HTTP entrypoint.

POST /webhook           — GOWA event receiver (HMAC-verified, answers 2xx fast,
                          processes on a worker thread so GOWA never times out)
GET  /health            — liveness for docker
GET  /debug/state       — secret-guarded dump of a chat's state (used by e2e checks)
"""
import hashlib
import hmac
import threading

from flask import Flask, jsonify, request

import bot
import config
import store

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify(ok=True)


def _authorized() -> bool:
    """Two accepted proofs of sender: the HMAC signature GOWA signs with
    WHATSAPP_WEBHOOK_SECRET, or the shared token in ?secret= (internal use)."""
    if config.WEBHOOK_SECRET:
        token = request.args.get("secret", "")
        if token and hmac.compare_digest(token, config.WEBHOOK_SECRET):
            return True
        sig = request.headers.get("X-Hub-Signature-256", "")
        if sig.startswith("sha256="):
            expected = hmac.new(
                config.WEBHOOK_SECRET.encode(), request.get_data(), hashlib.sha256
            ).hexdigest()
            if hmac.compare_digest(sig[7:], expected):
                return True
        return False
    return True  # no secret configured (local dev only)


@app.post("/webhook")
def webhook():
    if not _authorized():
        return jsonify(error="unauthorized"), 401
    data = request.get_json(silent=True) or {}
    if data.get("event") != "message":
        return jsonify(ok=True)  # acks, presence, etc.

    payload = data.get("payload") or {}
    message_id = str(payload.get("id") or "")
    if not message_id or not store.is_new_message(message_id):
        return jsonify(ok=True)
    if payload.get("is_from_me"):
        return jsonify(ok=True)

    from_jid = str(payload.get("from") or payload.get("chat_id") or "")
    body = str(payload.get("body") or "").strip()

    if payload.get("location") or payload.get("live_location"):
        loc = payload.get("location") or payload.get("live_location") or {}
        event = {
            "lat": loc.get("degreesLatitude"),
            "lng": loc.get("degreesLongitude"),
            "name": loc.get("name") or "",
            "address": loc.get("address") or "",
        }
        thread = threading.Thread(target=bot.handle_message, args=(from_jid, body, None, event), daemon=True)
    elif payload.get("image"):
        thread = threading.Thread(
            target=bot.handle_image,
            args=(from_jid, payload.get("image"), body or None, payload.get("media_info")),
            daemon=True,
        )
    else:
        if not body:
            return jsonify(ok=True)  # stickers, voice notes etc. — quietly ignored
        thread = threading.Thread(target=bot.handle_message, args=(from_jid, body), daemon=True)
    thread.start()
    return jsonify(ok=True)


@app.get("/debug/state")
def debug_state():
    if not config.WEBHOOK_SECRET or request.args.get("secret", "") != config.WEBHOOK_SECRET:
        return jsonify(error="unauthorized"), 401
    phone = request.args.get("phone", "")
    chat = store.get_chat(phone)
    if not chat:
        return jsonify(state=None)
    public = dict(chat)
    public.setdefault("data", {})
    public["data"] = {k: v for k, v in public["data"].items() if k != "options"}
    return jsonify(public)


store.load()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=config.PORT, threaded=True)
