// WhatsApp device manager: link sender numbers through the GOWA gateway,
// assign the OTP role, revoke or delete devices.

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Dialog, DialogHeader, EmptyState, Text, TextInput } from '@astryxdesign/core'
import { Link2, RefreshCw, Trash2, Unplug } from 'lucide-react'
import { whatsappRpc, type Session } from '../lib/pb'
import { formatDate } from '../lib/meta'
import { Loading, PageHead, Panel } from '../components/ui'
import { useToast } from '@astryxdesign/core'

type NumberRow = {
  id: string
  number: string
  role: 'otp' | 'chat' | string
  status: string
  gowaInstance: string | null
  gowaState: string | null
  linkedAt: string | null
  revokedAt: string | null
  createdAt: string | null
}

export function WhatsAppPage({ session }: { session: Session }) {
  const toast = useToast()
  const [rows, setRows] = useState<NumberRow[] | null>(null)
  const [sender, setSender] = useState<{ sender: string | null; source: string } | null>(null)
  const [linking, setLinking] = useState(false)
  const [pairing, setPairing] = useState<{ phone: string; code: string; role: string } | null>(null)

  const load = useCallback(() => {
    whatsappRpc<{ numbers: NumberRow[] }>('list_numbers')
      .then((res) => setRows(res.data?.numbers || []))
      .catch(() => setRows([]))
    whatsappRpc<{ sender: string | null; source: string }>('get_sender')
      .then((res) => setSender(res.data || null))
      .catch(() => setSender(null))
  }, [])

  useEffect(load, [load])

  if (session?.role !== 'admin') {
    return (
      <div className="page">
        <PageHead title="WhatsApp devices" />
        <EmptyState title="Admin only" description="Only the platform administrator manages WhatsApp devices." />
      </div>
    )
  }

  const confirmLink = async (phone: string) => {
    try {
      const res = await whatsappRpc<{ number: string; status: string; loggedIn: boolean; gowaState?: string }>('confirm_link', { phone })
      if (res.data.loggedIn) {
        toast({ body: `${phone} is now linked`, type: 'success' })
      } else {
        toast({ body: `${phone}: not yet confirmed (state: ${res.data.gowaState || 'unknown'}). Enter the pairing code on the phone first.`, type: 'warning' })
      }
      load()
    } catch (err: any) {
      toast({ body: err?.message || 'Could not check device status.', type: 'error' })
    }
  }

  const setRole = async (phone: string, role: string) => {
    try {
      await whatsappRpc('set_role', { phone, role })
      toast({ body: `${phone} role set to ${role}`, type: 'success' })
      load()
    } catch (err: any) {
      toast({ body: err?.message || 'Could not set role.', type: 'error' })
    }
  }

  const revoke = async (phone: string) => {
    try {
      await whatsappRpc('revoke', { phone })
      toast({ body: `${phone} revoked`, type: 'success' })
      load()
    } catch (err: any) {
      toast({ body: err?.message || 'Could not revoke.', type: 'error' })
    }
  }

  const remove = async (phone: string) => {
    try {
      await whatsappRpc('delete_number', { phone })
      toast({ body: `${phone} deleted`, type: 'success' })
      load()
    } catch (err: any) {
      toast({ body: err?.message || 'Could not delete.', type: 'error' })
    }
  }

  const statusVariant = (status: string) =>
    status === 'linked' ? 'success' : status === 'pending' ? 'warning' : status === 'revoked' ? 'error' : 'neutral'

  return (
    <div className="page">
      <PageHead
        title="WhatsApp devices"
        subtitle="Sender numbers linked through the GOWA gateway"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button label="Refresh" variant="ghost" icon={<RefreshCw size={15} />} onClick={load} />
            <Button label="Link a number" variant="primary" icon={<Link2 size={16} />} onClick={() => setLinking(true)} />
          </div>
        }
      />
      {sender ? (
        <Panel title="Effective OTP sender">
          {sender.sender ? (
            <Text size="sm">
              <strong>{sender.sender}</strong> <Badge variant="green" label={sender.source} />
            </Text>
          ) : (
            <Text size="sm" color="secondary">No linked OTP sender. Link a number and set its role to “otp”.</Text>
          )}
        </Panel>
      ) : null}

      {!rows ? (
        <Loading label="Loading devices…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No WhatsApp numbers registered" description="Link the first sender number to start sending OTPs and notifications." />
      ) : (
        <Panel title={`${rows.length} numbers`}>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Role</th>
                <th>Status</th>
                <th>Device state</th>
                <th>Linked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td className="mono">+{r.number}</td>
                  <td>
                    <select className="select" value={r.role} onChange={(e) => void setRole(r.number, e.target.value)} aria-label="Role">
                      <option value="chat">chat</option>
                      <option value="otp">otp</option>
                    </select>
                  </td>
                  <td><Badge variant={statusVariant(r.status) as 'neutral'} label={r.status} /></td>
                  <td>{r.gowaState || r.gowaInstance || '—'}</td>
                  <td>{formatDate(r.linkedAt || r.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {r.status === 'pending' ? (
                        <Button label="Confirm" size="sm" variant="secondary" onClick={() => void confirmLink(r.number)} />
                      ) : null}
                      {r.status === 'linked' ? (
                        <Button label="Revoke" size="sm" variant="secondary" icon={<Unplug size={14} />} onClick={() => void revoke(r.number)} />
                      ) : null}
                      <Button label="Delete" size="sm" variant="destructive" icon={<Trash2 size={14} />} onClick={() => void remove(r.number)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {linking ? (
        <LinkDialog
          onClose={() => setLinking(false)}
          onLinked={(phone, code, role) => {
            setLinking(false)
            setPairing({ phone, code, role })
            load()
          }}
        />
      ) : null}

      {pairing ? (
        <Dialog isOpen onOpenChange={(open) => { if (!open) setPairing(null) }} width={440}>
          <DialogHeader title="Enter the pairing code" subtitle={`On the phone with number +${pairing.phone}`} onOpenChange={(open) => { if (!open) setPairing(null) }} />
          <div style={{ padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text size="sm" color="secondary">
              Open WhatsApp → Settings → Linked devices → Link with phone number, then enter:
            </Text>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 6, textAlign: 'center', fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {pairing.code}
            </div>
            <Button label="I entered the code — check status" variant="primary" onClick={() => { setPairing(null); void confirmLink(pairing.phone) }} />
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

function LinkDialog({ onClose, onLinked }: { onClose: () => void; onLinked: (phone: string, code: string, role: string) => void }) {
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('otp')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await whatsappRpc<{ number: string; pairingCode: string; role: string }>('start_link', {
        phone: phone.replace(/[^0-9]/g, ''),
        role,
      })
      if (res.data?.pairingCode) {
        onLinked(res.data.number, res.data.pairingCode, res.data.role)
      } else {
        toast({ body: 'No pairing code returned — is the GOWA gateway up?', type: 'error' })
      }
    } catch (err: any) {
      toast({ body: err?.message || 'Could not start linking.', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog isOpen onOpenChange={(open) => { if (!open) onClose() }} width={440}>
      <DialogHeader title="Link a WhatsApp number" subtitle="A pairing code is generated for the phone number" onOpenChange={(open) => { if (!open) onClose() }} />
      <div style={{ padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextInput label="Phone number (international format)" value={phone} onChange={setPhone} placeholder="e.g. 2207XXXXXX" isRequired />
        <div className="detail-cell">
          <span className="detail-label">Role</span>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="otp">otp — sends login codes</option>
            <option value="chat">chat — citizen support line</option>
          </select>
        </div>
        <Button label="Generate pairing code" variant="primary" isLoading={busy} isDisabled={phone.replace(/[^0-9]/g, '').length < 8} onClick={() => void submit()} />
      </div>
    </Dialog>
  )
}
