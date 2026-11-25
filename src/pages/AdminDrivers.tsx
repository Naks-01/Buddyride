"use client"
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIES: Record<string, { label: string, seats: string, icon: string }> = {
  buddy_lite: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  buddy_plus: { label: 'Buddy Plus', seats: '3 seats', icon: '🚗' },
  buddy_max: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  buddy: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  go: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  economy: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  comfort: { label: 'Buddy Plus', seats: '3 seats', icon: '🚗' },
  xl: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  buddy_xl: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  buddy_family: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
}
function categoryFor(raw: string | null | undefined) {
  const v = String(raw || '').toLowerCase().trim()
  return CATEGORIES[v] || CATEGORIES.buddy_plus
}

type DriverRow = {
  id: string
  email: string
  full_name: string
  id_number: string
  verification_status: string
  profile_zones: string[]
  ride_type: string
  vehicle_year: number
  make_model: string
  colour: string
  registration: string
  vehicle_zones: string[]
  vehicle_ride_type: string
  total_docs: number
  approved_docs: number
}

export function AdminDrivers() {
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [zonesMap, setZonesMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [error, setError] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError('')
    const { data: z } = await supabase.from('service_zones').select('id,name').eq('is_active', true)
    const map: Record<string, string> = {}
    z?.forEach((r: any) => map[r.id] = r.name)
    setZonesMap(map)

    const { data, error: loadError } = await supabase
      .from('profiles')
      .select(`id,email,full_name,id_number,verification_status,service_zones,ride_type,driver_vehicles!left(vehicle_year,make_model,colour,registration,service_zones,ride_type)`)
      .eq('role', 'driver')
      .order('created_at', { ascending: false })

    if (loadError) { setError(loadError.message); setLoading(false); return }
    if (!data) { setDrivers([]); setLoading(false); return }

    const rows: DriverRow[] = data.map((p: any) => {
      const v = Array.isArray(p.driver_vehicles) ? p.driver_vehicles[0] : p.driver_vehicles
      return {
        id: p.id, email: p.email, full_name: p.full_name || 'No name', id_number: p.id_number,
        verification_status: p.verification_status, profile_zones: p.service_zones || [], ride_type: p.ride_type,
        vehicle_year: v?.vehicle_year, make_model: v?.make_model, colour: v?.colour, registration: v?.registration,
        vehicle_zones: v?.service_zones || [], vehicle_ride_type: v?.ride_type, total_docs: 0, approved_docs: 0,
      }
    })
    // FIX: 1 query for all doc counts - was N+1 (1 query PER driver), 100 drivers = 101 queries, page hung
    const ids = rows.map(r => r.id)
    let countMap: Record<string, { total: number, approved: number }> = {}
    if (ids.length) {
      const { data: docs } = await supabase.from('driver_documents').select('driver_id,status').in('driver_id', ids)
      for (const d of docs || []) {
        const c = countMap[d.driver_id] || (countMap[d.driver_id] = { total: 0, approved: 0 })
        c.total++
        if (String(d.status).toUpperCase() === 'APPROVED') c.approved++
      }
    }
    setDrivers(rows.map(r => ({ ...r, total_docs: countMap[r.id]?.total || 0, approved_docs: countMap[r.id]?.approved || 0 })))
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function approveDriver(id: string) {
    // FIX: Use secure RPC - was directly updating profiles + approving ALL docs blindly, even missing/expired ones
    if (!confirm('Approve this driver? He will be able to Go Online. All docs + vehicle + zones + ride type must already be verified.')) return
    setActingId(id)
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_driver_verification', { p_driver_id: id, p_approve: true, p_rejection_reason: null })
      if (rpcError) { alert(`Approve failed: ${rpcError.message}`); return }
      await load()
    } finally { setActingId(null) }
  }

  async function rejectDriver(id: string) {
    const reason = prompt('Rejection reason? (min 10 chars)')
    if (!reason || reason.trim().length < 10) { if (reason) alert('Enter at least 10 characters.'); return }
    setActingId(id)
    try {
      // FIX: Reject via RPC so docs + profile stay in sync - was only setting profile, docs stayed APPROVED
      const { error: rpcError } = await supabase.rpc('admin_set_driver_verification', { p_driver_id: id, p_approve: false, p_rejection_reason: reason.trim() })
      if (rpcError) {
        const { error: fb } = await supabase.from('profiles').update({ verification_status: 'rejected', verification_rejection_reason: reason.trim() } as any).eq('id', id)
        if (fb) { alert(`Reject failed: ${fb.message}`); return }
      }
      await load()
    } finally { setActingId(null) }
  }

  const filtered = drivers.filter(d => {
    if (filter === 'pending') return d.verification_status !== 'approved'
    if (filter === 'approved') return d.verification_status === 'approved'
    return true
  })

  if (loading) return <div style={{ padding: 40 }}>Loading drivers...</div>

  return (
    <main style={{ minHeight: '100dvh', background: '#F8F9FA', padding: 20, fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: 26 }}>Admin — Limpopo Drivers</h1>
      <p style={{ color: '#667085' }}>{drivers.length} drivers total.</p>
      {error && <div style={{ background: '#FEE4E2', color: '#B42318', padding: 12, borderRadius: 8, marginTop: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <button onClick={() => setFilter('all')} style={{ padding: '8px 14px', borderRadius: 99, border: '1px solid #D0D5DD', background: filter === 'all' ? '#0066FF' : '#fff', color: filter === 'all' ? '#fff' : '#000', fontWeight: 700 }}>All</button>
        <button onClick={() => setFilter('pending')} style={{ padding: '8px 14px', borderRadius: 99, border: '1px solid #D0D5DD', background: filter === 'pending' ? '#EA580C' : '#fff', color: filter === 'pending' ? '#fff' : '#000', fontWeight: 700 }}>Pending</button>
        <button onClick={() => setFilter('approved')} style={{ padding: '8px 14px', borderRadius: 99, border: '1px solid #D0D5DD', background: filter === 'approved' ? '#16A34A' : '#fff', color: filter === 'approved' ? '#fff' : '#000', fontWeight: 700 }}>Approved</button>
        <button onClick={() => void load()} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, background: '#fff', border: '1px solid #D0D5DD' }}>🔄 Refresh</button>
      </div>

      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 16, border: '1px solid #EAECF0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#F9FAFB', textAlign: 'left' }}>
            <tr>
              <th style={{ padding: 12 }}>Driver</th>
              <th style={{ padding: 12 }}>ID Number</th>
              <th style={{ padding: 12 }}>Vehicle</th>
              <th style={{ padding: 12 }}>Service Zones (Limpopo)</th>
              <th style={{ padding: 12 }}>Ride Type</th>
              <th style={{ padding: 12 }}>Docs</th>
              <th style={{ padding: 12 }}>Status</th>
              <th style={{ padding: 12 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => {
              const zoneIds = d.vehicle_zones?.length ? d.vehicle_zones : d.profile_zones
              const rawRide = d.vehicle_ride_type || d.ride_type
              const cat = categoryFor(rawRide)
              const mismatch = d.vehicle_ride_type && d.ride_type && String(d.vehicle_ride_type).toLowerCase() !== String(d.ride_type).toLowerCase()
              const isActing = actingId === d.id
              return (
                <tr key={d.id} style={{ borderTop: '1px solid #EAECF0' }}>
                  <td style={{ padding: 12 }}><strong>{d.full_name}</strong><br /><span style={{ color: '#667085', fontSize: 11 }}>{d.email}</span><br /><span style={{ fontSize: 10, color: '#98A2B3' }}>{d.id.slice(0, 8)}...</span></td>
                  <td style={{ padding: 12 }}>{d.id_number || '—'}</td>
                  <td style={{ padding: 12 }}>{d.make_model ? `${d.vehicle_year || ''} ${d.make_model} ${d.colour || ''} - ${d.registration || ''}` : 'No vehicle'}</td>
                  <td style={{ padding: 12 }}>
                    {zoneIds?.length ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 240 }}>
                        {zoneIds.map((zId: string) => (
                          <span key={zId} style={{ padding: '2px 8px', background: '#E6F0FF', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#0052CC' }}>{zonesMap[zId] || zId}</span>
                        ))}
                      </div>
                    ) : <span style={{ color: '#B42318', fontWeight: 700 }}>No Limpopo zone picked</span>}
                  </td>
                  <td style={{ padding: 12 }}>{rawRide ? <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, background: '#0066FF', color: 'white', fontWeight: 800, fontSize: 12 }}>{cat.icon} {cat.label} • {cat.seats}</span> : '—'}{mismatch && <div style={{ fontSize: 10, color: '#B42318', fontWeight: 700, marginTop: 4 }}>⚠️ Mismatch: profile={d.ride_type} vehicle={d.vehicle_ride_type}</div>}</td>
                  <td style={{ padding: 12 }}>{d.approved_docs}/{d.total_docs}</td>
                  <td style={{ padding: 12 }}><span style={{ padding: '4px 8px', borderRadius: 99, background: d.verification_status === 'approved' ? '#ECFDF3' : '#FFF7ED', color: d.verification_status === 'approved' ? '#067647' : '#C2410C', fontWeight: 700, fontSize: 11 }}>{d.verification_status}</span></td>
                  <td style={{ padding: 12, display: 'flex', gap: 6 }}>
                    <button disabled={isActing} onClick={() => void approveDriver(d.id)} style={{ padding: '6px 10px', borderRadius: 8, background: '#16A34A', color: '#fff', border: 0, fontWeight: 800, cursor: 'pointer', opacity: isActing ? 0.5 : 1 }}>{isActing ? 'Saving...' : 'Approve'}</button>
                    <button disabled={isActing} onClick={() => void rejectDriver(d.id)} style={{ padding: '6px 10px', borderRadius: 8, background: '#fff', border: '1px solid #D0D5DD', cursor: 'pointer', opacity: isActing ? 0.5 : 1 }}>Reject</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#667085' }}>No drivers in this filter</div>}
      </div>

      <div style={{ marginTop: 24, background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #EAECF0' }}>
        <h3 style={{ margin: '0 0 8px' }}>Manage Limpopo Zones (Admin)</h3>
        <p style={{ fontSize: 12, color: '#667085' }}>Add new zones without SQL</p>
        <AddZoneForm onAdded={load} />
      </div>
    </main>
  )
}

function AddZoneForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="New zone e.g. Louis Trichardt" style={{ flex: 1, padding: 10, border: '1px solid #D0D5DD', borderRadius: 8 }} />
      <button disabled={saving || !name.trim()} onClick={async () => {
        setSaving(true)
        const { error } = await supabase.from('service_zones').insert({ name: name.trim(), city: 'Limpopo', is_active: true })
        if (error) alert(error.message)
        else { setName(''); onAdded() }
        setSaving(false)
      }} style={{ padding: '10px 16px', background: '#0066FF', color: '#fff', border: 0, borderRadius: 8, fontWeight: 800 }}>{saving ? 'Saving...' : 'Add Zone'}</button>
    </div>
  )
}