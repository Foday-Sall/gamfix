// GamFix admin console API — port of backend/functions/admin-api,
// admin-secrets and admin-whatsapp (backend/db 0011 semantics).
// PocketBase serializes each route handler into an isolated JSVM runtime, so
// every helper is declared INSIDE its handler. Only the exact-email admin
// account (admin@pocketsoftware.dev with role=admin) may call these routes.

// ---- POST /api/gamfix/admin (14 panel actions) ------------------------------
routerAdd('POST', '/api/gamfix/admin', (e) => {
  try {
    if (!e.auth) return e.json(401, { error: 'invalid_token' })
    const user = $app.findRecordById('users', e.auth.id)
    const adminEmail = user.getString('email').toLowerCase()
    const isAdmin = user.getString('role') === 'admin' && adminEmail === 'admin@pocketsoftware.dev'
    if (!isAdmin) return e.json(401, { error: 'invalid_token' })

    let body = {}
    try { const info = e.requestInfo(); if (info && info.body && typeof info.body === 'object') body = info.body } catch (_) {}
    const action = String(body.action || '')
    const params = (body.params && typeof body.params === 'object') ? body.params : {}

    const denied = () => ({ ok: false, error: 'not_authorized' })
    const iso = (row, field) => {
      try { const t = new Date(row.getDateTime(field).string()); return isNaN(t.getTime()) ? null : t.toISOString() } catch (_) { return null }
    }
    const audit = (tx, act, targetType, targetId, details) => {
      const row = new Record($app.findCollectionByNameOrId('admin_audit_log'))
      row.set('actor_email', adminEmail)
      row.set('action', act)
      row.set('target_type', targetType || null)
      row.set('target_id', targetId || null)
      row.set('details', details || {})
      tx.save(row)
    }
    const instUrl = (inst) => {
      const logoFile = inst.getString('logo')
      if (logoFile) {
        const fileBase = () => {
          let host = ''
          try { host = String(e.request.Host || e.request.host || '') } catch (_) {}
          if (host) {
            let proto = ''
            try { proto = String(e.request.Header.Get('X-Forwarded-Proto') || e.request.header.Get('X-Forwarded-Proto') || '') } catch (_) {}
            return (proto || 'https').toLowerCase() + '://' + host
          }
          try {
            const m = $app.settings().meta
            const u = String(m.appURL || m.appUrl || '')
            if (u) return u
          } catch (_) {}
          return 'https://15.224.0.22.sslip.io'
        }
        const base = fileBase().replace(/\/?$/, '/')
        return base + 'api/files/institutions/' + inst.id + '/' + logoFile
      }
      return String(inst.getString('logo_url') || '') || null
    }
    const instDto = (inst, openCount, officerCount) => ({
      id: inst.id,
      name: inst.getString('name'),
      code: inst.getString('code'),
      contact: inst.get('contact') || { email: '', phone: '' },
      access_level: inst.getString('access_level') || 'restricted',
      allowed_categories: inst.get('allowed_categories') || [],
      sla_hours: inst.getInt('sla_hours') || 48,
      max_complaints_per_day: inst.getInt('max_complaints_per_day') || 100,
      open_complaints: openCount,
      officer_count: officerCount,
      status: inst.getString('status') || 'active',
      logo_url: instUrl(inst),
    })
    const officerDto = (row) => {
      let instName = ''
      try { instName = $app.findRecordById('institutions', row.getString('institution')).getString('name') } catch (_) {}
      return {
        id: row.id,
        institution_id: row.getString('institution'),
        institution_name: instName,
        name: row.getString('name'),
        email: row.getString('email'),
        role: row.getString('role') || 'officer',
        department: row.getString('department') || '',
        is_active: row.getBool('is_active'),
        created_at: iso(row, 'created'),
      }
    }
    const countBy = (collection, filter, paramsMap) =>
      $app.findRecordsByFilter(collection, filter, '', 0, 0, paramsMap || {}).length

    if (action === 'getOverviewStats') {
      const complaints = $app.findRecordsByFilter('complaints', '', '-created', 5000, 0)
      const catNames = {}
      const catRows = $app.findRecordsByFilter('categories', '', '', 500, 0)
      for (const cat of catRows) catNames[cat.id] = cat.getString('name')
      const firstResponse = {}
      try {
        const updateRows = $app.findRecordsByFilter('complaint_updates', 'actor_label != "system"', '+created', 5000, 0)
        for (const up of updateRows) {
          const cid = up.getString('complaint')
          if (!firstResponse[cid]) firstResponse[cid] = iso(up, 'created')
        }
      } catch (_) {}
      const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
      let escalatedToday = 0
      try {
        const escRows = $app.findRecordsByFilter(
          'complaint_updates', 'update_type = "escalation" && created >= {:since}', '', 0, 0,
          { since: new Date(todayStart).toISOString().replace('T', ' ') }
        )
        escalatedToday = escRows.length
      } catch (_) {}

      let total = 0, open = 0, frSum = 0, frCount = 0
      const byCategory = {}
      const daily = {}
      for (let i = 13; i >= 0; i--) {
        const key = new Date(todayStart - i * 86400000).toISOString().slice(0, 10)
        daily[key] = 0
      }
      const now = Date.now()
      for (const row of complaints) {
        total++
        const status = row.getString('status')
        if (!['closed', 'rejected'].includes(status)) open++
        const category = catNames[row.getString('category')] || 'uncategorized'
        byCategory[category] = (byCategory[category] || 0) + 1
        const created = iso(row, 'created')
        if (created) {
          const key = created.slice(0, 10)
          if (daily[key] !== undefined) daily[key]++
          const fr = firstResponse[row.id]
          if (fr) {
            frSum += (new Date(fr).getTime() - new Date(created).getTime()) / 60000
            frCount++
          }
        }
      }
      void now
      const perCategory = Object.keys(byCategory).map((k) => ({ category: k, count: byCategory[k] }))
      return e.json(200, {
        ok: true,
        total,
        open,
        escalated_today: escalatedToday,
        avg_first_response_minutes: frCount ? Math.round((frSum / frCount) * 10) / 10 : 0,
        per_category: perCategory,
        daily: Object.keys(daily).sort().map((key) => ({ date: key, count: daily[key] })),
      })
    }

    if (action === 'getInstitutions') {
      const rows = $app.findRecordsByFilter('institutions', '', 'name', 500, 0)
      const out = rows.map((inst) => instDto(
        inst,
        countBy('complaints', 'institution = {:i} && status != "closed" && status != "rejected"', { i: inst.id }),
        countBy('officers', 'institution = {:i}', { i: inst.id })
      ))
      return e.json(200, out)
    }

    if (action === 'createInstitution') {
      const name = String(params.p_name || '').trim()
      const shortcode = String(params.p_shortcode || '').trim().toUpperCase()
      if (!name || !shortcode) return e.json(200, { ok: false, error: 'missing_fields' })
      const existing = $app.findRecordsByFilter('institutions', 'code = {:c}', '', 1, 0, { c: shortcode })
      if (existing.length) return e.json(200, { ok: false, error: 'shortcode_taken' })
      const col = $app.findCollectionByNameOrId('institutions')
      const row = new Record(col)
      row.set('code', shortcode)
      row.set('name', name)
      row.set('contact', { email: String(params.p_contact_email || ''), phone: String(params.p_phone || '') })
      row.set('allowed_categories', Array.isArray(params.p_category_scope) ? params.p_category_scope : [])
      row.set('access_level', 'restricted')
      row.set('status', 'active')
      row.set('sla_hours', 48)
      row.set('max_complaints_per_day', 100)
      row.set('active', true)
      $app.save(row)
      $app.runInTransaction((tx) => audit(tx, 'create_institution', 'institution', row.id, { name, code: shortcode }))
      return e.json(200, instDto(row, 0, 0))
    }

    if (action === 'getOfficers') {
      const rows = $app.findRecordsByFilter('officers', '', '-created', 500, 0)
      return e.json(200, rows.map(officerDto))
    }

    if (action === 'createOfficer') {
      const name = String(params.p_name || '').trim()
      const email = String(params.p_email || '').trim().toLowerCase()
      const instId = String(params.p_institution_id || '')
      const role = String(params.p_role || 'officer')
      const department = String(params.p_department || '').trim()
      if (!name || !email || !instId) return e.json(200, { ok: false, error: 'missing_fields' })
      let inst = null
      try { inst = $app.findRecordById('institutions', instId) } catch (_) { inst = null }
      if (!inst) return e.json(200, { ok: false, error: 'institution_not_found' })
      if ($app.findRecordsByFilter('officers', 'email = {:m}', '', 1, 0, { m: email }).length ||
          $app.findRecordsByFilter('users', 'email = {:m}', '', 1, 0, { m: email }).length) {
        return e.json(200, { ok: false, error: 'email_taken' })
      }
      const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
      const temporaryPassword = $security.randomStringWithAlphabet(12, alphabet) + '!7Aa'
      const usersCol = $app.findCollectionByNameOrId('users')
      const user = new Record(usersCol)
      user.set('email', email)
      user.set('password', temporaryPassword)
      user.set('passwordConfirm', temporaryPassword)
      user.set('full_name', name)
      user.set('role', 'officer')
      user.set('verified', true)
      user.set('emailVisibility', true)
      user.set('institution', instId)
      if (department) user.set('department', department)
      $app.save(user)
      const officerRow = new Record($app.findCollectionByNameOrId('officers'))
      officerRow.set('name', name)
      officerRow.set('email', email)
      officerRow.set('user', user.id)
      officerRow.set('institution', instId)
      officerRow.set('department', department)
      officerRow.set('role', ['institution-admin', 'officer', 'view-only'].includes(role) ? role : 'officer')
      officerRow.set('is_active', true)
      $app.save(officerRow)
      $app.runInTransaction((tx) => audit(tx, 'invite_officer', 'officer', officerRow.id, {
        name, email, institution_id: instId, role, department,
      }))
      return e.json(200, { ok: true, officer: officerDto(officerRow), temporaryPassword })
    }

    if (action === 'toggleOfficerActive') {
      let row = null
      try { row = $app.findRecordById('officers', String(params.p_officer_id || '')) } catch (_) { row = null }
      if (!row) return e.json(200, { ok: false, error: 'officer_not_found' })
      row.set('is_active', !!params.p_active)
      $app.save(row)
      $app.runInTransaction((tx) => audit(tx, 'toggle_officer_active', 'officer', row.id, { is_active: !!params.p_active }))
      return e.json(200, officerDto(row))
    }

    if (action === 'getAccessLimits') {
      let inst = null
      try { inst = $app.findRecordById('institutions', String(params.p_institution_id || '')) } catch (_) { inst = null }
      if (!inst) return e.json(200, denied())
      return e.json(200, {
        id: inst.id,
        access_level: inst.getString('access_level') || 'restricted',
        allowed_categories: inst.get('allowed_categories') || [],
        sla_hours: inst.getInt('sla_hours') || 48,
        max_complaints_per_day: inst.getInt('max_complaints_per_day') || 100,
      })
    }

    const updateInstitution = (instId, setter, act, details) => {
      let inst = null
      try { inst = $app.findRecordById('institutions', String(instId || '')) } catch (_) { inst = null }
      if (!inst) return { ok: false, error: 'institution_not_found' }
      setter(inst)
      $app.save(inst)
      $app.runInTransaction((tx) => audit(tx, act, 'institution', inst.id, details))
      return { ok: true }
    }

    if (action === 'setAccessLevel') {
      const level = String(params.p_level || '')
      if (!['full', 'restricted', 'view-only'].includes(level)) {
        return e.json(200, { ok: false, error: 'invalid_access_level' })
      }
      return e.json(200, updateInstitution(params.p_institution_id, (i) => i.set('access_level', level), 'set_access_level', { access_level: level }))
    }
    if (action === 'setAllowedCategories') {
      const cats = Array.isArray(params.p_categories) ? params.p_categories : []
      return e.json(200, updateInstitution(params.p_institution_id, (i) => i.set('allowed_categories', cats), 'set_allowed_categories', { allowed_categories: cats }))
    }
    if (action === 'setSlaHours') {
      const hours = Number(params.p_hours)
      if (!hours || hours < 1) return e.json(200, { ok: false, error: 'invalid_sla_hours' })
      return e.json(200, updateInstitution(params.p_institution_id, (i) => i.set('sla_hours', Math.round(hours)), 'set_sla_hours', { sla_hours: Math.round(hours) }))
    }
    if (action === 'setRateLimit') {
      const max = Number(params.p_max)
      if (!max || max < 1) return e.json(200, { ok: false, error: 'invalid_rate_limit' })
      return e.json(200, updateInstitution(params.p_institution_id, (i) => i.set('max_complaints_per_day', Math.round(max)), 'set_rate_limit', { max_complaints_per_day: Math.round(max) }))
    }

    if (action === 'getAuditLog') {
      const limit = Math.min(Math.max(Number(params.p_limit || 100) || 100, 1), 500)
      const rows = $app.findRecordsByFilter('admin_audit_log', '', '-created', limit, 0)
      return e.json(200, rows.map((row) => ({
        id: row.id,
        actor_email: String(row.getString('actor_email') || ''),
        action: row.getString('action'),
        target_type: row.getString('target_type') || null,
        target_id: row.getString('target_id') || null,
        details: row.get('details') || {},
        created_at: iso(row, 'created'),
      })))
    }

    if (action === 'getSettings') {
      const rows = $app.findRecordsByFilter('admin_settings', 'key = "dashboard"', '', 1, 0)
      return e.json(200, rows.length ? (rows[0].get('value') || {}) : {})
    }
    if (action === 'saveSettings') {
      const value = params.p_settings
      if (!value || typeof value !== 'object') return e.json(200, { ok: false, error: 'invalid_settings' })
      const rows = $app.findRecordsByFilter('admin_settings', 'key = "dashboard"', '', 1, 0)
      let row = null
      if (rows.length) {
        row = rows[0]
        row.set('value', value)
        $app.save(row)
      } else {
        row = new Record($app.findCollectionByNameOrId('admin_settings'))
        row.set('key', 'dashboard')
        row.set('value', value)
        $app.save(row)
      }
      $app.runInTransaction((tx) => audit(tx, 'save_settings', 'settings', null, {}))
      return e.json(200, { ok: true })
    }

    return e.json(400, { error: 'unknown_action' })
  } catch (err) {
    console.log('GamFix admin route failed: ' + (err && err.message ? err.message : 'unknown'))
    return e.json(500, { error: 'internal_error' })
  }
})

