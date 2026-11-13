/// <reference path="../pb_data/types.d.ts" />
// ---- GamFix officer action routes (citizen-app institute dashboard) --------
// Ports the remaining officer lifecycle actions that lived in Postgres RPCs:
// reject (fn_officer_reject), request info (fn_officer_request_info),
// forward (fn_officer_forward) and attach proof (fn_officer_attach_proof).
// The accept / set-status / report-fix routes already live in
// staff-admin.pb.js. Every route re-derives the officer's institution from
// the auth record server-side — nothing from the browser is trusted.
//
// Body params keep the p_* names the original functions used, so the client
// calls read the same on both sides.

/**
 * Resolve the caller's staff scope. Returns:
 *   { ok: true,  isAdmin, officer, user }        — allowed to act
 *   { ok: false }                                — not staff (or mismatched)
 * `officer` is the active officers row linked to the caller's institution.
 */
function resolveStaffScope(e) {
  if (!e.auth) return { ok: false }
  const user = $app.findRecordById('users', e.auth.id)
  const instIdField = user.getString('institution')
  const rows = instIdField
    ? $app.findRecordsByFilter('officers', 'user = {:u} && is_active = true', '', 1, 0, { u: user.id })
    : []
  const isOfficer = user.getString('role') === 'officer' && instIdField && rows.length &&
    rows[0].getString('institution') === instIdField
  const isAdmin = user.getString('role') === 'admin' &&
    user.getString('email').toLowerCase() === 'admin@pocketsoftware.dev'
  if (!isAdmin && !isOfficer) return { ok: false }
  return { ok: true, isAdmin: isAdmin, officer: isOfficer ? rows[0] : null, user: user, instId: instIdField }
}

/** Read the JSON body of the request. */
function staffBody(e) {
  let body = {}
  try { const info = e.requestInfo(); if (info && info.body && typeof info.body === 'object') body = info.body } catch (_) {}
  return body
}

/** The complaint if it exists and belongs to the caller's scope, else null. */
function scopedComplaint(body, scope) {
  let row = null
  try { row = $app.findRecordById('complaints', String(body.p_complaint_id || '')) } catch (_) { row = null }
  if (!row) return null
  if (!scope.isAdmin && row.getString('institution') !== scope.instId) return null
  return row
}

/** Append one citizen-visible timeline entry inside the caller's transaction. */
function addTimeline(tx, row, fromStatus, toStatus, citizenMessage, explanation, actorName, citizenVisible) {
  const update = new Record($app.findCollectionByNameOrId('complaint_updates'))
  update.set('complaint', row.id)
  update.set('status', toStatus)
  update.set('message', citizenMessage)
  update.set('update_type', 'status')
  update.set('actor_label', 'officer')
  update.set('actor', actorName)
  update.set('status_from', fromStatus)
  update.set('status_to', toStatus)
  update.set('explanation', explanation)
  update.set('citizen_message', citizenVisible ? citizenMessage : '')
  update.set('is_citizen_visible', citizenVisible)
  tx.save(update)
}

function actorName(scope) {
  return scope.officer ? scope.officer.getString('name') : 'administrator'
}

