import { ApiError } from './errors'
import { authStore } from './store'

export const baseURL = import.meta.env.VITE_API_BASE_URL || '/'

export function authHeaders(jsonBody?: unknown): Record<string, string> {
  const headers: Record<string, string> = {}
  if (authStore.isValid) headers.Authorization = `Bearer ${authStore.token}`
  if (jsonBody !== undefined) headers['Content-Type'] = 'application/json'
  return headers
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(baseURL + path.replace(/^\//, ''), init)
  } catch (err) {
    throw new ApiError(0, {}, err instanceof Error ? err.message : 'Network request failed')
  }
  let body: Record<string, unknown> = {}
  const text = await res.text()
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>
    } catch {
      body = { message: text }
    }
  }
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

export function apiCall<T>(path: string, method: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: authHeaders(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
