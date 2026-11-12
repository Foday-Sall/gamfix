// Dashboard settings: the admin_settings 'dashboard' JSON document.

import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, Heading, Text, TextArea } from '@astryxdesign/core'
import { Save } from 'lucide-react'
import { adminRpc } from '../lib/pb'
import { Loading, PageHead, Panel } from '../components/ui'
import { useToast } from '@astryxdesign/core'

export function SettingsPage() {
  const toast = useToast()
  const [raw, setRaw] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    adminRpc<Record<string, unknown>>('getSettings')
      .then((value) => setRaw(JSON.stringify(value ?? {}, null, 2)))
      .catch(() => setRaw('{}'))
  }, [])

  useEffect(load, [load])

  const save = async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw || '{}')
    } catch {
      toast({ body: 'Not valid JSON — fix the syntax first.', type: 'error' })
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast({ body: 'Settings must be a JSON object.', type: 'error' })
      return
    }
    setBusy(true)
    try {
      const res = await adminRpc<{ ok: boolean; error?: string }>('saveSettings', { p_settings: parsed })
      if (res.ok) toast({ body: 'Settings saved', type: 'success' })
      else toast({ body: res.error || 'Could not save settings.', type: 'error' })
    } catch (err: any) {
      toast({ body: err?.message || 'Request failed.', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (raw === null) {
    return (
      <div className="page">
        <PageHead title="Settings" />
        <Loading label="Loading settings…" />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHead title="Settings" subtitle="Dashboard configuration stored as a JSON document" />
      {!raw ? <EmptyState title="Settings unavailable" /> : null}
      <Panel title="Dashboard settings (JSON)">
        <TextArea
          label="Settings JSON"
          isLabelHidden
          value={raw}
          onChange={setRaw}
          rows={16}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button label="Save settings" variant="primary" icon={<Save size={16} />} isLoading={busy} onClick={() => void save()} />
          <Button label="Revert" variant="ghost" onClick={load} />
        </div>
        <div style={{ marginTop: 14 }}>
          <Heading level={5}>Notes</Heading>
          <Text size="xs" color="secondary">
            Keys are consumed by the backend (e.g. whatsapp_sender fallback) and by the old dist snapshot pages. Every save is recorded in the audit log.
          </Text>
        </div>
      </Panel>
    </div>
  )
}
