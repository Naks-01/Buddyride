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
  const [isOnline, setIsOnline] = useState(false)
  const [zoom, setZoom] = useState(13)
  const watchId = useRef<number | null>(null)

  // Load initial online status
  useEffect(() => {
    async function loadStatus() {
      const { data } = await supabase.from('profiles').select('is_online').eq('id', profile.id).single()
      if (data) setIsOnline((data as any).is_online || false)
    }
    loadStatus()
    navigator.geolocation.getCurrentPosition(p => {
      setLocation([p.coords.longitude, p.coords.latitude])
    })
  }, [profile.id])

  // Load active ride
  useEffect(() => {
    async function loadRide() {
      const { data } = await supabase.from('rides')
        .select('*').eq('driver_id', profile.id)
        .in('status', ['accepted','picked_up','en_route'] as any)
        .order('created_at', { ascending: false }).limit(1).single()
      if (data) {
        setRide(data)
        setIsNavigating(true)
        setIsOnline(true)
        setZoom(17)
      }
    }
    loadRide()
  }, [profile.id])

  // Listen for new rides
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

  // GPS tracking when navigating or online
  useEffect(() => {
    if (!isNavigating && !isOnline) return
    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        setLocation(p)
        if (ride) {
          supabase.from('rides').update({
            driver_lat: pos.coords.latitude,
            driver_lng: pos.coords.longitude,
          } as any).eq('id', ride.id).then(()=>{})
        }
        if (isOnline) {
          supabase.from('profiles').update({
            current_lat: pos.coords.latitude,
            current_lng: pos.coords.longitude,
            last_seen: new Date().toISOString()
          } as any).eq('id', profile.id).then(()=>{})
        }
      },
      err => console.log(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    ) as any
    return () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current) }
  }, [isNavigating, isOnline, ride?.id, profile.id])

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

  async function toggleOnline() {
    const next = !isOnline
    setIsOnline(next)
    await supabase.from('profiles').update({ is_online: next } as any).eq('id', profile.id)
  }

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

  return <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: '#000' }}>
    <header className="topbar" style={{ zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
        <strong>BuddyRide Driver</strong>
      </div>
      {/* ONLINE TOGGLE */}
      <button
        onClick={toggleOnline}
        style={{
          padding: '8px 18px',
          borderRadius: '20px',
          border: 'none',
          fontWeight: 'bold',
          background: isOnline ? '#00c853' : '#444',
          color: 'white',
          fontSize: '14px'
        }}
      >
        {isOnline ? '● ONLINE' : '○ OFFLINE'}
      </button>
    </header>

    <div style={{ height: '100%', paddingBottom: '220px' }}>
      <MapView center={location} route={route} />
      <button
        onClick={() => { setZoom(17); setIsNavigating(true) }}
        style={{
          position: 'absolute', right: '16px', bottom: '240px', zIndex: 50,
          width: '48px', height: '48px', borderRadius: '24px',
          background: 'white', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          fontSize: '22px'
        }}
      >🎯</button>
    </div>

    <section style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60,
      background: '#121212', borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
      padding: '16px', color: 'white', minHeight: '140px'
    }}>
      {!ride && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '16px', marginBottom: '12px' }}>
            {isOnline ? '✅ You are online - Waiting for requests...' : 'You are offline - Tap ONLINE to get requests'}
          </div>
          <button
            onClick={toggleOnline}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '12px',
              border: 'none',
              background: isOnline ? '#ff4444' : '#ff7a00',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '16px'
            }}
          >
            {isOnline ? 'GO OFFLINE' : 'GO ONLINE'}
          </button>
        </div>
      )}

      {ride && (ride.status as any) === 'accepted' && (
        <>
          <h3 style={{ margin: '0 0 6px' }}>Go to Pickup</h3>
          <p style={{ opacity: 0.7, margin: '0 0 12px' }}>{ride.pickup_address}</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => openExternalMap(ride.pickup_lat, ride.pickup_lng)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#2a2a2a', color: 'white', border: '1px solid #444' }}>
              Navigate
            </button>
            <button onClick={async () => {
              await supabase.from('rides').update({ status: 'picked_up' as any }).eq('id', ride.id)
            }} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#ff7a00', color: 'white', border: 'none', fontWeight: 'bold' }}>Arrived → Start Trip</button>
          </div>
        </>
      )}

      {ride && (ride.status as any) === 'picked_up' && (
        <>
          <h3 style={{ margin: '0 0 6px' }}>Drive to {ride.dropoff_address}</h3>
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