/**
 * Client-side image compression for report photos.
 *
 * Phone cameras produce 3-8 MB images; report evidence does not need that.
 * We re-encode to JPEG at a bounded size so uploads are fast on Gambian
 * mobile data and safely inside PocketBase's file limits.
 *
 * Never throws: if decoding or encoding fails for any reason the original
 * file is returned unchanged, so a quirky image can still be attached.
 */

const MAX_DIM = 1600 // longest edge, px — plenty for staff to see detail
const QUALITY = 0.82 // JPEG quality — visually lossless for photos
const SKIP_BELOW = 320 * 1024 // files already this small pass through

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // 'from-image' honours EXIF orientation so photos are never sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through to the <img> path (older browsers, exotic formats)
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('decode failed'))
      img.src = url
    })
    return img
  } finally {
    // Revoked after decode; the bitmap has its own pixel copy by then.
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

function isBitmap(v: ImageBitmap | HTMLImageElement): v is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap
}

export async function compressImage(file: File): Promise<File> {
  try {
    if (file.type === 'image/gif' || file.size <= SKIP_BELOW) return file
    const source = await decode(file)
    const w = isBitmap(source) ? source.width : source.naturalWidth
    const h = isBitmap(source) ? source.height : source.naturalHeight
    if (!w || !h) return file
    const scale = Math.min(1, MAX_DIM / Math.max(w, h))
    // Already small and JPEG: keep the original bytes, no quality loss.
    if (scale === 1 && file.type === 'image/jpeg' && file.size <= SKIP_BELOW * 3) return file
    const cw = Math.round(w * scale)
    const ch = Math.round(h * scale)
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(source as CanvasImageSource, 0, 0, cw, ch)
    if (isBitmap(source)) source.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY),
    )
    if (!blob || blob.size >= file.size) return file // compression made it bigger — keep original
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], base + '.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
