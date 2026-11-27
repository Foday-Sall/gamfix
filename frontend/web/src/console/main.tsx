import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-matcha/fonts.css'
import '@astryxdesign/theme-matcha/theme.css'
import 'leaflet/dist/leaflet.css'
import './console.css'
import { SessionProvider } from '@/hooks/SessionProvider'
import { DASHBOARD_PATH } from '@/lib/api/session'
import { HardNavigate } from '@/lib/navigation'
import Console from './Console'
import { StaffGate } from './StaffGate'
import { RouterProvider } from './lib/router'

/**
 * Entry of the staff console document (dashboard/index.html). It belongs to the same
 * web app as index.html — same folder, same session, same login page — but is
 * its own document because the console ships a different design system, and
 * its stylesheets are meant to be the only ones on the page.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <SessionProvider>
        <RouterProvider>
          <Routes>
            <Route element={<StaffGate />}>
              <Route path={`${DASHBOARD_PATH}/*`} element={<Console />} />
            </Route>
            {/* Everything else belongs to the web entry. */}
            <Route path="*" element={<HardNavigate to="/home" />} />
          </Routes>
        </RouterProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
