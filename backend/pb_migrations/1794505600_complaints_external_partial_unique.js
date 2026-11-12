/// <reference path="../pb_data/types.d.ts" />
// GamFix: the external_id unique index was created without a partial clause,
// so any second complaint with an empty external_id collided with the first
// one and submit started failing with "external_id: Value must be unique".
// Replace it with a partial unique index that only applies to non-empty ids.
migrate((app) => {
  const collection = app.findCollectionByNameOrId('complaints')
  const keep = []
  for (const index of collection.indexes) {
    if (String(index).indexOf('idx_complaints_external') === -1) keep.push(index)
  }
  keep.push("CREATE UNIQUE INDEX `idx_complaints_external_partial` ON `complaints` (`external_id`) WHERE `external_id` != ''")
  collection.indexes = keep
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId('complaints')
  const keep = []
  for (const index of collection.indexes) {
    if (String(index).indexOf('idx_complaints_external') === -1) keep.push(index)
  }
  keep.push('CREATE UNIQUE INDEX `idx_complaints_external` ON `complaints` (`external_id`)')
  collection.indexes = keep
  app.save(collection)
})
