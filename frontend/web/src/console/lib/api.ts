import { ApiError as AppApiError } from '@/lib/api/errors'
import { request } from '@/lib/api/http'
import { authStore } from '@/lib/api/store'

/**
 * API layer of the staff console. It has no sign-in of its own: the token
 * comes from the session the whole web app shares (citizens and staff use
 * the same login page), and the server checks the role on every call.
 */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type Session =
  | { role: 'admin' }
  | { role: 'officer'; institution: { id: string; code: string; name: string; logo_url: string | null } }
  | null

async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers)
  if (auth && authStore.isValid) headers.set('Authorization', `Bearer ${authStore.token}`)
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  try {
    return await request<T>(path, { ...init, headers })
  } catch (err) {
    if (!(err instanceof AppApiError)) throw err
    if (auth && err.status === 401) {
      // Token expired or revoked: back to the shared sign-in page.
      authStore.clear()
      window.location.assign(import.meta.env.BASE_URL + 'login')
    }
    const body = (err.response ?? {}) as { message?: unknown; error?: unknown }
    const message = err.status === 0
      ? 'Could not reach the GamFix server. Check your connection.'
      : typeof body.message === 'string'
        ? body.message
        : typeof body.error === 'string'
          ? body.error
          : `Request failed (${err.status})`
    throw new ApiError(err.status, message)
  }
}

export function gamfixPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return call<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export function apiGet<T>(path: string): Promise<T> {
  return call<T>(path, { method: 'GET' })
}

export type AdminResponse<T> = {
  ok: boolean
  error?: string
  data?: T
  officer?: Officer
  temporaryPassword?: string
}

export function adminAction<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<AdminResponse<T>> {
  return gamfixPost<AdminResponse<T>>('/api/gamfix/admin', { action, params })
}

export function whatsappAction<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<AdminResponse<T>> {
  return gamfixPost<AdminResponse<T>>('/api/gamfix/admin-whatsapp', { action, params })
}

export type ComplaintRow = {
  id: string
  institution_id: string | null
  tracking_no: string
  title: string
  description?: string
  status: string
  urgency: string
  region: string | null
  council_area: string | null
  ward: string | null
  category: string | null
  is_sensitive?: boolean
  is_anonymous?: boolean
  officer?: string | null
  channel?: string | null
  lat?: number | null
  lng?: number | null
  created: string | null
}

export type ComplaintDetail = ComplaintRow & {
  ward: string | null
  landmark: string | null
  category_slug: string | null
  citizen_contact: { email: string | null; phone: string | null; full_name: string | null } | null
  citizen_avatar_url: string | null
  photos: string[] | null
  photo_urls: string[]
  photo_url: string | null
  resolution_photo_url: string | null
  resolution_note: string | null
  expected_response_at: string | null
  resolved_at: string | null
  closed_at: string | null
  reopened_count?: number
  updated?: string | null
}

export type Institution = {
  id: string
  name: string
  code: string
  contact: { email: string; phone: string }
  access_level: string
  allowed_categories: string[]
  sla_hours: number
  max_complaints_per_day: number
  open_complaints: number
  officer_count: number
  status: string
  logo_url: string | null
}

export type Officer = {
  id: string
  name: string
  email: string
  institution_id: string
  institution_name: string | null
  department: string | null
  role: string
  is_active: boolean
  user_id: string | null
}

export type AuditEntry = {
  id: string
  actor_email: string
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  created: string | null
}

export type AdminStats = {
  total_complaints: number
  open_complaints: number
  escalations_today: number
  avg_first_response_minutes: number | null
  by_category: Record<string, number>
  daily: { date: string; received: number; resolved: number }[]
}

export type OfficerStats = {
  ok: boolean
  total: number
  today: number
  open: number
  resolved_week: number
  overdue: number
  avg_resolution_hours: number | null
  by_status: Record<string, number>
  by_category: Record<string, number>
  by_channel: Record<string, number>
  by_urgency: Record<string, number>
  daily: { date: string; received: number; resolved: number }[]
}

export type Category = {
  id: string
  name: string
  slug: string
  default_institution_id: string | null
  is_sensitive: boolean
  is_emergency: boolean
  deadline_hours: number
}

export type MapComplaint = {
  id: string
  tracking_no: string
  title: string
  status: string
  urgency: string
  category: string | null
  lat: number
  lng: number
  created: string | null
}

export type MapResponse = {
  ok: boolean
  error?: string
  complaints: MapComplaint[]
}
