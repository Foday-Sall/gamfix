import imageCompression from 'browser-image-compression'

const MAX_DIM = 1600
const QUALITY = 0.82
const SKIP_BELOW = 320 * 1024

export async function compressImage(file: File): Promise<File> {
  if (file.type === 'image/gif' || file.size <= SKIP_BELOW) return file
  try {
    const blob = await imageCompression(file, {
      maxWidthOrHeight: MAX_DIM,
      initialQuality: QUALITY,
      fileType: 'image/jpeg',
      useWebWorker: true,
      maxSizeMB: Number.POSITIVE_INFINITY,
    })
    if (blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
