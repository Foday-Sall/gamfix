// Officer accounts admin: directory with active toggles, create dialog that
// surfaces the one-time temporary password.

import { useCallback, useEffect, useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogHeader,
  EmptyState,
  Switch,
  Text,
  TextInput,
} from '@astryxdesign/core'
import { Copy, UserPlus } from 'lucide-react'
import { adminAction, type Institution, type Officer } from '../lib/pb'
import { formatDate } from '../lib/meta'
import { Loading, PageHead, Panel } from '../components/ui'
import { useToast } from '@astryxdesign/core'

export function AccountsPage() {
  const toast = useToast()
  const [rows, setRows] = useState<Officer[] | null>(null)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [creating, setCreating] = useState(false)
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null)

  const load = useCallback(() => {
    adminAction<Officer[]>('getOfficers')
      .then((list) => setRows(Array.isArray(list) ? list : []))
      .catch(() => setRows([]))
    adminAction<Institution[]>('getInstitutions')
      .then((list) => setInstitutions(Array.isArray(list) ? list : []))
      .catch(() => setInstitutions([]))
  }, [])

  useEffect(load, [load])

  const toggle = async (officer: Officer, next: boolean) => {
    setRows((prev) => prev && prev.map((o) => (o.id === officer.id ? { ...o, is_active: next } : o)))
    try {
      await adminAction('toggleOfficerActive', { p_officer_id: officer.id, p_active: next })
      toast({ body: `${officer.name} ${next ? 'reactivated' : 'deactivated'}`, type: 'success' })
    } catch {
      toast({ body: 'Could not update the officer.', type: 'error' })
      load()
    }
  }

  return (
    <div className="page">
      <PageHead
        title="Accounts"
        subtitle="Institution officers with console access"
        actions={<Button label="Invite officer" variant="primary" icon={<UserPlus size={16} />} onClick={() => setCreating(true)} />}
      />
      {!rows ? (
        <Loading label="Loading accounts…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No officers yet" description="Invite the first officer to an institution." />
      ) : (
        <Panel title={`${rows.length} officers`}>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Officer</th>
                <th>Institution</th>
                <th>Role</th>
                <th>Department</th>
                <th>Active</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={o.name.split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('')} size="sm" />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{o.name}</span>
                        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>{o.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>{o.institution_name || '—'}</td>
                  <td>
                    <Badge variant={o.role === 'institution-admin' ? 'purple' : o.role === 'view-only' ? 'neutral' : 'green'} label={o.role} />
                  </td>
                  <td>{o.department || '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Switch label={o.is_active ? 'Active' : 'Inactive'} isLabelHidden value={o.is_active} onChange={(v: boolean) => void toggle(o, v)} />
                  </td>
                  <td>{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {creating ? (
        <CreateDialog
          institutions={institutions}
          onClose={() => setCreating(false)}
          onCreated={(email, password) => {
            setCreating(false)
            setTempPassword({ email, password })
            load()
          }}
        />
      ) : null}

      {tempPassword ? (
        <Dialog isOpen onOpenChange={(open) => { if (!open) setTempPassword(null) }} width={460}>
          <DialogHeader title="Officer invited" subtitle="Share this one-time password securely" onOpenChange={(open) => { if (!open) setTempPassword(null) }} />
          <div style={{ padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text size="sm" color="secondary">This password is shown once and cannot be retrieved later.</Text>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px dashed rgba(0,0,0,0.25)',
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 14,
              }}
            >
              <span>{tempPassword.password}</span>
              <Button
                label="Copy"
                size="sm"
                variant="secondary"
                icon={<Copy size={14} />}
                onClick={() => {
                  navigator.clipboard?.writeText(tempPassword.password)
                  toast({ body: 'Password copied', type: 'success' })
                }}
              />
            </div>
            <Text size="sm">Account: <strong>{tempPassword.email}</strong></Text>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

function CreateDialog({
  institutions,
  onClose,
  onCreated,
}: {
  institutions: Institution[]
  onClose: () => void
  onCreated: (email: string, password: string) => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [instId, setInstId] = useState('')
  const [role, setRole] = useState('officer')
  const [department, setDepartment] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await adminAction<{ ok: boolean; error?: string; officer?: Officer; temporaryPassword?: string }>(
        'createOfficer',
        { p_name: name.trim(), p_email: email.trim(), p_institution_id: instId, p_role: role, p_department: department.trim() },
      )
      if (res.ok && res.temporaryPassword) {
        onCreated(email.trim(), res.temporaryPassword)
        toast({ body: 'Officer account created', type: 'success' })
      } else {
        const messages: Record<string, string> = {
          email_taken: 'That email is already registered.',
          institution_not_found: 'Choose a valid institution.',
          missing_fields: 'Fill in name, email and institution.',
        }
        toast({ body: messages[res.error || ''] || 'Could not create the officer.', type: 'error' })
      }
    } catch (err: any) {
      toast({ body: err?.message || 'Request failed.', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog isOpen onOpenChange={(open) => { if (!open) onClose() }} width={480}>
      <DialogHeader title="Invite officer" subtitle="Creates the login and the officers directory entry" onOpenChange={(open) => { if (!open) onClose() }} />
      <div style={{ padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextInput label="Full name" value={name} onChange={setName} placeholder="e.g. Fatou Ceesay" isRequired />
        <TextInput label="Work email" type="email" value={email} onChange={setEmail} placeholder="officer@institution.gov.sl" isRequired />
        <div className="detail-grid">
          <div className="detail-cell">
            <span className="detail-label">Institution</span>
            <select className="select" value={instId} onChange={(e) => setInstId(e.target.value)}>
              <option value="">Choose…</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div className="detail-cell">
            <span className="detail-label">Role</span>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="officer">Officer</option>
              <option value="institution-admin">Institution admin</option>
              <option value="view-only">View only</option>
            </select>
          </div>
        </div>
        <TextInput label="Department" value={department} onChange={setDepartment} placeholder="e.g. Water Operations" />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button label="Create account" variant="primary" isLoading={busy} isDisabled={!name.trim() || !email.trim() || !instId} onClick={() => void submit()} />
          <Button label="Cancel" variant="ghost" onClick={onClose} />
        </div>
      </div>
    </Dialog>
  )
}
