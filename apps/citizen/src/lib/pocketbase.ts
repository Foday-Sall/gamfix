import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'

export type User = RecordModel & {
  email: string
  emailVisibility?: boolean
  verified?: boolean
  full_name?: string
  role?: 'citizen' | 'officer' | 'admin'
  phone_verified?: boolean
  email_verified?: boolean
  user_metadata?: Record<string, unknown>
  app_metadata?: { provider?: string }
  created?: string
}

export type Session = {
  access_token: string
  user: User
  expires_at?: number
}

export type Profile = {
  user_id: string
  email: string | null
  role: 'citizen' | 'officer' | 'admin'
  full_name: string | null
  phone_verified: boolean
  email_verified: boolean
}

type ApiResult<T> = { data: T; error: ErrorLike | null }
type ErrorLike = { message: string; name?: string; code?: string; status?: number; context?: Response }

// Same-origin by default: the app is served next to PocketBase by the host
// nginx (VPS docker stack), so '/' works on every domain and avoids CORS.
// The PB JS SDK needs a leading slash — with '' it prepends the current
// page path (/app/api/...). Override with VITE_POCKETBASE_URL only for
// split deployments.
const baseURL = import.meta.env.VITE_POCKETBASE_URL || '/'
export const pb = new PocketBase(baseURL)
pb.autoCancellation(false)

function normalizeError(error: unknown): ErrorLike {
  if (error instanceof ClientResponseError) {
    // GamFix hooks return their human message in `response.error` (PB's own
    // errors use `response.message`) — surface whichever is present, or the
    // friendlyAuthError fallback ends up hiding what actually went wrong.
    const body = (error.response ?? {}) as { error?: unknown; message?: unknown }
    const message =
      (typeof body.error === 'string' && body.error) ||
      (typeof body.message === 'string' && body.message) ||
      error.message
    return { message, name: error.name, status: error.status, code: String(error.status), context: error.response ? new Response(JSON.stringify(error.response), { status: error.status }) : undefined }
  }
  if (error instanceof Error) return { message: error.message, name: error.name }
  return { message: String(error) }
}

function result<T>(data: T | null, error: unknown = null): ApiResult<T> {
  return { data: data as T, error: error ? normalizeError(error) : null }
}

/**
 * Present a PocketBase auth record with the legacy field names the
 * original UI expects (pre-PocketBase schema compatibility). `email_confirmed_at` is derived from the
 * PocketBase `verified` flag — without this every login looked
 * "unconfirmed" and bounced to /verify/email forever (the stuck-screen bug).
 */
function sessionFromRecord(record: User): Session {
  const augmented = record as User & Record<string, unknown>
  if (augmented.email_confirmed_at === undefined) {
    augmented.email_confirmed_at = record.verified ? (record.created ?? new Date().toISOString()) : null
  }
  if (!augmented.user_metadata || Object.keys(augmented.user_metadata).length === 0) {
    augmented.user_metadata = { full_name: record.full_name ?? '', name: record.full_name ?? '' }
  }
  if (!augmented.created_at) augmented.created_at = record.created
  return { access_token: pb.authStore.token, user: augmented as User }
}

/** Field-name aliases so pages can keep using the original column names. */
function aliasField(collection: string, field: string): string {
  if (collection === 'profiles') {
    if (field === 'user_id') return 'id'
    if (field === 'avatar_url') return 'avatar'
  }
  if (field === 'created_at') return 'created'
  if (field === 'updated_at') return 'updated'
  return field
}

function aliasFields(collection: string, fields: string): string {
  return fields
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => aliasField(collection, f))
    .join(',')
}

/** Shape a raw record the way the original UI expects it. */
function shapeRecord(collection: string, item: RecordModel): RecordModel {
  const out: RecordModel = { ...item }
  if (out.created && out.created_at === undefined) out.created_at = out.created
  if (out.updated && out.updated_at === undefined) out.updated_at = out.updated
  if (collection === 'profiles') {
    out.user_id = item.id
    if (item.avatar) out.avatar_url = pb.files.getURL(item, String(item.avatar))
    else if (out.avatar_url === undefined) out.avatar_url = null
  }
  return out
}

