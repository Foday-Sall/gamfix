// Service trends: category, status and weekly trends for the signed-in
// institution (data from /api/gamfix/staff/stats). Moved off the dashboard
// so the overview stays focused on workload metrics.

import { useEffect, useState } from 'react'
import { gamfixPost, type OfficerStats } from '../lib/pb'
import { statusMeta } from '../lib/meta'
import { BarList, LoadError, Loading, PageHead, Panel, TrendLineChart } from '../components/ui'

const BLUE = 'var(--color-data-categorical-blue, #0171E3)'
const GREEN = 'var(--color-data-categorical-green, #0B991F)'

function shortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function Trends() {
  const [stats, setStats] = useState<OfficerStats | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    gamfixPost<OfficerStats>('/api/gamfix/staff/stats')
      .then((s) => (s.ok ? setStats(s) : setError(true)))
      .catch(() => setError(true))
  }, [])

  if (error) return <LoadError title="Could not load statistics" />
  if (!stats) return <Loading label="Loading trends…" />

  return (
    <div className="page">
      <PageHead title="Service trends" subtitle="Category, status and weekly trends" />
      <Panel title="Received vs resolved, last 14 days">
        <TrendLineChart
          height={220}
          labels={stats.daily.map((d) => shortDate(d.date))}
          series={[
            { name: 'Received', color: BLUE, values: stats.daily.map((d) => d.received) },
            { name: 'Resolved', color: GREEN, values: stats.daily.map((d) => d.resolved) },
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
