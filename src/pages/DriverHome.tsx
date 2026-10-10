import { useEffect, useState, useRef } from 'react'
import { MapView } from '../components'
import { NavigationMenu } from '../NavigationMenu'
import { getRoute } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]

export function DriverHome({ profile }: { profile: Profile }) {
  const [location, setLocation] = useState<[number, number]>(POLOKWANE_CENTER)
  const [ride, setRide] = useState<Ride | null>(null)
  const [searchingRides, setSearchingRides] = useState<Ride[]>([])
  const [route, setRoute] = useState<any>()
  const [isNavigating, setIsNavigating] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('buddy_theme') as any) || 'dark')
  const [zoom, setZoom] = useState(13)
  const [now, setNow] = useState(Date.now())
  const [showNavChooser, setShowNavChooser] = useState(false)
  const [navTarget, setNavTarget] = useState<{lat:number,lng:number} | null>(null)
  const watchId = useRef<number | null>(null)
  const lastSupabaseUpdate = useRef<number>(0)
  const lastLocation = useRef<[number, number]>(POLOKWANE_CENTER)

  const isDark = theme === 'dark'
  const bg = isDark? '#121212' : '#ffffff'
  const bg2 = isDark? '#1e1e1e' : '#f2f2f2'
  const text = isDark? 'white' : 'black'
  const border = isDark? '#333' : '#ddd'

  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  useEffect(() => {
    if (!localStorage.getItem('buddy_nav')) localStorage.setItem('buddy_nav', 'mapbox')
    if (!localStorage.getItem('buddy_nav_autostart')) localStorage.setItem('buddy_nav_autostart', 'true')
    if (!localStorage.getItem('nav_pref')) localStorage.setItem('nav_pref', 'mapbox')
  }, [])

  useEffect(() => {
    async function loadStatus() {
      const { data } = await supabase.from('profiles').select('is_online').eq('id', profile.id).single()
      if (data) setIsOnline((data as any).is_online || false)
    }
    loadStatus()
    navigator.geolocation.getCurrentPosition(p => {
      const pos: [number, number] = [p.coords.longitude, p.coords.latitude]
      setLocation(pos)
      lastLocation.current = pos
    })
  }, [profile.id])

  useEffect(() => {
    async function loadRide() {
      const { data } = await supabase.from('rides').select('*').eq('driver_id', profile.id)
  .in('status', ['accepted','arrived','picked_up','en_route','in_progress'] as any)
  .order('created_at', { ascending: false }).limit(1).single()
      if (data) { setRide(data); setIsNavigating(true); setIsOnline(true); setZoom(17) }
    }
    loadRide()
  }, [profile.id])

  useEffect(() => {
    const ch = supabase.channel(`driver-${profile.id}`)
.on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `driver_id=eq.${profile.id}` }, p => {
        const newRide = p.new as Ride
        setRide(newRide)
        if (['accepted','arrived','picked_up'].includes(newRide.status as any)) { setIsNavigating(true); setZoom(17) }
        if (['completed','cancelled'].includes(newRide.status as any)) { setIsNavigating(false); setZoom(13); setRide(null) }
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.id])

  useEffect(() => {
    if (!isOnline || ride) { setSearchingRides([]); return }
    async function loadSearching() {
      const { data } = await supabase.from('rides').select('*').eq('status','searching').eq('offered_driver_id', profile.id).gt('offer_expires_at', new Date().toISOString()).order('created_at',{ascending:false}).limit(1)
      if (data) setSearchingRides(data as Ride[])
      else setSearchingRides([])
    }
    loadSearching()
    const ch2 = supabase.channel(`offers-${profile.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `offered_driver_id=eq.${profile.id}` }, () => loadSearching()).subscribe()
    const interval = setInterval(loadSearching, 2000)
    return () => { supabase.removeChannel(ch2); clearInterval(interval) }
  }, [isOnline, ride, profile.id])

  // ✅ FIXED: THROTTLED GPS - NO MORE VIBRATION
  useEffect(() => {
    if (!isNavigating &&!isOnline) return

    watchId.current = navigator.geolocation.watchPosition(pos => {
        const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]

        // 1. Only update UI if moved > 5 meters (prevents micro-shake)
        const dist = Math.hypot(p[0] - lastLocation.current[0], p[1] - lastLocation.current[1])
        if (dist > 0.00005) { // ~5 meters
          setLocation(p)
          lastLocation.current = p
        }

        // 2. Only update Supabase every 3 seconds (not every 0.5s)
        const now = Date.now()
        if (now - lastSupabaseUpdate.current > 3000) {
          lastSupabaseUpdate.current = now
          if (ride) {
            supabase.from('rides').update({ driver_lat: pos.coords.latitude, driver_lng: pos.coords.longitude } as any).eq('id', ride.id).then(()=>{})
          }
          if (isOnline) {
            supabase.from('profiles').update({ current_lat: pos.coords.latitude, current_lng: pos.coords.longitude } as any).eq('id', profile.id).then(()=>{})
          }
          // Also update driver_locations for passenger tracking
          supabase.from('driver_locations').upsert({ driver_id: profile.id, lat: pos.coords.latitude, lng: pos.coords.longitude, updated_at: new Date().toISOString() } as any).then(()=>{})
        }
      }, err => console.log(err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    ) as any
    return () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current) }
  }, [isNavigating, isOnline, ride?.id, profile.id])

  useEffect(() => {
    async function buildRoute() {
      if (!ride ||!location) return
      const target: [number, number] = (ride.status as any) === 'accepted' || (ride.status as any) === 'arrived'
  ? [ride.pickup_lng, ride.pickup_lat] : [ride.dropoff_lng, ride.dropoff_lat]
      try { const r = await getRoute(location, target); setRoute(r.geometry) } catch {}
    }
    // Throttle route building too - only when ride status changes or big move
    buildRoute()
  }, [ride?.id, ride?.status]) // REMOVED location to stop route rebuild shake

  async function toggleOnline() {
    const next =!isOnline
    setIsOnline(next)
    await supabase.from('profiles').update({ is_online: next } as any).eq('id', profile.id)
  }

  async function acceptRide(rideId: string) {
    await supabase.from('rides').update({ driver_id: profile.id, status: 'accepted', started_at: new Date().toISOString() } as any).eq('id', rideId)
    setSearchingRides([])
    setIsNavigating(true)
    setZoom(17)
  }
  async function declineRide(rideId: string) {
    supabase.functions.invoke('dispatch', { body: { ride_id: rideId, declined_by: profile.id } })
    setSearchingRides([])
  }

  async function completeRide() {
    if (!ride) return
    await supabase.from('rides').update({ status: 'completed' as any, ended_at: new Date().toISOString() }).eq('id', ride.id)
    const fare = (ride as any).fare || 0
    const commission = fare * 0.20
    const { data: prof } = await supabase.from('profiles').select('wallet_balance, trips_completed').eq('id', profile.id).single() as any
    const newBal = (prof?.wallet_balance || 0) - commission
    await supabase.from('profiles').update({ wallet_balance: newBal, trips_completed: (prof?.trips_completed || 0) + 1 } as any).eq('id', profile.id)
    if (newBal < -200) { alert('Wallet -R200 - Top-up required like Bolt'); setIsOnline(false); await supabase.from('profiles').update({ is_online: false } as any).eq('id', profile.id) }
    setIsNavigating(false); setRide(null)
  }

  function openExternalMap(lat: number, lng: number) {
    setNavTarget({ lat, lng })
    const pref = localStorage.getItem('buddy_nav') || localStorage.getItem('nav_pref') || 'mapbox'
    if (pref === 'mapbox' || pref === 'buddy') {
      setIsNavigating(true)
      setZoom(17)
      return
    }
    if (pref === 'waze') {
      window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank')
      return
    }
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank')
  }

  function chooseNav(pref: 'mapbox' | 'google' | 'waze') {
    localStorage.setItem('buddy_nav', pref)
    localStorage.setItem('nav_pref', pref)
    setShowNavChooser(false)
    if (!navTarget) return
    if (pref === 'mapbox') { setIsNavigating(true); setZoom(17) }
    else if (pref === 'waze') window.open(`https://waze.com/ul?ll=${navTarget.lat},${navTarget.lng}&navigate=yes`, '_blank')
    else window.open(`https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}&travelmode=driving`, '_blank')
  }

  return <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <header style={{ zIndex: 100, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: bg, color: text, borderBottom: `1px solid ${border}`, position: 'relative' }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide Driver</strong>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, fontSize: '16px' }}>{isDark? '☀️' : '🌙'}</button>
        <button onClick={toggleOnline} style={{ padding: '8px 14px', borderRadius: '20px', border: 'none', fontWeight: 'bold', background: isOnline? '#00d181' : '#666', color: 'white', fontSize: '12px' }}>{isOnline? '● ONLINE' : '○ OFFLINE'}</button>
      </div>
    </header>

    <div style={{ height: '100%', paddingBottom: '220px' }}>
      <MapView center={location} route={route} driverLocation={location} isNavigating={isNavigating} followDriver={isNavigating} />
      <button onClick={() => { setZoom(17); setIsNavigating(true) }} style={{ position: 'absolute', right: '16px', bottom: '240px', zIndex: 50, width: '48px', height: '48px', borderRadius: '24px', background: isDark? 'white' : 'black', color: isDark? 'black' : 'white', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', fontSize: '22px' }}>🎯</button>
    </div>

    <section style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60, background: bg, borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '16px', color: text, minHeight: '140px', borderTop: `1px solid ${border}`, boxShadow: '0 -4px 20px rgba(0,0,0,0.2)' }}>
      {!ride && (
        <div style={{ textAlign: 'center' }}>
          {isOnline && searchingRides.map(r => {
            const expires = new Date((r as any).offer_expires_at || Date.now() + 12000).getTime()
            const secs = Math.max(0, Math.floor((expires - now)/1000))
            return (
            <div key={r.id} style={{ background: isDark? '#1a1a1a' : 'white', border: `2px solid #00d181`, borderRadius: '16px', padding: '14px', marginBottom: '12px', textAlign: 'left', boxShadow: '0 4px 12px rgba(0,209,129,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <p style={{ fontWeight: 'bold', margin: 0, color: '#00d181', fontSize: '14px' }}>BUDDY REQUEST • R {r.fare} • {(r as any).distance_km?.toFixed(1) || '1.2'}km</p>
                <span style={{ background: '#00d181', color: 'white', borderRadius: '12px', padding: '2px 8px', fontSize: '12px', fontWeight: 'bold' }}>{secs}s</span>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 'bold' }}>📍 {r.pickup_address}</p>
              <p style={{ margin: '0 0 8px', fontSize: '13px', opacity: 0.7 }}>→ {r.dropoff_address}</p>
              <p style={{ margin: '0 0 10px', fontSize: '11px', background: bg2, display: 'inline-block', padding: '2px 6px', borderRadius: '6px' }}>💵 Cash trip • {(r as any).payment_method || 'cash'}</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => declineRide(r.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>DECLINE</button>
                <button onClick={() => acceptRide(r.id)} style={{ flex: 1.5, padding: '12px', borderRadius: '10px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '15px' }}>ACCEPT</button>
              </div>
            </div>
          )})}
          <div style={{ fontSize: '14px', marginBottom: '12px', opacity: 0.8 }}>
            {isOnline? (searchingRides.length? `✅ Offer expires in 12s` : '✅ You are online - Waiting for Buddy requests...') : 'You are offline'}
          </div>
          <button onClick={toggleOnline} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: isOnline? '#ff4444' : '#00d181', color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{isOnline? 'GO OFFLINE' : 'GO ONLINE'}</button>
          <p style={{ fontSize: '11px', opacity: 0.5, marginTop: '8px' }}>Wallet: R {profile.wallet_balance || 0} • Trips: {profile.trips_completed || 0} • Rating: {profile.rating || 5.0}★</p>
        </div>
      )}

      {ride && (ride.status as any) === 'accepted' && (
        <>
          <h3 style={{ margin: '0 0 6px', color: text }}>Go to Pickup • R {ride.fare}</h3>
          <p style={{ opacity: 0.7, margin: '0 0 12px', color: text, fontSize: '13px' }}>{ride.pickup_address}</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => openExternalMap(ride.pickup_lat, ride.pickup_lng)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}` }}>{isNavigating? 'Navigating...' : 'Navigate'}</button>
            <button onClick={async () => { await supabase.from('rides').update({ status: 'arrived' as any }).eq('id', ride.id) }} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold' }}>I Have Arrived</button>
          </div>
        </>
      )}

      {ride && (ride.status as any) === 'arrived' && (
        <>
          <h3 style={{ margin: '0 0 6px' }}>Waiting for passenger - 5 min free</h3>
          <p style={{ fontSize: '13px', opacity: 0.7 }}>{ride.pickup_address}</p>
          <button onClick={async () => { await supabase.from('rides').update({ status: 'picked_up' as any }).eq('id', ride.id) }} style={{ width: '100%', marginTop: '10px', padding: '14px', borderRadius: '12px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold' }}>Start Trip → {ride.dropoff_address}</button>
        </>
      )}

      {ride && ((ride.status as any) === 'picked_up' || (ride.status as any) === 'en_route' || (ride.status as any) === 'in_progress') && (
        <>
          <h3 style={{ margin: '0 0 6px', color: text }}>Drive to {ride.dropoff_address}</h3>
          <p style={{ fontSize: '12px', opacity: 0.7 }}>Cash: Collect R {ride.fare} from passenger</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button onClick={() => openExternalMap(ride.dropoff_lat, ride.dropoff_lng)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}` }}>Navigate</button>
            <button onClick={completeRide} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#00c853', color: 'white', border: 'none', fontWeight: 'bold' }}>Complete Trip</button>
          </div>
        </>
      )}
    </section>

    {showNavChooser && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ width: '100%', background: bg, borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '20px' }}>
          <div style={{ width: '40px', height: '4px', background: '#555', borderRadius: '2px', margin: '0 auto 16px' }} />
          <h3 style={{ margin: '0 0 4px', color: text }}>Choose Navigation</h3>
          <p style={{ fontSize: '13px', opacity: 0.6, margin: '0 0 16px' }}>Buddy navigation is recommended</p>
          <button onClick={() => chooseNav('mapbox')} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
            <span style={{ fontSize: '22px' }}>🗺️</span> <div><div>Buddy navigation</div><div style={{ fontSize: '11px', opacity: 0.9 }}>Recommended • In App</div></div> <span style={{ marginLeft: 'auto', background: 'white', color: '#00d181', padding: '2px 8px', borderRadius: '8px', fontSize: '11px' }}>DEFAULT</span>
          </button>
          <button onClick={() => chooseNav('google')} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>📍</span> Google Maps
          </button>
          <button onClick={() => chooseNav('waze')} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🚗</span> Waze
          </button>
          <button onClick={() => setShowNavChooser(false)} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'transparent', color: text, border: `1px solid ${border}` }}>Cancel</button>
        </div>
      </div>
    )}
  </div>
}