function literal(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  return JSON.stringify(String(value))
}

class QueryBuilder<T extends RecordModel = RecordModel> {
  private selectFields = '*'
  private filters: string[] = []
  private sort = ''
  private pageSize: number | null = null
  private pageNumber = 1
  private pendingUpdate: Record<string, unknown> | null = null
  private readonly promiseFactory: () => Promise<T[]>

  /** The name the UI uses; kept for field aliasing and record shaping. */
  private readonly originalCollection: string
  /** The real PocketBase collection ("profiles" is served by "users"). */
  private readonly collection: string
  constructor(collection: string) {
    this.originalCollection = collection
    this.collection = collection === 'profiles' ? 'users' : collection
    this.promiseFactory = async () => {
      const response = await pb.collection(this.collection).getList<T>(this.pageNumber, this.pageSize ?? 50, {
        fields: this.selectFields === '*' ? undefined : aliasFields(this.originalCollection, this.selectFields),
        filter: this.filters.length ? this.filters.join(' && ') : undefined,
        sort: this.sort || undefined,
      })
      return response.items
    }
  }

  select(fields = '*') { this.selectFields = fields; return this }
  eq(field: string, value: unknown) { this.filters.push(`${aliasField(this.originalCollection, field)} = ${literal(value)}`); return this }
  in(field: string, values: unknown[]) { const f = aliasField(this.originalCollection, field); this.filters.push(`(${values.map((v) => `${f} = ${literal(v)}`).join(' || ')})`); return this }
  order(field: string, options?: { ascending?: boolean }) { this.sort = `${options?.ascending === false ? '-' : '+'}${aliasField(this.originalCollection, field)}`; return this }
  limit(value: number) { this.pageSize = value; return this }
  range(from: number, to: number) { this.pageNumber = Math.floor(from / Math.max(1, to - from + 1)) + 1; this.pageSize = to - from + 1; return this }
  async maybeSingle(): Promise<ApiResult<T | null>> {
    try { const items = await this.promiseFactory(); return result((items[0] ? shapeRecord(this.originalCollection, items[0]) : null) as T | null) }
    catch (error) { return result<T | null>(null, error) }
  }
  update(values: Record<string, unknown>) { this.pendingUpdate = values; return this }
  async then<TResult1 = ApiResult<T[]>, TResult2 = never>(onfulfilled?: ((value: ApiResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    try {
      const items = await this.promiseFactory()
      if (this.pendingUpdate) {
        const aliased: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(this.pendingUpdate)) {
          aliased[aliasField(this.originalCollection, key)] = value
        }
        for (const item of items) await pb.collection(this.collection).update<T>(item.id, aliased)
      }
      const shaped = items.map((item) => shapeRecord(this.originalCollection, item) as T)
      return await Promise.resolve(result(shaped)).then(onfulfilled, onrejected)
    }
    catch (error) { return Promise.resolve(result<T[]>(null, error)).then(onfulfilled, onrejected) }
  }
}

const auth = {
  getSession: async (): Promise<ApiResult<{ session: Session | null }>> => {
    if (!pb.authStore.isValid || !pb.authStore.record) return result({ session: null })
    return result({ session: sessionFromRecord(pb.authStore.record as User) })
  },
  onAuthStateChange: (callback: (_event: string, session: Session | null) => void) => {
    const unsubscribe = pb.authStore.onChange((_token, record) => callback('SIGNED_IN', record ? sessionFromRecord(record as User) : null))
    return { data: { subscription: { unsubscribe } } }
  },
  signUp: async ({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) => {
    try {
      const user = await pb.collection('users').create<User>({ email, password, passwordConfirm: password, full_name: options?.data?.full_name ?? '', role: 'citizen' })
      const authData = await pb.collection('users').authWithPassword(email, password)
      return result({ user, session: sessionFromRecord(authData.record as User) })
    } catch (error) { return result<{ user: User | null; session: Session | null }>(null, error) }
  },
  signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
    try { const authData = await pb.collection('users').authWithPassword(email, password); return result({ user: authData.record as User, session: sessionFromRecord(authData.record as User) }) }
    catch (error) { return result<{ user: User | null; session: Session | null }>(null, error) }
  },
  signInWithOAuth: async ({ provider }: { provider: string; options?: { redirectTo?: string } }) => {
    try {
      // Popup flow: the SDK opens Google in a popup window, waits for the
      // OAuth2 relay to post the token back, stores the session in the
      // authStore and resolves. Callers MUST route on resolution — the
      // authStore change alone does not navigate (that was the bug that
      // left users stuck on the login page until they refreshed).
      const authData = await pb.collection('users').authWithOAuth2({ provider })
      // Remember the provider on the cached record so the UI can tell
      // Google- accounts apart from password accounts.
      const marked = { ...authData.record, app_metadata: { provider } } as unknown as RecordModel
      pb.authStore.save(pb.authStore.token, marked)
      return result({ user: marked as User, session: sessionFromRecord(marked as User) })
    } catch (error) { return result<{ user: User | null; session: Session | null }>(null, error) }
  },
  signOut: async (_options?: { scope?: string }) => { pb.authStore.clear(); return result<null>(null) },
  resetPasswordForEmail: async (email: string, _options?: { redirectTo?: string }) => {
    // Sends a real 6-digit reset code by email (server hook), so the
    // ResetPassword screen's code entry works end to end.
    try { await pb.send('/api/gamfix/password-otp/send', { method: 'POST', body: JSON.stringify({ email: String(email).trim() }) }); return result<null>(null) }
    catch (error) { return result<null>(null, error) }
  },
  updateUser: async ({ data, password }: { data?: Record<string, unknown>; password?: string }) => {
    try {
      if (!pb.authStore.record) throw new Error('Not signed in')
      const body = { ...(data ?? {}), ...(password ? { password, passwordConfirm: password } : {}) }
      const record = await pb.collection('users').update<User>(pb.authStore.record.id, body)
      pb.authStore.save(pb.authStore.token, record)
      return result({ user: record })
    } catch (error) { return result<null>(null, error) }
  },
  resend: async ({ type, email }: { type: string; email?: string }) => {
    try {
      if (type === 'signup' && email) {
        await pb.send('/api/gamfix/email-otp/send', { method: 'POST', body: JSON.stringify({ email: String(email).trim() }) })
      }
      return result<null>(null)
    } catch (error) { return result<null>(null, error) }
  },
  verifyOtp: async (params?: { email?: string; token?: string; type?: string }) => {
    const email = String(params?.email ?? '').trim()
    const code = String(params?.token ?? '').trim()
    const type = String(params?.type ?? 'email')
    try {
      if (type === 'recovery') {
        // Mint a session from the reset code so the password step can save.
        const data = await pb.send<{ token?: string; record?: User }>('/api/gamfix/password-otp/verify', {
          method: 'POST',
          body: JSON.stringify({ email, code }),
          headers: { 'Content-Type': 'application/json' },
        })
        if (data?.token && data?.record) pb.authStore.save(data.token, data.record as unknown as RecordModel)
        return result<null>(null)
      }
      await pb.send('/api/gamfix/email-otp/verify', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
        headers: { 'Content-Type': 'application/json' },
      })
      // Refresh the cached record so verified=true is visible right away.
      if (pb.authStore.isValid && pb.authStore.record) {
        try {
          const fresh = await pb.collection('users').getOne<User>(pb.authStore.record.id)
          pb.authStore.save(pb.authStore.token, fresh)
        } catch (_) { /* keep the stale cached record */ }
      }
      return result<null>(null)
    } catch (error) { return result<null>(null, error) }
  },
}

