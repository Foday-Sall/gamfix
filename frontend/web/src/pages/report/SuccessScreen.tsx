import { motion } from 'framer-motion'
import { Check, Copy, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { SubmitResult } from './types'

export function SuccessScreen({
  result,
  photoUploadFailed,
  photoUploadFailureCode,
  retryingPhotoUpload,
  hasPhoto,
  copied,
  onRetryPhoto,
  onCopy,
  onNewReport,
}: {
  result: SubmitResult
  photoUploadFailed: boolean
  photoUploadFailureCode: string | null
  retryingPhotoUpload: boolean
  hasPhoto: boolean
  copied: boolean
  onRetryPhoto: () => void
  onCopy: () => void
  onNewReport: () => void
}) {
  return (
    <motion.section
      key="step-success"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-xl text-center min-[1024px]:max-w-[560px]"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Check className="h-8 w-8 text-primary" />
      </div>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl">
        Report submitted
      </h1>
      <p className="mt-2 text-muted-foreground">
        Your report goes to {result.institution_name}. Keep this tracking number:
      </p>
      {hasPhoto && photoUploadFailed && (
        <div role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left">
          <p className="text-sm font-medium text-destructive">
            Your report is saved. We could not confirm the photo attachment. Use the button below to check or try again. If the first upload completed, retry will detect it without creating another report.
          </p>
          {photoUploadFailureCode && (
            <p className="mt-2 text-xs text-muted-foreground">
              Upload reference: <code>{photoUploadFailureCode}</code>
            </p>
          )}
          <Button
            type="button"
            variant="default"
            className="mt-3 h-11 w-full justify-center font-semibold"
            disabled={retryingPhotoUpload}
            onClick={onRetryPhoto}
          >
            {retryingPhotoUpload ? <Loader2 className="animate-spin" /> : null}
            {retryingPhotoUpload ? 'Retrying photo upload…' : 'Retry photo upload'}
          </Button>
        </div>
      )}
      <div className="mt-6 rounded-xl bg-gold-tint p-4">
        <p className="font-display text-2xl font-bold leading-tight tracking-wide text-gold-deep tabular sm:text-[28px]">
          {result.tracking_no}
        </p>
        <p className="mt-1 text-xs text-gold-ink">
          Write it down or screenshot it. You will need it to follow your report.
        </p>
      </div>
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onCopy}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button asChild className="h-11 w-full sm:w-auto">
          <Link to={`/track?ref=${result.tracking_no}`}>Track it</Link>
        </Button>
      </div>
      <p className="mt-6">
        <button
          type="button"
          onClick={onNewReport}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          File another report
        </button>
      </p>
    </motion.section>
  )
}
