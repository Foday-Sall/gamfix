/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // add field
  collection.fields.addAt(13, new Field({
    "autogeneratePattern": "",
    "help": "Verified WhatsApp phone number",
    "hidden": false,
    "id": "textgamfixphone",
    "max": 15,
    "min": 0,
    "name": "phone",
    "pattern": "^220[0-9]{7}$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // remove field
  collection.fields.removeById("textgamfixphone")

  return app.save(collection)
})
