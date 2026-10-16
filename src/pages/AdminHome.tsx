import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type Props = { profile: Profile, onDocs: () => void }

export function AdminHome({ profile, onDocs }: Props) {
  const [stats, setStats] = useState({ rides: 0, drivers: 0, passengers: 0, active: 0 })
  const [fares, setFares] = useState({ base: 15, perKm: 8, perMin: 1.5, minFare: 25 })
  const [commission, setCommission] = useState(20)
  const [tab, setTab] = useState<'overview'|'finance'|'zones'|'promos'>('overview')
  const [zones, setZones] = useState([
    { name: 'Polokwane Central', active: true, surge: 1.0 },
    { name: 'Seshego', active: true, surge: 1.0 },
    { name: 'Tzaneen', active: false, surge: 1.2 },
    { name: 'Giyani', active: false, surge: 1.3 },
  ])

  useEffect(() => {
    (async () => {
      const { count: ridesCount } = await supabase.from('rides').select('*', { count: 'exact', head: true })
      const { count: driversCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'driver')
      const { count: passengersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'passenger')
      const { count: activeCount } = await supabase.from('driver_status').select('*', { count: 'exact', head: true }).eq('is_online', true)
      setStats({ rides: ridesCount||0, drivers: driversCount||0, passengers: passengersCount||0, active: activeCount||0 })
    })()
  }, [])

  const card: any = { background:'#1e293b', borderRadius:'16px', padding:'14px', marginBottom:'12px', color:'white' }
  const grid2: any = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }
  const btnTab = (active: boolean): any => ({ padding:'8px 14px', borderRadius:'999px', border:'none', fontSize:'13px', fontWeight:'bold', cursor:'pointer', background: active? 'white' : '#1e293b', color: active? 'black' : 'white' })
  const inputStyle: any = { width:'100%', background:'#0f172a', color:'white', border:'1px solid #334155', borderRadius:'8px', padding:'10px', marginTop:'4px' }

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
        <div style={{...card, background:'#f97316' }}><p style={{ fontSize:'10px' }}>EST. REVENUE</p><p style={{ fontSize:'22px', fontWeight:'bold' }}>R {stats.rides*45}</p><p style={{ fontSize:'11px' }}>{commission}% commission</p></div>
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'14px', overflowX:'auto' }}>
        <button onClick={()=>setTab('overview')} style={btnTab(tab==='overview')}>📊 Overview</button>
        <button onClick={()=>setTab('finance')} style={btnTab(tab==='finance')}>💰 Finance</button>
        <button onClick={()=>setTab('zones')} style={btnTab(tab==='zones')}>📍 Zones</button>
        <button onClick={()=>setTab('promos')} style={btnTab(tab==='promos')}>🎁 Promos</button>
      </div>

      {tab==='overview' && (
        <>
          <div style={card}>
            <h3>Live Ride Monitoring</h3>
            <div style={{ background:'#0f172a', borderRadius:'12px', height:'100px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color:'#94a3b8' }}>
              Active: {stats.active} drivers online
            </div>
          </div>
          <div style={card}>
            <p style={{ fontWeight:'bold', margin:'0 0 6px 0' }}>👑 Approve Documents</p>
            <p style={{ fontSize:'12px', color:'#94a3b8', margin:'0 0 10px 0' }}>Verify driver IDs, licenses, vehicles</p>
            <button onClick={onDocs} style={{ width:'100%', padding:'14px', borderRadius:'12px', background:'white', color:'black', fontWeight:'bold', border:'none', cursor:'pointer' }}>Go to Documents →</button>
          </div>
        </>
      )}

      {tab==='finance' && (
        <div style={card}>
          <h3>Fare Configuration</h3>
          <div style={grid2}>
            <label style={{ fontSize:'12px' }}>Base<input type="number" value={fares.base} onChange={e=>setFares({...fares, base:Number(e.target.value)})} style={inputStyle}/></label>
            <label style={{ fontSize:'12px' }}>Per Km<input type="number" value={fares.perKm} onChange={e=>setFares({...fares, perKm:Number(e.target.value)})} style={inputStyle}/></label>
            <label style={{ fontSize:'12px' }}>Per Min<input type="number" value={fares.perMin} onChange={e=>setFares({...fares, perMin:Number(e.target.value)})} style={inputStyle}/></label>
            <label style={{ fontSize:'12px' }}>Min Fare<input type="number" value={fares.minFare} onChange={e=>setFares({...fares, minFare:Number(e.target.value)})} style={inputStyle}/></label>
          </div>
          <button style={{ marginTop:'12px', width:'100%', padding:'12px', borderRadius:'10px', background:'#f97316', color:'white', fontWeight:'bold', border:'none' }}>Save Fare Rules</button>
        </div>
      )}

      {tab==='zones' && (
        <div style={card}>
          <h3>Limpopo Zones</h3>
          {zones.map((z,i)=>(
            <div key={z.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0f172a', borderRadius:'10px', padding:'10px', marginBottom:'8px' }}>
              <div><p style={{ margin:0, fontSize:'13px', fontWeight:'bold' }}>{z.name}</p><p style={{ margin:0, fontSize:'11px', color:'#94a3b8' }}>Surge x{z.surge}</p></div>
              <button onClick={()=>{ const nz=[...zones]; nz[i].active=!nz[i].active; setZones(nz)}} style={{ padding:'6px 12px', borderRadius:'999px', border:'none', fontSize:'11px', fontWeight:'bold', background: z.active? '#16a34a' : '#475569', color:'white' }}>{z.active?'Active':'Off'}</button>
            </div>
          ))}
        </div>
      )}

      {tab==='promos' && (
        <div style={card}>
          <h3>Promo Codes</h3>
          <div style={{ background:'#0f172a', borderRadius:'10px', padding:'12px', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'monospace', fontWeight:'bold' }}>WELCOME50</span><span style={{ color:'#4ade80', fontWeight:'bold' }}>-50%</span>
          </div>
        </div>
      )}
    </main>
  )
}