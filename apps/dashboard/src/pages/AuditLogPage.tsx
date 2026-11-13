// Audit log admin: every privileged admin action, filterable, newest first.

import { useEffect, useMemo, useState } from 'react'
import { Badge, EmptyState, TextInput } from '@astryxdesign/core'
import { Search } from 'lucide-react'
import { adminAction, type AuditEntry } from '../lib/pb'
import { formatDate } from '../lib/meta'
import { Loading, PageHead, Panel } from '../components/ui'

const ACTION_VARIANTS: Record<string, string> = {
  create_institution: 'green',
  invite_officer: 'blue',
  toggle_officer_active: 'orange',
  set_access_level: 'purple',
  set_allowed_categories: 'purple',
  set_sla_hours: 'purple',
  set_rate_limit: 'purple',
  save_settings: 'cyan',
  secret_set: 'red',
  secret_delete: 'red',
}

export function AuditLogPage() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    adminAction<AuditEntry[]>('getAuditLog', { p_limit: 300 })
      .then((list) => setRows(Array.isArray(list) ? list : []))
      .catch(() => setRows([]))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows || []
    return (rows || []).filter(
      (r) =>
        r.action.toLowerCase().includes(q) ||
        r.actor_email.toLowerCase().includes(q) ||
        (r.target_type || '').toLowerCase().includes(q) ||
        JSON.stringify(r.details || {}).toLowerCase().includes(q),
    )
  }, [rows, query])

  return (
    <div className="page">
      <PageHead title="Audit log" subtitle="Privileged actions, newest first" />
      <div className="filter-row">
        <div style={{ flex: '1 1 260px', maxWidth: 380 }}>
          <TextInput
            label="Filter"
            isLabelHidden
            value={query}
            onChange={setQuery}
            placeholder="Filter by actor, action or target…"
            startIcon={<Search size={15} />}
          />
        </div>
      </div>
      {!rows ? (
        <Loading label="Loading audit trail…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No entries" description={query ? 'No entries match the filter.' : 'Admin actions will appear here as they happen.'} />
      ) : (
        <Panel title={`${filtered.length} entries`}>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td className="mono">{formatDate(r.created_at)}</td>
                  <td>{r.actor_email}</td>
                  <td>
                    <Badge variant={(ACTION_VARIANTS[r.action] || 'neutral') as 'neutral'} label={r.action} />
                  </td>
                  <td>{r.target_type || '—'}{r.target_id ? <span style={{ color: 'rgba(0,0,0,0.45)' }}> · {r.target_id.slice(0, 8)}</span> : null}</td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={JSON.stringify(r.details)}>
                    {Object.keys(r.details || {}).length ? JSON.stringify(r.details) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}
