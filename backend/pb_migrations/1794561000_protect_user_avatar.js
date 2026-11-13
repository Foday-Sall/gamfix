/// <reference path="../pb_data/types.d.ts" />
// GamFix: make users.avatar a Protected file field (docs: Files handling →
// Protected files). Complaint evidence photos (complaints.photos and
// complaints.resolution_photos) are already protected — this closes the last
// file field that held personal media. Requests now need a short-lived file
// token (POST /api/files/token) that satisfies the users View rule
// (id = @request.auth.id), so only the owner (or a superuser) can load an
// avatar; a leaked URL stops working when the token expires.
// institutions.logo stays public on purpose: it is the branding shown on the
// public landing page and in the public institutions list.
migrate((app) => {
  const c = app.findCollectionByNameOrId('users')
  const avatar = c.fields.getByName('avatar')
  avatar.protected = true
  avatar.thumbs = ['100x100', '300x300']
  app.save(c)
}, (app) => {
  const c = app.findCollectionByNameOrId('users')
  const avatar = c.fields.getByName('avatar')
  avatar.protected = false
  avatar.thumbs = []
  app.save(c)
})
