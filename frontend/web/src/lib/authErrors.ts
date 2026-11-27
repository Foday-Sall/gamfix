const NETWORK_MESSAGE =
  'We could not reach the server. Check your internet connection and try again.'
const SERVER_DOWN_MESSAGE =
  'Our server is having a moment. Please try again in a minute.'
const RATE_LIMIT_MESSAGE =
  'Too many attempts. Please wait a few minutes and try again.'
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

function isNetworkError(err: { name?: string; message?: string; code?: string }): boolean {
  if (err.name === 'TimeoutError') return true
  const msg = (err.message ?? '').toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('load failed') ||
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    err.code === 'ENOTFOUND' ||
    err.code === 'ECONNREFUSED'
  )
}

function errorStatus(err: { status?: number; statusCode?: number }): number | undefined {
  return err.status ?? err.statusCode
}

function isReadable(message: string): boolean {
  return (
    message.trim().length > 0 &&
    message.length <= 140 &&
    !/^(error|typeerror|http \d)/i.test(message.trim())
  )
}

export function friendlyAuthError(err: unknown): string {
  if (typeof err === 'string') return friendlyAuthError({ message: err })

  const e = (err ?? {}) as {
    name?: string
    message?: string
    code?: string
    status?: number
    statusCode?: number
  }
  const message = e.message ?? ''
  const m = message.toLowerCase()
  const code = (e.code ?? '').toLowerCase()
  const status = errorStatus(e)

  if (isNetworkError(e)) return NETWORK_MESSAGE

  if (
    m.includes('failed to authenticate') ||
    m.includes('invalid login credentials') ||
    m.includes('invalid credentials')
  ) {
    return 'Wrong email or password. Try again or reset your password.'
  }
  if (
    m.includes('verify your email') ||
    m.includes('email not confirmed') ||
    m.includes('not verified')
  ) {
    return 'Please verify your email first — we sent you a verification link.'
  }
  if (
    code === 'user_already_registered' ||
    m.includes('user already registered') ||
    m.includes('already been registered')
  ) {
    return 'An account with this email already exists. Try logging in instead.'
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code.includes('rate_limit') ||
    m.includes('email rate limit exceeded') ||
    m.includes('rate limit') ||
    m.includes('too many')
  ) {
    return RATE_LIMIT_MESSAGE
  }
  if (
    code === 'weak_password' ||
    m.includes('password should be at least') ||
    (m.includes('password') && (m.includes('short') || m.includes('weak') || m.includes('least')))
  ) {
    return 'Your password needs at least 6 characters.'
  }
  if (
    m.includes('unable to parse token') ||
    m.includes('invalid token') ||
    m.includes('token has expired') ||
    m.includes('email link is invalid or has expired') ||
    code === 'otp_expired'
  ) {
    return 'That link or code is no longer valid. Request a new one.'
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'That email address does not look right. Check it and try again.'
  }
  if (m.includes('signup requires a valid password')) {
    return 'Enter a password of at least 6 characters.'
  }

  if (status === 429) return 'Too many requests. Please wait a bit and try again.'
  if (status === 500 || status === 502 || status === 503) return SERVER_DOWN_MESSAGE

  return isReadable(message) ? message : FALLBACK_MESSAGE
}
