/// <reference path="../pb_data/types.d.ts" />
// GamFix: generate PocketBase thumbnails for complaint photos so the apps
// never download multi-MB originals for previews. Thumb URL format is the
// standard `?thumb=WxH` query on the file URL (SDK: files.getURL(..., {thumb})).
migrate((app) => {
  const c = app.findCollectionByNameOrId('complaints')
  const photos = c.fields.getByName('photos')
  photos.thumbs = ['100x100', '300x300', '600x0', '1200x0']
  const rp = c.fields.getByName('resolution_photos')
  rp.thumbs = ['100x100', '300x300', '600x0', '1200x0']
  app.save(c)
}, (app) => {
  const c = app.findCollectionByNameOrId('complaints')
  const photos = c.fields.getByName('photos')
  photos.thumbs = []
  const rp = c.fields.getByName('resolution_photos')
  rp.thumbs = []
  app.save(c)
})
