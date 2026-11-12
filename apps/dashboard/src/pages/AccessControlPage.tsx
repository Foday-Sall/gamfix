// Access control admin: per-institution access level, SLA hours, daily rate
// limit and the allowed category scope.

import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, Heading, Text, TextInput } from '@astryxdesign/core'
import { Save } from 'lucide-react'
import { adminRpc, pb, type Category, type Institution } from '../lib/pb'
import { Loading, PageHead, Panel } from '../components/ui'
import { useToast } from '@astryxdesign/core'

const ACCESS_LEVELS = [
  { value: 'full', label: 'Full access', hint: 'Category scope applies; institution sees all its reports.' },
  { value: 'restricted', label: 'Restricted', hint: 'Only the configured category scope is accepted.' },
  { value: 'view-only', label: 'View only', hint: 'Officers can read reports but not change status.' },
]

type Limits = {
  access_level: string
  allowed_categories: string[]
  sla_hours: number
  max_complaints_per_day: number
}

export function AccessControlPage() {
  const toast = useToast()
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [instId, setInstId] = useState('')
  const [limits, setLimits] = useState<Limits | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adminRpc<Institution[]>('getInstitutions')
      .then((list) => {
        const rows = Array.isArray(list) ? list : []
        setInstitutions(rows)
        if (rows.length) setInstId((cur) => cur || rows[0].id)
      })
      .catch(() => setInstitutions([]))
    pb.collection('categories')
      .getFullList<Category>({ filter: 'active = true', sort: 'name' })
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  const load = useCallback(() => {
    if (!instId) return
    setLimits(null)
    adminRpc<Limits & { ok?: boolean }>('getAccessLimits', { p_institution_id: instId })
      .then((res) => setLimits(res))
      .catch(() => setLimits(null))
  }, [instId])

  useEffect(load, [load])

  const toggleCategory = (id: string) => {
    setLimits((prev) =>
      prev
        ? {
            ...prev,
            allowed_categories: prev.allowed_categories.includes(id)
              ? prev.allowed_categories.filter((x) => x !== id)
              : [...prev.allowed_categories, id],
          }
        : prev,
    )
  }

  const save = async () => {
    if (!limits || !instId) return
    setBusy(true)
    try {
      const results = await Promise.all([
        adminRpc<{ ok?: boolean; error?: string }>('setAccessLevel', { p_institution_id: instId, p_level: limits.access_level }),
        adminRpc<{ ok?: boolean; error?: string }>('setAllowedCategories', { p_institution_id: instId, p_categories: limits.allowed_categories }),
        adminRpc<{ ok?: boolean; error?: string }>('setSlaHours', { p_institution_id: instId, p_hours: limits.sla_hours }),
        adminRpc<{ ok?: boolean; error?: string }>('setRateLimit', { p_institution_id: instId, p_max: limits.max_complaints_per_day }),
      ])
      const failed = results.find((r) => r.error)
      if (failed) {
        toast({ body: failed.error || 'One of the updates failed.', type: 'error' })
      } else {
        toast({ body: 'Access settings saved', type: 'success' })
        load()
      }
    } catch (err: any) {
      toast({ body: err?.message || 'Request failed.', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <PageHead title="Access control" subtitle="Who can report to each institution, and how fast it must respond" />
      <div className="filter-row">
        <div className="detail-cell" style={{ minWidth: 300 }}>
          <span className="detail-label">Institution</span>
          <select className="select" value={instId} onChange={(e) => setInstId(e.target.value)}>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!instId ? (
        <EmptyState title="No institutions yet" description="Create an institution first." />
      ) : !limits ? (
        <Loading label="Loading limits…" />
      ) : (
        <div className="two-col">
          <Panel title="Access level">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACCESS_LEVELS.map((l) => (
                <label key={l.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="access_level"
                    checked={limits.access_level === l.value}
                    onChange={() => setLimits({ ...limits, access_level: l.value })}
                    style={{ marginTop: 3, accentColor: 'var(--astryx-color-accent, #4a7c59)' }}
                  />
                  <span>
                    <Text size="sm" weight="semibold">{l.label}</Text>
                    <br />
                    <Text size="xs" color="secondary">{l.hint}</Text>
                  </span>
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Responsiveness">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="detail-cell">
                <span className="detail-label">SLA hours — first response target</span>
                <TextInput
                  label="SLA hours"
                  isLabelHidden
                  type="number"
                  min={1}
                  value={String(limits.sla_hours)}
                  onChange={(v) => setLimits({ ...limits, sla_hours: Math.max(1, Math.round(Number(v) || 1)) })}
                />
              </div>
              <div className="detail-cell">
                <span className="detail-label">Max complaints per day (rate limit)</span>
                <TextInput
                  label="Max complaints per day"
                  isLabelHidden
                  type="number"
                  min={1}
                  value={String(limits.max_complaints_per_day)}
                  onChange={(v) => setLimits({ ...limits, max_complaints_per_day: Math.max(1, Math.round(Number(v) || 1)) })}
                />
              </div>
              <Heading level={5}>Category scope</Heading>
              <Text size="xs" color="secondary">Reports outside the selected categories cannot be filed to this institution.</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflow: 'auto' }}>
                {categories.length === 0 ? (
                  <Text size="sm" color="secondary">No categories available.</Text>
                ) : (
                  categories.map((c) => (
                    <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={limits.allowed_categories.includes(c.id)}
                        onChange={() => toggleCategory(c.id)}
                        style={{ accentColor: 'var(--astryx-color-accent, #4a7c59)' }}
                      />
                      {c.name}
                    </label>
                  ))
                )}
              </div>
            </div>
          </Panel>
        </div>
      )}

      {limits ? (
        <Button label="Save changes" variant="primary" icon={<Save size={16} />} isLoading={busy} onClick={() => void save()} />
      ) : null}
    </div>
  )
}