/** Last avatar URL produced by storage.upload (Profile reads it right after). */
let lastAvatarUrl = ''

export const pbApi = {
  auth,
  from: <T extends RecordModel = RecordModel>(collection: string) => new QueryBuilder<T>(collection),
  rpc: async <T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<ApiResult<T>> => {
    const paths: Record<string, string> = { submit_complaint: '/api/gamfix/complaints', track_complaint: '/api/gamfix/track', fn_can_confirm_report: '/api/gamfix/can-confirm', confirm_complaint: '/api/gamfix/confirm', reopen_complaint: '/api/gamfix/reopen', fn_dashboard_access: '/api/gamfix/access' }
    try {
      const route = paths[name] ?? `/api/gamfix/${name}`
      const query = new URLSearchParams({ x: JSON.stringify(params) })
      const data = await pb.send<T>(`${route}?${query.toString()}`, { method: 'POST' })
      return result(data)
    } catch (error) { return result<T>(null, error) }
  },
  functions: { invoke: async <T = unknown>(name: string, options?: { body?: BodyInit }) => {
    try {
      // Photo attachment goes straight to PocketBase's file handling on the
      // complaints record (server validates ownership + type/size limits).
      if (name === 'citizen-photo-upload' && options?.body instanceof FormData) {
        const form = options.body as FormData
        const complaintId = String(form.get('complaint_id') ?? '')
        const photo = form.get('photo')
        if (!complaintId || !(photo instanceof File)) return result<T>(null, new Error('missing report id or photo'))
        await pb.collection('complaints').update(complaintId, { photos: photo })
        return result({ ok: true } as T)
      }
      const data = await pb.send<T>(`/api/gamfix/${name}`, { method: 'POST', body: options?.body })
      return result(data)
    } catch (error) { return result<T>(null, error) }
  } },
  storage: { from: (bucket: string) => ({
    upload: async (path: string, file: File, _options?: { cacheControl?: string; upsert?: boolean }) => {
      try {
        const [recordId] = path.split('/')
        const collection = bucket === 'avatars' ? 'users' : bucket
        const record = await pb.collection(collection).update<RecordModel>(recordId, { avatar: file })
        const filename = String(record.avatar ?? '')
        lastAvatarUrl = filename ? pb.files.getURL(record, filename) : ''
        return result(record)
      } catch (error) { return result<null>(null, error) }
    },
    getPublicUrl: (_path: string) => ({ data: { publicUrl: lastAvatarUrl } }),
  }) },
  channel: (_name: string) => ({ on: (_event: string, _filter: unknown, _callback: (payload: any) => void) => ({ on: (_event2: string, _filter2: unknown, _callback2: (payload: any) => void) => ({ subscribe: () => undefined }), subscribe: () => undefined }), subscribe: () => undefined }),
  removeChannel: async (_channel?: unknown) => undefined,
}

