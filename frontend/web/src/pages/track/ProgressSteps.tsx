import { CheckCircle2 } from 'lucide-react'
import { STATUS_STEPS } from './types'

export function ProgressSteps({ currentIdx, statusLabel }: { currentIdx: number; statusLabel: string }) {
  return (
    <section aria-label="Report progress, six stages">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Progress</p>
        <p className="text-xs text-muted-foreground">
          {currentIdx >= 0 ? `Step ${currentIdx + 1} of ${STATUS_STEPS.length} · ` : ''}
          {statusLabel ?? 'Status unavailable'}
        </p>
      </div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {STATUS_STEPS.map((s, i) => {
          const done = currentIdx >= i && currentIdx !== -1
          const isCurrent = currentIdx === i
          return (
            <li
              key={s.key}
              aria-current={isCurrent ? 'step' : undefined}
              className={
                'flex min-h-[72px] items-center gap-3 rounded-lg border p-3 text-left ' +
                (isCurrent
                  ? 'border-primary bg-primary/5 text-foreground'
                  : done
                    ? 'border-primary/30 bg-card text-foreground'
                    : 'border-border bg-card text-muted-foreground')
              }
            >
              <span
                aria-hidden="true"
                className={
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ' +
                  (isCurrent
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'border-primary/40 bg-primary/5 text-primary'
                      : 'border-border')
                }
              >
                {done && !isCurrent ? <CheckCircle2 className="h-4 w-4" /> : isCurrent ? <span className="h-2.5 w-2.5 rounded-full bg-current" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {isCurrent ? 'Current stage' : done ? 'Completed' : 'Upcoming'}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
