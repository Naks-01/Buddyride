import { useEffect, useState, useRef } from 'react'
import { MapboxMapView } from '../components/MapboxMapView'
import { NavigationMenu } from '../components/NavigationMenu'
import { RideChat } from '../components/RideChat'
import { getRoute } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]
const REQUIRED_DOCS = ['id','license','pdp','car_papers','disc','selfie','huru'] as const
const TEST_DRIVER_EMAILS = ['mokgalaka.nt@gmail.com', 'mokgafaka.nt@gmail.com', 'testdriver@buddyride.co.za', 'TestDriver@buddyride.co.za', 'test@buddyride.co.za']

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
  const mapStyleUrl = isDark? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'
  const isTestDriver = TEST_DRIVER_EMAILS.map(e=>e.toLowerCase()).includes((profile.email || '').toLowerCase()) || (profile.full_name || '').toLowerCase().includes('mokgalaka') || (profile.full_name || '').toLowerCase().includes('mokgafaka') || (profile.email || '').toLowerCase().includes('testdriver') || (profile.email || '').toLowerCase().includes('buddyride')

  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!ride &&!showDriverRating) { setRoute(undefined); setRouteData(null); setIsNavigating(false); setZoom(13); setShowChat(false) } }, [ride, showDriverRating])

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
      const { data } = await supabase.from('rides').select('*').eq('driver_id', profile.id).in('status', ['accepted','arrived','picked_up','en_route','in_progress'] as any).order('created_at', { ascending: false }).limit(1).single()
      if (data) { setRide(data); setIsNavigating(true); setZoom(17) }
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
    let interval: any
    async function buildRoute() {
      if (!ride) return
      const from = lastLocation.current[0]!== 0? lastLocation.current : location
      if (!from) return
      const target: [number, number] = (ride.status as any) === 'accepted' || (ride.status as any) === 'arrived'? [ride.pickup_lng, ride.pickup_lat] : [ride.dropoff_lng, ride.dropoff_lat]
      try { const r = await getRoute(from, target); setRoute(r.geometry); setRouteData(r) } catch {}
    }
    buildRoute()
    if (isNavigating) { interval = setInterval(buildRoute, 15000) }
    return () => clearInterval(interval)
  }, [ride?.id, ride?.status, location, isNavigating])

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
    await supabase.from('rides').update({ status: 'completed' as any } as any).eq('id', rideId)
    const commission = fare * 0.20
    const { data: prof } = await supabase.from('profiles').select('wallet_balance, trips_completed').eq('id', profile.id).single() as any
    const newBal = (prof?.wallet_balance || 0) - commission
    await supabase.from('profiles').update({ wallet_balance: newBal, trips_completed: (prof?.trips_completed || 0) + 1 } as any).eq('id', profile.id)
    setShowCollected(fare)
    setTimeout(() => { setShowCollected(null); setShowDriverRating(true) }, 1200)
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
  async function skipRating() {
    if (!ride) return
    await supabase.from('rides').update({ status: 'rated' as any, driver_rating: 0 } as any).eq('id', ride.id)
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

  const curStep = (() => {
    if (!routeData?.steps?.length) return null
    return routeData.steps.find((s:any)=> s.distance > 30) || routeData.steps[0]
  })()
  const instruction = curStep?.maneuver?.instruction || routeData?.steps?.[0]?.maneuver?.instruction || 'Head straight'
  const distText = curStep ? `${(curStep.distance/1000).toFixed(1)}km • ${Math.ceil(curStep.duration/60)} min •` : routeData? `${routeData.distanceKm.toFixed(1)}km • ${Math.ceil(routeData.durationMin)} min •` : '0.0km • 0 min •'
  const showTopBanner =!isTestDriver && docStatus!== 'approved' || isTestDriver
  const topBannerHeight = showTopBanner? 42 : 0

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#08080A]">
      <div className="absolute inset-0">
        <MapboxMapView center={location} driverLocation={location} route={route} bearing={bearing} isNavigating={isNavigating} followDriver={true} mapStyle={mapStyleUrl} theme={theme} />
      </div>

      <header className="absolute top-0 left-0 right-0 z-[300] flex items-center gap-3 px-4 py-3 bg-[#121214]/90 backdrop-blur-2xl border-b border-white/[0.06]">
        <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
        <div className="leading-none">
          <div className="font-black text-[16px]"><span className="text-[#FF6B00]">Buddy</span><span className="text-white">Ride</span> <span className="text-white/30 text-[10px] ml-1">DRIVER</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setTheme(isDark? 'light' : 'dark')} className="w-10 h-9 rounded-full bg-white/10 border border-white/10 text-white"> {isDark? '☀️' : '🌙'} </button>
          <button onClick={toggleOnline} className={`px-4 py-2 rounded-full text-[11px] font-black tracking-wide ${docStatus!=='approved' &&!isTestDriver? 'bg-zinc-700 text-white/40' : isOnline? 'bg-[#00D181] text-white shadow-[0_0_20px_rgba(0,209,129,0.4)]' : 'bg-white/10 text-white border border-white/10'}`}> {docStatus!=='approved' &&!isTestDriver? '⛔ BLOCKED' : isOnline? '● ONLINE' : '○ OFFLINE'} </button>
        </div>
      </header>

      {showTopBanner && (
        <div className={`absolute left-3 right-3 z-[80] rounded-xl px-4 py-2.5 text-[13px] font-bold text-white top-[62px] shadow-xl ${isTestDriver? 'bg-[#00D181]' : docStatus==='missing'? 'bg-[#FF3B30]' : 'bg-[#FF9500]'}`}>
          {isTestDriver? `✅ Test mode: ${profile.email}` : docStatus==='missing'? `⚠️ Upload 7 docs: ${approvedDocs.length}/7` : `⏳ Pending: ${approvedDocs.length}/7`}
        </div>
      )}

      {isNavigating && ride && (
        <div className="absolute left-3 right-3 z-[70] bg-white rounded-[18px] px-4 py-3.5 flex items-center gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]" style={{ top: `${68 + topBannerHeight + 8}px` }}>
          <div className="w-11 h-11 rounded-full bg-[#00D181] flex items-center justify-center text-white text-xl font-black">↑</div>
          <div><div className="font-extrabold text-[#111] text-[15px]">{instruction}</div><div className="text-[#666] text-[13px]">{distText}</div></div>
        </div>
      )}

      <button onClick={() => setZoom(17)} className="absolute right-4 z-50 w-[52px] h-[52px] rounded-full bg-white border shadow-lg text-xl bottom-[280px]">🎯</button>

      {cancelledNotification && (
        <div className="fixed top-[90px] left-3 right-3 z-[99999] bg-[#FF3B30] rounded-2xl p-4 flex gap-3 items-center">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-2xl">❌</div>
          <div className="flex-1"><div className="text-white font-black">Trip Cancelled!</div><div className="text-white/90 text-[13px]">{cancelledNotification.msg} • R{cancelledNotification.fare}</div></div>
          <button onClick={() => setCancelledNotification(null)} className="bg-white text-[#FF3B30] rounded-full px-3.5 py-2 font-bold">OK</button>
        </div>
      )}

      <section className="absolute bottom-0 left-0 right-0 z-40 bg-[#121214] border-t border-white/[0.06] rounded-t-[28px] p-3 pb-7 max-h-[72vh] overflow-y-auto shadow-[0_-8px_40px_rgba(0,0,0,0.6)]">
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mb-4" />

        {ride && (ride.status as any) === 'accepted' && (
          <>
            <div className="bg-[#14261A] border-2 border-[#00D181]/30 rounded-[16px] p-3 mb-3 flex justify-between items-center">
              <div><div className="text-[#00D181] text-[11px] font-black tracking-widest">FARE TO COLLECT</div><div className="text-white text-[22px] font-black">R {ride.fare} • {(ride as any).payment_method || 'CASH'}</div></div>
              <div className="bg-[#00D181] text-white px-3 py-1.5 rounded-lg text-xs font-black">CASH</div>
            </div>
            <div className="flex justify-between items-center mb-1"><h3 className="font-black text-white">Go to Pickup • R {ride.fare}</h3><button onClick={() => setShowChat(true)} className="w-12 h-12 rounded-full bg-[#00D181] text-xl">💬</button></div>
            <p className="text-[13px] text-white/50 mb-3">{ride.pickup_address?.split(',').slice(0,2).join(',')}</p>
            <div className="flex gap-2 mb-2">
              <button className="flex-1 py-3.5 rounded-xl bg-white/10 text-white border border-white/10 font-bold">{isNavigating? 'Navigating...' : 'Navigate'}</button>
              <button onClick={async () => { const prev=ride.status; setRide(r=>r?{...r,status:'arrived'} as any:r); const {error}=await supabase.from('rides').update({status:'arrived' as any} as any).eq('id',ride.id); if(error){alert(error.message); setRide(r=>r?{...r,status:prev} as any:r)} }} className="flex-[1.5] py-3.5 rounded-xl bg-[#00D181] text-white font-black">I Have Arrived</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${ride.pickup_lat},${ride.pickup_lng}`, '_blank')} className="flex-1 py-2.5 rounded-xl bg-[#4285F4] text-white font-bold text-sm">🗺️ Google</button>
              <button onClick={() => window.open(`https://waze.com/ul?ll=${ride.pickup_lat},${ride.pickup_lng}&navigate=yes`, '_blank')} className="flex-1 py-2.5 rounded-xl bg-[#33CCFF] text-black font-bold text-sm">🚗 Waze</button>
              <button onClick={() => openDriverCancel(ride)} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white border border-white/10 font-bold text-sm">Cancel</button>
            </div>
          </>
        )}

        {ride && (ride.status as any) === 'arrived' && (
          <>
            <div className="bg-[#14261A] border-2 border-[#00D181]/30 rounded-[16px] p-3 mb-3 text-center">
              <div className="text-[#00D181] text-[11px] font-black">PASSENGER IN CAR? START TRIP</div>
              <div className="text-white text-[22px] font-black">R {ride.fare} • {(ride as any).payment_method || 'CASH'}</div>
            </div>
            <div className="flex justify-between items-center mb-1"><h3 className="font-black text-white">You Have Arrived • R {ride.fare}</h3><button onClick={() => setShowChat(true)} className="w-12 h-12 rounded-full bg-[#00D181] text-xl">💬</button></div>
            <p className="text-[13px] text-white/50 mb-3">Waiting at {ride.pickup_address?.split(',').slice(0,2).join(',')}</p>
            <button onClick={async () => { const prev=ride.status; setRide(r=>r?{...r,status:'in_progress'} as any:r); const target:[number,number]=[ride.dropoff_lng,ride.dropoff_lat]; try{ const from=lastLocation.current[0]!==0?lastLocation.current:location; const res=await getRoute(from,target); setRoute(res.geometry); setRouteData(res)}catch{}; const {error}=await supabase.from('rides').update({status:'in_progress' as any} as any).eq('id',ride.id); if(error){alert(error.message); setRide(r=>r?{...r,status:prev} as any:r)} }} className="w-full py-4 rounded-[16px] bg-[#00D181] text-white font-black text-[16px] mb-2">Start Trip → Passenger In</button>
            <button onClick={() => openDriverCancel(ride)} className="w-full py-2.5 rounded-xl bg-white/10 text-white border border-white/10">Cancel Ride</button>
          </>
        )}

        {ride && ((ride.status as any) === 'picked_up' || (ride.status as any) === 'in_progress' || (ride.status as any) === 'en_route') &&!showDriverRating && (
          <>
            <div className="flex justify-between items-center"><h3 className="font-black text-white mb-1.5">Drive to {ride.dropoff_address?.split(',')[0]} • R {ride.fare}</h3><button onClick={() => setShowChat(true)} className="w-12 h-12 rounded-full bg-[#00D181] text-xl">💬</button></div>
            <p className="text-xs text-white/50 mb-3">Passenger in car • Cash trip</p>
            <div className="flex gap-2 mt-3"><button className="flex-1 py-3.5 rounded-xl bg-white/10 text-white border border-white/10">Navigating...</button><button onClick={completeRide} className="flex-[1.5] py-3.5 rounded-xl bg-[#FF6B00] text-white font-black shadow-[0_4px_20px_rgba(255,107,0,0.4)]">Complete Trip ✓ R {ride.fare}</button></div>
          </>
        )}

        {ride && (ride.status as any) === 'completed' &&!showDriverRating && showCollected === null && (
          <div className="text-center py-2">
            <div className="w-20 h-20 mx-auto rounded-full bg-[#00D181]/20 flex items-center justify-center text-4xl mb-3">✅</div>
            <h2 className="font-black text-white text-xl">Trip Completed!</h2>
            <div className="inline-flex items-center gap-2 mt-3 bg-[#FF6B00] px-6 py-3 rounded-full shadow-[0_6px_24px_rgba(255,107,0,0.4)]">
              <span className="text-white/70 text-sm font-bold">COLLECT</span><span className="text-white text-3xl font-black">R {ride.fare}</span><span className="bg-white text-[#FF6B00] text-[11px] font-black px-2 py-1 rounded-full">CASH</span>
            </div>
            <div className="flex justify-center gap-6 mt-4 text-[13px] text-white/50"><span>📍 {ride.dropoff_address?.split(',')[0]}</span><span>•</span><span>{routeData? `${routeData.distanceKm.toFixed(1)}km` : 'Trip'}</span><span>•</span><span>{routeData? `${Math.ceil(routeData.durationMin)} min` : ''}</span></div>
            <button onClick={() => setShowDriverRating(true)} className="w-full mt-5 py-4 rounded-[16px] bg-[#FF6B00] text-white font-black text-[16px]">Rate Passenger ⭐</button>
          </div>
        )}

        {showDriverRating && ride && (
          <div className="text-center py-2">
            <div className="text-5xl mb-2">⭐</div>
            <h2 className="font-black text-white text-xl">Rate Passenger</h2>
            <p className="text-white/50 text-[13px]">{ride.dropoff_address?.split(',')[0]} • R {ride.fare}</p>
            <div className="flex gap-1 justify-center my-6">
              {[1,2,3,4,5].map(s => (<button key={s} onClick={() => setDriverRating(s)} className={`text-[52px] bg-transparent border-none ${driverRating >= s? 'text-[#FFB400]' : 'text-white/20'}`}>{driverRating >= s? '★' : '☆'}</button>))}
            </div>
            <div className="flex gap-2.5">
              <button onClick={skipRating} className="flex-1 py-4 rounded-[16px] bg-white/10 text-white border border-white/10 font-bold">Skip</button>
              <button onClick={submitDriverRating} disabled={driverRating === 0} className={`flex-[1.5] py-4 rounded-[16px] font-black ${driverRating === 0? 'bg-zinc-700 text-white/30' : 'bg-[#FF6B00] text-white shadow-[0_4px_20px_rgba(255,107,0,0.4)]'}`}>{driverRating === 0? 'Select Stars' : `Rate ${driverRating}★`}</button>
            </div>
          </div>
        )}

        {!ride &&!showDriverRating && (
          <div className="text-center py-2">
            {isOnline && searchingRides.map(r => {
              const expires = new Date((r as any).offer_expires_at || Date.now() + 12000).getTime()
              const secs = Math.max(0, Math.floor((expires - now)/1000))
              return (
              <div key={r.id} className="bg-[#1E1E22] border-2 border-[#00D181]/40 rounded-[20px] p-4 mb-3 text-left shadow-[0_8px_32px_rgba(0,209,129,0.15)]">
                <div className="flex justify-between items-center mb-1"><p className="font-black text-[#00D181] text-[13px] tracking-wide">🔔 BUDDY REQUEST • R {r.fare}</p><span className="bg-[#00D181] text-white rounded-full px-2.5 py-1 text-xs font-black">{secs}s</span></div>
                <p className="text-[13px] text-white/70 my-1.5">📍 {r.pickup_address?.split(',')[0]} → {r.dropoff_address?.split(',')[0]}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => declineRide(r.id)} className="flex-1 py-3 rounded-xl bg-white/10 text-white border border-white/10 font-bold">DECLINE</button>
                  <button onClick={() => acceptRide(r.id)} className="flex-[1.5] py-3 rounded-xl bg-[#00D181] text-white font-black shadow-[0_4px_20px_rgba(0,209,129,0.4)]">ACCEPT R {r.fare}</button>
                </div>
              </div>
            )})}
            <div className="text-[13px] mb-3 text-white/40">{!isOnline && docStatus!=='approved' &&!isTestDriver? `⛔ Blocked - Docs: ${approvedDocs.length}/7` : isTestDriver? '✅ Test mode 🔊 Sound ON' : isOnline? '✅ Waiting for Buddy requests... 🔊' : 'You are offline'}</div>
            <button onClick={toggleOnline} className={`w-full py-4 rounded-[16px] font-black text-[16px] shadow-lg ${docStatus!=='approved' &&!isTestDriver? 'bg-zinc-700 text-white/40' : isOnline? 'bg-[#FF3B30] text-white' : 'bg-[#00D181] text-white shadow-[0_4px_20px_rgba(0,209,129,0.4)]'}`}>{docStatus!=='approved' &&!isTestDriver? `NEED DOCS (${approvedDocs.length}/7)` : isOnline? 'GO OFFLINE' : 'GO ONLINE 🔊'}</button>
          </div>
        )}
      </section>

      {showChat && ride && (<div className="fixed inset-0 z-[9999] bg-black/60 flex items-end"><div className="bg-[#18181B] w-full rounded-t-[24px] h-[75vh] flex flex-col"><div className="p-4 border-b border-white/10 flex justify-between items-center"><div><div className="font-bold text-white">Chat with Passenger</div><div className="text-[11px] text-white/40">Messages disappear after trip</div></div><button onClick={() => setShowChat(false)} className="w-9 h-9 rounded-full bg-white/10 border border-white/10 text-white">✕</button></div><div className="flex-1 overflow-hidden"><RideChat rideId={ride.id} myId={profile.id} /></div></div></div>)}
      {showCollected!== null && (<div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-5"><div className="bg-gradient-to-br from-[#FF6B00] to-[#FF9500] rounded-[24px] p-8 text-center w-full max-w-[340px] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"><div className="text-5xl mb-2">💰</div><div className="text-white/80 text-[12px] font-black tracking-widest">FARE COLLECTED</div><div className="text-white text-[42px] font-black">R {showCollected} CASH</div><button onClick={() => { setShowCollected(null); setShowDriverRating(true) }} className="mt-5 w-full py-3.5 rounded-xl bg-white text-[#FF6B00] font-black">Rate Passenger →</button></div></div>)}
      {showDriverCancelReason && (<div className="fixed inset-0 z-[9999] bg-black/70 flex items-end"><div className="bg-[#18181B] w-full rounded-t-[24px] p-5 text-white"><h3 className="font-black text-lg mb-3">Why cancel?</h3>{['Passenger no-show','Passenger asked to cancel','Wrong pickup','Vehicle issue','Other'].map(reason => (<button key={reason} onClick={() => setDriverCancelReason(reason)} className={`w-full text-left p-3.5 rounded-xl mb-2 border font-bold ${driverCancelReason===reason? 'bg-[#FF3B30] border-[#FF3B30] text-white' : 'bg-white/10 border-white/10 text-white/80'}`}>{reason} {driverCancelReason===reason? '✓':''}</button>))}<div className="flex gap-2 mt-4"><button onClick={() => { setShowDriverCancelReason(false); setDriverCancelReason(''); setRideToCancel(null) }} className="flex-1 py-3.5 rounded-xl bg-white/10 border border-white/10 font-bold">Back</button><button onClick={executeDriverCancel} disabled={!driverCancelReason} className="flex-[1.5] py-3.5 rounded-xl bg-[#FF3B30] text-white font-bold">Confirm Cancel</button></div></div></div>)}
    </div>
  )
}