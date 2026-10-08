import { useEffect, useState } from 'react'
import { MapView } from '../components'
import { NavigationMenu } from '../NavigationMenu'
import { supabase, type Profile, type Ride } from '../lib/supabase'

export function DriverHome({ profile }: { profile: Profile }) {
  const [online, setOnline] = useState(false)
  const [location, setLocation] = useState<[number, number]>([28.0473, -26.2041])
  const [rides, setRides] = useState<Ride[]>([])
  const [active, setActive] = useState<Ride | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const channel = supabase.channel('driver-ride-requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides', filter: 'status=eq.searching' }, payload => {
        setRides(prev => [payload.new as Ride, ...prev.filter(x => x.id !== payload.new.id)])
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
    return () => { if (watch !== undefined) navigator.geolocation.clearWatch(watch) }
  }, [online, profile.id])

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
    else { setActive(data); setRides(prev => prev.filter(x => x.id !== ride.id)) }
  }

  async function updateStatus(status: Ride['status']) {
    if (!active) return
    const { data, error } = await supabase.from('rides').update({ status }).eq('id', active.id).eq('driver_id', profile.id).select().single()
    if (error) setMessage(error.message); else { setActive(data); if (status === 'completed') setActive(null) }
  }

  return <div className="app-shell">
    <header className="topbar"><NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} /><strong>BuddyRide1 Driver</strong><span>{profile.full_name || profile.email}</span></header>
    <div className="map-wrap"><MapView center={location} /></div>
    <section className="sheet">
      <div className="online-row"><h2>Driver mode</h2><button className={online ? 'online' : ''} onClick={() => setOnlineState(!online)}>{online ? 'ONLINE' : 'OFFLINE'}</button></div>
      {active ? <div className="ride-card">
        <h3>Active ride</h3><p>{active.pickup_address}</p><p>→ {active.dropoff_address}</p><strong>R {active.total_fare.toFixed(2)}</strong>
        <div className="button-row">
          {active.status === 'accepted' && <button onClick={() => updateStatus('driver_arriving')}>Start arrival</button>}
          {active.status === 'driver_arriving' && <button onClick={() => updateStatus('driver_arrived')}>I've arrived</button>}
          {active.status === 'driver_arrived' && <button className="primary" onClick={() => updateStatus('in_progress')}>Start trip</button>}
          {active.status === 'in_progress' && <button className="primary" onClick={() => updateStatus('completed')}>Complete trip</button>}
        </div>
      </div> : online ? <div>
        <button onClick={loadRides}>Refresh requests</button>
        {rides.map(r => <div className="ride-card" key={r.id}><b>{r.pickup_address}</b><p>→ {r.dropoff_address}</p><span>{r.distance_km.toFixed(1)} km · R {r.total_fare.toFixed(2)}</span><button className="primary" onClick={() => accept(r)}>Accept</button></div>)}
        {!rides.length && <p className="muted">No ride requests yet.</p>}
      </div> : <p className="muted">Go online to receive nearby ride requests.</p>}
      {message && <div className="error">{message}</div>}
    </section>
  </div>
}