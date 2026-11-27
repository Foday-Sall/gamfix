export { authStore, AuthStore, SESSION_KEY } from './store'
export { ApiError, isAuthError, isNetworkError, friendlyError } from './errors'
export { baseURL, apiCall, request } from './http'
export type { User, Profile, AuthResponse, Access, StaffAccess, StaffInstitution } from './types'
export { signInWithGoogle as googleSignIn } from './oauth'
export { realtimeConfig, type RealtimeConfig } from './config'
export {
  DASHBOARD_PATH,
  accessFromResponse,
  isStaff,
  homePathFor,
  resolveAccess,
  currentUser,
  getProfile,
  refreshSession,
  login,
  register,
  logout,
  handleAuthExpired,
  updateFullName,
  uploadAvatar,
  uploadComplaintPhotos,
  requestVerification,
  requestPasswordReset,
  confirmPasswordReset,
  gamfix,
} from './session'
