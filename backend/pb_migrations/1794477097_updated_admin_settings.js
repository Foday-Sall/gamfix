/// <reference path="../pb_data/types.d.ts" />
// Tightens admin_settings list/view rules to admins only.
// NOTE: on a brand-new database the admin_settings collection does not exist
// yet at this point (it is created by 1794521000_staff_admin.js, which also
// sets these rules) — so skip gracefully when it is missing.
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_1443811924")
  } catch (_) {
    return null // collection not created yet; rules applied at creation
  }

  // update collection data
  unmarshal({
    "listRule": "@request.auth.role = \"admin\"",
    "viewRule": "@request.auth.role = \"admin\""
  }, collection)

  return app.save(collection)
}, (app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_1443811924")
  } catch (_) {
    return null
  }

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
})
