// GamFix one-time staff account bootstrap.
// Creates the allowlisted admin + institution officer accounts exactly like
// the original fn_sync_account_access mapping (backend/db 0018):
//   admin@pocketsoftware.dev            -> role admin
//   nawec@/kmc@/nra@/nea@/police@pocketsoftware.dev -> officers of NAWEC/KMC/NRA/NEA/POLICE
//
// Security: the route only answers when the caller sends the random
// X-Bootstrap-Token stored in the VPS environment (STAFF_BOOTSTRAP_TOKEN),
// and it permanently disables itself by writing the admin_settings key
// "staff_bootstrap_done" after the first successful run.

routerAdd('POST', '/api/gamfix/staff-bootstrap', (e) => {
  try {
    const expected = $os.getenv('STAFF_BOOTSTRAP_TOKEN') || ''
    if (!expected) return e.json(404, { error: 'bootstrap disabled' })
    let supplied = ''
    try { supplied = e.request.header.get('X-Bootstrap-Token') || '' } catch (_) {}
    if (!supplied || supplied !== expected) return e.json(404, { error: 'bootstrap disabled' })

    if ($app.findRecordsByFilter('admin_settings', 'key = "staff_bootstrap_done"', '', 1, 0).length) {
      return e.json(409, { error: 'bootstrap already completed' })
    }

    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const newPass = () => $security.randomStringWithAlphabet(14, alphabet) + '!7Aa'
    const usersCol = $app.findCollectionByNameOrId('users')
    const officersCol = $app.findCollectionByNameOrId('officers')
    const accounts = []

    const ensureUser = (email, role, fullName) => {
      const lower = String(email).toLowerCase()
      let user = null
      try { user = $app.findAuthRecordByEmail('users', lower) } catch (_) { user = null }
      if (!user) {
        const password = newPass()
        user = new Record(usersCol)
        user.set('email', lower)
        user.set('password', password)
        user.set('passwordConfirm', password)
        user.set('full_name', fullName)
        user.set('role', role)
        user.set('verified', true)
        user.set('emailVisibility', true)
        if (role !== 'admin') {
          // institution set below after lookup
        }
        $app.save(user)
        accounts.push({ email: lower, role, password })
      } else {
        if (user.getString('role') !== role) {
          user.set('role', role)
          $app.save(user)
        }
        accounts.push({ email: lower, role, password: null })
      }
      return user
    }

    // Owner/admin account.
    ensureUser('admin@pocketsoftware.dev', 'admin', 'GamFix Administrator')

    // Five allowlisted institution officers.
    const mapping = [
      ['nawec@pocketsoftware.dev', 'NAWEC'],
      ['kmc@pocketsoftware.dev', 'KMC'],
      ['nra@pocketsoftware.dev', 'NRA'],
      ['nea@pocketsoftware.dev', 'NEA'],
      ['police@pocketsoftware.dev', 'POLICE'],
    ]
    for (const [email, code] of mapping) {
      let inst = null
      try { inst = $app.findFirstRecordByFilter('institutions', 'code = {:c}', { c: code }) } catch (_) { inst = null }
      if (!inst) {
        accounts.push({ email, role: 'officer', error: 'institution missing: ' + code })
        continue
      }
      const user = ensureUser(email, 'officer', inst.getString('name') + ' Staff')
      user.set('institution', inst.id)
      $app.save(user)
      let officerRow = null
      const rows = $app.findRecordsByFilter('officers', 'email = {:m}', '', 1, 0, { m: String(email).toLowerCase() })
      if (rows.length) {
        officerRow = rows[0]
      } else {
        officerRow = new Record(officersCol)
        officerRow.set('name', inst.getString('name') + ' Officer')
        officerRow.set('email', String(email).toLowerCase())
        officerRow.set('is_active', true)
      }
      officerRow.set('user', user.id)
      officerRow.set('institution', inst.id)
      officerRow.set('role', 'officer')
      $app.save(officerRow)
    }

    const done = new Record($app.findCollectionByNameOrId('admin_settings'))
    done.set('key', 'staff_bootstrap_done')
    done.set('value', { completed_at: new Date().toISOString() })
    $app.save(done)

    return e.json(200, { ok: true, accounts })
  } catch (err) {
    console.log('GamFix staff bootstrap failed: ' + (err && err.message ? err.message : 'unknown'))
    return e.json(500, { error: 'bootstrap_failed' })
  }
})
