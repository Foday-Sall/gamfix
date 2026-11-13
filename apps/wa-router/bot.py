"""The GamFix WhatsApp bot brain — conversational report filing.

Flow per chat: recognise the number in PocketBase (must be a phone-verified
citizen) → menu → guided report (service → problem → description → optional
photo → location → urgency → confirm) → submitted through the wa-bot hook
with a real tracking number, exactly like the web app. Also: track a report,
help, cancel.

Design rules (from the product decision): never guess, never file without an
explicit confirm, never reply machine-fast, and never trap anyone — 'menu',
'cancel' and 'help' work at every step.
"""
import datetime as _dt
import os
import re
import threading

import config
import gowa
import pocketbase as pb
import store

# One processing lock per chat: messages from the same person are handled
# strictly in order (each sees the settled state of the previous one). The
# per-chat lock is separate from the send lock so a slow reply never blocks
# a different chat.
_PROC_LOCKS: dict[str, threading.Lock] = {}
_PROC_LOCKS_GUARD = threading.Lock()
_PROC_TIMEOUT_S = 30.0


def _proc_lock(phone: str) -> threading.Lock:
    with _PROC_LOCKS_GUARD:
        if phone not in _PROC_LOCKS:
            _PROC_LOCKS[phone] = threading.Lock()
        return _PROC_LOCKS[phone]

EMOJI_DIGITS = str.maketrans("", "", "\ufe0f\u20e3")  # strip keycap-emoji modifiers

STATUS_LABELS = {
    "submitted": "📬 Received — waiting for the institution",
    "in_review": "🔍 Under review",
    "assigned": "👷 Assigned to staff",
    "in_progress": "🔧 Work in progress",
    "resolved": "✅ Resolved",
    "rejected": "❌ Rejected",
    "closed": "📁 Closed",
    "reopened": "📬 Reopened",
}

MENU = (
    "Reply with a number:\n"
    "1️⃣ File a report\n"
    "2️⃣ Track a report\n"
    "3️⃣ Help"
)

HELP = (
    "I'm the GamFix WhatsApp assistant. Here's what I can do:\n"
    "• *File a report* about water, electricity, roads, waste, schools, "
    "health services and more — step by step, right here in chat\n"
    "• *Track a report* — I'll ask for your GMC- tracking number\n"
    "\n"
    "You can reply *menu* anytime, or *cancel* to stop what you're doing.\n"
    "Prefer the web app? " + config.APP_PUBLIC_URL
)

UNREGISTERED = (
    "Hi! 👋 I'm the GamFix WhatsApp assistant.\n"
    "I couldn't find a verified GamFix account for this number, so I can't "
    "file reports from here yet.\n"
    "\n"
    "To get started:\n"
    "1️⃣ Sign up at " + config.APP_PUBLIC_URL + "\n"
    "2️⃣ Verify this same phone number (you'll get a WhatsApp code)\n"
    "\n"
    "Then text me *hi* again and I'll recognise you right away. 🇬🇲"
)


def _reply(chat: dict, text: str) -> None:
    ok, detail = gowa.send_text(chat["phone"], text)
    if not ok:
        print(f"wa-router: reply to {chat['phone']} failed: {detail}", flush=True)


def _humanize_status(raw: str) -> str:
    return STATUS_LABELS.get((raw or "").lower(), (raw or "unknown").replace("_", " ").capitalize())


def _first_name(chat: dict) -> str:
    full = (chat.get("name") or "").strip()
    return full.split()[0] if full else "there"


def _menu_text(chat: dict) -> str:
    return f"👋 Hi {_first_name(chat)}! Welcome back to *GamFix*.\n\n{MENU}"


def parse_choice(text: str, count: int) -> int | None:
    """Parse '1', '1️⃣', 'Option 2' → 1-based index, or None."""
    cleaned = (text or "").strip().translate(EMOJI_DIGITS)
    m = re.search(r"\d+", cleaned)
    if m:
        n = int(m.group())
        return n if 1 <= n <= count else None
    return None


