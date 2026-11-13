// App chrome: AppShell with matcha-themed SideNav, TopNav with the signed-in
// user's avatar and a logout action.

import * as stylex from '@stylexjs/stylex'
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
import { logout, type Session } from '../lib/pb'
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
  const { path, navigate } = useRouter()
  const isAdmin = session?.role === 'admin'
  const inst = session?.role === 'officer' ? session.institution : null

  const renderItem = (item: { path: string; label: string; icon: typeof Building2 }) => (
    <SideNavItem
      key={item.path}
      label={item.label}
      icon={<item.icon size={18} />}
      href={'#' + item.path}
      selected={path === item.path || (item.path !== '/' && path.startsWith(item.path))}
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
          <img {...stylex.props(styles.logoImg)} src={import.meta.env.BASE_URL + 'gamfix-icon.png'} alt="GamFix" />
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
              logout()
              window.location.reload()
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
