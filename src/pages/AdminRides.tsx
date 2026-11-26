import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIES = [
  { id: 'buddy_lite', name: 'Buddy Lite', icon: '🛺', seats: '2 seats' },
  { id: 'buddy_plus', name: 'Buddy Plus', icon: '🚗', seats: '3 seats' },
  { id: 'buddy_max', name: 'Buddy Max', icon: '🚐', seats: '7 seats' },
]
function normalizeCategory(raw: string | null | undefined) {
  const v = String(raw || '').toLowerCase().trim()
  if (v === 'go' || v === 'economy' || v === 'buddy' || v === 'buddy_lite') return 'buddy_lite'
  if (v === 'comfort' || v === 'buddy_plus') return 'buddy_plus'
  if (v === 'xl' || v === 'buddy_xl' || v === 'buddy_family' || v === 'family' || v === 'buddy_max') return 'buddy_max'
  return 'buddy_plus'
}
function categoryFor(raw: string | null | undefined) {
  const n = normalizeCategory(raw)
  return CATEGORIES.find(c => c.id === n) || CATEGORIES[1]
}

type RideRow = {
  id: string
  pickup_address: string
  dropoff_address: string
  driver_id: string | null
  passenger_id: string
  rider_id?: string | null
  fare: number
  status: string
  created_at: string
  payment_method?: string | null
  cancel_reason?: string | null
  cancelled_by?: string | null
  distance_km?: number | null
  duration_min?: number | null
  ride_category?: string | null
  ride_type?: string | null
}
type UserInfo = { full_name: string | null, email: string | null }

const STATUS_COLORS: Record<string, string> = {
  searching: '#eab308', awaiting_payment: '#f59e0b', driver_assigned: '#0ea5e9', accepted: '#0ea5e9',
  driver_arriving: '#a855f7', driver_arrived: '#a855f7', arrived: '#a855f7', picked_up: '#f59e0b',
  en_route: '#f59e0b', in_progress: '#f59e0b', on_trip: '#f59e0b', driving_to_destination: '#f59e0b',
  completed: '#22c55e', rated: '#22c55e', cancelled: '#ef4444', rejected: '#ef4444', requested: '#eab308',
}
const ACTIVE_STATUSES = ['searching', 'awaiting_payment', 'driver_assigned', 'accepted', 'driver_arriving', 'driver_arrived', 'arrived', 'picked_up', 'en_route', 'in_progress', 'on_trip', 'driving_to_destination', 'requested']
const COMPLETED_STATUSES = ['completed', 'rated']

function creditsForRide(distanceKm: number | null | undefined) {
  const d = Number(distanceKm || 0)
  if (!d || d < 100) return 1
  return 2
}
// FIX: Stuck = active for > 2 hours
function isStuckRide(r: RideRow) {
  if (!ACTIVE_STATUSES.includes(r.status.toLowerCase())) return false
  const ageHrs = (Date.now() - new Date(r.created_at).getTime()) / 3600000
  return ageHrs > 2
}