def _auto_title(category_name: str, description: str) -> str:
    text = f"{category_name}: {description.strip()}"
    if len(text) <= 80:
        return text
    cut = text[:80]
    return cut[: cut.rfind(" ") if cut.rfind(" ") > 40 else 80].rstrip(" ,;:-") + "…"


def _directory() -> tuple[list[dict], list[dict]]:
    try:
        return pb.fetch_directory()
    except Exception as exc:
        print("wa-router: directory fetch failed:", type(exc).__name__, exc, flush=True)
        return [], []


def _prompt_report_service(chat: dict) -> None:
    institutions, _ = _directory()
    if not institutions:
        _reply(chat, "Sorry — I couldn't load the service list just now. Please try again in a minute, or reply *menu*.")
        return
    options = [{"kind": "institution", **i} for i in institutions]
    lines = [f"{idx}️⃣ {i['name']}" for idx, i in enumerate(options, start=1)]
    store.update_chat(chat, state="report_service", data={"options": options})
    _reply(chat, "Let's file your report. 📋\n\n*Which service is it about?* Reply with a number:\n" + "\n".join(lines))


def _prompt_report_category(chat: dict) -> None:
    data = chat["data"]
    institutions, categories = _directory()
    chosen = next((i for i in institutions if i["id"] == data.get("institution_id")), None)
    if not chosen:
        return _prompt_report_service(chat)
    central_id = next((i["id"] for i in institutions if (i.get("code") or "").upper() == "CENTRAL"), None)
    cats = pb.categories_for(chosen, categories, central_id)
    if not cats:
        _reply(chat, "I couldn't find reportable problems for that service right now. Reply *menu* to start over.")
        return
    options = [{"kind": "category", **c} for c in cats]
    lines = [f"{idx}️⃣ {c['name']}" for idx, c in enumerate(options, start=1)]
    store.update_chat(chat, state="report_category", data_merge={"options": options})
    _reply(chat, "*What kind of problem is it?* Reply with a number:\n" + "\n".join(lines))


def _prompt_report_desc(chat: dict) -> None:
    store.update_chat(chat, state="report_desc")
    _reply(chat, "Describe the problem in a sentence or two — what's wrong, and anything staff should know.")


def _prompt_report_photo(chat: dict) -> None:
    store.update_chat(chat, state="report_photo")
    _reply(chat, "📷 Want to attach a photo? Send the image here, or reply *skip* to continue without one.")


def _prompt_report_location(chat: dict) -> None:
    store.update_chat(chat, state="report_location")
    _reply(chat, "📍 *Where is this happening?* Send the area and a landmark (e.g. 'Serrekunda, near Westfield') — or drop a WhatsApp location pin.")


def _prompt_report_urgency(chat: dict) -> None:
    store.update_chat(chat, state="report_urgency")
    _reply(chat, "How urgent is it?\n\n1️⃣ Normal\n2️⃣ Urgent — risk to health or safety")


def _prompt_report_confirm(chat: dict) -> None:
    data = chat["data"]
    photo_line = "attached 📷" if data.get("photo") else "skipped"
    urgency_line = "Urgent 🚨" if data.get("urgency") == "high" else "Normal"
    store.update_chat(chat, state="report_confirm")
    _reply(
        chat,
        "Please check your report:\n\n"
        f"🗂 Service: *{data.get('institution_name', '—')}*\n"
        f"🧾 Problem: *{data.get('category_name', '—')}*\n"
        f"📝 Description: {data.get('description', '—')}\n"
        f"📍 Location: {data.get('landmark') or '—'}"
        + (f" (pin at {data.get('lat'):.5f}, {data.get('lng'):.5f})" if data.get("lat") else "") + "\n"
        f"🚨 Urgency: {urgency_line}\n"
        f"📷 Photo: {photo_line}\n\n"
        "Reply *1* to send it, or *2* to cancel.",
    )


