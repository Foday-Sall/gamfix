import { Button, Card, Heading, Spinner, Text } from '@astryxdesign/core'
import { Outlet } from 'react-router-dom'
import { useAccess } from '@/hooks/SessionProvider'
import { isStaff } from '@/lib/api/session'
import { HardNavigate, signOutHard } from '@/lib/navigation'

/**
 * Gate of the console document. It has no sign-in screen of its own: the
 * session comes from the login page the whole web app shares, and the server's
 * answer decides whether the console may open. Accounts that are not staff are
 * sent back to the web entry with a full page load.
 */
export function StaffGate() {
  const { status, access, retry } = useAccess()

  if (status === 'loading') return <GateCard loading label="Opening your dashboard…" />
  if (status === 'error') {
    return (
      <GateCard
        title="We could not check your account"
        description="GamFix did not answer. Check your internet connection and try again."
        actions={
          <>
            <Button label="Try again" variant="primary" onClick={() => void retry()} />
            <Button label="Back to sign in" variant="ghost" onClick={signOutHard} />
          </>
        }
      />
    )
  }
  if (status === 'forbidden') {
    return (
      <GateCard
        title="This account is not enabled yet"
        description="You are signed in, but this account is not an active staff account. Ask the platform administrator to activate it."
        actions={<Button label="Sign out" variant="secondary" onClick={signOutHard} />}
      />
    )
  }

  if (!isStaff(access)) {
    return <HardNavigate to={status === 'anonymous' ? '/login' : '/home'} fallback={<GateCard loading label="Opening your dashboard…" />} />
  }
  return <Outlet />
}

function GateCard({
  title,
  description,
  actions,
  loading,
  label,
}: {
  title?: string
  description?: string
  actions?: React.ReactNode
  loading?: boolean
  label?: string
}) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card padding={0}>
        <div
          style={{
            maxWidth: 440,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            textAlign: 'center',
          }}
        >
          {loading ? (
            <>
              <Spinner label={label} />
              <Text color="secondary">{label}</Text>
            </>
          ) : (
            <>
              <Heading level={2}>{title}</Heading>
              {description ? (
                <Text size="sm" color="secondary">
                  {description}
                </Text>
              ) : null}
              {actions ? <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</div> : null}
            </>
          )}
        </div>
      </Card>
    </main>
  )
}
