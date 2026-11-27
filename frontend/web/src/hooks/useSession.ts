import { useEffect, useState } from 'react'
import { useAccess } from '@/hooks/SessionProvider'
import type { User } from '@/lib/api'

export function useSession() {
  const { user, status } = useAccess()

  return { session: user, user, loading: status === 'loading' }
}

export function useDisplayName(user: User | null) {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setName(null)
      return
    }
    setName(user.full_name?.trim() || user.name?.trim() || user.email || 'Your account')
  }, [user])

  return name
}
