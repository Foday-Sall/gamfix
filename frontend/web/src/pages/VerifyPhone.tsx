import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiCall, authStore, currentUser, getProfile, isStaff, resolveAccess, DASHBOARD_PATH } from '@/lib/api'
import { firstIssue, phoneNumberSchema, PHONE_NUMBER_HINT } from '@/lib/schemas'

const OTP_LENGTH = 6

// Staff (officers and the admin) land in the console once their phone is verified.
async function landing(): Promise<string> {
  const access = await resolveAccess().catch(() => null)
  return isStaff(access) ? DASHBOARD_PATH : '/home'
}

const DEFAULT_COUNTRY_CODE = '220'

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '')
  if (digits.length === 7) digits = DEFAULT_COUNTRY_CODE + digits
  return digits
}

const RATE_LIMIT_HINT = 'Too many codes requested. Please wait before trying again.'
const NETWORK_HINT = 'Connection problem. Check your internet and try again.'
const TIMEOUT_HINT = 'This is taking longer than expected. Check your connection and try again.'
const SERVER_HINT = 'Phone verification is temporarily unavailable. Please try again shortly.'

function classifySendError(status: number, message: string | undefined): string {
  const m = (message ?? '').toLowerCase()
  if (status === 429 || m.includes('too many') || m.includes('rate limit')) {
    return RATE_LIMIT_HINT
  }
  if (
    m.includes('invalid') ||
    m.includes('not a valid') ||
    m.includes('lid found') ||
    m.includes('no lid') ||
    m.includes('route') ||
    m.includes('not on whatsapp')
  ) {
    return PHONE_NUMBER_HINT
  }
  if (status === 409 || m.includes('already verified') || m.includes('already in use')) {
    return 'This number is already in use by another account. Sign in with that account or use a different number.'
  }
  if (status === 401) return 'Your session has expired. Sign in again and retry phone verification.'
  if (status >= 500) return SERVER_HINT
  return message && message.trim().length > 0 ? message : 'Could not send the code. Try again.'
}

export default function VerifyPhone() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [token, setToken] = useState('')
  const [stage, setStage] = useState<'phone' | 'code'>('phone')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const [checkingAccount, setCheckingAccount] = useState(true)

  useEffect(() => {
    document.title = 'Verify phone · GamFix'
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const user = currentUser()
      if (!user) {
        navigate('/login', { replace: true })
        return
      }
      const profile = await getProfile(user.id)
      if (cancelled) return
      if (!profile) {
        setError('We could not check your account. Check your connection and try again.')
      } else if (!profile.email_verified) {
        navigate('/verify/email', { replace: true })
      } else if (profile.phone_verified) {
        navigate(await landing(), { replace: true })
      }
      setCheckingAccount(false)
    })().catch(() => {
      if (!cancelled) {
        setError(NETWORK_HINT)
        setCheckingAccount(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    setToken("")
    const normalized = normalizePhone(phone)
    const phoneIssue = firstIssue(phoneNumberSchema, normalized)
    if (phoneIssue) {
      setError(phoneIssue)
      return
    }
    if (!navigator.onLine) {
      setError('You appear to be offline. Reconnect to the internet and try again.')
      return
    }
    setBusy(true)
    try {
      await apiCall('/api/gamfix/phone-otp/send', 'POST', { phone: normalized })
      setStage('code')
      setResendIn(60)
    } catch (err) {
      const ce = err as { name?: string; status?: number; response?: { error?: string; message?: string } }
      if (!ce.status || ce.status === 0) {
        setError(err instanceof Error && err.name === 'TimeoutError' ? TIMEOUT_HINT : NETWORK_HINT)
      } else {
        setError(classifySendError(ce.status, ce.response?.error ?? ce.response?.message ?? undefined))
      }
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (token.trim().length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code sent to your WhatsApp.`)
      return
    }
    if (!navigator.onLine) {
      setError('You appear to be offline. Reconnect to the internet and try again.')
      return
    }
    setBusy(true)
    try {
      await apiCall('/api/gamfix/phone-otp/verify', 'POST', {
        phone: normalizePhone(phone),
        code: token.trim(),
      })
      navigate(await landing(), { replace: true })
    } catch (err) {
      const ce = err as { name?: string; status?: number; response?: { error?: string; message?: string } }
      if (!ce.status || ce.status === 0) {
        setError(err instanceof Error && err.name === 'TimeoutError' ? TIMEOUT_HINT : NETWORK_HINT)
        return
      }
      const m = (ce.response?.error ?? ce.response?.message ?? '').toLowerCase()
      if (ce.status === 429 || m.includes('too many')) setError(RATE_LIMIT_HINT)
      else if (m.includes('no active code')) setError('No active code. Request a new one.')
      else if (m.includes('expired')) setError('That code expired. Request a new one.')
      else if (m.includes('not correct') || m.includes('did not match')) {
        setError('That code is not correct. Check and try again.')
      } else if (ce.status === 401) {
        setError('Your session has expired. Sign in again and retry phone verification.')
      } else if (ce.status >= 500) {
        setError(SERVER_HINT)
      } else {
        setError('We could not verify that code. Check it and try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="items-center text-center">
          <Smartphone className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
          <CardTitle className="font-display text-xl font-bold">Verify your phone</CardTitle>
          <CardDescription>
            {stage === 'phone'
              ? 'We will send a one-time code to this number on WhatsApp to confirm it is yours.'
              : `Enter the latest ${OTP_LENGTH}-digit code sent to your WhatsApp. Requesting a new code invalidates the previous one.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stage === 'phone' ? (
            <form onSubmit={sendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verify-phone">Phone number</Label>
                <Input
                  id="verify-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+220 7 000 000"
                  required
                />
              </div>
              {error ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy || checkingAccount} className="w-full">
                {busy ? 'Sending…' : 'Send code on WhatsApp'}
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verify-sms-code">6-digit WhatsApp code</Label>
                <Input
                  id="verify-sms-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                  placeholder="······"
                  className="text-center font-mono text-lg tracking-[0.5em]"
                  required
                />
              </div>
              {error ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy || checkingAccount} className="w-full">
                {busy ? 'Verifying…' : 'Verify phone'}
              </Button>
              <button
                type="button"
                onClick={() => sendCode()}
                disabled={busy || resendIn > 0}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {resendIn > 0 ? `Resend code available in ${resendIn}s` : 'Resend code'}
              </button>
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground underline underline-offset-2"
                onClick={() => {
                  setStage('phone')
                  setToken('')
                  setError(null)
                }}
              >
                Use a different number
              </button>
            </form>
          )}
          <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
            Need a different account?{' '}
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
