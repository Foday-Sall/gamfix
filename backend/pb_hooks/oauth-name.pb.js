// GamFix OAuth2 (Google) new-user prefill.
//
// When a citizen signs up with Google, copy the profile display name into
// the PB `name` field so the UI can greet them and prefill the onboarding
// step. `full_name` is deliberately NOT set here: leaving it empty is what
// routes first-time Google users through the name-confirmation step instead
// of silently trusting whatever the Google profile says.
//
// PocketBase serializes each route handler into an isolated runtime — keep
// helpers inside the handler.

onRecordAuthWithOAuth2Request((e) => {
  try {
    if (!e.isNewRecord) return e.next()
    const profileName = (() => {
      try { return String((e.oAuth2User && e.oAuth2User.name) || "").trim() } catch (_) { return "" }
    })()
    if (!profileName) return e.next()
    try {
      if (e.record && !String(e.record.getString("name") || "").trim()) {
        e.record.set("name", profileName)
      }
    } catch (_) {}
    try {
      if (e.createData && typeof e.createData === "object" && !String(e.createData.name || "").trim()) {
        e.createData.name = profileName
      }
    } catch (_) {}
  } catch (err) {
    console.log("GamFix OAuth2 name prefill failed:", String(err || err))
  }
  e.next()
}, "users")
