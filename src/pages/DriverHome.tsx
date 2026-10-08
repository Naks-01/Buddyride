import { useEffect, useState, useRef } from 'react'
import { MapView } from '../components'
import { NavigationMenu } from '../NavigationMenu'
import { supabase, type Profile, type Ride } from '../lib/supabase'

type Step = { street: string; distance: number; instruction: string; type: string }

export function DriverHome({ profile }: { profile: Profile }) {
  const [online, setOnline] = useState(false)
  const [location, setLocation] = useState<[number, number]>([28.0473, -26.2041])
  const [rides, setRides] = useState<Ride[]>([])
  const [active, setActive] = useState<Ride | null>(null)
  const [message, setMessage] = useState('')
  const [routeGeo, setRouteGeo] = useState<any>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [waiting, setWaiting] = useState(0)
  const timerRef = useRef<number | null>(null)

  // ---- your original listeners ----
  useEffect(() => {
    const channel = supabase.channel('driver-ride-requests')
     .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides', filter: 'status=eq.searching' }, payload => {
        setRides(prev => [payload.new as Ride,...prev.filter(x => x.id!== payload.new.id)])
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (!online) return
    const watch = navigator.geolocation?.watchPosition(async pos => {
      const lng = pos.coords.longitude, lat = pos.coords.latitude
      setLocation([lng, lat])
      await supabase.from('driver_locations').upsert({ driver_id: profile.id, lat, lng, is_online: true, updated_at: new Date().toISOString() })
    })
    return () => { if (watch!== undefined) navigator.geolocation.clearWatch(watch) }
  }, [online, profile.id])

  // waiting timer 02:49 Waiting
  useEffect(() => {
    if (active?.status === 'driver_arrived') {
      timerRef.current = window.setInterval(() => setWaiting(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      setWaiting(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [active?.status])

  async function fetchRoute(from: [number, number], to: [number, number]) {
    try {
      const token = import.meta.env.VITE_MAPBOX_TOKEN
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?steps=true&geometries=geojson&access_token=${token}`
      const res = await fetch(url)
      const j = await res.json()
      const r = j.routes?.[0]
      if (!r) return
      setRouteGeo(r.geometry)
      setSteps(r.legs[0].steps.map((s: any) => ({ street: s.name || 'Continue', distance: s.distance, instruction: s.maneuver.instruction, type: s.maneuver.modifier || s.maneuver.type })))
    } catch {}
  }

  async function loadRides() {
    const { data, error } = await supabase.from('rides').select('*').eq('status', 'searching').order('created_at', { ascending: false }).limit(20)
    if (error) setMessage(error.message); else setRides(data || [])
  }

  async function setOnlineState(next: boolean) {
    setOnline(next)
    await supabase.from('driver_locations').upsert({ driver_id: profile.id, lat: location[1], lng: location[0], is_online: next, updated_at: new Date().toISOString() })
    if (next) loadRides()
  }

  async function accept(ride: Ride) {
    const { data, error } = await supabase.from('rides').update({ driver_id: profile.id, status: 'accepted' }).eq('id', ride.id).eq('status', 'searching').select().single()
    if (error) setMessage(error.message)
    else {
      setActive(data); setRides(prev => prev.filter(x => x.id!== ride.id))
      await fetchRoute(location, [data.pickup_lng, data.pickup_lat])
    }
  }

  async function updateStatus(status: Ride['status']) {
    if (!active) return
    const { data, error } = await supabase.from('rides').update({ status }).eq('id', active.id).eq('driver_id', profile.id).select().single()
    if (error) setMessage(error.message)
    else {
      setActive(data)
      if (status === 'driver_arriving') {
        await fetchRoute(location, [data.pickup_lng, data.pickup_lat])
      }
      if (status === 'in_progress') {
        await fetchRoute([data.pickup_lng, data.pickup_lat], [data.dropoff_lng, data.dropoff_lat])
      }
      if (status === 'completed') { setActive(null); setRouteGeo(null); setSteps([]) }
    }
  }

  const fmtWait = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const cur = steps[0]

  // ===== DRIVING MODE - LIKE YOUR BOLT SCREENSHOTS =====
  if (active) {
    const isWaiting = active.status === 'driver_arrived'
    return <div style={{ position:'relative', height:'100dvh', width:'100vw', background:'#0f1115', overflow:'hidden' }}>
      {/* MAP */}
      <div style={{ position:'absolute', inset:0, paddingBottom:'160px' }}>
        <MapView center={location} route={routeGeo} />
      </div>

      {/* TOP BLACK CARD - Bukhara Street 500m / 100th Avenue 0m */}
      <div style={{ position:'absolute', top:12, left:12, right:12, background:'#000', borderRadius:'16px', zIndex:20, overflow:'hidden', boxShadow:'0 4px 20px rgba(0,0,0,0.6)' }}>
        <div style={{ padding:'14px 16px', display:'flex', gap:'14px', alignItems:'center', color:'white' }}>
          <div style={{ fontSize:40, lineHeight:1 }}>{isWaiting? '📍' : cur?.type?.includes('right')? '↗' : cur?.type?.includes('left')? '↩' : '➜'}</div>
          <div>
            <div style={{ fontSize:20, fontWeight:800 }}>{isWaiting? '100th Avenue' : cur?.street || 'Bukhara Street'}</div>
            <div style={{ fontSize:14, opacity:0.8 }}>{isWaiting? '0 m' : `${Math.round(cur?.distance||500)} m`}</div>
          </div>
        </div>
        {!isWaiting && steps[1] && (
          <div style={{ background:'#2a2e38', padding:'8px 16px', color:'#cbd2de', fontSize:13, display:'flex', gap:8 }}>
            <span>↩</span> Then {steps[1].instruction} in {Math.round(steps[1].distance)} m
          </div>
        )}
      </div>

      {/* BOTTOM - like your 2nd screenshot */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'#1e252f', borderTopLeftRadius:22, borderTopRightRadius:22, padding:'10px 16px 24px', zIndex:30 }}>
        <div style={{ width:36, height:4, background:'#3a4453', borderRadius:10, margin:'0 auto 12px' }} />
        {isWaiting? (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', color:'white' }}>
              <div style={{ fontSize:22, fontWeight:800 }}>{fmtWait(waiting)} Waiting</div>
              <div>☰</div>
            </div>
            <div style={{ color:'white', marginTop:6, fontSize:15 }}>{active.pickup_address || '19 100Th Avenue, Seshego E, Polokwane'}</div>
            <div style={{ color:'#aab6c8', marginTop:6, fontSize:14 }}>Tsietso <span style={{ color:'#ffbe00' }}>5.0 ★</span> • 111 rides</div>
            <div style={{ marginTop:8, background:'#2f3c4e', display:'inline-block', padding:'4px 10px', borderRadius:8, color:'white', fontSize:12 }}>Bolt • R {active.total_fare.toFixed(2)} • Net, tax incl.</div>
            <button onClick={() => updateStatus('in_progress')} style={{ width:'100%', marginTop:14, background:'#189f5c', border:'none', color:'white', padding:'14px', borderRadius:12, fontSize:18, fontWeight:800 }}>» Start with code</button>
          </>
        ) : active.status === 'accepted' || active.status === 'driver_arriving'? (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', color:'white' }}>
              <div><div style={{ fontSize:22, fontWeight:900 }}>1 min</div><div style={{ color:'#8fa0b8', fontSize:13 }}>700 m • 18:09</div></div>
              <div style={{ display:'flex', gap:10 }}><div style={{ background:'#c1272d', padding:'6px 12px', borderRadius:8 }}>💳</div><div>☰</div></div>
            </div>
            <div style={{ color:'white', marginTop:8 }}>{active.pickup_address}</div>
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <a href={`https://www.google.com/maps/dir/${location[1]},${location[0]}/${active.pickup_lat},${active.pickup_lng}`} target="_blank" style={{ flex:1, background:'#2a3443', color:'white', padding:'12px', borderRadius:10, textAlign:'center', textDecoration:'none' }}>Navigate</a>
              <button onClick={() => updateStatus('driver_arrived')} style={{ flex:1, background:'#ff7a00', border:'none', color:'white', padding:'12px', borderRadius:10, fontWeight:700 }}>I've Arrived</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', color:'white' }}>
              <div><div style={{ fontSize:22, fontWeight:900 }}>On trip</div><div style={{ color:'#8fa0b8', fontSize:13 }}>{active.dropoff_address?.slice(0,30)}</div></div>
            </div>
            <div style={{ color:'white', marginTop:8 }}>{active.dropoff_address}</div>
            <button onClick={() => updateStatus('completed')} className="primary" style={{ width:'100%', marginTop:12, background:'#189f5c', padding:'14px', borderRadius:12 }}>Complete trip - R {active.total_fare.toFixed(2)}</button>
          </>
        )}
      </div>
    </div>
  }

  // ===== OFFLINE / ONLINE - BIG GO =====
  return <div className="app-shell" style={{ position:'relative', height:'100dvh' }}>
    <header className="topbar"><NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} /><strong>BuddyRide1 Driver</strong><span>{profile.full_name || profile.email}</span></header>
    <div className="map-wrap" style={{ height:'100%', position:'relative' }}><MapView center={location} />
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center' }}>
        <button onClick={() => setOnlineState(!online)} style={{ width:160, height:160, borderRadius:'50%', background: online?'#111':'#189f5c', color:'white', fontSize:32, fontWeight:900, border:'6px solid white', boxShadow:'0 8px 30px rgba(0,0,0,0.5)' }}>{online?'OFF':'GO'}</button>
        <div style={{ marginTop:10, background:'black', color: online?'#00ff8a':'white', padding:'6px 14px', borderRadius:20, fontWeight:700, display:'inline-block' }}>{online?'● ONLINE - Receiving requests':'OFFLINE'}</div>
      </div>
    </div>
    <section className="sheet">
      <div className="online-row"><h2>Driver mode</h2><button className={online? 'online' : ''} onClick={() => setOnlineState(!online)} style={{ background: online?'#189f5c':'#444', color:'white', padding:'8px 16px', borderRadius:20 }}>{online? 'ONLINE' : 'OFFLINE'}</button></div>
      {online? <div>
        <button onClick={loadRides}>Refresh requests</button>
        {rides.map(r => <div className="ride-card" key={r.id}><b>{r.pickup_address}</b><p>→ {r.dropoff_address}</p><span>{r.distance_km.toFixed(1)} km · R {r.total_fare.toFixed(2)}</span><button className="primary" onClick={() => accept(r)}>Accept</button></div>)}
        {!rides.length && <p className="muted">No ride requests yet.</p>}
      </div> : <p className="muted">Go online to receive nearby ride requests. Tap GO.</p>}
      {message && <div className="error">{message}</div>}
    </section>
  </div>
}