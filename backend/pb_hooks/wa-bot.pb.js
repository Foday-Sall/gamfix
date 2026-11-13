// GamFix WhatsApp bot server-side submit route.
//
// The wa-router bot container (apps/wa-router) drives a conversational report
// flow over WhatsApp via the dedicated gowa-chat device. When the user
// confirms, it calls this route with a shared secret instead of a citizen
// JWT (the bot never sees citizen passwords). The user is identified by their
// verified phone number, which is only possible because /api/gamfix/
// phone-otp/verify already proves number ownership on the web app.
//
// Guarded by X-WA-Bot-Secret matching the WA_BOT_SECRET env (set in
// /opt/pocketbase/gowa.env on the VPS). The complaint creation logic mirrors
// POST /api/gamfix/complaints in gamfix.pb.js so both channels produce
// identical records. PocketBase serializes each route handler into an
// isolated JSVM runtime — helpers live inside the handler, never at top level.

routerAdd('POST', '/api/gamfix/wa-bot/submit', (e) => {
  const bodyOf = (ev) => {
    try {
      const info = ev.requestInfo()
      if (info && info.body && typeof info.body === 'object' && Object.keys(info.body).length) return info.body
    } catch (_) {}
    try {
      const raw = ev.request.url.query().get('x')
      if (raw) return JSON.parse(raw) || {}
    } catch (_) {}
    return {}
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
    const body = bodyOf(e)

    // Shared-secret gate: only the wa-router container knows this value.
    // Preferred channel is body.secret (body parsing is reliable across PB
    // JSVM builds); the X-WA-Bot-Secret header is accepted too, but PB
    // 0.41's Go-map header bindings are inconsistent — do not rely on it.
    const expected = $os.getenv('WA_BOT_SECRET') || ''
    let got = String(body.secret || '')
    if (!got) {
      try {
        const info = e.requestInfo()
        const headers = info && info.headers
        if (headers) {
          const keys = Object.keys(headers)
          for (let i = 0; i < keys.length; i++) {
            if (String(keys[i]).toLowerCase() === 'x-wa-bot-secret') {
              const value = headers[keys[i]]
              got = String(Array.isArray(value) ? (value[0] || '') : value)
              break
            }
          }
        }
      } catch (_) {}
    }
    if (!expected || got !== expected) {
      return jsonError(e, 403, 'Not allowed')
    }

    // Same phone normalization as phone-otp.pb.js: keep digits, collapse
    // 00/0/220 prefixes, expand the 7-digit local form.
    let phone = String(body.phone || '').replace(/[^0-9]/g, '')
    if (phone.startsWith('00')) phone = phone.slice(2)
    if (phone.startsWith('0')) phone = phone.replace(/^0+/, '')
    if (phone.startsWith('220') && phone.length === 10) phone = phone.slice(3)
    if (phone.length === 7) phone = '220' + phone
    if (!/^220[2367][0-9]{6}$/.test(phone)) {
      return jsonError(e, 400, 'not_registered')
    }

    // The reporter must exist and have completed WhatsApp phone verification
    // on the web app — that link is what proves this number belongs to them.
    let citizen = null
    try {
      citizen = findFirst('users', 'phone = {:phone} && phone_verified = true', { phone: phone })
    } catch (_) {
      return jsonError(e, 404, 'not_registered')
    }

    const title = String(body.title || '').trim()
    const description = String(body.description || '').trim()
    if (title.length < 3 || description.length < 10) {
      return jsonError(e, 400, 'A title and description are required')
    }

    const externalId = String(body.external_id || '').trim().toUpperCase()
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
    try { category = findFirst('categories', 'slug = {:slug} && active = true', { slug: String(body.category_slug || '') }) } catch (_) {}
    let institution = null
    try { institution = category ? $app.findRecordById('institutions', category.getString('default_institution_id')) : null } catch (_) {}
    if (!institution || !institution.id) {
      try { institution = findFirst('institutions', 'code = {:code} && active = true', { code: String(body.institution_code || 'CENTRAL') }) } catch (_) {}
    }
    if (!institution || !institution.id) {
      return jsonError(e, 400, 'The selected service is unavailable')
    }

    const complaints = $app.findCollectionByNameOrId('complaints')
    const deadlineHours = category ? Number(category.get('deadline_hours') || 72) : 72

    let record = null
    let tracking = ''
    for (let attempt = 0; attempt < 5 && !record; attempt++) {
      tracking = 'GMC-' + new Date().getUTCFullYear() + '-' +
        $security.randomStringWithAlphabet(9, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
      try {
        const candidate = new Record(complaints)
        candidate.set('citizen', citizen.id)
        candidate.set('institution', institution.id)
        candidate.set('category', category ? category.id : '')
        candidate.set('tracking_no', tracking)
        candidate.set('title', title)
        candidate.set('description', description)
        candidate.set('status', 'submitted')
        candidate.set('urgency', String(body.urgency || 'normal') === 'high' ? 'high' : 'normal')
        candidate.set('council_area', String(body.council_area || ''))
        candidate.set('region', String(body.region || ''))
        candidate.set('ward', String(body.ward || ''))
        candidate.set('landmark', String(body.landmark || body.ward || ''))
        candidate.set('is_anonymous', false)
        candidate.set('lat', toNum(body.lat))
        candidate.set('lng', toNum(body.lng))
        candidate.set('external_id', externalId)
        candidate.set('channel', 'whatsapp')
        candidate.set('expected_response_at', new Date(Date.now() + deadlineHours * 3600000).toISOString())
        $app.save(candidate)
        record = candidate
      } catch (err) {
        if (externalId && String(err || '').indexOf('external_id') !== -1) {
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
          console.log('GamFix wa-bot submit save failed:', String(err || err))
          return jsonError(e, 500, 'We could not save your report. Please try again.')
        }
      }
    }

    try {
      const updates = $app.findCollectionByNameOrId('complaint_updates')
      const update = new Record(updates)
      update.set('complaint', record.id)
      update.set('status', 'submitted')
      update.set('message', 'Your report was received by GamFix (via WhatsApp).')
      $app.save(update)
    } catch (err) {
      console.log('GamFix wa-bot history write failed:', String(err || err))
    }

    return e.json(200, {
      tracking_no: record.getString('tracking_no'),
      complaint_id: record.id,
      institution: institution.getString('code'),
      institution_name: institution.getString('name'),
    })
  } catch (err) {
    console.log('GamFix wa-bot submit route failed:', String(err || err))
    return jsonError(e, 500, 'Something went wrong while submitting your report. Please try again.')
  }
})
