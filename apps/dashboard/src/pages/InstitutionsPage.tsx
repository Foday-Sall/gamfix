// Institutions admin: list with logo avatars + create dialog.

import { useCallback, useEffect, useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogHeader,
  EmptyState,
  Heading,
  Text,
  TextArea,
  TextInput,
} from '@astryxdesign/core'
import { Building2, Plus } from 'lucide-react'
import { adminAction, type Institution } from '../lib/pb'
import { Loading, PageHead, Panel } from '../components/ui'
import { useToast } from '@astryxdesign/core'

export function InstitutionsPage() {
  const toast = useToast()
  const [rows, setRows] = useState<Institution[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [shortcode, setShortcode] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    adminAction<Institution[]>('getInstitutions')
      .then((list) => setRows(Array.isArray(list) ? list : []))
      .catch(() => setRows([]))
  }, [])

  useEffect(load, [load])

  const create = async () => {
    setBusy(true)
    try {
      const res = await adminAction<{ ok: boolean; error?: string }>('createInstitution', {
        p_name: name.trim(),
        p_shortcode: shortcode.trim(),
        p_contact_email: email.trim(),
        p_phone: phone.trim(),
        p_category_scope: [],
      })
      if (res.ok) {
        toast({ body: 'Institution created', type: 'success' })
        setCreating(false)
        setName('')
        setShortcode('')
        setEmail('')
        setPhone('')
        load()
      } else {
        toast({ body: res.error === 'shortcode_taken' ? 'That shortcode is already used.' : 'Could not create institution.', type: 'error' })
      }
    } catch (err: any) {
      toast({ body: err?.message || 'Request failed.', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <PageHead
        title="Institutions"
        subtitle="Government services handling citizen reports"
        actions={
          <Button label="New institution" variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)} />
        }
      />
      {!rows ? (
        <Loading label="Loading institutions…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No institutions yet" description="Create the first institution to start routing reports." />
      ) : (
        <Panel title={`${rows.length} institutions`}>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Code</th>
                <th>Status</th>
                <th>Access</th>
                <th>Open</th>
                <th>Officers</th>
                <th>SLA</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={r.name.charAt(0)} src={r.logo_url || undefined} size="sm" />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>{r.contact?.email || '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{r.code}</td>
                  <td>
                    <Badge variant={r.status === 'active' ? 'success' : 'neutral'} label={r.status} />
                  </td>
                  <td>
                    <Badge
                      variant={r.access_level === 'full' ? 'green' : r.access_level === 'view-only' ? 'neutral' : 'warning'}
                      label={r.access_level}
                    />
                  </td>
                  <td>{r.open_complaints}</td>
                  <td>{r.officer_count}</td>
                  <td>{r.sla_hours} h</td>
                  <td>{r.contact?.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {creating ? (
        <Dialog isOpen onOpenChange={(open) => { if (!open) setCreating(false) }} width={480}>
          <DialogHeader title="New institution" subtitle="Reports are routed to institutions by category scope" onOpenChange={(open) => { if (!open) setCreating(false) }} />
          <div style={{ padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextInput label="Name" value={name} onChange={setName} placeholder="e.g. National Water and Electricity Company" isRequired />
            <TextInput label="Shortcode" value={shortcode} onChange={(v) => setShortcode(v.toUpperCase())} placeholder="e.g. NAWEC" isRequired />
            <TextInput label="Contact email" type="email" value={email} onChange={setEmail} placeholder="ops@institution.gov.sl" />
            <TextInput label="Contact phone" value={phone} onChange={setPhone} placeholder="+220 …" />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button label="Create institution" variant="primary" icon={<Building2 size={16} />} isLoading={busy} isDisabled={!name.trim() || !shortcode.trim()} onClick={() => void create()} />
              <Button label="Cancel" variant="ghost" onClick={() => setCreating(false)} />
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
