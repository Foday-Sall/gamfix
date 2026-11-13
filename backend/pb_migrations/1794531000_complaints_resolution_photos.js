/// <reference path="../pb_data/types.d.ts" />
// GamFix: resolution proof photo as a managed file on complaints. The officer
// resolution flow (staff console "report fix") can now attach the fix photo
// itself; resolution_photo_url (text) stores its public URL for backwards
// compatibility with the external-URL attach action. Protected like the
// citizen `photos` field — served only with a valid file token.
migrate((app) => {
  const complaints = app.findCollectionByNameOrId('complaints')
  complaints.fields.add(new FileField({
    name: 'resolution_photos',
    maxSelect: 1,
    maxSize: 8388608,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    protected: true,
    thumbs: [],
  }))
  app.save(complaints)
}, (app) => {
  const complaints = app.findCollectionByNameOrId('complaints')
  complaints.fields.removeByName('resolution_photos')
  app.save(complaints)
})
