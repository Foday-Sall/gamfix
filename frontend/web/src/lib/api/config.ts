import { apiCall } from './http'

/** Public client settings for the realtime server (nothing secret here). */
export type RealtimeConfig = { key: string; host: string; port: number; scheme: 'ws' | 'wss' }

type PublicConfig = {
  realtime?: { key?: string | null; host?: string | null; port?: number | string | null; scheme?: string | null }
}

const env = (import.meta.env as unknown) as Record<string, string | undefined>

let pending: Promise<RealtimeConfig> | null = null

/**
 * Where the browser reaches Laravel Reverb. The API publishes its settings
 * (`GET /api/config`) so the web app needs no realtime variables of its own;
 * VITE_REVERB_* still win when a deployment has to override them.
 */
export function realtimeConfig(): Promise<RealtimeConfig> {
  if (pending) return pending
  pending = apiCall<PublicConfig>('/api/config', 'GET')
    .then((config): RealtimeConfig => {
      const realtime = config.realtime ?? {}
      const scheme: RealtimeConfig['scheme'] = env.VITE_REVERB_SCHEME === 'ws' || realtime.scheme === 'ws'
        ? 'ws'
        : env.VITE_REVERB_SCHEME === 'wss' || realtime.scheme === 'wss' || window.location.protocol === 'https:'
          ? 'wss'
          : 'ws'
      const port = Number(env.VITE_REVERB_PORT ?? realtime.port)
      return {
        key: env.VITE_REVERB_APP_KEY || realtime.key || '',
        host: env.VITE_REVERB_HOST || realtime.host || window.location.hostname,
        port: Number.isFinite(port) && port > 0 ? port : scheme === 'wss' ? 443 : 80,
        scheme,
      }
    })
    .catch((err: unknown) => {
      pending = null
      throw err
    })
  return pending
}
