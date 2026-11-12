// Shared presentational building blocks: status badge, stat cards, and
// charts (recharts for the trend chart, dependency-free SVG bars elsewhere)
// styled through StyleX and Astryx design tokens.

import * as stylex from '@stylexjs/stylex'
import {
  Badge,
  Card,
  EmptyState,
  HStack,
  Heading,
  Spinner,
  Text,
  VStack,
} from '@astryxdesign/core'
import {
  CartesianGrid,
  Line,
  LineChart as ReLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { statusMeta } from '../lib/meta'

export function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status)
  return <Badge variant={meta.badge as 'neutral'} label={meta.label} />
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const variant =
    urgency === 'critical' ? 'error' : urgency === 'high' ? 'warning' : urgency === 'low' ? 'neutral' : 'info'
  return <Badge variant={variant as 'info'} label={urgency || 'normal'} />
}

const styles = stylex.create({
  page: { width: '100%', maxWidth: 1180, marginInline: 'auto' },
  pageHead: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  statCard: { display: 'flex', flexDirection: 'column', gap: 6, padding: 16 },
  statValue: { fontSize: 30, fontWeight: 700, lineHeight: 1.1 },
  statLabel: { color: 'var(--color-text-secondary, #5b6259)', fontSize: 13, fontWeight: 500 },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'color-mix(in srgb, var(--color-accent, #2e7d4f) 12%, transparent)',
    color: 'var(--color-accent, #2e7d4f)',
    marginBottom: 4,
  },
  panel: { padding: 18, marginBottom: 16 },
  panelTitle: { marginBottom: 12 },
  barsWrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  barRow: { display: 'grid', gridTemplateColumns: '150px 1fr 44px', alignItems: 'center', gap: 10 },
  barName: {
    fontSize: 13,
    color: 'var(--color-text-secondary, #5b6259)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: 'color-mix(in srgb, var(--color-accent, #2e7d4f) 10%, transparent)' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: 'var(--color-accent, #2e7d4f)' },
  barCount: { fontSize: 13, fontWeight: 600, textAlign: 'end' },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: 16,
    alignItems: 'start',
  },
})

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.pageHead)}>
      <div>
        <Heading level={2} weight="semibold">
          {title}
        </Heading>
        {subtitle ? (
          <Text size="sm" color="secondary">
            {subtitle}
          </Text>
        ) : null}
      </div>
      {actions}
    </div>
  )
}

export function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <Card padding={0}>
      <div {...stylex.props(styles.statCard)}>
        {icon ? <div {...stylex.props(styles.statIconWrap)}>{icon}</div> : null}
        <div {...stylex.props(styles.statValue)}>{value}</div>
        <div {...stylex.props(styles.statLabel)}>{label}</div>
      </div>
    </Card>
  )
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card padding={0}>
      <div {...stylex.props(styles.panel)}>
        <Heading level={4} weight="semibold" xstyle={styles.panelTitle}>
          {title}
        </Heading>
        {children}
      </div>
    </Card>
  )
}

export function BarList({ items, max = 8 }: { items: { name: string; count: number }[]; max?: number }) {
  const top = items.slice(0, max)
  const peak = Math.max(1, ...top.map((x) => x.count))
  if (!top.length) return <Text size="sm">No data yet.</Text>
  return (
    <div {...stylex.props(styles.barsWrap)}>
      {top.map((x) => (
        <div key={x.name} {...stylex.props(styles.barRow)}>
          <div {...stylex.props(styles.barName)} title={x.name}>
            {x.name}
          </div>
          <div {...stylex.props(styles.barTrack)}>
            <div {...stylex.props(styles.barFill)} style={{ width: `${Math.round((x.count / peak) * 100)}%` }} />
          </div>
          <div {...stylex.props(styles.barCount)}>{x.count}</div>
        </div>
      ))}
    </div>
  )
}

