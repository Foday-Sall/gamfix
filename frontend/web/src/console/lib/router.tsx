import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DASHBOARD_PATH } from '@/lib/api/session'

/**
 * The console pages talk to a tiny `{ path, navigate }` router where `path`
 * is relative to the console (`/complaints`). It is backed by the web app's
 * own router, so the console lives at /dashboard/* inside the same app.
 */
type RouterState = { path: string; navigate: (to: string) => void; href: (to: string) => string }

const RouterCtx = createContext<RouterState>({ path: '/', navigate: () => {}, href: () => '#' })

function consolePath(pathname: string): string {
  if (pathname === DASHBOARD_PATH || pathname === DASHBOARD_PATH + '/') return '/'
  if (!pathname.startsWith(DASHBOARD_PATH + '/')) return '/'
  const rest = pathname.slice(DASHBOARD_PATH.length).replace(/\/+$/, '')
  return rest.startsWith('/') ? rest : '/' + rest
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const value = useMemo<RouterState>(
    () => ({
      path: consolePath(pathname),
      navigate: (to: string) => {
        navigate(DASHBOARD_PATH + to)
        window.scrollTo(0, 0)
      },
      href: (to: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + DASHBOARD_PATH + to,
    }),
    [pathname, navigate],
  )

  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>
}

export const useRouter = () => useContext(RouterCtx)
