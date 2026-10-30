import { useEffect, useState, useRef } from 'react'
import { BottomSheet, type BottomSheetSnapPoint } from '../components/BottomSheet'
import { OsmMapView } from '../components/OsmMapView'
import { PassengerNavigationMenu } from '../components/PassengerNavigationMenu'
import { RideChat } from '../components/RideChat'
import { getOSMRoute, reverseOSM } from '../lib/osm'
import { calculateFareForCategory, DEFAULT_FARE_CONFIG, type FareConfig } from '../lib/fare'
import { useDriverLiveLocation } from '../lib/useDriverLiveLocation'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]

function errMsg(e: any) {
  return e?.message || e?.error_description || (typeof e === 'string' ? e : JSON.stringify(e))
}

function compress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const c = document.createElement('canvas')
      const max = 1280
      let w = img.width, h = img.height
      if (w > h) { if (w > max) { h *= max/w; w = max } }
      else { if (h > max) { w *= max/h; h = max } }
      c.width = w; c.height = h
      c.getContext('2d')!.drawImage(img, 0, 0, w, h)
      c.toBlob(b => b ? resolve(b) : reject(new Error('compress')), 'image/jpeg', 0.75)
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load')) }
    img.src = objectUrl
  })
}

const LOCAL_PLACES = [
  { text: 'Thabo Mbeki Street', place_name: 'Thabo Mbeki Street, Polokwane Central', center: [29.4589, -23.9045] as [number, number] },
  { text: 'Grobler Street', place_name: 'Grobler Street, Polokwane Central', center: [29.4550, -23.9040] as [number, number] },
  { text: 'Church Street', place_name: 'Church Street, Polokwane Central', center: [29.4570, -23.9030] as [number, number] },
  { text: 'Bendor', place_name: 'Bendor, Polokwane', center: [29.4670, -23.8900] as [number, number] },
  { text: 'Mall of the North', place_name: 'Mall of the North, Bendor', center: [29.4395, -23.8885] as [number, number] },
  { text: 'Seshego', place_name: 'Seshego, Polokwane', center: [29.3900, -23.8600] as [number, number] },
  { text: 'Moletji', place_name: 'Moletji / Moletsi, Polokwane', center: [29.3200, -23.7800] as [number, number] },
  { text: 'Mankweng', place_name: 'Mankweng Township', center: [29.7200, -23.8850] as [number, number] },
  { text: 'University of Limpopo', place_name: 'University of Limpopo, Turfloop', center: [29.7400, -23.8800] as [number, number] },
  { text: 'Lebowakgomo', place_name: 'Lebowakgomo, Limpopo', center: [29.5600, -24.3000] as [number, number] },
  { text: 'Puma Makgofe', place_name: 'Puma Makgofe, Perskebult', center: [29.4630, -23.8560] as [number, number] },
  { text: 'Eduanpark', place_name: 'Eduanpark, Polokwane', center: [29.4510, -23.8380] as [number, number] },
  { text: 'Thohoyandou', place_name: 'Thohoyandou, Vhembe', center: [30.4550, -22.9770] as [number, number] },
  { text: 'Tzaneen', place_name: 'Tzaneen, Mopani', center: [30.1633, -23.8333] as [number, number] },
  { text: 'Giyani', place_name: 'Giyani, Limpopo', center: [30.6921, -23.3022] as [number, number] },
  { text: 'Bela-Bela', place_name: 'Bela-Bela, Waterberg', center: [28.2857, -24.8833] as [number, number] },
  { text: 'Mokopane', place_name: 'Mokopane, Mogalakwena', center: [29.0100, -24.1944] as [number, number] },
]

const CATEGORIES = [
  { id: 'buddy_go', name: 'Go', icon: '🚗' },
  { id: 'buddy_comfort', name: 'Comfort', icon: '✨' },
  { id: 'buddy_xl', name: 'XL', icon: '🚐' },
]