export const STAFF_DASHBOARD_URL = '/dash'
export const OFFICER_DASHBOARD_URL = '/dash'
export function isGoogleAuthUser(user: Pick<User, 'app_metadata'> | null | undefined): boolean { return user?.app_metadata?.provider === 'google' }
export async function getProfile(userId: string): Promise<Profile | null> {
  try { const user = await pb.collection('users').getOne<User>(userId); return { user_id: user.id, email: user.email ?? null, role: user.role ?? 'citizen', full_name: user.full_name ?? null, phone_verified: user.phone_verified ?? false, email_verified: user.verified ?? false } }
  catch { return null }
}
export function isNetworkError(err: unknown): boolean { const msg = err instanceof Error ? err.message.toLowerCase() : ''; return msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('connection') }
export async function handleAuthExpired(): Promise<void> { pb.authStore.clear() }
export async function routeByRole(): Promise<'citizen' | 'officer' | 'admin' | null> { const record = pb.authStore.record as User | null; if (!record) return null; const role = record.role ?? 'citizen'; if (role === 'officer' || role === 'admin') window.location.replace(OFFICER_DASHBOARD_URL); return role }
export function isAuthError(err: ErrorLike | null | undefined): boolean { return err?.status === 401 || err?.code === '401' || (err?.message ?? '').toLowerCase().includes('unauthorized') }
export function friendlyError(error: unknown): string { return normalizeError(error).message }
