// GamFix email + password OTP routes and user-field guards.
//
// The original UI asks for 6-digit email codes (VerifyEmail / ResetPassword
// screens). PocketBase's native email flow is link-based, so these routes
// generate and email real codes and verify them, keeping the original UI.
//
// Each handler is self-contained: PocketBase serializes route handlers into
// an isolated JSVM runtime, so helpers live inside the handler.

function gamfixOtpRoute(method, path, kind) {
  // kind: 'email' (verify signup email) | 'password' (reset password)
  routerAdd(method, path, (e) => {
    // Handlers run in an isolated JSVM runtime: closure variables from the
    // registration helper are gone, so derive kind/suffix from the URL.
    const urlPath = (() => { try { return String(e.request.url.path || '') } catch (_) { return '' } })()
    const kindHere = urlPath.indexOf('/password-otp/') !== -1 ? 'password' : 'email'
    const isSend = urlPath.endsWith('/send')
    const jsonError = (ev, status, message) => ev.json(status, { error: message })
    const bodyOf = (ev) => {
      try {
        const info = ev.requestInfo()
        if (info && info.body && typeof info.body === 'object') return info.body
      } catch (_) {}
      try {
        const raw = ev.request.url.query().get('x')
        if (raw) return JSON.parse(raw) || {}
      } catch (_) {}
      return {}
    }

    try {
      const body = bodyOf(e)
      const email = String(body.email || '').trim().toLowerCase()
      const code = String(body.code || '').trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return jsonError(e, 400, 'Enter a valid email address.')
      }

      const store = $app.store()
      const storeKey = (mail) => 'gamfix_otp:' + kindHere + ':' + String(mail).toLowerCase()
      let user = null
      try { user = $app.findAuthRecordByEmail('users', email) } catch (_) {}

      if (isSend) {
        const now = Date.now()
        if (!user) {
          // Never reveal whether the account exists.
          return e.json(200, { sent: true, message: 'If an account exists for this email, a code was sent.' })
        }
        if (kindHere === 'email' && user.getBool('verified')) {
          return e.json(200, { sent: true, alreadyVerified: true, message: 'This email is already verified. You can sign in.' })
        }
        const prior = (() => { try { const s = store.get(storeKey(email)); return s ? JSON.parse(String(s)) : null } catch (_) { return null } })()
        if (prior && now - Number(prior.sentAt || 0) < 60000) {
          return jsonError(e, 429, 'Too many codes requested. Please wait a minute and try again.')
        }

        const mailCode = $security.randomStringWithAlphabet(6, '0123456789')
        const sender = (() => { try { return $app.settings().meta.senderAddress || '' } catch (_) { return '' } })()
        const senderName = (() => { try { return $app.settings().meta.senderName || 'GamFix' } catch (_) { return 'GamFix' } })()
        const purpose = kindHere === 'email' ? 'verify your GamFix email' : 'reset your GamFix password'
        try {
          // The JSVM needs mail.Address structs, not plain strings.
          const message = {
            to: [{ address: email, name: '' }],
            subject: 'Your GamFix code: ' + mailCode,
            html: '<p>Your GamFix code to ' + purpose + ' is <b>' + mailCode + '</b>.</p><p>It expires in 15 minutes. Do not share this code. If you did not request it, ignore this email.</p>',
            text: 'Your GamFix code to ' + purpose + ' is ' + mailCode + '. It expires in 15 minutes. Do not share this code.',
          }
          if (sender) message.from = { address: sender, name: senderName }
          $app.newMailClient().send(message)
        } catch (err) {
          console.log('GamFix OTP mail send failed:', String(err || err))
          return jsonError(e, 503, 'We could not send the email right now. Please try again in a few minutes.')
        }
        store.set(storeKey(email), JSON.stringify({ code: mailCode, sentAt: now, expiresAt: now + 15 * 60 * 1000, attempts: 0 }))
        return e.json(200, { sent: true, message: 'If an account exists for this email, a code was sent.' })
      }

      // ---- verify ----
      if (!/^[0-9]{6}$/.test(code)) return jsonError(e, 400, 'Enter the 6-digit code from your email.')
      const saved = (() => { try { const s = store.get(storeKey(email)); return s ? JSON.parse(String(s)) : null } catch (_) { return null } })()
      if (!saved || Date.now() > Number(saved.expiresAt || 0)) {
        store.remove(storeKey(email))
        return jsonError(e, 400, 'No active code. Request a new one.')
      }
      if (Number(saved.attempts || 0) >= 5) {
        return jsonError(e, 429, 'Too many wrong attempts. Request a new code.')
      }
      if (!user || code !== String(saved.code)) {
        saved.attempts = Number(saved.attempts || 0) + 1
        store.set(storeKey(email), JSON.stringify(saved))
        return jsonError(e, 400, 'That code is not correct. Check and try again.')
      }
      store.remove(storeKey(email))

      if (kindHere === 'email') {
        user.set('verified', true)
        $app.save(user)
        return e.json(200, { verified: true, message: 'Email verified successfully.' })
      }

      // Password reset: mint a fresh auth session so the app's password
      // step can save the new password through the normal API.
      const token = user.newAuthToken()
      return e.json(200, { token: token, record: user })
    } catch (err) {
      console.log('GamFix OTP route failed:', String(err || err))
      return jsonError(e, 500, 'Something went wrong. Please try again.')
    }
  })
}

gamfixOtpRoute('POST', '/api/gamfix/email-otp/send', 'email')
gamfixOtpRoute('POST', '/api/gamfix/email-otp/verify', 'email')
gamfixOtpRoute('POST', '/api/gamfix/password-otp/send', 'password')
gamfixOtpRoute('POST', '/api/gamfix/password-otp/verify', 'password')

// ---- Server-controlled user fields -----------------------------------------
// The browser never gets to choose its role or verification state.

onRecordCreateRequest((e) => {
  try {
    const isSuper = e.auth && e.auth.collection().name === '_superusers'
    if (!isSuper) {
      e.record.set('role', 'citizen')
      e.record.set('verified', false)
      e.record.set('phone_verified', false)
    }
  } catch (err) {
    console.log('GamFix user create guard failed:', String(err || err))
  }
  e.next()
}, 'users')

onRecordUpdateRequest((e) => {
  try {
    const isSuper = e.auth && e.auth.collection().name === '_superusers'
    if (!isSuper) {
      const before = $app.findRecordById('users', e.record.id)
      ;['role', 'verified', 'phone_verified', 'phone'].forEach((field) => {
        e.record.set(field, before.get(field))
      })
    }
  } catch (err) {
    console.log('GamFix user update guard failed:', String(err || err))
  }
  e.next()
}, 'users')
