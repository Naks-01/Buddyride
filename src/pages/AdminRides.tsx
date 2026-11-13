import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type RideRow = {
  id: string
  pickup_address: string
  dropoff_address: string
  driver_id: string | null
  passenger_id: string
  fare: number
  status: string
  created_at: string
  payment_method?: string | null
  cancel_reason?: string | null
  cancelled_by?: string | null
  distance_km?: number | null
  duration_min?: number | null
  ride_category?: string | null
}

type UserInfo = { full_name: string | null, email: string | null }

const STATUS_COLORS: Record<string, string> = {
  searching: '#eab308',
  awaiting_payment: '#f59e0b',
  driver_assigned: '#0ea5e9',
  accepted: '#0ea5e9',
  driver_arriving: '#a855f7',
  driver_arrived: '#a855f7',
  arrived: '#a855f7',
  picked_up: '#f59e0b',
  en_route: '#f59e0b',
  in_progress: '#f59e0b',
  on_trip: '#f59e0b',
  driving_to_destination: '#f59e0b',
  completed: '#22c55e',
  rated: '#22c55e',
  cancelled: '#ef4444',
  rejected: '#ef4444',
  requested: '#eab308',
}

const ACTIVE_STATUSES = ['searching', 'awaiting_payment', 'driver_assigned', 'accepted', 'driver_arriving', 'driver_arrived', 'arrived', 'picked_up', 'en_route', 'in_progress', 'on_trip', 'driving_to_destination', 'requested']
const COMPLETED_STATUSES = ['completed', 'rated']
const COMMISSION = 20 // Same as fare.ts + DriverHome.tsx

