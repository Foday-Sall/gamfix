// GamFix WhatsApp device manager — port of backend/functions/admin-whatsapp.
// Manages the registry of WhatsApp sender numbers linked through the GOWA
// gateway (go-whatsapp-web-multidevice v9.6): device slots, pairing codes,
// link confirmation, role, revoke, delete, effective OTP sender.
// Every helper lives inside its handler (isolated JSVM runtime per request).

// ---- POST /api/gamfix/admin-whatsapp ----------------------------------------
routerAdd('POST', '/api/gamfix/admin-whatsapp', (e) => {
  try {
    if (!e.auth) return e.json(401, { error: 'invalid_token' })
    const user = $app.findRecordById('users', e.auth.id)
    const isAdmin = user.getString('role') === 'admin' &&
      ($os.getenv('ADMIN_EMAILS') || 'admin@pocketsoftware.dev,salldevvv@gmail.com').toLowerCase().split(',').map(function (s) { return s.trim() }).indexOf(user.getString('email').toLowerCase()) !== -1
    if (!isAdmin) return e.json(401, { error: 'invalid_token' })

    let body = {}
    try { const info = e.requestInfo(); if (info && info.body && typeof info.body === 'object') body = info.body } catch (_) {}
    const action = String(body.action || '')
    const params = (body.params && typeof body.params === 'object') ? body.params : {}

    // --- local helpers -------------------------------------------------------
    const basicAuthHeader = () => {
      const basic = $os.getenv('GOWA_BASIC_AUTH') || ''
      if (!basic) return null
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      const bytes = []
      for (let i = 0; i < basic.length; i++) {
        let cp = basic.charCodeAt(i)
        if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < basic.length) {
          const low = basic.charCodeAt(i + 1)
          if (low >= 0xdc00 && low <= 0xdfff) cp = 0x10000 + ((cp - 0xd800) << 10) + low - 0xdc00
        }
        if (cp < 0x80) bytes.push(cp)
        else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63))
        else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
        else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
      }
      let encoded = ''
      for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i]
        const hasB = i + 1 < bytes.length
        const hasC = i + 2 < bytes.length
        const b = hasB ? bytes[i + 1] : 0
        const c = hasC ? bytes[i + 2] : 0
        encoded += alphabet[a >> 2]
        encoded += alphabet[((a & 3) << 4) | (b >> 4)]
        encoded += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : '='
        encoded += hasC ? alphabet[c & 63] : '='
      }
      return 'Basic ' + encoded
    }
    const gowaBase = () => String($os.getenv('GOWA_BASE_URL') || 'http://127.0.0.1:3000').replace(/\/+$/, '')
    const gowaCall = (path, opts) => {
      const auth = basicAuthHeader()
      if (!auth) throw new Error('GOWA_BASIC_AUTH not configured')
      const headers = { 'Content-Type': 'application/json', Authorization: auth }
      if (opts && opts.deviceId) headers['X-Device-Id'] = opts.deviceId
      const response = $http.send({
        url: gowaBase() + path,
        method: (opts && opts.method) || 'GET',
        headers,
        body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
        timeout: 30,
      })
      let json = {}
      try { json = response.json || JSON.parse(response.body || '{}') } catch (_) { json = { raw: String(response.body || '').slice(0, 300) } }
      return { status: response.statusCode, json }
    }
    const gowaResults = (json) => {
      const code = typeof json.code === 'string' ? json.code : ''
      if (code && code !== 'SUCCESS') throw new Error('gowa error ' + code + ': ' + String(json.message || '').slice(0, 200))
      return json.results || {}
    }
    const normalizePhone = (raw) => {
      const digits = String(raw || '').replace(/[^0-9]/g, '')
      return digits.length >= 8 && digits.length <= 15 ? digits : null
    }
    const iso = (row, field) => {
      try { const t = new Date(row.getDateTime(field).string()); return isNaN(t.getTime()) ? null : t.toISOString() } catch (_) { return null }
    }
    const registryRowDto = (row, device) => ({
      id: row.id,
      number: row.getString('number'),
      role: row.getString('role') || 'chat',
      status: row.getString('status') || 'pending',
      gowaInstance: row.getString('gowa_instance') || null,
      gowaState: device ? String(device.state || '') : (row.getString('gowa_state') || null),
      gowaJid: device ? String(device.jid || '') : (row.getString('gowa_jid') || null),
      linkedAt: iso(row, 'linked_at'),
      revokedAt: iso(row, 'revoked_at'),
      createdAt: iso(row, 'created'),
    })
    const findRegistry = (phone) => {
      const rows = $app.findRecordsByFilter('whatsapp_numbers', 'number = {:n}', '', 1, 0, { n: phone })
      return rows.length ? rows[0] : null
    }
    const saveRegistryState = (row, patch) => {
      if (patch.status !== undefined) row.set('status', patch.status)
      if (patch.role !== undefined) row.set('role', patch.role)
      if (patch.gowa_instance !== undefined) row.set('gowa_instance', patch.gowa_instance)
      if (patch.linked_at !== undefined) row.set('linked_at', patch.linked_at)
      if (patch.revoked_at !== undefined) row.set('revoked_at', patch.revoked_at)
      $app.save(row)
    }
    const error = (status, code) => e.json(status, { error: code })
    const ok = (data) => e.json(200, { ok: true, data })

    // --- actions -------------------------------------------------------------
    if (action === 'list_numbers') {
      let devices = []
      try {
        const { status, json } = gowaCall('/devices')
        if (status === 200) {
          const results = gowaResults(json)
          if (Array.isArray(results)) devices = results
        }
      } catch (_) { devices = [] }
      const rows = $app.findRecordsByFilter('whatsapp_numbers', '', '-created', 200, 0)
      const numbers = rows.map((row) => {
        const instance = row.getString('gowa_instance')
        const device = instance ? devices.find((d) => String(d.id || '') === instance) : null
        return registryRowDto(row, device)
      })
      return ok({ numbers })
    }

    if (action === 'start_link') {
      const phone = normalizePhone(params.phone)
      if (!phone) return error(400, 'invalid_phone')
      const role = params.role === 'otp' ? 'otp' : 'chat'
      const deviceId = 'wa-' + phone
      let devices = []
      try {
        const { status, json } = gowaCall('/devices')
        if (status === 200) {
          const results = gowaResults(json)
          if (Array.isArray(results)) devices = results
        }
      } catch (_) { devices = [] }
      if (!devices.some((d) => String(d.id || '') === deviceId)) {
        try {
          const created = gowaCall('/devices', { method: 'POST', body: { device_id: deviceId } })
          if (created.status !== 200) return error(502, 'gowa_create_failed')
        } catch (err) {
          console.log('GamFix gowa create failed: ' + (err && err.message ? err.message : 'x'))
          return error(502, 'gowa_create_failed')
        }
      }
      let code = ''
      try {
        const pair = gowaCall('/app/login-with-code?phone=' + encodeURIComponent(phone), { deviceId })
        if (pair.status !== 200) return error(502, 'pairing_code_failed')
        const results = gowaResults(pair.json)
        code = String(results.pair_code || '')
        if (!code) return error(502, 'pairing_code_failed')
      } catch (err) {
        console.log('GamFix gowa pairing failed: ' + (err && err.message ? err.message : 'x'))
        return error(502, 'pairing_code_failed')
      }
      let row = findRegistry(phone)
      if (row) {
        saveRegistryState(row, { status: 'pending', role, gowa_instance: deviceId })
      } else {
        row = new Record($app.findCollectionByNameOrId('whatsapp_numbers'))
        row.set('number', phone)
        row.set('role', role)
        row.set('status', 'pending')
        row.set('gowa_instance', deviceId)
        $app.save(row)
      }
      return ok({ number: phone, role, status: 'pending', gowaInstance: deviceId, pairingCode: code })
    }

    if (action === 'confirm_link') {
      const phone = normalizePhone(params.phone)
      if (!phone) return error(400, 'invalid_phone')
      const row = findRegistry(phone)
      if (!row) return error(404, 'not_found')
      const instance = row.getString('gowa_instance')
      if (!instance) return error(400, 'no_instance')
      try {
        const { status, json } = gowaCall('/app/status', { deviceId: instance })
        if (status !== 200) return error(502, 'gowa_status_failed')
        const results = gowaResults(json)
        if (results.is_logged_in === true) {
          saveRegistryState(row, { status: 'linked', linked_at: new Date().toISOString(), gowa_instance: instance })
          row = findRegistry(phone)
          return ok({ number: phone, status: 'linked', jid: String(results.jid || '') || null, loggedIn: true })
        }
        return ok({
          number: phone,
          status: row.getString('status') === 'pending' ? 'pending' : row.getString('status'),
          loggedIn: false,
          gowaState: results.is_connected === true ? 'connected' : 'disconnected',
        })
      } catch (err) {
        console.log('GamFix gowa status failed: ' + (err && err.message ? err.message : 'x'))
        return error(502, 'gowa_status_failed')
      }
    }

    if (action === 'set_role') {
      const phone = normalizePhone(params.phone)
      if (!phone) return error(400, 'invalid_phone')
      if (params.role !== 'otp' && params.role !== 'chat') return error(400, 'invalid_role')
      const row = findRegistry(phone)
      if (!row) return error(404, 'not_found')
      saveRegistryState(row, { role: params.role })
      return ok({ number: phone, role: row.getString('role'), status: row.getString('status') })
    }

    if (action === 'revoke') {
      const phone = normalizePhone(params.phone)
      if (!phone) return error(400, 'invalid_phone')
      const row = findRegistry(phone)
      if (!row) return error(404, 'not_found')
      const instance = row.getString('gowa_instance')
      if (instance) {
        try { gowaCall('/app/logout', { deviceId: instance }) } catch (_) {}
      }
      saveRegistryState(row, { status: 'revoked', revoked_at: new Date().toISOString() })
      return ok({ number: phone, status: 'revoked' })
    }

    if (action === 'delete_number') {
      const phone = normalizePhone(params.phone)
      if (!phone) return error(400, 'invalid_phone')
      const row = findRegistry(phone)
      if (!row) return error(404, 'not_found')
      const instance = row.getString('gowa_instance')
      if (instance) {
        try { gowaCall('/devices/' + encodeURIComponent(instance), { method: 'DELETE', deviceId: instance }) } catch (_) {}
      }
      $app.delete(row)
      return ok({ number: phone, deleted: true })
    }

    if (action === 'get_sender') {
      const otpRows = $app.findRecordsByFilter('whatsapp_numbers', 'role = "otp" && status = "linked"', '-created', 1, 0)
      if (otpRows.length) return ok({ sender: otpRows[0].getString('number'), source: 'registry' })
      const settingRows = $app.findRecordsByFilter('admin_settings', 'key = "whatsapp_sender"', '', 1, 0)
      if (settingRows.length && settingRows[0].get('value')) {
        return ok({ sender: String(settingRows[0].get('value')), source: 'app_settings' })
      }
      return ok({ sender: null, source: 'none' })
    }

    return e.json(400, { error: 'unknown_action' })
  } catch (err) {
    console.log('GamFix admin-whatsapp failed: ' + (err && err.message ? err.message : 'unknown'))
    return e.json(500, { error: 'internal_error' })
  }
})
