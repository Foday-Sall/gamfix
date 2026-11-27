import type { Access, User } from './types'

export const SESSION_KEY = 'gamfix_auth'

type StoredSession = { token: string; user: User | null; access?: Access | null }

function readStored(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    const parsed = raw ? (JSON.parse(raw) as StoredSession) : null
    return parsed?.token ? parsed : null
  } catch {
    return null
  }
}

type Listener = (token: string, user: User | null) => void

export class AuthStore {
  token = ''
  user: User | null = null
  /** Last access the server confirmed for this token (null = not checked yet). */
  access: Access | null = null
  private listeners = new Set<Listener>()

  constructor() {
    const stored = readStored()
    if (stored) {
      this.token = stored.token
      this.user = stored.user ?? null
      this.access = stored.access?.role ? stored.access : null
    }
  }

  get isValid(): boolean {
    return this.token !== ''
  }

  save(token: string, user: User | null): void {
    this.token = token
    this.user = user
    this.access = null
    this.persist()
    this.notify()
  }

  update(user: User | null): void {
    this.user = user
    this.persist()
    this.notify()
  }

  setAccess(access: Access): void {
    this.access = access
    this.persist()
    this.notify()
  }

  clear(): void {
    this.token = ''
    this.user = null
    this.access = null
    try {
      window.localStorage.removeItem(SESSION_KEY)
    } catch {
    }
    this.notify()
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private persist(): void {
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ token: this.token, user: this.user, access: this.access }))
    } catch {
    }
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn(this.token, this.user))
  }
}

export const authStore = new AuthStore()
