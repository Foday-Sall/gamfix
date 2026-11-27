import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { authStore } from './api/store'

/** App-relative path -> real URL (the web app may be served under a base path). */
export function appUrl(to: string): string {
  return import.meta.env.BASE_URL + to.replace(/^\//, '')
}

/**
 * The staff console is a separate document of the same web app: it carries its
 * own design-system stylesheets, which must not be mixed with the citizen
 * screens' stylesheet. So moving between the citizen side and the console is
 * always a full page load, never an in-page route change.
 *
 * `to` is app-relative (`/dashboard`, `/home`, `/login`); the query string and
 * hash of the current URL are kept.
 */
export function HardNavigate({ to, fallback = null }: { to: string; fallback?: ReactNode }) {
  const location = useLocation()
  useEffect(() => {
    window.location.replace(appUrl(to) + location.search + location.hash)
  }, [])
  return fallback
}

/** Forget the session and show the shared sign-in page. */
export function signOutHard(): void {
  authStore.clear()
  window.location.assign(appUrl('/login'))
}
