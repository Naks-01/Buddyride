import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type AdminModule = 'admin-dashboard'|'admin-documents'|'admin-rides'|'admin-passengers'|'admin-finance'|'admin-support'|'admin-zones'|'admin-settings'
type Props = { profile: Profile, onDocs: () => void, onAdminModule: (page: AdminModule) => void }

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

// 🔒 HARD LOCK: ONLY THIS EMAIL CAN BE ADMIN - NO OTHER EMAIL!
const ADMIN_EMAIL = 'buddyride@outlook.com'

export function AdminHome({ profile, onDocs, onAdminModule }: Props) {
  const [stats, setStats] = useState({ rides: 0, drivers: 0, passengers: 0, active: 0, revenue: 0, pendingDrivers: 0 })
  const [pendingDocumentCounts, setPendingDocumentCounts] = useState({ drivers: 0, passengers: 0, total: 0 })
  const [documentCountError, setDocumentCountError] = useState('')
  const [tab, setTab] = useState<'overview'|'finance'|'zones'>('overview')
  const [loading, setLoading] = useState(true)

  const isAdmin = profile?.email?.toLowerCase().trim() === ADMIN_EMAIL

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

      // FIX: Real active drivers - location updated in last 5 min, not hardcoded 0
      let active = 0
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { data: activeRows } = await supabase.from('driver_locations').select('driver_id').gte('updated_at', fiveMinAgo)
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

      // FIX: 20% commission like AdminFinance, same columns (total_fare/fare/buddyride_commission), not fare_amount/price * 0.15
      let revenue = 0
      try {
        const { data: revData } = await supabase.from('rides').select('total_fare,fare,buddyride_commission').in('status', ['completed','rated']).limit(500)
        revenue = (revData || []).reduce((s: number, r: any) => {
          const gross = Number(r.total_fare ?? r.fare ?? 0)
          const commission = Number(r.buddyride_commission ?? Math.round(gross * 0.2))
          return s + commission
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

  useEffect(() => { void load() }, [isAdmin])

  if (!isAdmin) {
    return (
      <main style={{ minHeight:'100vh', background:'#F8F9FA', color:'#182230', padding:'16px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center' }}>
        <p style={{ fontSize:'50px', margin:0 }}>🚫</p>
        <h1 style={{ fontSize:'22px' }}>Access Denied</h1>
        <p style={{ color:'#667085', fontSize:'14px', maxWidth:300 }}>Only <b style={{color:'#182230'}}>buddyride@outlook.com</b> can access Admin.<br/>Logged in as: {profile?.email}</p>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop:16, padding:'12px 24px', borderRadius:'999px', background:'#ef4444', color:'white', border:'none', fontWeight:'bold', cursor:'pointer' }}>Log Out</button>
      </main>
    )
  }

  const card: any = { background:'#fff', borderRadius:'16px', padding:'14px', marginBottom:'12px', color:'#182230', border:'1px solid #EDF0F3', boxShadow:'0 5px 18px rgba(20,33,50,0.045)' }
  const grid2: any = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }
  const btnTab = (active: boolean): any => ({ padding:'8px 14px', borderRadius:'999px', border:'none', fontSize:'13px', fontWeight:'bold', cursor:'pointer', background: active? BLUE : '#fff', color: active? 'white' : '#344054', boxShadow:'0 2px 8px rgba(20,33,50,0.06)' })

  return (
    <main style={{ minHeight:'100vh', background:'#F8F9FA', color:'#182230', padding:'16px', paddingBottom:'100px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div><h1 style={{ fontSize:'22px', fontWeight:'bold', margin:0 }}>Admin Command Center</h1><p style={{ fontSize:'12px', color:'#667085', margin:0 }}>Welcome {profile.full_name || profile.email} 👑 ONLY ADMIN buddyride@outlook.com</p></div>
        <div style={{ display: 'flex', gap: 8 }}><button onClick={() => load()} style={{ padding:'8px 14px', borderRadius:'999px', background: BLUE, color:'white', border:'none', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>{loading ? '...' : '↻ Refresh'}</button><button onClick={() => supabase.auth.signOut()} style={{ padding:'8px 14px', borderRadius:'999px', background:'#F2F4F7', color:'#344054', border:'1px solid #E4E7EC', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>Log out</button></div>
      </div>
      <div style={grid2}>
        <div style={card}><p style={{ fontSize:'10px', color:'#667085', margin:0 }}>TOTAL RIDES</p><p style={{ fontSize:'22px', fontWeight:'bold', margin:'4px 0 0' }}>{stats.rides}</p></div>
        <div style={card}><p style={{ fontSize:'10px', color:'#667085', margin:0 }}>ACTIVE DRIVERS</p><p style={{ fontSize:'22px', fontWeight:'bold', margin:'4px 0 0' }}>{stats.active} / {stats.drivers}</p></div>
        <div style={card}><p style={{ fontSize:'10px', color:'#667085', margin:0 }}>PASSENGERS</p><p style={{ fontSize:'22px', fontWeight:'bold', margin:'4px 0 0' }}>{stats.passengers}</p></div>
        <div style={{...card, background: BLUE, color:'white' }}><p style={{ fontSize:'10px', margin:0, color:'#B2CCFF' }}>RECORDED PLATFORM COMMISSION</p><p style={{ fontSize:'22px', fontWeight:'bold', margin:'4px 0 0' }}>R {stats.revenue.toFixed(2)}</p><p style={{ fontSize:'11px', margin:'4px 0 0' }}>From completed rides</p></div>
      </div>
      {stats.pendingDrivers > 0 && (<div style={{ background: BLUE_LIGHT, borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid #B2CCFF` }}><p style={{ margin: 0, fontWeight: 'bold', color: BLUE_DARK }}>⚠️ {stats.pendingDrivers} driver(s) waiting for approval</p><button onClick={onDocs} style={{ marginTop: 8, width: '100%', padding: 12, borderRadius: 10, background: BLUE, color: 'white', fontWeight: 'bold', border: 'none', cursor:'pointer' }}>Approve Now →</button></div>)}
      <div style={{ display:'flex', gap:'8px', marginBottom:'14px', overflowX:'auto' }}><button onClick={()=>setTab('overview')} style={btnTab(tab==='overview')}>📊 Overview</button><button onClick={()=>setTab('finance')} style={btnTab(tab==='finance')}>💰 Finance</button><button onClick={()=>setTab('zones')} style={btnTab(tab==='zones')}>📍 Zones</button></div>
      {tab==='overview' && (<>
        <div style={card}><h3 style={{ margin:'0 0 8px' }}>Live Ride Monitoring</h3><div style={{ background: BLUE_LIGHT, borderRadius:'12px', height:'100px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color: BLUE_DARK }}>Active: {stats.active} drivers online • Configure fare categories in Settings</div></div>
        <div style={card}><p style={{ fontWeight:'bold', margin:'0 0 6px 0' }}>👑 Approve Documents {pendingDocumentCounts.drivers}</p><p style={{ fontSize:'12px', color:'#667085', margin:'0 0 10px 0' }}>Driver docs pending: {pendingDocumentCounts.drivers} · Passengers pending: {pendingDocumentCounts.passengers} · Drivers waiting: {stats.pendingDrivers}</p>{documentCountError && <p role="alert" style={{ fontSize:'12px', color:'#B42318' }}>Could not load document counts: {documentCountError}</p>}<p style={{ fontSize:'12px', color:'#667085', margin:'0 0 10px 0' }}>Verify driver IDs, licenses, vehicles + passenger IDs + selfies — ONLY ADMIN APPROVES</p><button onClick={onDocs} style={{ width:'100%', padding:'14px', borderRadius:'12px', background: BLUE, color:'white', fontWeight:'bold', border:'none', cursor:'pointer' }}>Go to Documents ({pendingDocumentCounts.drivers}) →</button></div>
        <div style={card}><h3 style={{marginTop:0}}>Admin Modules</h3><div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:'8px'}}>{([['Dashboard','admin-dashboard'],[`Documents: ${pendingDocumentCounts.total} total, ${pendingDocumentCounts.drivers} pending`,'admin-documents'],['Rides','admin-rides'],['Passengers','admin-passengers'],['Finance','admin-finance'],['SOS Support','admin-support'],['Zones','admin-zones'],['Settings','admin-settings']] as const).map(([label,page])=><button key={page} onClick={()=>onAdminModule(page)} style={{padding:'10px', borderRadius:'8px', border: page==='admin-documents' ? `2px solid ${BLUE}` : '1px solid #E4E7EC', background: page==='admin-documents' ? BLUE_LIGHT : '#fff', color: page==='admin-documents' ? BLUE_DARK : '#182230', fontWeight: page==='admin-documents' ? 'bold' : 'normal', cursor:'pointer'}}>{label}</button>)}</div></div>
      </>)}
      {tab==='finance' && (<div style={card}><h3>Fare Configuration</h3><p>Fare categories and commission are managed in Admin Settings and used by ride requests.</p><button onClick={()=>onAdminModule('admin-settings')} style={{padding:'12px', borderRadius:'10px', background: BLUE, color:'white', fontWeight:'bold', border:'none', cursor:'pointer'}}>Open fare settings →</button></div>)}
      {tab==='zones' && (<div style={card}><h3>Service zones</h3><p>Service zones are not yet configurable. The displayed map coverage is informational only.</p><button onClick={()=>onAdminModule('admin-zones')} style={{padding:'12px', borderRadius:'10px', background: BLUE, color:'white', fontWeight:'bold', border:'none', cursor:'pointer'}}>View service zones →</button></div>)}
    </main>
  )
}