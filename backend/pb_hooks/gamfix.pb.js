// GamFix citizen API routes.
//
// IMPORTANT: PocketBase serializes each route handler into an isolated JSVM
// runtime, so helpers are NOT shared across handlers. Every helper a handler
// needs is declared INSIDE that handler (same pattern as phone-otp.pb.js).
// Do not hoist helpers back to file top level.

onRecordCreate((e) => {
  if (!e.record.getString("role")) e.record.set("role", "citizen")
  e.next()
}, "users")

// ---- POST /api/gamfix/access ------------------------------------------------
// Moved to staff-admin.pb.js: now resolves admin/officer via the exact-email
// allowlist + active officers directory (fn_dashboard_access port).

// ---- POST /api/gamfix/complaints (submit; idempotent by p_external_id) ------
routerAdd('POST', '/api/gamfix/complaints', (e) => {
  const bodyOf = (ev) => {
    try {
      const info = ev.requestInfo()
      if (info && info.body && typeof info.body === 'object' && Object.keys(info.body).length) return info.body
    } catch (_) {}
    try {
      const info = ev.requestInfo()
      const q = info && info.query ? info.query : null
      if (q && q.get) {
        const raw = q.get('x')
        if (raw) return JSON.parse(raw) || {}
      } else if (q && q.x) {
        return JSON.parse(q.x) || {}
      }
    } catch (_) {}
    try {
      const query = ev.request.URL.query()
      return JSON.parse(query.get('x') || '{}') || {}
    } catch (_) { return {} }
  }
  const jsonError = (ev, status, message) => ev.json(status, { error: message })
  const findFirst = (name, filter, params) => {
    let resolved = filter
    for (const key in (params || {})) {
      const value = String(params[key]).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
      resolved = resolved.replace('{:' + key + '}', '"' + value + '"')
    }
    const records = $app.findRecordsByFilter(name, resolved, '', 1, 0)
    if (!records.length) throw new Error('record not found')
    return records[0]
  }
  const toNum = (v) => {
    const n = Number(v)
    return isFinite(n) ? n : 0
  }

  try {
    if (!e.auth) return jsonError(e, 401, 'Authentication required')
    // Mandatory WhatsApp phone verification: citizens must verify their phone
    // (GoWa OTP) before filing reports; staff accounts are exempt.
    if (!e.auth.getBool('phone_verified') && String(e.auth.get('role') || 'citizen') === 'citizen') {
      return jsonError(e, 403, 'Verify your phone number on WhatsApp before submitting a report.')
    }
    const body = bodyOf(e)
    const title = String(body.p_title || '').trim()
    const description = String(body.p_description || '').trim()
    if (title.length < 3 || description.length < 10) {
      return jsonError(e, 400, 'A title and description are required')
    }

    const externalId = String(body.p_external_id || '').trim().toUpperCase()
    if (externalId) {
      try {
        const existing = findFirst('complaints', 'external_id = {:external}', { external: externalId })
        const institution = $app.findRecordById('institutions', existing.getString('institution'))
        return e.json(200, {
          tracking_no: existing.getString('tracking_no'),
          complaint_id: existing.id,
          institution: institution.getString('code'),
          institution_name: institution.getString('name'),
        })
      } catch (_) {}
    }

    let category = null
    try { category = findFirst('categories', 'slug = {:slug} && active = true', { slug: String(body.p_category_hint || '') }) } catch (_) {}
    let institution = null
    try { institution = category ? $app.findRecordById('institutions', category.getString('default_institution_id')) : null } catch (_) {}
    if (!institution || !institution.id) {
      try { institution = findFirst('institutions', 'code = {:code} && active = true', { code: String(body.p_institution_code || 'CENTRAL') }) } catch (_) {}
    }
    if (!institution || !institution.id) {
      return jsonError(e, 400, 'The selected service is unavailable')
    }

    const complaints = $app.findCollectionByNameOrId('complaints')
    const deadlineHours = category ? Number(category.get('deadline_hours') || 72) : 72

    let record = null
    let tracking = ''
    // Retry a few times in case of a tracking_no collision (unique index).
    for (let attempt = 0; attempt < 5 && !record; attempt++) {
      tracking = 'GMC-' + new Date().getUTCFullYear() + '-' +
        $security.randomStringWithAlphabet(9, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
      try {
        const candidate = new Record(complaints)
        candidate.set('citizen', e.auth.id)
        candidate.set('institution', institution.id)
        candidate.set('category', category ? category.id : '')
        candidate.set('tracking_no', tracking)
        candidate.set('title', title)
        candidate.set('description', description)
        candidate.set('status', 'submitted')
        candidate.set('urgency', String(body.p_urgency_hint || 'normal'))
        candidate.set('council_area', String(body.p_council_area || ''))
        candidate.set('region', String(body.p_region || ''))
        candidate.set('ward', String(body.p_ward || ''))
        candidate.set('landmark', String(body.p_landmark || body.p_ward || ''))
        candidate.set('is_anonymous', !!body.p_is_anonymous)
        candidate.set('lat', toNum(body.p_lat))
        candidate.set('lng', toNum(body.p_lng))
        candidate.set('external_id', externalId)
        candidate.set('channel', String(body.p_channel || 'web'))
        candidate.set('expected_response_at', new Date(Date.now() + deadlineHours * 3600000).toISOString())
        $app.save(candidate)
        record = candidate
      } catch (err) {
        if (externalId && String(err || '').indexOf('external_id') !== -1) {
          // Lost an idempotency race: return the winning record.
          try {
            const existing = findFirst('complaints', 'external_id = {:external}', { external: externalId })
            const institutionRec = $app.findRecordById('institutions', existing.getString('institution'))
            return e.json(200, {
              tracking_no: existing.getString('tracking_no'),
              complaint_id: existing.id,
              institution: institutionRec.getString('code'),
              institution_name: institutionRec.getString('name'),
            })
          } catch (_) {}
        }
        if (attempt === 4) {
          console.log('GamFix submit save failed:', String(err || err))
          return jsonError(e, 500, 'We could not save your report. Please try again.')
        }
      }
    }

    try {
      const updates = $app.findCollectionByNameOrId('complaint_updates')
      const update = new Record(updates)
      update.set('complaint', record.id)
      update.set('status', 'submitted')
      update.set('message', 'Your report was received by GamFix.')
      $app.save(update)
    } catch (err) {
      console.log('GamFix submit history write failed:', String(err || err))
    }

    return e.json(200, {
      tracking_no: record.getString('tracking_no'),
      complaint_id: record.id,
      institution: institution.getString('code'),
      institution_name: institution.getString('name'),
    })
  } catch (err) {
    console.log('GamFix submit route failed:', String(err || err))
    return jsonError(e, 500, 'Something went wrong while submitting your report. Please try again.')
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/track (public; safe DTO only) -------------------------
routerAdd('POST', '/api/gamfix/track', (e) => {
  const bodyOf = (ev) => {
    try {
      const info = ev.requestInfo()
      if (info && info.body && typeof info.body === 'object' && Object.keys(info.body).length) return info.body
    } catch (_) {}
    try {
      const info = ev.requestInfo()
      const q = info && info.query ? info.query : null
      if (q && q.get) {
        const raw = q.get('x')
        if (raw) return JSON.parse(raw) || {}
      } else if (q && q.x) {
        return JSON.parse(q.x) || {}
      }
    } catch (_) {}
    try {
      const query = ev.request.URL.query()
      return JSON.parse(query.get('x') || '{}') || {}
    } catch (_) { return {} }
  }
  const jsonError = (ev, status, message) => ev.json(status, { error: message })
  const findFirst = (name, filter, params) => {
    let resolved = filter
    for (const key in (params || {})) {
      const value = String(params[key]).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
      resolved = resolved.replace('{:' + key + '}', '"' + value + '"')
    }
    const records = $app.findRecordsByFilter(name, resolved, '', 1, 0)
    if (!records.length) throw new Error('record not found')
    return records[0]
  }

  try {
    const tracking = String(bodyOf(e).p_tracking_no || '').trim().toUpperCase()
    if (!tracking) return jsonError(e, 400, 'Tracking number is required')

    let record = null
    try { record = findFirst('complaints', 'tracking_no = {:tracking}', { tracking }) } catch (_) {
      // null (not {}) so the UI's "not found" branch renders.
      return e.json(200, null)
    }

    let institution = null
    try { institution = $app.findRecordById('institutions', record.getString('institution')) } catch (_) {}
    let category = null
    try { category = $app.findRecordById('categories', record.getString('category')) } catch (_) {}
    const updates = $app.findRecordsByFilter('complaint_updates', 'complaint = "' + record.id + '"', '-created', 100, 0)
    const timeline = []
    for (let i = updates.length - 1; i >= 0; i--) {
      timeline.push({
        status: updates[i].getString('status') || null,
        message: updates[i].getString('message') || null,
        at: updates[i].getString('created'),
      })
    }
    return e.json(200, {
      tracking_no: record.getString('tracking_no'),
      status: record.getString('status'),
      urgency: record.getString('urgency'),
      title: record.getString('title'),
      description: record.getString('description'),
      institution: institution ? institution.getString('name') : null,
      department: null,
      expected_response_at: record.getString('expected_response_at') || null,
      resolved_at: record.getString('resolved_at') || null,
      closed_at: record.getString('closed_at') || null,
      category: category ? category.getString('name') : null,
      timeline: timeline,
    })
  } catch (err) {
    console.log('GamFix track route failed:', String(err || err))
    return jsonError(e, 500, 'Tracking is temporarily unavailable. Please try again.')
  }
})

// ---- POST /api/gamfix/can-confirm (owner gate) ------------------------------
routerAdd('POST', '/api/gamfix/can-confirm', (e) => {
  const bodyOf = (ev) => {
    try {
      const info = ev.requestInfo()
      if (info && info.body && typeof info.body === 'object' && Object.keys(info.body).length) return info.body
    } catch (_) {}
    try {
      const info = ev.requestInfo()
      const q = info && info.query ? info.query : null
      if (q && q.get) {
        const raw = q.get('x')
        if (raw) return JSON.parse(raw) || {}
      } else if (q && q.x) {
        return JSON.parse(q.x) || {}
      }
    } catch (_) {}
    try {
      const query = ev.request.URL.query()
      return JSON.parse(query.get('x') || '{}') || {}
    } catch (_) { return {} }
  }
  const findFirst = (name, filter, params) => {
    let resolved = filter
    for (const key in (params || {})) {
      const value = String(params[key]).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
      resolved = resolved.replace('{:' + key + '}', '"' + value + '"')
    }
    const records = $app.findRecordsByFilter(name, resolved, '', 1, 0)
    if (!records.length) throw new Error('record not found')
    return records[0]
  }
  try {
    if (!e.auth) return e.json(200, false)
    const tracking = String(bodyOf(e).p_tracking_no || '').trim().toUpperCase()
    const record = findFirst('complaints', 'tracking_no = {:tracking} && citizen = {:citizen}', { tracking, citizen: e.auth.id })
    return e.json(200, ['citizen_confirmation', 'resolved'].includes(record.getString('status')))
  } catch (_) {
    return e.json(200, false)
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/confirm (owner closes a resolved report) --------------
routerAdd('POST', '/api/gamfix/confirm', (e) => {
  const bodyOf = (ev) => {
    try {
      const info = ev.requestInfo()
      if (info && info.body && typeof info.body === 'object' && Object.keys(info.body).length) return info.body
    } catch (_) {}
    try {
      const info = ev.requestInfo()
      const q = info && info.query ? info.query : null
      if (q && q.get) {
        const raw = q.get('x')
        if (raw) return JSON.parse(raw) || {}
      } else if (q && q.x) {
        return JSON.parse(q.x) || {}
      }
    } catch (_) {}
    try {
      const query = ev.request.URL.query()
      return JSON.parse(query.get('x') || '{}') || {}
    } catch (_) { return {} }
  }
  const findFirst = (name, filter, params) => {
    let resolved = filter
    for (const key in (params || {})) {
      const value = String(params[key]).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
      resolved = resolved.replace('{:' + key + '}', '"' + value + '"')
    }
    const records = $app.findRecordsByFilter(name, resolved, '', 1, 0)
    if (!records.length) throw new Error('record not found')
    return records[0]
  }
  try {
    if (!e.auth) return e.json(401, { error: 'Authentication required' })
    const tracking = String(bodyOf(e).p_tracking_no || '').trim().toUpperCase()
    let record = null
    try {
      record = findFirst('complaints', 'tracking_no = {:tracking} && citizen = {:citizen}', { tracking, citizen: e.auth.id })
    } catch (_) {
      return e.json(404, false)
    }
    if (!['citizen_confirmation', 'resolved'].includes(record.getString('status'))) {
      return e.json(409, { error: 'This report is not ready to be confirmed yet.' })
    }
    record.set('status', 'closed')
    record.set('closed_at', new Date().toISOString())
    $app.save(record)
    try {
      const update = new Record($app.findCollectionByNameOrId('complaint_updates'))
      update.set('complaint', record.id)
      update.set('status', 'closed')
      update.set('message', 'You confirmed this report as resolved. Thank you.')
      $app.save(update)
    } catch (err) {
      console.log('GamFix confirm history write failed:', String(err || err))
    }
    return e.json(200, true)
  } catch (err) {
    console.log('GamFix confirm route failed:', String(err || err))
    return e.json(500, { error: 'Could not confirm this report. Please try again.' })
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/reopen (owner reopens a finished report) --------------
routerAdd('POST', '/api/gamfix/reopen', (e) => {
  const bodyOf = (ev) => {
    try {
      const info = ev.requestInfo()
      if (info && info.body && typeof info.body === 'object' && Object.keys(info.body).length) return info.body
    } catch (_) {}
    try {
      const info = ev.requestInfo()
      const q = info && info.query ? info.query : null
      if (q && q.get) {
        const raw = q.get('x')
        if (raw) return JSON.parse(raw) || {}
      } else if (q && q.x) {
        return JSON.parse(q.x) || {}
      }
    } catch (_) {}
    try {
      const query = ev.request.URL.query()
      return JSON.parse(query.get('x') || '{}') || {}
    } catch (_) { return {} }
  }
  const jsonError = (ev, status, message) => ev.json(status, { error: message })
  const findFirst = (name, filter, params) => {
    let resolved = filter
    for (const key in (params || {})) {
      const value = String(params[key]).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
      resolved = resolved.replace('{:' + key + '}', '"' + value + '"')
    }
    const records = $app.findRecordsByFilter(name, resolved, '', 1, 0)
    if (!records.length) throw new Error('record not found')
    return records[0]
  }
  try {
    if (!e.auth) return jsonError(e, 401, 'Authentication required')
    const body = bodyOf(e)
    const reason = String(body.p_reason || '').trim()
    const tracking = String(body.p_tracking_no || '').trim().toUpperCase()
    if (reason.length < 5) return jsonError(e, 400, 'A reason is required')
    let record = null
    try {
      record = findFirst('complaints', 'tracking_no = {:tracking} && citizen = {:citizen}', { tracking, citizen: e.auth.id })
    } catch (_) {
      return e.json(404, false)
    }
    if (!['closed', 'resolved', 'citizen_confirmation'].includes(record.getString('status'))) {
      return e.json(409, { error: 'This report cannot be reopened right now.' })
    }
    record.set('status', 'reopened')
    $app.save(record)
    const update = new Record($app.findCollectionByNameOrId('complaint_updates'))
    update.set('complaint', record.id)
    update.set('status', 'reopened')
    update.set('message', reason)
    $app.save(update)
    return e.json(200, true)
  } catch (err) {
    console.log('GamFix reopen route failed:', String(err || err))
    return jsonError(e, 500, 'Could not reopen this report. Please try again.')
  }
}, $apis.requireAuth('users'))

// ---- Complaint HTTP update guard -------------------------------------------
// The update rule lets a complaint's owner attach evidence photos over HTTP.
// This guard keeps that narrow: the owner may change ONLY the photos field;
// any other field difference is rejected. Officer/admin complaint writes go
// through server routes ($app.save), which do not pass through this hook.
onRecordUpdateRequest((e) => {
  try {
    const auth = e.auth
    if (!auth) return e.error(401, 'Authentication required.')
    // Superusers are trusted infrastructure (the WhatsApp router attaches
    // downloaded report photos with its service credentials).
    try {
      if (auth.collection().name === '_superusers') return e.next()
    } catch (_) {}
    const record = e.record
    const original = record.original()
    const role = auth.getString('role')
    if (role === 'admin' && ($os.getenv('ADMIN_EMAILS') || 'admin@pocketsoftware.dev,salldevvv@gmail.com').toLowerCase().split(',').map(function (s) { return s.trim() }).indexOf(auth.getString('email').toLowerCase()) !== -1) {
      return e.next()
    }
    if (record.getString('citizen') !== auth.id) {
      return e.error(403, 'Only the report owner can attach evidence photos.')
    }
    const skipped = { photos: true, updated: true, created: true }
    const fields = record.collection().fields
    for (let i = 0; i < fields.length; i++) {
      const name = fields[i].name
      if (!name || skipped[name]) continue
      let before = null
      let after = null
      try { before = JSON.stringify(original.get(name)) } catch (_) { before = 'x' }
      try { after = JSON.stringify(record.get(name)) } catch (_) { after = 'y' }
      if (before !== after) {
        return e.error(403, 'Only photo attachments can be updated here.')
      }
    }
    return e.next()
  } catch (err) {
    console.log('GamFix complaint update guard failed:', String(err && err.message ? err.message : err))
    return e.error(500, 'Update could not be validated.')
  }
}, 'complaints')
