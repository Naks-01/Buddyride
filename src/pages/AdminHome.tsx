import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type AdminModule = 'admin-dashboard'|'admin-documents'|'admin-rides'|'admin-passengers'|'admin-finance'|'admin-support'|'admin-zones'|'admin-settings'
type Props = { profile: Profile, onDocs: () => void, onAdminModule: (page: AdminModule) => void }

const BLUE = '#0066FF'
const BLUE_DARK = '#93C5FD'
const BLUE_LIGHT = '#1A2E4D'

// 🔒 HARD LOCK: ONLY THIS EMAIL CAN BE ADMIN - NO OTHER EMAIL!
const ADMIN_EMAIL = 'buddyride@outlook.com'

export function AdminHome({ profile, onDocs, onAdminModule }: Props) {
  const [stats, setStats] = useState({ rides: 0, drivers: 0, passengers: 0, active: 0, revenue: 0, pendingDrivers: 0 })
  const [pendingDocumentCounts, setPendingDocumentCounts] = useState({ drivers: 0, passengers: 0, total: 0 })
  const [documentCountError, setDocumentCountError] = useState('')
  const [tab, setTab] = useState<'overview'|'finance'|'zones'>('overview')
  const [loading, setLoading] = useState(true)
  const [commission, setCommission] = useState(20)

  const isAdmin = profile?.email?.toLowerCase().trim() === ADMIN_EMAIL

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', 'commission_percent').maybeSingle()
        if (!active || data?.value == null) return
        const parsed = Number(data.value)
        if (!Number.isNaN(parsed)) setCommission(parsed)
      } catch {}
    })()
    return () => { active = false }
  }, [])

  async function load() {
    if (!isAdmin) return
    setLoading(true)
    setDocumentCountError('')
    try {
      const [ridesRes, driversRes, passengersRes, pendingDriversRes] = await Promise.all([
        supabase.from('rides').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'driver'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'passenger'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'driver').in('verification_status', ['pending', 'pending_verification', 'PENDING', 'PENDING_VERIFICATION']),
      ])

      const getCount = (res: any) => (res.error ? 0 : res.count || 0)
      const rides = getCount(ridesRes)
      const drivers = getCount(driversRes)
      const passengers = getCount(passengersRes)
      const pendingDrivers = getCount(pendingDriversRes)

      // FIXED: Real active drivers from driver_status (same table PassengerHome uses), not driver_locations
      let active = 0
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { data: activeRows } = await supabase.from('driver_status').select('driver_id').eq('is_online', true).gte('updated_at', fiveMinAgo)
        active = new Set((activeRows || []).map(r => r.driver_id)).size
      } catch { active = 0 }

      let pendingDocs = 0
      try {
        const { count } = await supabase.from('driver_documents').select('id', { count: 'exact', head: true }).ilike('status', 'pending')
        pendingDocs = count || 0
        if (pendingDocs === 0) {
          const { data } = await supabase.from('driver_documents').select('status')
          pendingDocs = (data || []).filter((d: any) => d.status?.toLowerCase() === 'pending').length
        }
      } catch { pendingDocs = 0 }

      // FIXED: Revenue from REAL columns: fare only. No total_fare / buddyride_commission columns exist.
      // Use same formula as AdminRides: fare * commission%
      let revenue = 0
      try {
        const { data: revData } = await supabase.from('rides').select('fare').in('status', ['completed','rated']).limit(1000)
        revenue = (revData || []).reduce((s: number, r: any) => {
          const gross = Number(r.fare ?? 0)
          return s + (gross * commission / 100)
        }, 0)
      } catch { revenue = 0 }

      let pendingPassengers = 0
      try {
        const { data: pp } = await supabase.from('profiles').select('id').eq('role', 'passenger').in('verification_status', ['pending', 'pending_verification', 'PENDING', 'PENDING_VERIFICATION'])
        pendingPassengers = pp?.length || 0
      } catch { pendingPassengers = 0 }

      setStats({ rides, drivers, passengers, active, revenue, pendingDrivers })
      setPendingDocumentCounts({ drivers: pendingDocs, passengers: pendingPassengers, total: pendingDocs + pendingPassengers })
    } catch (loadError: any) {
      setDocumentCountError(loadError?.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [isAdmin, commission])

  if (!isAdmin) {
    return (
      <main style={{ minHeight:'100vh', background:'#0A0A0B', color:'#FFFFFF', padding:'16px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center' }}>
        <p style={{ fontSize:'50px', margin:0 }}>🚫</p>
        <h1 style={{ fontSize:'22px' }}>Access Denied</h1>
        <p style={{ color:'#8A8A93', fontSize:'14px', maxWidth:300 }}>Only <b style={{color:'#FFFFFF'}}>buddyride@outlook.com</b> can access Admin.<br/>Logged in as: {profile?.email}</p>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop:16, padding:'12px 24px', borderRadius:'999px', background:'#ef4444', color:'white', border:'none', fontWeight:'bold', cursor:'pointer' }}>Log Out</button>
      </main>
    )
  }

  const card: any = { background:'#15151A', borderRadius:'16px', padding:'14px', marginBottom:'12px', color:'#FFFFFF', border:'1px solid rgba(255,255,255,0.08)', boxShadow:'0 5px 18px rgba(0,0,0,0.3)' }
  const grid2: any = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }
  const btnTab = (active: boolean): any => ({ padding:'8px 14px', borderRadius:'999px', border:'1px solid rgba(255,255,255,0.08)', fontSize:'13px', fontWeight:'bold', cursor:'pointer', background: active? BLUE : '#1E1E24', color: active? 'white' : '#8A8A93', boxShadow:'0 2px 8px rgba(0,0,0,0.3)' })

  return (
    <main style={{ minHeight:'100vh', background:'#0A0A0B', color:'#FFFFFF', padding:'16px', paddingBottom:'100px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div><h1 style={{ fontSize:'22px', fontWeight:'bold', margin:0, color:'#FFFFFF' }}>Admin Command Center</h1><p style={{ fontSize:'12px', color:'#8A8A93', margin:0 }}>Welcome {profile.full_name || profile.email} 👑 ONLY ADMIN buddyride@outlook.com</p></div>
        <div style={{ display: 'flex', gap: 8 }}><button onClick={() => load()} style={{ padding:'8px 14px', borderRadius:'999px', background: BLUE, color:'white', border:'none', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>{loading ? '...' : '↻ Refresh'}</button><button onClick={() => supabase.auth.signOut()} style={{ padding:'8px 14px', borderRadius:'999px', background:'#1E1E24', color:'#8A8A93', border:'1px solid rgba(255,255,255,0.08)', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>Log out</button></div>
      </div>
      <div style={grid2}>
        <div style={card}><p style={{ fontSize:'10px', color:'#8A8A93', margin:0 }}>TOTAL RIDES</p><p style={{ fontSize:'22px', fontWeight:'bold', margin:'4px 0 0' }}>{stats.rides}</p></div>
        <div style={card}><p style={{ fontSize:'10px', color:'#8A8A93', margin:0 }}>ACTIVE DRIVERS</p><p style={{ fontSize:'22px', fontWeight:'bold', margin:'4px 0 0' }}>{stats.active} / {stats.drivers}</p></div>
        <div style={card}><p style={{ fontSize:'10px', color:'#8A8A93', margin:0 }}>PASSENGERS</p><p style={{ fontSize:'22px', fontWeight:'bold', margin:'4px 0 0' }}>{stats.passengers}</p></div>
        <div style={{...card, background: BLUE, color:'white' }}><p style={{ fontSize:'10px', margin:0, color:'#B2CCFF' }}>RECORDED PLATFORM COMMISSION ({commission}%)</p><p style={{ fontSize:'22px', fontWeight:'bold', margin:'4px 0 0' }}>R {stats.revenue.toFixed(2)}</p><p style={{ fontSize:'11px', margin:'4px 0 0', color:'#B2CCFF' }}>From completed rides</p></div>
      </div>
      {stats.pendingDrivers > 0 && (<div style={{ background: BLUE_LIGHT, borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid #2A4A8A` }}><p style={{ margin: 0, fontWeight: 'bold', color: BLUE_DARK }}>⚠️ {stats.pendingDrivers} driver(s) waiting for approval</p><button onClick={onDocs} style={{ marginTop: 8, width: '100%', padding: 12, borderRadius: 10, background: BLUE, color: 'white', fontWeight: 'bold', border: 'none', cursor:'pointer' }}>Approve Now →</button></div>)}
      {pendingDocumentCounts.passengers > 0 && (<div style={{ background: '#1C1500', borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid #78350F` }}><p style={{ margin: 0, fontWeight: 'bold', color: '#FDE68A' }}>⚠️ {pendingDocumentCounts.passengers} passenger(s) waiting for ID approval</p><button onClick={() => onAdminModule('admin-passengers')} style={{ marginTop: 8, width: '100%', padding: 12, borderRadius: 10, background: '#ea580c', color: 'white', fontWeight: 'bold', border: 'none', cursor:'pointer' }}>Review Passengers →</button></div>)}
      <div style={{ display:'flex', gap:'8px', marginBottom:'14px', overflowX:'auto' }}><button onClick={()=>setTab('overview')} style={btnTab(tab==='overview')}>📊 Overview</button><button onClick={()=>setTab('finance')} style={btnTab(tab==='finance')}>💰 Finance</button><button onClick={()=>setTab('zones')} style={btnTab(tab==='zones')}>📍 Zones</button></div>
      {tab==='overview' && (<>
        <div style={card}><h3 style={{ margin:'0 0 8px', color:'#FFFFFF' }}>Live Ride Monitoring</h3><div style={{ background: '#1E1E24', borderRadius:'12px', height:'100px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color: BLUE_DARK, border:'1px solid rgba(255,255,255,0.08)' }}>Active: {stats.active} drivers online • Configure fare categories in Settings</div></div>
        <div style={card}><p style={{ fontWeight:'bold', margin:'0 0 6px 0', color:'#FFFFFF' }}>👑 Approve Documents {pendingDocumentCounts.drivers}</p><p style={{ fontSize:'12px', color:'#8A8A93', margin:'0 0 10px 0' }}>Driver docs pending: {pendingDocumentCounts.drivers} · Passengers pending: {pendingDocumentCounts.passengers} · Drivers waiting: {stats.pendingDrivers}</p>{documentCountError && <p role="alert" style={{ fontSize:'12px', color:'#FCA5A5' }}>Could not load document counts: {documentCountError}</p>}<p style={{ fontSize:'12px', color:'#8A8A93', margin:'0 0 10px 0' }}>Verify driver IDs, licenses, vehicles + passenger IDs + selfies — ONLY ADMIN APPROVES</p><button onClick={onDocs} style={{ width:'100%', padding:'14px', borderRadius:'12px', background: BLUE, color:'white', fontWeight:'bold', border:'none', cursor:'pointer' }}>Go to Documents ({pendingDocumentCounts.drivers}) →</button></div>
        <div style={card}><h3 style={{marginTop:0, color:'#FFFFFF'}}>Admin Modules</h3><div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:'8px'}}>{([['Dashboard','admin-dashboard'],[`Documents: ${pendingDocumentCounts.total} total, ${pendingDocumentCounts.drivers} pending`,'admin-documents'],['Rides','admin-rides'],['Passengers','admin-passengers'],['Finance','admin-finance'],['SOS Support','admin-support'],['Zones','admin-zones'],['Settings','admin-settings']] as const).map(([label,page])=><button key={page} onClick={()=>onAdminModule(page)} style={{padding:'10px', borderRadius:'8px', border: page==='admin-documents' ? `2px solid ${BLUE}` : '1px solid rgba(255,255,255,0.08)', background: page==='admin-documents' ? BLUE_LIGHT : '#1E1E24', color: page==='admin-documents' ? BLUE_DARK : '#FFFFFF', fontWeight: page==='admin-documents' ? 'bold' : 'normal', cursor:'pointer'}}>{label}</button>)}</div></div>
      </>)}
      {tab==='finance' && (<div style={card}><h3 style={{color:'#FFFFFF'}}>Fare Configuration</h3><p style={{color:'#8A8A93'}}>Fare categories and commission are managed in Admin Settings and used by ride requests.</p><button onClick={()=>onAdminModule('admin-settings')} style={{padding:'12px', borderRadius:'10px', background: BLUE, color:'white', fontWeight:'bold', border:'none', cursor:'pointer'}}>Open fare settings →</button></div>)}
      {tab==='zones' && (<div style={card}><h3 style={{color:'#FFFFFF'}}>Service zones</h3><p style={{color:'#8A8A93'}}>Service zones can be edited and saved here. They are currently informational: ride matching does not yet enforce zone boundaries.</p><button onClick={()=>onAdminModule('admin-zones')} style={{padding:'12px', borderRadius:'10px', background: BLUE, color:'white', fontWeight:'bold', border:'none', cursor:'pointer'}}>View service zones →</button></div>)}
    </main>
  )
}