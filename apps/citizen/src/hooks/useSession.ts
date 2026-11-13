import { useEffect, useState } from 'react'
import { pb, currentUser, type User } from '@/lib/pocketbase'

/**
 * Single source of truth for auth state, straight off the PocketBase SDK.
 * pb.authStore.onChange fires for sign-in, sign-out and token refreshes so
 * every screen updates without reloads. On mount the token is validated with
 * the native auth refresh call — an expired or invalidated token drops the
 * user back to signed-out instead of showing a ghost session.
 */
export function useSession() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentUser()) {
      pb.collection('users')
        .authRefresh()
        .then((auth) => pb.authStore.save(pb.authStore.token, auth.record))
        .catch(() => pb.authStore.clear())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser((record as User | null) ?? null)
    })
    setUser(currentUser())
    return unsubscribe
  }, [])

  return { session: user, user, loading }
}

/** The signed-in user's display name: profile record first, then OAuth name. */
export function useDisplayName(user: User | null) {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setName(null)
      return
    }
    // `name` is the field PocketBase copies from the Google profile on
    // OAuth sign-up; full_name (the one reports use) is set in onboarding.
    setName(
      user.full_name?.trim() || user.name?.trim() || user.email || 'Your account',
    )
  }, [user])

  return name
}
