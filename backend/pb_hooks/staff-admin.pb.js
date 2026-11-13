// GamFix staff API (institution dashboard) — port of backend/db 0015/0018/0021
// officer RPCs. PocketBase serializes each route handler into an isolated
// JSVM runtime, so every helper is declared INSIDE its handler. Officer
// writes go through these server-verified routes only; client-supplied
// institution IDs and roles are never trusted.

const STAFF_NOTE = 'Staff routes require an active officer or admin account.'

// ---- POST /api/gamfix/access (server-verified role routing) -----------------
// Replaces the citizen-era route: now resolves admin via the exact-email
// allowlist and officer via the active officers directory row, mirroring
// fn_dashboard_access (backend/db 0018).
routerAdd('POST', '/api/gamfix/access', (e) => {
  try {
    if (!e.auth) return e.json(200, { ok: false, role: null })
    const user = $app.findRecordById('users', e.auth.id)
    const email = user.getString('email').toLowerCase()

    if (user.getString('role') === 'admin' && ($os.getenv('ADMIN_EMAILS') || 'admin@pocketsoftware.dev,salldevvv@gmail.com').toLowerCase().split(',').map(function (s) { return s.trim() }).indexOf(email) !== -1) {
      return e.json(200, { ok: true, role: 'admin' })
    }

    const instId = user.getString('institution')
    if (user.getString('role') === 'officer' && instId) {
      const rows = $app.findRecordsByFilter(
        'officers', 'user = {:u} && is_active = true', '', 1, 0, { u: user.id }
      )
      if (rows.length && rows[0].getString('institution') === instId) {
        const inst = $app.findRecordById('institutions', instId)
        let logoUrl = String(inst.getString('logo_url') || '')
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
          logoUrl = base + 'api/files/institutions/' + inst.id + '/' + logoFile
        }
        return e.json(200, {
          ok: true,
          role: 'officer',
          institution: { id: inst.id, code: inst.getString('code'), name: inst.getString('name'), logo_url: logoUrl || null },
        })
      }
    }

    if (user.getString('role') === 'citizen') {
      return e.json(200, { ok: true, role: 'citizen' })
    }
    return e.json(200, { ok: false, role: null })
  } catch (_) {
    return e.json(200, { ok: false, role: null })
  }
})

