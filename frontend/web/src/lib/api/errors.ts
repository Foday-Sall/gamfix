export class ApiError extends Error {
  status: number
  response: Record<string, unknown>

  constructor(status: number, response: Record<string, unknown>, message?: string) {
    super(message ?? (typeof response?.message === 'string' ? response.message : `Request failed (${status})`))
    this.name = 'ApiError'
    this.status = status
    this.response = response ?? {}
  }
}

export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 401 && err.status < 403
}

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

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = (err.response ?? {}) as { error?: unknown; message?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error
    if (typeof body.message === 'string' && body.message.trim()) return body.message
  }
  if (err instanceof Error && err.message.trim()) return err.message
  return 'Something went wrong. Please try again.'
}

