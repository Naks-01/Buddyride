import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type AdminModule = 'admin-dashboard'|'admin-documents'|'admin-rides'|'admin-passengers'|'admin-finance'|'admin-support'|'admin-zones'|'admin-settings'
type Props = { profile: Profile, onDocs: () => void, onAdminModule: (page: AdminModule) => void }

export function AdminHome({ profile, onDocs, onAdminModule }: Props) {
  const [stats, setStats] = useState({ rides: 0, drivers: 0, passengers: 0, active: 0, revenue: 0 })
  const [tab, setTab] = useState<'overview'|'finance'|'zones'>('overview')

  useEffect(() => {
    (async () => {
      const { count: ridesCount } = await supabase.from('rides').select('*', { count: 'exact', head: true })
      const { count: driversCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'driver')
      const { count: passengersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'passenger')
      const { count: activeCount } = await supabase.from('driver_status').select('*', { count: 'exact', head: true }).eq('is_online', true)
      const { data: completedRides } = await supabase.from('rides').select('buddyride_commission').eq('status', 'completed')
      const revenue = (completedRides || []).reduce((total, ride) => total + Number(ride.buddyride_commission || 0), 0)
      setStats({ rides: ridesCount||0, drivers: driversCount||0, passengers: passengersCount||0, active: activeCount||0, revenue })
    })()
  }, [])

  const card: any = { background:'#1e293b', borderRadius:'16px', padding:'14px', marginBottom:'12px', color:'white' }
  const grid2: any = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }
  const btnTab = (active: boolean): any => ({ padding:'8px 14px', borderRadius:'999px', border:'none', fontSize:'13px', fontWeight:'bold', cursor:'pointer', background: active? 'white' : '#1e293b', color: active? 'black' : 'white' })

  return (
    <main style={{ minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px', paddingBottom:'100px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div>
          <h1 style={{ fontSize:'22px', fontWeight:'bold', margin:0 }}>Admin Command Center</h1>
          <p style={{ fontSize:'12px', color:'#94a3b8', margin:0 }}>Welcome {profile.full_name || profile.email} 👑</p>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ padding:'8px 14px', borderRadius:'999px', background:'#334155', color:'white', border:'none', fontSize:'12px' }}>Log out</button>
      </div>

      <div style={grid2}>
        <div style={card}><p style={{ fontSize:'10px', color:'#94a3b8' }}>TOTAL RIDES</p><p style={{ fontSize:'22px', fontWeight:'bold' }}>{stats.rides}</p></div>
        <div style={card}><p style={{ fontSize:'10px', color:'#94a3b8' }}>ACTIVE DRIVERS</p><p style={{ fontSize:'22px', fontWeight:'bold' }}>{stats.active} / {stats.drivers}</p></div>
        <div style={card}><p style={{ fontSize:'10px', color:'#94a3b8' }}>PASSENGERS</p><p style={{ fontSize:'22px', fontWeight:'bold' }}>{stats.passengers}</p></div>
        <div style={{...card, background:'#f97316' }}><p style={{ fontSize:'10px' }}>RECORDED PLATFORM COMMISSION</p><p style={{ fontSize:'22px', fontWeight:'bold' }}>R {stats.revenue.toFixed(2)}</p><p style={{ fontSize:'11px' }}>From completed rides</p></div>
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'14px', overflowX:'auto' }}>
        <button onClick={()=>setTab('overview')} style={btnTab(tab==='overview')}>📊 Overview</button>
        <button onClick={()=>setTab('finance')} style={btnTab(tab==='finance')}>💰 Finance</button>
        <button onClick={()=>setTab('zones')} style={btnTab(tab==='zones')}>📍 Zones</button>
      </div>

      {tab==='overview' && (
        <>
          <div style={card}>
            <h3>Live Ride Monitoring</h3>
            <div style={{ background:'#0f172a', borderRadius:'12px', height:'100px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color:'#94a3b8' }}>
              Active: {stats.active} drivers online • Configure fare categories in Settings
            </div>
          </div>
          <div style={card}>
            <p style={{ fontWeight:'bold', margin:'0 0 6px 0' }}>👑 Approve Documents 7/7</p>
            <p style={{ fontSize:'12px', color:'#94a3b8', margin:'0 0 10px 0' }}>Verify driver IDs, licenses, vehicles + passenger IDs + selfies</p>
            <button onClick={onDocs} style={{ width:'100%', padding:'14px', borderRadius:'12px', background:'white', color:'black', fontWeight:'bold', border:'none', cursor:'pointer' }}>Go to Documents 7/7 →</button>
          </div>
          <div style={card}>
            <h3 style={{marginTop:0}}>Admin Modules</h3>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:'8px'}}>
              {([
                ['Dashboard','admin-dashboard'], 
                ['Documents 7/7','admin-documents'], // FIXED ✅ was admin-drivers
                ['Rides','admin-rides'], 
                ['Passengers','admin-passengers'], 
                ['Finance','admin-finance'], 
                ['SOS Support','admin-support'],
                ['Zones','admin-zones'], 
                ['Settings','admin-settings'],
              ] as const).map(([label,page])=><button key={page} onClick={()=>onAdminModule(page)} style={{padding:'10px', borderRadius:'8px', border:'1px solid #475569', background: page==='admin-documents' ? '#f97316' : '#0f172a', color:'white', fontWeight: page==='admin-documents' ? 'bold' : 'normal'}}>{label}</button>)}
            </div>
          </div>
        </>
      )}

      {tab==='finance' && (
        <div style={card}>
          <h3>Fare Configuration</h3>
          <p>Fare categories and commission are managed in Admin Settings and used by ride requests.</p>
          <button onClick={()=>onAdminModule('admin-settings')} style={{padding:'12px', borderRadius:'10px', background:'#f97316', color:'white', fontWeight:'bold', border:'none'}}>Open fare settings →</button>
        </div>
      )}

      {tab==='zones' && (
        <div style={card}>
          <h3>Service zones</h3>
          <p>Service zones are not yet configurable. The displayed map coverage is informational only.</p>
          <button onClick={()=>onAdminModule('admin-zones')} style={{padding:'12px', borderRadius:'10px', background:'#f97316', color:'white', fontWeight:'bold', border:'none'}}>View service zones →</button>
        </div>
      )}
    </main>
  )
}