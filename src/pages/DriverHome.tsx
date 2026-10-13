import { useEffect, useState, useRef } from 'react'
import { MapView } from '../components'
import { NavigationMenu } from '../NavigationMenu'
import { getRoute } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]

const SOUNDS = { request: 'https://cdn.pixabay.com/audio/2022/03/10/audio_5a4fe0f4f1.mp3' }
function playSound() {
  try {
    const audio = new Audio(SOUNDS.request); audio.volume = 1.0; audio.play().catch(() => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 900
        gain.gain.setValueAtTime(0.8, ctx.currentTime); osc.start()
        setTimeout(() => { osc.frequency.value = 1200 }, 200); osc.stop(ctx.currentTime + 1.2)
      } catch {}
    })
    if (navigator.vibrate) navigator.vibrate([400, 100, 400, 100, 800])
  } catch {}
}

export function DriverHome({ profile }: { profile: Profile }) {
  const [location, setLocation] = useState<[number, number]>(POLOKWANE_CENTER)
  const [ride, setRide] = useState<Ride | null>(null)
  const [searchingRides, setSearchingRides] = useState<Ride[]>([])
  const [route, setRoute] = useState<any>()
  const [routeData, setRouteData] = useState<any>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('buddy_theme') as any) || 'dark')
  const [zoom, setZoom] = useState(13)
  const [now, setNow] = useState(Date.now())
  const [showNavChooser, setShowNavChooser] = useState(false)
  const [navTarget, setNavTarget] = useState<{lat:number,lng:number} | null>(null)
  const [bearing, setBearing] = useState(0)
  const [sheetHidden, setSheetHidden] = useState(false) // NEW: slide-hide
  const watchId = useRef<number | null>(null)
  const lastSupabaseUpdate = useRef<number>(0)
  const lastLocation = useRef<[number, number]>(POLOKWANE_CENTER)
  const prevSearchingCount = useRef(0)

  const isDark = theme === 'dark'
  const bg = isDark? '#0e0e10' : '#f5f5f7'
  const bgCard = isDark? '#18181b' : '#ffffff'
  const bg2 = isDark? '#242428' : '#eeeeef'
  const text = isDark? 'white' : '#111827'
  const subText = isDark? '#9ca3af' : '#6b7280'
  const border = isDark? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const mapStyleUrl = isDark? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11' // NEW: day/night map

  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])
  useEffect(() => { if (isNavigating) setSheetHidden(true); else setSheetHidden(false) }, [isNavigating]) // NEW: auto hide when navigating
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
      setLocation(pos); lastLocation.current = pos
    })
  }, [profile.id])

  useEffect(() => {
    async function loadRide() {
      const { data } = await supabase.from('rides').select('*').eq('driver_id', profile.id).in('status', ['accepted','arrived','picked_up','en_route','in_progress'] as any).order('created_at', { ascending: false }).limit(1).single()
      if (data) { setRide(data); setIsNavigating(true); setIsOnline(true); setZoom(17) }
    }
    loadRide()
  }, [profile.id])

  useEffect(() => {
    const ch = supabase.channel(`driver-${profile.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `driver_id=eq.${profile.id}` }, p => {
        const newRide = p.new as Ride; setRide(newRide)
        if (['accepted','arrived','picked_up'].includes(newRide.status as any)) { setIsNavigating(true); setZoom(17) }
        if (['completed','cancelled'].includes(newRide.status as any)) { setIsNavigating(false); setZoom(13); setRide(null); setRoute(undefined); setRouteData(null) }
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.id])

  useEffect(() => {
    if (!isOnline || ride) { setSearchingRides([]); return }
    async function loadSearching() {
      const { data } = await supabase.from('rides').select('*').eq('status','searching').eq('offered_driver_id', profile.id).gt('offer_expires_at', new Date().toISOString()).order('created_at',{ascending:false}).limit(1)
      if (data) setSearchingRides(data as Ride[]); else setSearchingRides([])
    }
    loadSearching()
    const ch2 = supabase.channel(`offers-${profile.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `offered_driver_id=eq.${profile.id}` }, () => loadSearching()).subscribe()
    const interval = setInterval(loadSearching, 2000)
    return () => { supabase.removeChannel(ch2); clearInterval(interval) }
  }, [isOnline, ride, profile.id])

  useEffect(() => { if (searchingRides.length > 0 && prevSearchingCount.current === 0) playSound(); prevSearchingCount.current = searchingRides.length }, [searchingRides])

  useEffect(() => {
    if (!isNavigating &&!isOnline) return
    watchId.current = navigator.geolocation.watchPosition(pos => {
        const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        const dist = Math.hypot(p[0] - lastLocation.current[0], p[1] - lastLocation.current[1])
        if (dist > 0.00005) {
          const dLng = p[0] - lastLocation.current[0]; const dLat = p[1] - lastLocation.current[1]
          if (Math.abs(dLng) > 0.00001 || Math.abs(dLat) > 0.00001) { const b = Math.atan2(dLng, dLat) * 180 / Math.PI; setBearing(b) }
          setLocation(p); lastLocation.current = p
        }
        const now = Date.now()
        if (now - lastSupabaseUpdate.current > 3000) {
          lastSupabaseUpdate.current = now
          if (ride) supabase.from('rides').update({ driver_lat: pos.coords.latitude, driver_lng: pos.coords.longitude } as any).eq('id', ride.id).then(()=>{})
          if (isOnline) supabase.from('profiles').update({ current_lat: pos.coords.latitude, current_lng: pos.coords.longitude } as any).eq('id', profile.id).then(()=>{})
          supabase.from('driver_locations').upsert({ driver_id: profile.id, lat: pos.coords.latitude, lng: pos.coords.longitude, updated_at: new Date().toISOString() } as any).then(()=>{})
        }
      }, err => console.log(err), { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    ) as any
    return () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current) }
  }, [isNavigating, isOnline, ride?.id, profile.id])

  useEffect(() => {
    async function buildRoute() {
      if (!ride ||!location) return
      const target: [number, number] = (ride.status as any) === 'accepted' || (ride.status as any) === 'arrived'? [ride.pickup_lng, ride.pickup_lat] : [ride.dropoff_lng, ride.dropoff_lat]
      try { const r = await getRoute(location, target); setRoute(r.geometry); setRouteData(r) } catch {}
    }
    buildRoute()
  }, [ride?.id, ride?.status, location])

  async function toggleOnline() {
    try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); ctx.resume() } catch {}
    const next =!isOnline; setIsOnline(next)
    await supabase.from('profiles').update({ is_online: next } as any).eq('id', profile.id)
  }

  async function acceptRide(rideId: string) {
    try {
      const { data: prof } = await supabase.from('profiles').select('wallet_balance').eq('id', profile.id).single() as any
      const bal = prof?.wallet_balance?? 0
      if (bal < -200) {
        alert(`Wallet low: R${bal.toFixed(2)} - Top-up required. You owe more than R200. Please top-up to continue receiving requests.`);
        return;
      }
    } catch {}
    await supabase.from('rides').update({ driver_id: profile.id, status: 'accepted', started_at: new Date().toISOString() } as any).eq('id', rideId)
    setSearchingRides([]); prevSearchingCount.current = 0; setIsNavigating(true); setZoom(17)
  }

  async function declineRide(rideId: string) {
    supabase.functions.invoke('dispatch', { body: { ride_id: rideId, declined_by: profile.id } })
    setSearchingRides([]); prevSearchingCount.current = 0
  }

  async function completeRide() {
    if (!ride) return
    await supabase.from('rides').update({ status: 'completed' as any, ended_at: new Date().toISOString() }).eq('id', ride.id)
    const fare = (ride as any).fare || 0;
    const commission = fare * 0.20
    const { data: prof } = await supabase.from('profiles').select('wallet_balance, trips_completed').eq('id', profile.id).single() as any
    const newBal = (prof?.wallet_balance || 0) - commission
    await supabase.from('profiles').update({ wallet_balance: newBal, trips_completed: (prof?.trips_completed || 0) + 1 } as any).eq('id', profile.id)
    setIsNavigating(false); setRide(null); setRoute(undefined); setRouteData(null)
  }

  function openExternalMap(lat: number, lng: number) {
    setNavTarget({ lat, lng })
    const pref = localStorage.getItem('buddy_nav') || localStorage.getItem('nav_pref') || 'mapbox'
    if (pref === 'mapbox' || pref === 'buddy') { setIsNavigating(true); setZoom(17); return }
    if (pref === 'waze') { window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank'); return }
    if (pref === 'google') { window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank'); return }
    setShowNavChooser(true)
  }
  function chooseNav(pref: 'mapbox' | 'google' | 'waze') {
    localStorage.setItem('buddy_nav', pref); localStorage.setItem('nav_pref', pref); setShowNavChooser(false)
    if (!navTarget) return
    if (pref === 'mapbox') { setIsNavigating(true); setZoom(17) }
    else if (pref === 'waze') window.open(`https://waze.com/ul?ll=${navTarget.lat},${navTarget.lng}&navigate=yes`, '_blank')
    else window.open(`https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}&travelmode=driving`, '_blank')
  }

  return <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <header style={{ zIndex: 100, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: isDark? 'rgba(14,14,16,0.92)' : 'rgba(255,255,255,0.92)', backdropFilter:'blur(20px)', color: text, borderBottom: `1px solid ${border}`, position: 'relative' }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide Driver</strong>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '42px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, fontSize: '16px', display:'flex', alignItems:'center', justifyContent:'center' }}>{isDark? '☀️' : '🌙'}</button>
        <button onClick={toggleOnline} style={{ padding: '8px 14px', borderRadius: '20px', border: 'none', fontWeight: 'bold', background: isOnline? '#00d181' : '#666', color: 'white', fontSize: '12px' }}>{isOnline? '● ONLINE' : '○ OFFLINE'}</button>
      </div>
    </header>

    <div style={{ height: '100%', paddingBottom: '220px' }}>
      <MapView center={location} route={route} driverLocation={location} isNavigating={isNavigating} followDriver={isNavigating} bearing={bearing} mapStyle={mapStyleUrl} theme={theme} />
      <button onClick={() => { setZoom(17); setIsNavigating(true); setSheetHidden(true) }} style={{ position: 'absolute', right: '16px', bottom: sheetHidden? '70px' : '240px', zIndex: 50, width: '52px', height: '52px', borderRadius: '16px', background: bgCard, color: text, border: `1px solid ${border}`, boxShadow: '0 8px 20px rgba(0,0,0,0.25)', fontSize: '20px', transition:'bottom 0.45s cubic-bezier(0.32, 0.72, 0, 1)' }}>🎯</button>
    </div>

    <section style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60,
      background: bgCard, borderTopLeftRadius: '28px', borderTopRightRadius: '28px',
      padding: '12px 16px 24px', color: text, minHeight: '140px',
      borderTop: `1px solid ${border}`, boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
      transform: sheetHidden? 'translateY(calc(100% - 56px))' : 'translateY(0)',
      transition: 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)'
    }}>
      {/* Handle + minimized bar */}
      <div onClick={() => { if (isNavigating || ride) setSheetHidden(!sheetHidden) }} style={{ width:'100%', display:'flex', flexDirection:'column', alignItems:'center', cursor: (isNavigating || ride)? 'pointer':'default', padding:'2px 0 10px' }}>
        <div style={{ width: '36px', height: '4px', background: isDark? '#3a3a3e' : '#d1d5db', borderRadius: '2px', marginBottom: '8px' }} />
        {sheetHidden && ride && (
          <div style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:'13px', fontWeight:800, color:'#00d181' }}>▲ SHOW TRIP • R{ride.fare} • {routeData? `${routeData.distanceKm.toFixed(1)}km` : 'En route'}</div>
            <div style={{ fontSize:'11px', color:subText }}>{(ride as any).passenger_name || 'Passenger'} • ETA 6m</div>
          </div>
        )}
      </div>

      {!ride && (
        <div style={{ textAlign: 'center' }}>
          {isOnline && searchingRides.map(r => {
            const expires = new Date((r as any).offer_expires_at || Date.now() + 12000).getTime()
            const secs = Math.max(0, Math.floor((expires - now)/1000))
            return (
            <div key={r.id} style={{ background: isDark? '#1e1e22' : 'white', border: `2px solid #00d181`, borderRadius: '16px', padding: '14px', marginBottom: '12px', textAlign: 'left', boxShadow: '0 4px 12px rgba(0,209,129,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <p style={{ fontWeight: 'bold', margin: 0, color: '#00d181', fontSize: '14px' }}>BUDDY REQUEST • R {r.fare} • {(r as any).distance_km?.toFixed(1) || '1.2'}km</p>
                <span style={{ background: '#00d181', color: 'white', borderRadius: '12px', padding: '2px 8px', fontSize: '12px', fontWeight: 'bold' }}>{secs}s</span>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 'bold' }}>📍 {r.pickup_address}</p>
              <p style={{ margin: '0 0 8px', fontSize: '13px', color: subText }}>→ {r.dropoff_address}</p>
              <p style={{ margin: '0 0 10px', fontSize: '11px', background: bg2, display: 'inline-block', padding: '2px 6px', borderRadius: '6px', color: text }}>💵 Cash trip • {(r as any).payment_method || 'cash'}</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => declineRide(r.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>DECLINE</button>
                <button onClick={() => acceptRide(r.id)} style={{ flex: 1.5, padding: '12px', borderRadius: '10px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '15px' }}>ACCEPT</button>
              </div>
            </div>
          )})}
          <div style={{ fontSize: '14px', marginBottom: '12px', color: subText }}>{isOnline? (searchingRides.length? `✅ Offer expires in 12s 🔊` : '✅ You are online - Waiting for Buddy requests...') : 'You are offline'}</div>
          <button onClick={toggleOnline} style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', background: isOnline? '#ff4444' : 'linear-gradient(135deg, #00d181, #00b36f)', color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{isOnline? 'GO OFFLINE' : 'GO ONLINE 🔊'}</button>
          <p style={{ fontSize: '11px', color: subText, marginTop: '8px' }}>Wallet: R {profile.wallet_balance || 0} • Trips: {profile.trips_completed || 0} • Rating: {profile.rating || 5.0}★</p>
        </div>
      )}
      {ride && (ride.status as any) === 'accepted' && (
        <>
          <h3 style={{ margin: '0 0 6px', color: text }}>Go to Pickup • R {ride.fare}</h3>
          <p style={{ color: subText, margin: '0 0 12px', fontSize: '13px' }}>{ride.pickup_address}</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => openExternalMap(ride.pickup_lat, ride.pickup_lng)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}` }}>{isNavigating? 'Hide' : 'Navigate'}</button>
            <button onClick={async () => { await supabase.from('rides').update({ status: 'arrived' as any }).eq('id', ride.id) }} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold' }}>I Have Arrived</button>
          </div>
        </>
      )}
      {ride && (ride.status as any) === 'arrived' && (
        <>
          <h3 style={{ margin: '0 0 6px', color: text }}>Waiting for passenger - 5 min free</h3>
          <p style={{ fontSize: '13px', color: subText }}>{ride.pickup_address}</p>
          <button onClick={async () => { await supabase.from('rides').update({ status: 'picked_up' as any }).eq('id', ride.id) }} style={{ width: '100%', marginTop: '10px', padding: '14px', borderRadius: '12px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold' }}>Start Trip → {ride.dropoff_address}</button>
        </>
      )}
      {ride && ((ride.status as any) === 'picked_up' || (ride.status as any) === 'en_route' || (ride.status as any) === 'in_progress') && (
        <>
          <h3 style={{ margin: '0 0 6px', color: text }}>Drive to {ride.dropoff_address}</h3>
          <p style={{ fontSize: '12px', color: subText }}>Cash: Collect R {ride.fare} from passenger • {routeData? `${routeData.distanceKm.toFixed(1)}km` : ''}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button onClick={() => openExternalMap(ride.dropoff_lat, ride.dropoff_lng)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}` }}>{isNavigating? 'Hide Map' : 'Navigate'}</button>
            <button onClick={completeRide} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#00c853', color: 'white', border: 'none', fontWeight: 'bold' }}>Complete Trip</button>
          </div>
        </>
      )}
    </section>
    {showNavChooser && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ width: '100%', background: bgCard, borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '20px' }}>
          <div style={{ width: '40px', height: '4px', background: '#555', borderRadius: '2px', margin: '0 auto 16px' }} />
          <h3 style={{ margin: '0 0 4px', color: text }}>Choose Navigation</h3>
          <p style={{ margin:'0 0 12px', fontSize:'13px', color:subText }}>Your choice is saved for next time</p>
          <button onClick={() => chooseNav('mapbox')} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold', marginBottom: '10px' }}>🗺️ Buddy navigation (inside app)</button>
          <button onClick={() => chooseNav('google')} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold', marginBottom: '10px' }}>📍 Google Maps</button>
          <button onClick={() => chooseNav('waze')} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold', marginBottom: '16px' }}>🚗 Waze</button>
          <button onClick={() => setShowNavChooser(false)} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'transparent', color: text, border: `1px solid ${border}` }}>Cancel</button>
        </div>
      </div>
    )}
  </div>
}