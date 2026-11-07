import { useEffect, useState } from 'react'
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
}

type UserInfo = { full_name: string | null, email: string | null }

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  rated: '#22c55e',
  accepted: '#0ea5e9',
  in_progress: '#f59e0b',
  driver_arrived: '#a855f7',
  requested: '#eab308',
  cancelled: '#ef4444',
  rejected: '#ef4444',
}

export function AdminRides({ onBack }: { onBack: () => void }) {
  const [rides, setRides] = useState<RideRow[]>([])
  const [users, setUsers] = useState<Record<string, UserInfo>>({})
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data, error: ridesError } = await supabase.from('rides').select('id,pickup_address,dropoff_address,driver_id,passenger_id,fare,status,created_at').order('created_at', { ascending:false }).limit(500)
    if (ridesError) { setError(ridesError.message); setLoading(false); return }
    const rows = (data || []) as RideRow[]
    setRides(rows)
    const ids = [...new Set(rows.flatMap(ride => [ride.driver_id, ride.passenger_id].filter((id): id is string => Boolean(id))))]
    if (ids.length) {
      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id,full_name,email').in('id', ids)
      if (profilesError) { setError(profilesError.message); setLoading(false); return }
      setUsers(Object.fromEntries((profiles || []).map(user => [user.id, { full_name:user.full_name, email:user.email }])))
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // Live: new ride appears without refresh
    const ch = supabase.channel('admin-rides-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => load())
      .subscribe()
    const timer = setInterval(load, 20000)
    return () => { supabase.removeChannel(ch); clearInterval(timer) }
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
    completed: rides.filter(r => ['completed','rated'].includes(r.status.toLowerCase())).length,
    active: rides.filter(r => ['requested','accepted','driver_arrived','in_progress'].includes(r.status.toLowerCase())).length,
    cancelled: rides.filter(r => ['cancelled','rejected'].includes(r.status.toLowerCase())).length,
  }
  const revenue = rides.filter(r => ['completed','rated'].includes(r.status.toLowerCase())).reduce((s, r) => s + Number(r.fare || 0), 0)

  const statuses = ['all', ...new Set(rides.map(r => r.status.toLowerCase()))]

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button>
    <h1>Rides ({filtered.length} / {rides.length})</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, margin: '12px 0' }}>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Total</div><strong style={{ fontSize: 20 }}>{counts.total}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Active Now</div><strong style={{ fontSize: 20, color: '#f59e0b' }}>{counts.active}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Completed</div><strong style={{ fontSize: 20, color: '#22c55e' }}>{counts.completed}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Cancelled</div><strong style={{ fontSize: 20, color: '#ef4444' }}>{counts.cancelled}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Revenue</div><strong style={{ fontSize: 20 }}>R{revenue.toFixed(2)}</strong></div>
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
        <thead><tr>{['ID','From','To','Driver','Passenger','Fare','Status','Date'].map(label=><th key={label} style={{padding:'10px', textAlign:'left'}}>{label}</th>)}</tr></thead>
        <tbody>{filtered.map(ride=><tr key={ride.id} style={{borderTop:'1px solid #475569'}}>
          <td style={{padding:'10px'}}>{ride.id.slice(0,8)}</td>
          <td style={{padding:'10px'}}>{ride.pickup_address}</td>
          <td style={{padding:'10px'}}>{ride.dropoff_address}</td>
          <td style={{padding:'10px'}}>{ride.driver_id ? users[ride.driver_id]?.full_name || users[ride.driver_id]?.email || ride.driver_id : 'Unassigned'}</td>
          <td style={{padding:'10px'}}>{users[ride.passenger_id]?.full_name || users[ride.passenger_id]?.email || ride.passenger_id}</td>
          <td style={{padding:'10px'}}>R{Number(ride.fare).toFixed(2)}</td>
          <td style={{padding:'10px'}}><span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: STATUS_COLORS[ride.status.toLowerCase()] || '#475569', color: 'white', textTransform: 'uppercase' }}>{ride.status.replace(/_/g,' ')}</span></td>
          <td style={{padding:'10px'}}>{new Date(ride.created_at).toLocaleString()}</td>
        </tr>)}
        {!loading && filtered.length===0 && <tr><td colSpan={8} style={{padding:'12px'}}>No rides found.</td></tr>}</tbody>
      </table>
    </div>
  </main>
}