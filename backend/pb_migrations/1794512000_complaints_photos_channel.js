/// <reference path="../pb_data/types.d.ts" />
// GamFix: citizen evidence photos + channel tracking on complaints.
// - photos: private (protected) image files uploaded by the owner via the
//   complaints update rule (citizen = @request.auth.id), validated here.
// - channel: which surface filed the report (web, whatsapp, telegram, ...).
migrate((app) => {
  const complaints = app.findCollectionByNameOrId('complaints')

  let hasPhotos = false
  let hasChannel = false
  try { hasPhotos = !!complaints.fields.getByName('photos') } catch (_) {}
  try { hasChannel = !!complaints.fields.getByName('channel') } catch (_) {}

  if (!hasPhotos) {
    complaints.fields.add(new FileField({
      name: 'photos',
      maxSelect: 5,
      maxSize: 10485760,
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      protected: true,
    }))
  }
  if (!hasChannel) {
    complaints.fields.add(new TextField({ name: 'channel', max: 20 }))
  }
  app.save(complaints)

  const rows = app.findRecordsByFilter('complaints', 'channel = ""', '', 0, 0)
  for (const row of rows) {
    row.set('channel', 'web')
    app.save(row)
  }
}, (app) => {
  const complaints = app.findCollectionByNameOrId('complaints')
  try { complaints.fields.removeByName('photos') } catch (_) {}
  try { complaints.fields.removeByName('channel') } catch (_) {}
  app.save(complaints)
})
