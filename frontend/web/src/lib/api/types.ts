export type User = {
  id: string
  email: string
  verified: boolean
  full_name: string | null
  name: string | null
  role: 'citizen' | 'officer' | 'admin'
  phone: string | null
  phone_verified: boolean
  institution_id: string | null
  avatar: string | null
  avatar_url: string | null
  created: string | null
}

export type AuthResponse = { token: string; user: User | null }

export type Profile = {
  user_id: string
  email: string | null
  role: 'citizen' | 'officer' | 'admin'
  full_name: string | null
  phone_verified: boolean
  email_verified: boolean
}

export type StaffInstitution = { id: string; code: string; name: string; logo_url: string | null }

/**
 * What the signed-in account may use in the web app. The server decides this
 * (POST /api/gamfix/access): citizens get the citizen screens, officers and
 * administrators get the staff console, and `none` is an account that is
 * signed in but not enabled for either.
 */
export type Access =
  | { role: 'citizen' }
  | { role: 'officer'; institution: StaffInstitution }
  | { role: 'admin' }
  | { role: 'none' }

export type StaffAccess = Extract<Access, { role: 'officer' | 'admin' }>
