import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MailCheck, CheckCircle2, CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  authStore,
  currentUser,
  getProfile,
  refreshSession,
  requestVerification,
  type User,
} from '@/lib/api'
import { friendlyAuthError } from '@/lib/authErrors'

const RESEND_COOLDOWN = 120

type HandoffState = { email?: string; sendNow?: boolean; justSent?: boolean } | null
type Panel = 'inbox' | 'verifying' | 'verified' | 'link-error'

export default function VerifyEmail() {
  const navigate = useNavigate()
  const location = useLocation()
  const handoff = (location.state ?? null) as HandoffState
  const verifiedInUrl = new URLSearchParams(window.location.search).get('verified') === '1'

  const [email, setEmail] = useState(handoff?.email ?? '')
  const [panel, setPanel] = useState<Panel>(verifiedInUrl ? 'verified' : 'inbox')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(handoff?.justSent ? RESEND_COOLDOWN : 0)
  const autoSendRef = useRef(false)

  useEffect(() => {
    document.title = 'Verify email · GamFix'
  }, [])

  useEffect(() => {
    if (email || handoff?.email) return
    const user = currentUser()
    if (user?.email) setEmail(user.email)
  }, [email, handoff])

  async function continueAfterVerification(user: User | null) {
    let fresh: Awaited<ReturnType<typeof getProfile>> = null
    if (user) {
      await refreshSession()
      fresh = await getProfile(user.id)
    }
    if (!fresh) {
      navigate('/login', { replace: true })
      return
    }
    if (!String(fresh.full_name ?? '').trim()) {
      navigate('/onboarding', { replace: true })
    } else if (fresh.phone_verified !== true) {
      navigate('/verify/phone', { replace: true })
    } else {
      navigate('/home', { replace: true })
    }
  }

  useEffect(() => {
    if (!verifiedInUrl) return
    void (async () => {
      setPanel('verified')
      await continueAfterVerification(currentUser())
    })()
  }, [verifiedInUrl])

  useEffect(() => {
    if (!handoff?.sendNow || autoSendRef.current) return
    autoSendRef.current = true
    void (async () => {
      try {
        await requestVerification(email)
        setResendIn(RESEND_COOLDOWN)
      } catch (err) {
        setError(friendlyAuthError(err))
      }
    })()
  }, [handoff])

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function resendEmail() {
    setError(null)
    setBusy(true)
    try {
      await requestVerification(email.trim())
      setResendIn(RESEND_COOLDOWN)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  if (panel === 'verifying') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-sm">
          <CardContent className="pt-6 text-center text-muted-foreground">
            Confirming your email…
          </CardContent>
        </Card>
      </div>
    )
  }

  if (panel === 'verified') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-sm">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
            <CardTitle className="mt-3 font-display text-xl font-bold">Email verified</CardTitle>
            <CardDescription className="mt-2">
              Thanks — your email is confirmed. Taking you to your account…
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (panel === 'link-error') {
    const user = currentUser()
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-sm">
          <CardHeader className="items-center text-center">
            <CircleAlert className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
            <CardTitle className="font-display text-xl font-bold">Link no longer valid</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {user?.email ? (
              <Button
                onClick={async () => {
                  setBusy(true)
                  try {
                    await requestVerification(user.email)
                    setPanel('inbox')
                    setResendIn(RESEND_COOLDOWN)
                  } catch (err) {
                    setError(friendlyAuthError(err))
                  } finally {
                    setBusy(false)
                  }
                }}
                disabled={busy}
                className="w-full"
              >
                Send a new verification link
              </Button>
            ) : null}
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="items-center text-center">
          <MailCheck className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
          <CardTitle className="font-display text-xl font-bold">Verify your email</CardTitle>
          <CardDescription>
            We sent a verification link to {email || 'your email'}. Open your inbox and click
            “Verify” to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!currentUser() && (
            <div className="space-y-2">
              <Label htmlFor="verify-email">Email</Label>
              <Input
                id="verify-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
          )}
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
          <Button
            type="button"
            onClick={resendEmail}
            disabled={busy || resendIn > 0 || !email.trim()}
            className="mt-4 w-full"
          >
            {resendIn > 0 ? `Resend email available in ${resendIn}s` : 'Resend verification email'}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            No email? Check your spam folder. Gmail can also lag a minute or two.
          </p>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Wrong address?{' '}
            <Link to="/signup" className="text-primary underline underline-offset-2">
              Sign up again
            </Link>
          </p>
          {/* Always leave a way out: no one should be trapped on this screen. */}
          <div className="mt-4 border-t border-border pt-4 text-center text-sm text-muted-foreground">
            Already verified or prefer another account?{' '}
            <button
              type="button"
              onClick={async () => {
                authStore.clear()
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
