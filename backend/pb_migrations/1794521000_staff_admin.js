/// <reference path="../pb_data/types.d.ts" />
// GamFix staff/admin layer (port of backend/db 0011 + 0015 + 0018 + 0019).
// Adds the institution access-control columns, staff directory, admin audit
// log, admin settings, app secrets, WhatsApp number registry, and the extra
// complaint fields the institution dashboard renders. Complaint/update list
// rules are widened so officers see their own institution's reports (writes
// still flow exclusively through server routes).

const ADMIN_RULE = '@request.auth.role = "admin"'
const STAFF_OR_OWNER = (
  '@request.auth.id != "" && (citizen = @request.auth.id' +
  ' || @request.auth.role = "admin"' +
  ' || (@request.auth.role = "officer" && institution = @request.auth.institution))'
)

migrate((app) => {
  const institutions = app.findCollectionByNameOrId('institutions')
  const users = app.findCollectionByNameOrId('_pb_users_auth_')
  const complaints = app.findCollectionByNameOrId('complaints')
  const updates = app.findCollectionByNameOrId('complaint_updates')

  const addIfMissing = (collection, field) => {
    let exists = false
    try { exists = !!collection.fields.getByName(field.name) } catch (_) {}
    if (!exists) collection.fields.add(field)
  }

  // ---- users: staff institution scope -------------------------------------
  addIfMissing(users, new RelationField({
    name: 'institution', collectionId: institutions.id, maxSelect: 1,
  }))
  addIfMissing(users, new TextField({ name: 'department', max: 80 }))
  app.save(users)

  // ---- institutions: access control + logo (port of 0011) -----------------
  addIfMissing(institutions, new JSONField({ name: 'contact' }))
  addIfMissing(institutions, new SelectField({
    name: 'access_level', maxSelect: 1, values: ['full', 'restricted', 'view-only'],
  }))
  addIfMissing(institutions, new JSONField({ name: 'allowed_categories' }))
  addIfMissing(institutions, new NumberField({ name: 'sla_hours', onlyInt: true }))
  addIfMissing(institutions, new NumberField({ name: 'max_complaints_per_day', onlyInt: true }))
  addIfMissing(institutions, new SelectField({
    name: 'status', maxSelect: 1, values: ['active', 'suspended'],
  }))
  addIfMissing(institutions, new FileField({
    name: 'logo', maxSelect: 1, maxSize: 2097152,
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    thumbs: ['100x100', '240x240'],
  }))
  institutions.createRule = ADMIN_RULE
  institutions.updateRule = ADMIN_RULE
  institutions.deleteRule = ADMIN_RULE
  app.save(institutions)

  const instRows = app.findRecordsByFilter('institutions', '', '', 0, 0)
  for (const row of instRows) {
    if (!row.get('contact')) row.set('contact', { email: '', phone: '' })
    if (!row.get('allowed_categories')) row.set('allowed_categories', [])
    if (!row.getInt('sla_hours')) row.set('sla_hours', 48)
    if (!row.getInt('max_complaints_per_day')) row.set('max_complaints_per_day', 100)
    if (!row.getString('access_level')) row.set('access_level', 'restricted')
    if (!row.getString('status')) row.set('status', 'active')
    app.save(row)
  }

  // ---- complaints: dashboard fields + staff read scope --------------------
  addIfMissing(complaints, new TextField({ name: 'region', max: 80 }))
  addIfMissing(complaints, new TextField({ name: 'ward', max: 160 }))
  addIfMissing(complaints, new BoolField({ name: 'is_anonymous' }))
  addIfMissing(complaints, new TextField({ name: 'officer', max: 120 }))
  addIfMissing(complaints, new TextField({ name: 'department', max: 120 }))
  addIfMissing(complaints, new TextField({ name: 'resolution_note', max: 2000 }))
  addIfMissing(complaints, new NumberField({ name: 'reopened_count', onlyInt: true }))
  complaints.listRule = STAFF_OR_OWNER
  complaints.viewRule = STAFF_OR_OWNER
  app.save(complaints)

  const complaintRows = app.findRecordsByFilter('complaints', '', '', 0, 0)
  for (const row of complaintRows) {
    row.set('is_anonymous', false)
    if (!row.getInt('reopened_count')) row.set('reopened_count', 0)
    app.save(row)
  }

  // ---- complaint_updates: structured staff timeline fields ----------------
  addIfMissing(updates, new TextField({ name: 'update_type', max: 20 }))
  addIfMissing(updates, new TextField({ name: 'actor_label', max: 20 }))
  addIfMissing(updates, new TextField({ name: 'actor', max: 120 }))
  addIfMissing(updates, new TextField({ name: 'status_from', max: 40 }))
  addIfMissing(updates, new TextField({ name: 'status_to', max: 40 }))
  addIfMissing(updates, new TextField({ name: 'explanation', max: 2000 }))
  addIfMissing(updates, new TextField({ name: 'citizen_message', max: 2000 }))
  addIfMissing(updates, new BoolField({ name: 'is_citizen_visible' }))
  updates.listRule =
    '@request.auth.id != "" && (complaint.citizen = @request.auth.id' +
    ' || @request.auth.role = "admin"' +
    ' || (@request.auth.role = "officer" && complaint.institution = @request.auth.institution))'
  updates.viewRule = updates.listRule
  app.save(updates)

  const updateRows = app.findRecordsByFilter('complaint_updates', 'actor_label = ""', '', 0, 0)
  for (const row of updateRows) {
    row.set('update_type', 'status')
    row.set('actor_label', 'system')
    row.set('is_citizen_visible', true)
    app.save(row)
  }

  // ---- officers directory (port of the officers table) --------------------
  let officersCol = null
  try { officersCol = app.findCollectionByNameOrId('officers') } catch (_) {}
  if (!officersCol) {
    officersCol = new Collection({
      type: 'base', name: 'officers',
      listRule: ADMIN_RULE + ' || user = @request.auth.id',
      viewRule: ADMIN_RULE + ' || user = @request.auth.id',
      createRule: ADMIN_RULE, updateRule: ADMIN_RULE, deleteRule: ADMIN_RULE,
      fields: [
        { type: 'text', name: 'name', required: true, max: 120 },
        { type: 'email', name: 'email', required: true },
        { type: 'relation', name: 'user', collectionId: users.id, maxSelect: 1 },
        { type: 'relation', name: 'institution', collectionId: institutions.id, maxSelect: 1 },
        { type: 'text', name: 'department', max: 120 },
        { type: 'select', name: 'role', maxSelect: 1, values: ['institution-admin', 'officer', 'view-only'] },
        { type: 'bool', name: 'is_active' },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_officers_email ON officers (email)',
        'CREATE INDEX idx_officers_institution ON officers (institution)',
      ],
    })
    app.save(officersCol)
  }

  // ---- admin audit log (append-only, admin readable) ----------------------
  let auditCol = null
  try { auditCol = app.findCollectionByNameOrId('admin_audit_log') } catch (_) {}
  if (!auditCol) {
    auditCol = new Collection({
      type: 'base', name: 'admin_audit_log',
      listRule: ADMIN_RULE, viewRule: ADMIN_RULE,
      createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { type: 'text', name: 'actor_email', max: 200 },
        { type: 'text', name: 'action', required: true, max: 60 },
        { type: 'text', name: 'target_type', max: 40 },
        { type: 'text', name: 'target_id', max: 60 },
        { type: 'json', name: 'details' },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_admin_audit_created ON admin_audit_log (created)'],
    })
    app.save(auditCol)
  }

  // ---- admin settings (key/value, any staff read, admin write) ------------
  let settingsCol = null
  try { settingsCol = app.findCollectionByNameOrId('admin_settings') } catch (_) {}
  if (!settingsCol) {
    settingsCol = new Collection({
      type: 'base', name: 'admin_settings',
      listRule: '@request.auth.id != ""', viewRule: '@request.auth.id != ""',
      createRule: ADMIN_RULE, updateRule: ADMIN_RULE, deleteRule: ADMIN_RULE,
      fields: [
        { type: 'text', name: 'key', required: true, max: 60 },
        { type: 'json', name: 'value' },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_admin_settings_key ON admin_settings (key)'],
    })
    app.save(settingsCol)
  }

  // ---- app secrets managed by the admin console ---------------------------
  let secretsCol = null
  try { secretsCol = app.findCollectionByNameOrId('app_secrets') } catch (_) {}
  if (!secretsCol) {
    secretsCol = new Collection({
      type: 'base', name: 'app_secrets',
      listRule: ADMIN_RULE, viewRule: ADMIN_RULE,
      createRule: ADMIN_RULE, updateRule: ADMIN_RULE, deleteRule: ADMIN_RULE,
      fields: [
        { type: 'text', name: 'key', required: true, max: 80 },
        { type: 'text', name: 'value', required: true, max: 2000 },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_app_secrets_key ON app_secrets (key)'],
    })
    app.save(secretsCol)
  }

  // ---- WhatsApp number registry (admin console) ---------------------------
  let waCol = null
  try { waCol = app.findCollectionByNameOrId('whatsapp_numbers') } catch (_) {}
  if (!waCol) {
    waCol = new Collection({
      type: 'base', name: 'whatsapp_numbers',
      listRule: ADMIN_RULE, viewRule: ADMIN_RULE,
      createRule: ADMIN_RULE, updateRule: ADMIN_RULE, deleteRule: ADMIN_RULE,
      fields: [
        { type: 'text', name: 'number', required: true, max: 24 },
        { type: 'select', name: 'role', maxSelect: 1, values: ['otp', 'chat'] },
        { type: 'select', name: 'status', maxSelect: 1, values: ['pending', 'linked', 'revoked'] },
        { type: 'text', name: 'gowa_instance', max: 80 },
        { type: 'text', name: 'gowa_state', max: 80 },
        { type: 'text', name: 'gowa_jid', max: 120 },
        { type: 'date', name: 'linked_at' },
        { type: 'date', name: 'revoked_at' },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_wa_numbers_number ON whatsapp_numbers (number)'],
    })
    app.save(waCol)
  }
}, (app) => {
  // Down migration: drop the new collections; keep field removals minimal.
  for (const name of ['whatsapp_numbers', 'app_secrets', 'admin_settings', 'admin_audit_log', 'officers']) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) {}
  }
})