def _submit(chat: dict) -> None:
    data = chat["data"]
    payload = {
        "phone": chat["phone"],
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "category_slug": data.get("category_slug", ""),
        "institution_code": data.get("institution_code") or "CENTRAL",
        "urgency": data.get("urgency", "normal"),
        "landmark": data.get("landmark", ""),
        "lat": data.get("lat") or 0,
        "lng": data.get("lng") or 0,
        "external_id": "WA-" + chat["phone"] + "-" + str(int(_dt.datetime.now().timestamp())),
    }
    try:
        res = pb.submit_report(payload)
    except pb.PBError as exc:
        if exc.status == 404 or exc.message == "not_registered":
            store.clear_chat(chat["phone"])
            _reply(chat, UNREGISTERED)
            return
        _reply(chat, "⚠️ I couldn't save the report just now (" + exc.message + "). Reply *1* to try again, or *cancel*.")
        return
    except Exception as exc:
        print("wa-router: submit error:", type(exc).__name__, exc, flush=True)
        _reply(chat, "⚠️ Something went wrong on our side. Reply *1* to try again, or *cancel*.")
        return

    photo_note = ""
    photo = data.get("photo")
    if photo:
        try:
            with open(photo["path"], "rb") as fh:
                content = fh.read()
            pb.attach_photo(res["complaint_id"], photo["filename"], content, photo["mime"])
        except Exception as exc:
            print("wa-router: photo attach failed:", type(exc).__name__, exc, flush=True)
            photo_note = "\n\n(Your photo couldn't be attached — the report itself is safely filed. You can add it from the app.)"
    store.clear_chat(chat["phone"])
    _reply(
        chat,
        "✅ Done! Your report was sent to *{inst}*.\n"
        "🔖 Tracking number: *{track}*\n\n"
        "Keep this number — check progress anytime by replying *track*.\n"
        "Thank you for helping improve public services, {name}! 🇬🇲{photo_note}".format(
            inst=res.get("institution_name") or "the institution",
            track=res.get("tracking_no") or "?",
            name=_first_name(chat),
            photo_note=photo_note,
        ),
    )


def _handle_track(chat: dict, text: str) -> None:
    candidate = (text or "").strip().upper()
    m = re.search(r"GMC-\d{4}-[A-Z0-9]{6,12}", candidate)
    if not m:
        _reply(chat, "That doesn't look like a tracking number. It looks like *GMC-2026-XXXXXXXXX* — send it and I'll check.")
        return
    try:
        res = pb.track(m.group())
    except Exception as exc:
        print("wa-router: track failed:", type(exc).__name__, exc, flush=True)
        _reply(chat, "Tracking is temporarily unavailable. Please try again in a minute.")
        return
    if not res:
        _reply(chat, "I couldn't find a report with that number. Check it and send it again — or reply *menu*.")
        return
    last = (res.get("timeline") or [{}])[-1]
    when = ""
    if last.get("at"):
        try:
            when = _dt.datetime.fromisoformat(last["at"].replace("Z", "+00:00")).strftime("%d %b %Y")
        except Exception:
            when = ""
    _reply(
        chat,
        f"🔖 *{res.get('tracking_no')}* — {res.get('title') or ''}\n"
        f"Status: {_humanize_status(res.get('status'))}\n"
        f"Handled by: {res.get('institution') or '—'}\n"
        + (f"Last update: {last.get('message') or ''}" + (f" ({when})" if when else "") + "\n" if last.get("message") else "")
        + "\nReply *menu* for more.",
    )


def _go_menu(chat: dict) -> None:
    store.update_chat(chat, state="menu", data={"options": []})
    _reply(chat, _menu_text(chat))


