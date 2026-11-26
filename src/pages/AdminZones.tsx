import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Zone = { id: string, name: string, latitude: number, longitude: number, radius_km: number, is_active: boolean, _isNew?: boolean }

// FIX: IDs are slugs - same as DriverHome fallback, same as what rider matching uses
const DEFAULT_ZONES: Zone[] = [
  { id: 'polokwane', name: 'Polokwane CBD', latitude: -23.9045, longitude: 29.4689, radius_km: 15, is_active: true, _isNew: true },
  { id: 'seshego', name: 'Seshego', latitude: -23.8833, longitude: 29.3833, radius_km: 10, is_active: true, _isNew: true },
  { id: 'mankweng', name: 'Mankweng', latitude: -23.8833, longitude: 29.7167, radius_km: 12, is_active: true, _isNew: true },
  { id: 'lebowakgomo', name: 'Lebowakgomo', latitude: -24.2167, longitude: 29.5667, radius_km: 10, is_active: false, _isNew: true },
  { id: 'tzaneen', name: 'Tzaneen', latitude: -23.8333, longitude: 30.1667, radius_km: 12, is_active: true, _isNew: true },
  { id: 'giyani', name: 'Giyani', latitude: -23.3167, longitude: 30.6833, radius_km: 10, is_active: true, _isNew: true },
  { id: 'thohoyandou', name: 'Thohoyandou', latitude: -22.95, longitude: 30.45, radius_km: 12, is_active: true, _isNew: true },
  { id: 'makhado', name: 'Makhado', latitude: -23.1667, longitude: 29.9, radius_km: 12, is_active: true, _isNew: true },
]

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `zone_${Date.now()}`
}

