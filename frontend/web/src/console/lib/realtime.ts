import { useEffect, useState } from 'react'
import Pusher from 'pusher-js'
import { realtimeConfig, type RealtimeConfig } from '@/lib/api/config'
import { authHeaders, baseURL } from '@/lib/api/http'
import type { Session } from './api'

type Handler = () => void

const handlers = new Set<Handler>()
let pusher: Pusher | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let version = 0

function channelsFor(session: Session): string[] {
  if (session?.role === 'admin') return ['private-admins']
  if (session?.role === 'officer' && session.institution) {
    return [`private-institution.${session.institution.id}`]
  }
  return []
}

function bump(): void {
  version += 1
  handlers.forEach((fn) => fn())
}

type AuthData = { auth: string; channel_data?: string; shared_secret?: string }

function connect(config: RealtimeConfig, channels: string[]): void {
  if (pusher) return

  pusher = new Pusher(config.key, {
    wsHost: config.host,
    wsPort: config.port,
    forceTLS: config.scheme === 'wss',
    enabledTransports: ['ws', 'wss'],
    cluster: 'mt1',
    authorizer: (channel) => ({
      authorize: (socketId: string, callback: (error: Error | null, authData: AuthData | null) => void) => {
        fetch(baseURL + 'api/broadcasting/auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
        })
          .then((res) => res.json())
          .then((data) => callback(null, data))
          .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), null))
      },
    }),
  })

  for (const name of channels) {
    pusher.subscribe(name).bind('complaint.activity', bump)
  }
}

export function startRealtime(session: Session): void {
  const channels = channelsFor(session)
  if (channels.length === 0) return

  // Realtime is an optimisation: when the websocket cannot connect, or no
  // realtime server is configured, the console still refreshes by polling.
  pollTimer = setInterval(() => {
    if (!pusher || pusher.connection.state !== 'connected') bump()
  }, 30000)

  // Where the browser reaches Laravel Reverb comes from the API
  // (`GET /api/config`), so the console needs no realtime settings of its own.
  void realtimeConfig()
    .then((config) => {
      if (config.key && pollTimer) connect(config, channels)
    })
    .catch(() => {})
}

export function stopRealtime(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  pusher?.disconnect()
  pusher = null
}

export function useRealtimeVersion(): number {
  const [value, setValue] = useState(version)
  useEffect(() => {
    const handler = () => setValue(version)
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  }, [])
  return value
}
