import { Clock } from 'lucide-react'
import { statusMeta } from '@/lib/gamfix'
import type { TimelineItem } from './types'

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Updates</p>
        <p className="text-xs text-muted-foreground">Refreshes automatically while this page is open</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <Clock className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium">No updates yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Updates appear here as soon as the handling service processes your
            report. Check back later.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((t, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-border bg-card p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.status ? statusMeta(t.status).label : 'Update'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.at
                    ? new Date(t.at).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : ''}
                </p>
                {t.message && <p className="mt-1 text-sm text-muted-foreground">{t.message}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
