import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const MIN_KM = 2
const MAX_KM = 5

export function DriverPickupDistance({ driverId }: { driverId: string }) {
  const [distance, setDistance] = useState(2)
  const [autoAccept, setAutoAccept] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('profiles').select('search_radius_km,auto_accept_enabled').eq('id', driverId).single()
      if (data) {
        const v = Number((data as any).search_radius_km ?? 2)
        if (v >= MIN_KM && v <= MAX_KM) setDistance(v)
        setAutoAccept((data as any).auto_accept_enabled ?? true)
      }
    }
    if (driverId) void load()
  }, [driverId])

  async function save(newDist: number, newAuto: boolean) {
    setSaving(true)
    const clamped = Math.min(MAX_KM, Math.max(MIN_KM, newDist))
    const { error } = await supabase.from('profiles').update({
      search_radius_km: clamped,
      auto_accept_enabled: newAuto,
    } as any).eq('id', driverId)
    setSaving(false)
    if (!error) {
      setDistance(clamped)
      setAutoAccept(newAuto)
    }
  }

  const pct = ((distance - MIN_KM) / (MAX_KM - MIN_KM)) * 100

  return (
    <div style={{ background: '#111111', borderRadius: 24, padding: 20, color: 'white', maxWidth: 380 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 20 }}>Maximum pickup distance</span>
        <button
          onClick={() => void save(distance, !autoAccept)}
          style={{
            width: 52, height: 32, borderRadius: 999, border: 0,
            background: autoAccept ? '#1a3d2a' : '#2a2a2a',
            position: 'relative', cursor: 'pointer', transition: '0.2s'
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: autoAccept ? '#6ef0a0' : '#666',
            position: 'absolute', top: 2,
            left: autoAccept ? 22 : 2,
            transition: '0.2s'
          }} />
        </button>
      </div>

      <div style={{ color: '#8a8a8a', fontSize: 18, marginTop: 24, lineHeight: 1.4 }}>
        Rides within this distance will be<br />automatically accepted
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginTop: 28 }}>
        <button
          onClick={() => distance > MIN_KM && void save(distance - 1, autoAccept)}
          disabled={distance <= MIN_KM}
          style={{ width: 64, height: 64, borderRadius: '50%', border: 0, background: '#242424', color: 'white', fontSize: 32, cursor: 'pointer', opacity: distance <= MIN_KM ? 0.4 : 1 }}
        >
          —
        </button>
        <div style={{ textAlign: 'center', minWidth: 80 }}>
          <div style={{ fontSize: 56, fontWeight: 800 }}>{distance}</div>
          <div style={{ color: '#8a8a8a', fontSize: 18, marginTop: -4 }}>km</div>
        </div>
        <button
          onClick={() => distance < MAX_KM && void save(distance + 1, autoAccept)}
          disabled={distance >= MAX_KM}
          style={{ width: 64, height: 64, borderRadius: '50%', border: 0, background: '#242424', color: 'white', fontSize: 32, cursor: 'pointer', opacity: distance >= MAX_KM ? 0.4 : 1 }}
        >
          +
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, padding: '0 8px' }}>
        <div style={{ color: '#6ef0a0', fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
          <span style={{ fontSize: 20 }}>{MIN_KM}</span><span style={{ fontSize: 18, marginTop: 4 }}>min</span>
        </div>

        <div style={{ flex: 1, margin: '0 16px', position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%', height: 6, background: '#222', borderRadius: 999, position: 'relative' }}>
            <div style={{ width: `${pct}%`, height: 6, background: '#6ef0a0', borderRadius: 999 }} />
          </div>
          <div style={{
            position: 'absolute',
            left: `calc(${pct}% - 3px)`,
            top: 4,
            width: 6, height: 24, background: '#6ef0a0', borderRadius: 999
          }} />
          <div style={{
            position: 'absolute',
            left: `calc(${pct}% - 10px)`,
            bottom: -2,
            width: 0, height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderBottom: '12px solid #6ef0a0',
            transform: 'rotate(180deg)'
          }} />
        </div>

        <div style={{ color: '#8a8a8a', fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
          <span style={{ fontSize: 20 }}>{MAX_KM}</span><span style={{ fontSize: 18, marginTop: 4 }}>max</span>
        </div>
      </div>

      {saving && <div style={{ fontSize: 11, color: '#6ef0a0', marginTop: 12, textAlign: 'center' }}>Saving...</div>}
    </div>
  )
}