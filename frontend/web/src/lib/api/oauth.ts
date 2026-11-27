import { ApiError } from './errors'
import { apiCall, baseURL } from './http'
import { authStore } from './store'
import type { AuthResponse, User } from './types'

const POPUP_WIDTH = 460
const POPUP_HEIGHT = 640

const OAUTH_MESSAGE_SOURCE = 'gamfix-oauth'

export type OAuthPopupMessage =
  | { source: typeof OAUTH_MESSAGE_SOURCE; state: string; token?: string; newAccount?: boolean; error?: string }

export function isOAuthMessage(data: unknown): data is OAuthPopupMessage {
  return (
    typeof data === 'object' && data !== null
    && (data as { source?: unknown }).source === OAUTH_MESSAGE_SOURCE
    && typeof (data as { state?: unknown }).state === 'string'
  )
}

export async function signInWithGoogle(): Promise<AuthResponse> {
  const state = crypto.randomUUID()
  // Tell the API where to send the token back: the address THIS app is opened
  // at, including its base path (/app on Vercel), so the callback redirect
  // lands on this page even when the API lives on another host. The API only
  // accepts it when the origin is on its allow list.
  const appBase = import.meta.env.BASE_URL.replace(/\/$/, '')
  const from = encodeURIComponent(window.location.origin + appBase)

  const popup = window.open(
    `${baseURL}api/auth/google/redirect?state=${encodeURIComponent(state)}&from=${from}`,
    'oauth2_signin',
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT}`,
  )
  if (!popup) {
    throw new ApiError(400, { message: 'The browser blocked the sign-in popup. Please allow popups and try again.' })
  }

  return new Promise<AuthResponse>((resolve, reject) => {
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearInterval(closedPoll)
      window.removeEventListener('message', onMessage)
      popup?.close()
      fn()
    }

    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || !isOAuthMessage(ev.data) || ev.data.state !== state) return
      if (ev.data.error) {
        finish(() => reject(new ApiError(400, { message: ev.data.error })))
        return
      }
      if (!ev.data.token) {
        finish(() => reject(new ApiError(400, { message: 'Google sign-in returned no session.' })))
        return
      }
      finish(() => {
        const token = ev.data.token!
        authStore.save(token, null)
        void apiCall<User>('/api/me', 'GET')
          .then((user) => {
            authStore.update(user)
            resolve({ token, user })
          })
          .catch(() => resolve({ token, user: null }))
      })
    }
    window.addEventListener('message', onMessage)

    const closedPoll = window.setInterval(() => {
      if (popup.closed) {
        finish(() => reject(new ApiError(400, { message: 'Sign-in window was closed before finishing.' })))
      }
    }, 600)
  })
}
