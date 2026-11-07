import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Zone = { id: string, name: string, latitude: number, longitude: number, radius_km: number, base_fare: number, per_km: number, active: boolean }

const DEFAULT_ZONES: Zone[] = [
  { id: 'polokwane', name: 'Polokwane CBD', latitude: -23.9045, longitude: 29.4689, radius_km: 15, base_fare: 15, per_km: 7, active: true },
  { id: 'seshego', name: 'Seshego', latitude: -23.8833, longitude: 29.3833, radius_km: 10, base_fare: 15, per_km: 7, active: true },
  { id: 'mankweng', name: 'Mankweng / Turfloop', latitude: -23.8833, longitude: 29.7167, radius_km: 12, base_fare: 20, per_km: 7, active: true },
  { id: 'lebowakgomo', name: 'Lebowakgomo', latitude: -24.2167, longitude: 29.5667, radius_km: 10, base_fare: 25, per_km: 8, active: false },
]

export function AdminZones({ onBack }: { onBack: () => void }) {
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('service_zones').select('*').order('name')
      if (!error && data && data.length > 0) {
        setZones(data.map((z: any) => ({ id: z.id, name: z.name, latitude: Number(z.latitude), longitude: Number(z.longitude), radius_km: Number(z.radius_km || z.radiusKm || 15), base_fare: Number(z.base_fare || z.baseFare || 15), per_km: Number(z.per_km || z.perKm || 7), active: z.active !== false })))
      }
      setLoading(false)
    }
    void load()
  }, [])

  function update(id: string, field: keyof Zone, value: string | boolean | number) {
    setZones(prev => prev.map(z => z.id === id ? { ...z, [field]: field === 'name' ? String(value) : field === 'active' ? Boolean(value) : Number(value) } : z))
  }

  function addZone() {
    setZones(prev => [...prev, { id: `zone-${Date.now()}`, name: 'New Zone', latitude: -23.9045, longitude: 29.4689, radius_km: 10, base_fare: 15, per_km: 7, active: true }])
  }

  function removeZone(id: string) {
    if (!confirm('Delete this zone?')) return
    setZones(prev => prev.filter(z => z.id !== id))
  }

  async function save() {
    setSaving(true); setMessage('')
    const { error } = await supabase.from('service_zones').upsert(zones.map(z => ({ id: z.id, name: z.name, latitude: z.latitude, longitude: z.longitude, radius_km: z.radius_km, base_fare: z.base_fare, per_km: z.per_km, active: z.active })) as any, { onConflict: 'id' })
    if (error) setMessage('Could not save zones: ' + error.message + ' - Run SQL below to create table.')
    else setMessage('Zones saved ✓')
    setSaving(false)
  }

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>Service Zones ({zones.filter(z => z.active).length} active)</h1>
    <p style={{ fontSize: 13, color: '#94a3b8' }}>Drivers only get ride requests inside an active zone. Radius is from center point.</p>
    {message && <p role={message.startsWith('Could not') ? 'alert' : 'status'} style={{ color: message.startsWith('Could not') ? '#fca5a5' : '#86efac' }}>{message}</p>}
    {loading ? <p>Loading zones...</p> : zones.map(zone => (
      <section key={zone.id} style={{ background: zone.active ? '#1e293b' : '#0f172a', border: zone.active ? 'none' : '1px dashed #475569', padding:'16px', borderRadius:'12px', marginTop:'12px'}}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <input value={zone.name} onChange={e => update(zone.id, 'name', e.target.value)} style={{ background: 'transparent', color: 'white', border: 0, borderBottom: '1px solid #475569', fontSize: 18, fontWeight: 800, width: '70%' }} />
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={zone.active} onChange={e => update(zone.id, 'active', e.target.checked)} /> Active</label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 12 }}>
          {([
            ['latitude','Latitude'],
            ['longitude','Longitude'],
            ['radius_km','Radius (km)'],
            ['base_fare','Base fare (R)'],
            ['per_km','Per km (R)'],
          ] as const).map(([field, label]) => (
            <label key={field} style={{ fontSize: 12, color: '#94a3b8' }}>{label}
              <input type="number" step="0.0001" value={zone[field]} onChange={e => update(zone.id, field, e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 4, borderRadius: 8, border: 0, background: '#0f172a', color: 'white' }} />
            </label>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Covers ~{Math.round(Math.PI * zone.radius_km * zone.radius_km)} km² • Example {zone.radius_km}km ride ≈ R{(zone.base_fare + zone.per_km * zone.radius_km).toFixed(2)}</p>
        <button onClick={() => removeZone(zone.id)} style={{ padding: '6px 12px', borderRadius: 8, background: '#7f1d1d', color: 'white', border: 0, cursor: 'pointer' }}>Delete Zone</button>
      </section>
    ))}
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      <button onClick={addZone} style={{ padding: '12px 18px', borderRadius: 10, background: '#0ea5e9', color: 'white', fontWeight: 800, border: 0, cursor: 'pointer' }}>+ Add Zone</button>
      <button disabled={saving} onClick={() => save()} style={{ padding: '12px 18px', borderRadius: 10, background: '#22c55e', color: 'black', fontWeight: 800, border: 0, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Zones'}</button>
    </div>
  </main>
}