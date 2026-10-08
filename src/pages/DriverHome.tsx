import { useEffect, useState } from 'react'
import { MapView } from '../components'
import { NavigationMenu } from '../NavigationMenu'
import { supabase, type Profile, type Ride } from '../lib/supabase'

export function DriverHome({ profile }: { profile: Profile }) {
  const [online, setOnline] = useState(false)
  const [location, setLocation] = useState<[number, number]>([28.0473, -26.2041])
  const [rides, setRides] = useState<Ride[]>([])
  const [active, setActive] = useState<Ride | null>(null)
  const [route, setRoute] = useState<GeoJSON.LineString | undefined>()
  const [message, setMessage] = useState('')

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

  async function fetchRoute(from: [number, number], to: [number, number]) {
    try {
      const token = import.meta.env.VITE_MAPBOX_TOKEN
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&access_token=${token}`
      const res = await fetch(url)
      const json = await res.json()
      if (json.routes?.[0]?.geometry) {
        setRoute(json.routes[0].geometry)
      }
    } catch (e) { console.error(e) }
  }

  async function loadRides() {
    const { data, error } = await supabase.from('rides').select('*').eq('status', 'searching').order('created_at', { ascending: false }).limit(20)
    if (error) setMessage(error.message); else setRides(data || [])
  }

  async function setOnlineState(next: boolean) {
    setOnline(next)
    await supabase.from('driver_locations').upsert({ driver_id: profile.id, lat: location[1], lng: location[0], is_online: next, updated_at: new Date().toISOString() })
    if (next) loadRides()
    if (!next) setRoute(undefined)
  }

  async function accept(ride: Ride) {
    const { data, error } = await supabase.from('rides').update({ driver_id: profile.id, status: 'accepted' }).eq('id', ride.id).eq('status', 'searching').select().single()
    if (error) setMessage(error.message)
    else {
      setActive(data)
      setRides(prev => prev.filter(x => x.id!== ride.id))
      // FETCH POLYLINE TO PICKUP
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
        // now route to dropoff
        await fetchRoute([data.pickup_lng, data.pickup_lat], [data.dropoff_lng, data.dropoff_lat])
      }
      if (status === 'completed') { setActive(null); setRoute(undefined) }
    }
  }

  return <div className="app-shell" style={{ height:'100dvh', position:'relative' }}>
    <header className="topbar" style={{ position:'absolute', top:0, left:0, right:0, zIndex:50, background:'#111', color:'white' }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide1 Driver</strong>
      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:12, color: online?'#12af6b':'#888', fontWeight:800 }}>{online?'ONLINE':'OFFLINE'}</span>
        <div onClick={() => setOnlineState(!online)} style={{ width:46, height:28, borderRadius:20, background: online?'#12af6b':'#444', position:'relative', cursor:'pointer' }}>
          <div style={{ width:24, height:24, borderRadius:'50%', background:'white', position:'absolute', top:2, left: online?20:2, transition:'0.2s' }} />
        </div>
      </div>
    </header>

    <div className="map-wrap" style={{ position:'absolute', inset:0, top:52, bottom:0 }}>
      <MapView
        center={location}
        route={route}
        markers={active? [{ id:'pickup', lng: active.pickup_lng, lat: active.pickup_lat, label:'Pickup' }] : []}
      />
    </div>

    <section className="sheet" style={{ position:'absolute', bottom:0, left:0, right:0, background:'white', borderTopLeftRadius:20, borderTopRightRadius:20, padding:'14px', zIndex:20 }}>
      {active? <div className="ride-card">
        <h3>Active ride {route? '· blue line shown' : ''}</h3><p>{active.pickup_address}</p><p>→ {active.dropoff_address}</p><strong>R {active.total_fare.toFixed(2)}</strong>
        <div className="button-row" style={{ display:'flex', gap:8, marginTop:10 }}>
          {active.status === 'accepted' && <button onClick={() => updateStatus('driver_arriving')}>Start arrival</button>}
          {active.status === 'driver_arriving' && <button onClick={() => updateStatus('driver_arrived')} style={{ background:'#ff7a00', color:'white', padding:'12px', borderRadius:10, border:'none', flex:1 }}>I've arrived</button>}
          {active.status === 'driver_arrived' && <button className="primary" onClick={() => updateStatus('in_progress')} style={{ flex:1 }}>Start trip</button>}
          {active.status === 'in_progress' && <button className="primary" onClick={() => updateStatus('completed')} style={{ flex:1 }}>Complete trip</button>}
        </div>
      </div> : online? <div>
        <button onClick={loadRides}>Refresh requests</button>
        {rides.map(r => <div className="ride-card" key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid #eee', padding:10, borderRadius:10, marginTop:8 }}>
          <div><b style={{ fontSize:13 }}>{r.pickup_address.slice(0,30)}</b><p style={{ fontSize:11, margin:0 }}>→ {r.dropoff_address.slice(0,25)} · R {r.total_fare.toFixed(2)}</p></div>
          <button className="primary" onClick={() => accept(r)}>Accept</button></div>)}
        {!rides.length && <p className="muted">No ride requests yet.</p>}
      </div> : <p className="muted">Go online to receive nearby ride requests.</p>}
      {message && <div className="error">{message}</div>}
    </section>
  </div>
}