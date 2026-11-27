import { Building2 } from 'lucide-react'
import GamFixMark from '@/components/GamFixMark'
import { Badge } from '@/components/ui/badge'
import { COUNCIL_AREAS } from '@/lib/gamfix'
import type { CategoryInfo, InstitutionInfo } from '@/lib/gamfix'
import type { LocationState } from './types'

export function SummaryPanel({
  institution,
  category,
  title,
  urgency,
  location,
  photoPreview,
}: {
  institution: InstitutionInfo | null
  category: CategoryInfo | null
  title: string
  urgency: 'normal' | 'high'
  location: LocationState
  photoPreview: string | null
}) {
  return (
    <aside className="hidden min-[1024px]:block min-[1024px]:col-span-5">
      <div className="sticky top-24 rounded-xl border border-border bg-card p-5">
        <p className="font-display text-base font-bold tracking-tight">Summary</p>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center gap-3">
            {institution ? (
              institution.logo ? (
                <img src={institution.logo} alt="" className="h-8 w-8 rounded object-contain" />
              ) : (
                <GamFixMark className="h-8 w-8" />
              )
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded bg-secondary">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Service</dt>
              <dd className="truncate font-medium">{institution?.name ?? 'Not set yet'}</dd>
            </div>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Problem</dt>
            <dd className="font-medium">{category?.name ?? 'Not set yet'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Title</dt>
            <dd className="font-medium">{title.trim() || 'Not set yet'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Urgency</dt>
            <dd>
              <Badge variant={urgency === 'high' ? 'destructive' : 'secondary'}>
                {urgency === 'high' ? 'Urgent' : 'Normal'}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Location</dt>
            <dd className="font-medium">
              {location.mode === 'gps' && location.lat != null
                ? `${location.lat.toFixed(5)}, ${location.lng?.toFixed(5)}`
                : COUNCIL_AREAS.find((a) => a.value === location.area)?.label ?? 'Not set yet'}
            </dd>
          </div>
          {photoPreview && (
            <div>
              <dt className="text-xs text-muted-foreground">Photo</dt>
              <dd>
                <img src={photoPreview} alt="Attached photo preview" className="mt-1 h-16 w-16 rounded-md border border-border object-cover" />
              </dd>
            </div>
          )}
        </dl>
      </div>
    </aside>
  )
}
