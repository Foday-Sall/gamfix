/// <reference path="../pb_data/types.d.ts" />
// GamFix: complaints and complaint_updates were created programmatically
// without autodate fields, which broke timeline sorting ("invalid sort field
// created"). Add created/updated autodate fields and backfill existing rows.
migrate((app) => {
  for (const name of ['complaints', 'complaint_updates']) {
    const collection = app.findCollectionByNameOrId(name)

    let hasCreated = false
    let hasUpdated = false
    try { hasCreated = !!collection.fields.getByName('created') } catch (_) {}
    try { hasUpdated = !!collection.fields.getByName('updated') } catch (_) {}

    if (!hasCreated) {
      collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    }
    if (!hasUpdated) {
      collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    }
    app.save(collection)

    // Backfill: re-save rows that predate the fields so autodate fills them.
    const records = app.findRecordsByFilter(name, 'id != ""', '-created', 0, 0)
    for (const record of records) {
      if (!record.getString('created') || !record.getString('updated')) {
        app.save(record)
      }
    }
  }
}, (app) => {
  for (const name of ['complaints', 'complaint_updates']) {
    const collection = app.findCollectionByNameOrId(name)
    try { collection.fields.removeByName('created') } catch (_) {}
    try { collection.fields.removeByName('updated') } catch (_) {}
    app.save(collection)
  }
})
