import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function CitizenResponse({
  canConfirm,
  signedIn,
  citizenAction,
  reopenReason,
  onReopenReasonChange,
  onRespond,
  error,
}: {
  canConfirm: boolean
  signedIn: boolean
  citizenAction: 'confirm' | 'reopen' | null
  reopenReason: string
  onReopenReasonChange: (value: string) => void
  onRespond: (action: 'confirm' | 'reopen') => void
  error: string | null
}) {
  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-4" aria-labelledby="citizen-response-heading">
      <h3 id="citizen-response-heading" className="text-sm font-semibold">Your response is needed</h3>
      {canConfirm ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">The service says the fix is complete. Confirm it to close this report, or reopen it if the problem remains.</p>
          <Button
            type="button"
            className="mt-4"
            onClick={() => onRespond('confirm')}
            disabled={citizenAction !== null}
          >
            {citizenAction === 'confirm' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
            Confirm fix and close report
          </Button>
          <div className="mt-4 space-y-2">
            <Label htmlFor="reopen-reason">If it is not fixed, explain what still needs attention</Label>
            <textarea
              id="reopen-reason"
              value={reopenReason}
              onChange={(event) => onReopenReasonChange(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Describe what remains unresolved"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => onRespond('reopen')}
              disabled={citizenAction !== null || reopenReason.trim().length < 5}
            >
              {citizenAction === 'reopen' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CircleAlert className="mr-2 h-4 w-4" aria-hidden="true" />}
              Reopen report
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          {signedIn ? 'Only the citizen who filed this report can confirm the fix or reopen it.' : 'Sign in with the citizen account that filed this report to confirm the fix or reopen it.'}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
    </section>
  )
}
