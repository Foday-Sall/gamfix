// PocketBase client + typed RPC helpers for the GamFix staff console.

import PocketBase from 'pocketbase'

// API origin: on the VPS the console is same-origin with PocketBase; on static
// hosts (Cloudflare Pages) VITE_PB_URL points at the PocketBase server.
const env = import.meta.env as Record<string, string | undefined>
export const PB_URL: string = env.VITE_PB_URL || window.location.origin
export const pb = new PocketBase(PB_URL)
// All admin RPCs share one endpoint (/api/gamfix/admin) — concurrent calls
// would cancel each other under the SDK default auto-cancellation.
pb.autoCancellation(false)

export type InstitutionRef = {
  id: string
  code: string
  name: string
  logo_url: string | null
}

export type Session =
  | { role: 'admin' }
  | { role: 'officer'; institution: InstitutionRef }
  | null

type AccessResponse = {
  ok: boolean
  role: 'admin' | 'officer' | 'citizen' | null
  institution?: InstitutionRef
}

export async function login(email: string, password: string): Promise<Session> {
  pb.authStore.clear()
  await pb.collection('users').authWithPassword(email.trim(), password)
  const res = await pb.send<AccessResponse>('/api/gamfix/access', { method: 'POST', body: {} })
  if (!res.ok || (res.role !== 'admin' && res.role !== 'officer')) {
    pb.authStore.clear()
    throw new Error(
      res.role === 'citizen'
        ? 'This console is for institution staff and administrators only.'
        : 'This account has no staff console access.',
    )
  }
  if (res.role === 'officer') return { role: 'officer', institution: res.institution! }
  return { role: 'admin' }
}

export async function restoreSession(): Promise<Session> {
  if (!pb.authStore.isValid) return null
  try {
    const res = await pb.send<AccessResponse>('/api/gamfix/access', { method: 'POST', body: {} })
    if (res.ok && res.role === 'admin') return { role: 'admin' }
    if (res.ok && res.role === 'officer') return { role: 'officer', institution: res.institution! }
  } catch (_) {
    pb.authStore.clear()
  }
  return null
}

export function logout() {
  pb.authStore.clear()
}

// ---- RPC helpers -----------------------------------------------------------

export function rpc<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return pb.send<T>(path, { method: 'POST', body })
}

export function adminRpc<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  return rpc<T>('/api/gamfix/admin', { action, params })
}

export function whatsappRpc<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  return rpc<{ ok: boolean; data: T }>('/api/gamfix/admin-whatsapp', { action, params })
}

export function fileWithToken(url: string): string {
  if (!url) return url
  const joiner = url.includes('?') ? '&' : '?'
  return url + joiner + 'token=' + encodeURIComponent(pb.authStore.token)
}

// ---- Shared DTOs -----------------------------------------------------------

export type ComplaintRow = {
  id: string
  institution_id: string
  tracking_no: string
  title: string
  status: string
  urgency: string
  region: string | null
  council_area: string | null
  ward: string | null
  created_at: string | null
  updated_at: string | null
}

export type ComplaintDetail = ComplaintRow & {
  description: string
  category: string | null
  lat: number | null
  lng: number | null
  is_anonymous: boolean
  photo_url: string | null
  resolution_photo_url: string | null
  resolution_note: string | null
  contact: { name: string | null; phone: string | null; email: string | null } | null
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
  institution_id: string
  institution_name: string
  name: string
  email: string
  role: string
  department: string
  is_active: boolean
  created_at: string | null
}

export type AuditEntry = {
  id: string
  actor_email: string
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  created_at: string | null
}

export type OfficerStats = {
  ok: boolean
  institution: { id: string; code: string; name: string }
  total: number
  today: number
  open: number
  resolved_week: number
  overdue: number
  avg_resolution_hours: number
  by_status: { status: string; count: number }[]
  by_category: { category: string; count: number }[]
  by_channel: { channel: string; count: number }[]
  by_urgency: { urgency: string; count: number }[]
  daily: { date: string; received: number; resolved: number }[]
}

export type AdminStats = {
  ok: boolean
  total: number
  open: number
  escalated_today: number
  avg_first_response_minutes: number
  per_category: { category: string; count: number }[]
  daily: { date: string; count: number }[]
}

export type Category = { id: string; name: string; slug: string; active: boolean }

export type MapComplaint = {
  id: string
  tracking_no: string
  title: string
  status: string
  urgency: string
  category: string | null
  lat: number
  lng: number
  region: string | null
  council_area: string | null
  ward: string | null
  created_at: string | null
}

export type MapResponse = {
  ok: boolean
  error?: string
  scope: string
  total: number
  returned: number
  truncated: boolean
  complaints: MapComplaint[]
}
