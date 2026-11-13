/// <reference path="../pb_data/types.d.ts" />
// GamFix: citizen evidence photo upload over HTTP. The citizen app attaches
// photos with an authenticated PATCH on the complaints record, which requires
// an update rule. It was never set (null = nobody), so photo attachment
// always failed with 403/404 — the file field existed but no rule let the
// owner write it. Owners may update ONLY the photos field; every other field
// change is rejected by the onRecordUpdateRequest guard in gamfix.pb.js
// (officer/admin writes go through server routes, not this rule).
migrate((app) => {
  const complaints = app.findCollectionByNameOrId('complaints')
  complaints.updateRule = 'citizen = @request.auth.id'
  app.save(complaints)
}, (app) => {
  const complaints = app.findCollectionByNameOrId('complaints')
  complaints.updateRule = null
  app.save(complaints)
})
