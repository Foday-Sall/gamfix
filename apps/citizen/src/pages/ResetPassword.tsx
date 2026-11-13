import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import gamfixLogo from '@/assets/gamfix-logo.png'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { friendlyAuthError } from '@/lib/authErrors'
import { pb } from '@/lib/pocketbase'

/**
 * Reset password — the landing page of PocketBase's default reset email.
 * The email's link arrives here as /reset-password?token=…; confirming with
 * the SDK's confirmPasswordReset sets the new password (and invalidates all
 * previously issued auth tokens for the record). No custom code emails.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const token = new URLSearchParams(window.location.search).get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    document.title = 'Reset password · GamFix'
  }, [])

  useEffect(() => {
    if (!token) navigate('/forgot-password', { replace: true })
  }, [token, navigate])

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Your new password needs at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Those passwords do not match. Check them and try again.')
      return
    }

    setBusy(true)
    try {
      await pb.collection('users').confirmPasswordReset(token, password, confirmPassword)
      // The old session (if any) is invalid now; the authStore may still hold
      // a stale token — clear it so the next sign-in starts clean.
      pb.authStore.clear()
      setDone(true)
      toast.success('Password updated', {
        description: 'You can now sign in with your new password.',
      })
    } catch (updateFailure) {
      setError(friendlyAuthError(updateFailure))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md shadow-sm">
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
            <h1 className="font-display text-2xl font-bold tracking-tight">Password updated</h1>
            <CardDescription className="max-w-sm">
              Your password has been changed. Sign in with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild className="w-full">
              <Link to="/login">Go to sign in</Link>
            </Button>
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Choose a new password</h1>
          <CardDescription className="max-w-sm">
            Your reset link is confirmed. Pick a new password for your GamFix account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={updatePassword} className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-primary">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Your new password must be at least 6 characters.</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={busy || !token} className="h-11 w-full text-base">
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Updating password…' : 'Update password'}
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