def handle_message(from_jid: str, text: str, image: dict | None = None, location: dict | None = None) -> None:
    """Entry point: serializes per-chat processing, then delegates."""
    phone = pb.normalize_phone((from_jid or "").split("@")[0])
    if not phone:
        return
    lock = _proc_lock(phone)
    if not lock.acquire(timeout=_PROC_TIMEOUT_S):
        print(f"wa-router: dropping message for {phone} — chat busy >{_PROC_TIMEOUT_S}s", flush=True)
        return
    try:
        _handle_message(from_jid, text, image, location)
    except Exception as exc:
        print("wa-router: handler crashed:", type(exc).__name__, exc, flush=True)
    finally:
        lock.release()


def _handle_message(from_jid: str, text: str, image: dict | None = None, location: dict | None = None) -> None:
    """Process one incoming WhatsApp message. Called on a worker thread."""
    store.reset_expired()
    phone = pb.normalize_phone((from_jid or "").split("@")[0])
    if not phone or from_jid.endswith("@g.us") or from_jid == "status@broadcast":
        return  # never answer groups or status broadcasts
    if not re.fullmatch(r"220[2367][0-9]{6}", phone):
        print(f"wa-router: ignoring non-Gambian JID {from_jid}", flush=True)
        return

    user = None
    try:
        user = pb.whois(phone)
    except Exception as exc:
        print("wa-router: whois failed:", type(exc).__name__, exc, flush=True)
        return  # PB down — stay quiet rather than lie
    if not user:
        chat = store.set_chat(phone, "menu", name="")
        _reply(chat, UNREGISTERED)
        return

    chat = store.get_chat(phone)
    if not chat:
        chat = store.set_chat(phone, "menu", name=user["full_name"] or user["name"])
        _reply(chat, _menu_text(chat) + "\n\n(Tip: reply *help* if you're not sure what to ask.)")
        return
    if not chat.get("name"):
        chat["name"] = user["full_name"] or user["name"]
        store.update_chat(chat)

    cleaned = (text or "").strip()
    command = cleaned.lower().translate(EMOJI_DIGITS).strip()
    state = chat.get("state", "menu")

    # Global escapes work at every step.
    if command in ("menu", "hi", "hello", "start"):
        return _go_menu(chat)
    if command in ("cancel", "stop", "quit"):
        store.update_chat(chat, state="menu", data={"options": []})
        return _reply(chat, "No problem — cancelled. 🙏\n\n" + _menu_text(chat))
    if command in ("help",):
        return _reply(chat, HELP)

    if state == "menu":
        choice = parse_choice(cleaned, 3)
        if choice == 1:
            return _prompt_report_service(chat)
        if choice == 2:
            store.update_chat(chat, state="track")
            return _reply(chat, "Send your tracking number — it looks like *GMC-2026-XXXXXXXXX*.")
        if choice == 3:
            return _reply(chat, HELP)
        return _reply(chat, "I didn't catch that.\n\n" + MENU)

    if state == "report_service":
        options = chat["data"].get("options", [])
        choice = parse_choice(cleaned, len(options))
        if choice is None:
            return _reply(chat, "Reply with a *number* from the list (or *cancel*), and I'll continue.")
        chosen = options[choice - 1]
        store.update_chat(chat, data_merge={
            "institution_id": chosen["id"],
            "institution_code": chosen.get("code") or "CENTRAL",
            "institution_name": chosen.get("name"),
        })
        return _prompt_report_category(chat)

    if state == "report_category":
        options = chat["data"].get("options", [])
        choice = parse_choice(cleaned, len(options))
        if choice is None:
            return _reply(chat, "Reply with a *number* from the list (or *cancel*).")
        chosen = options[choice - 1]
        store.update_chat(chat, data_merge={
            "category_slug": chosen.get("slug"),
            "category_name": chosen.get("name"),
        })
        return _prompt_report_desc(chat)

    if state == "report_desc":
        if len(cleaned) < 10:
            return _reply(chat, "A little more detail, please — at least a full sentence about what's wrong.")
        _, categories = _directory()
        cat_name = next((c["name"] for c in categories if c["slug"] == chat["data"].get("category_slug")), "")
        store.update_chat(chat, data_merge={
            "description": cleaned,
            "title": _auto_title(cat_name or chat["data"].get("category_name") or "Report", cleaned),
        })
        return _prompt_report_photo(chat)

    if state == "report_photo":
        if image:
            mime = image.get("mime") or "image/jpeg"
            if mime not in config.ALLOWED_PHOTO_MIMES:
                return _reply(chat, "That file type isn't supported — send a JPG, PNG or WebP image, or reply *skip*.")
            if image.get("size", 0) > config.MAX_PHOTO_BYTES:
                return _reply(chat, "That image is over 10 MB — send a smaller one, or reply *skip*.")
            store.update_chat(chat, data_merge={"photo": image})
            return _prompt_report_location(chat)
        if command in ("skip", "no", "later"):
            return _prompt_report_location(chat)
        return _reply(chat, "📷 Send the photo as an image, or reply *skip* to continue without one.")

    if state == "report_location":
        if location:
            landmark = location.get("name") or location.get("address") or "Shared pin location"
            store.update_chat(chat, data_merge={
                "landmark": landmark,
                "lat": float(location.get("lat") or 0),
                "lng": float(location.get("lng") or 0),
            })
            return _prompt_report_urgency(chat)
        if len(cleaned) < 3:
            return _reply(chat, "Tell me the area (e.g. 'Brikama, near the market'), drop a location pin 📍, or reply *cancel*.")
        store.update_chat(chat, data_merge={"landmark": cleaned, "lat": 0, "lng": 0})
        return _prompt_report_urgency(chat)

    if state == "report_urgency":
        choice = parse_choice(cleaned, 2)
        if choice is None:
            return _reply(chat, "Reply *1* for Normal or *2* for Urgent (risk to health or safety).")
        store.update_chat(chat, data_merge={"urgency": "high" if choice == 2 else "normal"})
        return _prompt_report_confirm(chat)

    if state == "report_confirm":
        choice = parse_choice(cleaned, 2)
        if choice == 1:
            return _submit(chat)
        if choice == 2:
            store.update_chat(chat, state="menu", data={"options": []})
            return _reply(chat, "Cancelled — nothing was sent.\n\n" + _menu_text(chat))
        return _reply(chat, "Reply *1* to send the report, or *2* to cancel.")

    if state == "track":
        return _handle_track(chat, cleaned)

    # Unknown state — reset gracefully.
    return _go_menu(chat)


