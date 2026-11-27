import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ApiError } from '@/lib/api/errors'
import { apiCall } from '@/lib/api/http'
import { resolveAccess } from '@/lib/api/session'
import { authStore } from '@/lib/api/store'
import type { Access, User } from '@/lib/api/types'

/**
 * `anonymous`  — no session
 * `loading`    — a session exists but the server has not confirmed it yet
 * `ready`      — access is known (citizen, officer or administrator)
 * `forbidden`  — signed in, but the account is not enabled for either side
 * `error`      — the server could not be reached
 */
export type SessionStatus = 'anonymous' | 'loading' | 'ready' | 'forbidden' | 'error'

type SessionState = { status: SessionStatus; user: User | null; access: Access | null }
type SessionContextValue = SessionState & { retry: () => void }

const ANONYMOUS: SessionState = { status: 'anonymous', user: null, access: null }

const SessionContext = createContext<SessionContextValue>({ ...ANONYMOUS, retry: () => {} })

function fromStore(): SessionState {
  if (!authStore.isValid) return ANONYMOUS
  const access = authStore.access
  if (!access) return { status: 'loading', user: authStore.user, access: null }
  return { status: access.role === 'none' ? 'forbidden' : 'ready', user: authStore.user, access }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(fromStore)
  const [failed, setFailed] = useState(false)

  const validate = useCallback(async () => {
    if (!authStore.isValid) return
    setFailed(false)
    try {
      authStore.update(await apiCall<User>('/api/me', 'GET'))
      await resolveAccess()
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        authStore.clear()
      } else {
        // Network problem: keep the session and let the user retry. A role
        // confirmed earlier stays usable; API calls report failures themselves.
        if (!authStore.access) setFailed(true)
      }
    }
  }, [])

  useEffect(() => {
    // One check at start-up: a token kept in the browser may have expired,
    // and the role may have changed since the last visit. The last confirmed
    // access is used until the server answers.
    void validate()
    return authStore.onChange(() => {
      setFailed(false)
      setState(fromStore())
    })
  }, [validate])

  const status: SessionStatus = failed ? 'error' : state.status

  return (
    <SessionContext.Provider value={{ status, user: state.user, access: state.access, retry: validate }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useAccess(): SessionContextValue {
  return useContext(SessionContext)
}
