import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, Loader2, Mail } from 'lucide-react'
import gamfixLogo from '@/assets/gamfix-logo.png'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { friendlyAuthError } from '@/lib/authErrors'
import { pb } from '@/lib/pocketbase'

type RouteState = { email?: string } | null

/**
 * Forgot password — PocketBase's native password reset. The SDK's
 * requestPasswordReset emails the server's default reset message, whose link
 * lands on /reset-password?token=… (that page sets the new password). No
 * custom code emails or hooks involved.
 */
export default function ForgotPassword() {
  const location = useLocation()
  const routeEmail = (location.state as RouteState)?.email ?? ''
  const [email, setEmail] = useState(routeEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    document.title = 'Forgot password · GamFix'
  }, [])

  // PocketBase enforces a 2-minute cooldown between reset emails.
  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function sendReset(address: string) {
    await pb.collection('users').requestPasswordReset(address)
    setSentTo(address)
    setResendIn(120)
    try {
      sessionStorage.setItem('gamciv:password-recovery-email', address)
    } catch {
      // Route state still carries the address if browser storage is unavailable.
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const address = email.trim().toLowerCase()
    if (!address) {
      setError('Enter the email address for your GamFix account.')
      return
    }
    setBusy(true)
    try {
      await sendReset(address)
    } catch (requestFailure) {
      setError(friendlyAuthError(requestFailure))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md shadow-sm">
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
            <h1 className="font-display text-2xl font-bold tracking-tight">Check your email</h1>
            <CardDescription className="max-w-sm">
              We sent a password reset link to {sentTo}. Open it on this device to choose a new
              password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              variant="outline"
              disabled={resendIn > 0 || busy}
              className="w-full"
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await sendReset(sentTo)
                } catch (resendFailure) {
                  setError(friendlyAuthError(resendFailure))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {resendIn > 0 ? `Resend email available in ${resendIn}s` : 'Resend reset email'}
            </Button>
            {error ? <p role="alert" className="text-center text-sm text-destructive">{error}</p> : null}
            <div className="text-center">
              <Button asChild variant="link" className="h-auto px-0">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="items-center text-center">
          <img src={gamfixLogo} alt="GamFix" className="h-10 w-auto max-w-[180px] object-contain" draggable={false} />
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Forgot your password?
          </h1>
          <CardDescription className="max-w-sm">
            Enter the email address for your account. We’ll send a reset link if an account exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={busy} className="h-11 w-full text-base">
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Sending reset link…' : 'Send reset link'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Button asChild variant="link" className="h-auto px-0">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
