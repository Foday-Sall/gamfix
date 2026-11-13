"""PocketBase access for the wa-router bot.

The bot talks to PocketBase through the host nginx (PocketBase binds to
127.0.0.1 only, and the container can only reach the host's published
ports). Read lookups and the photo attachment use a superuser session;
report submission goes through the secret-guarded /api/gamfix/wa-bot/submit
hook so the business logic stays in pb_hooks and cannot drift from the web
channel.
"""
import threading
import time

import requests

import config

requests.packages.urllib3.disable_warnings()  # internal self-signed origin hop only

_TOKEN = {"value": "", "expires_at": 0.0}
_TOKEN_LOCK = threading.Lock()


def _session() -> requests.Session:
    s = requests.Session()
    s.headers["Host"] = config.PB_HOST_HEADER
    s.verify = False
    return s


def _request(method: str, path: str, **kwargs) -> requests.Response:
    """POST/GET against PocketBase, trying https then http on the host gateway."""
    last_exc = None
    for scheme in ("https", "http"):
        url = config.PB_BASE_URL.replace("https://", scheme + "://").replace("http://", scheme + "://", 1) + path
        try:
            return _session().request(method, url, timeout=20, **kwargs)
        except requests.RequestException as exc:
            last_exc = exc
            continue
    raise last_exc  # type: ignore[misc]


def superuser_token() -> str:
    with _TOKEN_LOCK:
        if _TOKEN["value"] and time.time() < _TOKEN["expires_at"]:
            return _TOKEN["value"]
        r = _request(
            "POST",
            "/api/collections/_superusers/auth-with-password",
            json={"identity": config.PB_SU_EMAIL, "password": config.PB_SU_PASSWORD},
        )
        r.raise_for_status()
        data = r.json()
        _TOKEN["value"] = data["token"]
        # Refresh a minute before PB's own expiry claim (usually 14 days).
        _TOKEN["expires_at"] = time.time() + max(60.0, float(data.get("meta", {}).get("expiresIn", 1209600)) - 60)
        return _TOKEN["value"]


def invalidate() -> None:
    with _TOKEN_LOCK:
        _TOKEN["value"] = ""
        _TOKEN["expires_at"] = 0.0


def _su_get(path: str, params: dict | None = None) -> dict:
    r = _request(
        "GET",
        path,
        params=params,
        headers={"Authorization": superuser_token()},
    )
    if r.status_code in (400, 401):
        # Stale token → re-auth once.
        invalidate()
        r = _request("GET", path, params=params, headers={"Authorization": superuser_token()})
    r.raise_for_status()
    return r.json()


def normalize_phone(raw: str) -> str:
    """Mirror phone-otp.pb.js normalization so JIDs match users.phone."""
    phone = "".join(ch for ch in str(raw) if ch.isdigit())
    if phone.startswith("00"):
        phone = phone[2:]
    if phone.startswith("0"):
        phone = phone.lstrip("0")
    if phone.startswith("220") and len(phone) == 10:
        phone = phone[3:]
    if len(phone) == 7:
        phone = "220" + phone
    return phone


def whois(phone_normalized: str) -> dict | None:
    """Return {id, name, full_name} for the verified citizen owning this
    phone, or None if no verified account exists (unregistered number)."""
    items = _su_get(
        "/api/collections/users/records",
        {"filter": f"phone = '{phone_normalized}' && phone_verified = true", "perPage": 1},
    ).get("items", [])
    if not items:
        return None
    user = items[0]
    return {
        "id": user["id"],
        "name": (user.get("name") or "").strip(),
        "full_name": (user.get("full_name") or "").strip(),
    }


def fetch_directory() -> tuple[list[dict], list[dict]]:
    """(institutions, categories) — active + publicly visible only.
    Cached in memory for 10 minutes; the report wizard is read-heavy."""
    global _DIR_CACHE
    now = time.time()
    if _DIR_CACHE and now - _DIR_CACHE[0] < 600:
        return _DIR_CACHE[1], _DIR_CACHE[2]
    insts = _su_get("/api/collections/institutions/records", {"filter": "active = true", "perPage": 100}).get("items", [])
    cats = _su_get("/api/collections/categories/records", {"filter": "active = true", "perPage": 200}).get("items", [])
    institutions = [
        {"id": i["id"], "code": i.get("code"), "name": i.get("name") or i.get("code")}
        for i in insts
        if i.get("public_visible") is not False and (i.get("code") or "").upper() != "POLICE"
    ]
    institutions.sort(key=lambda x: (x["name"] or "").lower())
    categories = [
        {"id": c["id"], "slug": c.get("slug"), "name": c.get("name") or c.get("slug"),
         "default_institution_id": c.get("default_institution_id") or None}
        for c in cats
    ]
    _DIR_CACHE = (now, institutions, categories)
    return institutions, categories


_DIR_CACHE: tuple[float, list[dict], list[dict]] = (0.0, [], [])


def categories_for(institution: dict, all_categories: list[dict], central_id: str | None) -> list[dict]:
    """Same rule as the web app: an institution gets its own categories;
    CENTRAL additionally gets every category with no default institution."""
    if (institution.get("code") or "").upper() == "CENTRAL":
        return [c for c in all_categories if c["default_institution_id"] is None or c["default_institution_id"] == central_id]
    return [c for c in all_categories if c["default_institution_id"] == institution["id"]]


def submit_report(payload: dict) -> dict:
    """Submit through the wa-bot hook. Returns the hook's JSON on 200;
    raises PBError (with .status and .message) otherwise. The shared secret
    travels in the body (header APIs vary across PB JSVM builds) and in the
    X-WA-Bot-Secret header for builds where the header path works."""
    body = dict(payload)
    body["secret"] = config.WA_BOT_SECRET
    r = _request(
        "POST",
        "/api/gamfix/wa-bot/submit",
        json=body,
        headers={"X-WA-Bot-Secret": config.WA_BOT_SECRET},
    )
    if r.status_code != 200:
        try:
            message = r.json().get("error", "submit failed")
        except Exception:
            message = "submit failed"
        raise PBError(r.status_code, message)
    return r.json()


class PBError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def track(tracking_no: str) -> dict:
    """Public track route (same one the web app uses before sign-in)."""
    r = _request("POST", "/api/gamfix/track", json={"p_tracking_no": tracking_no})
    if r.status_code != 200:
        try:
            message = r.json().get("error", "not found")
        except Exception:
            message = "not found"
        raise PBError(r.status_code, message)
    return r.json()


def attach_photo(complaint_id: str, filename: str, content: bytes, mime: str) -> None:
    """Attach the downloaded WhatsApp image to the complaint via the
    superuser multipart PATCH (same `photos` field the web app uses)."""
    r = _request(
        "PATCH",
        f"/api/collections/complaints/records/{complaint_id}",
        files={"photos": (filename, content, mime)},
        headers={"Authorization": superuser_token()},
    )
    if r.status_code == 401:
        invalidate()
        r = _request(
            "PATCH",
            f"/api/collections/complaints/records/{complaint_id}",
            files={"photos": (filename, content, mime)},
            headers={"Authorization": superuser_token()},
        )
    if r.status_code not in (200,):
        raise PBError(r.status_code, "photo attach failed: " + r.text[:200])
