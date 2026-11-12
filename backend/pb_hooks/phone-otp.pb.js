// GamFix phone verification via the linked GOWA WhatsApp device.
// PocketBase serializes each route handler into an isolated runtime, so every
// helper used by a handler is intentionally declared inside that handler.

routerAdd("POST", "/api/gamfix/phone-otp/send", (e) => {
  try {
    if (!e.auth) return e.json(401, { error: "Authentication required" })

    let body = {}
    try {
      const info = e.requestInfo()
      if (info && info.body && typeof info.body === "object") body = info.body
    } catch (_) {}
    if (!body || typeof body !== "object" || !body.phone) {
      try {
        const raw = e.request.url.query().get("x")
        if (raw) body = JSON.parse(raw)
      } catch (_) {}
    }

    let phone = String(body.phone || "").replace(/[^0-9]/g, "")
    if (phone.startsWith("00")) phone = phone.slice(2)
    if (phone.startsWith("0")) phone = phone.replace(/^0+/, "")
    if (phone.startsWith("220") && phone.length === 10) phone = phone.slice(3)
    if (phone.length === 7) phone = "220" + phone
    // Gambian mobile numbers only: +220 followed by exactly 7 digits whose
    // first digit is 2 (Gamcel), 3 (Comium), 6 (Qcell) or 7 (Africell).
    // Landlines (4xx) and foreign numbers get no OTP at all.
    if (!/^220[2367][0-9]{6}$/.test(phone)) {
      return e.json(400, { error: "GamFix verifies Gambian mobile numbers only. Enter your 7-digit number (e.g. 7555123) starting with 2, 3, 6 or 7." })
    }

    const user = $app.findRecordById("users", e.auth.id)
    if (user.getBool("phone_verified")) return e.json(409, { error: "Phone is already verified." })
    const owners = $app.findRecordsByFilter(
      "users",
      'phone = "' + phone + '" && id != "' + e.auth.id + '"',
      "",
      10,
      0
    )
    if (owners.length > 0) {
      return e.json(409, { error: "This phone number is already linked to another GamFix account." })
    }

    const store = $app.store()
    const storeKey = "gamfix_phone_otp:" + e.auth.id
    let prior = null
    try {
      const saved = store.get(storeKey)
      if (saved) prior = JSON.parse(String(saved))
    } catch (_) {}
    const now = Date.now()
    if (prior && now - Number(prior.sentAt || 0) < 60000) {
      return e.json(429, { error: "Too many codes requested. Please wait before trying again." })
    }

    const basic = $os.getenv("GOWA_BASIC_AUTH")
    const base = ($os.getenv("GOWA_BASE_URL") || "http://127.0.0.1:3000").replace(/\/+$/, "")
    const device = $os.getenv("GOWA_DEVICE_ID") || "wa-2205111924"
    if (!basic) return e.json(503, { error: "WhatsApp delivery is not configured." })

    // Encode UTF-8 bytes for HTTP Basic authentication without browser-only btoa().
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    const bytes = []
    for (let i = 0; i < basic.length; i++) {
      let cp = basic.charCodeAt(i)
      if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < basic.length) {
        const low = basic.charCodeAt(i + 1)
        if (low >= 0xdc00 && low <= 0xdfff) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00)
          i++
        }
      }
      if (cp < 0x80) bytes.push(cp)
      else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
      else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
      else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    }
    let encoded = ""
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i]
      const hasB = i + 1 < bytes.length
      const hasC = i + 2 < bytes.length
      const b = hasB ? bytes[i + 1] : 0
      const c = hasC ? bytes[i + 2] : 0
      encoded += alphabet[a >> 2]
      encoded += alphabet[((a & 3) << 4) | (b >> 4)]
      encoded += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : "="
      encoded += hasC ? alphabet[c & 63] : "="
    }

    const code = $security.randomStringWithAlphabet(6, "0123456789")
    let response
    try {
      response = $http.send({
        url: base + "/send/message",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + encoded,
          "X-Device-Id": device,
        },
        body: JSON.stringify({
          phone: phone,
          message: "Your GamFix phone verification code is " + code + ". It expires in 10 minutes. Do not share this code.",
        }),
        timeout: 20,
      })
    } catch (_) {
      console.log("GamFix GOWA OTP send failed")
      return e.json(502, { error: "WhatsApp delivery failed. Please try again in a few minutes." })
    }
    if (!response || response.statusCode < 200 || response.statusCode >= 300) {
      return e.json(502, { error: "WhatsApp delivery failed. Please try again in a few minutes." })
    }

    store.set(storeKey, JSON.stringify({
      phone: phone,
      code: code,
      sentAt: now,
      expiresAt: now + 10 * 60 * 1000,
      attempts: 0,
    }))
    return e.json(200, { sent: true, message: "We sent a verification code to your WhatsApp." })
  } catch (_) {
    console.log("GamFix phone OTP send route failed")
    return e.json(500, { error: "Phone verification could not start. Please try again." })
  }
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/gamfix/phone-otp/verify", (e) => {
  try {
    if (!e.auth) return e.json(401, { error: "Authentication required" })

    let body = {}
    try {
      const info = e.requestInfo()
      if (info && info.body && typeof info.body === "object") body = info.body
    } catch (_) {}
    if (!body || typeof body !== "object" || !body.code) {
      try {
        const raw = e.request.url.query().get("x")
        if (raw) body = JSON.parse(raw)
      } catch (_) {}
    }
    const code = String(body.code || "").trim()
    if (!/^[0-9]{6}$/.test(code)) {
      return e.json(400, { error: "Enter the 6-digit code sent to your WhatsApp." })
    }

    const store = $app.store()
    const storeKey = "gamfix_phone_otp:" + e.auth.id
    let challenge = null
    try {
      const saved = store.get(storeKey)
      if (saved) challenge = JSON.parse(String(saved))
    } catch (_) {}
    if (!challenge || Date.now() > Number(challenge.expiresAt || 0)) {
      store.remove(storeKey)
      return e.json(400, { error: "No active code. Request a new one." })
    }
    if (Number(challenge.attempts || 0) >= 5) {
      return e.json(429, { error: "Too many wrong attempts. Request a new code." })
    }
    if (code !== String(challenge.code)) {
      challenge.attempts = Number(challenge.attempts || 0) + 1
      store.set(storeKey, JSON.stringify(challenge))
      return e.json(400, { error: "That code is not correct. Check and try again." })
    }

    const owners = $app.findRecordsByFilter(
      "users",
      'phone = "' + challenge.phone + '" && id != "' + e.auth.id + '"',
      "",
      10,
      0
    )
    if (owners.length > 0) {
      store.remove(storeKey)
      return e.json(409, { error: "This phone number is already linked to another GamFix account." })
    }

    const user = $app.findRecordById("users", e.auth.id)
    user.set("phone", challenge.phone)
    user.set("phone_verified", true)
    try {
      $app.save(user)
    } catch (_) {
      // Recheck after a save conflict so concurrent attempts get a clear duplicate error.
      try {
        const currentOwners = $app.findRecordsByFilter(
          "users",
          'phone = "' + challenge.phone + '" && id != "' + e.auth.id + '"',
          "",
          10,
          0
        )
        if (currentOwners.length > 0) {
          store.remove(storeKey)
          return e.json(409, { error: "This phone number is already linked to another GamFix account." })
        }
      } catch (_) {}
      console.log("GamFix phone verification save failed")
      return e.json(500, { error: "The code was correct, but we could not save your phone verification. Please try again." })
    }

    store.remove(storeKey)
    return e.json(200, { verified: true, message: "Phone verified successfully." })
  } catch (_) {
    console.log("GamFix phone OTP verify route failed")
    return e.json(500, { error: "Phone verification could not be completed. Please try again." })
  }
}, $apis.requireAuth("users"))
