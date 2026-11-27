import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Search, RefreshCw, CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { statusMeta } from '@/lib/gamfix'
import { CitizenResponse } from './track/CitizenResponse'
import { ProgressSteps } from './track/ProgressSteps'
import { Timeline } from './track/Timeline'
import { STATUS_STAGE, STATUS_STEPS } from './track/types'
import { useTracking } from './track/useTracking'

export default function Track() {
  useEffect(() => {
    document.title = 'Track a report · GamFix'
  }, [])
  const t = useTracking()

  const badge = t.result ? statusMeta(t.result.status ?? undefined) : null
  const currentIdx = t.result ? (STATUS_STAGE[t.result.status ?? ''] ?? -1) : -1
  const citizenResponseNeeded = ['citizen_confirmation', 'resolved'].includes(
    t.result?.status ?? '',
  )

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8 md:px-6">
      <main className="w-full">
        <div className="grid grid-cols-1 gap-8 min-[1024px]:grid-cols-12">
        {/* Left: lookup (sticky on desktop) */}
        <div className="min-[1024px]:col-span-5">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Track a report</h1>
          <p className="mt-2 text-muted-foreground">
            Enter the tracking number you received when you filed your report.
          </p>

          <div className="mt-6 rounded-xl border border-border bg-card p-4 min-[1024px]:sticky min-[1024px]:top-24">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void t.runLookup()
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <div className="flex-1 space-y-2">
                <label htmlFor="tracking" className="sr-only">Tracking number</label>
                <Input
                  id="tracking"
                  value={t.value}
                  onChange={(e) => t.setValue(e.target.value.toUpperCase())}
                  placeholder="GMC-XXXX-XXXXX"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
              </div>
              <Button type="submit" disabled={t.loading || !t.value.trim()}>
                {t.loading ? <Loader2 className="animate-spin" /> : <Search />}
                {t.loading ? 'Looking…' : 'Track'}
              </Button>
            </form>
          </div>

          <div className="mt-4 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Where do I find my number?</p>
            <p className="mt-1">
              Every report confirmation shows a code like{' '}
              <span className="rounded bg-background px-1.5 py-0.5 font-mono text-foreground">GMC-2026-00042</span>{' '}
              right after you send it. Copy it there.
            </p>
          </div>
        </div>

        {/* Right: result */}
        <div className="min-[1024px]:col-span-7">
        {/* Empty state: nothing searched yet */}
        {!t.searched && !t.loading && !t.notFound && !t.result && (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <Search className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">Enter a tracking number to see its status</p>
          </div>
        )}

        {t.loading && !t.result && (
          <div className="mt-8 space-y-4" aria-live="polite" aria-busy="true">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-6 w-3/4 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-6 w-20 shrink-0 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: STATUS_STEPS.length }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-muted" />
              ))}
            </div>
            <div className="space-y-3">
              <div className="h-16 animate-pulse rounded-lg border border-border bg-card" />
              <div className="h-16 animate-pulse rounded-lg border border-border bg-card" />
            </div>
          </div>
        )}

        {t.notFound && (
          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium">No report found for that number</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Check for typos. The format is GMC-XXXX-XXXXX, copied from your report
                  confirmation. Or start a{' '}
                  <Link to="/report" className="font-medium text-primary underline">new report</Link>.
                </p>
              </div>
            </div>
          </div>
        )}

        {t.result && (
          <section className="mt-8 space-y-6">
            {/* summary card */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-muted-foreground">{t.result.tracking_no}</p>
                  <h2 className="mt-1 font-display text-lg font-bold leading-tight">
                    {t.result.title ?? 'Report details withheld'}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void t.refreshStatus(t.result!.tracking_no)}
                    disabled={t.refreshingStatus}
                    aria-label="Refresh report status"
                  >
                    {t.refreshingStatus ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                    <span className="sr-only">Refresh status</span>
                  </Button>
                </div>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Handled by</dt>
                  <dd className="font-medium">{t.result.institution ?? 'Not provided'}</dd>
                </div>
                {t.result.department && (
                  <div>
                    <dt className="text-muted-foreground">Department</dt>
                    <dd className="font-medium">{t.result.department}</dd>
                  </div>
                )}
                {t.result.expected_response_at && (
                  <div>
                    <dt className="text-muted-foreground">Expected response</dt>
                    <dd className="font-medium">
                      {new Date(t.result.expected_response_at).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* progress steps */}
            <ProgressSteps currentIdx={currentIdx} statusLabel={badge?.label ?? 'Status unavailable'} />

            {citizenResponseNeeded && (
              <CitizenResponse
                canConfirm={t.canConfirm}
                signedIn={t.signedIn}
                citizenAction={t.citizenAction}
                reopenReason={t.reopenReason}
                onReopenReasonChange={t.setReopenReason}
                onRespond={(action) => void t.respondToFix(action)}
                error={t.citizenActionError}
              />
            )}

            {/* timeline */}
            <Timeline items={t.result.timeline} />
          </section>
        )}
        </div>
        </div>
      </main>
    </div>
  )
}
