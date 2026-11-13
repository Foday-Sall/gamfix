migrate((app) => {
  const users = app.findCollectionByNameOrId('users')
  users.fields.add(new TextField({ name: 'full_name', max: 120 }))
  users.fields.add(new TextField({ name: 'role', max: 20 }))
  users.fields.add(new BoolField({ name: 'phone_verified' }))
  app.save(users)

  const institutions = new Collection({
    type: 'base', name: 'institutions', listRule: 'active = true', viewRule: 'active = true',
    fields: [
      { type: 'text', name: 'code', required: true, max: 20 },
      { type: 'text', name: 'name', required: true, max: 160 },
      { type: 'text', name: 'type', max: 40 },
      { type: 'text', name: 'logo_url', max: 500 },
      { type: 'text', name: 'blurb', max: 300 },
      { type: 'bool', name: 'active' },
    ], indexes: ['CREATE UNIQUE INDEX idx_institutions_code ON institutions (code)'],
  })
  app.save(institutions)

  const categories = new Collection({
    type: 'base', name: 'categories', listRule: 'active = true', viewRule: 'active = true',
    fields: [
      { type: 'text', name: 'slug', required: true, max: 80 },
      { type: 'text', name: 'name', required: true, max: 160 },
      { type: 'relation', name: 'default_institution_id', collectionId: institutions.id, maxSelect: 1 },
      { type: 'bool', name: 'is_sensitive' },
      { type: 'bool', name: 'is_emergency' },
      { type: 'number', name: 'deadline_hours' },
      { type: 'bool', name: 'active' },
    ], indexes: ['CREATE UNIQUE INDEX idx_categories_slug ON categories (slug)'],
  })
  app.save(categories)

  const complaints = new Collection({
    type: 'base', name: 'complaints',
    listRule: '@request.auth.id != "" && citizen = @request.auth.id',
    viewRule: '@request.auth.id != "" && citizen = @request.auth.id',
    fields: [
      { type: 'relation', name: 'citizen', collectionId: users.id, maxSelect: 1, required: true },
      { type: 'relation', name: 'institution', collectionId: institutions.id, maxSelect: 1, required: true },
      { type: 'relation', name: 'category', collectionId: categories.id, maxSelect: 1 },
      { type: 'text', name: 'tracking_no', required: true, max: 32 },
      { type: 'text', name: 'title', required: true, max: 120 },
      { type: 'text', name: 'description', required: true, max: 5000 },
      { type: 'text', name: 'status', required: true, max: 40 },
      { type: 'text', name: 'urgency', max: 20 },
      { type: 'text', name: 'council_area', max: 80 },
      { type: 'text', name: 'landmark', max: 300 },
      { type: 'number', name: 'lat' },
      { type: 'number', name: 'lng' },
      { type: 'date', name: 'expected_response_at' },
      { type: 'date', name: 'resolved_at' },
      { type: 'date', name: 'closed_at' },
      { type: 'text', name: 'external_id', max: 100 },
    ], indexes: [
      'CREATE UNIQUE INDEX idx_complaints_tracking ON complaints (tracking_no)',
      'CREATE UNIQUE INDEX idx_complaints_external ON complaints (external_id)',
      'CREATE INDEX idx_complaints_citizen ON complaints (citizen)',
    ],
  })
  app.save(complaints)

  const updates = new Collection({
    type: 'base', name: 'complaint_updates', listRule: '@request.auth.id != "" && complaint.citizen = @request.auth.id', viewRule: '@request.auth.id != "" && complaint.citizen = @request.auth.id',
    fields: [
      { type: 'relation', name: 'complaint', collectionId: complaints.id, maxSelect: 1, required: true },
      { type: 'text', name: 'status', max: 40 },
      { type: 'text', name: 'message', max: 1000 },
    ], indexes: ['CREATE INDEX idx_updates_complaint ON complaint_updates (complaint)'],
  })
  app.save(updates)

  const seedInstitution = (code, name, type, blurb) => {
    const record = new Record(institutions)
    record.set('code', code); record.set('name', name); record.set('type', type); record.set('blurb', blurb); record.set('active', true); app.save(record); return record
  }
  const kmc = seedInstitution('KMC', 'Kanifing Municipal Council', 'municipal', 'Waste collection, street lighting, local roads, markets.')
  const nawec = seedInstitution('NAWEC', 'National Water and Electricity Company', 'utility', 'Water supply, electricity, sewerage.')
  const nra = seedInstitution('NRA', 'National Roads Authority', 'national', 'National roads, traffic signs, highways.')
  const nea = seedInstitution('NEA', 'National Environment Agency', 'environment', 'Pollution, illegal dumping, public health, environment.')
  const police = seedInstitution('POLICE', 'Gambia Police Force', 'security', 'Crime reports, police misconduct, emergencies.')
  const central = seedInstitution('CENTRAL', 'GamFix Central Desk', 'central', 'Reports that need review first: fraud, abuse of power, fires and more.')

  const seedCategory = (slug, name, institution, sensitive = false, emergency = false) => {
    const record = new Record(categories)
    record.set('slug', slug); record.set('name', name); record.set('default_institution_id', institution ? institution.id : ''); record.set('is_sensitive', sensitive); record.set('is_emergency', emergency); record.set('deadline_hours', emergency ? 4 : 72); record.set('active', true); app.save(record)
  }
  seedCategory('water_supply', 'Water supply', nawec)
  seedCategory('electricity', 'Electricity', nawec)
  seedCategory('sewerage', 'Sewerage', nawec)
  seedCategory('waste_collection', 'Waste collection', kmc)
  seedCategory('streetlight', 'Street lighting', kmc)
  seedCategory('local_roads', 'Local roads', kmc)
  seedCategory('national_roads', 'National roads', nra)
  seedCategory('traffic_signs', 'Traffic signs', nra)
  seedCategory('pollution', 'Pollution', nea)
  seedCategory('illegal_dumping', 'Illegal dumping', nea)
  seedCategory('public_health', 'Public health', nea)
  seedCategory('crime_report', 'Crime report', police, true)
  seedCategory('police_misconduct', 'Police misconduct', central, true)
  seedCategory('abuse_of_power', 'Abuse of power', central, true)
  seedCategory('corruption_report', 'Corruption report', central, true)
  seedCategory('emergency_fire', 'Fire emergency', central, true, true)
  seedCategory('emergency_police', 'Police emergency', central, true, true)
  seedCategory('other', 'Other problem', central)
}, (app) => {
  for (const name of ['complaint_updates', 'complaints', 'categories', 'institutions']) { try { app.delete(app.findCollectionByNameOrId(name)) } catch {} }
})
