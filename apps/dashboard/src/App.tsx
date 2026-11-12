// App root: session restore, login gate, and route switching.

import { useEffect, useState } from 'react'
import { pb, restoreSession, type Session } from './lib/pb'
import { RouterProvider, useRouter } from './lib/router'
import { Layout } from './components/Layout'
import { Loading, PageHead } from './components/ui'
import { Login } from './pages/Login'
import { Overview } from './pages/Overview'
import { Trends } from './pages/Trends'
import { Complaints } from './pages/Complaints'
import { MapPage } from './pages/MapPage'
import { InstitutionsPage } from './pages/InstitutionsPage'
import { AccountsPage } from './pages/AccountsPage'
import { AccessControlPage } from './pages/AccessControlPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { WhatsAppPage } from './pages/WhatsAppPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  )
}

function Shell() {
  const [session, setSession] = useState<Session>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    restoreSession().then((s) => {
      setSession(s)
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loading label="Starting GamFix console…" />
      </div>
    )
  }

  if (!session) {
    return <Login onLogin={setSession} />
  }

  return <Console session={session} />
}

function Console({ session }: { session: Session }) {
  const { path, navigate } = useRouter()
  const auth = pb.authStore.record as { full_name?: string; email?: string } | null
  const userName = auth?.full_name || auth?.email || (session.role === 'officer' ? session.institution.name : 'Administrator')
  const isAdmin = session.role === 'admin'

  const page = (() => {
    switch (path) {
      case '/':
        return <Overview session={session} />
      case '/complaints':
        return <Complaints canForward={isAdmin} />
      case '/map':
        return <MapPage session={session} />
      case '/trends':
        return session.role === 'officer' ? <Trends /> : <Denied />
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
    return (
      <div className="page">
        <PageHead title="Not available" subtitle="This section is for the platform administrator." />
      </div>
    )
  }

  function NotFound() {
    return (
      <div className="page">
        <PageHead
          title="Page not found"
          actions={undefined}
        />
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--astryx-color-accent, #2e7d4f)', cursor: 'pointer', fontSize: 14 }}
        >
          Back to overview
        </button>
      </div>
    )
  }
}
