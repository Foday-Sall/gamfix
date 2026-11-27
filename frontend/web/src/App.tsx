import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import AppShell from '@/components/AppShell'
import { CitizenOnly, StaffEntry } from '@/components/RouteGuards'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import Home from '@/pages/Home'
import Auth from '@/pages/Auth'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Report from '@/pages/Report'
import Track from '@/pages/Track'
import Profile from '@/pages/Profile'
import MyReports from '@/pages/MyReports'
import VerifyEmail from '@/pages/VerifyEmail'
import VerifyPhone from '@/pages/VerifyPhone'
import Onboarding from '@/pages/Onboarding'
import GoogleCallback from '@/pages/GoogleCallback'
import { DASHBOARD_PATH } from '@/lib/api/session'

function PositionedToaster() {
  const isDesktop = useIsDesktop()
  return <Toaster position={isDesktop ? 'bottom-right' : 'top-center'} />
}

/** `/dash` was the separate dashboard app; `/institute` the officer view inside the citizen app. */
function LegacyStaffRedirect() {
  return <Navigate to={DASHBOARD_PATH} replace />
}

/**
 * Citizen screens and the shared sign-in pages. The staff console is a second
 * document of this same web app (dashboard/index.html, served at /dashboard/...):
 * StaffEntry hands a staff account over to it with a full page load.
 */
export default function App() {
  return (
    <>
      <PositionedToaster />
      <Routes>
        {/* Password recovery uses a separate email request and recovery OTP flow. */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Email verification: OTP entry, reachable with or without a session. */}
        <Route path="/verify/email" element={<VerifyEmail />} />

        {/* Auth pages bypass the shell; one login for citizens and staff. */}
        <Route path="/login" element={<Auth key="signin" initialMode="signin" />} />
        <Route path="/signup" element={<Auth key="signup" initialMode="signup" />} />
        <Route path="/auth/google/callback" element={<GoogleCallback />} />

        {/* Staff console: officers and administrators only. */}
        <Route path={`${DASHBOARD_PATH}/*`} element={<StaffEntry />} />
        <Route path="/dash" element={<LegacyStaffRedirect />} />
        <Route path="/dash/*" element={<LegacyStaffRedirect />} />

        {/* Citizen screens: shell layout with top bar + bottom tabs + desktop nav. */}
        <Route element={<CitizenOnly />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/institute" element={<LegacyStaffRedirect />} />
            <Route path="/verify/phone" element={<VerifyPhone />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/report" element={<Report />} />
            <Route path="/track" element={<Track />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/my-reports" element={<MyReports />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        </Route>
      </Routes>
    </>
  )
}
