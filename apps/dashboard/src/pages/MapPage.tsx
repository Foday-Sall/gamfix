// Live complaint map (OpenStreetMap tiles). Data from /api/gamfix/staff/map,
// scoped server-side: officers see only their institution, admins see all.

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Spinner } from '@astryxdesign/core'
import { gamfixPost, type MapResponse, type Session } from '../lib/pb'
import { statusMeta } from '../lib/meta'
import { PageHead, Panel } from '../components/ui'

const GAMBIT: L.LatLngBoundsExpression = [
  [12.95, -17.1],
  [13.9, -13.5],
]

export function MapPage({ session }: { session: Session }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [info, setInfo] = useState<{ total: number; shown: number; truncated: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return
    const map = L.map(hostRef.current, { scrollWheelZoom: true })
    map.fitBounds(GAMBIT)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    const load = async () => {
      const b = map.getBounds()
      setLoading(true)
      try {
        const res = await gamfixPost<MapResponse>('/api/gamfix/staff/map', {
          p_west: b.getWest(),
          p_south: b.getSouth(),
          p_east: b.getEast(),
          p_north: b.getNorth(),
        })
        if (!res.ok) {
          setError(res.error || 'Map request failed.')
          return
        }
        setError(null)
        setInfo({ total: res.total, shown: res.returned, truncated: res.truncated })
        const layer = layerRef.current!
        layer.clearLayers()
        for (const c of res.complaints) {
          const color = statusMeta(c.status).color
          const marker = L.circleMarker([c.lat, c.lng], {
            radius: 6,
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.75,
          })
          marker.bindPopup(
            `<strong>${escapeHtml(c.tracking_no)}</strong><br/>${escapeHtml(c.title)}<br/>` +
              `<span style="color:${color}">${escapeHtml(statusMeta(c.status).label)}</span>` +
              (c.category ? `<br/><em>${escapeHtml(c.category)}</em>` : ''),
          )
          marker.addTo(layer)
        }
      } catch {
        setError('Could not load map complaints.')
      } finally {
        setLoading(false)
      }
    }

    let timer: number | undefined
    const debounced = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void load(), 350)
    }
    map.on('moveend', debounced)
    void load()
    return () => {
      window.clearTimeout(timer)
      map.remove()
      mapRef.current = null
    }
  }, [])

  const legend = Object.keys(statusMeta)

  return (
    <div className="page">
      <PageHead
        title="Map"
        subtitle={
          session?.role === 'officer'
            ? `Complaints for ${session.institution.name} in the current map view`
            : 'All non-sensitive complaints in the current map view'
        }
      />
      <Panel title={info ? `${info.shown} shown / ${info.total} in view${info.truncated ? ' (truncated)' : ''}` : 'Loading map…'}>
        {error ? <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div> : null}
        <div style={{ position: 'relative' }}>
          <div ref={hostRef} style={{ height: 460, borderRadius: 12, zIndex: 0 }} />
          {loading ? (
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'rgba(255,255,255,0.92)',
                borderRadius: 8,
                padding: '6px 10px',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                zIndex: 500,
              }}
            >
              <Spinner label="Loading complaints" size="sm" />
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          {legend.map((s) => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusMeta(s).color }} />
              {statusMeta(s).label}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}
