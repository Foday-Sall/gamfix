import { apiCall, request } from './http'
import { authStore } from './store'
import type { Access, Profile, StaffAccess, StaffInstitution, User } from './types'

/** The staff console lives inside the web app at this path. */
export const DASHBOARD_PATH = '/dashboard'

type AccessResponse = {
  ok?: boolean
  role?: string | null
  institution?: Partial<StaffInstitution> | null
}

/** Turn the server's answer into the access the UI routes on. */
export function accessFromResponse(res: AccessResponse | null | undefined): Access {
  if (!res?.ok) return { role: 'none' }
  if (res.role === 'admin') return { role: 'admin' }
  if (res.role === 'officer' && res.institution?.id) {
    return {
      role: 'officer',
      institution: {
        id: String(res.institution.id),
        code: String(res.institution.code ?? ''),
        name: String(res.institution.name ?? ''),
        logo_url: res.institution.logo_url ?? null,
      },
    }
  }
  if (res.role === 'citizen') return { role: 'citizen' }
  return { role: 'none' }
}

export function isStaff(access: Access | null | undefined): access is StaffAccess {
  return access?.role === 'officer' || access?.role === 'admin'
}

/** Where an account belongs once its access is known. */
export function homePathFor(access: Access): string {
  if (isStaff(access)) return DASHBOARD_PATH
  return access.role === 'citizen' ? '/home' : '/login'
}

/**
 * Ask the server what this account may use and remember the answer. This is
 * the only thing the UI routes on — the `role` field on the user record can
 * be stale or incomplete (an officer without an institution, an admin who is
 * not on the allowlist), the access endpoint is authoritative.
 */
export async function resolveAccess(): Promise<Access | null> {
  if (!authStore.isValid) return null
  const res = await apiCall<AccessResponse>('/api/gamfix/access', 'POST')
  const access = accessFromResponse(res)
  authStore.setAccess(access)
  return access
}

export function currentUser(): User | null {
  return authStore.isValid ? authStore.user : null
}

export async function getProfile(_userId?: string): Promise<Profile | null> {
  try {
    const user = await apiCall<User>('/api/me', 'GET')
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

export async function refreshSession(): Promise<User | null> {
  if (!authStore.isValid) return null
  try {
    const user = await apiCall<User>('/api/me', 'GET')
    authStore.update(user)
    return user
  } catch {
    authStore.clear()
    return null
  }
}

export async function login(email: string, password: string): Promise<User> {
  const auth = await apiCall<{ token: string; user: User }>('/api/auth/login', 'POST', { email, password })
  authStore.save(auth.token, auth.user)
  return auth.user
}

export async function register(name: string, email: string, password: string, passwordConfirm: string): Promise<User> {
  const auth = await apiCall<{ token: string; user: User }>('/api/auth/register', 'POST', {
    name,
    email,
    password,
    passwordConfirm,
  })
  // The account is signed in from now on: routing (citizen steps or the
  // console) works exactly like after a regular login.
  authStore.save(auth.token, auth.user)
  return auth.user
}

export async function logout(): Promise<void> {
  try {
    await apiCall('/api/auth/logout', 'POST')
  } catch {
  }
  authStore.clear()
}

export async function handleAuthExpired(): Promise<void> {
  authStore.clear()
}

export async function updateFullName(fullName: string): Promise<User> {
  const user = await apiCall<User>('/api/users/me', 'PATCH', { full_name: fullName })
  authStore.update(user)
  return user
}

export async function uploadAvatar(file: File): Promise<User> {
  const form = new FormData()
  form.append('avatar', file)
  const user = await request<User>('/api/users/avatar', {
    method: 'POST',
    headers: { ...(authStore.isValid ? { Authorization: `Bearer ${authStore.token}` } : {}) },
    body: form,
  })
  authStore.update(user)
  return user
}

export async function uploadComplaintPhotos(complaintId: string, files: File[]): Promise<void> {
  const form = new FormData()
  files.forEach((file) => form.append('photos[]', file))
  await request(`/api/gamfix/complaints/${encodeURIComponent(complaintId)}/photos`, {
    method: 'POST',
    headers: { ...(authStore.isValid ? { Authorization: `Bearer ${authStore.token}` } : {}) },
    body: form,
  })
}

export function requestVerification(email: string): Promise<void> {
  return apiCall('/api/email/request-verification', 'POST', { email })
}

export function requestPasswordReset(email: string): Promise<void> {
  return apiCall('/api/password/request-reset', 'POST', { email })
}

export function confirmPasswordReset(
  token: string,
  email: string,
  password: string,
  passwordConfirm: string,
): Promise<void> {
  return apiCall('/api/password/confirm-reset', 'POST', { token, email, password, passwordConfirm })
}

export async function gamfix<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  return apiCall<T>(path, 'POST', body)
}
