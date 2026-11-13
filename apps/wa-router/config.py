"""Configuration for the GamFix WhatsApp router bot.

All secrets arrive as environment variables (set in /opt/gamfix-chat/.env on
the VPS, never committed to git).
"""
import os


def _get(name: str, default: str = "") -> str:
    value = os.getenv(name, default)
    return value.strip() if value else default


PORT = int(_get("PORT", "8080"))

# GOWA chat device (separate container from the OTP gowa).
GOWA_BASE_URL = _get("GOWA_BASE_URL", "http://gowa-chat:3000").rstrip("/")
GOWA_BASIC_AUTH_USER = _get("GOWA_BASIC_AUTH_USER", "gowa-chat")
GOWA_BASIC_AUTH_PASS = _get("GOWA_BASIC_AUTH_PASS")
# This GOWA build is multi-device: every send needs the device id (same as
# the OTP hook's GOWA_DEVICE_ID). Set after the QR scan if auto-detect fails.
GOWA_DEVICE_ID = _get("GOWA_DEVICE_ID")

# PocketBase — reached through the host nginx (PocketBase itself binds to
# 127.0.0.1 only). TLS is self-signed on the origin IP, so verification is
# disabled for this internal hop only.
PB_BASE_URL = _get("PB_BASE_URL", "https://host.docker.internal").rstrip("/")
PB_HOST_HEADER = _get("PB_HOST_HEADER", "gamfix.pocketsoftware.dev")
PB_SU_EMAIL = _get("PB_SU_EMAIL")
PB_SU_PASSWORD = _get("PB_SU_PASSWORD")

# Shared secret for the wa-bot submit hook (X-WA-Bot-Secret header).
WA_BOT_SECRET = _get("WA_BOT_SECRET")

# HMAC secret GOWA signs webhooks with (WHATSAPP_WEBHOOK_SECRET) — verified
# on every inbound request; falls back to the same value as a ?secret= query.
WEBHOOK_SECRET = _get("WEBHOOK_SECRET")

APP_PUBLIC_URL = _get("APP_PUBLIC_URL", "https://gamfix.pocketsoftware.dev").rstrip("/")

# Chat state expires after this many minutes of silence.
STATE_TTL_MIN = int(_get("STATE_TTL_MIN", "30"))
STATE_DIR = _get("STATE_DIR", "/data")

# Anti-flag throttling: WhatsApp flags accounts that machine-gun replies.
REPLY_DELAY_MIN = float(_get("REPLY_DELAY_MIN", "1.4"))  # seconds, random lower bound
REPLY_DELAY_MAX = float(_get("REPLY_DELAY_MAX", "3.2"))  # seconds, random upper bound
MIN_CHAT_GAP = float(_get("MIN_CHAT_GAP", "2.5"))  # min seconds between replies in one chat

MEDIA_ROOT = _get("MEDIA_ROOT", "/media")  # ro mount of gowa-chat statics
MAX_PHOTO_BYTES = 10 * 1024 * 1024
ALLOWED_PHOTO_MIMES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
