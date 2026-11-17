import { useEffect, useRef, useState } from 'react'
import { OsmMapView } from '../components/OsmMapView'
import { supabase } from '../lib/supabase'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const ORANGE = '#FF6B00'

type DriverLocation = { driver_id: string, lat: number, lng: number }
type PendingUser = { id: string, full_name: string, email: string, phone_number: string, verification_status: string, avatar_url: string, created_at: string, role: string }

type AdminModule = 'admin-dashboard' | 'admin-docs' | 'admin-rides' | 'admin-passengers' | 'admin-finance' | 'admin-support' | 'admin-zones' | 'admin-settings'

export function AdminDashboard({ onBack, onDocs, onAdminModule }: { onBack: () => void; onDocs: (driverId: string) => void; onAdminModule?: (m: AdminModule) => void }) {
  const [authorization, setAuthorization] = useState<'checking' | 'authorized' | 'unauthorized'>('checking')
  const [stats, setStats] = useState({ todayRides: 0, activeDrivers: 0, revenue: 0, pendingDrivers: 0 })
  const [locations, setLocations] = useState<DriverLocation[]>([])
  const [pendingDrivers, setPendingDrivers] = useState<PendingUser[]>([])
  const [pendingPassengers, setPendingPassengers] = useState<PendingUser[]>([])
  const [identityDrivers, setIdentityDrivers] = useState<PendingUser[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'drivers' | 'passengers' | 'with-phone'>('all')
  const loadingRef = useRef(false)

  const bg = '#0e0e10'
  const bgCard = '#121214'
  const bg2 = '#242428'
  const text = 'white'
  const subText = '#9ca3af'
  const border = 'rgba(255,255,255,0.08)'

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
    if (loadingRef.current) return
    loadingRef.current = true
    setError('')
    try {
      const [statsResult, pendingDriverResult, pendingPassengerResult, identityResult] = await Promise.all([
        supabase.rpc('admin_dashboard_stats'),
        supabase.from('profiles')
          .select('id,full_name,email,phone_number,verification_status,avatar_url,created_at,role')
          .eq('role', 'driver')
          .in('verification_status', ['pending', 'pending_verification'])
          .order('created_at', { ascending: true }),
        supabase.from('profiles')
          .select('id,full_name,email,phone_number,verification_status,avatar_url,created_at,role')
          .eq('role', 'passenger')
          .in('verification_status', ['pending', 'pending_verification'])
          .order('created_at', { ascending: true }),
        supabase.from('profiles')
          .select('id,full_name,email,phone_number,verification_status,avatar_url,created_at,role')
          .eq('role', 'driver')
          .eq('verification_status', 'identity_complete')
          .order('created_at', { ascending: true }),
      ])
      // FIXED: driver_status may not exist - fall back to driver_locations
      let locs: DriverLocation[] = []
      const { data: statusLocs, error: statusErr } = await supabase.from('driver_status').select('driver_id,lat,lng').eq('is_online', true)
      if (!statusErr && statusLocs) {
        locs = statusLocs.filter((d: any): d is DriverLocation => typeof d.lat === 'number' && typeof d.lng === 'number')
      } else {
        const { data: altLocs } = await supabase.from('driver_locations').select('driver_id,lat,lng').eq('is_online', true)
        if (altLocs) locs = altLocs.filter((d: any): d is DriverLocation => typeof d.lat === 'number' && typeof d.lng === 'number')
      }

      if (statsResult.error || pendingDriverResult.error || pendingPassengerResult.error || identityResult.error) {
        setError(statsResult.error?.message || pendingDriverResult.error?.message || pendingPassengerResult.error?.message || identityResult.error?.message || 'Could not load dashboard data.')
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
      setLocations(locs)
      setPendingDrivers((pendingDriverResult.data || []) as PendingUser[])
      setPendingPassengers((pendingPassengerResult.data || []) as PendingUser[])
      setIdentityDrivers((identityResult.data || []) as PendingUser[])
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      loadingRef.current = false
    }
  }

  useEffect(() => {
    if (authorization !== 'authorized') return
    void load()
    const interval = setInterval(() => void load(), 5000)
    const ch = supabase.channel('admin-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_status' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents' }, () => void load())
      .subscribe()
    return () => { clearInterval(interval); void supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorization])

  async function approveDriver(driverId: string, approve: boolean, name: string) {
    if (!confirm(approve ? `Approve driver ${name}? Driver can then GO ONLINE.` : `Reject driver ${name}? Driver will need to fix documents.`)) return
    setProcessing(driverId); setMsg('')
    try {
      const { error: approvalError } = await supabase.rpc('admin_set_driver_verification', {
        p_driver_id: driverId,
        p_approve: approve,
        p_rejection_reason: approve ? null : 'Rejected by BuddyRide admin. Please replace the rejected documents.',
      })
      if (approvalError) throw approvalError
      // FIXED: Do NOT force is_online=false after approval - driver must be able to Go Online
      setMsg(approve ? 'Driver approved. Driver can now GO ONLINE.' : 'Driver rejected.')
      await load()
    } catch (e: unknown) {
      setMsg(`Could not ${approve ? 'approve' : 'reject'} driver: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setProcessing(null) }
  }

  async function approvePassenger(userId: string, approve: boolean, name: string) {
    if (!confirm(approve ? `Approve passenger ${name}?` : `Reject passenger ${name}?`)) return
    setProcessing(userId); setMsg('')
    try {
      const { error } = await supabase.rpc('admin_set_passenger_verification', {
        p_user_id: userId,
        p_approve: approve,
        p_rejection_reason: approve ? null : 'Rejected by BuddyRide admin.',
      })
      if (error) {
        const { error: fallbackError } = await supabase.from('profiles').update({
          is_verified: approve,
          verification_status: approve ? 'verified' : 'rejected',
        }).eq('id', userId).eq('role', 'passenger')
        if (fallbackError) throw fallbackError
      }
      setMsg(approve ? 'Passenger approved.' : 'Passenger rejected.')
      await load()
    } catch (e: unknown) {
      setMsg(`Could not ${approve ? 'approve' : 'reject'} passenger: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setProcessing(null) }
  }

  const goModule = (m: AdminModule) => {
    if (onAdminModule) onAdminModule(m)
    else onBack()
  }

  if (authorization === 'unauthorized') return <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: bg, color: text }}>Unauthorized</main>
  if (authorization !== 'authorized') return <main role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: bg, color: subText }}>Verifying admin access…</main>

  const card = { background: bgCard, borderRadius: '16px', padding: '16px', border: `1px solid ${border}`, boxShadow: '0 5px 18px rgba(0,0,0,0.3)' }

  // FIXED: Filters now actually filter the lists below
  const showDrivers = filter === 'all' || filter === 'drivers' || filter === 'with-phone'
  const showPassengers = filter === 'all' || filter === 'passengers' || filter === 'with-phone'
  const filteredDrivers = filter === 'with-phone' ? pendingDrivers.filter(d => Boolean((d.phone_number || '').trim())) : pendingDrivers
  const filteredPassengers = filter === 'with-phone' ? pendingPassengers.filter(d => Boolean((d.phone_number || '').trim())) : pendingPassengers

  const filterBtn = (key: typeof filter, label: string) => (
    <button key={key} onClick={() => setFilter(key)} style={{ padding: '8px 14px', borderRadius: 20, background: filter === key ? BLUE : bg2, color: filter === key ? 'white' : subText, border: `1px solid ${border}`, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
  )

  const renderRow = (d: PendingUser, isPassenger: boolean) => (
    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: `1px solid ${border}`, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {d.avatar_url && <img src={d.avatar_url} alt="avatar" style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover' }} />}
        <div><div style={{ fontWeight: 700, color: text }}>{d.full_name || d.email}</div><div style={{ fontSize: 12, color: subText }}>{d.phone_number || 'No phone'} • {d.email} • {d.verification_status}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onDocs(d.id)} style={{ padding: '8px 12px', borderRadius: 8, background: bg2, color: text, border: `1px solid ${border}`, cursor: 'pointer', fontWeight: 700 }}>View Documents</button>
        <button disabled={processing === d.id} onClick={() => isPassenger ? approvePassenger(d.id, false, d.full_name || d.email) : approveDriver(d.id, false, d.full_name || d.email)} style={{ padding: '8px 12px', borderRadius: 8, background: '#7f1d1d', color: '#fecaca', border: '1px solid #991b1b', cursor: 'pointer', fontWeight: 700 }}>Reject</button>
        <button disabled={processing === d.id} onClick={() => isPassenger ? approvePassenger(d.id, true, d.full_name || d.email) : approveDriver(d.id, true, d.full_name || d.email)} style={{ padding: '8px 12px', borderRadius: 8, background: BLUE, color: 'white', border: 0, fontWeight: 700, cursor: 'pointer' }}>{processing === d.id ? '...' : 'Approve ✅'}</button>
      </div>
    </div>
  )

  return <main style={{ minHeight: '100vh', background: bg, color: text, padding: '16px' }}>
    <button onClick={onBack} style={{ marginBottom: '12px', background: bg2, color: text, border: `1px solid ${border}`, padding: '8px 14px', borderRadius: 999, fontWeight: 700, cursor: 'pointer' }}>← Admin home</button>
    <h1 style={{ margin: '8px 0 16px', color: text }}>Admin Command Center</h1>
    {error && <p role="alert" style={{ color: '#fca5a5', background: '#7f1d1d', padding: 10, borderRadius: 10 }}>{error}</p>}
    {msg && <p style={{ background: '#1e293b', color: '#93c5fd', padding: 10, borderRadius: 10, fontWeight: 700, border: `1px solid ${border}` }}>{msg}</p>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '10px' }}>
      <section style={card}><div style={{ fontSize: 12, color: subText }}>Today Rides</div><strong style={{ fontSize: '26px', color: text }}>{stats.todayRides}</strong></section>
      <section style={card}><div style={{ fontSize: 12, color: subText }}>Active Drivers</div><strong style={{ fontSize: '26px', color: text }}>{stats.activeDrivers}</strong></section>
      <section style={card}><div style={{ fontSize: 12, color: subText }}>BuddyRide Commission Today</div><strong style={{ fontSize: '26px', color: text }}>R{stats.revenue.toFixed(2)}</strong></section>
      <section style={{ ...card, background: stats.pendingDrivers > 0 ? BLUE : bgCard, border: `1px solid ${stats.pendingDrivers > 0 ? BLUE : border}` }}><div style={{ fontSize: 12, color: stats.pendingDrivers > 0 ? '#B2CCFF' : subText }}>Pending Approval</div><strong style={{ fontSize: '26px', color: stats.pendingDrivers > 0 ? 'white' : text }}>{stats.pendingDrivers}</strong></section>
    </div>

    <div style={{ display: 'flex', gap: 8, marginTop: '14px', flexWrap: 'wrap' }}>
      {filterBtn('all', `All (${pendingDrivers.length + pendingPassengers.length})`)}
      {filterBtn('drivers', `Drivers (${pendingDrivers.length})`)}
      {filterBtn('passengers', `Passengers (${pendingPassengers.length})`)}
      {filterBtn('with-phone', 'With Phone')}
    </div>

    {showPassengers && (
      <section style={{ ...card, marginTop: '14px' }}>
        <h2 style={{ marginTop: 0, color: text }}>Pending Passenger Approvals ({filteredPassengers.length})</h2>
        {filteredPassengers.length === 0 ? <p style={{ color: subText }}>No passengers waiting. ✅</p> : filteredPassengers.map(d => renderRow(d, true))}
      </section>
    )}

    {showDrivers && (
      <section style={{ ...card, marginTop: '14px' }}>
        <h2 style={{ marginTop: 0, color: text }}>Pending Driver Approvals - Full 15 Docs ({filteredDrivers.length})</h2>
        {filteredDrivers.length === 0 ? <p style={{ color: subText }}>No drivers waiting for full approval. ✅</p> : filteredDrivers.map(d => renderRow(d, false))}
        <button onClick={() => void load()} style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 700, cursor: 'pointer' }}>Refresh</button>
      </section>
    )}

    <section style={{ ...card, marginTop: '14px', background: '#1c1500', border: '1px solid #78350f' }}>
      <h2 style={{ marginTop: 0, color: '#fde68a' }}>Identity Done - Inside App Finishing 11 Docs ({identityDrivers.length}) - Do NOT Approve Yet</h2>
      {identityDrivers.length === 0 ? <p style={{ color: subText }}>No identity drivers.</p> : identityDrivers.map(d => (
        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: `1px solid ${border}` }}>
          <div><div style={{ fontWeight: 700, color: text }}>{d.full_name || d.email}</div><div style={{ fontSize: 12, color: subText }}>{d.email} • {d.verification_status} • 4/15</div></div>
          <button onClick={() => onDocs(d.id)} style={{ padding: '8px 12px', borderRadius: 8, background: bg2, border: `1px solid ${border}`, color: text, fontWeight: 700, cursor: 'pointer' }}>View Docs</button>
        </div>
      ))}
    </section>

    <section style={{ ...card, marginTop: '14px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <span style={{ padding: '6px 12px', borderRadius: 20, background: BLUE, color: 'white', fontSize: 12, fontWeight: 700 }}>Live Ride Monitoring</span>
      </div>
      <div style={{ height: '420px', overflow: 'hidden', borderRadius: '10px', background: '#000' }}>
        <OsmMapView center={[-23.9045, 29.4689]} availableCars={locations} theme="dark" />
      </div>
      <p style={{ fontSize: '12px', color: subText }}>Showing {locations.length} online driver location(s). Auto-refreshes every 5s.</p>
    </section>

    <section style={{ ...card, marginTop: '14px' }}>
      <h3 style={{ color: text, marginTop: 0 }}>Admin Modules</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => goModule('admin-dashboard')} style={{ padding: '8px 14px', borderRadius: 8, background: BLUE, color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Dashboard</button>
        <button onClick={() => goModule('admin-docs')} style={{ padding: '8px 14px', borderRadius: 8, background: ORANGE, color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Documents ({pendingDrivers.length + pendingPassengers.length} pending)</button>
        <button onClick={() => goModule('admin-rides')} style={{ padding: '8px 14px', borderRadius: 8, background: bg2, color: subText, border: `1px solid ${border}`, fontSize: 12, cursor: 'pointer' }}>Rides</button>
        <button onClick={() => goModule('admin-passengers')} style={{ padding: '8px 14px', borderRadius: 8, background: bg2, color: subText, border: `1px solid ${border}`, fontSize: 12, cursor: 'pointer' }}>Passengers</button>
        <button onClick={() => goModule('admin-finance')} style={{ padding: '8px 14px', borderRadius: 8, background: bg2, color: subText, border: `1px solid ${border}`, fontSize: 12, cursor: 'pointer' }}>Finance</button>
        <button onClick={() => goModule('admin-support')} style={{ padding: '8px 14px', borderRadius: 8, background: bg2, color: subText, border: `1px solid ${border}`, fontSize: 12, cursor: 'pointer' }}>SOS Support</button>
        <button onClick={() => goModule('admin-zones')} style={{ padding: '8px 14px', borderRadius: 8, background: bg2, color: subText, border: `1px solid ${border}`, fontSize: 12, cursor: 'pointer' }}>Zones</button>
        <button onClick={() => goModule('admin-settings')} style={{ padding: '8px 14px', borderRadius: 8, background: bg2, color: subText, border: `1px solid ${border}`, fontSize: 12, cursor: 'pointer' }}>Settings</button>
      </div>
    </section>
  </main>
}