// ---- POST /api/gamfix/staff/reject -----------------------------------------
// fn_officer_reject: close a report as rejected, with a reason the citizen sees.
routerAdd('POST', '/api/gamfix/staff/reject', (e) => {
  try {
    const scope = resolveStaffScope(e)
    if (!scope.ok) return e.json(200, false)
    const body = staffBody(e)
    const reason = String(body.p_reason || '').trim()
    if (reason.length < 10) return e.json(200, false)
    const row = scopedComplaint(body, scope)
    if (!row) return e.json(200, false)
    const fromStatus = row.getString('status')
    if (!['submitted', 'received', 'assigned', 'escalated', 'waiting_info'].includes(fromStatus)) {
      return e.json(200, false)
    }

    $app.runInTransaction((tx) => {
      row.set('status', 'rejected')
      tx.save(row)
      addTimeline(tx, row, fromStatus, 'rejected', reason, 'Report rejected by officer',
        actorName(scope), true)
    })
    console.log('GamFix staff reject ' + row.id + ' by ' + actorName(scope))
    return e.json(200, true)
  } catch (_) {
    return e.json(200, false)
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/staff/request-info -----------------------------------
// fn_officer_request_info: park the report in waiting_info and ask the
// citizen for more detail.
routerAdd('POST', '/api/gamfix/staff/request-info', (e) => {
  try {
    const scope = resolveStaffScope(e)
    if (!scope.ok) return e.json(200, false)
    const body = staffBody(e)
    const message = String(body.p_message || '').trim()
    if (message.length < 10) return e.json(200, false)
    const row = scopedComplaint(body, scope)
    if (!row) return e.json(200, false)
    const fromStatus = row.getString('status')
    if (!['submitted', 'received', 'assigned', 'in_progress', 'escalated', 'reopened'].includes(fromStatus)) {
      return e.json(200, false)
    }

    $app.runInTransaction((tx) => {
      row.set('status', 'waiting_info')
      tx.save(row)
      addTimeline(tx, row, fromStatus, 'waiting_info', message, 'More information requested',
        actorName(scope), true)
    })
    console.log('GamFix staff request-info ' + row.id + ' by ' + actorName(scope))
    return e.json(200, true)
  } catch (_) {
    return e.json(200, false)
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/staff/forward ----------------------------------------
// fn_officer_forward: hand the report to another institution, visibly, with
// a reason. Only open reports can move.
routerAdd('POST', '/api/gamfix/staff/forward', (e) => {
  try {
    const scope = resolveStaffScope(e)
    if (!scope.ok) return e.json(200, false)
    const body = staffBody(e)
    const reason = String(body.p_reason || '').trim()
    const targetId = String(body.p_institution_id || '')
    if (reason.length < 10 || !targetId) return e.json(200, false)
    const row = scopedComplaint(body, scope)
    if (!row) return e.json(200, false)
    const fromStatus = row.getString('status')
    if (!['submitted', 'received', 'assigned', 'in_progress', 'waiting_info', 'escalated', 'reopened'].includes(fromStatus)) {
      return e.json(200, false)
    }
    if (targetId === row.getString('institution')) return e.json(200, false)
    let target = null
    try { target = $app.findRecordById('institutions', targetId) } catch (_) { target = null }
    if (!target || target.getString('status') !== 'active') return e.json(200, false)

    $app.runInTransaction((tx) => {
      row.set('institution', targetId)
      row.set('status', 'forwarded')
      row.set('officer', '')
      tx.save(row)
      const citizenMessage = 'Your report was forwarded to ' +
        (target.getString('name') || 'another service') + ' for handling.'
      addTimeline(tx, row, fromStatus, 'forwarded', citizenMessage, reason,
        actorName(scope), true)
    })
    console.log('GamFix staff forward ' + row.id + ' -> ' + targetId + ' by ' + actorName(scope))
    return e.json(200, true)
  } catch (_) {
    return e.json(200, false)
  }
}, $apis.requireAuth('users'))

// ---- POST /api/gamfix/staff/proof ------------------------------------------
// fn_officer_attach_proof: record the public URL of the resolution proof
// photo on the complaint (audited, not shown to the citizen directly).
routerAdd('POST', '/api/gamfix/staff/proof', (e) => {
  try {
    const scope = resolveStaffScope(e)
    if (!scope.ok) return e.json(200, false)
    const body = staffBody(e)
    const photoUrl = String(body.p_photo_url || '').trim()
    if (!/^https?:\/\/\S+$/i.test(photoUrl) || photoUrl.length > 2000) return e.json(200, false)
    const row = scopedComplaint(body, scope)
    if (!row) return e.json(200, false)

    $app.runInTransaction((tx) => {
      row.set('resolution_photo_url', photoUrl)
      tx.save(row)
      addTimeline(tx, row, row.getString('status'), row.getString('status'),
        'Resolution proof photo attached by the handling service.',
        'Proof photo URL attached', actorName(scope), false)
    })
    console.log('GamFix staff proof ' + row.id + ' by ' + actorName(scope))
    return e.json(200, true)
  } catch (_) {
    return e.json(200, false)
  }
}, $apis.requireAuth('users'))
