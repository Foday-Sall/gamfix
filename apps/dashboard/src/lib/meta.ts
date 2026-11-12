// Domain metadata: complaint lifecycle labels, badge variants and map colors.

export type StatusMeta = { label: string; badge: string; color: string }

export const STATUS_META: Record<string, StatusMeta> = {
  submitted: { label: 'Submitted', badge: 'neutral', color: '#6b7280' },
  received: { label: 'Received', badge: 'cyan', color: '#0891b2' },
  assigned: { label: 'Assigned', badge: 'blue', color: '#2563eb' },
  in_progress: { label: 'In progress', badge: 'green', color: '#16a34a' },
  waiting_info: { label: 'Waiting for info', badge: 'orange', color: '#ea580c' },
  citizen_confirmation: { label: 'Awaiting confirmation', badge: 'purple', color: '#9333ea' },
  escalated: { label: 'Escalated', badge: 'red', color: '#dc2626' },
  forwarded: { label: 'Forwarded', badge: 'teal', color: '#0d9488' },
  reopened: { label: 'Reopened', badge: 'yellow', color: '#ca8a04' },
  closed: { label: 'Closed', badge: 'success', color: '#15803d' },
  rejected: { label: 'Rejected', badge: 'error', color: '#b91c1c' },
}

export function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status] || {
      label: status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      badge: 'neutral',
      color: '#6b7280',
    }
  )
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export const OPEN_STATUSES = [
  'submitted',
  'received',
  'assigned',
  'in_progress',
  'waiting_info',
  'escalated',
  'forwarded',
  'reopened',
]

export function relTime(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
