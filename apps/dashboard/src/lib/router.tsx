// Tiny history-based router (no react-router dependency).
// The dashboard is served under a configurable base (e.g. /dash/ on the VPS);
// BASE_URL is injected by Vite so paths stay correct everywhere.

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

function currentPath(): string {
  let p = window.location.pathname.replace(/\/+$/, '')
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length)
  return p.startsWith('/') ? p : '/' + p
}

type RouterState = { path: string; navigate: (to: string) => void }

const RouterCtx = createContext<RouterState>({ path: '/', navigate: () => {} })

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onPop = () => setPath(currentPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const navigate = (to: string) => {
    window.history.pushState({}, '', (BASE || '') + to)
    setPath(to)
    window.scrollTo(0, 0)
  }
  return <RouterCtx.Provider value={{ path, navigate }}>{children}</RouterCtx.Provider>
}

export const useRouter = () => useContext(RouterCtx)
