// Sign-in screen. Authenticates against PocketBase, then asks the backend
// (/api/gamfix/access) for the caller's dashboard role.

import { useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Button, Card, Heading, Text, TextInput } from '@astryxdesign/core'
import { LogIn } from 'lucide-react'
import { login, type Session } from '../lib/pb'

const styles = stylex.create({
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'var(--color-background-wash, #f4f5ef)',
  },
  card: { width: '100%', maxWidth: 400, padding: 32, display: 'flex', flexDirection: 'column', gap: 16 },
  brand: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 4 },
  logo: { width: 44, height: 44, borderRadius: 10 },
  error: {
    color: 'var(--color-text-danger, #b91c1c)',
    fontSize: 13,
    lineHeight: 1.45,
  },
})

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const session = await login(email, password)
      onLogin(session)
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status
      if (status === 400 || status === 404) {
        setError('Incorrect email or password.')
      } else {
        setError(err?.message || 'Sign-in failed. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <Card padding={0}>
        <div {...stylex.props(styles.card)}>
          <div {...stylex.props(styles.brand)}>
            <img {...stylex.props(styles.logo)} src={import.meta.env.BASE_URL + 'gamfix-icon.png'} alt="GamFix SL" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <Heading level={3} weight="semibold">
              GamFix staff console
            </Heading>
            <Text size="sm" color="secondary">
              Sign in with your staff account to manage reports.
            </Text>
          </div>
          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="name@institution.gov.sl"
            isRequired
            autoComplete="username"
          />
          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Your password"
            isRequired
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
          {error ? <div {...stylex.props(styles.error)}>{error}</div> : null}
          <Button
            label="Sign in"
            variant="primary"
            icon={<LogIn size={16} />}
            isLoading={busy}
            isDisabled={!email.trim() || !password}
            onClick={() => void submit()}
          />
        </div>
      </Card>
    </div>
  )
}
