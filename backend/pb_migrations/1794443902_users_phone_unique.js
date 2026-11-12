/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")
  const index = "CREATE UNIQUE INDEX `idx_users_phone_unique` ON `users` (`phone`) WHERE `phone` != ''"
  if (!collection.indexes.includes(index)) collection.indexes.push(index)
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")
  collection.indexes = collection.indexes.filter((index) => !index.includes("idx_users_phone_unique"))
  return app.save(collection)
})
