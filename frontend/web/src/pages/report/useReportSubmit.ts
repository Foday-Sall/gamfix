import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { gamfix, handleAuthExpired, isAuthError, isNetworkError } from '@/lib/api'
import type { CategoryInfo, InstitutionInfo } from '@/lib/gamfix'
import { newExternalId, uploadAndAttachPhoto } from './photo'
import { friendlySubmitError, regionForArea, type LocationState, type SubmitResult } from './types'

export type ReportDraft = {
  institution: InstitutionInfo | null
  category: CategoryInfo | null
  title: string
  description: string
  urgency: 'normal' | 'high'
  location: LocationState
  photoFile: File | null
}

export function useReportSubmit(options: {
  getDraft: () => ReportDraft
  onSubmitted: (result: SubmitResult) => void
}) {
  const { getDraft, onSubmitted } = options
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [photoUploadFailed, setPhotoUploadFailed] = useState(false)
  const [photoUploadFailureCode, setPhotoUploadFailureCode] = useState<string | null>(null)
  const [retryingPhotoUpload, setRetryingPhotoUpload] = useState(false)
  const [copied, setCopied] = useState(false)
  const sentExternalIdRef = useRef<string | null>(null)

  async function submit(): Promise<void> {
    const draft = getDraft()
    const { institution, category, photoFile, location } = draft
    if (!institution || !category) return
    if (!navigator.onLine) {
      toast.error("You're offline. Reconnect and try again — your report isn't sent yet.")
      return
    }
    setSubmitting(true)
    try {
      if (photoFile) {
        let access: { ok?: boolean; role?: string | null } | null = null
        try {
          access = await gamfix('/api/gamfix/access')
        } catch {
          toast.error('We could not verify your citizen account. Please try again.')
          return
        }
        if (!access?.ok || access.role !== 'citizen') {
          toast.error('Sign in with your citizen account before sending a report with a photo. App and dashboard tabs in this browser share one sign-in.')
          return
        }
      }

      if (!sentExternalIdRef.current) {
        sentExternalIdRef.current = newExternalId()
      }
      const params: Record<string, unknown> = {
        p_title: draft.title.trim(),
        p_description: draft.description.trim(),
        p_category_hint: category.slug,
        p_urgency_hint: draft.urgency,
        p_channel: 'web',
        p_is_anonymous: false,
        p_confidence: 1.0,
        p_external_id: sentExternalIdRef.current,
      }
      if (location.mode === 'gps' && location.lat != null && location.lng != null) {
        params.p_lat = location.lat
        params.p_lng = location.lng
      }
      if (location.area) {
        params.p_council_area = location.area
        params.p_region = regionForArea(location.area)
      }
      if (location.landmark.trim()) params.p_landmark = location.landmark.trim()

      let res: SubmitResult
      try {
        res = await gamfix<SubmitResult>('/api/gamfix/complaints', params)
      } catch (submitError) {
        console.error('submit_complaint failed:', submitError)
        if (isAuthError(submitError)) {
          toast.error('Your session has expired. Please sign in again.')
          await handleAuthExpired()
          return
        }
        toast.error(
          isNetworkError(submitError)
            ? "Network problem — the report may not have been sent. Check your connection and try Send again; you won't get duplicates."
            : friendlySubmitError(submitError as { message?: string } | null),
        )
        return
      }

      if (photoFile) {
        const failureCode = await uploadAndAttachPhoto(res.complaint_id, photoFile)
        setPhotoUploadFailed(!!failureCode)
        setPhotoUploadFailureCode(failureCode)
        if (failureCode) {
          toast.warning(`Report filed, but we could not confirm the photo was attached. Error reference: ${failureCode}. Retry on the confirmation screen.`)
        }
      }

      sentExternalIdRef.current = null
      setResult({ ...res, institution_name: institution.name })
      onSubmitted(res)
    } catch (err) {
      console.error('submit threw:', err)
      toast.error('Something went wrong while sending your report. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function retryPhotoAttachment(): Promise<void> {
    if (!result || !getDraft().photoFile || retryingPhotoUpload) return
    let access: { ok?: boolean; role?: string | null } | null = null
    try {
      access = await gamfix('/api/gamfix/access')
    } catch {
      toast.error('We could not verify your citizen account. Please try again.')
      return
    }
    if (!access?.ok || access.role !== 'citizen') {
      toast.error('Sign in with your citizen account before retrying. App and dashboard tabs in this browser share one sign-in.')
      return
    }

    setRetryingPhotoUpload(true)
    try {
      const failureCode = await uploadAndAttachPhoto(result.complaint_id, getDraft().photoFile as File)
      setPhotoUploadFailed(!!failureCode)
      setPhotoUploadFailureCode(failureCode)
      if (!failureCode) toast.success('Photo attached to your report.')
      else toast.error(`Photo upload failed (${failureCode}). Keep your tracking number and try again.`)
    } finally {
      setRetryingPhotoUpload(false)
    }
  }

  async function copyTracking(): Promise<void> {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.tracking_no)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — select the code and copy it manually.')
    }
  }

  function clearPhotoIssue(): void {
    setPhotoUploadFailed(false)
    setPhotoUploadFailureCode(null)
  }

  function reset(): void {
    setResult(null)
    setPhotoUploadFailed(false)
    setPhotoUploadFailureCode(null)
    setRetryingPhotoUpload(false)
    setCopied(false)
    sentExternalIdRef.current = null
  }

  return {
    submitting,
    result,
    photoUploadFailed,
    photoUploadFailureCode,
    retryingPhotoUpload,
    copied,
    submit,
    retryPhotoAttachment,
    copyTracking,
    clearPhotoIssue,
    reset,
  }
}
