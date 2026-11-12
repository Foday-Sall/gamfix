import { useEffect, useState } from 'react'
import { pbApi, type Session } from '@/lib/pocketbase'

/**
 * Single source of truth for auth state. Subscribes to onAuthStateChange so
 * token refreshes and the OAuth return both update the UI without reloads.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    pbApi.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false))

    const { data: sub } = pbApi.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, loading }
}

/** The signed-in user's display name: profile row first, then metadata. */
export function useDisplayName(session: Session | null) {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const user = session?.user
    if (!user) {
      setName(null)
      return
    }
    const meta = user.user_metadata ?? {}
    // `name` is the field PocketBase copies from the Google profile on
    // OAuth sign-up; full_name (the one reports use) is set in onboarding.
    const pbName = (user as unknown as Record<string, unknown>).name
    const fallback =
      (meta.full_name as string) ||
      (meta.name as string) ||
      (meta.user_name as string) ||
      (typeof pbName === 'string' && pbName.trim()) ||
      user.email ||
      'Your account'
    setName(fallback || 'Your account')

    pbApi
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.full_name) setName(data.full_name)
      })

    return () => {
      cancelled = true
    }
  }, [session])

  return name
}
