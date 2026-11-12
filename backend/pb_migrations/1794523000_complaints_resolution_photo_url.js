/// <reference path="../pb_data/types.d.ts" />
// GamFix: resolution proof photo URL on complaints. The officer console's
// "attach proof" action (fn_officer_attach_proof in the original Postgres
// schema) stores a public URL of the fix photo; PocketBase had no column for
// it. Plain text on purpose — it is an external URL, not a managed file.
migrate((app) => {
  const complaints = app.findCollectionByNameOrId('complaints')
  complaints.fields.add(new TextField({
    name: 'resolution_photo_url',
    max: 2000,
  }))
  app.save(complaints)
}, (app) => {
  const complaints = app.findCollectionByNameOrId('complaints')
  complaints.fields.removeByName('resolution_photo_url')
  app.save(complaints)
})
