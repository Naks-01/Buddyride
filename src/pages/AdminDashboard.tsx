import { useEffect, useState } from 'react'
import { OsmMapView } from '../components/OsmMapView'
import { supabase } from '../lib/supabase'

type DriverLocation = { driver_id: string, lat: number, lng: number }
type PendingDriver = { id: string, full_name: string, email: string, phone_number: string, verification_status: string, avatar_url: string, created_at: string }

export function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [authorization, setAuthorization] = useState<'checking' | 'authorized' | 'unauthorized'>('checking')
  const [stats, setStats] = useState({ todayRides: 0, activeDrivers: 0, revenue: 0, pendingDrivers: 0 })
  const [locations, setLocations] = useState<DriverLocation[]>([])
  const [pendingDrivers, setPendingDrivers] = useState<PendingDriver[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let redirectTimeout: number | undefined
    const denyAccess = () => {
      if (!active) return
      setAuthorization('unauthorized')
      redirectTimeout = window.setTimeout(() => window.location.replace('/'), 800)
    }

    void (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || user?.email?.toLowerCase() !== 'buddyride@outlook.com') {
        denyAccess()
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role,email')
        .eq('id', user.id)
        .maybeSingle()
      if (
        profileError
        || profile?.role !== 'admin'
        || profile.email?.trim().toLowerCase() !== 'buddyride@outlook.com'
      ) {
        denyAccess()
        return
      }
      if (active) setAuthorization('authorized')
    })()
    return () => {
      active = false
      if (redirectTimeout !== undefined) window.clearTimeout(redirectTimeout)
    }
  }, [])

  async function load() {
    setError('')
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const [ridesResult, driversResult, pendingResult] = await Promise.all([
      supabase.from('rides').select('fare,total_fare').gte('created_at', start.toISOString()),
      supabase.from('driver_status').select('driver_id,lat,lng').eq('is_online', true),
      supabase.from('profiles').select('id,full_name,email,phone_number,verification_status,avatar_url,created_at').eq('role', 'driver').eq('verification_status', 'pending_verification').order('created_at', { ascending: true }),
    ])
    if (ridesResult.error || driversResult.error || pendingResult.error) {
      setError(ridesResult.error?.message || driversResult.error?.message || pendingResult.error?.message || 'Could not load dashboard data.')
      return
    }
    const rides = ridesResult.data || []
    setStats({
      todayRides: rides.length,
      activeDrivers: driversResult.data?.length || 0,
      revenue: rides.reduce((total, ride) => total + Number(ride.total_fare ?? ride.fare ?? 0), 0),
      pendingDrivers: pendingResult.data?.length || 0,
    })
    setLocations((driversResult.data || []).filter(
      (driver): driver is DriverLocation => typeof driver.lat === 'number' && typeof driver.lng === 'number'
    ))
    setPendingDrivers((pendingResult.data || []) as PendingDriver[])
  }

  useEffect(() => {
    if (authorization !== 'authorized') return
    void load()
    const interval = setInterval(load, 15000)
    // Live updates when driver goes online/offline
    const ch = supabase.channel('admin-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_status' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(ch) }
  }, [authorization])

  async function approveDriver(driverId: string, approve: boolean) {
    setProcessing(driverId)
    setMsg('')
    // Approve ALL docs + profile in one go
    const [profileRes, docsRes] = await Promise.all([
      supabase.from('profiles').update({ verification_status: approve ? 'approved' : 'rejected', is_verified: approve }).eq('id', driverId),
      supabase.from('driver_documents').update({ status: approve ? 'APPROVED' : 'REJECTED' }).eq('driver_id', driverId).eq('status', 'PENDING'),
    ])
    if (profileRes.error || docsRes.error) {
      setMsg('Failed: ' + (profileRes.error?.message || docsRes.error?.message))
    } else {
      setMsg(approve ? 'Driver approved ✅ - can now GO ONLINE' : 'Driver rejected')
      await load()
    }
    setProcessing(null)
  }

  if (authorization === 'unauthorized') return <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: 'white' }}>Unauthorized</main>
  if (authorization !== 'authorized') return <main role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: 'white' }}>Verifying admin access…</main>

  const card = { background:'#1e293b', borderRadius:'12px', padding:'16px' }
  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack} style={{marginBottom:'12px'}}>← Admin home</button>
    <h1>Admin Dashboard</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    {msg && <p style={{ background: '#052e16', color: '#86efac', padding: 10, borderRadius: 10 }}>{msg}</p>}
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'10px'}}>
      <section style={card}><div>Today Rides</div><strong style={{fontSize:'26px'}}>{stats.todayRides}</strong></section>
      <section style={card}><div>Active Drivers</div><strong style={{fontSize:'26px'}}>{stats.activeDrivers}</strong></section>
      <section style={card}><div>Revenue Today</div><strong style={{fontSize:'26px'}}>R{stats.revenue.toFixed(2)}</strong></section>
      <section style={{...card, background: stats.pendingDrivers > 0 ? '#7f1d1d' : '#1e293b'}}><div>Pending Approval</div><strong style={{fontSize:'26px'}}>{stats.pendingDrivers}</strong></section>
    </div>

    <section style={{...card, marginTop:'14px'}}>
      <h2 style={{marginTop:0}}>Pending Driver Approvals ({pendingDrivers.length})</h2>
      {pendingDrivers.length === 0 ? <p style={{color:'#94a3b8'}}>No drivers waiting. ✅</p> : pendingDrivers.map(d => (
        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {d.avatar_url && <img src={d.avatar_url} style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover' }} />}
            <div><div style={{ fontWeight: 700 }}>{d.full_name || d.email}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{d.phone_number || ''} • {d.email}</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.open(`/admin/driver/${d.id}`, '_blank')} style={{ padding: '8px 12px', borderRadius: 8, background: '#334155', color: 'white', border: 0, cursor: 'pointer' }}>View Docs</button>
            <button disabled={processing === d.id} onClick={() => approveDriver(d.id, false)} style={{ padding: '8px 12px', borderRadius: 8, background: '#7f1d1d', color: 'white', border: 0, cursor: 'pointer' }}>Reject</button>
            <button disabled={processing === d.id} onClick={() => approveDriver(d.id, true)} style={{ padding: '8px 12px', borderRadius: 8, background: '#15803d', color: 'white', border: 0, fontWeight: 700, cursor: 'pointer' }}>{processing === d.id ? '...' : 'Approve ✅'}</button>
          </div>
        </div>
      ))}
      <button onClick={() => load()} style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 0 }}>Refresh</button>
    </section>

    <section style={{...card, marginTop:'14px'}}>
      <h2 style={{marginTop:0}}>Live Map</h2>
      <div style={{height:'420px', overflow:'hidden', borderRadius:'10px'}}>
        <OsmMapView center={[29.4689, -23.9045]} availableCars={locations} theme="dark" />
      </div>
      <p style={{fontSize:'12px', color:'#cbd5e1'}}>Showing {locations.length} online driver location(s). Auto-refreshes every 15s.</p>
    </section>
  </main>
}