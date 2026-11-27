import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { SessionScreen } from '@/components/SessionScreen'
import { useAccess } from '@/hooks/SessionProvider'
import { DASHBOARD_PATH, isStaff } from '@/lib/api/session'
import { HardNavigate, signOutHard } from '@/lib/navigation'

/**
 * Role gates. One login serves the whole app; the server-confirmed access
 * decides which screens exist:
 *
 *   citizen              -> citizen screens only
 *   officer, admin       -> staff console only
 */
export function CitizenOnly() {
  const { status, access, retry } = useAccess()

  if (status === 'loading') return <SessionScreen mode="loading" onSignOut={signOutHard} />
  if (status === 'error') return <SessionScreen mode="error" retry={retry} onSignOut={signOutHard} />
  if (status === 'forbidden') return <SessionScreen mode="forbidden" onSignOut={signOutHard} />

  // Signed-in staff never see the citizen screens. Guests are let through:
  // tracking a report needs no account and the pages handle sign-in themselves.
  if (isStaff(access)) return <HardNavigate to={DASHBOARD_PATH} fallback={<SessionScreen mode="loading" label="Opening your dashboard…" />} />
  return <Outlet />
}

/**
 * The web entry is never the place the console renders. When this document is
 * opened at /dashboard/..., a staff account is handed over to the console
 * document (full page load); everyone else goes back to their own screens.
 */
export function StaffEntry() {
  const { status, access, retry } = useAccess()
  const location = useLocation()

  if (status === 'loading') return <SessionScreen mode="loading" onSignOut={signOutHard} />
  if (status === 'error') return <SessionScreen mode="error" retry={retry} onSignOut={signOutHard} />
  if (status === 'forbidden') return <SessionScreen mode="forbidden" onSignOut={signOutHard} />

  if (!isStaff(access)) return <Navigate to={status === 'anonymous' ? '/login' : '/home'} replace />
  return (
    <HardNavigate
      to={location.pathname}
      fallback={<SessionScreen mode="loading" label="Opening your dashboard…" />}
    />
  )
}
