
import { useEffect, useState } from 'react'
import {
  AlarmClock,
  Building2,
  CheckCircle2,
  Clock3,
  Flame,
  Inbox,
  Layers,
  Timer,
  TrendingUp,
} from 'lucide-react'
import {
  adminAction,
  gamfixPost,
  type AdminStats,
  type OfficerStats,
  type Session,
} from '../lib/api'
import { statusMeta } from '../lib/meta'
import { useRealtimeVersion } from '../lib/realtime'
import {
  BarList,
  ChartLegend,
  LineChart,
  LoadError,
  Loading,
  PageHead,
  Panel,
  StatCard,
} from '../components/ui'

const GREEN = '#2e7d4f'
const AMBER = '#d97706'

export function Overview({ session }: { session: Session }) {
  if (session?.role === 'officer') return <OfficerOverview session={session} />
  return <AdminOverview />
}

function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState(false)
  const rtv = useRealtimeVersion()

  useEffect(() => {
    adminAction<AdminStats>('getOverviewStats')
      .then((res) => (res.ok && res.data ? setStats(res.data) : setError(true)))
      .catch(() => setError(true))
  }, [rtv])

  if (error) return <LoadError title="Could not load statistics" />
  if (!stats) return <Loading label="Loading overview…" />

  return (
    <div className="page">
      <PageHead title="Overview" subtitle="Platform-wide complaint activity (last 14 days)" />
      <div className="stat-grid">
        <StatCard label="Total complaints" value={stats.total_complaints} icon={<Layers size={18} />} />
        <StatCard label="Open" value={stats.open_complaints} icon={<Inbox size={18} />} />
        <StatCard label="Escalated today" value={stats.escalations_today} icon={<Flame size={18} />} />
        <StatCard
          label="Avg first response"
          value={stats.avg_first_response_minutes == null
            ? '—'
            : stats.avg_first_response_minutes >= 60
              ? (stats.avg_first_response_minutes / 60).toFixed(1) + ' h'
              : Math.round(stats.avg_first_response_minutes) + ' min'}
          icon={<Timer size={18} />}
        />
      </div>
      <Panel title="Complaints received per day">
        <LineChart
          labels={stats.daily.map((d) => d.date)}
          series={[{ name: 'Received', color: GREEN, values: stats.daily.map((d) => d.received) }]}
        />
        <ChartLegend entries={[{ name: 'Received', color: GREEN }]} />
      </Panel>
      <div className="two-col">
        <Panel title="By category">
          <BarList items={Object.entries(stats.by_category).map(([name, count]) => ({ name, count }))} />
        </Panel>
        <Panel title="Daily volume, last 14 days">
          <BarList items={stats.daily.map((d) => ({ name: d.date.slice(5), count: d.received }))} max={14} />
        </Panel>
      </div>
    </div>
  )
}

function OfficerOverview({ session }: { session: Session }) {
  const [stats, setStats] = useState<OfficerStats | null>(null)
  const [error, setError] = useState(false)
  const rtv = useRealtimeVersion()

  useEffect(() => {
    // The endpoint wraps the numbers in a `stats` object.
    gamfixPost<{ ok: boolean; stats: OfficerStats }>('/api/gamfix/staff/stats')
      .then((s) => (s.ok && s.stats ? setStats(s.stats) : setError(true)))
      .catch(() => setError(true))
  }, [rtv])

  if (error) return <LoadError title="Could not load statistics" />
  if (!stats) return <Loading label="Loading overview…" />

  return (
    <div className="page">
      <PageHead title="Overview" subtitle={`Institution dashboard — ${session?.role === 'officer' ? session.institution?.name ?? session.institution?.code : ''}`} />
      <div className="stat-grid">
        <StatCard label="Total complaints" value={stats.total} icon={<Layers size={18} />} />
        <StatCard label="Received today" value={stats.today} icon={<TrendingUp size={18} />} />
        <StatCard label="Open" value={stats.open} icon={<Inbox size={18} />} />
        <StatCard label="Resolved (7 days)" value={stats.resolved_week} icon={<CheckCircle2 size={18} />} />
        <StatCard label="Overdue (SLA)" value={stats.overdue} icon={<AlarmClock size={18} />} />
        <StatCard label="Avg resolution" value={stats.avg_resolution_hours == null ? '—' : stats.avg_resolution_hours + ' h'} icon={<Clock3 size={18} />} />
      </div>
      <Panel title="Received vs resolved, last 14 days">
        <LineChart
          labels={stats.daily.map((d) => d.date)}
          series={[
            { name: 'Received', color: GREEN, values: stats.daily.map((d) => d.received) },
            { name: 'Resolved', color: AMBER, values: stats.daily.map((d) => d.resolved) },
          ]}
        />
        <ChartLegend
          entries={[
            { name: 'Received', color: GREEN },
            { name: 'Resolved', color: AMBER },
          ]}
        />
      </Panel>
      <div className="two-col">
        <Panel title="By status">
          <BarList items={Object.entries(stats.by_status).map(([s, count]) => ({ name: statusMeta(s).label, count }))} />
        </Panel>
        <Panel title="By category">
          <BarList items={Object.entries(stats.by_category).map(([name, count]) => ({ name, count }))} />
        </Panel>
      </div>
      <div className="two-col">
        <Panel title="By urgency">
          <BarList items={Object.entries(stats.by_urgency).map(([name, count]) => ({ name, count }))} />
        </Panel>
        <Panel title="By channel">
          <BarList items={Object.entries(stats.by_channel).map(([name, count]) => ({ name, count }))} />
        </Panel>
      </div>
    </div>
  )
}

export const overviewIcons = { Building2 }
