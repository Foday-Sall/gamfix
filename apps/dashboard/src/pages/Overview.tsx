// Overview: admin sees platform-wide stats (/admin getOverviewStats); officers
// see their institution's dashboard (/staff/stats). Includes trend chart and
// category/status breakdowns.

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
import { adminRpc, rpc, type AdminStats, type OfficerStats, type Session } from '../lib/pb'
import { statusMeta } from '../lib/meta'
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
        <LineChart
          labels={stats.daily.map((d) => d.date)}
          series={[{ name: 'Received', color: GREEN, values: stats.daily.map((d) => d.count) }]}
        />
        <ChartLegend entries={[{ name: 'Received', color: GREEN }]} />
      </Panel>
      <div className="two-col">
        <Panel title="By category">
          <BarList items={stats.per_category.map((c) => ({ name: c.category, count: c.count }))} />
        </Panel>
        <Panel title="Daily volume, last 14 days">
          <BarList items={stats.daily.map((d) => ({ name: d.date.slice(5), count: d.count }))} max={14} />
        </Panel>
      </div>
    </div>
  )
}

function OfficerOverview() {
  const [stats, setStats] = useState<OfficerStats | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    rpc<OfficerStats>('/api/gamfix/staff/stats')
      .then((s) => (s.ok ? setStats(s) : setError(true)))
      .catch(() => setError(true))
  }, [])

  if (error) return <LoadError title="Could not load statistics" />
  if (!stats) return <Loading label="Loading overview…" />

  return (
    <div className="page">
      <PageHead title="Overview" subtitle={`Institution dashboard — ${stats.institution.name}`} />
      <div className="stat-grid">
        <StatCard label="Total complaints" value={stats.total} icon={<Layers size={18} />} />
        <StatCard label="Received today" value={stats.today} icon={<TrendingUp size={18} />} />
        <StatCard label="Open" value={stats.open} icon={<Inbox size={18} />} />
        <StatCard label="Resolved (7 days)" value={stats.resolved_week} icon={<CheckCircle2 size={18} />} />
        <StatCard label="Overdue (SLA)" value={stats.overdue} icon={<AlarmClock size={18} />} />
        <StatCard label="Avg resolution" value={stats.avg_resolution_hours + ' h'} icon={<Clock3 size={18} />} />
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
          <BarList items={stats.by_status.map((s) => ({ name: statusMeta(s.status).label, count: s.count }))} />
        </Panel>
        <Panel title="By category">
          <BarList items={stats.by_category.map((c) => ({ name: c.category, count: c.count }))} />
        </Panel>
      </div>
      <div className="two-col">
        <Panel title="By urgency">
          <BarList items={stats.by_urgency.map((u) => ({ name: u.urgency, count: u.count }))} />
        </Panel>
        <Panel title="By channel">
          <BarList items={stats.by_channel.map((c) => ({ name: c.channel, count: c.count }))} />
        </Panel>
      </div>
    </div>
  )
}

export const overviewIcons = { Building2 }
