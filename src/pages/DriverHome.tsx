import { useEffect, useState, useRef } from 'react'
import { BottomSheet, type BottomSheetSnapPoint } from '../components/BottomSheet'
import { MapboxMapView } from '../components/MapboxMapView'
import { NavigationMenu } from '../components/NavigationMenu'
import { RideChat } from '../components/RideChat'
import { getRoute } from '../lib/mapbox'
import { createRealtimeChannel } from '../lib/realtime'
import { updateRide } from '../lib/rideUpdates'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]
const EXPIRE_SECONDS = 15

function errMsg(e: any) {
  return e?.message || e?.error_description || (typeof e === 'string' ? e : JSON.stringify(e))
}

function distanceBetweenCoordinates(from: [number, number], to: [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const [fromLng, fromLat] = from.map(radians)
  const [toLng, toLat] = to.map(radians)
  const deltaLat = toLat - fromLat
  const deltaLng = toLng - fromLng
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function DriverHome({ profile }: { profile: Profile }) {
  const pendingRatingStorageKey = `buddyride_pending_rating_${profile.id}`
  const [location, setLocation] = useState<[number, number]>(POLOKWANE_CENTER)
  const [ride, setRide] = useState<Ride | null>(null)
  const [pendingRating, setPendingRating] = useState<Ride | null>(() => {
    const stored = localStorage.getItem(pendingRatingStorageKey)
    if (!stored) return null
    try {
      const parsed = JSON.parse(stored) as Ride
      if (parsed?.id && parsed.driver_id === profile.id && parsed.status === 'completed') return parsed
    } catch {}
    localStorage.removeItem(pendingRatingStorageKey)
    return null
  })
  const [incomingRide, setIncomingRide] = useState<Ride | null>(null)
  const [searchingRides, setSearchingRides] = useState<Ride[]>([])
  const [route, setRoute] = useState<any>()
  const [routeData, setRouteData] = useState<any>(null)
  const routeDataRef = useRef<any>(null)
  const activeStepIndexRef = useRef(0)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [nextTurnDistance, setNextTurnDistance] = useState<number | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [commission, setCommission] = useState(20)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('buddy_theme') as any) || 'light')
  const [zoom, setZoom] = useState(13)
  const [bearing, setBearing] = useState(0)
  const [speedKmh, setSpeedKmh] = useState(0)
  const [lastTouch, setLastTouch] = useState(Date.now())
  const watchId = useRef<number | null>(null)
  const lastSupabaseUpdate = useRef<number>(0)
  const lastLocation = useRef<[number, number]>(POLOKWANE_CENTER)
  const [documentsLoaded, setDocumentsLoaded] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const [profileVerified, setProfileVerified] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState('not_started')
  const [hasRejectedDocuments, setHasRejectedDocuments] = useState(false)
  const [expiryWarnings, setExpiryWarnings] = useState<string[]>([])
  const [showDriverCancelReason, setShowDriverCancelReason] = useState(false)
  const [driverCancelReason, setDriverCancelReason] = useState('')
  const [rideToCancel, setRideToCancel] = useState<Ride | null>(null)
  const [showCollected, setShowCollected] = useState<number | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [declinedIds, setDeclinedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('declined_rides') || '[]') } catch { return [] }
  })
  const [cancelledNotification, setCancelledNotification] = useState<{msg: string, fare: number} | null>(null)
  const cancelledNotificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [driverRating, setDriverRating] = useState(0)
  const [driverRatingComment, setDriverRatingComment] = useState('')
  const [showDriverRating, setShowDriverRating] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const prevRideCountRef = useRef(0)
  const beepIntervalRef = useRef<any>(null)
  const [passengerProfile, setPassengerProfile] = useState<any>(null)
  const [incomingPassengerProfile, setIncomingPassengerProfile] = useState<any>(null)
  const [countdown, setCountdown] = useState(EXPIRE_SECONDS)
  const requestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnapPoint>(50)

  const isDark = theme === 'dark'
  const bg = isDark? '#0e0e10' : '#f5f5f7'
  const bgCard = isDark? '#121214' : '#ffffff'
  const bg2 = isDark? '#242428' : '#eeeeef'
  const text = isDark? 'white' : '#111827'
  const subText = isDark? '#9ca3af' : '#6b7280'
  const border = isDark? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const getEarnings = (fare: number, storedDriverEarnings?: number | null, storedCommission?: number | null) => {
    const total = Number(fare || 0)
    const storedSplitIsValid = storedDriverEarnings != null
      && storedCommission != null
      && Math.abs(Number(storedDriverEarnings) + Number(storedCommission) - total) < 0.01
    const platformGets = storedSplitIsValid ? Number(storedCommission) : Math.round(total * commission / 100)
    const driverGets = storedSplitIsValid ? Number(storedDriverEarnings) : total - platformGets
    return { driverGets, platformGets }
  }
  const rideStatus = String(ride?.status || '').toLowerCase().replace(/[\s-]+/g, '_')
  routeDataRef.current = routeData

  function updateNavigationProgress(position: [number, number]) {
    const steps = routeDataRef.current?.steps
    if (!steps?.length) { setNextTurnDistance(null); return }
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
  function clearRequestTimer() {
    if (requestTimerRef.current) { clearInterval(requestTimerRef.current); requestTimerRef.current = null }
  }

  function clearDriverRideState() {
    setRide(null)
    setRoute(undefined)
    setRouteData(null)
    routeDataRef.current = null
    activeStepIndexRef.current = 0
    setActiveStepIndex(0)
    setNextTurnDistance(null)
    setIsNavigating(false)
    setZoom(13)
    setSearchingRides([])
    setIncomingRide(null)
    setShowChat(false)
    setIsMinimized(false)
    setSheetSnap(50)
  }

  function handleDriverRideCompleted(finishedRide: Ride) {
    setPendingRating(finishedRide)
    localStorage.setItem(pendingRatingStorageKey, JSON.stringify(finishedRide))
    clearDriverRideState()
    setShowDriverRating(false)
    setDriverRating(0)
    setDriverRatingComment('')
    setShowCollected(Number(finishedRide.fare || 0))
    if (collectedTimerRef.current) clearTimeout(collectedTimerRef.current)
    collectedTimerRef.current = setTimeout(() => {
      setShowCollected(null)
      setShowDriverRating(true)
      collectedTimerRef.current = null
    }, 1200)
  }

  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])
  useEffect(() => { if (!ride &&!showDriverRating) { setRoute(undefined); setRouteData(null); setIsNavigating(false); setZoom(13); setShowChat(false); setIsMinimized(false); setSheetSnap(50) } }, [ride, showDriverRating])
  useEffect(() => {
    if (rideStatus === 'searching' || rideStatus === 'finding') { setSheetSnap(25); setIsMinimized(true) }
    else if (['driver_assigned', 'accepted', 'driver_arriving'].includes(rideStatus)) { setSheetSnap(50); setIsMinimized(false) }
    else if (['arrived', 'passenger_in', 'i_have_arrived'].includes(rideStatus)) { setSheetSnap(80); setIsMinimized(false) }
    else if (['on_trip', 'driving_to_destination', 'picked_up', 'in_progress', 'en_route'].includes(rideStatus)) { setSheetSnap(50); setIsMinimized(false) }
    else if (rideStatus === 'completed') { setSheetSnap(90); setIsMinimized(false) }
  }, [rideStatus])

  useEffect(() => {
    if (!ride?.passenger_id) { setPassengerProfile(null); return }
    let active = true
    supabase.rpc('get_ride_counterpart_profile', { p_ride_id: ride.id }).maybeSingle()
      .then(({ data }) => { if (active) setPassengerProfile(data) })
    return () => { active = false }
  }, [ride?.id, ride?.passenger_id])
  useEffect(() => {
    if (!incomingRide?.passenger_id) { setIncomingPassengerProfile(null); return }
    let active = true
    supabase.rpc('get_ride_counterpart_profile', { p_ride_id: incomingRide.id }).maybeSingle()
      .then(({ data }) => { if (active) setIncomingPassengerProfile(data) })
    return () => { active = false }
  }, [incomingRide?.id, incomingRide?.passenger_id])
  useEffect(() => {
    audioRef.current = new Audio('https://cdn.pixabay.com/download/audio/2022/03/24/audio_1d171a2a6f.mp3?filename=notification-sound-7062.mp3')
    audioRef.current.volume = 1.0
    audioRef.current.preload = 'auto'
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    return () => {
      if (beepIntervalRef.current) clearInterval(beepIntervalRef.current)
      if (cancelledNotificationTimerRef.current) clearTimeout(cancelledNotificationTimerRef.current)
      if (collectedTimerRef.current) clearTimeout(collectedTimerRef.current)
      clearRequestTimer()
    }
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
      const { data: settings } = await supabase.from('app_settings').select('commission').eq('id', 1).single()
      if (settings) setCommission(Number(settings.commission))
    }
    loadStatus()
    navigator.geolocation.getCurrentPosition(p => {
      const pos: [number, number] = [p.coords.longitude, p.coords.latitude]
      setLocation(pos); lastLocation.current = pos
    })
  }, [profile.id])

  useEffect(() => {
    let active = true
    async function checkDocs() {
      setDocumentsLoaded(false)
      setDocumentsError('')
      try {
        const [docsResult, profileResult] = await Promise.all([
          supabase.from('driver_documents').select('doc_type,status,expiry_date').eq('driver_id', profile.id),
          supabase.from('profiles').select('is_verified,verification_status').eq('id', profile.id).single(),
        ])
        if (!active) return

        const errors = [docsResult.error, profileResult.error].filter(Boolean)
        if (errors.length) setDocumentsError(`Could not verify document requirements: ${errors.map(error => error!.message).join('; ')}`)
        setProfileVerified(!profileResult.error && profileResult.data?.is_verified === true)
        setVerificationStatus(profileResult.data?.verification_status || 'not_started')

        if (docsResult.error) {
          setHasRejectedDocuments(true)
          setExpiryWarnings([])
        } else {
          const documents = docsResult.data || []
          setHasRejectedDocuments(documents.some(document => document.status.toUpperCase() === 'REJECTED'))
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          setExpiryWarnings(documents.flatMap(document => {
            if (!document.expiry_date) return []
            const expiry = new Date(`${document.expiry_date}T00:00:00`)
            const daysRemaining = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000)
            if (daysRemaining > 30) return []
            const label = document.doc_type.replace(/_/g, ' ')
            return [daysRemaining < 0
              ? `Your ${label} expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} ago. Replace it before driving.`
              : `Your ${label} expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Upload a renewed document before it expires.`]
          }))
        }
      } catch (error) {
        if (!active) return
        setProfileVerified(false)
        setHasRejectedDocuments(true)
        setExpiryWarnings([])
        setDocumentsError(`Could not verify document requirements: ${errMsg(error)}`)
      } finally {
        if (active) setDocumentsLoaded(true)
      }
    }
    void checkDocs()
    const refresh = window.setInterval(() => void checkDocs(), 24 * 60 * 60 * 1000)
    return () => { active = false; window.clearInterval(refresh) }
  }, [profile.id])

  useEffect(() => {
    async function loadRide() {
      const { data, error: activeRideError } = await supabase.from('rides').select('*').eq('driver_id', profile.id).in('status', ['driver_assigned','accepted','arrived','picked_up','en_route','in_progress','on_trip','driving_to_destination'] as any).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (activeRideError) { alert(`Could not restore your active ride: ${errMsg(activeRideError)}`); return }
      if (data) {
        setRide(data)
        setIsNavigating(true)
        setZoom(17)
        setIsMinimized(false)
        await supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: false, updated_at: new Date().toISOString() } as any, { onConflict: 'driver_id' })
        setIsOnline(false)
        return
      }
      let completedRide = pendingRating
      if (!completedRide) {
        const { data: latestCompletedRide, error: completedRideError } = await supabase.from('rides')
          .select('*')
          .eq('driver_id', profile.id)
          .eq('status', 'completed')
          .is('driver_rating', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (completedRideError) {
          console.error('Could not restore the completed ride:', completedRideError.message)
          return
        }
        completedRide = latestCompletedRide as Ride | null
      }
      if (completedRide) {
        setPendingRating(completedRide)
        localStorage.setItem(pendingRatingStorageKey, JSON.stringify(completedRide))
        setShowDriverRating(true)
        setIsNavigating(false)
        setZoom(13)
      }
    }
    loadRide()
  }, [profile.id])

  useEffect(() => {
    const ch = createRealtimeChannel(`driver-${profile.id}`)
.on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `driver_id=eq.${profile.id}` }, p => {
        const newRide = p.new as Ride
        if (!newRide) return
        const cancelledBy = (newRide as any).cancelled_by
        const reason = (newRide as any).cancel_reason
        if (newRide.status === 'cancelled' && cancelledBy === 'passenger') {
          setCancelledNotification({ msg: `Passenger cancelled: ${reason || 'No reason'}`, fare: newRide.fare })
          playBeep()
          if (cancelledNotificationTimerRef.current) clearTimeout(cancelledNotificationTimerRef.current)
          cancelledNotificationTimerRef.current = setTimeout(() => {
            setCancelledNotification(null)
            cancelledNotificationTimerRef.current = null
          }, 5000)
          setIsNavigating(false); setZoom(13); setRide(null); setRoute(undefined); setRouteData(null); setSearchingRides([]); setShowChat(false); return
        }
        if (['completed','rated'].includes(newRide.status as any) && newRide.driver_rating != null) {
          clearPendingRating()
          clearDriverRideState()
          setShowDriverRating(false); setDriverRating(0); setDriverRatingComment(''); setShowCollected(null); return
        }
        if (newRide.status === 'completed') {
          handleDriverRideCompleted(newRide)
          return
        }
        if (newRide.status === 'rated') {
          setRide(newRide)
          setIsNavigating(false)
          setZoom(13)
          setRoute(undefined)
          setRouteData(null)
          setShowDriverRating(true)
          return
        }
        if (['cancelled'].includes(newRide.status as any)) {
          setIsNavigating(false); setZoom(13); setRide(null); setRoute(undefined); setRouteData(null); setSearchingRides([]); setShowChat(false); return
        }
        setRide(newRide)
        if (['driver_assigned','accepted','arrived','picked_up','in_progress','en_route','on_trip','driving_to_destination'].includes(newRide.status as any)) { setIsNavigating(true); setZoom(17) }
        if (['driver_assigned','accepted','arrived','picked_up','in_progress','en_route','on_trip','driving_to_destination'].includes(newRide.status as any)) {
          supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: false, updated_at: new Date().toISOString() } as any, { onConflict: 'driver_id' }).then(()=>{})
          setIsOnline(false)
        }
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile.id])

  useEffect(() => {
    if (!isOnline || ride) { setSearchingRides([]); return }
    async function loadSearching() {
      try {
        const { data: activeCheck } = await supabase.from('rides').select('id').eq('driver_id', profile.id).in('status', ['driver_assigned','accepted','arrived','picked_up','en_route','in_progress','on_trip','driving_to_destination'] as any).limit(1).maybeSingle()
        if (activeCheck) { setSearchingRides([]); setIsOnline(false); return }
        let query = supabase.from('rides').select('*').eq('status','searching').order('created_at',{ascending:false}).limit(1)
        query = query.eq('offered_driver_id', profile.id)
        const { data } = await query
        const filtered = (data || []).filter((r:any) =>!declinedIds.includes(r.id))
        setSearchingRides(filtered as Ride[])
        if (filtered.length > 0) setIncomingRide(current => current || filtered[0] as Ride)
      } catch(e) { console.log(e) }
    }
    loadSearching()
    const ch2 = createRealtimeChannel(`offers-${profile.id}-real`)
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides' }, (p) => {
        const r = p.new as any; if (!r) return
        if (r.status === 'cancelled' && r.cancelled_by === 'passenger') {
          setSearchingRides(prev => {
            const wasShowing = prev.some(x => x.id === r.id)
            if (wasShowing) {
              setCancelledNotification({ msg: `Passenger cancelled searching ride: ${r.cancel_reason || 'Changed mind'}`, fare: r.fare })
              playBeep()
              if (cancelledNotificationTimerRef.current) clearTimeout(cancelledNotificationTimerRef.current)
              cancelledNotificationTimerRef.current = setTimeout(() => {
                setCancelledNotification(null)
                cancelledNotificationTimerRef.current = null
              }, 4000)
            }
            return prev.filter(x => x.id!== r.id)
          })
        }
        if (r.status === 'searching' &&!declinedIds.includes(r.id)) loadSearching()
      })
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides' }, (p) => {
        const r = p.new as any; if (r?.status === 'searching' &&!declinedIds.includes(r.id)) loadSearching()
      }).subscribe()
    const interval = setInterval(loadSearching, 2000)
    return () => { supabase.removeChannel(ch2); clearInterval(interval) }
  }, [isOnline, ride, profile.id, declinedIds])

  useEffect(() => {
    clearRequestTimer()
    if (!incomingRide || incomingRide.status !== 'searching' || ride) return
    const expiresAt = incomingRide.offer_expires_at
    let seconds = expiresAt
      ? Math.max(0, Math.min(EXPIRE_SECONDS, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)))
      : EXPIRE_SECONDS
    setCountdown(seconds)
    if (seconds === 0) { void dismissIncomingRide(incomingRide.id); return }
    const rideId = incomingRide.id
    requestTimerRef.current = setInterval(() => {
      seconds -= 1
      setCountdown(seconds)
      if (seconds <= 0) { clearRequestTimer(); void dismissIncomingRide(rideId) }
    }, 1000)
    return clearRequestTimer
  }, [incomingRide?.id, ride?.id])

  useEffect(() => {
    if (!isOnline || ride) return
    const channel = createRealtimeChannel(`new-ride-offers-${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'rides',
        filter: 'status=eq.searching',
      }, payload => {
        const newRide = payload.new as Ride
        if (newRide.status !== 'searching' || declinedIds.includes(newRide.id)) return
        setIncomingRide(newRide)
        setCountdown(EXPIRE_SECONDS)
        playBeep()
      }).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [isOnline, ride?.id, profile.id, declinedIds])

  useEffect(() => {
    if (!isNavigating &&!isOnline) return
    watchId.current = navigator.geolocation.watchPosition(pos => {
        const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
          updateNavigationProgress(p)
          setSpeedKmh((pos.coords.speed ?? 0) * 3.6)
        const previousLocation = lastLocation.current
        const dist = Math.hypot(p[0] - previousLocation[0], p[1] - previousLocation[1])
        if (dist > 0.00005) {
          const dLng = p[0] - previousLocation[0]; const dLat = p[1] - previousLocation[1]
          if (Math.abs(dLng) > 0.00001 || Math.abs(dLat) > 0.00001) { const b = Math.atan2(dLng, dLat) * 180 / Math.PI; setBearing(b) }
          setLocation(p)
        }
        lastLocation.current = p
        const nowTs = Date.now()
        if (nowTs - lastSupabaseUpdate.current > 3000) {
          lastSupabaseUpdate.current = nowTs
          if (ride) updateRide({ driver_lat: pos.coords.latitude, driver_lng: pos.coords.longitude }).eq('id', ride.id).then(()=>{})
          if (isOnline && !ride) {
            supabase.from('profiles').update({ current_lat: pos.coords.latitude, current_lng: pos.coords.longitude } as any).eq('id', profile.id).then(()=>{})
            supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: true, lat: pos.coords.latitude, lng: pos.coords.longitude, updated_at: new Date().toISOString() } as any, { onConflict: 'driver_id' }).then(()=>{})
            supabase.from('driver_locations').upsert({ driver_id: profile.id, lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading ?? bearing, speed: pos.coords.speed ?? 0, is_online: true, updated_at: new Date().toISOString() } as any, { onConflict: 'driver_id' }).then(()=>{})
          }
        }
      }, err => console.log(err), { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    ) as any
    return () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current) }
  }, [isNavigating, isOnline, ride?.id, profile.id])

  useEffect(() => {
    let interval: any
    let active = true
    let routeRequestActive = false
    async function buildRoute() {
      if (!ride || routeRequestActive) return
      const from = lastLocation.current
      const target: [number, number] = ['accepted','driver_assigned','arrived'].includes(String(ride.status)) ? [ride.pickup_lng, ride.pickup_lat] : [ride.dropoff_lng, ride.dropoff_lat]
      routeRequestActive = true
      try {
        const r = await getRoute(from, target)
        if (!active) return
        activeStepIndexRef.current = 0
        setActiveStepIndex(0)
        routeDataRef.current = r
        setRoute(r.geometry)
        setRouteData(r)
        updateNavigationProgress(from)
      } catch (routeError) {
        console.error('Could not refresh driver route', routeError)
      } finally {
        routeRequestActive = false
      }
    }
    buildRoute()
    if (isNavigating) { interval = setInterval(buildRoute, 15000) }
    return () => { active = false; clearInterval(interval) }
  }, [ride?.id, ride?.status, isNavigating])

  async function toggleOnline() {
    if (!isOnline && !canGoOnline) { alert('Waiting for Admin Approval - You cannot go online yet'); return }
    const { data: activeRide, error: activeRideError } = await supabase.from('rides').select('*').eq('driver_id', profile.id).in('status', ['driver_assigned','accepted','arrived','picked_up','en_route','in_progress','on_trip','driving_to_destination'] as any).limit(1).maybeSingle()
    if (activeRideError) { alert(`Could not check active rides: ${errMsg(activeRideError)}`); return }
    if (activeRide) {
      if (!ride || ride.id !== activeRide.id) setRide(activeRide as Ride)
      setIsOnline(false)
      const { error: statusError } = await supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: false, updated_at: new Date().toISOString() } as any, { onConflict: 'driver_id' })
      const { error: profileError } = await supabase.from('profiles').update({ is_online: false } as any).eq('id', profile.id)
      if (statusError || profileError) alert(`Could not update your availability: ${errMsg(statusError || profileError)}`)
      return
    }
    const next = !isOnline
    try {
      const pos = lastLocation.current
      const { error: profileError } = await supabase.from('profiles').update({ is_online: next } as any).eq('id', profile.id)
      if (profileError) throw profileError
      const { error: statusError } = await supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: next, lat: pos[1], lng: pos[0], updated_at: new Date().toISOString(), } as any, { onConflict: 'driver_id' })
      if (statusError) {
        const { error: rollbackError } = await supabase.from('profiles').update({ is_online: isOnline } as any).eq('id', profile.id)
        if (rollbackError) throw new Error(`${statusError.message}; availability rollback failed: ${rollbackError.message}`)
        throw statusError
      }
      setIsOnline(next)
    } catch (error: any) { alert(`Could not change your availability: ${errMsg(error)}`) }
  }

  async function acceptRide(rideId: string) {
    clearRequestTimer()
    if (beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null }
    const { data: acceptedRide, error } = await updateRide({ driver_id: profile.id, status: 'accepted', accepted_at: new Date().toISOString(), offered_driver_id: null, offer_expires_at: null })
      .eq('id', rideId).eq('status', 'searching').select('*').maybeSingle()
    if (error) { alert(`Could not accept this ride: ${errMsg(error)}`); return }
    if (!acceptedRide) { alert('This ride offer expired or was accepted by another driver.'); return }
    setIncomingRide(null)
    setRide(acceptedRide as Ride)
    const { error: statusError } = await supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: false, updated_at: new Date().toISOString() } as any, { onConflict: 'driver_id' })
    const { error: profileError } = await supabase.from('profiles').update({ is_online: false } as any).eq('id', profile.id)
    if (statusError || profileError) alert(`Ride accepted, but availability could not be updated: ${errMsg(statusError || profileError)}`)
    try {
      const from = lastLocation.current[0] !== 0 ? lastLocation.current : location
      const routeResult = await getRoute(from, [acceptedRide.pickup_lng, acceptedRide.pickup_lat])
      setRoute(routeResult.geometry)
      setRouteData(routeResult)
    } catch (routeError) {
      setRoute(undefined)
      setRouteData(null)
      alert(`Ride accepted, but pickup directions could not be loaded: ${errMsg(routeError)}`)
    }
    setIsOnline(false)
    setSearchingRides([]); setIsNavigating(true); setZoom(17); setIsMinimized(false)
  }

  async function declineRide(rideId: string) {
    clearRequestTimer()
    if (beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null }
    const { error } = await supabase.rpc('decline_ride', { p_ride_id: rideId })
    if (error) { alert(`Could not decline this ride: ${errMsg(error)}`); return }
    const newDeclined = [...declinedIds, rideId]
    setDeclinedIds(newDeclined)
    localStorage.setItem('declined_rides', JSON.stringify(newDeclined))
    setIncomingRide(null)
    setSearchingRides(prev => prev.filter(r => r.id!== rideId))
  }

  async function dismissIncomingRide(rideId: string) {
    if (!incomingRide || incomingRide.id !== rideId) return
    if (incomingRide.offered_driver_id === profile.id) {
      await declineRide(rideId)
      return
    }
    setIncomingRide(null)
    setSearchingRides(prev => prev.filter(r => r.id !== rideId))
    if (!declinedIds.includes(rideId)) {
      const newDeclined = [...declinedIds, rideId]
      setDeclinedIds(newDeclined)
      localStorage.setItem('declined_rides', JSON.stringify(newDeclined))
    }
  }

  async function completeRide() {
    if (!ride) return
    const activeRide = ride
    const { data, error } = await updateRide({ status: 'completed' })
      .eq('id', activeRide.id).eq('status', activeRide.status).select('*').maybeSingle()
    let completedRide = data as Ride | null
    if (error || !completedRide) {
      const { data: reloadedRide, error: reloadError } = await supabase.from('rides')
        .select('*')
        .eq('id', activeRide.id)
        .maybeSingle()
      if (reloadError) {
        alert(`Could not complete this ride: ${errMsg(error || reloadError)}`)
        return
      }
      if (reloadedRide?.status !== 'completed') {
        alert(error
          ? `Could not complete this ride: ${errMsg(error)}`
          : 'This trip changed before it could be completed. Refresh and try again.')
        return
      }
      completedRide = reloadedRide as Ride
    }
    handleDriverRideCompleted(completedRide)
  }

  async function markArrived() {
    if (!ride) return
    const { data, error } = await updateRide({ status: 'arrived' })
      .eq('id', ride.id).eq('status', ride.status).select('*').maybeSingle()
    if (error) { alert(`Could not mark arrival: ${errMsg(error)}`); return }
    if (!data) { alert('This ride changed before arrival could be confirmed. Refresh and try again.'); return }
    setRide(data as Ride)
  }

  async function startTrip() {
    if (!ride) return
    const currentRide = ride
    const { data, error } = await updateRide({ status: 'in_progress' })
      .eq('id', currentRide.id).eq('status', currentRide.status).select('*').maybeSingle()
    if (error) { alert(`Could not start this trip: ${errMsg(error)}`); return }
    if (!data) { alert('This ride changed before it could start. Refresh and try again.'); return }
    setRide(data as Ride)
    try {
      const from = lastLocation.current[0] !== 0 ? lastLocation.current : location
      const routeResult = await getRoute(from, [currentRide.dropoff_lng, currentRide.dropoff_lat])
      setRoute(routeResult.geometry)
      setRouteData(routeResult)
    } catch (routeError) {
      setRoute(undefined)
      setRouteData(null)
      alert(`Trip started, but destination directions could not be loaded: ${errMsg(routeError)}`)
    }
  }

  async function submitDriverRating() {
    const ratingRide = pendingRating || ride
    if (!ratingRide || driverRating === 0) return
    const { error } = await supabase.rpc('submit_ride_rating', {
      p_ride_id: ratingRide.id,
      p_rating: driverRating,
      p_comment: driverRatingComment.trim() || null,
    })
    const alreadyRated = error && (
      error.code === '23505' || /already rated/i.test(error.message || '')
    )
    if (error && !alreadyRated) { alert(`Could not submit rating: ${errMsg(error)}`); return }
    if (alreadyRated) alert('Already rated')
    clearPendingRating()
    clearDriverRideState()
    setShowDriverRating(false); setDriverRating(0); setDriverRatingComment(''); setShowCollected(null)
  }

  async function skipRating() {
    if (!ride && !pendingRating) return
    clearPendingRating()
    clearDriverRideState()
    setShowDriverRating(false); setDriverRating(0); setDriverRatingComment(''); setShowCollected(null)
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
    const { data: cancelledRide, error } = await updateRide({ status: 'cancelled', cancel_reason: driverCancelReason, cancelled_at: new Date().toISOString(), cancelled_by: 'driver' }).eq('id', rideId).select('id').maybeSingle()
    if (error) { alert(`Could not cancel this ride: ${errMsg(error)}`); return }
    if (!cancelledRide) { alert('This trip is no longer available to cancel.'); return }
    setShowDriverCancelReason(false)
    setRoute(undefined); setRouteData(null); setIsNavigating(false); setRide(null); setZoom(13); setRideToCancel(null); setShowChat(false)
    if (beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null }
    setDriverCancelReason('')
  }

  const curStep = (() => { if (!routeData?.steps?.length) return null; return routeData.steps[activeStepIndex] || routeData.steps[0] })()
  const instruction = curStep?.maneuver?.instruction || routeData?.steps?.[0]?.maneuver?.instruction || 'Head straight'
  const distText = nextTurnDistance !== null ? `${nextTurnDistance >= 1000 ? `${(nextTurnDistance / 1000).toFixed(1)}km` : `${Math.ceil(nextTurnDistance / 10) * 10}m`} • ${curStep ? `${Math.ceil(curStep.duration / 60)} min` : ''}` : routeData ? `${routeData.distanceKm.toFixed(1)}km • ${Math.ceil(routeData.durationMin)} min` : '0.0km • 0 min'
  const canGoOnline = documentsLoaded
    && profileVerified
    && verificationStatus === 'approved'
    && !hasRejectedDocuments
  const showTopBanner = !canGoOnline
  const topBannerHeight = showTopBanner? 42 : 0
  const completedRideForDisplay = ride?.status === 'completed' ? ride : pendingRating

  function clearPendingRating() {
    setPendingRating(null)
    localStorage.removeItem(pendingRatingStorageKey)
  }

  return <div className={`ride-app ride-app--${theme}`} onPointerDown={() => { setLastTouch(Date.now()) }} style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <div onClick={() => { setLastTouch(Date.now()) }} style={{ position: 'absolute', inset: 0 }}>
      <MapboxMapView center={location} driverLocation={location} route={route} bearing={bearing} speedKmh={speedKmh} isNavigating={isNavigating} followDriver={true} theme={theme} />
    </div>
    <header className="ride-header" style={{ zIndex: 300, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: bgCard, color: text, borderBottom: `1px solid ${border}`, position: 'relative' }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide<br/>Driver</strong>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '42px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}` }}>{isDark? '☀️' : '🌙'}</button>
        {!ride && !pendingRating && !showDriverRating && <button onClick={toggleOnline} disabled={!isOnline && !canGoOnline} style={{ padding: '8px 14px', borderRadius: '20px', border: 'none', fontWeight: 'bold', background: canGoOnline ? (isOnline ? '#00d181' : '#444') : '#666', color: 'white', fontSize: '12px', opacity: !isOnline && !canGoOnline ? 0.7 : 1, cursor: !isOnline && !canGoOnline ? 'not-allowed' : 'pointer' }}>{canGoOnline ? (isOnline ? '● ONLINE' : '○ OFFLINE') : verificationStatus === 'pending_verification' ? 'Waiting for Admin Approval - You cannot go online yet' : 'Complete onboarding to Go Online'}</button>}
      </div>
    </header>
    {showTopBanner && documentsLoaded && (<div role="status" style={{ position: 'absolute', top: '60px', left: '12px', right: '12px', zIndex: 80, background: '#b45309', color: 'white', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', fontWeight: 'bold' }}>Waiting for Admin Approval - You cannot go online yet</div>)}
    {isNavigating && ride && (<div style={{ position: 'absolute', top: `${68 + topBannerHeight + 8}px`, left: '12px', right: '12px', zIndex: 70, background: 'white', borderRadius: '16px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}><div style={{ width: '44px', height: '44px', borderRadius: '22px', background: '#00d181', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '22px' }}>↑</div><div><div style={{ fontWeight: '800', color: '#111', fontSize: '16px' }}>{instruction}</div><div style={{ color: '#666', fontSize: '13px' }}>{distText}</div></div></div>)}
    <div style={{ position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 90, padding: '7px 12px', borderRadius: '999px', color: 'white', background: 'rgba(28,28,30,.88)', fontSize: '13px', fontWeight: 700 }}>{Math.round(speedKmh)} km/h</div>
    <button onClick={() => setZoom(17)} style={{ position: 'absolute', right: '16px', bottom: `calc(${sheetSnap}dvh + 12px)`, zIndex: 50, width: '52px', height: '52px', borderRadius: '26px', background: 'white', border: '1px solid #ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: '20px', transition: 'bottom 0.3s ease' }}>🎯</button>
    {cancelledNotification && (<div style={{position:'fixed', top:'90px', left:'12px', right:'12px', zIndex:99999, background:'#ff3b30', borderRadius:'16px', padding:'16px', display:'flex', gap:'12px', alignItems:'center', boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}><div style={{width:'48px', height:'48px', borderRadius:'24px', background:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px'}}>❌</div><div style={{flex:1}}><div style={{color:'white', fontWeight:'900', fontSize:'15px'}}>Trip Cancelled by Passenger!</div><div style={{color:'white', fontSize:'13px', opacity:0.9}}>{cancelledNotification.msg} • R{cancelledNotification.fare}</div></div><button onClick={() => setCancelledNotification(null)} style={{background:'white', color:'#ff3b30', border:'none', borderRadius:'20px', padding:'8px 14px', fontWeight:'bold'}}>OK</button></div>)}
    <div style={{ position: 'absolute', inset: 'auto 0 0', height: '90dvh', zIndex: 60 }}>
    <BottomSheet snapPoint={sheetSnap} onSnapChange={point => { setSheetSnap(point); setIsMinimized(point === 25) }}>
      {ride && ['driver_assigned','accepted'].includes(String(ride.status)) && (<>
          {!isMinimized && passengerProfile && (<div className="ride-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', background: bg2, borderRadius: '24px', padding: '10px 12px' }}><div style={{ width: '44px', height: '44px', borderRadius: '22px', background: '#FF6B00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900' }}>{passengerProfile.full_name?.[0] || 'T'}</div><div style={{ flex: 1 }}><div style={{ fontWeight: '900', fontSize: '16px' }}>{passengerProfile.full_name || 'Thabo M'} • {passengerProfile.rating ? passengerProfile.rating.toFixed(1) : '4.8'}★</div><div style={{ color: subText, fontSize: '12px' }}>Passenger • {ride.pickup_address?.split(',')[0]}</div></div><button onClick={() => setShowChat(true)} style={{ width: '40px', height: '40px', borderRadius: '20px', background: '#00d181', border: 'none', fontSize: '18px' }}>💬</button></div>)}
          {!isMinimized && (          <div className="ride-card" style={{background:bg2, border:`1px solid ${border}`, borderRadius:'24px', padding:'12px', marginBottom:'12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}><div><div style={{color:subText, fontSize:'12px', fontWeight:'bold'}}>{ride.payment_method === 'paystack' ? 'ONLINE PAYMENT' : 'CASH FARE'}</div><div style={{color:text, fontSize:'20px', fontWeight:'900'}}>R {ride.fare}</div><div style={{color:subText, fontSize:'13px', fontWeight:'bold'}}>YOU GET R {getEarnings(ride.fare, ride.driver_earnings, ride.buddyride_commission).driverGets}</div></div><div style={{background:ride.payment_method === 'paystack' ? '#166534' : '#FF6B00', color:'white', padding:'6px 10px', borderRadius:'12px', fontSize:'12px', fontWeight:'bold'}}>{ride.payment_method === 'paystack' ? 'PAID ONLINE' : 'CASH DUE'}</div></div>)}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{ margin: '0 0 4px' }}>Go to Pickup • You get R {getEarnings(ride.fare, ride.driver_earnings, ride.buddyride_commission).driverGets}</h3><button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button></div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: subText }}>{ride.pickup_address}</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}><a href={`/driver/navigation/${encodeURIComponent(ride.id)}`} style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold', textDecoration: 'none' }}>{isNavigating ? 'Open navigation' : 'Navigate'}</a><button onClick={() => void markArrived()} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold' }}>I Have Arrived</button></div>
          <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => window.open(`https://waze.com/ul?ll=${ride.pickup_lat},${ride.pickup_lng}&navigate=yes`, '_blank')} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#33CCFF', color: 'black', border: 'none', fontWeight: 'bold' }}>🚗 Waze</button><button onClick={() => openDriverCancel(ride)} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>Cancel</button></div>
        </>)}
      {ride && (ride.status as any) === 'arrived' && (<>
          <div className="ride-card" style={{background:bg2, border:`1px solid ${border}`, borderRadius:'24px', padding:'12px', marginBottom:'12px', textAlign:'center'}}><div style={{color:subText, fontSize:'12px', fontWeight:'bold'}}>PASSENGER IN CAR? START TRIP</div><div style={{color:text, fontSize:'20px', fontWeight:'900'}}>Passenger R {ride.fare} • You get R {getEarnings(ride.fare, ride.driver_earnings, ride.buddyride_commission).driverGets}</div></div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{ margin: '0 0 4px' }}>You Have Arrived • You R {getEarnings(ride.fare, ride.driver_earnings, ride.buddyride_commission).driverGets}</h3><button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button></div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: subText }}>Waiting at {ride.pickup_address}</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}><button onClick={() => void startTrip()} style={{ flex: 1, padding: '16px', borderRadius: '14px', background: '#00d181', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '16px' }}>Start Trip → Passenger In</button></div>
          <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => openDriverCancel(ride)} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: bg2, color: text, border: `1px solid ${border}` }}>Cancel Ride</button></div>
        </>)}
      {ride && ['picked_up','in_progress','en_route','on_trip','driving_to_destination'].includes(String(ride.status)) &&!showDriverRating && (<>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{ margin: '0 0 6px' }}>Drive to {ride.dropoff_address?.split(',')[0]} • You R {getEarnings(ride.fare, ride.driver_earnings, ride.buddyride_commission).driverGets}</h3><button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button></div>
          <p style={{margin:'0 0 10px', fontSize:'12px', color:subText}}>Passenger in car • Passenger pays R{ride.fare} • Status: {ride.status}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}><a href={`/driver/navigation/${encodeURIComponent(ride.id)}`} style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, textDecoration: 'none' }}>Open navigation</a><button onClick={completeRide} style={{ flex: 1.5, padding: '14px', borderRadius: '12px', background: '#FF6B00', color: 'white', border: 'none', fontWeight: 'bold' }}>Complete Trip ✓ You R {getEarnings(ride.fare, ride.driver_earnings, ride.buddyride_commission).driverGets}</button></div>
        </>)}
      {ride && !['driver_assigned','accepted','arrived','picked_up','in_progress','en_route','on_trip','driving_to_destination','completed'].includes(String(ride.status)) && !showDriverRating && (
        <div role="status" style={{padding:'16px', textAlign:'center'}}><h3>Trip status: {ride.status}</h3><p style={{color:subText}}>{ride.pickup_address} → {ride.dropoff_address}</p><p>R {ride.fare}</p><p style={{color:subText}}>Refreshing trip status…</p></div>
      )}
      {completedRideForDisplay && !showDriverRating && showCollected === null && (<div style={{ textAlign: 'center' }}><div style={{ fontSize: '48px' }}>✅</div><h2 style={{ margin: '8px 0' }}>Trip Completed!</h2><h1 style={{ color: '#00d181', margin: '4px 0' }}>R {completedRideForDisplay.fare} {completedRideForDisplay.payment_method === 'paystack' ? 'PAID ONLINE' : 'CASH DUE'}</h1><div style={{color:'#00d181', fontWeight:'bold'}}>You get R {getEarnings(completedRideForDisplay.fare, completedRideForDisplay.driver_earnings, completedRideForDisplay.buddyride_commission).driverGets} • Fee R {getEarnings(completedRideForDisplay.fare, completedRideForDisplay.driver_earnings, completedRideForDisplay.buddyride_commission).platformGets}</div><p style={{ color: subText, fontSize: '13px' }}>Rate passenger to continue</p><button onClick={() => setShowDriverRating(true)} style={{ width: '100%', marginTop: '16px', padding: '16px', borderRadius: '14px', background: '#FF6B00', color: 'white', border: 'none', fontWeight: 'bold' }}>Rate Passenger ⭐</button></div>)}
      {showDriverRating && (pendingRating || ride) && (<div style={{ textAlign: 'center' }}><h2 style={{ margin: '8px 0' }}>Rate Passenger</h2><p style={{ color: subText, fontSize: '13px' }}>{(pendingRating || ride)!.dropoff_address?.split(',')[0]} • Passenger R {(pendingRating || ride)!.fare} / You R {getEarnings((pendingRating || ride)!.fare, (pendingRating || ride)!.driver_earnings, (pendingRating || ride)!.buddyride_commission).driverGets}</p><div style={{ display: 'flex', gap: '4px', justifyContent: 'center', margin: '16px 0' }}>{[1,2,3,4,5].map(s => (<button key={s} onClick={() => setDriverRating(s)} style={{ fontSize: '48px', background: 'none', border: 'none', color: driverRating >= s? '#FF6B00' : '#444' }}>{driverRating >= s? '★' : '☆'}</button>))}</div><textarea value={driverRatingComment} maxLength={1000} onChange={event => setDriverRatingComment(event.target.value)} placeholder="Add a comment (optional)" rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: `1px solid ${border}`, background: bg2, color: text, resize: 'vertical' }} /><div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}><button onClick={skipRating} style={{ flex: 1, padding: '16px', borderRadius: '14px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>Skip</button><button onClick={submitDriverRating} disabled={driverRating === 0} style={{ flex: 1.5, padding: '16px', borderRadius: '14px', background: driverRating === 0? '#666' : '#FF6B00', color: 'white', border: 'none', fontWeight: 'bold' }}>{driverRating === 0? 'Select Stars' : `Rate ${driverRating}★`}</button></div></div>)}
      {!ride &&!showDriverRating && (<div style={{ textAlign: 'center' }}>
            {documentsError && <p role="alert" style={{ color: '#fca5a5', fontSize: 12 }}>{documentsError}</p>}
            {expiryWarnings.map((warning, index) => <p key={`${index}-${warning}`} role="alert" style={{ margin: '0 0 8px', padding: 10, borderRadius: 10, background: '#7f1d1d', color: '#fee2e2', fontSize: 12, fontWeight: 700 }}>{warning}</p>)}
            <p style={{ margin: '0 0 12px', color: subText, fontSize: 13 }}>You keep 80%, BuddyRide 20%</p>
          {!ride && !pendingRating && !showDriverRating && <button onClick={toggleOnline} disabled={!isOnline && !canGoOnline} style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', background: canGoOnline ? (isOnline ? '#ff4444' : '#00d181') : '#666', color: 'white', fontWeight: 'bold', fontSize: '16px', opacity: !isOnline && !canGoOnline ? 0.7 : 1, cursor: !isOnline && !canGoOnline ? 'not-allowed' : 'pointer' }}>{canGoOnline ? (isOnline ? 'GO OFFLINE' : 'GO ONLINE 🔊') : 'Waiting for Admin Approval - You cannot go online yet'}</button>}
        </div>)}
    </BottomSheet>
    </div>
    {incomingRide && !ride && isOnline && (<div role="dialog" aria-modal="true" aria-labelledby="incoming-ride-title" style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'rgba(0,0,0,0.88)', color: 'white' }}>
      <div style={{ width: '100%', maxWidth: '440px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.08em', color: '#00d181' }}>NEW RIDE REQUEST</div>
        <h1 id="incoming-ride-title" style={{ margin: '18px 0 8px', fontSize: '56px' }}>R {incomingRide.fare}</h1>
        <p style={{ margin: '0 0 24px', color: '#cbd5e1', fontSize: '16px' }}>Passenger fare • You get R {getEarnings(incomingRide.fare, incomingRide.driver_earnings, incomingRide.buddyride_commission).driverGets}</p>
        <div style={{ padding: '18px', borderRadius: '16px', background: '#1e293b', textAlign: 'left', lineHeight: 1.6 }}>
          <div><strong>Pickup</strong><br />{incomingRide.pickup_address}</div>
          <div style={{ margin: '12px 0', color: '#00d181' }}>↓</div>
          <div><strong>Drop-off</strong><br />{incomingRide.dropoff_address}</div>
        </div>
        <div aria-live="polite" style={{ margin: '24px 0', fontSize: '48px', fontWeight: 900, color: countdown <= 3 ? '#ef4444' : '#00d181' }}>{countdown}</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => void dismissIncomingRide(incomingRide.id)} style={{ flex: 1, padding: '16px', borderRadius: '14px', border: '1px solid #64748b', background: '#1e293b', color: 'white', fontWeight: 800 }}>DECLINE</button>
          <button onClick={() => void acceptRide(incomingRide.id)} style={{ flex: 1.5, padding: '16px', borderRadius: '14px', border: 'none', background: '#00d181', color: '#052e16', fontWeight: 900, fontSize: '17px' }}>ACCEPT</button>
        </div>
      </div>
    </div>)}
    {showChat && ride && (<div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}><div style={{ background: bgCard, width: '100%', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', height: '75vh', display: 'flex', flexDirection: 'column' }}><div style={{ padding: '16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontWeight: 'bold', color: text }}>Chat with Passenger</div><div style={{ fontSize: '11px', color: '#999' }}>Messages disappear after trip</div></div><button onClick={() => setShowChat(false)} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, color: text }}>✕</button></div><div style={{ flex: 1, overflow: 'hidden' }}><RideChat rideId={ride.id} myId={profile.id} /></div></div></div>)}
    {showCollected!== null && (<div style={{position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}><div style={{background:'linear-gradient(135deg,#FF6B00,#ff9500)', borderRadius:'24px', padding:'32px 24px', textAlign:'center', width:'100%', maxWidth:'340px'}}><div style={{fontSize:'48px'}}>💰</div><div style={{color:'white', fontSize:'14px', fontWeight:'bold'}}>{pendingRating?.payment_method === 'paystack' ? 'PAYMENT RECEIVED ONLINE' : 'CASH FARE DUE'}</div><div style={{color:'white', fontSize:'20px'}}>Passenger R {showCollected}</div><div style={{color:'white', fontSize:'32px', fontWeight:'900'}}>You get R {getEarnings(showCollected, pendingRating?.driver_earnings, pendingRating?.buddyride_commission).driverGets}</div><div style={{color:'white', fontSize:'14px', opacity:0.8}}>Fee R {getEarnings(showCollected, pendingRating?.driver_earnings, pendingRating?.buddyride_commission).platformGets} (20%)</div><button onClick={() => { setShowCollected(null); setShowDriverRating(true) }} style={{marginTop:'18px', width:'100%', padding:'14px', borderRadius:'12px', background:'white', color:'#FF6B00', border:'none', fontWeight:'900'}}>Rate Passenger →</button></div></div>)}
    {showDriverCancelReason && (<div style={{position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'flex-end'}}><div style={{background: isDark? '#121214':'white', width:'100%', borderTopLeftRadius:'32px', borderTopRightRadius:'32px', padding:'20px', color: text}}><div style={{ width: '48px', height: '6px', background: 'rgba(255,255,255,0.2)', borderRadius: '3px', margin: '0 auto 14px' }} /><h3>Why cancel?</h3>{['Passenger no-show','Passenger asked to cancel','Wrong pickup','Vehicle issue','Other'].map(reason => (<button key={reason} onClick={() => setDriverCancelReason(reason)} style={{ width:'100%', textAlign:'left', padding:'14px', borderRadius:'12px', marginBottom:'8px', background: driverCancelReason===reason? '#ff3b30':'#242428', color: text, border: `1px solid ${border}` }}>{reason} {driverCancelReason===reason? '✓':''}</button>))}<div style={{display:'flex', gap:'8px', marginTop:'16px'}}><button onClick={() => { setShowDriverCancelReason(false); setDriverCancelReason(''); setRideToCancel(null) }} style={{flex:1, padding:'14px', borderRadius:'12px', background:bg2, color:text, border:`1px solid ${border}`, fontWeight:'bold'}}>Back</button><button onClick={executeDriverCancel} style={{flex:1.5, padding:'14px', borderRadius:'12px', background:'#ff3b30', color:'white', border:'none', fontWeight:'bold'}} disabled={!driverCancelReason}>Confirm Cancel</button></div></div></div>)}
  </div>
}
export default DriverHome