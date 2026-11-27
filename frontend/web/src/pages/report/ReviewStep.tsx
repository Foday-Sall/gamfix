import { motion } from 'framer-motion'
import { ChevronLeft, Loader2 } from 'lucide-react'
import GamFixMark from '@/components/GamFixMark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { COUNCIL_AREAS } from '@/lib/gamfix'
import type { CategoryInfo, InstitutionInfo } from '@/lib/gamfix'
import { stepMotion } from './ServiceStep'
import type { LocationState } from './types'

export function ReviewStep({
  institution,
  category,
  title,
  description,
  photoPreview,
  location,
  urgency,
  submitting,
  direction,
  onSend,
  onBack,
}: {
  institution: InstitutionInfo | null
  category: CategoryInfo | null
  title: string
  description: string
  photoPreview: string | null
  location: LocationState
  urgency: 'normal' | 'high'
  submitting: boolean
  direction: number
  onSend: () => void
  onBack: () => void
}) {
  return (
    <motion.section key="step-4" {...stepMotion(direction)}>
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
        Check and send
      </h1>
      <div className="mt-6 space-y-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            {institution?.logo ? (
              <img src={institution.logo} alt="" className="h-10 w-10 rounded-md object-contain" />
            ) : (
              <GamFixMark className="h-10 w-10" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">This will be sent to</p>
              <p className="font-semibold leading-tight">{institution?.name}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Problem</p>
          <p className="font-semibold">{category?.name}</p>
          <p className="mt-2 text-sm text-muted-foreground">Title</p>
          <p className="font-medium">{title.trim()}</p>
          <p className="mt-2 text-sm text-muted-foreground">Description</p>
          <p className="text-sm">{description.trim()}</p>
          {photoPreview && (
            <img
              src={photoPreview}
              alt="Attached photo"
              className="mt-3 h-20 w-20 rounded-md border border-border object-cover"
            />
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Location</p>
          <p className="font-medium">
            {location.mode === 'gps' && location.lat != null
              ? `${location.lat.toFixed(5)}, ${location.lng?.toFixed(5)}`
              : COUNCIL_AREAS.find((a) => a.value === location.area)?.label ?? '—'}
            {location.area && location.mode === 'gps'
              ? ` · ${COUNCIL_AREAS.find((a) => a.value === location.area)?.label}`
              : ''}
          </p>
          {location.landmark.trim() && (
            <p className="mt-1 text-sm text-muted-foreground">{location.landmark.trim()}</p>
          )}
          <div className="mt-3 flex gap-2">
            <Badge variant={urgency === 'high' ? 'destructive' : 'secondary'}>
              {urgency === 'high' ? 'Urgent' : 'Normal urgency'}
            </Badge>
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-5 mt-6 flex items-center justify-between border-t border-clay-line bg-background/95 p-4 backdrop-blur md:-mx-6">
        <Button variant="ghost" className="h-11" onClick={onBack} disabled={submitting}>
          <ChevronLeft /> Back
        </Button>
        <Button className="h-11" onClick={onSend} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="animate-spin" /> Sending…
            </>
          ) : (
            'Send report'
          )}
        </Button>
      </div>
    </motion.section>
  )
}