export function AdminZones({ onBack }: { onBack: () => void }) {
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [loadedFromDb, setLoadedFromDb] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('service_zones').select('*').order('name')
      if (!error && data && data.length > 0) {
        const mapped = data.map((z: any) => ({
          id: z.id, name: z.name, latitude: Number(z.latitude ?? -23.9045), longitude: Number(z.longitude ?? 29.4689),
          radius_km: Number(z.radius_km ?? 15),
          is_active: z.is_active !== undefined ? Boolean(z.is_active) : (z.active !== false),
        }))
        setZones(mapped); setLoadedFromDb(true)
      }
      setLoading(false)
    }
    void load()
  }, [])

  function update(id: string, field: keyof Zone, value: string | boolean | number) {
    setZones(prev => prev.map(z => z.id === id ? { ...z, [field]: field === 'name' ? String(value) : field === 'is_active' ? Boolean(value) : (value === '' ? 0 : Number(value)) } : z))
  }
  function addZone() {
    setZones(prev => [...prev, { id: `new_${Date.now()}`, name: 'New Zone', latitude: -23.9045, longitude: 29.4689, radius_km: 10, is_active: true, _isNew: true }])
  }
  function removeZone(id: string) {
    if (!confirm('Delete this zone? This will remove it after you press Save Zones.')) return
    const target = zones.find(z => z.id === id)
    setZones(prev => prev.filter(z => z.id !== id))
    if (target && !target._isNew) setDeletedIds(prev => prev.includes(id) ? prev : [...prev, id])
  }

  async function save() {
    setSaving(true); setMessage('')
    const invalid = zones.find(z => !z.name.trim() || [z.latitude, z.longitude, z.radius_km].some(v => Number.isNaN(v)) || z.latitude < -90 || z.latitude > 90 || z.longitude < -180 || z.longitude > 180 || z.radius_km <= 0 || z.radius_km > 100)
    if (invalid) { setMessage(`Check ${invalid.name || 'a zone'}: Name required, lat -90 to 90, lng -180 to 180, radius 0-100km.`); setSaving(false); return }
    try {
      for (const z of zones) {
        // FIX: Use slug ID so DriverHome + rider matching use same ID
        const id = z._isNew && z.id.startsWith('new_') ? slugify(z.name) : z.id
        const payload = { id, name: z.name.trim(), latitude: z.latitude, longitude: z.longitude, radius_km: z.radius_km, is_active: z.is_active }
        // FIX: upsert on id - if slug already exists, update instead of duplicate
        const { error } = await supabase.from('service_zones').upsert(payload as any, { onConflict: 'id' })
        if (error) throw error
        z.id = id; z._isNew = false
      }
      if (deletedIds.length) {
        const { error: deleteError } = await supabase.from('service_zones').delete().in('id', deletedIds)
        if (deleteError) throw new Error('Zones saved, but deleted zones could not be removed: ' + deleteError.message)
        setDeletedIds([])
      }
      setLoadedFromDb(true); setMessage('Zones saved ✓ - Ride matching now uses these zones.')
    } catch (e: any) { setMessage('Could not save zones: ' + (e?.message || String(e))) } finally { setSaving(false) }
  }

  return <main style={{ minHeight: '100vh', background: '#0f172a', color: 'white', padding: '16px' }}>
    <button onClick={onBack} style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>← Admin home</button>
    <h1>Service Zones ({zones.filter(z => z.is_active).length} active)</h1>
    <p style={{ fontSize: 13, color: '#86efac', background: '#052e16', padding: 10, borderRadius: 8 }}>✅ Zone matching is now ACTIVE — Rider in Seshego only gets Seshego drivers.</p>
    <p style={{ fontSize: 12, color: '#94a3b8' }}>Price is from fare_rules (Lite 20/6, Plus 25/8, Max 40/12) - zones only define area, not price.</p>
    {!loadedFromDb && !loading && <p style={{ fontSize: 12, color: '#f59e0b' }}>Showing default zones - press Save Zones to save them to the database.</p>}
    {message && <p role={message.startsWith('Could not') || message.startsWith('Check') ? 'alert' : 'status'} style={{ color: (message.startsWith('Could not') || message.startsWith('Check')) ? '#fca5a5' : '#86efac' }}>{message}</p>}
    {loading ? <p>Loading zones...</p> : zones.map(zone => (
      <section key={zone.id} style={{ background: zone.is_active ? '#1e293b' : '#0f172a', border: zone.is_active ? 'none' : '1px dashed #475569', padding: '16px', borderRadius: '12px', marginTop: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <input value={zone.name} onChange={e => update(zone.id, 'name', e.target.value)} style={{ background: 'transparent', color: 'white', border: 0, borderBottom: '1px solid #475569', fontSize: 18, fontWeight: 800, width: '70%' }} />
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={zone.is_active} onChange={e => update(zone.id, 'is_active', e.target.checked)} /> Active</label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 12 }}>
          {([
            ['latitude', 'Latitude'], ['longitude', 'Longitude'], ['radius_km', 'Radius (km)'],
          ] as const).map(([field, label]) => (
            <label key={field} style={{ fontSize: 12, color: '#94a3b8' }}>{label}
              <input type="number" step="0.0001" value={Number.isNaN(zone[field]) ? '' : zone[field]} onChange={e => update(zone.id, field, e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 4, borderRadius: 8, border: 0, background: '#0f172a', color: 'white' }} />
            </label>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Covers ~{Math.round(Math.PI * zone.radius_km * zone.radius_km)} km² • ID: {zone.id}</p>
        <button onClick={() => removeZone(zone.id)} style={{ padding: '6px 12px', borderRadius: 8, background: '#7f1d1d', color: 'white', border: 0, cursor: 'pointer' }}>Delete Zone</button>
      </section>
    ))}
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      <button onClick={addZone} style={{ padding: '12px 18px', borderRadius: 10, background: '#0ea5e9', color: 'white', fontWeight: 800, border: 0, cursor: 'pointer' }}>+ Add Zone</button>
      <button disabled={saving} onClick={() => void save()} style={{ padding: '12px 18px', borderRadius: 10, background: '#22c55e', color: 'black', fontWeight: 800, border: 0, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Zones'}</button>
    </div>
  </main>
}