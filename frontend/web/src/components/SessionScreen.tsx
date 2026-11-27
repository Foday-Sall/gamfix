import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  mode: 'loading' | 'error' | 'forbidden'
  label?: string
  retry?: () => void
  onSignOut?: () => void
}

/**
 * Full-page card shown while the account is being checked, when the check
 * failed, or when the account has no access to either side of the app.
 */
export function SessionScreen({ mode, label, retry, onSignOut }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        {mode === 'loading' && (
          <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {label ?? 'Checking your account and verification status…'}
          </p>
        )}

        {mode === 'error' && (
          <>
            <h1 className="font-display text-xl font-bold">We could not check your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              GamFix did not answer. Check your internet connection and try again.
            </p>
            {retry && (
              <Button className="mt-5 w-full" onClick={retry}>
                Try again
              </Button>
            )}
            {onSignOut && (
              /* Escape hatch: never trap someone on an error screen. */
              <button
                type="button"
                onClick={onSignOut}
                className="mt-3 w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Back to sign in
              </button>
            )}
          </>
        )}

        {mode === 'forbidden' && (
          <>
            <h1 className="font-display text-xl font-bold">This account is not enabled yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You are signed in, but this account is neither a citizen account nor an active staff account. Ask the
              platform administrator to activate it.
            </p>
            {onSignOut && (
              <Button className="mt-5 w-full" variant="outline" onClick={onSignOut}>
                Sign out
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  )
}