def handle_image(from_jid: str, payload_image, caption: str | None, media_info: dict | None) -> None:
    """Normalize a GOWA image payload into the shape handle_message expects."""
    path = None
    if isinstance(payload_image, str):
        path = payload_image
        cap = None
    elif isinstance(payload_image, dict):
        path = payload_image.get("path") or payload_image.get("url")
        cap = payload_image.get("caption")
    if not path or not path.startswith("statics/"):
        # Auto-download off (or remote URL) — we don't fetch remote media.
        text = (caption or cap or "").strip() or ""
        return handle_message(from_jid, text or "", image=None)
    local = os.path.join(config.MEDIA_ROOT, path[len("statics/"):])
    if not os.path.exists(local):
        print(f"wa-router: media file missing: {local}", flush=True)
        text = ((caption or cap or "") + "").strip()
        return handle_message(from_jid, text or "", image=None)
    size = os.path.getsize(local)
    mime = (media_info or {}).get("mime_type") or _sniff_mime(local)
    text = ((caption or cap or "") + "").strip()
    handle_message(from_jid, text, image={"path": local, "filename": os.path.basename(local), "mime": mime, "size": size})


def _sniff_mime(path: str) -> str:
    try:
        with open(path, "rb") as fh:
            head = fh.read(12)
    except Exception:
        return "application/octet-stream"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return "application/octet-stream"
