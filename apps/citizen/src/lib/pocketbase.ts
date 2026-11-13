import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'

/**
 * The real PocketBase JS SDK, straight up — no Supabase-shaped wrapper.
 *
 * Everything in the app calls the SDK directly:
 *   pb.collection('users').authWithPassword(...)     — sign in
 *   pb.collection('users').create(...)               — sign up
 *   pb.collection('users').authWithOAuth2(...)       — Google sign-in
 *   pb.collection('users').requestVerification(...)  — PocketBase's default
 *     verification email (link-based, native flow, no custom hooks)
 *   pb.collection('users').confirmVerification(...)  — the email's link lands
 *     on /verify/email?token=… which calls this
 *   pb.collection('users').requestPasswordReset / confirmPasswordReset
 *   pb.collection('...').getList / getFullList / getOne / create / update
 *   pb.collection('complaints').subscribe(...)       — realtime
 *   pb.send('/api/gamfix/...')                       — the app's own server
 *     routes (report intake, tracking, staff actions) in gamfix.pb.js
 *
 * Same-origin by default: the app is served next to PocketBase by the host
 * nginx (VPS docker stack), so '/' works on every domain and avoids CORS.
 * The PB JS SDK needs a leading slash — with '' it prepends the current
 * page path (/app/api/...). Override with VITE_POCKETBASE_URL only for
 * split deployments.
 */
const baseURL = import.meta.env.VITE_POCKETBASE_URL || '/'
export const pb = new PocketBase(baseURL)
pb.autoCancellation(false)

/** An auth record of the users collection, with its typed extra fields. */
export type User = RecordModel & {
  email: string
  verified?: boolean
  full_name?: string
  role?: 'citizen' | 'officer' | 'admin'
  phone_verified?: boolean
  avatar?: string
  /** Field PocketBase copies from the Google profile on OAuth sign-up. */
  name?: string
  created?: string
}

/** The subset of the user record the funnel and shells read. */
export type Profile = {
  user_id: string
  email: string | null
  role: 'citizen' | 'officer' | 'admin'
  full_name: string | null
  phone_verified: boolean
  email_verified: boolean
}

export const STAFF_DASHBOARD_URL = '/dash'
export const OFFICER_DASHBOARD_URL = '/dash'

/** The signed-in record (null when logged out). PocketBase keeps it in pb.authStore. */
export function currentUser(): User | null {
  return pb.authStore.isValid ? ((pb.authStore.record ?? null) as User | null) : null
}

/** Fetch the user record fresh from the server. */
export async function getProfile(userId: string): Promise<Profile | null> {
  try {
    const user = await pb.collection('users').getOne<User>(userId)
    return {
      user_id: user.id,
      email: user.email ?? null,
      role: user.role ?? 'citizen',
      full_name: user.full_name ?? null,
      phone_verified: user.phone_verified ?? false,
      email_verified: user.verified ?? false,
    }
  } catch {
    return null
  }
}

/**
 * Role-aware redirect: staff belong in the dashboard. Returns the role so
 * callers can continue the citizen funnel when this returns 'citizen' (or
 * null when there is no session).
 */
export async function routeByRole(): Promise<'citizen' | 'officer' | 'admin' | null> {
  const record = currentUser()
  if (!record) return null
  const role = record.role ?? 'citizen'
  if (role === 'officer' || role === 'admin') {
    window.location.replace(OFFICER_DASHBOARD_URL)
    return role
  }
  return 'citizen'
}

/** PocketBase has no logout endpoint — clearing the local authStore IS logout. */
export async function handleAuthExpired(): Promise<void> {
  pb.authStore.clear()
}

/**
 * URL for a file on a Protected file field (docs: Files handling → Protected
 * files). Mints the SDK's short-lived file token (POST /api/files/token via
 * pb.files.getToken()) and lets PocketBase build the URL — `thumb` asks the
 * server for a generated thumbnail instead of the multi-MB original.
 */
export async function protectedFileUrl(
  record: RecordModel,
  filename: string,
  thumb?: string,
): Promise<string> {
  if (!filename) return ''
  const token = await pb.files.getToken()
  const options: Record<string, string> = { token }
  if (thumb) options.thumb = thumb
  return pb.files.getURL(record, filename, options)
}

/**
 * POST one of the app's own gamfix server routes (gamfix.pb.js and friends)
 * with a JSON body. Throws the SDK's ClientResponseError on failure — pages
 * catch it and read err.status / err.response.message.
 */
export async function gamfix<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  return await pb.send<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** True for expired/invalid session responses (401 family). */
export function isAuthError(err: unknown): boolean {
  return err instanceof ClientResponseError && err.status >= 401 && err.status < 403
}

/** True for connection failures: fetch threw, DNS failed, or it timed out. */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection')
  )
}

/** The server's own human message from a failed SDK/hook call, or a fallback. */
export function friendlyError(err: unknown): string {
  if (err instanceof ClientResponseError) {
    const body = (err.response ?? {}) as { error?: unknown; message?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error
    if (typeof body.message === 'string' && body.message.trim()) return body.message
  }
  if (err instanceof Error && err.message.trim()) return err.message
  return 'Something went wrong. Please try again.'
}