export function LineChart({
  series,
  labels,
  height = 190,
}: {
  series: { name: string; color: string; values: number[] }[]
  labels: string[]
  height?: number
}) {
  const w = 720
  const h = height
  const padL = 34
  const padB = 26
  const padT = 12
  const padR = 8
  const n = labels.length
  const peak = Math.max(1, ...series.flatMap((s) => s.values))
  const x = (i: number) => padL + (i * (w - padL - padR)) / Math.max(1, n - 1)
  const y = (v: number) => padT + (1 - v / peak) * (h - padT - padB)
  const grid = [0, 0.5, 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      {grid.map((g) => (
        <g key={g}>
          <line x1={padL} x2={w - padR} y1={y(peak * g)} y2={y(peak * g)} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
          <text x={padL - 6} y={y(peak * g) + 4} textAnchor="end" fontSize="10" fill="rgba(0,0,0,0.45)">
            {Math.round(peak * g)}
          </text>
        </g>
      ))}
      {series.map((s) => (
        <g key={s.name}>
          <polyline
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={s.color} />
          ))}
        </g>
      ))}
      {labels.map((l, i) =>
        i % Math.ceil(n / 7) === 0 || i === n - 1 ? (
          <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" fill="rgba(0,0,0,0.45)">
            {l.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

export function ChartLegend({ entries }: { entries: { name: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
      {entries.map((e) => (
        <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color, display: 'inline-block' }} />
          <Text size="xs" color="secondary">
            {e.name}
          </Text>
        </div>
      ))}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '32px 0', justifyContent: 'center' }}>
      <Spinner label={label} />
      <Text color="secondary">{label}</Text>
    </div>
  )
}

export function LoadError({ title, description }: { title: string; description?: string }) {
  return (
    <EmptyState
      title={title}
      description={description || 'Please try again in a moment.'}
      headingLevel={3}
    />
  )
}

// ---- Astryx dashboard-template components ----------------------------------
// Metric tile, live badge and trend line chart following the Astryx analytics
// dashboard template (icon chip, token-driven colors, card tooltip, legend).

const tileStyles = stylex.create({
  tile: { padding: 16, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  tileHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tileLabel: { color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600 },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tileValue: { fontSize: 32, fontWeight: 700, lineHeight: 1.1 },
  tileDesc: { color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.4 },
  liveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '4px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    width: 'fit-content',
    backgroundColor: 'color-mix(in srgb, var(--color-data-categorical-green, #0B991F) 12%, transparent)',
    color: 'var(--color-data-categorical-green, #0B991F)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'var(--color-data-categorical-green, #0B991F)',
  },
  legendRow: { display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 4 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 9, height: 9, borderRadius: 5, display: 'inline-block' },
})

export function StatTile({
  label,
  value,
  description,
  icon,
  color,
}: {
  label: string
  value: string | number
  description: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <Card padding={0}>
      <div {...stylex.props(tileStyles.tile)}>
        <div {...stylex.props(tileStyles.tileHead)}>
          <span {...stylex.props(tileStyles.tileLabel)}>{label}</span>
          <span {...stylex.props(tileStyles.tileIcon)} style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`, color }}>
            {icon}
          </span>
        </div>
        <div {...stylex.props(tileStyles.tileValue)}>{value}</div>
        <div {...stylex.props(tileStyles.tileDesc)}>{description}</div>
      </div>
    </Card>
  )
}

export function LiveBadge({ label = 'Live institution data' }: { label?: string }) {
  return (
    <span {...stylex.props(tileStyles.liveBadge)}>
      <span {...stylex.props(tileStyles.liveDot)} />
      {label}
    </span>
  )
}

function ChartCardTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string | number }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <Card padding={0}>
      <VStack gap={1} xstyle={stylex.create({ pad: { padding: 12 } }).pad}>
        <Text type="supporting" color="secondary">
          {String(label ?? '')}
        </Text>
        {payload.map((entry) => (
          <HStack key={String(entry.dataKey ?? entry.name)} gap={2} vAlign="center">
            <span {...stylex.props(tileStyles.legendSwatch)} style={{ backgroundColor: entry.color }} />
            <Text type="supporting">
              {entry.name}: {entry.value}
            </Text>
          </HStack>
        ))}
      </VStack>
    </Card>
  )
}

export function TrendLineChart({
  labels,
  series,
  height = 300,
}: {
  labels: string[]
  series: { name: string; color: string; values: number[] }[]
  height?: number
}) {
  const data = labels.map((label, i) => {
    const row: Record<string, string | number> = { label }
    for (const s of series) row[s.name] = s.values[i] ?? 0
    return row
  })
  const axisTick = {
    fontSize: 12,
    fill: 'var(--color-text-secondary)',
  }
  return (
    <VStack gap={3}>
      <ResponsiveContainer width="100%" height={height}>
        <ReLineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid
            horizontal
            vertical={false}
            stroke="var(--color-border, rgba(5, 54, 89, 0.1))"
          />
          <XAxis
            dataKey="label"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            allowDecimals={false}
            width={30}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartCardTooltip />} cursor={{ stroke: 'var(--color-border, rgba(5, 54, 89, 0.1))' }} />
          {series.map((s) => (
            <Line
              key={s.name}
              type="linear"
              dataKey={s.name}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </ReLineChart>
      </ResponsiveContainer>
      <HStack gap={6} vAlign="center" xstyle={tileStyles.legendRow}>
        {series.map((s) => (
          <HStack key={s.name} gap={2} vAlign="center" xstyle={tileStyles.legendItem}>
            <span {...stylex.props(tileStyles.legendSwatch)} style={{ backgroundColor: s.color }} />
            <Text type="supporting" color="secondary">
              {s.name}
            </Text>
          </HStack>
        ))}
      </HStack>
    </VStack>
  )
}

export const layout = styles
