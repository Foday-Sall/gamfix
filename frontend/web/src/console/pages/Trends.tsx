
import { useEffect, useState } from 'react'
import { gamfixPost, type OfficerStats } from '../lib/api'
import { statusMeta } from '../lib/meta'
import { useRealtimeVersion } from '../lib/realtime'
import { BarList, LineChart, LoadError, Loading, PageHead, Panel } from '../components/ui'

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
  const rtv = useRealtimeVersion()

  useEffect(() => {
    // The endpoint wraps the numbers in a `stats` object.
    gamfixPost<{ ok: boolean; stats: OfficerStats }>('/api/gamfix/staff/stats')
      .then((s) => (s.ok && s.stats ? setStats(s.stats) : setError(true)))
      .catch(() => setError(true))
  }, [rtv])

  if (error) return <LoadError title="Could not load statistics" />
  if (!stats) return <Loading label="Loading trends…" />

  return (
    <div className="page">
      <PageHead title="Service trends" subtitle="Category, status and weekly trends" />
      <Panel title="Received vs resolved, last 14 days">
        <LineChart
          labels={stats.daily.map((d) => shortDate(d.date))}
          series={[
            { name: 'Received', color: BLUE, values: stats.daily.map((d) => d.received) },
            { name: 'Resolved', color: GREEN, values: stats.daily.map((d) => d.resolved) },
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