export function PassengerHome({ profile }: { profile: Profile }) {
  const [location, setLocation] = useState<[number, number]>(POLOKWANE_CENTER)
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null)
  const [dropoffCoords, setDropoffCoords] = useState<[number, number] | null>(null)
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([])
  const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([])
  const [showPickupSug, setShowPickupSug] = useState(false)
  const [showDropoffSug, setShowDropoffSug] = useState(false)
  const [route, setRoute] = useState<any>()
  const [ride, setRide] = useState<Ride | null>(null)
  const [driverProfile, setDriverProfile] = useState<Profile | null>(null)
  const { location: liveDriverLocation, error: liveDriverLocationError } = useDriverLiveLocation(ride?.driver_id || null)
  const [loading, setLoading] = useState(false)
  const [rideError, setRideError] = useState('')
  const [distance, setDistance] = useState<number | null>(null)
  const [duration, setDuration] = useState(5)
  const [price, setPrice] = useState<number | null>(null)
  const [showEstimate, setShowEstimate] = useState(false)
  const [selectedCat, setSelectedCat] = useState('buddy_go')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'paystack'>('cash')
  const [fareConfig, setFareConfig] = useState<FareConfig>(DEFAULT_FARE_CONFIG)
  const [categories, setCategories] = useState(CATEGORIES)
  const [pricingReady, setPricingReady] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('buddy_theme') as any) || 'light')
  const [rating, setRating] = useState(0)
  const [showCancelReason, setShowCancelReason] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [nearbyCars, setNearbyCars] = useState<any[]>([])
  const [showChat, setShowChat] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnapPoint>(50)
  const [uiVisible, setUiVisible] = useState(true)
  const [lastTouch, setLastTouch] = useState(Date.now())
  const pickupDebounce = useRef<any>(null)
  const dropoffDebounce = useRef<any>(null)
  const pickupAddressRequest = useRef(0)
  const mapAddressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cancelledNotification, setCancelledNotification] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const prevStatusRef = useRef<string>('')

  const isDark = theme === 'dark'
  const bg = isDark? '#121212' : '#ffffff'
  const bg2 = isDark? '#1e1e1e' : '#f2f2f2'
  const text = isDark? 'white' : 'black'
  const border = isDark? '#333' : '#ddd'
  const isVerified = (profile as any).is_verified === true || (profile as any).is_verified === 1
  const rideStatus = String(ride?.status || '').toLowerCase().replace(/[\s-]+/g, '_')

  useEffect(() => {
    if (rideStatus === 'searching' || rideStatus === 'finding') setSheetSnap(25)
    else if (['driver_assigned', 'accepted', 'driver_arriving'].includes(rideStatus)) setSheetSnap(50)
    else if (['arrived', 'passenger_in', 'i_have_arrived'].includes(rideStatus)) setSheetSnap(80)
    else if (['on_trip', 'driving_to_destination', 'picked_up', 'in_progress', 'en_route'].includes(rideStatus)) setSheetSnap(50)
    else if (rideStatus === 'completed') setSheetSnap(90)
  }, [rideStatus])

  useEffect(() => {
    const isDriving = ['picked_up', 'en_route', 'in_progress'].includes(rideStatus)
    if (!isDriving) { setUiVisible(true); return }
    if (!uiVisible) return
    const timer = setTimeout(() => setUiVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [rideStatus, uiVisible, lastTouch])

  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])

  useEffect(() => {
    let active = true
    async function loadFareConfig() {
      const [categoryResult, settingsResult] = await Promise.all([
        supabase.from('fare_categories').select('id,label,base_fare,per_km,per_min,min_fare,max_fare,active').eq('active', true),
        supabase.from('app_settings').select('commission').eq('id', 1).single(),
      ])
      if (!active) return
      if (categoryResult.error || settingsResult.error || !categoryResult.data?.length) {
        setRideError(`Fare configuration unavailable: ${errMsg(categoryResult.error) || errMsg(settingsResult.error) || 'No active ride categories'}`)
        return
      }
      const iconById = Object.fromEntries(CATEGORIES.map(category => [category.id, category.icon]))
      const activeCategories = categoryResult.data.map(category => ({
        id: category.id, name: category.label, icon: iconById[category.id] || '🚗',
      }))
      const configuredCategories = Object.fromEntries(categoryResult.data.map(category => [category.id, {
        base: Number(category.base_fare), perKm: Number(category.per_km), perMin: Number(category.per_min), min: Number(category.min_fare), max: Number(category.max_fare),
      }]))
      setCategories(activeCategories)
      setFareConfig({ categories: configuredCategories, commission: Number(settingsResult.data.commission) / 100 })
      setSelectedCat(current => activeCategories.some(category => category.id === current) ? current : activeCategories[0].id)
      setPricingReady(true)
      setRideError('')
    }
    void loadFareConfig()
    return () => { active = false }
  }, [])

  useEffect(() => () => { if (mapAddressTimeout.current) clearTimeout(mapAddressTimeout.current) }, [])

  useEffect(() => {
    audioRef.current = new Audio('https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c8b9d2.mp3?filename=notification-sound-7062.mp3')
    audioRef.current.volume = 1.0
    audioRef.current.preload = 'auto'
  }, [])

  function playSound(type: 'accept'|'arrived'|'start'|'complete'|'cancel' = 'accept') {
    const sounds: any = {
      accept: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c8b9d2.mp3?filename=success-1-6297.mp3',
      arrived: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c8b9d2.mp3?filename=notification-2-269292.mp3',
      start: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_1d171a2a6f.mp3?filename=notification-sound-7062.mp3',
      complete: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c8b9d2.mp3?filename=success-1-6297.mp3',
      cancel: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c8b9d2.mp3?filename=notification-sound-7062.mp3'
    }
    try { const audio = new Audio(sounds[type]); audio.volume = 1.0; audio.play().catch(() => {}) } catch {}
    if ('vibrate' in navigator) {
      if (type === 'arrived') navigator.vibrate([200,100,200,100,400])
      else if (type === 'cancel') navigator.vibrate([500,200,500])
      else navigator.vibrate(300)
    }
  }

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(async pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p); setPickupCoords(p)
      try { const real = await reverseOSM(p); setPickup(real) } catch { setPickup('My Location - Polokwane') }
    })
    async function loadActiveRide() {
      const { data } = await supabase.from('rides').select('*').eq('passenger_id', profile.id).in('status', ['searching','accepted','arrived','picked_up','en_route','in_progress'] as any).order('created_at', { ascending: false }).limit(1).single()
      if (data) { setRide(data as Ride); setSheetSnap(50); prevStatusRef.current = (data as any).status }
    }
    loadActiveRide()
  }, [profile.id])

  useEffect(() => {
    const fiveMinAgo = new Date(Date.now() - 5*60*1000).toISOString()
    supabase.from('driver_status').select('*').eq('is_online', true).gt('updated_at', fiveMinAgo).then(({data}) => { if(data) setNearbyCars(data) })
    const ch = supabase.channel('buddyride-cars-live').on('postgres_changes', { event: '*', schema: 'public', table: 'driver_status' }, (payload) => {
      const car = payload.new as any; if (!car) return
      if (car.updated_at && new Date(car.updated_at).getTime() < Date.now() - 5*60*1000) {
        setNearbyCars(prev => prev.filter(c => c.driver_id!== car.driver_id))
        return
      }
      if (car.is_online) { setNearbyCars(prev => { const exists = prev.find(c => c.driver_id === car.driver_id); return exists? prev.map(c => c.driver_id === car.driver_id? car : c) : [...prev, car] }) } else { setNearbyCars(prev => prev.filter(c => c.driver_id!== car.driver_id)) }
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    if (ride?.driver_id) supabase.from('profiles').select('*').eq('id', ride.driver_id).single().then(({ data }) => { if (data) setDriverProfile(data as any) })
    else setDriverProfile(null)
  }, [ride?.driver_id])

  useEffect(() => {
    if (!ride) return
    const ch = supabase.channel(`passenger-${ride.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` }, p => {
      const newR = p.new as any; if (!newR) return
      const oldStatus = prevStatusRef.current
      const newStatus = newR.status
      if (newStatus === 'cancelled' && newR.cancelled_by === 'driver') {
        playSound('cancel')
        setCancelledNotification(`Driver cancelled: ${newR.cancel_reason || 'No reason'}`)
        setTimeout(() => { setCancelledNotification(null); setRide(null); setRoute(undefined); setDriverProfile(null); setShowChat(false); setSheetSnap(50) }, 5000)
      } else {
        if (oldStatus!== newStatus) {
          if (newStatus === 'accepted') playSound('accept')
          else if (newStatus === 'arrived') playSound('arrived')
          else if (['picked_up','in_progress','en_route'].includes(newStatus)) playSound('start')
          else if (newStatus === 'completed') playSound('complete')
        }
      }
      prevStatusRef.current = newStatus
      setRide(newR as Ride)
      if (['picked_up','in_progress','en_route'].includes(newR.status)) { setSheetSnap(50) }
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [ride?.id])

  // FIXED: Instant dispatch - was 5s, now 2s with quick retries
  useEffect(() => {
    if (!ride || ride.status !== 'searching') return
    let cancelled = false

    const dispatch = async () => {
      if (cancelled) return
      const { data, error } = await supabase.rpc('dispatch_ride', { p_ride_id: ride.id })
      if (cancelled) return
      if (error) {
        setRideError(`Driver matching failed: ${errMsg(error)}`)
      } else if (!data) {
        // Keep searching silently - don't spam UI
        console.log('No driver yet, retrying...')
      } else {
        setRideError('')
      }
    }

    // Try instantly + 1.5s + 3s for instant feel
    void dispatch()
    const t1 = setTimeout(() => void dispatch(), 1500)
    const t2 = setTimeout(() => void dispatch(), 3000)

    // Then every 2 seconds (was 5s)
    const timer = window.setInterval(() => { void dispatch() }, 2000)

    return () => {
      cancelled = true
      clearTimeout(t1)
      clearTimeout(t2)
      window.clearInterval(timer)
    }
  }, [ride?.id, ride?.status])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('paystack') !== 'verify') return
    const rideId = params.get('ride_id')
    const reference = params.get('reference')
    if (!rideId || !reference) { setRideError('Payment return URL is missing ride/payment details.'); return }
    let active = true
    setLoading(true)
    void supabase.functions.invoke('verify-paystack-payment', { body: { ride_id: rideId, reference } }).then(async ({ error }) => {
      if (error) throw error
      const { data, error: rideLoadError } = await supabase.from('rides').select('*').eq('id', rideId).single()
      if (rideLoadError) throw rideLoadError
      if (active) { setRide(data as Ride); setRideError(''); setSheetSnap(50) }
    }).catch(error => {
      if (active) {
        setRideError(`Payment confirmation failed: ${errMsg(error)}`)
        void supabase.from('rides').select('*').eq('id', rideId).eq('passenger_id', profile.id).maybeSingle().then(({ data }) => { if (data && active) setRide(data as Ride) })
      }
    }).finally(() => {
      if (active) { setLoading(false); window.history.replaceState({}, '', window.location.pathname) }
    })
    return () => { active = false }
  }, [])

  async function searchPlaces(query: string, setter: any, setShow: any) {
    if (!query || query.trim().length < 2) { setter([]); setShow(false); return }
    const lower = query.toLowerCase()
    let localMatches = LOCAL_PLACES.filter((p:any) => p.text.toLowerCase().includes(lower) || p.place_name.toLowerCase().includes(lower))
    setter(localMatches.slice(0,8)); setShow(localMatches.length > 0)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Limpopo')}&countrycodes=za&viewbox=27.0,-25.8,31.8,-22.0&bounded=0&limit=8`)
      const osmData = await res.json()
      const osmPlaces = osmData.filter((o:any) => o.display_name.toLowerCase().includes('limpopo') || o.display_name.toLowerCase().includes('polokwane')).map((o:any) => ({
        text: o.display_name.split(',')[0], place_name: o.display_name.split(',').slice(0,3).join(', '), center: [parseFloat(o.lon), parseFloat(o.lat)] as [number, number],
      }))
      const merged = [...localMatches,...osmPlaces]
      const unique = Array.from(new Map(merged.map((m:any) => [m.place_name, m])).values())
      if (unique.length > 0) { setter(unique.slice(0,10)); setShow(true) }
    } catch {}
  }

  function onPickupChange(val: string) { setPickup(val); setPickupCoords(null); setDistance(null); setPrice(null); setShowEstimate(false); if (pickupDebounce.current) clearTimeout(pickupDebounce.current); pickupDebounce.current = setTimeout(() => searchPlaces(val, setPickupSuggestions, setShowPickupSug), 300) }
  function onDropoffChange(val: string) { setDropoff(val); setDropoffCoords(null); setDistance(null); setPrice(null); setShowEstimate(false); if (dropoffDebounce.current) clearTimeout(dropoffDebounce.current); dropoffDebounce.current = setTimeout(() => searchPlaces(val, setDropoffSuggestions, setShowDropoffSug), 300) }
  function selectPickupSuggestion(item: any) { setPickup(item.place_name); setPickupCoords([item.center[0], item.center[1]]); setDistance(null); setPrice(null); setShowEstimate(false); setRoute(undefined); setRideError(''); setShowPickupSug(false) }
  function selectDropoffSuggestion(item: any) { setDropoff(item.place_name); setDropoffCoords([item.center[0], item.center[1]]); setDistance(null); setPrice(null); setShowEstimate(false); setRoute(undefined); setRideError(''); setShowDropoffSug(false); setSheetSnap(90) }

  function onPickupMapMove(coords: [number, number]) {
    setPickupCoords(coords); setShowEstimate(false); setDistance(null); setPrice(null); setRoute(undefined); setShowPickupSug(false)
    if (mapAddressTimeout.current) clearTimeout(mapAddressTimeout.current)
    const requestId = ++pickupAddressRequest.current
    mapAddressTimeout.current = setTimeout(async () => {
      const address = await reverseOSM(coords)
      if (requestId === pickupAddressRequest.current) setPickup(address)
    }, 250)
  }

  async function ensureCoords() { return { pCoords: pickupCoords, dCoords: dropoffCoords } }

  async function calculateEstimate() {
    if (!pricingReady) { setRideError('Fare configuration is still loading. Please try again.'); return }
    if (!dropoff) { setRideError('Enter a destination before estimating your fare.'); return }
    const { pCoords, dCoords } = await ensureCoords()
    if (!pCoords || !dCoords) { setRideError('Choose valid pickup and destination locations.'); return }
    setRideError(''); setPickupCoords(pCoords); setDropoffCoords(dCoords)
    try {
      const r = await getOSMRoute(pCoords, dCoords)
      setRoute(r.geometry); setDistance(r.distanceKm); setDuration(r.durationMin)
      setPrice(calculateFareForCategory(selectedCat, r.distanceKm, r.durationMin, fareConfig).total); setShowEstimate(true)
    } catch (error) { setShowEstimate(false); setRideError(`Could not calculate a route: ${errMsg(error)}`) }
  }

  async function useMyLocation() {
    navigator.geolocation.getCurrentPosition(async pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p); setPickupCoords(p); setDistance(null); setPrice(null); setShowEstimate(false)
      const real = await reverseOSM(p); setPickup(real); setRideError('')
    }, error => setRideError(`Could not access your location: ${errMsg(error)}`), { enableHighAccuracy: true, timeout: 10000 })
  }

  async function requestRide() {
    if (!isVerified) { alert('Please verify your ID first. Admin must approve you.'); return; }
    if (!pricingReady) { setRideError('Fare configuration is unavailable. Please try again later.'); return }
    setLoading(true); setRideError('')
    try {
      const { pCoords, dCoords } = await ensureCoords()
      if (!pCoords || !dCoords || !pickup.trim() || !dropoff.trim()) throw new Error('Choose a pickup and destination from the location suggestions.')
      const r = await getOSMRoute(pCoords, dCoords)
      const estimate = calculateFareForCategory(selectedCat, r.distanceKm, r.durationMin, fareConfig)
      const { data, error } = await supabase.from('rides').insert({
        passenger_id: profile.id, pickup_lat: pCoords[1], pickup_lng: pCoords[0], pickup_address: pickup,
        dropoff_lat: dCoords[1], dropoff_lng: dCoords[0], dropoff_address: dropoff,
        status: paymentMethod === 'paystack' ? 'awaiting_payment' : 'searching',
        fare: estimate.fare, total_fare: estimate.total, driver_earnings: estimate.driverGets,
        buddyride_commission: estimate.platformGets, distance_km: r.distanceKm, duration_min: r.durationMin,
        payment_method: paymentMethod, ride_category: selectedCat,
      } as any).select().single()
      if (error) throw error
      setRide(data as Ride); setSheetSnap(50); prevStatusRef.current = data.status
      if (paymentMethod === 'paystack') {
        const { data: checkout, error: checkoutError } = await supabase.functions.invoke('start-paystack-checkout', { body: { ride_id: data.id } })
        if (checkoutError) throw checkoutError
        if (!checkout?.authorization_url) throw new Error('Checkout did not return a Paystack payment URL.')
        window.location.assign(checkout.authorization_url)
      }
    } catch (error) { setRideError(errMsg(error)) } finally { setLoading(false) }
  }

  async function cancelRide() {
    if (!ride) return; if (!cancelReason) { setShowCancelReason(true); return }
    const rideId = ride.id
    const { error } = await supabase.from('rides').update({ status: 'cancelled', cancel_reason: cancelReason, cancelled_at: new Date().toISOString(), cancelled_by: 'passenger' } as any).eq('id', rideId)
    if (error) { setRideError(`Could not cancel ride: ${errMsg(error)}`); return }
    setShowCancelReason(false); setRoute(undefined); setDriverProfile(null); setShowEstimate(false); setRide(null); setShowChat(false); setSheetSnap(50); setCancelReason('')
  }

  async function finishTrip() {
    if (!ride) return
    const rideId = ride.id; const driverId = ride.driver_id
    if (rating > 0 && driverId) {
      const { error } = await supabase.rpc('submit_ride_rating', { p_ride_id: rideId, p_rating: rating })
      if (error) { setRideError(`Could not submit rating: ${errMsg(error)}`); return }
    }
    setRide(null); setShowChat(false); setRoute(undefined); setDropoff(''); setDropoffCoords(null); setShowEstimate(false); setSheetSnap(50); setRating(0)
  }

  const sugStyle = (dark:boolean) => ({ position: 'absolute' as const, top: '58px', left: 0, right: 0, zIndex: 9999, background: dark? '#2a2a2a' : 'white', border: `1px solid ${dark? '#444' : '#ddd'}`, borderRadius: '12px', maxHeight: '220px', overflowY: 'auto' as const })
  const sugItemStyle = (dark:boolean) => ({ padding: '12px 14px', borderBottom: `1px solid ${dark? '#333' : '#eee'}`, cursor: 'pointer', fontSize: '14px', color: dark? 'white' : 'black' })

  return <div className={`ride-app ride-app--${theme}`} onPointerDown={() => { setUiVisible(true); setLastTouch(Date.now()) }} style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <header className="ride-header" style={{ zIndex: 100, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: bg, color: text, borderBottom: `1px solid ${border}`, transform: uiVisible ? 'translateY(0)' : 'translateY(-110%)', transition: 'transform 300ms ease' }}>
      <PassengerNavigationMenu profile={profile} theme={theme} onThemeChange={setTheme} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide<br/>{profile.full_name || 'Passenger'}</strong>
      <div style={{ marginLeft: 'auto' }}><button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}` }}>{isDark? '☀️' : '🌙'}</button></div>
    </header>

    {cancelledNotification && (
      <div style={{position:'fixed', top:'70px', left:'12px', right:'12px', zIndex:99999, background:'#ff3b30', borderRadius:'16px', padding:'16px', display:'flex', gap:'12px', alignItems:'center'}}>
        <div style={{width:'48px', height:'48px', borderRadius:'24px', background:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px'}}>❌</div>
        <div style={{flex:1}}><div style={{color:'white', fontWeight:'900'}}>Driver Cancelled Trip!</div><div style={{color:'white', fontSize:'13px'}}>{cancelledNotification}</div></div>
        <button onClick={() => setCancelledNotification(null)} style={{background:'white', color:'#ff3b30', border:'none', borderRadius:'20px', padding:'8px 14px', fontWeight:'bold'}}>OK</button>
      </div>
    )}

    <div onClick={() => { setUiVisible(true); setLastTouch(Date.now()) }} style={{ position: 'absolute', inset: '60px 0 0 0', zIndex: 1 }}>
      <OsmMapView center={pickupCoords || location} route={route} driverLocation={liveDriverLocation?.coordinates || (driverProfile?.current_lat != null && driverProfile.current_lng != null ? [driverProfile.current_lng, driverProfile.current_lat] : undefined)} availableCars={nearbyCars as any} theme={theme} onMapMove={ride ? undefined : onPickupMapMove} />
      {!ride && <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 300, transform: 'translate(-50%, -100%)', fontSize: '34px', lineHeight: 1, pointerEvents: 'none' }}>📍</div>}
      {uiVisible && <button aria-label="Center map on my location" title="Center map on my location" onClick={useMyLocation} style={{ position: 'absolute', right: '16px', bottom: '100px', zIndex: 400, width: '48px', height: '48px', borderRadius: '24px', background: '#ff7a00', color: 'white', border: 'none', fontSize: '22px' }}>📍</button>}
    </div>

    <div style={{ position: 'absolute', inset: 'auto 0 0', height: '90dvh', zIndex: 60, transform: uiVisible || !['picked_up', 'en_route', 'in_progress'].includes(rideStatus) ? 'translateY(0)' : 'translateY(calc(100% - 20px))', transition: 'transform 300ms ease' }}>
      <BottomSheet snapPoint={sheetSnap} onSnapChange={setSheetSnap} theme={theme} fitToSnap>
        {!ride && (<>
          <h2 style={{ margin: '0 0 12px' }}>Where are you going? {profile.full_name ? `Hi ${profile.full_name.split(' ')[0]}` : ''}</h2>
          {!isVerified && (
            <div style={{padding:'12px', background:'#ff7a00', borderRadius:'12px', textAlign:'center', fontWeight:'bold', color:'white', marginBottom:'12px', fontSize:'14px'}}>
              🛡️ Your ID is pending approval. You can enter destination but cannot request until Admin approves.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={pickup} onChange={e => onPickupChange(e.target.value)} placeholder="Pickup - My Location" style={{ flex: 1, padding: '14px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text }} />
                <button onClick={useMyLocation} style={{ width: '52px', borderRadius: '14px', background: '#ff7a00', border: 'none', fontSize: '20px' }}>📍</button>
              </div>
              {showPickupSug && <div style={sugStyle(isDark) as any}>{pickupSuggestions.map((s,i) => (<div key={i} onClick={() => selectPickupSuggestion(s)} style={sugItemStyle(isDark)}>📍 {s.place_name}</div>))}</div>}
            </div>
            <div style={{ position: 'relative' }}>
              <input value={dropoff} onChange={e => onDropoffChange(e.target.value)} placeholder="Destination - Moletji, Mankweng..." style={{ width: '100%', padding: '14px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, boxSizing: 'border-box' }} />
              {showDropoffSug && <div style={sugStyle(isDark) as any}>{dropoffSuggestions.map((s,i) => (<div key={i} onClick={() => selectDropoffSuggestion(s)} style={sugItemStyle(isDark)}>📍 {s.place_name}</div>))}</div>}
            </div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
              {categories.map(cat => {
                const fare = distance ? calculateFareForCategory(cat.id, distance, duration, fareConfig).total : null; const isSel = selectedCat === cat.id
                return <button key={cat.id} onClick={() => { setSelectedCat(cat.id); if (distance) setPrice(calculateFareForCategory(cat.id, distance, duration, fareConfig).total) }} style={{ minWidth: '95px', padding: '10px', borderRadius: '12px', border: isSel? '2px solid #ff7a00' : `1px solid ${border}`, background: isSel? (isDark? '#3a2a1a' : '#fff3e0') : bg2, color: text, textAlign: 'left' }}><div style={{ fontSize: '20px' }}>{cat.icon}</div><div style={{ fontWeight: 'bold', fontSize: '12px', color: text }}>{cat.name}</div>{fare !== null && <div style={{ fontWeight: 'bold', color: '#ff7a00', fontSize: '12px' }}>R {fare}</div>}</button>
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['cash', 'Cash'], ['paystack', 'Card • Paystack']] as const).map(([method, label]) => (
                <button key={method} type="button" onClick={() => setPaymentMethod(method)} aria-pressed={paymentMethod === method}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: paymentMethod === method ? '2px solid #ff7a00' : `1px solid ${border}`, background: paymentMethod === method ? (isDark ? '#3a2a1a' : '#fff3e0') : bg2, color: text, fontWeight: 'bold' }}>
                  {label}
                </button>
              ))}
            </div>
            {rideError && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 13 }}>{rideError}</p>}
            <div style={{ position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', gap: '10px', padding: `10px 0 calc(10px + env(safe-area-inset-bottom))`, background: bg, borderTop: `1px solid ${border}` }}>
              <button onClick={calculateEstimate} style={{ flex: 1, minHeight: '52px', padding: '14px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontWeight: 'bold' }}>Estimate</button>
              <button onClick={requestRide} disabled={loading ||!isVerified} style={{ flex: 1.5, minHeight: '52px', padding: '14px', borderRadius: '14px', border: 'none', background:!isVerified? '#555' : '#000', color: 'white', fontWeight: 'bold', opacity:!isVerified? 0.6 : 1 }}>
                {!isVerified ? 'Pending Approval' : loading ? (paymentMethod === 'paystack' ? 'Opening Paystack…' : 'Finding…') : paymentMethod === 'paystack' ? 'Pay & Request Ride' : 'Request Ride'}
              </button>
            </div>
            {showEstimate && distance!== null && price!== null && (<div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', background: bg2 }}><span>{distance.toFixed(1)} km</span><span style={{ fontWeight: 'bold' }}>R {price.toFixed(0)}</span></div>)}
          </div>
        </>)}
        {ride && ride.status === 'awaiting_payment' && (
          <>
            <h3>Complete payment to request your ride</h3>
            <p style={{ fontSize: '13px' }}>{ride.pickup_address} → {ride.dropoff_address}</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold' }}>R {Number(ride.total_fare ?? ride.fare).toFixed(2)}</p>
            {rideError && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{rideError}</p>}
            <button disabled={loading} onClick={async () => {
              setLoading(true); setRideError('')
              try {
                const { data, error } = await supabase.functions.invoke('start-paystack-checkout', { body: { ride_id: ride.id } })
                if (error) throw error
                if (!data?.authorization_url) throw new Error('Checkout did not return a Paystack payment URL.')
                window.location.assign(data.authorization_url)
              } catch (error) { setRideError(errMsg(error)) } finally { setLoading(false) }
            }} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: '#00a86b', color: 'white', border: 'none', fontWeight: 'bold' }}>
              {loading ? 'Opening Paystack…' : 'Pay with Paystack'}
            </button>
            <button onClick={() => setShowCancelReason(true)} style={{ width: '100%', marginTop: '8px', padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>Cancel</button>
          </>
        )}
        {ride && ride.status === 'searching' && (
          <>
            <h3>Searching driver... ●</h3>
            <p style={{ fontSize: '13px' }}>{ride.pickup_address} → {ride.dropoff_address}</p>
            {rideError && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{rideError}</p>}
            <button onClick={() => setShowCancelReason(true)} style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>Cancel</button>
          </>
        )}
        {ride && driverProfile && ['accepted','arrived','picked_up','en_route','in_progress'].includes(ride.status as any) && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ padding: '7px 11px', borderRadius: '999px', background: '#2C2C2E', color: '#fff', fontSize: '11px', fontWeight: 700 }}>PREMIUM</span>
              <span style={{ color: '#c7c7cc', fontSize: '13px', fontWeight: 600 }}>
                {ride.status === 'arrived' ? 'Driver arrived' : ['picked_up','en_route','in_progress'].includes(ride.status as any) ? 'On your trip' : '4 min away'}
              </span>
            </div>
            {liveDriverLocationError && <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: 12 }}>{liveDriverLocationError}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {driverProfile.avatar_url && typeof driverProfile.avatar_url === 'string' && driverProfile.avatar_url.startsWith('http')
                ? <img src={driverProfile.avatar_url} alt="Driver profile" style={{ width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover', background: '#3A3A3C' }} />
                : <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#3A3A3C', display: 'grid', placeItems: 'center', fontSize: '24px' }}>👨</div>}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '17px' }}>{driverProfile.full_name || 'Your driver'} <span style={{ color: '#c7c7cc', fontSize: '13px' }}>★ {driverProfile.rating?.toFixed(1) || '—'}</span></div>
                <div style={{ color: '#c7c7cc', fontSize: '13px', marginTop: '3px' }}>{driverProfile.car_model || 'BuddyRide'} · {driverProfile.car_plate || 'Vehicle details'}</div>
                <div style={{ color: '#c7c7cc', fontSize: '12px', marginTop: '3px' }}>{driverProfile.phone_number || driverProfile.phone || 'Phone not provided'}</div>
              </div>
            </div>
            <div style={{ fontSize: '30px', fontWeight: 700 }}>R {ride.fare}</div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}><span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#34C759', flex: 'none' }} /><span style={{ fontSize: '14px' }}>{ride.pickup_address}</span></div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}><span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#000', border: '1px solid #8e8e93', flex: 'none' }} /><span style={{ fontSize: '14px' }}>{ride.dropoff_address}</span></div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {(driverProfile.phone_number || driverProfile.phone) && <a href={`tel:${driverProfile.phone_number || driverProfile.phone}`} style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: '48px', borderRadius: '14px', background: '#2C2C2E', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>Call</a>}
              {(driverProfile.phone_number || driverProfile.phone) && <a target="_blank" rel="noreferrer" href={`https://wa.me/${String(driverProfile.phone_number || driverProfile.phone).replace(/\D/g, '').replace(/^0/, '27')}`} style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: '48px', borderRadius: '14px', background: '#166534', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>WhatsApp</a>}
              <button onClick={() => setShowChat(true)} style={{ flex: 1, minHeight: '48px', borderRadius: '14px', background: '#2C2C2E', color: '#fff', border: 0, fontWeight: 600 }}>Message</button>
              {['accepted','arrived'].includes(ride.status as any) && <button onClick={() => setShowCancelReason(true)} style={{ flex: 1, minHeight: '48px', borderRadius: '14px', background: '#2C2C2E', color: '#fff', border: 0, fontWeight: 600 }}>Cancel</button>}
            </div>
            {['picked_up','en_route','in_progress'].includes(ride.status as any) && <div className="ride-status" style={{ padding: '12px', borderRadius: '16px', textAlign: 'center', fontWeight: 'bold' }}>🧭 Driving to destination...</div>}
          </div>
        )}
        {ride && ride.status === 'completed' && (
          <>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px' }}>✅</div>
              <h2 style={{ margin: '8px 0' }}>Trip Completed! R {ride.fare}</h2>
              <p style={{ color: '#888', fontSize: '13px' }}>Rate your driver</p>
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', margin: '16px 0' }}>
                {[1,2,3,4,5].map(s => (<button key={s} onClick={() => setRating(s)} style={{ fontSize: '48px', background: 'none', border: 'none', color: rating >= s? '#FFB400' : '#444' }}>{rating >= s? '★' : '☆'}</button>))}
              </div>
              {rideError && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{rideError}</p>}
            </div>
            <button onClick={finishTrip} style={{ width: '100%', padding: '16px', borderRadius: '14px', background: rating === 0? '#666' : '#ff7a00', color: 'white', border: 'none', fontWeight: 'bold' }}>{rating === 0? 'Select stars' : `Finish • ${rating}★`}</button>
          </>
        )}
      </BottomSheet>
    </div>
    {showChat && ride && (<div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}><div style={{ background: bg, width: '100%', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', height: '75vh', display: 'flex', flexDirection: 'column' }}><div style={{ padding: '16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between' }}><div style={{ fontWeight: 'bold', color: text }}>{driverProfile?.full_name}</div><button onClick={() => setShowChat(false)} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, color: text }}>✕</button></div><div style={{ flex: 1, overflow: 'hidden' }}><RideChat rideId={ride.id} myId={profile.id} /></div></div></div>)}
    {showCancelReason && (<div style={{position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'flex-end'}}><div style={{background: isDark? '#18181b':'white', width:'100%', borderTopLeftRadius:'24px', borderTopRightRadius:'24px', padding:'20px', color: text}}>{['Driver too far','Waiting too long','Changed my mind','Other'].map(reason => (<button key={reason} onClick={() => setCancelReason(reason)} style={{ width:'100%', textAlign:'left', padding:'14px', borderRadius:'12px', marginBottom:'8px', background: cancelReason===reason? '#00d181':'#242428', color: text, border: `1px solid ${border}` }}>{reason} {cancelReason===reason? '✓':''}</button>))}<div style={{display:'flex', gap:'8px', marginTop:'16px'}}><button onClick={() => setShowCancelReason(false)} style={{flex:1, padding:'14px', borderRadius:'12px', background:bg2, color:text, border:`1px solid ${border}`, fontWeight:'bold'}}>Back</button><button onClick={cancelRide} style={{flex:1.5, padding:'14px', borderRadius:'12px', background:'#ff3b30', color:'white', border:'none', fontWeight:'bold'}} disabled={!cancelReason}>Confirm Cancel</button></div></div></div>)}
  </div>
}