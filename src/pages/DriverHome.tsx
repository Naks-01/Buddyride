import { useEffect, useState, useRef } from 'react'
import { MapboxMapView } from '../components/MapboxMapView'
import { NavigationMenu } from '../components/NavigationMenu'
import { RideChat } from '../components/RideChat'
import { getRoute } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]
const REQUIRED_DOCS = ['id','license','pdp','car_papers','disc','selfie'] as const
const TEST_DRIVER_EMAILS = ['mokgalaka.nt@gmail.com', 'mokgafaka.nt@gmail.com']

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
  const [bearing, setBearing] = useState(0)
  const watchId = useRef<number | null>(null)
  const lastSupabaseUpdate = useRef<number>(0)
  const lastLocation = useRef<[number, number]>(POLOKWANE_CENTER)
  const [docStatus, setDocStatus] = useState<'approved'|'pending'|'missing'>('missing')
  const [approvedDocs, setApprovedDocs] = useState<string[]>([])
  const [showDriverCancelReason, setShowDriverCancelReason] = useState(false)
  const [driverCancelReason, setDriverCancelReason] = useState('')
  const [rideToCancel, setRideToCancel] = useState<Ride | null>(null)
  const [showCollected, setShowCollected] = useState<number | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [declinedIds, setDeclinedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('declined_rides') || '[]') } catch { return [] }
  })
  const [cancelledNotification, setCancelledNotification] = useState<{msg: string, fare: number} | null>(null)
  const [driverRating, setDriverRating] = useState(0)
  const [showDriverRating, setShowDriverRating] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const prevRideCountRef = useRef(0)
  const beepIntervalRef = useRef<any>(null)

  const isDark = theme === 'dark'
  const bg = isDark? '#0e0e10' : '#f5f5f7'
  const bgCard = isDark? '#18181b' : '#ffffff'
  const bg2 = isDark? '#242428' : '#eeeeef'
  const text = isDark? 'white' : '#111827'
  const subText = isDark? '#9ca3af' : '#6b7280'
  const border = isDark? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const mapStyleUrl = isDark? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'
  const isTestDriver = TEST_DRIVER_EMAILS.includes(profile.email || '') || (profile.full_name || '').toLowerCase().includes('mokgalaka') || (profile.full_name || '').toLowerCase().includes('mokgafaka')

  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!ride &&!showDriverRating) { setRoute(undefined); setRouteData(null); setIsNavigating(false); setZoom(13); setShowChat(false) } }, [ride, showDriverRating])

  // SOUND SETUP
  useEffect(() => {
    audioRef.current = new Audio('https://cdn.pixabay.com/download/audio/2022/03/24/audio_1d171a2a6f.mp3?filename=notification-sound-7062.mp3')
    audioRef.current.volume = 1.0
    audioRef.current.preload = 'auto'
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    return () => { if (beepIntervalRef.current) clearInterval(beepIntervalRef.current) }
  }, [])

  function playBeep() {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, ctx.currentTime)
          gain.gain.setValueAtTime(0.6, ctx.currentTime)
          osc.connect(gain); gain.connect(ctx.destination)
          osc.start(); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6)
          setTimeout(() => { osc.stop(); ctx.close() }, 650)
        } catch {}
      })
    }
    if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 500])
  }

  useEffect(() => {
    if (searchingRides.length > prevRideCountRef.current && searchingRides.length > 0 && isOnline &&!ride) {
      playBeep()
      if (beepIntervalRef.current) clearInterval(beepIntervalRef.current)
      beepIntervalRef.current = setInterval(() => { playBeep() }, 3500)
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification('BuddyRide - New Request!', { body: `R ${searchingRides[0]?.fare} - ${searchingRides[0]?.pickup_address?.split(',')[0]} → ${searchingRides[0]?.dropoff_address?.split(',')[0]}` })
      }
    }
    if (searchingRides.length === 0 && beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null }
    prevRideCountRef.current = searchingRides.length
  }, [searchingRides, isOnline, ride])

  useEffect(() => {
    async function loadStatus() {
      const { data } = await supabase.from('profiles').select('is_online').eq('id', profile.id).single()
      if (data) setIsOnline((data as any).is_online || false)
      const { data: statusData } = await supabase.from('driver_status').select('is_online').eq('driver_id', profile.id).single()
      if (statusData) setIsOnline(statusData.is_online)
    }
    loadStatus()
    navigator.geolocation.getCurrentPosition(p => {
      const pos: [number, number] = [p.coords.longitude, p.coords.latitude]
      setLocation(pos); lastLocation.current = pos
    })
  }, [profile.id])

  useEffect(() => {
    if (isTestDriver) { setDocStatus('approved'); setApprovedDocs([...REQUIRED_DOCS]); return }
    async function checkDocs() {
      const { data } = await supabase.from('driver_documents').select('doc_type,status').eq('driver_id', profile.id)
      if (!data || data.length === 0) { setDocStatus('missing'); setApprovedDocs([]); return }
      const approved = data.filter((d:any) => d.status === 'approved').map((d:any)=>d.doc_type)
      setApprovedDocs(approved)
      const hasAll = REQUIRED_DOCS.every(r => approved.includes(r))
      if (hasAll) setDocStatus('approved'); else setDocStatus('pending')
    }
    checkDocs()
  }, [profile.id, isTestDriver])

  useEffect(() => {
    async function loadRide() {
      const { data } = await supabase.from('rides').select('*').eq('driver_id', profile.id).in('status', ['accepted','arrived','picked_up','en_route','in_progress','completed'] as any).order('created_at', { ascending: false }).limit(1).single()
      if (data) {
        if ((data as any).status === 'completed') { setRide(data); setShowCollected((data as any).fare || 0) }
        else { setRide(data); setIsNavigating(true); setZoom(17) }
      }
    }
    loadRide()
  }, [profile.id])

  useEffect(() => {
    const ch = supabase.channel(`driver-${profile.id}`)
 .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `driver_id=eq.${profile.id}` }, p => {
        const newRide = p.new as Ride
        if (!newRide) return
        const cancelledBy = (newRide as any).cancelled_by
        const reason = (newRide as any).cancel_reason
        if (newRide.status === 'cancelled' && cancelledBy === 'passenger') {
          setCancelledNotification({ msg: `Passenger cancelled: ${reason || 'No reason'}`, fare: newRide.fare })
          playBeep()
          setTimeout(() => setCancelledNotification(null), 5000)
          setIsNavigating(false); setZoom(13); setRide(null); setRoute(undefined); setRouteData(null); setSearchingRides([]); setShowChat(false); return
        }
        if (['rated'].includes(newRide.status as any)) {
          setIsNavigating(false); setZoom(13); setRide(null); setRoute(undefined); setRouteData(null); setSearchingRides([]); setShowChat(false); setShowDriverRating(false); setDriverRating(0); setShowCollected(null); return
        }
        if (newRide.status === 'completed') { setRide(newRide); return }
        if (['cancelled'].includes(newRide.status as any)) {
          setIsNavigating(false); setZoom(13); setRide(null); setRoute(undefined); setRouteData(null); setSearchingRides([]); setShowChat(false); return
        }
        setRide(newRide)
        if (['accepted','arrived','picked_up','in_progress','en_route'].includes(newRide.status as any)) { setIsNavigating(true); setZoom(17) }
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.id])

  useEffect(() => {
    if (!isOnline || ride) { setSearchingRides([]); return }
    async function loadSearching() {
      try {
        let query = supabase.from('rides').select('*').eq('status','searching').order('created_at',{ascending:false}).limit(1)
        if (isTestDriver) { query = query.is('offered_driver_id', null) } else { query = query.eq('offered_driver_id', profile.id) }
        const { data } = await query
        const filtered = (data || []).filter((r:any) =>!declinedIds.includes(r.id))
        setSearchingRides(filtered as Ride[])
      } catch(e) { console.log(e) }
    }
    loadSearching()
    const ch2 = supabase.channel(`offers-${profile.id}-real`)
 .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides' }, (p) => {
        const r = p.new as any; if (!r) return
        if (r.status === 'cancelled' && r.cancelled_by === 'passenger') {
          setSearchingRides(prev => {
            const wasShowing = prev.some(x => x.id === r.id)
            if (wasShowing) {
              setCancelledNotification({ msg: `Passenger cancelled searching ride: ${r.cancel_reason || 'Changed mind'}`, fare: r.fare })
              playBeep()
              setTimeout(() => setCancelledNotification(null), 4000)
            }
            return prev.filter(x => x.id!== r.id)
          })
        }
        if (r.status === 'searching' &&!declinedIds.includes(r.id)) loadSearching()
      })
 .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides' }, (p) => {
        const r = p.new as any; if (r?.status === 'searching' &&!declinedIds.includes(r.id)) loadSearching()
      }).subscribe()
    const interval = setInterval(loadSearching, 4000)
    return () => { supabase.removeChannel(ch2); clearInterval(interval) }
  }, [isOnline, ride, profile.id, isTestDriver, declinedIds])

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
        const nowTs = Date.now()
        if (nowTs - lastSupabaseUpdate.current > 3000) {
          lastSupabaseUpdate.current = nowTs
          if (ride) supabase.from('rides').update({ driver_lat: pos.coords.latitude, driver_lng: pos.coords.longitude } as any).eq('id', ride.id).then(()=>{})
          if (isOnline) {
            supabase.from('profiles').update({ current_lat: pos.coords.latitude, current_lng: pos.coords.longitude } as any).eq('id', profile.id).then(()=>{})
            supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: true, lat: pos.coords.latitude, lng: pos.coords.longitude, updated_at: new Date().toISOString() } as any, { onConflict: 'driver_id' }).then(()=>{})
          }
        }
      }, err => console.log(err), { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    ) as any
    return () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current) }
  }, [isNavigating, isOnline, ride?.id, profile.id])

  useEffect(() => {
    async function buildRoute() {
      if (!ride) return
      const from = lastLocation.current[0]!== 0? lastLocation.current : location
      if (!from) return
      const target: [number, number] = (ride.status as any) === 'accepted' || (ride.status as any) === 'arrived'? [ride.pickup_lng, ride.pickup_lat] : [ride.dropoff_lng, ride.dropoff_lat]
      try { const r = await getRoute(from, target); setRoute(r.geometry); setRouteData(r) } catch {}
    }
    buildRoute()
  }, [ride?.id, ride?.status, location])

  async function toggleOnline() {
    if (!isTestDriver && docStatus!== 'approved') { alert(`Cannot go online. Missing docs: ${REQUIRED_DOCS.filter(d=>!approvedDocs.includes(d)).join(', ')}`); return }
    const next =!isOnline; setIsOnline(next)
    await supabase.from('profiles').update({ is_online: next } as any).eq('id', profile.id)
    try {
      const pos = lastLocation.current
      await supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: next, lat: pos[1]!== undefined? pos[1] : -23.9045, lng: pos[0]!== undefined? pos[0] : 29.4689, updated_at: new Date().toISOString() } as any, { onConflict: 'driver_id' })
    } catch(e) {
      await supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: next, lat: -23.9045, lng: 29.4689 } as any, { onConflict: 'driver_id' })
    }
  }
  async function acceptRide(rideId: string) {
    if (beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null }
    try {
      const { data: rData } = await supabase.from('rides').select('pickup_lng,pickup_lat').eq('id', rideId).single()
      if (rData) {
        const from = lastLocation.current[0]!== 0? lastLocation.current : location
        const r = await getRoute(from, [(rData as any).pickup_lng, (rData as any).pickup_lat])
        setRoute(r.geometry); setRouteData(r)
      }
    } catch {}
    await supabase.from('rides').update({ driver_id: profile.id, status: 'accepted', started_at: new Date().toISOString(), offered_driver_id: profile.id } as any).eq('id', rideId)
    setSearchingRides([]); setIsNavigating(true); setZoom(17)
  }
  async function declineRide(rideId: string) {
    if (beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null }
    const newDeclined = [...declinedIds, rideId]
    setDeclinedIds(newDeclined)
    localStorage.setItem('declined_rides', JSON.stringify(newDeclined))
    setSearchingRides(prev => prev.filter(r => r.id!== rideId))
  }
  async function completeRide() {
    if (!ride) return
    const rideId = ride.id
    const fare = (ride as any).fare || 0
    setShowCollected(fare)
    setTimeout(() => { setShowCollected(null); setShowDriverRating(true) }, 1200)
    await supabase.from('rides').update({ status: 'completed' as any, ended_at: new Date().toISOString() }).eq('id', rideId)
    const commission = fare * 0.20
    const { data: prof } = await supabase.from('profiles').select('wallet_balance, trips_completed').eq('id', profile.id).single() as any
    const newBal = (prof?.wallet_balance || 0) - commission
    await supabase.from('profiles').update({ wallet_balance: newBal, trips_completed: (prof?.trips_completed || 0) + 1 } as any).eq('id', profile.id)
  }
  async function submitDriverRating() {
    if (!ride || driverRating === 0) return
    const rideId = ride.id
    await supabase.from('rides').update({ status: 'rated' as any, driver_rating: driverRating } as any).eq('id', rideId)
    try {
      const { data: passenger } = await supabase.from('profiles').select('rating, trips_completed').eq('id', ride.passenger_id).single() as any
      if (passenger) {
        const cur = passenger.rating || 5.0; const trips = passenger.trips_completed || 0
        const avg = ((cur * trips) + driverRating) / (trips + 1)
        await supabase.from('profiles').update({ rating: avg } as any).eq('id', ride.passenger_id)
      }
    } catch {}
    setRoute(undefined); setRouteData(null); setIsNavigating(false); setRide(null); setZoom(13); setShowChat(false); setShowDriverRating(false); setDriverRating(0); setShowCollected(null)
  }
  function openDriverCancel(targetRide: Ride | null) {
    if (!targetRide &&!ride) return
    setRideToCancel(targetRide || ride)
    setDriverCancelReason('')
    setShowDriverCancelReason(true)
  }
  async function executeDriverCancel() {
    if (!driverCancelReason) { alert('Please select a reason'); return }
    const target = rideToCancel || ride
    if (!target) return
    const rideId = target.id
    setShowDriverCancelReason(false)
    setRoute(undefined); setRouteData(null); setIsNavigating(false); setRide(null); setZoom(13); setRideToCancel(null); setShowChat(false)
    if (beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null }
    await supabase.from('rides').update({ status: 'cancelled', cancel_reason: driverCancelReason, cancelled_at: new Date().toISOString(), cancelled_by: 'driver', offered_driver_id: null, offer_expires_at: null } as any).eq('id', rideId)
    setDriverCancelReason('')
  }
  const instruction = routeData?.steps?.[0]?.instruction || 'Drive southeast.'
  const distText = routeData? `${routeData.distanceKm.toFixed(1)}km • ${Math.ceil(routeData.durationMin)} min •` : '0.0km • 0 min •'
  const showTopBanner =!isTestDriver && docStatus!== 'approved' || isTestDriver
  const topBannerHeight = showTopBanner? 42 : 0

  return <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <div style={{ position: 'absolute', inset: 0 }}>
      <MapboxMapView center={location} driverLocation={location} route={route} bearing={bearing} isNavigating={isNavigating} followDriver={true} mapStyle={mapStyleUrl} theme={theme} />
    </div>
    <header style={{ zIndex: 300, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: bgCard, color: text, borderBottom: `1px solid ${border}`, position: 'relative' }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide<br/>Driver</strong>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '42px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}` }}>{isDark? '☀️' : '🌙'}</button>
        <button onClick={toggleOnline} style={{ padding: '8px 14px', borderRadius: '20px', border: 'none', fontWeight: 'bold', background: docStatus!== 'approved' &&!isTestDriver? '#666' : isOnline? '#00d181' : '#666', color: 'white', fontSize: '12px' }}>{docStatus!== 'approved' &&!isTestDriver? '⛔ BLOCKED' : isOnline? '● ONLINE' : '○ OFFLINE'}</button>
      </div>
    </header>
    {showTopBanner && (
      <div style={{ position: 'absolute', top: '60px', left: '12px', right: '12px', zIndex: 80, background: isTestDriver? '#00d181' : docStatus==='missing'? '#ff3b30' : '#ff9500', color: 'white', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', fontWeight: 'bold' }}>
        {isTestDriver? `✅ Test mode: ${profile.email} - bypass docs` : docStatus==='missing'? `⚠️ Upload 6 docs: ${approvedDocs.length}/6` : `⏳ Pending: ${approvedDocs.length}/6 approved`}
      </div>
    )}
    {isNavigating && ride && (
      <div style={{ position: 'absolute', top: `${68 + topBannerHeight + 8}px`, left: '12px', right: '12px', zIndex: 70, background: 'white', borderRadius: '16px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '22px', background: '#00d181', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '22px' }}>↑</div>
        <div><div style={{ fontWeight: '800', color: '#111', fontSize: '16px' }}>{instruction}</div><div style={{ color: '#666', fontSize: '13px' }}>{distText}</div></div>
      </div>
    )}
    <button onClick={() => setZoom(17)} style={{ position: 'absolute', right: '16px', bottom: '260px', zIndex: 50, width: '52px', height: '52px', borderRadius: '26px', background: 'white', border: '1px solid #ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: '20px' }}>🎯</button>

    {cancelledNotification && (
      <div style={{position:'fixed', top:'90px', left:'12px', right:'12px', zIndex:99999, background:'#ff3b30', borderRadius:'16px', padding:'16px', display:'flex', gap:'12px', alignItems:'center', boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
        <div style={{width:'48px', height:'48px', borderRadius:'24px', background:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px'}}>❌</div>
        <div style={{flex:1}}><div style={{color:'white', fontWeight:'900', fontSize:'15px'}}>Trip Cancelled by Passenger!</div><div style={{color:'white', fontSize:'13px', opacity:0.9}}>{cancelledNotification.msg} • R{cancelledNotification.fare}</div></div>
        <button onClick={() => setCancelledNotification(null)} style={{background:'white', color:'#ff3b30', border:'none', borderRadius:'20px', padding:'8px 14px', fontWeight:'bold'}}>OK</button>
      </div>
    )}

    <section style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60, background: bgCard, borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '14px 12px 20px', color: text, borderTop: `1px solid ${border}`, maxHeight: '70vh', overflowY: 'auto' }}>
      {ride && (ride.status as any) === 'accepted' && (
        <>
          <div style={{background:'#1a3a2a', border:'2px solid #00d181', borderRadius:'14px', padding:'12px', marginBottom:'12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div><div style={{color:'#00d181', fontSize:'12px', fontWeight:'bold'}}>FARE TO COLLECT</div><div style={{color:'white', fontSize:'22px', fontWeight:'900'}}>R {ride.fare} • {(ride as any).payment_method || 'CASH'}</div></div>
            <div style={{background:'#00d181', color:'white', padding:'6px 10px', borderRadius:'8px', fontSize:'12px', fontWeight:'bold'}}>CASH</div>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{ margin: '0 0 4px' }}>Go to Pickup • R {ride.fare}</h3><button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button></div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: subText }}>{ride.pickup_address?.split(',').slice(0,2).join(',')}</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button style={{ flex: 1, padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>{isNavigating? 'Navigating...' : 'Navigate'}</button>
            <button onClick={async () => { await supabase.from('rides').update({ status: 'arrived' as any }).eq('id', ride.id) }} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold' }}>I Have Arrived</button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${ride.pickup_lat},${ride.pickup_lng}`, '_blank')} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#4285F4', color: 'white', border: 'none', fontWeight: 'bold' }}>🗺️ Google</button>
            <button onClick={() => window.open(`https://waze.com/ul?ll=${ride.pickup_lat},${ride.pickup_lng}&navigate=yes`, '_blank')} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#33CCFF', color: 'black', border: 'none', fontWeight: 'bold' }}>🚗 Waze</button>
            <button onClick={() => openDriverCancel(ride)} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>Cancel</button>
          </div>
        </>
      )}
      {ride && (ride.status as any) === 'arrived' && (
        <>
          <div style={{background:'#00d181', borderRadius:'14px', padding:'14px', marginBottom:'12px', textAlign:'center'}}><div style={{color:'white', fontSize:'13px', fontWeight:'bold', opacity:0.9}}>💰 COLLECT FROM PASSENGER ON ARRIVAL</div><div style={{color:'white', fontSize:'28px', fontWeight:'900', marginTop:'4px'}}>R {ride.fare} CASH</div></div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{ margin: '0 0 4px' }}>You Have Arrived • R {ride.fare}</h3><button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button></div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: subText }}>Waiting at {ride.pickup_address?.split(',').slice(0,2).join(',')}</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}><button onClick={async () => {
            const target: [number, number] = [ride.dropoff_lng, ride.dropoff_lat]
            try { const from = lastLocation.current[0]!== 0? lastLocation.current : location; const r = await getRoute(from, target); setRoute(r.geometry); setRouteData(r) } catch {}
            await supabase.from('rides').update({ status: 'in_progress' as any, picked_up_at: new Date().toISOString() } as any).eq('id', ride.id)
          }} style={{ flex: 1, padding: '16px', borderRadius: '14px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '16px' }}>Start Trip → Passenger In</button></div>
          <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => openDriverCancel(ride)} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: bg2, color: text, border: `1px solid ${border}` }}>Cancel Ride</button></div>
        </>
      )}
      {ride && ((ride.status as any) === 'picked_up' || (ride.status as any) === 'in_progress' || (ride.status as any) === 'en_route') &&!showDriverRating && (
        <>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{ margin: '0 0 6px' }}>Drive to {ride.dropoff_address?.split(',')[0]} • R {ride.fare}</h3><button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button></div>
          <p style={{margin:'0 0 10px', fontSize:'12px', color:subText}}>Passenger in car</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}><button style={{ flex: 1, padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}` }}>Navigating...</button><button onClick={completeRide} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#ff7a00', color: 'white', border: 'none', fontWeight: 'bold' }}>Complete Trip ✓ R {ride.fare}</button></div>
        </>
      )}
      {ride && (ride.status as any) === 'completed' &&!showDriverRating && showCollected === null && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px' }}>✅</div>
          <h2 style={{ margin: '8px 0' }}>Trip Completed!</h2>
          <h1 style={{ color: '#00d181', margin: '4px 0' }}>R {ride.fare} CASH</h1>
          <p style={{ color: subText, fontSize: '13px' }}>Rate passenger to continue</p>
          <button onClick={() => setShowDriverRating(true)} style={{ width: '100%', marginTop: '16px', padding: '16px', borderRadius: '14px', background: '#ff7a00', color: 'white', border: 'none', fontWeight: 'bold' }}>Rate Passenger ⭐</button>
        </div>
      )}
      {showDriverRating && ride && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px' }}>⭐</div>
          <h2 style={{ margin: '8px 0' }}>Rate Passenger</h2>
          <p style={{ color: subText, fontSize: '13px' }}>{ride.dropoff_address?.split(',')[0]} • R {ride.fare}</p>
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', margin: '20px 0' }}>
            {[1,2,3,4,5].map(s => (
              <button key={s} onClick={() => setDriverRating(s)} style={{ fontSize: '52px', background: 'none', border: 'none', color: driverRating >= s? '#FFB400' : '#444' }}>{driverRating >= s? '★' : '☆'}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setShowDriverRating(false); setRide(null); setRoute(undefined); setIsNavigating(false); setZoom(13); setDriverRating(0) }} style={{ flex: 1, padding: '16px', borderRadius: '14px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>Skip</button>
            <button onClick={submitDriverRating} disabled={driverRating === 0} style={{ flex: 1.5, padding: '16px', borderRadius: '14px', background: driverRating === 0? '#666' : '#ff7a00', color: 'white', border: 'none', fontWeight: 'bold' }}>{driverRating === 0? 'Select Stars' : `Rate ${driverRating}★`}</button>
          </div>
        </div>
      )}
      {!ride &&!showDriverRating && (
        <div style={{ textAlign: 'center' }}>
          {isOnline && searchingRides.map(r => {
            const expires = new Date((r as any).offer_expires_at || Date.now() + 12000).getTime()
            const secs = Math.max(0, Math.floor((expires - now)/1000))
            return (
            <div key={r.id} style={{ background: isDark? '#1e1e22' : 'white', border: `2px solid #00d181`, borderRadius: '16px', padding: '14px', marginBottom: '12px', textAlign: 'left', animation: 'pulse 1s infinite' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><p style={{ fontWeight: 'bold', margin: 0, color: '#00d181' }}>🔔 BUDDY REQUEST • R {r.fare}</p><span style={{ background: '#00d181', color: 'white', borderRadius: '12px', padding: '2px 8px', fontSize: '12px' }}>{secs}s</span></div>
              <p style={{ margin: '6px 0', fontSize: '13px' }}>📍 {r.pickup_address?.split(',')[0]} → {r.dropoff_address?.split(',')[0]}</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={() => declineRide(r.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: bg2, color: text, border: `1px solid ${border}` }}>DECLINE</button>
                <button onClick={() => acceptRide(r.id)} style={{ flex: 1.5, padding: '12px', borderRadius: '10px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold' }}>ACCEPT R {r.fare}</button>
              </div>
            </div>
          )})}
          <div style={{ fontSize: '14px', marginBottom: '12px', color: subText }}>{!isOnline && docStatus!=='approved' &&!isTestDriver? `⛔ Blocked - Docs: ${approvedDocs.length}/6` : isTestDriver? '✅ Test mode 🔊 Sound ON' : isOnline? '✅ Waiting for Buddy requests... 🔊' : 'You are offline'}</div>
          <button onClick={toggleOnline} style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', background: docStatus!=='approved' &&!isTestDriver? '#666' : isOnline? '#ff4444' : '#00d181', color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{docStatus!=='approved' &&!isTestDriver? `NEED DOCS (${approvedDocs.length}/6)` : isOnline? 'GO OFFLINE' : 'GO ONLINE 🔊'}</button>
        </div>
      )}
    </section>
    {showChat && ride && (<div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}><div style={{ background: bgCard, width: '100%', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', height: '75vh', display: 'flex', flexDirection: 'column' }}><div style={{ padding: '16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontWeight: 'bold', color: text }}>Chat with Passenger</div><div style={{ fontSize: '11px', color: '#999' }}>Messages disappear after trip</div></div><button onClick={() => setShowChat(false)} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, color: text }}>✕</button></div><div style={{ flex: 1, overflow: 'hidden' }}><RideChat rideId={ride.id} myId={profile.id} /></div></div></div>)}
    {showCollected!== null && (<div style={{position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}><div style={{background:'linear-gradient(135deg,#ff7a00,#ff9500)', borderRadius:'24px', padding:'32px 24px', textAlign:'center', width:'100%', maxWidth:'340px'}}><div style={{fontSize:'48px'}}>💰</div><div style={{color:'white', fontSize:'14px', fontWeight:'bold'}}>FARE COLLECTED</div><div style={{color:'white', fontSize:'42px', fontWeight:'900'}}>R {showCollected} CASH</div><button onClick={() => { setShowCollected(null); setShowDriverRating(true) }} style={{marginTop:'18px', width:'100%', padding:'14px', borderRadius:'12px', background:'white', color:'#ff7a00', border:'none', fontWeight:'900'}}>Rate Passenger →</button></div></div>)}
    {showDriverCancelReason && (<div style={{position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'flex-end'}}><div style={{background: isDark? '#18181b':'white', width:'100%', borderTopLeftRadius:'24px', borderTopRightRadius:'24px', padding:'20px', color: text}}><h3>Why cancel?</h3>{['Passenger no-show','Passenger asked to cancel','Wrong pickup','Vehicle issue','Other'].map(reason => (<button key={reason} onClick={() => setDriverCancelReason(reason)} style={{ width:'100%', textAlign:'left', padding:'14px', borderRadius:'12px', marginBottom:'8px', background: driverCancelReason===reason? '#ff3b30':'#242428', color: text, border: `1px solid ${border}` }}>{reason} {driverCancelReason===reason? '✓':''}</button>))}<div style={{display:'flex', gap:'8px', marginTop:'16px'}}><button onClick={() => { setShowDriverCancelReason(false); setDriverCancelReason(''); setRideToCancel(null) }} style={{flex:1, padding:'14px', borderRadius:'12px', background:bg2, color:text, border:`1px solid ${border}`, fontWeight:'bold'}}>Back</button><button onClick={executeDriverCancel} style={{flex:1.5, padding:'14px', borderRadius:'12px', background:'#ff3b30', color:'white', border:'none', fontWeight:'bold'}} disabled={!driverCancelReason}>Confirm Cancel</button></div></div></div>)}
  </div>
}