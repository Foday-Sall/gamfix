import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  authStore,
  currentUser,
  login,
  register,
  resolveAccess,
  isStaff,
  googleSignIn,
  DASHBOARD_PATH,
  type User,
} from '@/lib/api'
import { friendlyAuthError } from '@/lib/authErrors'
import { firstIssue, signinSchema, signupSchema } from '@/lib/schemas'
import gamfixLogo from '@/assets/gamfix-logo.png'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  MailIcon,
  LockIcon,
  UserIcon,
  EyeIcon,
  EyeOffIcon,
} from 'lucide-react'

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19-.92.92C.92 17.06 0 20.34 0 24c0 3.66.92 6.94 2.56 9.86l7.97-6.27z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  describedBy?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <InputGroup>
        <InputGroupAddon>
          <LockIcon />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          minLength={6}
          aria-describedby={describedBy}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function FieldWithIcon({
  id,
  label,
  type,
  value,
  onChange,
  icon,
  autoComplete,
  placeholder,
  describedBy,
}: {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  icon: React.ReactNode
  autoComplete: string
  placeholder?: string
  describedBy?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <InputGroup>
        <InputGroupAddon>{icon}</InputGroupAddon>
        <InputGroupInput
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          aria-describedby={describedBy}
        />
      </InputGroup>
    </div>
  )
}

export default function Auth({ initialMode }: { initialMode: 'signup' | 'signin' }) {
  const [mode, setMode] = useState<'signup' | 'signin'>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'form' | 'google' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const isSignup = mode === 'signup'

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
    const oauthError = params.get('error_description') || hashParams.get('error_description')
    const oauthCode = params.get('error_code') || hashParams.get('error_code')
    if (oauthError) {
      setError(
        oauthCode === 'bad_oauth_state' || /state|expired/i.test(oauthError)
          ? 'Sign-in timed out before Google confirmed it. Try again.'
          : friendlyAuthError(oauthError),
      )
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname,
      )
    }
  }, [location.key])

  // One login, one flow for citizens, officers and the admin: email -> name ->
  // WhatsApp phone (GOWA), then the server-decided destination.
  async function routeAfterAuth(user: User | null) {
    const access = await resolveAccess()
    if (access?.role === 'none') {
      authStore.clear()
      setError('This account is not enabled for GamFix yet. Contact the platform administrator.')
      return
    }
    if (user?.verified === false) {
      navigate('/verify/email', {
        replace: true,
        state: { email: user?.email ?? '', sendNow: true },
      })
      return
    }
    if (!String(user?.full_name ?? '').trim()) {
      navigate('/onboarding', { replace: true })
      return
    }
    if (user?.phone_verified !== true) {
      navigate('/verify/phone', { replace: true })
      return
    }
    navigate(isStaff(access) ? DASHBOARD_PATH : '/home', { replace: true })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const user = currentUser()
      if (cancelled || !user) return
      await routeAfterAuth(user)
    })().catch(() => {
      if (!cancelled) setError('We could not verify your account. Check your connection and try again.')
    })
    return () => {
      cancelled = true
    }
  }, [])

  function switchMode(next: 'signup' | 'signin') {
    setMode(next)
    setError(null)
    navigate(next === 'signup' ? '/signup' : '/login', { replace: true })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const schema = isSignup ? signupSchema : signinSchema
    const issue = firstIssue(schema, isSignup ? { name, email, password } : { email, password })
    if (issue) {
      setError(issue)
      return
    }

    setBusy('form')
    try {
      if (isSignup) {
        await register(name.trim() || email.trim().split('@')[0], email.trim(), password, password)
        toast.success('Account created', {
          description: `Welcome to GamFix, ${name.trim().split(' ')[0]}.`,
        })
        const user = currentUser()
        if (user && user.verified === false) {
          navigate('/verify/email', {
            replace: true,
            state: { email: email.trim(), justSent: true },
          })
          return
        }
        await routeAfterAuth(user)
      } else {
        let user: User
        try {
          user = await login(email.trim(), password)
        } catch (loginError) {
          const message = loginError instanceof Error ? loginError.message.toLowerCase() : ''
          if (message.includes('verify') || message.includes('not verified')) {
            navigate('/verify/email', {
              replace: true,
              state: { email: email.trim(), sendNow: true },
            })
            return
          }
          throw loginError
        }
        await routeAfterAuth(user)
      }
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(null)
    }
  }

  async function signInWithGoogle() {
    setError(null)
    setBusy('google')
    try {
      const auth = await googleSignIn()
      await routeAfterAuth(auth.user)
      setBusy(null)
    } catch {
      setError(friendlyAuthError(new TypeError('Failed to fetch')))
      setBusy(null)
    }
  }

  const googleBusy = busy === 'google'
  const formBusy = busy === 'form'

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-10">
        <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-center text-center">
            <img src={gamfixLogo} alt="GamFix" className="h-10 w-auto max-w-[180px] object-contain" draggable={false} />
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
              {isSignup ? 'Create your GamFix account' : 'Welcome back'}
            </h1>
            <p className="mt-2 max-w-sm text-muted-foreground">
              {isSignup
                ? 'Create a free account to report public problems and follow them until they are fixed.'
                : 'Sign in to report community problems or manage reports for your institution.'}
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate={false}>
            {isSignup && (
              <FieldWithIcon
                id="fullname"
                label="Full name"
                type="text"
                value={name}
                onChange={setName}
                autoComplete="name"
                placeholder="e.g. Awa Njie"
                icon={<UserIcon />}
              />
            )}

            <FieldWithIcon
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              icon={<MailIcon />}
            />

            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              describedBy="password-hint"
            />
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least 6 characters.
            </p>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <Button type="submit" className="h-11 w-full text-base" disabled={busy !== null}>
              {formBusy ? <Loader2 className="animate-spin" /> : null}
              {isSignup ? 'Sign up' : 'Sign in'}
            </Button>

            {!isSignup && (
              <Button
                type="button"
                variant="link"
                className="mx-auto block h-auto px-0 text-sm font-medium"
                onClick={() => navigate('/forgot-password', { state: { email } })}
              >
                Forgot password?
              </Button>
            )}
          </form>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full text-base"
            onClick={signInWithGoogle}
            disabled={busy !== null}
          >
            {googleBusy ? (
              <Loader2 className="animate-spin" />
            ) : (
              <GoogleLogo />
            )}
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignup ? 'Already have an account? ' : 'New to GamFix? '}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-md px-5 api-6">
        <p className="rounded-lg border border-border/80 bg-card/60 px-4 py-3 text-center text-xs leading-relaxed text-muted-foreground">
          Free to use. Your reports are public data; your account details are not.
        </p>
      </footer>
    </div>
  )
}
