import { useEffect, useState, useRef } from 'react'
import { BottomSheet, type BottomSheetSnapPoint } from '../components/BottomSheet'
import { MapboxMapView } from '../components/MapboxMapView'
import { NavigationMenu } from '../components/NavigationMenu'
import { RideChat } from '../components/RideChat'
import { getRoute } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]
const REQUIRED_DOCS = ['id','license','pdp','car_papers','disc','selfie','huru'] as const
const TEST_DRIVER_EMAILS = ['mokgalaka.nt@gmail.com', 'mokgafaka.nt@gmail.com', 'testdriver@buddyride.co.za', 'TestDriver@buddyride.co.za', 'test@buddyride.co.za']

const COMMISSION = 0.20
const EXPIRE_SECONDS = 15
function distanceBetweenCoordinates(from: [number, number], to: [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const [fromLng, fromLat] = from.map(radians)
  const [toLng, toLat] = to.map(radians)
  const deltaLat = toLat - fromLat
  const deltaLng = toLng - fromLng
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
const getEarnings = (fare: number) => {
  const f = fare || 0
  return { driverGets: Math.round(f * 0.8), platformGets: Math.round(f * 0.2) }
}

export function DriverHome({ profile }: { profile: Profile }) {
  const [location, setLocation] = useState<[number, number]>(POLOKWANE_CENTER)
  const [ride, setRide] = useState<Ride | null>(null)
  const [searchingRides, setSearchingRides] = useState<Ride[]>([])
  const [route, setRoute] = useState<any>()
  const [routeData, setRouteData] = useState<any>(null)
  const routeDataRef = useRef<any>(null)
  const activeStepIndexRef = useRef(0)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [nextTurnDistance, setNextTurnDistance] = useState<number | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('buddy_theme') as any) || 'light')
  const [zoom, setZoom] = useState(13)
  const [now, setNow] = useState(Date.now())
  const [bearing, setBearing] = useState(0)
  const [speedKmh, setSpeedKmh] = useState(0)
  const [uiVisible, setUiVisible] = useState(true)
  const [lastTouch, setLastTouch] = useState(Date.now())
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
  const [passengerProfile, setPassengerProfile] = useState<any>(null)
  const [secondsLeft, setSecondsLeft] = useState(EXPIRE_SECONDS)
  const requestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // --- SLIDE ONLY FIX ---
  const [isMinimized, setIsMinimized] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnapPoint>(50)

  const isDark = theme === 'dark'
  const bg = isDark? '#0e0e10' : '#f5f5f7'
  const bgCard = isDark? '#121214' : '#ffffff'
  const bg2 = isDark? '#242428' : '#eeeeef'
  const text = isDark? 'white' : '#111827'
  const subText = isDark? '#9ca3af' : '#6b7280'
  const border = isDark? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const isTestDriver = TEST_DRIVER_EMAILS.map(e=>e.toLowerCase()).includes((profile.email || '').toLowerCase()) || (profile.full_name || '').toLowerCase().includes('mokgalaka') || (profile.full_name || '').toLowerCase().includes('mokgafaka') || (profile.email || '').toLowerCase().includes('testdriver') || (profile.email || '').toLowerCase().includes('buddyride')
  const rideStatus = String(ride?.status || '').toLowerCase().replace(/[\s-]+/g, '_')
  routeDataRef.current = routeData

  function updateNavigationProgress(position: [number, number]) {
    const steps = routeDataRef.current?.steps
    if (!steps?.length) {
      setNextTurnDistance(null)
      return
    }

    let index = Math.min(activeStepIndexRef.current, steps.length - 1)
    while (index < steps.length - 1) {
      const maneuverLocation = steps[index]?.maneuver?.location as [number, number] | undefined
      if (!maneuverLocation || distanceBetweenCoordinates(position, maneuverLocation) > 30) break
      index += 1
    }

    activeStepIndexRef.current = index
    setActiveStepIndex(index)
    const target = steps[index]?.maneuver?.location as [number, number] | undefined
    if (target) setNextTurnDistance(distanceBetweenCoordinates(position, target))
  }
  const incomingRide = !ride ? searchingRides.find(r => r.status === 'searching') : undefined

  function clearRequestTimer() {
    if (requestTimerRef.current) {
      clearInterval(requestTimerRef.current)
      requestTimerRef.current = null
    }
  }

  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!ride &&!showDriverRating) { setRoute(undefined); setRouteData(null); setIsNavigating(false); setZoom(13); setShowChat(false); setIsMinimized(false); setSheetSnap(50) } }, [ride, showDriverRating])
  useEffect(() => {
    if (rideStatus === 'searching' || rideStatus === 'finding') {
      setSheetSnap(25)
      setIsMinimized(true)
    } else if (['driver_assigned', 'accepted', 'driver_arriving'].includes(rideStatus)) {
      setSheetSnap(50)
      setIsMinimized(false)
    } else if (['arrived', 'passenger_in', 'i_have_arrived'].includes(rideStatus)) {
      setSheetSnap(80)
      setIsMinimized(false)
    } else if (['on_trip', 'driving_to_destination', 'picked_up', 'in_progress', 'en_route'].includes(rideStatus)) {
      setSheetSnap(50)
      setIsMinimized(false)
    } else if (rideStatus === 'completed') {
      setSheetSnap(90)
      setIsMinimized(false)
    }
  }, [rideStatus])
  useEffect(() => {
    if (!isNavigating || !ride) {
      setUiVisible(true)
      return
    }
    if (!uiVisible) return
    const timer = setTimeout(() => setUiVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [isNavigating, ride?.id, rideStatus, uiVisible, lastTouch])
  useEffect(() => {
    if (!ride?.passenger_id) { setPassengerProfile(null); return }
    supabase.from('profiles').select('full_name, rating, phone').eq('id', ride.passenger_id).single().then(({data}) => { if (data) setPassengerProfile(data) })
  }, [ride?.passenger_id])
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
      if (data) { setRide(data); setIsNavigating(true); setZoom(17); setIsMinimized(true) }
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
    clearRequestTimer()
    if (!incomingRide || incomingRide.status !== 'searching') return

    const expiresAt = (incomingRide as any).offer_expires_at
    const remaining = expiresAt
      ? Math.max(0, Math.min(EXPIRE_SECONDS, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)))
      : EXPIRE_SECONDS
    setSecondsLeft(remaining)
    if (remaining === 0) {
      void declineRide(incomingRide.id)
      return
    }

    let seconds = remaining
    const rideId = incomingRide.id
    requestTimerRef.current = setInterval(() => {
      seconds -= 1
      setSecondsLeft(seconds)
      if (seconds <= 0) {
        clearRequestTimer()
        void declineRide(rideId)
      }
    }, 1000)
    return clearRequestTimer
  }, [incomingRide?.id])
  useEffect(() => {
    if (!isNavigating &&!isOnline) return
    watchId.current = navigator.geolocation.watchPosition(pos => {
        const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
          updateNavigationProgress(p)
          setSpeedKmh((pos.coords.speed ?? 0) * 3.6)
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
            // FIX: send live location + heading to passenger
            supabase.from('driver_locations').upsert({ 
              driver_id: profile.id, 
              lat: pos.coords.latitude, 
              lng: pos.coords.longitude,
              heading: pos.coords.heading ?? bearing,
              speed: pos.coords.speed ?? 0,
              is_online: true,
              updated_at: new Date().toISOString() 
            } as any, { onConflict: 'driver_id' }).then(()=>{})
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
      try {
        const r = await getRoute(from, target)
        activeStepIndexRef.current = 0
        setActiveStepIndex(0)
        routeDataRef.current = r
        setRoute(r.geometry)
        setRouteData(r)
        updateNavigationProgress(from)
      } catch {}
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
    clearRequestTimer()
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
    setSearchingRides([]); setIsNavigating(true); setZoom(17); setIsMinimized(true)
  }
  async function declineRide(rideId: string) {
    clearRequestTimer()
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
    const commission = fare * COMMISSION
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
    return routeData.steps[activeStepIndex] || routeData.steps[0]
  })()
  const instruction = curStep?.maneuver?.instruction || routeData?.steps?.[0]?.maneuver?.instruction || 'Head straight'
  const distText = nextTurnDistance !== null
    ? `${nextTurnDistance >= 1000 ? `${(nextTurnDistance / 1000).toFixed(1)}km` : `${Math.ceil(nextTurnDistance / 10) * 10}m`} • ${curStep ? `${Math.ceil(curStep.duration / 60)} min` : ''}`
    : routeData ? `${routeData.distanceKm.toFixed(1)}km • ${Math.ceil(routeData.durationMin)} min` : '0.0km • 0 min'
  const showTopBanner = (!isTestDriver && docStatus!== 'approved') || (import.meta.env.DEV && isTestDriver)
  const topBannerHeight = showTopBanner? 42 : 0

  return <div className={`ride-app ride-app--${theme}`} onPointerDown={() => { setUiVisible(true); setLastTouch(Date.now()) }} style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <div onClick={() => { setUiVisible(true); setLastTouch(Date.now()) }} style={{ position: 'absolute', inset: 0 }}>
      <MapboxMapView center={location} driverLocation={location} route={route} bearing={bearing} speedKmh={speedKmh} isNavigating={isNavigating} followDriver={true} theme={theme} />
    </div>
    <header className="ride-header" style={{ zIndex: 300, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: bgCard, color: text, borderBottom: `1px solid ${border}`, position: 'relative', transform: uiVisible ? 'translateY(0)' : 'translateY(-110%)', transition: 'transform 300ms ease' }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide<br/>Driver</strong>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '42px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}` }}>{isDark? '☀️' : '🌙'}</button>
        <button onClick={toggleOnline} style={{ padding: '8px 14px', borderRadius: '20px', border: 'none', fontWeight: 'bold', background: docStatus!== 'approved' &&!isTestDriver? '#666' : isOnline? '#00d181' : '#666', color: 'white', fontSize: '12px' }}>{docStatus!== 'approved' &&!isTestDriver? '⛔ BLOCKED' : isOnline? '● ONLINE' : '○ OFFLINE'}</button>
      </div>
    </header>
    {showTopBanner && (
      <div style={{ position: 'absolute', top: '60px', left: '12px', right: '12px', zIndex: 80, background: isTestDriver? '#00d181' : docStatus==='missing'? '#ff3b30' : '#ff9500', color: 'white', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', fontWeight: 'bold', transform: uiVisible ? 'translateY(0)' : 'translateY(-150%)', transition: 'transform 300ms ease' }}>
        {isTestDriver? `✅ Test mode: ${profile.email} - bypass docs` : docStatus==='missing'? `⚠️ Upload 7 docs: ${approvedDocs.length}/7` : `⏳ Pending: ${approvedDocs.length}/7 approved`}
      </div>
    )}
    {isNavigating && ride && (
      <div style={{ position: 'absolute', top: `${68 + topBannerHeight + 8}px`, left: '12px', right: '12px', zIndex: 70, background: 'white', borderRadius: '16px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', transform: uiVisible ? 'translateY(0)' : 'translateY(-160%)', transition: 'transform 300ms ease' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '22px', background: '#00d181', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '22px' }}>↑</div>
        <div><div style={{ fontWeight: '800', color: '#111', fontSize: '16px' }}>{instruction}</div><div style={{ color: '#666', fontSize: '13px' }}>{distText}</div></div>
      </div>
    )}
    {!uiVisible && isNavigating && ride && (
      <div style={{ position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 90, padding: '7px 12px', borderRadius: '999px', color: 'white', background: 'rgba(28,28,30,.88)', fontSize: '13px', fontWeight: 700 }}>
        {Math.round(speedKmh)} km/h
      </div>
    )}
    {uiVisible && <button onClick={() => setZoom(17)} style={{ position: 'absolute', right: '16px', bottom: `calc(${sheetSnap}dvh + 12px)`, zIndex: 50, width: '52px', height: '52px', borderRadius: '26px', background: 'white', border: '1px solid #ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: '20px', transition: 'bottom 0.3s ease' }}>🎯</button>}
    {cancelledNotification && (
      <div style={{position:'fixed', top:'90px', left:'12px', right:'12px', zIndex:99999, background:'#ff3b30', borderRadius:'16px', padding:'16px', display:'flex', gap:'12px', alignItems:'center', boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
        <div style={{width:'48px', height:'48px', borderRadius:'24px', background:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px'}}>❌</div>
        <div style={{flex:1}}><div style={{color:'white', fontWeight:'900', fontSize:'15px'}}>Trip Cancelled by Passenger!</div><div style={{color:'white', fontSize:'13px', opacity:0.9}}>{cancelledNotification.msg} • R{cancelledNotification.fare}</div></div>
        <button onClick={() => setCancelledNotification(null)} style={{background:'white', color:'#ff3b30', border:'none', borderRadius:'20px', padding:'8px 14px', fontWeight:'bold'}}>OK</button>
      </div>
    )}
    <div style={{ position: 'absolute', inset: 'auto 0 0', height: '90dvh', zIndex: 60, transform: uiVisible || !isNavigating ? 'translateY(0)' : 'translateY(calc(100% - 20px))', transition: 'transform 300ms ease' }}>
    <BottomSheet
      snapPoint={sheetSnap}
      onSnapChange={point => {
        setSheetSnap(point)
        setIsMinimized(point === 25)
      }}
    >
      {ride && (ride.status as any) === 'accepted' && (
        <>
          {!isMinimized && passengerProfile && (
            <div className="ride-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', background: bg2, borderRadius: '24px', padding: '10px 12px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '22px', background: '#FF6B00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900' }}>{passengerProfile.full_name?.[0] || 'T'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '900', fontSize: '16px' }}>{passengerProfile.full_name || 'Thabo M'} • {passengerProfile.rating ? passengerProfile.rating.toFixed(1) : '4.8'}★</div>
                <div style={{ color: subText, fontSize: '12px' }}>Passenger • {ride.pickup_address?.split(',')[0]}</div>
              </div>
              <button onClick={() => setShowChat(true)} style={{ width: '40px', height: '40px', borderRadius: '20px', background: '#00d181', border: 'none', fontSize: '18px' }}>💬</button>
            </div>
          )}
          {!isMinimized && (
            <div className="ride-card" style={{background:bg2, border:`1px solid ${border}`, borderRadius:'24px', padding:'12px', marginBottom:'12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div><div style={{color:subText, fontSize:'12px', fontWeight:'bold'}}>FARE TO COLLECT (Passenger pays)</div><div style={{color:text, fontSize:'20px', fontWeight:'900'}}>R {ride.fare} • {(ride as any).payment_method || 'CASH'}</div><div style={{color:subText, fontSize:'13px', fontWeight:'bold'}}>YOU GET R {getEarnings(ride.fare).driverGets} (80%) • Fee R {getEarnings(ride.fare).platformGets}</div></div>
              <div style={{background:'#FF6B00', color:'white', padding:'6px 10px', borderRadius:'12px', fontSize:'12px', fontWeight:'bold'}}>CASH</div>
            </div>
          )}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{ margin: '0 0 4px' }}>Go to Pickup • You get R {getEarnings(ride.fare).driverGets}</h3><button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button></div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: subText }}>{ride.pickup_address?.split(',').slice(0,2).join(',')}</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button style={{ flex: 1, padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>{isNavigating? 'Navigating...' : 'Navigate'}</button>
            <button onClick={async () => {
              const prevStatus = ride.status
              setRide(r => r? {...r, status: 'arrived'} as any : r)
              const { error } = await supabase.from('rides').update({ status: 'arrived' as any } as any).eq('id', ride.id)
              if (error) { console.error(error); alert('Arrived failed: ' + error.message); setRide(r => r? {...r, status: prevStatus} as any : r) }
            }} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold' }}>I Have Arrived</button>
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
          <div className="ride-card" style={{background:bg2, border:`1px solid ${border}`, borderRadius:'24px', padding:'12px', marginBottom:'12px', textAlign:'center'}}>
            <div style={{color:subText, fontSize:'12px', fontWeight:'bold'}}>PASSENGER IN CAR? START TRIP</div>
            <div style={{color:text, fontSize:'20px', fontWeight:'900'}}>Passenger R {ride.fare} • You get R {getEarnings(ride.fare).driverGets}</div>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{ margin: '0 0 4px' }}>You Have Arrived • You R {getEarnings(ride.fare).driverGets}</h3><button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button></div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: subText }}>Waiting at {ride.pickup_address?.split(',').slice(0,2).join(',')}</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button onClick={async () => {
              const prevStatus = ride.status
              setRide(r => r? {...r, status: 'in_progress'} as any : r)
              const target: [number, number] = [ride.dropoff_lng, ride.dropoff_lat]
              try { const from = lastLocation.current[0]!== 0? lastLocation.current : location; const res = await getRoute(from, target); setRoute(res.geometry); setRouteData(res) } catch {}
              const { error } = await supabase.from('rides').update({ status: 'in_progress' as any } as any).eq('id', ride.id)
              if (error) { alert('Start trip failed: ' + error.message); setRide(r => r? {...r, status: prevStatus} as any : r) }
            }} style={{ flex: 1, padding: '16px', borderRadius: '14px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '16px' }}>Start Trip → Passenger In</button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => openDriverCancel(ride)} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: bg2, color: text, border: `1px solid ${border}` }}>Cancel Ride</button></div>
        </>
      )}
      {ride && ((ride.status as any) === 'picked_up' || (ride.status as any) === 'in_progress' || (ride.status as any) === 'en_route') &&!showDriverRating && (
        <>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{ margin: '0 0 6px' }}>Drive to {ride.dropoff_address?.split(',')[0]} • You R {getEarnings(ride.fare).driverGets}</h3><button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button></div>
          <p style={{margin:'0 0 10px', fontSize:'12px', color:subText}}>Passenger in car • Passenger pays R{ride.fare}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}><button style={{ flex: 1, padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}` }}>Navigating...</button><button onClick={completeRide} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#FF6B00', color: 'white', border: 'none', fontWeight: 'bold' }}>Complete Trip ✓ You R {getEarnings(ride.fare).driverGets}</button></div>
        </>
      )}
      {ride && (ride.status as any) === 'completed' &&!showDriverRating && showCollected === null && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px' }}>✅</div>
          <h2 style={{ margin: '8px 0' }}>Trip Completed!</h2>
          <h1 style={{ color: '#00d181', margin: '4px 0' }}>R {ride.fare} CASH</h1>
          <div style={{color:'#00d181', fontWeight:'bold'}}>You get R {getEarnings(ride.fare).driverGets} • Fee R {getEarnings(ride.fare).platformGets}</div>
          <p style={{ color: subText, fontSize: '13px' }}>Rate passenger to continue</p>
          <button onClick={() => setShowDriverRating(true)} style={{ width: '100%', marginTop: '16px', padding: '16px', borderRadius: '14px', background: '#FF6B00', color: 'white', border: 'none', fontWeight: 'bold' }}>Rate Passenger ⭐</button>
        </div>
      )}
      {showDriverRating && ride && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px' }}>⭐</div>
          <h2 style={{ margin: '8px 0' }}>Rate Passenger</h2>
          <p style={{ color: subText, fontSize: '13px' }}>{ride.dropoff_address?.split(',')[0]} • Passenger R {ride.fare} / You R {getEarnings(ride.fare).driverGets}</p>
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', margin: '20px 0' }}>
            {[1,2,3,4,5].map(s => (<button key={s} onClick={() => setDriverRating(s)} style={{ fontSize: '52px', background: 'none', border: 'none', color: driverRating >= s? '#FF6B00' : '#444' }}>{driverRating >= s? '★' : '☆'}</button>))}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={skipRating} style={{ flex: 1, padding: '16px', borderRadius: '14px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>Skip</button>
            <button onClick={submitDriverRating} disabled={driverRating === 0} style={{ flex: 1.5, padding: '16px', borderRadius: '14px', background: driverRating === 0? '#666' : '#FF6B00', color: 'white', border: 'none', fontWeight: 'bold' }}>{driverRating === 0? 'Select Stars' : `Rate ${driverRating}★`}</button>
          </div>
        </div>
      )}
      {!ride &&!showDriverRating && (
        <div style={{ textAlign: 'center' }}>
          {isOnline && searchingRides.map(r => {
            const timerColor = secondsLeft < 3 ? '#ef4444' : secondsLeft < 7 ? '#f97316' : '#22c55e'
            const timerProgress = Math.max(0, Math.min(100, secondsLeft / EXPIRE_SECONDS * 100))
            const e = getEarnings(r.fare)
            return (
            <div key={r.id} style={{ background: isDark? '#1e1e22' : 'white', border: `2px solid #00d181`, borderRadius: '16px', padding: '14px', marginBottom: '12px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <p style={{ flex: 1, fontWeight: 'bold', margin: 0, color: '#00d181' }}>🔔 BUDDY REQUEST • Passenger R {r.fare}</p>
                <div aria-label={`Expires in ${secondsLeft} seconds`} style={{ width: '44px', height: '44px', flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', background: `conic-gradient(${timerColor} ${timerProgress * 3.6}deg, #3A3A3C 0deg)` }}>
                  <span style={{ width: '34px', height: '34px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: isDark ? '#1e1e22' : '#fff', color: timerColor, fontSize: '11px', fontWeight: 800 }}>{secondsLeft}s</span>
                </div>
              </div>
              <div style={{ height: '5px', marginTop: '8px', overflow: 'hidden', borderRadius: '5px', background: '#3A3A3C' }}>
                <div style={{ height: '100%', width: `${timerProgress}%`, background: timerColor, transition: 'width 1s linear, background-color 200ms ease' }} />
              </div>
              <div style={{ marginTop: '4px', color: subText, fontSize: '11px' }}>Expires in {secondsLeft}s • You R{e.driverGets}</div>
              <p style={{ margin: '6px 0', fontSize: '13px', color: subText }}>You get R{e.driverGets} (80%) • Fee R{e.platformGets} (20%) • {((r as any).distance_km||0).toFixed(1)}km</p>
              <p style={{ margin: '6px 0', fontSize: '13px' }}>📍 {r.pickup_address?.split(',')[0]} → {r.dropoff_address?.split(',')[0]}</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={() => declineRide(r.id)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: bg2, color: text, border: `1px solid ${border}` }}>DECLINE</button>
                <button onClick={() => acceptRide(r.id)} style={{ flex: 1.5, padding: '12px', borderRadius: '10px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold' }}>ACCEPT R {e.driverGets}</button>
              </div>
            </div>
          )})}
          <div style={{ fontSize: '14px', marginBottom: '12px', color: subText }}>{!isOnline && docStatus!=='approved' &&!isTestDriver? `⛔ Blocked - Docs: ${approvedDocs.length}/7` : import.meta.env.DEV && isTestDriver? '✅ Test mode 🔊 Sound ON' : isOnline? '✅ Waiting for Buddy requests... 🔊' : 'You are offline'}</div>
          <button onClick={toggleOnline} style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', background: docStatus!=='approved' &&!isTestDriver? '#666' : isOnline? '#ff4444' : '#00d181', color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{docStatus!=='approved' &&!isTestDriver? `NEED DOCS (${approvedDocs.length}/7)` : isOnline? 'GO OFFLINE' : 'GO ONLINE 🔊'}</button>
        </div>
      )}
    </BottomSheet>
    </div>
    {showChat && ride && (<div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}><div style={{ background: bgCard, width: '100%', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', height: '75vh', display: 'flex', flexDirection: 'column' }}><div style={{ padding: '16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontWeight: 'bold', color: text }}>Chat with Passenger</div><div style={{ fontSize: '11px', color: '#999' }}>Messages disappear after trip</div></div><button onClick={() => setShowChat(false)} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, color: text }}>✕</button></div><div style={{ flex: 1, overflow: 'hidden' }}><RideChat rideId={ride.id} myId={profile.id} /></div></div></div>)}
    {showCollected!== null && (<div style={{position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}><div style={{background:'linear-gradient(135deg,#FF6B00,#ff9500)', borderRadius:'24px', padding:'32px 24px', textAlign:'center', width:'100%', maxWidth:'340px'}}><div style={{fontSize:'48px'}}>💰</div><div style={{color:'white', fontSize:'14px', fontWeight:'bold'}}>FARE COLLECTED</div><div style={{color:'white', fontSize:'20px'}}>Passenger R {showCollected}</div><div style={{color:'white', fontSize:'32px', fontWeight:'900'}}>You get R {getEarnings(showCollected).driverGets}</div><div style={{color:'white', fontSize:'14px', opacity:0.8}}>Fee R {getEarnings(showCollected).platformGets} (20%)</div><button onClick={() => { setShowCollected(null); setShowDriverRating(true) }} style={{marginTop:'18px', width:'100%', padding:'14px', borderRadius:'12px', background:'white', color:'#FF6B00', border:'none', fontWeight:'900'}}>Rate Passenger →</button></div></div>)}
    {showDriverCancelReason && (<div style={{position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'flex-end'}}><div style={{background: isDark? '#121214':'white', width:'100%', borderTopLeftRadius:'32px', borderTopRightRadius:'32px', padding:'20px', color: text}}><div style={{ width: '48px', height: '6px', background: 'rgba(255,255,255,0.2)', borderRadius: '3px', margin: '0 auto 14px' }} /><h3>Why cancel?</h3>{['Passenger no-show','Passenger asked to cancel','Wrong pickup','Vehicle issue','Other'].map(reason => (<button key={reason} onClick={() => setDriverCancelReason(reason)} style={{ width:'100%', textAlign:'left', padding:'14px', borderRadius:'12px', marginBottom:'8px', background: driverCancelReason===reason? '#ff3b30':'#242428', color: text, border: `1px solid ${border}` }}>{reason} {driverCancelReason===reason? '✓':''}</button>))}<div style={{display:'flex', gap:'8px', marginTop:'16px'}}><button onClick={() => { setShowDriverCancelReason(false); setDriverCancelReason(''); setRideToCancel(null) }} style={{flex:1, padding:'14px', borderRadius:'12px', background:bg2, color:text, border:`1px solid ${border}`, fontWeight:'bold'}}>Back</button><button onClick={executeDriverCancel} style={{flex:1.5, padding:'14px', borderRadius:'12px', background:'#ff3b30', color:'white', border:'none', fontWeight:'bold'}} disabled={!driverCancelReason}>Confirm Cancel</button></div></div></div>)}
  </div>
}
export default DriverHome