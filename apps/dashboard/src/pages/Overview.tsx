// Overview: admin sees platform-wide stats (/admin getOverviewStats); officers
// see their institution's dashboard (/staff/stats) built on the Astryx
// dashboard template design — live badge, metric tiles, and a trend chart.

import { useCallback, useEffect, useState } from 'react'
import {
  AlarmClock,
  CalendarDays,
  CheckCircle2,
  FolderOpen,
  Flame,
  Inbox,
  Layers,
  RefreshCw,
  Timer,
} from 'lucide-react'
import { adminRpc, rpc, type AdminStats, type OfficerStats, type Session } from '../lib/pb'
import {
  LiveBadge,
  LoadError,
  Loading,
  PageHead,
  Panel,
  StatCard,
  TrendLineChart,
  StatTile,
} from '../components/ui'

const BLUE = 'var(--color-data-categorical-blue, #0171E3)'
const ORANGE = 'var(--color-data-categorical-orange, #EB6E00)'
const GREEN = 'var(--color-data-categorical-green, #0B991F)'
const RED = '#dc2626'

export function Overview({ session }: { session: Session }) {
  if (session?.role === 'officer') return <OfficerOverview />
  return <AdminOverview />
}

function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    adminRpc<AdminStats>('getOverviewStats')
      .then((s) => (s.ok || typeof s.total === 'number' ? setStats(s) : setError(true)))
      .catch(() => setError(true))
  }, [])

  if (error) return <LoadError title="Could not load statistics" />
  if (!stats) return <Loading label="Loading overview…" />

  return (
    <div className="page">
      <PageHead title="Overview" subtitle="Platform-wide complaint activity (last 14 days)" />
      <div className="stat-grid">
        <StatCard label="Total complaints" value={stats.total} icon={<Layers size={18} />} />
        <StatCard label="Open" value={stats.open} icon={<Inbox size={18} />} />
        <StatCard label="Escalated today" value={stats.escalated_today} icon={<Flame size={18} />} />
        <StatCard
          label="Avg first response"
          value={stats.avg_first_response_minutes >= 60
            ? (stats.avg_first_response_minutes / 60).toFixed(1) + ' h'
            : Math.round(stats.avg_first_response_minutes) + ' min'}
          icon={<Timer size={18} />}
        />
      </div>
      <Panel title="Complaints received per day">
        <TrendLineChart
          height={220}
          labels={stats.daily.map((d) => shortDate(d.date))}
          series={[{ name: 'Received', color: BLUE, values: stats.daily.map((d) => d.count) }]}
        />
      </Panel>
    </div>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function OfficerOverview() {
  const [stats, setStats] = useState<OfficerStats | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setBusy(true)
    rpc<OfficerStats>('/api/gamfix/staff/stats')
      .then((s) => (s.ok ? setStats(s) : setError(true)))
      .catch(() => setError(true))
      .finally(() => setBusy(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <LoadError title="Could not load statistics" />
  if (!stats) return <Loading label="Loading overview…" />

  return (
    <div className="page">
      <div className="page-head-block">
        <div className="page-head-text">
          <LiveBadge />
          <h2 className="page-title">{stats.institution.name} operations overview</h2>
          <p className="page-subtitle">Review workload, new reports, response progress, and overdue cases.</p>
        </div>
        <button className="refresh-btn" onClick={load} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : undefined} />
          Refresh data
        </button>
      </div>

      <div className="tile-grid">
        <StatTile
          label="Total complaints"
          value={stats.total}
          description="All reports assigned to your institution"
          color={'#0d9488'}
          icon={<Layers size={17} />}
        />
        <StatTile
          label="New today"
          value={stats.today}
          description="Received since midnight"
          color={BLUE}
          icon={<CalendarDays size={17} />}
        />
        <StatTile
          label="Open cases"
          value={stats.open}
          description="Awaiting resolution or next action"
          color={ORANGE}
          icon={<FolderOpen size={17} />}
        />
        <StatTile
          label="Resolved this week"
          value={stats.resolved_week}
          description="Closed in the last 7 days"
          color={GREEN}
          icon={<CheckCircle2 size={17} />}
        />
        <StatTile
          label="Overdue cases"
          value={stats.overdue}
          description="Past the response deadline"
          color={RED}
          icon={<AlarmClock size={17} />}
        />
      </div>

      <Panel title="Received vs resolved, last 14 days">
        <TrendLineChart
          labels={stats.daily.map((d) => shortDate(d.date))}
          series={[
            { name: 'Received', color: BLUE, values: stats.daily.map((d) => d.received) },
            { name: 'Resolved', color: GREEN, values: stats.daily.map((d) => d.resolved) },
          ]}
        />
      </Panel>
    </div>
  )
}
