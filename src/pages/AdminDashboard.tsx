import { useEffect, useState } from 'react'
import { OsmMapView } from '../components/OsmMapView'
import { supabase } from '../lib/supabase'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

type DriverLocation = { driver_id: string, lat: number, lng: number }
type PendingUser = { id: string, full_name: string, email: string, phone_number: string, verification_status: string, avatar_url: string, created_at: string, role: string }

export function AdminDashboard({ onBack, onDocs }: { onBack: () => void; onDocs: (driverId: string) => void }) {
  const [authorization, setAuthorization] = useState<'checking' | 'authorized' | 'unauthorized'>('checking')
  const [stats, setStats] = useState({ todayRides: 0, activeDrivers: 0, revenue: 0, pendingDrivers: 0 })
  const [locations, setLocations] = useState<DriverLocation[]>([])
  const [pendingDrivers, setPendingDrivers] = useState<PendingUser[]>([])
  const [pendingPassengers, setPendingPassengers] = useState<PendingUser[]>([])
  const [identityDrivers, setIdentityDrivers] = useState<PendingUser[]>([])
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
      if (userError || !user) { denyAccess(); return }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role,email')
        .eq('id', user.id)
        .maybeSingle()
      if (profileError || profile?.role !== 'admin') { denyAccess(); return }
      if (active) setAuthorization('authorized')
    })()
    return () => { active = false; if (redirectTimeout !== undefined) window.clearTimeout(redirectTimeout) }
  }, [])

  async function load() {
    setError('')
    const [statsResult, driversResult, pendingDriverResult, pendingPassengerResult, identityResult] = await Promise.all([
      supabase.rpc('admin_dashboard_stats'),
      supabase.from('driver_status').select('driver_id,lat,lng').eq('is_online', true),
      // FIX: Only full docs can be approved - pending_verification = 15/15 docs submitted
      supabase.from('profiles')
        .select('id,full_name,email,phone_number,verification_status,avatar_url,created_at,role')
        .eq('role', 'driver')
        .eq('verification_status', 'pending_verification')
        .order('created_at', { ascending: true }),
      // FIX: NEW - Passengers waiting for Admin - ID + selfie
      supabase.from('profiles')
        .select('id,full_name,email,phone_number,verification_status,avatar_url,created_at,role')
        .eq('role', 'passenger')
        .in('verification_status', ['pending', 'pending_verification'])
        .order('created_at', { ascending: true }),
      // FIX: NEW - Identity Done drivers - DO NOT APPROVE, just view - they finish 11 docs inside app
      supabase.from('profiles')
        .select('id,full_name,email,phone_number,verification_status,avatar_url,created_at,role')
        .eq('role', 'driver')
        .eq('verification_status', 'identity_complete')
        .order('created_at', { ascending: true }),
    ])
    if (statsResult.error || driversResult.error || pendingDriverResult.error || pendingPassengerResult.error || identityResult.error) {
      setError(statsResult.error?.message || driversResult.error?.message || pendingDriverResult.error?.message || pendingPassengerResult.error?.message || identityResult.error?.message || 'Could not load dashboard data.')
      return
    }
    const row = Array.isArray(statsResult.data) ? statsResult.data[0] : statsResult.data
    if (!row) { setError('The admin dashboard statistics function returned no data. Apply the latest Supabase migration.'); return }
    setStats({
      todayRides: Number(row.today_rides || 0),
      activeDrivers: Number(row.active_drivers || 0),
      revenue: Number(row.platform_revenue_today || 0),
      pendingDrivers: Number(row.pending_drivers || 0),
    })
    setLocations((driversResult.data || []).filter(
      (driver): driver is DriverLocation => typeof driver.lat === 'number' && typeof driver.lng === 'number'
    ))
    setPendingDrivers((pendingDriverResult.data || []) as PendingUser[])
    setPendingPassengers((pendingPassengerResult.data || []) as PendingUser[])
    setIdentityDrivers((identityResult.data || []) as PendingUser[])
  }

  useEffect(() => {
    if (authorization !== 'authorized') return
    void load()
    const interval = setInterval(load, 15000)
    const ch = supabase.channel('admin-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_status' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(ch) }
  }, [authorization])

  // FIX: Driver approve - ONLY via RPC that checks 15/15 docs - no demo bypass
  async function approveDriver(driverId: string, approve: boolean) {
    setProcessing(driverId); setMsg('')
    try {
      const { error: approvalError } = await supabase.rpc('admin_set_driver_verification', {
        p_driver_id: driverId,
        p_approve: approve,
        p_rejection_reason: approve ? null : 'Rejected by BuddyRide admin. Please replace the rejected documents.',
      })
      if (approvalError) throw approvalError
      setMsg(approve ? 'Driver approved by Admin. All 15 docs passed.' : 'Driver rejected.')
      await load()
    } catch (e: unknown) {
      setMsg(`Could not ${approve ? 'approve' : 'reject'} driver: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setProcessing(null) }
  }

  // FIX: NEW - Passenger approve - via Admin only, no SQL
  async function approvePassenger(userId: string, approve: boolean) {
    setProcessing(userId); setMsg('')
    try {
      const { error } = await supabase.rpc('admin_set_passenger_verification', {
        p_user_id: userId,
        p_approve: approve,
        p_rejection_reason: approve ? null : 'Rejected by BuddyRide admin. Please re-upload clear ID + selfie.',
      })
      if (error) {
        // Fallback if RPC not yet created - direct update is still Admin-only (RLS: admin role)
        const { error: fallbackError } = await supabase.from('profiles').update({
          is_verified: approve,
          verification_status: approve ? 'verified' : 'rejected',
        }).eq('id', userId).eq('role', 'passenger')
        if (fallbackError) throw fallbackError
      }
      setMsg(approve ? 'Passenger approved by Admin. Can now Request Ride.' : 'Passenger rejected.')
      await load()
    } catch (e: unknown) {
      setMsg(`Could not ${approve ? 'approve' : 'reject'} passenger: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setProcessing(null) }
  }

  if (authorization === 'unauthorized') return <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F8F9FA', color: '#182230' }}>Unauthorized</main>
  if (authorization !== 'authorized') return <main role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F8F9FA', color: '#667085' }}>Verifying admin access…</main>

  const card = { background:'#fff', borderRadius:'16px', padding:'16px', border:'1px solid #EDF0F3', boxShadow:'0 5px 18px rgba(20,33,50,0.045)' }
  const renderRow = (d: PendingUser, isPassenger: boolean) => (
    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #EDF0F3', flexWrap:'wrap' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {d.avatar_url && <img src={d.avatar_url} alt="avatar" style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover' }} />}
        <div><div style={{ fontWeight: 700 }}>{d.full_name || d.email}</div><div style={{ fontSize: 12, color: '#667085' }}>{d.phone_number || ''} • {d.email} • {d.verification_status}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onDocs(d.id)} style={{ padding: '8px 12px', borderRadius: 8, background: '#F2F4F7', color: '#344054', border: '1px solid #E4E7EC', cursor: 'pointer', fontWeight:700 }}>View Documents</button>
        <button disabled={processing === d.id} onClick={() => isPassenger ? approvePassenger(d.id, false) : approveDriver(d.id, false)} style={{ padding: '8px 12px', borderRadius: 8, background: '#FEF3F2', color: '#B42318', border: '1px solid #FECDCA', cursor: 'pointer', fontWeight:700 }}>Reject</button>
        <button disabled={processing === d.id} onClick={() => isPassenger ? approvePassenger(d.id, true) : approveDriver(d.id, true)} style={{ padding: '8px 12px', borderRadius: 8, background: BLUE, color: 'white', border: 0, fontWeight: 700, cursor: 'pointer' }}>{processing === d.id ? '...' : 'Approve ✅'}</button>
      </div>
    </div>
  )

  return <main style={{minHeight:'100vh', background:'#F8F9FA', color:'#182230', padding:'16px'}}>
    <button onClick={onBack} style={{marginBottom:'12px', background: BLUE_LIGHT, color: BLUE_DARK, border:'none', padding:'8px 14px', borderRadius:999, fontWeight:700, cursor:'pointer'}}>← Admin home</button>
    <h1 style={{ margin:'8px 0 16px' }}>Admin Dashboard</h1>
    {error && <p role="alert" style={{color:'#B42318'}}>{error}</p>}
    {msg && <p style={{ background: BLUE_LIGHT, color: BLUE_DARK, padding: 10, borderRadius: 10, fontWeight:700 }}>{msg}</p>}
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'10px'}}>
      <section style={card}><div style={{ fontSize:12, color:'#667085' }}>Today Rides</div><strong style={{fontSize:'26px'}}>{stats.todayRides}</strong></section>
      <section style={card}><div style={{ fontSize:12, color:'#667085' }}>Active Drivers</div><strong style={{fontSize:'26px'}}>{stats.activeDrivers}</strong></section>
      <section style={card}><div style={{ fontSize:12, color:'#667085' }}>BuddyRide Commission Today</div><strong style={{fontSize:'26px'}}>R{stats.revenue.toFixed(2)}</strong></section>
      <section style={{...card, background: stats.pendingDrivers > 0 ? BLUE : '#fff', color: stats.pendingDrivers > 0 ? 'white' : '#182230'}}><div style={{ fontSize:12, color: stats.pendingDrivers > 0 ? '#B2CCFF' : '#667085' }}>Pending Approval</div><strong style={{fontSize:'26px'}}>{stats.pendingDrivers}</strong></section>
    </div>

    <section style={{...card, marginTop:'14px'}}>
      <h2 style={{marginTop:0}}>Pending Passenger Approvals ({pendingPassengers.length})</h2>
      {pendingPassengers.length === 0 ? <p style={{color:'#667085'}}>No passengers waiting. ✅</p> : pendingPassengers.map(d => renderRow(d, true))}
    </section>

    <section style={{...card, marginTop:'14px'}}>
      <h2 style={{marginTop:0}}>Pending Driver Approvals - Full 15 Docs ({pendingDrivers.length})</h2>
      {pendingDrivers.length === 0 ? <p style={{color:'#667085'}}>No drivers waiting for full approval. ✅</p> : pendingDrivers.map(d => renderRow(d, false))}
      <button onClick={() => load()} style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: BLUE_LIGHT, color: BLUE_DARK, border: 'none', fontWeight:700, cursor:'pointer' }}>Refresh</button>
    </section>

    <section style={{...card, marginTop:'14px', background:'#FFFAEB'}}>
      <h2 style={{marginTop:0}}>Identity Done - Inside App Finishing 11 Docs ({identityDrivers.length}) - Do NOT Approve Yet</h2>
      {identityDrivers.length === 0 ? <p style={{color:'#667085'}}>No identity drivers.</p> : identityDrivers.map(d => (
        <div key={d.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'12px 0', borderBottom:'1px solid #FEDF89' }}>
          <div><div style={{fontWeight:700}}>{d.full_name || d.email}</div><div style={{fontSize:12, color:'#667085'}}>{d.email} • {d.verification_status} • 4/15</div></div>
          <button onClick={() => onDocs(d.id)} style={{ padding:'8px 12px', borderRadius:8, background:'#fff', border:'1px solid #E4E7EC', fontWeight:700, cursor:'pointer' }}>View Docs</button>
        </div>
      ))}
    </section>

    <section style={{...card, marginTop:'14px'}}>
      <h2 style={{marginTop:0}}>Live Map - Polokwane</h2>
      <div style={{height:'420px', overflow:'hidden', borderRadius:'10px'}}>
        <OsmMapView center={[-23.9045, 29.4689]} availableCars={locations} theme="light" />
      </div>
      <p style={{fontSize:'12px', color:'#667085'}}>Showing {locations.length} online driver location(s). Auto-refreshes every 15s.</p>
    </section>
  </main>
}