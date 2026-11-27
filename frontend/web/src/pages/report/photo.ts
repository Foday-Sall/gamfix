import { toast } from 'sonner'
import { isNetworkError, uploadComplaintPhotos } from '@/lib/api'
import { compressImage } from '@/lib/imageCompress'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

export async function pickPhoto(
  file: File | undefined,
  previousPreview: string | null,
): Promise<{ file: File; preview: string } | null> {
  if (!file) return null
  if (!ACCEPTED_TYPES.includes(file.type)) {
    toast.error('Please choose a JPG, PNG, or WebP image.')
    return null
  }
  if (file.size > MAX_BYTES) {
    toast.error('Photo must be under 10 MB.')
    return null
  }
  const optimized = await compressImage(file)
  if (optimized.size < file.size * 0.75) {
    const savedMb = (file.size - optimized.size) / (1024 * 1024)
    toast.success('Photo optimized for upload', {
      description: `Saved ${savedMb.toFixed(1)} MB — same photo, faster to send.`,
    })
  }
  if (previousPreview) URL.revokeObjectURL(previousPreview)
  return { file: optimized, preview: URL.createObjectURL(optimized) }
}

export function clearPhoto(preview: string | null): void {
  if (preview) URL.revokeObjectURL(preview)
}

export async function uploadAndAttachPhoto(complaintId: string, file: File): Promise<string | null> {
  const normalizeCode = (value: string | null | undefined) =>
    value?.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48) || 'upload_failed'
  try {
    await uploadComplaintPhotos(complaintId, [file])
    return null
  } catch (error) {
    const status = (error as { status?: number }).status
    const failureCode = isNetworkError(error)
      ? 'photo_service_unreachable'
      : normalizeCode(status != null ? `photo_upload_${status}` : error instanceof Error ? error.name : null)
    console.error('citizen photo upload failed:', { code: failureCode, error })
    return failureCode
  }
}

export function newExternalId(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `web-${uuid}`.toUpperCase()
}
