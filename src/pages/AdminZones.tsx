import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Zone = { id: string, name: string, latitude: number, longitude: number, radius_km: number, base_fare: number, per_km: number, active: boolean }

// FIX: Defaults must be real UUIDs - 'polokwane' string IDs crash UUID column on first Save
const DEFAULT_ZONES: Zone[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Polokwane CBD', latitude: -23.9045, longitude: 29.4689, radius_km: 15, base_fare: 15, per_km: 7, active: true },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Seshego', latitude: -23.8833, longitude: 29.3833, radius_km: 10, base_fare: 15, per_km: 7, active: true },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Mankweng / Turfloop', latitude: -23.8833, longitude: 29.7167, radius_km: 12, base_fare: 20, per_km: 7, active: true },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Lebowakgomo', latitude: -24.2167, longitude: 29.5667, radius_km: 10, base_fare: 25, per_km: 8, active: false },
]

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}
function newUuid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0')}`
}

export function AdminZones({ onBack }: { onBack: () => void }) {
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // FIX: Track deletions so save() can actually delete from DB
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [loadedFromDb, setLoadedFromDb] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('service_zones').select('*').order('name')
      if (!error && data && data.length > 0) {
        setZones(data.map((z: any) => ({ id: z.id, name: z.name, latitude: Number(z.latitude), longitude: Number(z.longitude), radius_km: Number(z.radius_km ?? z.radiusKm ?? 15), base_fare: Number(z.base_fare ?? z.baseFare ?? 15), per_km: Number(z.per_km ?? z.perKm ?? 7), active: z.active !== false })))
        setLoadedFromDb(true)
      }
      setLoading(false)
    }
    void load()
  }, [])

  function update(id: string, field: keyof Zone, value: string | boolean | number) {
    setZones(prev => prev.map(z => z.id === id ? { ...z, [field]: field === 'name' ? String(value) : field === 'active' ? Boolean(value) : (value === '' ? 0 : Number(value)) } : z))
  }

  function addZone() {
    const newId = newUuid()
    setZones(prev => [...prev, { id: newId, name: 'New Zone', latitude: -23.9045, longitude: 29.4689, radius_km: 10, base_fare: 15, per_km: 7, active: true }])
  }

  function removeZone(id: string) {
    if (!confirm('Delete this zone? This will remove it after you press Save Zones.')) return
    setZones(prev => prev.filter(z => z.id !== id))
    // FIX: Remember it so save() deletes from DB. Only if it came from DB / defaults that were saved - safe to delete by id, if it never existed delete is no-op.
    setDeletedIds(prev => prev.includes(id) ? prev : [...prev, id])
  }

  async function save() {
    setSaving(true); setMessage('')
    // FIX: Validate - old code saved lat 999, radius -5, NaN without warning
    const invalid = zones.find(z =>
      !z.name.trim() ||
      [z.latitude, z.longitude, z.radius_km, z.base_fare, z.per_km].some(v => Number.isNaN(v)) ||
      z.latitude < -90 || z.latitude > 90 ||
      z.longitude < -180 || z.longitude > 180 ||
      z.radius_km <= 0 || z.radius_km > 100 ||
      z.base_fare < 0 || z.per_km < 0
    )
    if (invalid) {
      setMessage(`Check ${invalid.name || 'a zone'}: Name required, lat -90 to 90, lng -180 to 180, radius 0-100km, fares 0+.`)
      setSaving(false)
      return
    }
    // FIX: Auto-convert any old string IDs ('polokwane') to UUIDs before upsert, so first Save never crashes
    const zonesToSave = zones.map(z => isUuid(z.id) ? z : { ...z, id: newUuid() })
    const idMap = new Map(zones.map((z, i) => [z.id, zonesToSave[i].id]))
    // If any IDs were converted, update state so deletes / future saves use new IDs
    if (zonesToSave.some((z, i) => z.id !== zones[i].id)) {
      setZones(zonesToSave)
      setDeletedIds(prev => prev.map(id => idMap.get(id) || id))
    }
    const { error } = await supabase.from('service_zones').upsert(zonesToSave.map(z => ({ id: z.id, name: z.name.trim(), latitude: z.latitude, longitude: z.longitude, radius_km: z.radius_km, base_fare: z.base_fare, per_km: z.per_km, active: z.active })) as any, { onConflict: 'id' })
    if (error) {
      setMessage('Could not save zones: ' + error.message + ' - Run SQL below to create table.')
      setSaving(false)
      return
    }
    // FIX: Actually delete removed zones
    if (deletedIds.length) {
      const mappedDeleted = deletedIds.map(id => idMap.get(id) || id)
      const { error: deleteError } = await supabase.from('service_zones').delete().in('id', mappedDeleted)
      if (deleteError) {
        setMessage('Zones saved, but deleted zones could not be removed: ' + deleteError.message)
        setSaving(false)
        return
      }
      setDeletedIds([])
    }
    setLoadedFromDb(true)
    setMessage('Zones saved ✓')
    setSaving(false)
  }

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>Service Zones ({zones.filter(z => z.active).length} active)</h1>
    <p style={{ fontSize: 13, color: '#94a3b8' }}>Drivers only get ride requests inside an active zone. Radius is from center point.</p>
    {!loadedFromDb && !loading && <p style={{ fontSize: 12, color: '#f59e0b' }}>Showing default zones - press Save Zones to save them to the database.</p>}
    {message && <p role={message.startsWith('Could not') || message.startsWith('Check') ? 'alert' : 'status'} style={{ color: (message.startsWith('Could not') || message.startsWith('Check')) ? '#fca5a5' : '#86efac' }}>{message}</p>}
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
              <input type="number" step="0.0001" value={Number.isNaN(zone[field]) ? '' : zone[field]} onChange={e => update(zone.id, field, e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 4, borderRadius: 8, border: 0, background: '#0f172a', color: 'white' }} />
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