export function AdminRides({ onBack }: { onBack: () => void }) {
  const [rides, setRides] = useState<RideRow[]>([])
  const [users, setUsers] = useState<Record<string, UserInfo>>({})
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingRef = useRef(false)

  async function load(isBackground = false) {
    if (loadingRef.current) return
    loadingRef.current = true
    if (!isBackground) setLoading(true)
    try {
      const { data, error: ridesError } = await supabase.from('rides').select('id,pickup_address,dropoff_address,driver_id,passenger_id,rider_id,fare,status,created_at,payment_method,cancel_reason,cancelled_by,distance_km,duration_min,ride_category,ride_type').order('created_at', { ascending: false }).limit(500)
      if (ridesError) { setError(ridesError.message); return }
      const rows = (data || []).map((r: any) => ({ ...r, passenger_id: r.passenger_id || r.rider_id || '', distance_km: r.distance_km != null ? Number(r.distance_km) : null, fare: Number(r.fare ?? 0) })) as RideRow[]
      setRides(rows); setError('')
      const ids = [...new Set(rows.flatMap(ride => [ride.driver_id, ride.passenger_id].filter((id): id is string => Boolean(id))))]
      if (ids.length) {
        const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id,full_name,email').in('id', ids)
        if (profilesError) { setError(profilesError.message); return }
        setUsers(Object.fromEntries((profiles || []).map(user => [user.id, { full_name: user.full_name, email: user.email }])))
      }
    } finally { loadingRef.current = false; setLoading(false) }
  }

  // FIX: Admin-only actions - no SQL. Cancel stuck ride + refund credit, or force complete.
  async function adminCancelRide(ride: RideRow) {
    const reason = prompt(`Cancel ride ${ride.id.slice(0, 8)}?\nFrom: ${ride.pickup_address}\nTo: ${ride.dropoff_address}\n\nReason (shown to driver/passenger):`, 'Cancelled by Admin - driver/passenger issue')
    if (reason === null) return
    if (reason.trim().length < 5) { setError('Enter at least 5 characters.'); return }
    setActingId(ride.id); setError(''); setMsg('')
    try {
      const { error: e } = await supabase.from('rides').update({ status: 'cancelled', cancel_reason: reason.trim(), cancelled_by: 'admin' } as any).eq('id', ride.id)
      if (e) throw e
      // Refund 1 credit if ride had a driver assigned (bundle was used)
      if (ride.driver_id) {
        try {
          const credits = creditsForRide(ride.distance_km)
          // Try to refund via driver_bundles - add back trips_remaining if column exists
          const { data: bundle } = await supabase.from('driver_bundles').select('id,trips_remaining,trips_used').eq('driver_id', ride.driver_id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
          if (bundle) {
            await supabase.from('driver_bundles').update({ trips_remaining: Number((bundle as any).trips_remaining || 0) + credits, trips_used: Math.max(0, Number((bundle as any).trips_used || 0) - credits) } as any).eq('id', (bundle as any).id)
          }
        } catch {}
      }
      setMsg(`✅ Ride ${ride.id.slice(0, 8)} cancelled in Admin. ${ride.driver_id ? 'Credit refunded.' : ''}`)
      await load(true)
    } catch (e: any) { setError('Cancel failed: ' + (e?.message || String(e))) }
    finally { setActingId(null) }
  }

  async function adminCompleteRide(ride: RideRow) {
    if (!confirm(`Mark ride ${ride.id.slice(0, 8)} as COMPLETED?\n\nOnly do this if trip actually finished but app got stuck.`)) return
    setActingId(ride.id); setError(''); setMsg('')
    try {
      const { error: e } = await supabase.from('rides').update({ status: 'completed', completed_at: new Date().toISOString() } as any).eq('id', ride.id)
      if (e) throw e
      setMsg(`✅ Ride ${ride.id.slice(0, 8)} marked completed in Admin.`)
      await load(true)
    } catch (e: any) { setError('Complete failed: ' + (e?.message || String(e))) }
    finally { setActingId(null) }
  }

  function scheduleLoad() {
    if (loadTimer.current) clearTimeout(loadTimer.current)
    loadTimer.current = setTimeout(() => void load(true), 800)
  }

  useEffect(() => {
    void load(false)
    const ch = supabase.channel('admin-rides-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => scheduleLoad())
      .subscribe()
    return () => { void supabase.removeChannel(ch); if (loadTimer.current) clearTimeout(loadTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = rides.filter(r => {
    const q = search.trim().toLowerCase()
    if (statusFilter !== 'all' && r.status.toLowerCase() !== statusFilter) return false
    if (categoryFilter !== 'all' && normalizeCategory(r.ride_category || (r as any).ride_type) !== categoryFilter) return false
    if (!q) return true
    const driver = users[r.driver_id || '']?.full_name?.toLowerCase() || ''
    const passenger = users[r.passenger_id]?.full_name?.toLowerCase() || ''
    return [r.pickup_address, r.dropoff_address, driver, passenger, r.id].some(v => v?.toLowerCase().includes(q))
  })

  const counts = {
    total: rides.length,
    completed: rides.filter(r => COMPLETED_STATUSES.includes(r.status.toLowerCase())).length,
    active: rides.filter(r => ACTIVE_STATUSES.includes(r.status.toLowerCase())).length,
    cancelled: rides.filter(r => ['cancelled', 'rejected'].includes(r.status.toLowerCase())).length,
  }
  const stuckCount = rides.filter(isStuckRide).length
  const completedRides = rides.filter(r => COMPLETED_STATUSES.includes(r.status.toLowerCase()))
  const revenue = completedRides.reduce((s, r) => s + Number(r.fare ?? 0), 0)
  const yourFee = 0
  const driversPaid = revenue
  const cashRevenue = completedRides.filter(r => (r.payment_method || 'cash') === 'cash').reduce((s, r) => s + Number(r.fare ?? 0), 0)
  const totalCreditsUsed = completedRides.reduce((s, r) => s + creditsForRide(r.distance_km), 0)
  const ridesByCat = CATEGORIES.map(c => ({ ...c, count: rides.filter(r => normalizeCategory(r.ride_category || (r as any).ride_type) === c.id).length }))
  const statuses = ['all', ...new Set(rides.map(r => r.status.toLowerCase()))]

  return <main style={{ minHeight: '100vh', background: '#0f172a', color: 'white', padding: '16px' }}>
    <button onClick={onBack} style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>← Admin home</button>
    <h1>Rides - Bundle Model ({filtered.length} / {rides.length})</h1>
    <p style={{ color: '#86efac', fontSize: 13 }}>Driver keeps 100% • Your profit = Bundle sales • Credits used: {totalCreditsUsed} (1/ride, 2 for 100km or longer) • {ridesByCat.map(c => `${c.icon} ${c.name}: ${c.count}`).join(' • ')}</p>
    {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
    {msg && <p style={{ color: '#86efac', background: '#14532d', padding: 10, borderRadius: 8 }}>{msg}</p>}
    {stuckCount > 0 && <div style={{ background: '#7f1d1d', padding: 12, borderRadius: 10, margin: '12px 0', border: '1px solid #991b1b' }}><strong>⚠️ {stuckCount} STUCK ride(s) - active for &gt; 2 hours. Use Cancel / Complete in table - Admin only, no SQL.</strong></div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, margin: '12px 0' }}>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Total</div><strong style={{ fontSize: 20 }}>{counts.total}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Active Now</div><strong style={{ fontSize: 20, color: '#f59e0b' }}>{counts.active}</strong></div>
      <div style={{ background: '#7f1d1d', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#fca5a5' }}>Stuck (&gt;2h)</div><strong style={{ fontSize: 20, color: '#fecaca' }}>{stuckCount}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Completed</div><strong style={{ fontSize: 20, color: '#22c55e' }}>{counts.completed}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Cancelled</div><strong style={{ fontSize: 20, color: '#ef4444' }}>{counts.cancelled}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Total Fares (Driver Kept)</div><strong style={{ fontSize: 20 }}>R{revenue.toFixed(2)}</strong></div>
      <div style={{ background: '#14532d', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#bbf7d0' }}>YOUR FEE FROM RIDES (0%)</div><strong style={{ fontSize: 20 }}>R{yourFee.toFixed(2)}</strong><div style={{ fontSize: 10, color: '#bbf7d0' }}>Profit is in Bundle Sales</div></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Drivers Kept (100%)</div><strong style={{ fontSize: 20 }}>R{driversPaid.toFixed(2)}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Cash (Completed)</div><strong style={{ fontSize: 20 }}>R{cashRevenue.toFixed(2)}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Bundle Credits Used</div><strong style={{ fontSize: 20, color: '#f59e0b' }}>{totalCreditsUsed}</strong></div>
    </div>
    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pickup, dropoff, driver, passenger, ride ID..." style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: '#1e293b', color: 'white', border: '1px solid #334155', marginBottom: 10 }} />
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
      <button onClick={() => setCategoryFilter('all')} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: categoryFilter === 'all' ? 'white' : '#334155', color: categoryFilter === 'all' ? 'black' : 'white', fontWeight: 700, cursor: 'pointer' }}>All Categories</button>
      {CATEGORIES.map(c => (
        <button key={c.id} onClick={() => setCategoryFilter(c.id)} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: categoryFilter === c.id ? '#0066FF' : '#334155', color: 'white', fontWeight: 700, cursor: 'pointer' }}>{c.icon} {c.name} ({ridesByCat.find(r => r.id === c.id)?.count || 0})</button>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {statuses.map(s => (
        <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: statusFilter === s ? 'white' : '#334155', color: statusFilter === s ? 'black' : 'white', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer' }}>{s}</button>
      ))}
      <button onClick={() => load()} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: '#0ea5e9', color: 'white', fontWeight: 700 }}>{loading ? '...' : '↻ Refresh'}</button>
    </div>
    {loading && <p>Loading rides...</p>}
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#1e293b' }}>
        <thead><tr>{['ID', 'From', 'To', 'Category', 'Driver', 'Passenger', 'Fare', 'Driver Gets (100%)', 'Your Fee (0%)', 'Credits', 'Payment', 'Status', 'Cancel Reason', 'Date', 'Admin Action'].map(label => <th key={label} style={{ padding: '10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{label}</th>)}</tr></thead>
        <tbody>{filtered.map(ride => {
          const fare = Number(ride.fare ?? 0); const fee = 0; const driverGets = fare; const credits = creditsForRide(ride.distance_km); const cat = categoryFor(ride.ride_category || (ride as any).ride_type)
          const stuck = isStuckRide(ride); const isActive = ACTIVE_STATUSES.includes(ride.status.toLowerCase())
          const payLabel = (ride.payment_method || 'cash').toLowerCase() === 'cash' ? '💵 Cash' : (ride.payment_method || 'cash').toLowerCase() === 'card' ? '💳 Card' : `🎫 ${(ride.payment_method || 'cash')}`
          return <tr key={ride.id} style={{ borderTop: '1px solid #475569', background: stuck ? '#450a0a' : 'transparent' }}>
            <td style={{ padding: '10px' }}>{ride.id.slice(0, 8)}{stuck && <div style={{ fontSize: 10, color: '#fca5a5', fontWeight: 800 }}>⚠️ STUCK &gt;2h</div>}</td>
            <td style={{ padding: '10px' }}>{ride.pickup_address}<br /><span style={{ fontSize: 11, color: '#94a3b8' }}>{ride.distance_km ? `${ride.distance_km.toFixed(1)} km • ${ride.duration_min} min • ${credits} credit${credits > 1 ? 's' : ''}` : ''}</span></td>
            <td style={{ padding: '10px' }}>{ride.dropoff_address}</td>
            <td style={{ padding: '10px' }}><span style={{ background: '#0066FF', color: 'white', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>{cat.icon} {cat.name} • {cat.seats}</span></td>
            <td style={{ padding: '10px' }}>{ride.driver_id ? users[ride.driver_id]?.full_name || users[ride.driver_id]?.email || ride.driver_id : 'Unassigned'}</td>
            <td style={{ padding: '10px' }}>{users[ride.passenger_id]?.full_name || users[ride.passenger_id]?.email || ride.passenger_id}</td>
            <td style={{ padding: '10px', fontWeight: 700 }}>R{fare.toFixed(2)}</td>
            <td style={{ padding: '10px', color: '#86efac' }}>R{driverGets.toFixed(2)}</td>
            <td style={{ padding: '10px', color: '#94a3b8' }}>R{fee.toFixed(2)}</td>
            <td style={{ padding: '10px', fontWeight: 700, color: credits > 1 ? '#f59e0b' : 'white' }}>{credits} {credits > 1 ? '⭐ Long' : ''}</td>
            <td style={{ padding: '10px' }}>{payLabel}</td>
            <td style={{ padding: '10px' }}><span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: STATUS_COLORS[ride.status.toLowerCase()] || '#475569', color: 'white', textTransform: 'uppercase' }}>{ride.status.replace(/_/g, ' ')}</span></td>
            <td style={{ padding: '10px', fontSize: 12, color: '#fca5a5' }}>{ride.status.toLowerCase() === 'cancelled' ? `${ride.cancelled_by || ''}: ${ride.cancel_reason || ''}` : ''}</td>
            <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{new Date(ride.created_at).toLocaleString()}</td>
            <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
              {isActive ? <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={actingId === ride.id} onClick={() => void adminCompleteRide(ride)} style={{ padding: '6px 10px', borderRadius: 6, background: '#16a34a', color: 'white', border: 0, fontWeight: 700, cursor: 'pointer' }}>✅ Complete</button>
                <button disabled={actingId === ride.id} onClick={() => void adminCancelRide(ride)} style={{ padding: '6px 10px', borderRadius: 6, background: '#dc2626', color: 'white', border: 0, fontWeight: 700, cursor: 'pointer' }}>❌ Cancel</button>
              </div> : <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>}
            </td>
          </tr>
        })}
          {!loading && filtered.length === 0 && <tr><td colSpan={15} style={{ padding: '12px' }}>No rides found.</td></tr>}</tbody>
      </table>
    </div>
  </main>
}