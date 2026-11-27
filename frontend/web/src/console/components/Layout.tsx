
import * as stylex from '@stylexjs/stylex'
import { useRef } from 'react'
import { AppShell, Avatar, Badge, IconButton, SideNav, SideNavItem, SideNavSection, TopNav } from '@astryxdesign/core'
import {
  BadgeCheck,
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageCircle,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import gamfixIcon from '@/assets/gamfix-icon.png'
import { logout } from '@/lib/api/session'
import type { Session } from '../lib/api'
import { useRouter } from '../lib/router'

const styles = stylex.create({
  logoImg: { width: 26, height: 26, borderRadius: 6, display: 'block' },
  userWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  main: { width: '100%' },
})

const NAV = {
  workspace: [
    { path: '/', label: 'Overview', icon: LayoutDashboard },
    { path: '/complaints', label: 'Complaints', icon: ClipboardList },
    { path: '/map', label: 'Map', icon: MapPin },
  ],
  administration: [
    { path: '/institutions', label: 'Institutions', icon: Building2 },
    { path: '/accounts', label: 'Accounts', icon: Users },
    { path: '/access', label: 'Access control', icon: ShieldCheck },
    { path: '/audit-log', label: 'Audit log', icon: ScrollText },
    { path: '/whatsapp', label: 'WhatsApp devices', icon: MessageCircle },
    { path: '/settings', label: 'Settings', icon: Settings },
  ],
}

export function Layout({ session, userName, children }: { session: Session; userName: string; children: React.ReactNode }) {
  const { path, navigate, href } = useRouter()
  const signingOut = useRef(false)
  const isAdmin = session?.role === 'admin'
  const inst = session?.role === 'officer' ? session.institution : null

  const renderItem = (item: { path: string; label: string; icon: typeof Building2 }) => (
    <SideNavItem
      key={item.path}
      label={item.label}
      icon={<item.icon size={18} />}
      href={href(item.path)}
      isSelected={path === item.path || (item.path !== '/' && path.startsWith(item.path))}
      onClick={(e) => {
        e.preventDefault()
        navigate(item.path)
      }}
    />
  )

  const sideNav = (
    <SideNav>
      <SideNavSection title="Workspace">{NAV.workspace.map(renderItem)}</SideNavSection>
      {isAdmin ? (
        <SideNavSection title="Administration">{NAV.administration.map(renderItem)}</SideNavSection>
      ) : null}
    </SideNav>
  )

  const initials = userName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')

  const topNav = (
    <TopNav
      heading=""
      startContent={
        <div {...stylex.props(styles.userWrap)}>
          <img {...stylex.props(styles.logoImg)} src={gamfixIcon} alt="GamFix" />
          <BadgeCheck size={18} />
        </div>
      }
      endContent={
        <div {...stylex.props(styles.userWrap)}>
          <Badge variant={isAdmin ? 'purple' : 'green'} label={isAdmin ? 'Administrator' : inst?.code || 'Officer'} />
          <Avatar name={initials || userName || 'User'} size="sm" />
          <IconButton
            icon={<LogOut size={16} />}
            label="Sign out"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (signingOut.current) return
              signingOut.current = true
              // Full page load on purpose: the console's stylesheets must
              // not outlive it, and the sign-in page is the shared one.
              void logout().finally(() => window.location.assign(import.meta.env.BASE_URL + 'login'))
            }}
          />
        </div>
      }
    />
  )

  return (
    <AppShell sideNav={sideNav} topNav={topNav}>
      <div {...stylex.props(styles.main)}>{children}</div>
    </AppShell>
  )
}
