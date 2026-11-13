// GamFix user-field guards + verified-only sign-in.
//
// PocketBase already handles the whole email-verification lifecycle natively
// (docs: Authentication + Sending emails): requestVerification emails the
// collection's default verification template, the link lands on the app's
// /verify/email?token=… page, and confirmVerification flips the record's
// verified flag. The same goes for password resets. No custom email/OTP
// routes here — the only hooks kept are the ones the SDK cannot do:
//
//   1. Only verified users may sign in (docs: onRecordAuthRequest — "could
//      be used to additionally validate" each successful auth request).
//   2. The browser never gets to choose its role or verification state.

// ---- 1. No verified email, no sign-in --------------------------------------
// Fires on every successful auth request for the users collection (password
// sign-in, token refresh, OTP, OAuth2). PocketBase auto-verifies OAuth2
// records on creation, so Google sign-in is unaffected. Unverified records
// get a 401 whose message the login screen recognizes and routes to
// /verify/email (where the native verification email can be resent).
onRecordAuthRequest((e) => {
  if (!e.record.getBool('verified')) {
    throw new UnauthorizedError('Please verify your email address first.')
  }
  return e.next()
}, 'users')

// ---- 2. Server-controlled user fields --------------------------------------
// (Guarding on Record create/update REQUEST events: these fire for API
// record requests from the browser, not for internal saves by hooks.)

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
      // Email rebind guard: PocketBase keeps verified=true when the email
      // changes, which would let an account rebind to an address it does not
      // own while keeping its verified status. Force re-verification instead.
      const beforeEmail = String(before.getString('email') || '').toLowerCase()
      const afterEmail = String(e.record.getString('email') || '').toLowerCase()
      if (afterEmail && afterEmail !== beforeEmail) {
        e.record.set('verified', false)
      }
    }
  } catch (err) {
    console.log('GamFix user update guard failed:', String(err || err))
  }
  e.next()
}, 'users')
