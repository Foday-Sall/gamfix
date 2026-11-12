/**
 * Onboarding — the one-time "confirm your name" step for accounts created
 * through Google (and any citizen whose full name is still missing).
 *
 * Google sign-up used to drop the user straight into the app with nothing
 * but an email address ("Good evening, sarjosall3000@gmail.com"). Now the
 * post-auth funnel is: verify email → **confirm name (this screen)** →
 * verify phone (WhatsApp OTP) → home.
 *
 * The input is prefilled from whatever the Google profile provided (PocketBase
 * maps it into the `name` field), so most people only tap Continue — but the
 * app never guesses silently, and reports always carry a real reporter name.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserRoundCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pbApi, routeByRole, type User } from '@/lib/pocketbase'
import { friendlyAuthError } from '@/lib/authErrors'

export default function Onboarding() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [prefilled, setPrefilled] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Set your name · GamFix'
  }, [])

  // Gate: needs a session; staff belong on the dashboard; citizens who
  // already have a name move on to phone verification (or home).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await pbApi.auth.getSession()
      const user = data.session?.user as User | undefined
      if (!data.session || !user) {
        navigate('/login', { replace: true })
        return
      }
      const role = await routeByRole() // staff are redirected to /dash inside
      if (cancelled) return
      if (role !== 'citizen' && role !== null) return // navigation happened
      // Prefill: the `name` field PocketBase copies from the Google profile,
      // then anything the shim stored in user_metadata.
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const googleName =
        String((user as unknown as Record<string, unknown>).name ?? '').trim() ||
        String(meta.full_name ?? '').trim() ||
        String(meta.name ?? '').trim()
      if (String(user.full_name ?? '').trim()) {
        // Nothing to confirm here — continue the funnel.
        navigate(user.phone_verified ? '/home' : '/verify/phone', { replace: true })
        return
      }
      if (googleName) {
        setName(googleName)
        setPrefilled(true)
      }
      setChecking(false)
    })().catch(() => {
      if (!cancelled) setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) {
      setError('Enter your full name so officials know who is reporting.')
      return
    }
    setBusy(true)
    const { error: err } = await pbApi.auth.updateUser({
      data: { full_name: name.trim() },
    })
    if (err) {
      setBusy(false)
      setError(friendlyAuthError(err))
      return
    }
    // Name saved. Next step in the funnel: WhatsApp phone verification.
    navigate('/verify/phone', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="items-center text-center">
          <UserRoundCheck className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
          <CardTitle className="font-display text-xl font-bold">
            {prefilled ? 'Confirm your name' : 'What is your name?'}
          </CardTitle>
          <CardDescription>
            Your Google account signed in, but GamFix reports carry your name so
            institutions know who is reporting. Next, we verify your phone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="onboarding-name">Full name</Label>
              <Input
                id="onboarding-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Awa Njie"
                autoFocus
                required
              />
            </div>
            {error ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy || checking} className="w-full">
              {busy ? 'Saving…' : 'Continue to phone verification'}
            </Button>
          </form>
          {/* Always leave a way out: no one should be trapped on this screen. */}
          <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
            Not your account?{' '}
            <button
              type="button"
              onClick={async () => {
                await pbApi.auth.signOut()
                navigate('/login', { replace: true })
              }}
              className="font-medium text-primary underline underline-offset-2"
            >
              Back to sign in
            </button>
            {' · '}
            <a href="/" className="font-medium text-primary underline underline-offset-2">
              GamFix homepage
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
