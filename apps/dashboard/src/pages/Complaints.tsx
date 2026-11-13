// Complaint feed with search/status filters and the detail + action dialog.
// Data comes from the server-verified /api/gamfix/staff/* routes.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Dialog, DialogHeader, EmptyState, Heading, Text, TextArea, TextInput } from '@astryxdesign/core'
import { Search } from 'lucide-react'
import { adminAction, gamfixPost, signedFileUrl, type ComplaintDetail, type ComplaintRow, type Institution } from '../lib/pb'
import { formatDate, OPEN_STATUSES, statusMeta, titleCase } from '../lib/meta'
import { Loading, PageHead, StatusBadge, UrgencyBadge } from '../components/ui'
import { useToast } from '@astryxdesign/core'

export function Complaints({ canForward }: { canForward: boolean }) {
  const [rows, setRows] = useState<ComplaintRow[] | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(() => {
    gamfixPost<{ ok: boolean; complaints: ComplaintRow[] }>('/api/gamfix/staff/complaints')
      .then((res) => setRows(res.complaints || []))
      .catch(() => setError(true))
  }, [])

  useEffect(load, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows || []).filter((r) => {
      if (statusFilter === 'open' && !OPEN_STATUSES.includes(r.status)) return false
      if (statusFilter !== 'all' && statusFilter !== 'open' && r.status !== statusFilter) return false
      if (q && !(r.tracking_no.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || (r.ward || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [rows, query, statusFilter])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of rows || []) counts[r.status] = (counts[r.status] || 0) + 1
    return counts
  }, [rows])

  return (
    <div className="page">
      <PageHead title="Complaints" subtitle={rows ? `${rows.length} loaded — showing ${filtered.length}` : 'Loading feed…'} />
      <div className="filter-row">
        <div style={{ flex: '1 1 260px', maxWidth: 380 }}>
          <TextInput
            label="Search"
            isLabelHidden
            value={query}
            onChange={setQuery}
            placeholder="Search tracking no, title or ward…"
            startIcon={<Search size={15} />}
          />
        </div>
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="open">Open ({rows ? rows.filter((r) => OPEN_STATUSES.includes(r.status)).length : 0})</option>
          <option value="all">All statuses</option>
          {Object.keys(statusMeta)
            .filter((s) => statusCounts[s])
            .map((s) => (
              <option key={s} value={s}>
                {statusMeta[s].label} ({statusCounts[s]})
              </option>
            ))}
        </select>
        <Button label="Refresh" variant="ghost" size="sm" onClick={load} />
      </div>

      {error ? (
        <EmptyState title="Could not load the complaint feed" description="Check your connection and try again." />
      ) : !rows ? (
        <Loading label="Loading complaints…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No complaints match" description="Try a different search term or status filter." />
      ) : (
        <Card padding={0}>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Title</th>
                <th>Location</th>
                <th>Status</th>
                <th>Urgency</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => setSelected(r.id)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelected(r.id) }}>
                  <td className="mono">{r.tracking_no}</td>
                  <td className="title-cell">{r.title}</td>
                  <td>{r.ward || r.council_area || r.region || '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><UrgencyBadge urgency={r.urgency} /></td>
                  <td title={formatDate(r.created_at)}>{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {selected ? (
        <ComplaintDialog
          complaintId={selected}
          canForward={canForward}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  )
}

// ---- Detail + action dialog -------------------------------------------------

type ActionKind = 'accept' | 'start' | 'fix' | 'request-info' | 'reject' | 'forward' | 'proof'

const ACTION_FORMS: Record<ActionKind, { label: string; button: string; variant: 'primary' | 'destructive' | 'secondary'; needsText: boolean; textLabel?: string; minLength?: number; hint?: string }> = {
  accept: { label: 'Accept case', button: 'Accept', variant: 'primary', needsText: false },
  start: { label: 'Start work', button: 'Start work', variant: 'primary', needsText: false },
  fix: { label: 'Report fix', button: 'Send for confirmation', variant: 'primary', needsText: true, textLabel: 'What was fixed?', minLength: 5, hint: 'The citizen is asked to confirm or reopen the report.' },
  'request-info': { label: 'Request more info', button: 'Send request', variant: 'secondary', needsText: true, textLabel: 'Message to the citizen', minLength: 10 },
  reject: { label: 'Reject report', button: 'Reject', variant: 'destructive', needsText: true, textLabel: 'Reason for rejection', minLength: 10, hint: 'The citizen sees this reason.' },
  forward: { label: 'Forward to another institution', button: 'Forward', variant: 'secondary', needsText: true, textLabel: 'Reason for forwarding', minLength: 10, hint: 'The report visibly moves to the chosen institution.' },
  proof: { label: 'Attach proof photo URL', button: 'Attach', variant: 'secondary', needsText: true, textLabel: 'https://…' },
}

export function ComplaintDialog({
  complaintId,
  canForward,
  onClose,
  onChanged,
}: {
  complaintId: string
  canForward: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [detail, setDetail] = useState<ComplaintDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [action, setAction] = useState<ActionKind | null>(null)
  const [text, setText] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  // Evidence photos sit on Protected file fields: the URL must be signed
  // with a short-lived file token before the browser can load it.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    gamfixPost<{ ok: boolean; complaint: ComplaintDetail }>('/api/gamfix/staff/complaint', { p_complaint_id: complaintId })
      .then(async (res) => {
        if (!res.ok) {
          setFailed(true)
          return
        }
        setDetail(res.complaint)
        setPhotoUrl(res.complaint.photo_url ? await signedFileUrl(res.complaint.photo_url) : null)
      })
      .catch(() => setFailed(true))
    if (canForward) {
      adminAction<Institution[]>('getInstitutions')
        .then((list) => setInstitutions(Array.isArray(list) ? list.filter((i) => i.status === 'active') : []))
        .catch(() => setInstitutions([]))
    }
  }, [complaintId, canForward])

  const status = detail?.status || ''
  const available: ActionKind[] = []
  if (['submitted', 'received', 'escalated'].includes(status)) available.push('accept')
  if (['assigned', 'waiting_info', 'reopened'].includes(status)) available.push('start')
  if (status === 'in_progress') available.push('fix')
  if (['submitted', 'received', 'assigned', 'in_progress', 'escalated', 'reopened'].includes(status)) available.push('request-info')
  if (['submitted', 'received', 'assigned', 'escalated', 'waiting_info'].includes(status)) available.push('reject')
  if (canForward && ['submitted', 'received', 'assigned', 'in_progress', 'waiting_info', 'escalated', 'reopened'].includes(status)) available.push('forward')
  available.push('proof')

  const run = async () => {
    if (!action || !detail) return
    const form = ACTION_FORMS[action]
    if (form.needsText && form.minLength && text.trim().length < form.minLength) return
    setBusy(true)
    try {
      let ok = false
      if (action === 'accept') ok = await gamfixPost<boolean>('/api/gamfix/staff/accept', { p_complaint_id: detail.id })
      else if (action === 'start') ok = await gamfixPost<boolean>('/api/gamfix/staff/status', { p_complaint_id: detail.id, p_status: 'in_progress' })
      else if (action === 'fix') ok = await gamfixPost<boolean>('/api/gamfix/staff/resolution', { p_complaint_id: detail.id, p_citizen_message: text.trim() })
      else if (action === 'request-info') ok = await gamfixPost<boolean>('/api/gamfix/staff/request-info', { p_complaint_id: detail.id, p_message: text.trim() })
      else if (action === 'reject') ok = await gamfixPost<boolean>('/api/gamfix/staff/reject', { p_complaint_id: detail.id, p_reason: text.trim() })
      else if (action === 'forward') ok = await gamfixPost<boolean>('/api/gamfix/staff/forward', { p_complaint_id: detail.id, p_institution_id: target, p_reason: text.trim() })
      else if (action === 'proof') ok = await gamfixPost<boolean>('/api/gamfix/staff/proof', { p_complaint_id: detail.id, p_photo_url: text.trim() })
      if (ok) {
        toast({ body: form.label + ' — done', type: 'success' })
        setAction(null)
        setText('')
        setTarget('')
        onChanged()
        onClose()
      } else {
        toast({ body: 'The action was not applied — the report may have changed state. Refresh and try again.', type: 'error' })
      }
    } catch (err: any) {
      toast({ body: err?.message || 'Request failed.', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const form = action ? ACTION_FORMS[action] : null
  const textInvalid = !!form?.minLength && text.trim().length < form.minLength

  return (
    <Dialog isOpen onOpenChange={(open) => { if (!open) onClose() }} width={640}>
      {failed ? (
        <>
          <DialogHeader title="Complaint" onOpenChange={(open) => { if (!open) onClose() }} />
          <div style={{ padding: 20 }}>
            <EmptyState title="Complaint not found" description="It may belong to another institution." />
          </div>
        </>
      ) : !detail ? (
        <div style={{ padding: 40 }}>
          <Loading label="Loading complaint…" />
        </div>
      ) : (
        <>
          <DialogHeader
            title={detail.tracking_no}
            subtitle={detail.title}
            onOpenChange={(open) => { if (!open) onClose() }}
          />
          <div style={{ padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge status={detail.status} />
              <UrgencyBadge urgency={detail.urgency} />
              {detail.category ? <Text size="sm" color="secondary">{titleCase(detail.category)}</Text> : null}
            </div>

            <div className="detail-grid">
              <Cell label="Region" value={detail.region || '—'} />
              <Cell label="Council area" value={detail.council_area || '—'} />
              <Cell label="Ward / landmark" value={detail.ward || '—'} />
              <Cell label="Received" value={formatDate(detail.created_at)} />
              <Cell label="Last update" value={formatDate(detail.updated_at)} />
              <Cell
                label="Citizen"
                value={
                  detail.is_anonymous
                    ? 'Anonymous'
                    : detail.contact
                      ? [detail.contact.name, detail.contact.phone, detail.contact.email].filter(Boolean).join(' · ') || '—'
                      : '—'
                }
              />
            </div>

            <div>
              <Heading level={5} weight="semibold">Description</Heading>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{detail.description || '—'}</Text>
            </div>

            {detail.photo_url ? (
              <div className="photo-frame">
                <Heading level={5} weight="semibold">Citizen photo</Heading>
                <img src={photoUrl ?? detail.photo_url} alt="Complaint photo" />
              </div>
            ) : null}

            {detail.resolution_note ? (
              <div>
                <Heading level={5} weight="semibold">Reported fix</Heading>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{detail.resolution_note}</Text>
              </div>
            ) : null}

            <div className="actions-row">
              {available.map((kind) => (
                <Button
                  key={kind}
                  label={ACTION_FORMS[kind].label}
                  variant={kind === action ? 'primary' : ACTION_FORMS[kind].variant === 'primary' ? 'secondary' : ACTION_FORMS[kind].variant}
                  size="sm"
                  onClick={() => { setAction(action === kind ? null : kind); setText('') }}
                />
              ))}
            </div>

            {form ? (
              <div className="action-box">
                <Text size="sm" weight="semibold">{form.label}</Text>
                {form.needsText ? (
                  form.textLabel && form.textLabel.startsWith('https') ? (
                    <TextInput
                      label={form.textLabel}
                      isLabelHidden
                      value={text}
                      onChange={setText}
                      placeholder={form.textLabel}
                    />
                  ) : (
                    <TextArea
                      label={form.textLabel || 'Message'}
                      isLabelHidden
                      value={text}
                      onChange={setText}
                      placeholder={form.textLabel}
                      rows={3}
                    />
                  )
                ) : null}
                {form.hint ? <Text size="xs" color="secondary">{form.hint}</Text> : null}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {action === 'forward' ? (
                    <select className="select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target institution">
                      <option value="">Choose institution…</option>
                      {institutions.filter((i) => i.id !== detail.institution_id).map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  ) : null}
                  <Button
                    label={form.button}
                    variant={form.variant}
                    isLoading={busy}
                    isDisabled={textInvalid || (action === 'forward' && !target)}
                    onClick={() => void run()}
                  />
                  <Button label="Cancel" variant="ghost" size="sm" onClick={() => { setAction(null); setText('') }} />
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </Dialog>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-cell">
      <span className="detail-label">{label}</span>
      <Text size="sm">{value}</Text>
    </div>
  )
}

export { statusMeta }
