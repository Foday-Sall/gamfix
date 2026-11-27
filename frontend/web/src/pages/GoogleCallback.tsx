import { useEffect } from 'react'
import { apiCall } from '@/lib/api/http'

export default function GoogleCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const state = params.get('state') ?? ''
    const code = params.get('code')
    const error = params.get('error') ?? undefined

    history.replaceState({}, '', window.location.pathname)

    void (async () => {
      let token: string | undefined
      if (!error && code) {
        try {
          const res = await apiCall<{ token: string }>('/api/auth/google/exchange', 'POST', { code })
          token = res.token
        } catch {
          token = undefined
        }
      }

      const message = {
        source: 'gamfix-oauth',
        state,
        token,
        newAccount: params.get('new') === '1',
        error: error ?? (token ? undefined : 'Sign-in could not be completed. Please try again.'),
      }
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(message, window.location.origin)
        } catch {
          window.opener.postMessage(message, '*')
        }
      }
      window.close()
    })()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <p className="text-sm text-muted-foreground">Finishing Google sign-in…</p>
    </div>
  )
}