// ---- POST /api/gamfix/admin-secrets -----------------------------------------
routerAdd('POST', '/api/gamfix/admin-secrets', (e) => {
  try {
    if (!e.auth) return e.json(401, { error: 'invalid_token' })
    const user = $app.findRecordById('users', e.auth.id)
    const adminEmail = user.getString('email').toLowerCase()
    const isAdmin = user.getString('role') === 'admin' && adminEmail === 'admin@pocketsoftware.dev'
    if (!isAdmin) return e.json(401, { error: 'invalid_token' })

    let body = {}
    try { const info = e.requestInfo(); if (info && info.body && typeof info.body === 'object') body = info.body } catch (_) {}
    const action = String(body.action || '')
    const params = (body.params && typeof body.params === 'object') ? body.params : {}
    const audit = (act, key, details) => {
      const row = new Record($app.findCollectionByNameOrId('admin_audit_log'))
      row.set('actor_email', adminEmail)
      row.set('action', act)
      row.set('target_type', 'secret')
      row.set('target_id', key || null)
      row.set('details', details || {})
      $app.save(row)
    }
    const ENV_KEYS = ['GOWA_BASE_URL', 'GOWA_BASIC_AUTH', 'GOWA_DEVICE_ID']

    if (action === 'list') {
      const rows = $app.findRecordsByFilter('app_secrets', '', 'key', 500, 0)
      const entries = rows.map((row) => ({ key: row.getString('key'), set: true, updated_at: null }))
      for (const key of ENV_KEYS) {
        if ($os.getenv(key)) entries.push({ key, set: true, updated_at: null })
      }
      return e.json(200, { ok: true, data: { entries } })
    }
    if (action === 'get_status') {
      const managed = $app.findRecordsByFilter('app_secrets', '', '', 0, 0).length
      let envCount = 0
      for (const key of ENV_KEYS) if ($os.getenv(key)) envCount++
      return e.json(200, { ok: true, data: { ok: true, keys_managed: managed + envCount, last_reload_ok: true, last_reload_at: Date.now() } })
    }
    if (action === 'set') {
      const key = String(params.key || '').trim()
      const value = String(params.value || '')
      if (!key || !value) return e.json(200, { error: 'missing_key_or_value' })
      if (ENV_KEYS.includes(key)) {
        return e.json(200, { error: 'env_managed_key: this key is set in the VPS environment file' })
      }
      const rows = $app.findRecordsByFilter('app_secrets', 'key = {:k}', '', 1, 0, { k: key })
      if (rows.length) {
        rows[0].set('value', value)
        $app.save(rows[0])
      } else {
        const row = new Record($app.findCollectionByNameOrId('app_secrets'))
        row.set('key', key)
        row.set('value', value)
        $app.save(row)
      }
      audit('secret_set', key, {})
      return e.json(200, { ok: true, data: { key } })
    }
    if (action === 'delete') {
      const key = String(params.key || '').trim()
      const rows = $app.findRecordsByFilter('app_secrets', 'key = {:k}', '', 1, 0, { k: key })
      if (!rows.length) return e.json(200, { error: 'not_found' })
      $app.delete(rows[0])
      audit('secret_delete', key, {})
      return e.json(200, { ok: true, data: { key } })
    }
    if (action === 'get_audit') {
      const limit = Math.min(Math.max(Number(params.limit || 50) || 50, 1), 200)
      const rows = $app.findRecordsByFilter('admin_audit_log', 'action ~ "secret_"', '-created', limit, 0)
      return e.json(200, {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          action: row.getString('action'),
          key: row.getString('target_id') || '',
          created_at: null,
          admin_email: row.getString('actor_email') || null,
        })),
      })
    }
    return e.json(400, { error: 'unknown_action' })
  } catch (err) {
    console.log('GamFix admin-secrets failed: ' + (err && err.message ? err.message : 'unknown'))
    return e.json(500, { error: 'internal_error' })
  }
})
