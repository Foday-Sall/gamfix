import { useEffect, useMemo } from 'react'
import { useAccess } from '@/hooks/SessionProvider'
import type { Session } from './lib/api'
import { useRouter } from './lib/router'
import { startRealtime, stopRealtime } from './lib/realtime'
import { Layout } from './components/Layout'
import { Loading, PageHead } from './components/ui'
import { Overview } from './pages/Overview'
import { Complaints } from './pages/Complaints'
import { MapPage } from './pages/MapPage'
import { InstitutionsPage } from './pages/InstitutionsPage'
import { AccountsPage } from './pages/AccountsPage'
import { AccessControlPage } from './pages/AccessControlPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { WhatsAppPage } from './pages/WhatsAppPage'
import { SettingsPage } from './pages/SettingsPage'

/**
 * Staff console of the GamFix web app: the screens institution officers and
 * the platform administrator work in. It is reached from the same login as
 * the citizen screens and only opens for accounts the server confirmed as
 * staff (see StaffGate). The console's stylesheets are loaded by its own
 * entry (console/main.tsx), not here.
 */
export default function Console() {
  const { user, access } = useAccess()
  const { path, navigate } = useRouter()

  const session = useMemo<Session>(() => {
    if (access?.role === 'admin') return { role: 'admin' }
    if (access?.role === 'officer') return { role: 'officer', institution: access.institution }
    return null
  }, [access])

  useEffect(() => {
    startRealtime(session)
    return stopRealtime
  }, [session])

  if (!session) return <Loading label="Opening your dashboard…" />

  const userName = user?.full_name || user?.email
    || (session.role === 'officer' ? session.institution?.name ?? 'Officer' : 'Administrator')
  const isAdmin = session.role === 'admin'

  const page = (() => {
    switch (path) {
      case '/':
        return <Overview session={session} />
      case '/complaints':
        return <Complaints canForward={isAdmin} />
      case '/map':
        return <MapPage session={session} />
      case '/institutions':
        return isAdmin ? <InstitutionsPage /> : <Denied />
      case '/accounts':
        return isAdmin ? <AccountsPage /> : <Denied />
      case '/access':
        return isAdmin ? <AccessControlPage /> : <Denied />
      case '/audit-log':
        return isAdmin ? <AuditLogPage /> : <Denied />
      case '/whatsapp':
        return <WhatsAppPage session={session} />
      case '/settings':
        return isAdmin ? <SettingsPage /> : <Denied />
      default:
        return <NotFound />
    }
  })()

  return (
    <Layout session={session} userName={userName}>
      {page}
    </Layout>
  )

  function Denied() {
    return <PageHead title="Not available" subtitle="This section is for the platform administrator." />
  }

  function NotFound() {
    return (
      <div className="page">
        <PageHead title="Page not found" actions={undefined} />
        <button type="button" className="link-button" onClick={() => navigate('/')}>
          Back to overview
        </button>
      </div>
    )
  }
}