export function AdminRides({ onBack }: { onBack: () => void }) {
  const [rides, setRides] = useState<RideRow[]>([])
  const [users, setUsers] = useState<Record<string, UserInfo>>({})
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingRef = useRef(false)

  async function load(isBackground = false) {
    if (loadingRef.current) return
    loadingRef.current = true
    if (!isBackground) setLoading(true)
    try {
      const { data, error: ridesError } = await supabase.from('rides').select('id,pickup_address,dropoff_address,driver_id,passenger_id,fare,status,created_at,payment_method,cancel_reason,cancelled_by,distance_km,duration_min,ride_category').order('created_at', { ascending:false }).limit(500)
      if (ridesError) { setError(ridesError.message); return }
      const rows = (data || []) as RideRow[]
      setRides(rows)
      setError('')
      const ids = [...new Set(rows.flatMap(ride => [ride.driver_id, ride.passenger_id].filter((id): id is string => Boolean(id))))]
      if (ids.length) {
        const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id,full_name,email').in('id', ids)
        if (profilesError) { setError(profilesError.message); return }
        setUsers(Object.fromEntries((profiles || []).map(user => [user.id, { full_name:user.full_name, email:user.email }])))
      }
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
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
    const timer = setInterval(() => void load(true), 20000)
    return () => { supabase.removeChannel(ch); clearInterval(timer); if (loadTimer.current) clearTimeout(loadTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = rides.filter(r => {
    const q = search.trim().toLowerCase()
    if (statusFilter !== 'all' && r.status.toLowerCase() !== statusFilter) return false
    if (!q) return true
    const driver = users[r.driver_id || '']?.full_name?.toLowerCase() || ''
    const passenger = users[r.passenger_id]?.full_name?.toLowerCase() || ''
    return [r.pickup_address, r.dropoff_address, driver, passenger, r.id].some(v => v?.toLowerCase().includes(q))
  })

  const counts = {
    total: rides.length,
    completed: rides.filter(r => COMPLETED_STATUSES.includes(r.status.toLowerCase())).length,
    active: rides.filter(r => ACTIVE_STATUSES.includes(r.status.toLowerCase())).length,
    cancelled: rides.filter(r => ['cancelled','rejected'].includes(r.status.toLowerCase())).length,
  }
  // FIXED 100% - Use fare only, no total_fare column exists
  const completedRides = rides.filter(r => COMPLETED_STATUSES.includes(r.status.toLowerCase()))
  const revenue = completedRides.reduce((s, r) => s + Number(r.fare ?? 0), 0)
  const yourFee = Math.round(revenue * COMMISSION / 100)
  const driversPaid = revenue - yourFee
  const cashRevenue = completedRides.filter(r => (r.payment_method || 'cash') === 'cash').reduce((s, r) => s + Number(r.fare ?? 0), 0)

  const statuses = ['all', ...new Set(rides.map(r => r.status.toLowerCase()))]

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack} style={{background:'#1e293b', color:'white', border:'1px solid #334155', padding:'8px 14px', borderRadius:8, cursor:'pointer'}}>← Admin home</button>
    <h1>Rides ({filtered.length} / {rides.length})</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, margin: '12px 0' }}>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Total</div><strong style={{ fontSize: 20 }}>{counts.total}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Active Now</div><strong style={{ fontSize: 20, color: '#f59e0b' }}>{counts.active}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Completed</div><strong style={{ fontSize: 20, color: '#22c55e' }}>{counts.completed}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Cancelled</div><strong style={{ fontSize: 20, color: '#ef4444' }}>{counts.cancelled}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Total Revenue</div><strong style={{ fontSize: 20 }}>R{revenue.toFixed(2)}</strong></div>
      <div style={{ background: '#0066FF', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#dbeafe' }}>YOUR FEE (20%)</div><strong style={{ fontSize: 20 }}>R{yourFee.toFixed(2)}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Drivers Paid (80%)</div><strong style={{ fontSize: 20 }}>R{driversPaid.toFixed(2)}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Cash (Completed)</div><strong style={{ fontSize: 20 }}>R{cashRevenue.toFixed(2)}</strong></div>
    </div>
    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pickup, dropoff, driver, passenger, ride ID..." style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: '#1e293b', color: 'white', border: '1px solid #334155', marginBottom: 10 }} />
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {statuses.map(s => (
        <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: statusFilter === s ? 'white' : '#334155', color: statusFilter === s ? 'black' : 'white', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer' }}>{s}</button>
      ))}
      <button onClick={() => load()} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: '#0ea5e9', color: 'white', fontWeight: 700 }}>{loading ? '...' : '↻ Refresh'}</button>
    </div>
    {loading && <p>Loading rides...</p>}
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%', borderCollapse:'collapse', background:'#1e293b'}}>
        <thead><tr>{['ID','From','To','Driver','Passenger','Fare','Driver Gets','Your Fee','Payment','Status','Cancel Reason','Date'].map(label=><th key={label} style={{padding:'10px', textAlign:'left', whiteSpace:'nowrap'}}>{label}</th>)}</tr></thead>
        <tbody>{filtered.map(ride=>{
          const fare = Number(ride.fare ?? 0)
          const fee = Math.round(fare * COMMISSION / 100)
          const driverGets = fare - fee
          return <tr key={ride.id} style={{borderTop:'1px solid #475569'}}>
          <td style={{padding:'10px'}}>{ride.id.slice(0,8)}</td>
          <td style={{padding:'10px'}}>{ride.pickup_address}<br/><span style={{fontSize:11, color:'#94a3b8'}}>{ride.distance_km ? `${ride.distance_km.toFixed(1)} km • ${ride.duration_min} min • ${ride.ride_category || ''}` : ''}</span></td>
          <td style={{padding:'10px'}}>{ride.dropoff_address}</td>
          <td style={{padding:'10px'}}>{ride.driver_id ? users[ride.driver_id]?.full_name || users[ride.driver_id]?.email || ride.driver_id : 'Unassigned'}</td>
          <td style={{padding:'10px'}}>{users[ride.passenger_id]?.full_name || users[ride.passenger_id]?.email || ride.passenger_id}</td>
          <td style={{padding:'10px', fontWeight:700}}>R{fare.toFixed(2)}</td>
          <td style={{padding:'10px', color:'#86efac'}}>R{driverGets.toFixed(2)}</td>
          <td style={{padding:'10px', color:'#93c5fd'}}>R{fee.toFixed(2)}</td>
          <td style={{padding:'10px'}}>{ride.payment_method === 'paystack' ? '💳 Card' : '💵 Cash'}</td>
          <td style={{padding:'10px'}}><span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: STATUS_COLORS[ride.status.toLowerCase()] || '#475569', color: 'white', textTransform: 'uppercase' }}>{ride.status.replace(/_/g,' ')}</span></td>
          <td style={{padding:'10px', fontSize:12, color:'#fca5a5'}}>{ride.status.toLowerCase() === 'cancelled' ? `${ride.cancelled_by || ''}: ${ride.cancel_reason || ''}` : ''}</td>
          <td style={{padding:'10px', whiteSpace:'nowrap'}}>{new Date(ride.created_at).toLocaleString()}</td>
        </tr>})}
        {!loading && filtered.length===0 && <tr><td colSpan={12} style={{padding:'12px'}}>No rides found.</td></tr>}</tbody>
      </table>
    </div>
  </main>
}