// ---- POST /api/gamfix/staff/complaints (institution feed, latest 200) -------
routerAdd('POST', '/api/gamfix/staff/complaints', (e) => {
  try {
    if (!e.auth) return e.json(401, { error: STAFF_NOTE })
    const user = $app.findRecordById('users', e.auth.id)
    const isAdmin = user.getString('role') === 'admin' &&
      ($os.getenv('ADMIN_EMAILS') || 'admin@pocketsoftware.dev,salldevvv@gmail.com').toLowerCase().split(',').map(function (s) { return s.trim() }).indexOf(user.getString('email').toLowerCase()) !== -1

    let filter = ''
    let instId = null
    if (isAdmin) {
      filter = 'id != ""'
    } else {
      const instIdField = user.getString('institution')
      const rows = instIdField
        ? $app.findRecordsByFilter('officers', 'user = {:u} && is_active = true', '', 1, 0, { u: user.id })
        : []
      if (user.getString('role') !== 'officer' || !instIdField || !rows.length ||
          rows[0].getString('institution') !== instIdField) {
        return e.json(403, { error: STAFF_NOTE })
      }
      instId = instIdField
      filter = 'institution = {:inst}'
    }

    const params = instId ? { inst: instId } : {}
    const records = $app.findRecordsByFilter('complaints', filter, '-created', 200, 0, params)
    const complaints = records.map((row) => {
      const iso = (field) => {
        try {
          const t = new Date(row.getDateTime(field).string())
          return isNaN(t.getTime()) ? null : t.toISOString()
        } catch (_) { return null }
      }
      return {
        id: row.id,
        institution_id: row.getString('institution'),
        tracking_no: row.getString('tracking_no'),
        title: row.getString('title'),
        status: row.getString('status'),
        urgency: row.getString('urgency') || 'normal',
        region: row.getString('region') || null,
        council_area: row.getString('council_area') || null,
        ward: row.getString('ward') || row.getString('landmark') || null,
        created_at: iso('created'),
        updated_at: iso('updated'),
      }
    })
    return e.json(200, { ok: true, complaints })
  } catch (_) {
    return e.json(500, { error: 'The complaint feed could not be loaded.' })
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/staff/stats (fn_institution_dashboard_stats port) ----
routerAdd('POST', '/api/gamfix/staff/stats', (e) => {
  try {
    if (!e.auth) return e.json(200, { ok: false, error: 'not_authorized' })
    const user = $app.findRecordById('users', e.auth.id)
    const instId = user.getString('institution')
    const rows = instId
      ? $app.findRecordsByFilter('officers', 'user = {:u} && is_active = true', '', 1, 0, { u: user.id })
      : []
    if (user.getString('role') !== 'officer' || !instId || !rows.length ||
        rows[0].getString('institution') !== instId) {
      return e.json(200, { ok: false, error: 'not_authorized' })
    }
    const inst = $app.findRecordById('institutions', instId)

    const records = $app.findRecordsByFilter('complaints', 'institution = {:inst}', '-created', 2000, 0, { inst: instId })
    const ms = (record, field) => {
      try { const t = new Date(record.getDateTime(field).string()); return isNaN(t.getTime()) ? null : t.getTime() } catch (_) { return null }
    }
    const now = Date.now()
    const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()

    const catNames = {}
    const catRows = $app.findRecordsByFilter('categories', '', '', 500, 0)
    for (const cat of catRows) catNames[cat.id] = cat.getString('name')

    let total = 0, today = 0, open = 0, resolvedWeek = 0, overdue = 0
    let resSum = 0, resCount = 0
    const byStatus = {}, byCategory = {}, byChannel = {}, byUrgency = {}
    const dayKeys = []
    const daily = {}
    for (let i = 13; i >= 0; i--) {
      const d = new Date(todayStart - i * 86400000)
      const key = d.toISOString().slice(0, 10)
      dayKeys.push(key)
      daily[key] = { received: 0, resolved: 0 }
    }
    for (const row of records) {
      total++
      const created = ms(row, 'created')
      const resolvedAt = ms(row, 'resolved_at')
      const expected = ms(row, 'expected_response_at')
      const status = row.getString('status')
      const urgency = row.getString('urgency') || 'normal'
      const channel = row.getString('channel') || 'other'
      const category = catNames[row.getString('category')] || 'Uncategorized'
      if (created && created >= todayStart) today++
      if (!['closed', 'rejected'].includes(status)) open++
      if (resolvedAt && resolvedAt >= now - 7 * 86400000) resolvedWeek++
      if (expected && expected < now && !['closed', 'rejected'].includes(status)) overdue++
      if (created && resolvedAt) { resSum += (resolvedAt - created) / 3600000; resCount++ }
      byStatus[status] = (byStatus[status] || 0) + 1
      byCategory[category] = (byCategory[category] || 0) + 1
      byChannel[channel] = (byChannel[channel] || 0) + 1
      byUrgency[urgency] = (byUrgency[urgency] || 0) + 1
      if (created) {
        const key = new Date(created).toISOString().slice(0, 10)
        if (daily[key]) daily[key].received++
      }
      if (resolvedAt) {
        const key = new Date(resolvedAt).toISOString().slice(0, 10)
        if (daily[key]) daily[key].resolved++
      }
    }
    const toPairs = (obj, sortFn) => Object.keys(obj).map((k) => ({ name: k, count: obj[k] })).sort(sortFn)
    return e.json(200, {
      ok: true,
      institution: { id: inst.id, code: inst.getString('code'), name: inst.getString('name') },
      total,
      today,
      open,
      resolved_week: resolvedWeek,
      overdue,
      avg_resolution_hours: resCount ? Math.round((resSum / resCount) * 10) / 10 : 0,
      by_status: toPairs(byStatus, (a, b) => a.name.localeCompare(b.name)).map((x) => ({ status: x.name, count: x.count })),
      by_category: toPairs(byCategory, (a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((x) => ({ category: x.name, count: x.count })),
      by_channel: toPairs(byChannel, (a, b) => b.count - a.count).map((x) => ({ channel: x.name, count: x.count })),
      by_urgency: toPairs(byUrgency, (a, b) => a.name.localeCompare(b.name)).map((x) => ({ urgency: x.name, count: x.count })),
      daily: dayKeys.map((key) => ({ date: key, received: daily[key].received, resolved: daily[key].resolved })),
    })
  } catch (_) {
    return e.json(200, { ok: false, error: 'stats_failed' })
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/staff/complaint (fn_officer_complaint_detail port) ----
routerAdd('POST', '/api/gamfix/staff/complaint', (e) => {
  try {
    if (!e.auth) return e.json(200, { ok: false, error: 'not_authorized' })
    let body = {}
    try { const info = e.requestInfo(); if (info && info.body && typeof info.body === 'object') body = info.body } catch (_) {}
    const complaintId = String(body.p_complaint_id || '')
    if (!complaintId) return e.json(200, { ok: false, error: 'not_found' })

    const user = $app.findRecordById('users', e.auth.id)
    const isAdmin = user.getString('role') === 'admin' &&
      ($os.getenv('ADMIN_EMAILS') || 'admin@pocketsoftware.dev,salldevvv@gmail.com').toLowerCase().split(',').map(function (s) { return s.trim() }).indexOf(user.getString('email').toLowerCase()) !== -1
    let instId = null
    if (!isAdmin) {
      const instIdField = user.getString('institution')
      const rows = instIdField
        ? $app.findRecordsByFilter('officers', 'user = {:u} && is_active = true', '', 1, 0, { u: user.id })
        : []
      if (user.getString('role') !== 'officer' || !instIdField || !rows.length ||
          rows[0].getString('institution') !== instIdField) {
        return e.json(200, { ok: false, error: 'not_authorized' })
      }
      instId = instIdField
    }

    let row = null
    try {
      row = $app.findRecordById('complaints', complaintId)
    } catch (_) { row = null }
    if (!row || (instId && row.getString('institution') !== instId)) {
      return e.json(200, { ok: false, error: 'not_found' })
    }

    let categoryName = null
    try {
      const cat = $app.findRecordById('categories', row.getString('category'))
      categoryName = cat.getString('name')
    } catch (_) { categoryName = null }

    let contact = null
    if (!row.getBool('is_anonymous')) {
      try {
        const citizen = $app.findRecordById('users', row.getString('citizen'))
        contact = {
          name: citizen.getString('full_name') || null,
          phone: citizen.getString('phone') || null,
          email: citizen.getString('email') || null,
        }
      } catch (_) { contact = null }
    }

    const iso = (field) => {
      try { const t = new Date(row.getDateTime(field).string()); return isNaN(t.getTime()) ? null : t.toISOString() } catch (_) { return null }
    }
    // Absolute origin for file URLs — request host first (nginx passes the
    // public Host; static hosts like Cloudflare Pages swallow relative /api/*
    // into their SPA fallback), then the configured appURL.
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
    const fileUrl = (collection, recordId, name) =>
      fileBase().replace(/\/?$/, '/') + 'api/files/' + collection + '/' + recordId + '/' + name

    let photoUrl = null
    let resolutionPhotoUrl = null
    let photos = []
    try { photos = row.get('photos') || [] } catch (_) { photos = [] }
    if (!Array.isArray(photos)) photos = []
    if (photos.length) {
      // The dashboard appends its own file token (pb.files.getToken()) which
      // PocketBase validates against the complaints view rule — officers pass
      // via the staff scope.
      photoUrl = fileUrl('complaints', row.id, String(photos[0]))
    }
    // Resolution evidence: prefer the managed file uploaded with the fix
    // report; fall back to the legacy externally-attached URL. Both were
    // previously hard-coded to null here, so an attached proof never showed.
    // NOTE: maxSelect=1 file fields come back as a STRING, not an array.
    try {
      let rp = null
      try { rp = row.get('resolution_photos') } catch (_) { rp = null }
      let rpName = ''
      if (typeof rp === 'string') rpName = rp
      else if (rp) {
        const arr = Array.from(rp)
        if (arr.length) rpName = String(arr[0])
      }
      if (rpName) {
        resolutionPhotoUrl = fileUrl('complaints', row.id, rpName)
      } else {
        const stored = String(row.getString('resolution_photo_url') || '')
        if (stored) {
          resolutionPhotoUrl = /^https?:\/\//i.test(stored)
            ? stored
            : fileBase().replace(/\/?$/, '/') + stored.replace(/^\//, '')
        }
      }
    } catch (_) { resolutionPhotoUrl = null }

    return e.json(200, {
      ok: true,
      complaint: {
        id: row.id,
        tracking_no: row.getString('tracking_no'),
        title: row.getString('title'),
        description: row.getString('description'),
        status: row.getString('status'),
        urgency: row.getString('urgency') || 'normal',
        category: categoryName,
        lat: row.getFloat('lat') || null,
        lng: row.getFloat('lng') || null,
        region: row.getString('region') || null,
        council_area: row.getString('council_area') || null,
        ward: row.getString('ward') || row.getString('landmark') || null,
        created_at: iso('created'),
        updated_at: iso('updated'),
        is_anonymous: row.getBool('is_anonymous'),
        photo_url: photoUrl,
        resolution_photo_url: resolutionPhotoUrl,
        resolution_note: row.getString('resolution_note') || null,
        contact,
      },
    })
  } catch (_) {
    return e.json(200, { ok: false, error: 'detail_failed' })
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/staff/accept (fn_officer_accept port) -----------------
routerAdd('POST', '/api/gamfix/staff/accept', (e) => {
  try {
    if (!e.auth) return e.json(200, false)
    const user = $app.findRecordById('users', e.auth.id)
    const instIdField = user.getString('institution')
    const rows = instIdField
      ? $app.findRecordsByFilter('officers', 'user = {:u} && is_active = true', '', 1, 0, { u: user.id })
      : []
    const isOfficer = user.getString('role') === 'officer' && instIdField && rows.length &&
      rows[0].getString('institution') === instIdField
    const isAdmin = user.getString('role') === 'admin' &&
      ($os.getenv('ADMIN_EMAILS') || 'admin@pocketsoftware.dev,salldevvv@gmail.com').toLowerCase().split(',').map(function (s) { return s.trim() }).indexOf(user.getString('email').toLowerCase()) !== -1
    if (!isAdmin && !isOfficer) return e.json(200, false)

    let body = {}
    try { const info = e.requestInfo(); if (info && info.body && typeof info.body === 'object') body = info.body } catch (_) {}
    const complaintId = String(body.p_complaint_id || '')
    let row = null
    try { row = $app.findRecordById('complaints', complaintId) } catch (_) { row = null }
    if (!row || (!isAdmin && row.getString('institution') !== instIdField)) return e.json(200, false)
    const fromStatus = row.getString('status')
    if (!['submitted', 'received', 'escalated'].includes(fromStatus)) return e.json(200, false)

    const officerRow = isOfficer ? rows[0] : null
    const inst = $app.findRecordById('institutions', row.getString('institution'))

    $app.runInTransaction((tx) => {
      row.set('status', 'assigned')
      if (officerRow) {
        row.set('officer', officerRow.getString('name'))
        if (!row.getString('department')) row.set('department', officerRow.getString('department'))
      }
      tx.save(row)

      const citizenMessage = 'Your report has been assigned to an officer at ' +
        (inst.getString('name') || 'the responsible service') + '.'
      const update = new Record($app.findCollectionByNameOrId('complaint_updates'))
      update.set('complaint', row.id)
      update.set('status', 'assigned')
      update.set('message', citizenMessage)
      update.set('update_type', 'assignment')
      update.set('actor_label', 'officer')
      update.set('actor', officerRow ? officerRow.getString('name') : 'administrator')
      update.set('status_from', fromStatus)
      update.set('status_to', 'assigned')
      update.set('explanation', 'Case accepted by officer')
      update.set('citizen_message', citizenMessage)
      update.set('is_citizen_visible', true)
      tx.save(update)
    })
    return e.json(200, true)
  } catch (_) {
    return e.json(200, false)
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/staff/status (fn_officer_set_status port, 0021) -------
routerAdd('POST', '/api/gamfix/staff/status', (e) => {
  try {
    if (!e.auth) return e.json(200, false)
    const user = $app.findRecordById('users', e.auth.id)
    const instIdField = user.getString('institution')
    const rows = instIdField
      ? $app.findRecordsByFilter('officers', 'user = {:u} && is_active = true', '', 1, 0, { u: user.id })
      : []
    const isOfficer = user.getString('role') === 'officer' && instIdField && rows.length &&
      rows[0].getString('institution') === instIdField
    const isAdmin = user.getString('role') === 'admin' &&
      ($os.getenv('ADMIN_EMAILS') || 'admin@pocketsoftware.dev,salldevvv@gmail.com').toLowerCase().split(',').map(function (s) { return s.trim() }).indexOf(user.getString('email').toLowerCase()) !== -1
    if (!isAdmin && !isOfficer) return e.json(200, false)

    let body = {}
    try { const info = e.requestInfo(); if (info && info.body && typeof info.body === 'object') body = info.body } catch (_) {}
    const complaintId = String(body.p_complaint_id || '')
    const nextStatus = String(body.p_status || '')
    const citizenMessage = body.p_citizen_message == null ? null : String(body.p_citizen_message)
    let row = null
    try { row = $app.findRecordById('complaints', complaintId) } catch (_) { row = null }
    if (!row || (!isAdmin && row.getString('institution') !== instIdField)) return e.json(200, false)

    const fromStatus = row.getString('status')
    let allowed = false
    if (nextStatus === 'in_progress' && ['assigned', 'waiting_info', 'reopened'].includes(fromStatus)) {
      allowed = true
    } else if (nextStatus === 'citizen_confirmation' && fromStatus === 'in_progress') {
      if (citizenMessage == null || citizenMessage.trim().length < 5) return e.json(200, false)
      allowed = true
    }
    if (!allowed) return e.json(200, false)

    const trimmed = citizenMessage == null ? '' : citizenMessage.trim()
    const timelineMessage = nextStatus === 'citizen_confirmation'
      ? 'Fix reported: ' + trimmed
      : (trimmed || 'Work has started on your report.')
    const notification = nextStatus === 'citizen_confirmation'
      ? 'Your report ' + row.getString('tracking_no') + ': the handling service reports a fix. Reply YES to confirm or NO to reopen.'
      : 'Update on your report ' + row.getString('tracking_no') + ': work has started.'

    $app.runInTransaction((tx) => {
      row.set('status', nextStatus)
      if (nextStatus === 'citizen_confirmation') {
        row.set('resolved_at', new Date().toISOString())
        row.set('resolution_note', trimmed)
      }
      tx.save(row)

      const update = new Record($app.findCollectionByNameOrId('complaint_updates'))
      update.set('complaint', row.id)
      update.set('status', nextStatus)
      update.set('message', timelineMessage)
      update.set('update_type', 'status')
      update.set('actor_label', 'officer')
      update.set('actor', isOfficer ? rows[0].getString('name') : 'administrator')
      update.set('status_from', fromStatus)
      update.set('status_to', nextStatus)
      update.set('citizen_message', timelineMessage)
      update.set('is_citizen_visible', true)
      tx.save(update)
    })
    console.log('GamFix staff status ' + complaintId + ' -> ' + nextStatus + '; notify: ' + notification)
    return e.json(200, true)
  } catch (_) {
    return e.json(200, false)
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/staff/resolution (fn_officer_report_resolution) -------
// p_resolution_photo_url accepts either a legacy http(s) proof URL or a
// data:image/(jpeg|png|webp);base64 payload from the console photo picker
// (decoded server-side, magic-byte sniffed, stored as a protected file).
routerAdd('POST', '/api/gamfix/staff/resolution', (e) => {
  try {
    if (!e.auth) return e.json(200, false)
    let body = {}
    try { const info = e.requestInfo(); if (info && info.body && typeof info.body === 'object') body = info.body } catch (_) {}
    const photo = body.p_resolution_photo_url == null ? null : String(body.p_resolution_photo_url)
    const message = body.p_citizen_message == null ? null : String(body.p_citizen_message)
    const photoIsUrl = photo !== null && /^https?:\/\/\S+$/i.test(photo) && photo.length <= 2000
    const photoIsData = photo !== null &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(photo) && photo.length <= 9000000
    if (!e.auth || !message || message.trim().length < 5 ||
        (photo !== null && !photoIsUrl && !photoIsData)) return e.json(200, false)

    // Same server-verified transition as fn_officer_set_status('citizen_confirmation').
    const user = $app.findRecordById('users', e.auth.id)
    const instIdField = user.getString('institution')
    const rows = instIdField
      ? $app.findRecordsByFilter('officers', 'user = {:u} && is_active = true', '', 1, 0, { u: user.id })
      : []
    const isOfficer = user.getString('role') === 'officer' && instIdField && rows.length &&
      rows[0].getString('institution') === instIdField
    const isAdmin = user.getString('role') === 'admin' &&
      ($os.getenv('ADMIN_EMAILS') || 'admin@pocketsoftware.dev,salldevvv@gmail.com').toLowerCase().split(',').map(function (s) { return s.trim() }).indexOf(user.getString('email').toLowerCase()) !== -1
    if (!isAdmin && !isOfficer) return e.json(200, false)

    let row = null
    try { row = $app.findRecordById('complaints', String(body.p_complaint_id || '')) } catch (_) { row = null }
    if (!row || (!isAdmin && row.getString('institution') !== instIdField)) return e.json(200, false)
    if (row.getString('status') !== 'in_progress') return e.json(200, false)

    // Decode + sniff the uploaded proof photo before trusting it.
    let photoBytes = null
    let photoName = null
    let photoUrl = null
    if (photoIsData) {
      const b64 = photo.slice(photo.indexOf(',') + 1)
      // goja does not always expose atob — pure-JS fallback keeps this working.
      const b64decode = (s) => {
        if (typeof atob === 'function') { try { return atob(s) } catch (_) {} }
        const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
        let out = '', bits = 0, acc = 0
        for (let i = 0; i < s.length; i++) {
          const v = CH.indexOf(s[i])
          if (v < 0 || v === 64) continue
          acc = (acc << 6) | v
          bits += 6
          if (bits >= 8) { bits -= 8; out += String.fromCharCode((acc >> bits) & 0xff) }
        }
        return out
      }
      let bytes = ''
      try { bytes = b64decode(b64) } catch (_) { bytes = '' }
      if (!bytes) return e.json(200, false)
      // Magic bytes decide the extension — never the client-supplied string.
      let ext = null
      if (bytes.length > 3 && bytes.charCodeAt(0) === 0xff && bytes.charCodeAt(1) === 0xd8 &&
          bytes.charCodeAt(2) === 0xff) ext = 'jpg'
      else if (bytes.length > 8 && bytes.charCodeAt(0) === 0x89 && bytes.charCodeAt(1) === 0x50 &&
               bytes.charCodeAt(2) === 0x4e && bytes.charCodeAt(3) === 0x47) ext = 'png'
      else if (bytes.length > 12 && bytes.slice(0, 4) === 'RIFF' && bytes.slice(8, 12) === 'WEBP') ext = 'webp'
      if (!ext || bytes.length > 6500000) return e.json(200, false)
      // Pass a Uint8Array, not a string: goja UTF-8-encodes JS strings on the
      // JS→Go boundary, which corrupts binary payloads (mime sniffing fails).
      const photoU8 = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i++) photoU8[i] = bytes.charCodeAt(i)
      photoBytes = photoU8
      photoName = 'resolution_' + Date.now() + '.' + ext
    } else if (photoIsUrl) {
      photoUrl = photo
    }

    // Absolute origin for the stored proof URL (request host first, then appURL).
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

    const trimmed = message.trim()
    $app.runInTransaction((tx) => {
      row.set('status', 'citizen_confirmation')
      row.set('resolved_at', new Date().toISOString())
      row.set('resolution_note', trimmed)
      if (photoBytes !== null) {
        row.set('resolution_photos', $filesystem.fileFromBytes(photoBytes, photoName))
        row.set('resolution_photo_url', fileBase().replace(/\/?$/, '/') + 'api/files/complaints/' + row.id + '/' + photoName)
      } else if (photoUrl !== null) {
        row.set('resolution_photo_url', photoUrl)
      }
      tx.save(row)
      // PocketBase renames stored files (random suffix) — record the FINAL
      // public URL so the legacy text field matches the managed file.
      if (photoBytes !== null) {
        let savedName = ''
        try {
          const saved = row.get('resolution_photos')
          savedName = typeof saved === 'string' ? saved : (saved && saved.length ? String(saved[0]) : '')
        } catch (_) {}
        if (savedName) {
          row.set('resolution_photo_url', fileBase().replace(/\/?$/, '/') + 'api/files/complaints/' + row.id + '/' + savedName)
          tx.save(row)
        }
      }

      const update = new Record($app.findCollectionByNameOrId('complaint_updates'))
      update.set('complaint', row.id)
      update.set('status', 'citizen_confirmation')
      update.set('message', 'Fix reported: ' + trimmed + (photoBytes !== null || photoUrl !== null ? ' (with proof photo)' : ''))
      update.set('update_type', 'status')
      update.set('actor_label', 'officer')
      update.set('actor', isOfficer ? rows[0].getString('name') : 'administrator')
      update.set('status_from', 'in_progress')
      update.set('status_to', 'citizen_confirmation')
      update.set('citizen_message', 'Fix reported: ' + trimmed)
      update.set('is_citizen_visible', true)
      tx.save(update)
    })
    return e.json(200, true)
  } catch (err) {
    console.log('GamFix staff resolution failed:', String(err || err))
    return e.json(200, false)
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/staff/map (fn_institution_map_complaints port) --------
routerAdd('POST', '/api/gamfix/staff/map', (e) => {
  try {
    if (!e.auth) return e.json(200, { ok: false, error: 'not_authorized' })
    let body = {}
    try { const info = e.requestInfo(); if (info && info.body && typeof info.body === 'object') body = info.body } catch (_) {}
    const toNum = (v) => { const n = Number(v); return isNaN(n) ? null : n }
    const west = toNum(body.p_west), south = toNum(body.p_south)
    const east = toNum(body.p_east), north = toNum(body.p_north)
    if (west === null || south === null || east === null || north === null ||
        west < -180 || east > 180 || west >= east || south < -90 || north > 90 || south >= north) {
      return e.json(200, { ok: false, error: 'invalid_bounds' })
    }
    const limit = Math.min(Math.max(Number(body.p_limit || 1200) || 1200, 1), 2000)

    const user = $app.findRecordById('users', e.auth.id)
    const isAdmin = user.getString('role') === 'admin' &&
      ($os.getenv('ADMIN_EMAILS') || 'admin@pocketsoftware.dev,salldevvv@gmail.com').toLowerCase().split(',').map(function (s) { return s.trim() }).indexOf(user.getString('email').toLowerCase()) !== -1
    let instId = null
    if (!isAdmin) {
      const instIdField = user.getString('institution')
      const rows = instIdField
        ? $app.findRecordsByFilter('officers', 'user = {:u} && is_active = true', '', 1, 0, { u: user.id })
        : []
      if (user.getString('role') !== 'officer' || !instIdField || !rows.length ||
          rows[0].getString('institution') !== instIdField) {
        return e.json(200, { ok: false, error: 'not_authorized' })
      }
      instId = instIdField
    }

    const sensitive = {}
    const sensitiveRows = $app.findRecordsByFilter('categories', 'is_sensitive = true', '', 500, 0)
    for (const cat of sensitiveRows) sensitive[cat.id] = true
    const catNames = {}
    const catRows = $app.findRecordsByFilter('categories', '', '', 500, 0)
    for (const cat of catRows) catNames[cat.id] = cat.getString('name')

    const params = instId ? { inst: instId } : {}
    const records = $app.findRecordsByFilter(
      'complaints', instId ? 'institution = {:inst}' : 'id != ""', '-created', 2000, 0, params
    )
    const complaints = []
    let total = 0
    for (const row of records) {
      const lat = row.getFloat('lat')
      const lng = row.getFloat('lng')
      if ((!lat && !lng) || sensitive[row.getString('category')]) continue
      if (lat < south || lat > north || lng < west || lng > east) continue
      total++
      if (complaints.length < limit) {
        const iso = (field) => {
          try { const t = new Date(row.getDateTime(field).string()); return isNaN(t.getTime()) ? null : t.toISOString() } catch (_) { return null }
        }
        complaints.push({
          id: row.id,
          tracking_no: row.getString('tracking_no'),
          title: row.getString('title'),
          status: row.getString('status'),
          urgency: row.getString('urgency') || 'normal',
          category: catNames[row.getString('category')] || null,
          lat,
          lng,
          region: row.getString('region') || null,
          council_area: row.getString('council_area') || null,
          ward: row.getString('ward') || row.getString('landmark') || null,
          created_at: iso('created'),
        })
      }
    }
    return e.json(200, {
      ok: true,
      institution_id: isAdmin ? null : instId,
      scope: isAdmin ? 'all' : 'institution',
      total,
      returned: complaints.length,
      truncated: total > complaints.length,
      complaints,
    })
  } catch (_) {
    return e.json(200, { ok: false, error: 'map_failed' })
  }
}, $apis.requireAuth('users'))
