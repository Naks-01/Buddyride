import { useEffect, useState, useRef } from 'react'
import { MapView } from '../components'
import { NavigationMenu } from '../NavigationMenu'
import { getRoute } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]

export function DriverHome({ profile }: { profile: Profile }) {
  const [location, setLocation] = useState<[number, number]>(POLOKWANE_CENTER)
  const [ride, setRide] = useState<Ride | null>(null)
  const [route, setRoute] = useState<any>()
  const [isNavigating, setIsNavigating] = useState(false)
  const [heading, setHeading] = useState(0)
  const [zoom, setZoom] = useState(13)
  const watchId = useRef<number | null>(null)

  useEffect(() => {
    async function loadRide() {
      const { data } = await supabase.from('rides')
        .select('*').eq('driver_id', profile.id)
        .in('status', ['accepted','picked_up','en_route'] as any)
        .order('created_at', { ascending: false }).limit(1).single()
      if (data) {
        setRide(data)
        setIsNavigating(true)
        setZoom(17)
      }
    }
    loadRide()
  }, [profile.id])

  useEffect(() => {
    const ch = supabase.channel(`driver-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `driver_id=eq.${profile.id}` }, p => {
        const newRide = p.new as Ride
        setRide(newRide)
        if (['accepted','picked_up'].includes(newRide.status as any)) {
          setIsNavigating(true)
          setZoom(17)
        }
        if (['completed','cancelled'].includes(newRide.status as any)) {
          setIsNavigating(false)
          setZoom(13)
          setRide(null)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.id])

  useEffect(() => {
    if (!isNavigating) return
    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        setLocation(p)
        if (pos.coords.heading) setHeading(pos.coords.heading)
        if (ride) {
          supabase.from('rides').update({
            driver_lat: pos.coords.latitude,
            driver_lng: pos.coords.longitude,
            driver_heading: pos.coords.heading
          } as any).eq('id', ride.id).then(()=>{})
        }
      },
      err => console.log(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    ) as any
    return () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current) }
  }, [isNavigating, ride?.id])

  useEffect(() => {
    async function buildRoute() {
      if (!ride || !location) return
      const target: [number, number] = (ride.status as any) === 'accepted'
        ? [ride.pickup_lng, ride.pickup_lat]
        : [ride.dropoff_lng, ride.dropoff_lat]
      try {
        const r = await getRoute(location, target)
        setRoute(r.geometry)
      } catch {}
    }
    buildRoute()
  }, [ride, location])

  function openExternalMap(lat: number, lng: number) {
    const pref = localStorage.getItem('nav_pref') || 'google'
    if (pref === 'waze') {
      window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank')
    } else if (pref === 'google') {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank')
    } else {
      setIsNavigating(true)
      setZoom(17)
    }
  }

  return <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
    <header className="topbar" style={{ zIndex: 100 }}><NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} /><strong>BuddyRide Driver</strong></header>

    <div style={{ height: '100%', paddingBottom: '200px' }}>
      <MapView center={location} route={route} />
      <button
        onClick={() => { setZoom(17); setIsNavigating(true) }}
        style={{
          position: 'absolute', right: '16px', bottom: '220px', zIndex: 50,
          width: '48px', height: '48px', borderRadius: '24px',
          background: 'white', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          fontSize: '22px'
        }}
      >🎯</button>
    </div>

    <section style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60,
      background: '#121212', borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
      padding: '16px', color: 'white'
    }}>
      {!ride && <div>Waiting for requests... Go online</div>}

      {ride && (ride.status as any) === 'accepted' && (
        <>
          <h3>Go to Pickup</h3>
          <p style={{ opacity: 0.7 }}>{ride.pickup_address}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button onClick={() => openExternalMap(ride.pickup_lat, ride.pickup_lng)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#2a2a2a', color: 'white', border: '1px solid #444' }}>
              {localStorage.getItem('nav_pref') === 'waze'? 'Open Waze' : 'Open Google Maps'}
            </button>
            <button onClick={async () => {
              await supabase.from('rides').update({ status: 'picked_up' as any }).eq('id', ride.id)
            }} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#ff7a00', color: 'white', border: 'none', fontWeight: 'bold' }}>I have arrived → Start Trip</button>
          </div>
        </>
      )}

      {ride && (ride.status as any) === 'picked_up' && (
        <>
          <h3>Drive to {ride.dropoff_address}</h3>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button onClick={() => openExternalMap(ride.dropoff_lat, ride.dropoff_lng)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#2a2a2a', color: 'white', border: '1px solid #444' }}>Navigate</button>
            <button onClick={async () => {
              await supabase.from('rides').update({ status: 'completed' as any }).eq('id', ride.id)
              setIsNavigating(false); setRide(null)
            }} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#00c853', color: 'white', border: 'none', fontWeight: 'bold' }}>Complete Trip</button>
          </div>
        </>
      )}
    </section>
  </div>
}