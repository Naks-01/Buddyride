import { lazy, Suspense, useEffect, useState, useRef, type FormEvent } from 'react'
import { BottomSheet, type BottomSheetSnapPoint } from '../components/BottomSheet'
import { PassengerNavigationMenu } from '../components/PassengerNavigationMenu'
import { PassengerSafetyModal, type PassengerIdMethod } from '../components/PassengerSafetyModal'
import { RideChat } from '../components/RideChat'
import { reverseOSM } from '../lib/osm'
import { useDriverLiveLocation } from '../lib/useDriverLiveLocation'
import { createRealtimeChannel } from '../lib/realtime'
import { updateRide } from '../lib/rideUpdates'
import { supabase, type Profile, type Ride } from '../lib/supabase'
import { calculateFare } from '../lib/fare'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

const OsmMapView = lazy(() => import('../components/OsmMapView').then(module => ({ default: module.OsmMapView })))
const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]
const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY as string

function errMsg(e: any) { return e?.message || e?.error_description || (typeof e === 'string' ? e : JSON.stringify(e)) }
function safeUUID() { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
async function compress(file: File | Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap === 'undefined') return file
    const bitmap = await createImageBitmap(file, { resizeWidth: 1280, resizeQuality: 'medium' } as any)
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d'); if (!ctx) { bitmap.close?.(); return file }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.75))
    return blob && blob.size < file.size ? blob : file
  } catch { return file }
}
const CATEGORIES = [{ id: 'buddy_go', name: 'Go', icon: '🚗' }, { id: 'buddy_comfort', name: 'Comfort', icon: '✨' }, { id: 'buddy_xl', name: 'XL', icon: '🚐' },]
const PASSENGER_SAFETY_CAPTURES = [{ type: 'passenger_selfie', label: 'Selfie', facingMode: 'user' as const, action: 'Take selfie' }, { type: 'passenger_id', label: 'Photo ID', facingMode: 'environment' as const, action: 'Take photo of ID' },] as const
type PassengerSafetyCapture = typeof PASSENGER_SAFETY_CAPTURES[number]
function isValidSAID(id: string) {
  if (!/^\d{13}$/.test(id)) return false
  const yy = Number(id.slice(0, 2)); const month = Number(id.slice(2, 4)); const day = Number(id.slice(4, 6))
  const currentYear = new Date().getFullYear(); const currentYearTwoDigits = currentYear % 100
  const year = yy <= currentYearTwoDigits ? 2000 + yy : 1900 + yy
  const birthDate = new Date(year, month - 1, day)
  const validBirthDate = birthDate.getFullYear() === year && birthDate.getMonth() === month - 1 && birthDate.getDate() === day && birthDate <= new Date()
  if (!validBirthDate) return false
  let sum = 0; let doubleDigit = true
  for (let index = 11; index >= 0; index -= 1) { let digit = Number(id[index]); if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9 } sum += digit; doubleDigit = !doubleDigit }
  return (sum + Number(id[12])) % 10 === 0
}
async function searchPlaces(query: string, setter: any, setShow: any) {
  if (!query || query.trim().length < 2) { setter([]); setShow(false); return }
  const q = encodeURIComponent(query.trim())
  if (TOMTOM_KEY) {
    try {
      const res = await fetch(`https://api.tomtom.com/search/2/poiSearch/${q}.json?key=${TOMTOM_KEY}&countrySet=ZA&lat=-23.9045&lon=29.4589&radius=50000&limit=8`)
      const data = await res.json()
      if (data.results?.length > 0) { const places = data.results.map((r: any) => ({ text: r.poi?.name || r.address.freeformAddress, place_name: r.poi?.name ? `${r.poi.name}, ${r.address.freeformAddress}` : r.address.freeformAddress, center: [r.position.lon, r.position.lat] as [number, number] })); setter(places); setShow(true); return }
    } catch {}
    try {
      const res = await fetch(`https://api.tomtom.com/search/2/search/${q}.json?key=${TOMTOM_KEY}&countrySet=ZA&lat=-23.9045&lon=29.4589&radius=50000&limit=8&idxSet=POI,Addr`)
      const data = await res.json()
      if (data.results?.length > 0) { const places = data.results.map((r: any) => ({ text: r.poi?.name || r.address.freeformAddress, place_name: r.poi?.name ? `${r.poi.name}, ${r.address.freeformAddress}` : r.address.freeformAddress, center: [r.position.lon, r.position.lat] as [number, number] })); setter(places); setShow(true); return }
    } catch {}
  }
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query + ', Limpopo') + '&countrycodes=za&limit=8')
    const osmData = await res.json(); const places = osmData.map((o: any) => ({ text: o.display_name.split(',')[0], place_name: o.display_name, center: [parseFloat(o.lon), parseFloat(o.lat)] as [number, number] }))
    if (places.length > 0) { setter(places); setShow(true); return }
  } catch {}
  setter([]); setShow(false)
}
async function geocodeAddress(text: string): Promise<[number, number] | null> {
  if (TOMTOM_KEY) { try { const res = await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(text)}.json?key=${TOMTOM_KEY}&countrySet=ZA&limit=1&idxSet=POI,Addr`); const data = await res.json(); if (data.results?.[0]) return [data.results[0].position.lon, data.results[0].position.lat] } catch {} }
  try { const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(text) + '&countrycodes=za&limit=1'); const data = await res.json(); if (data?.[0]) return [parseFloat(data[0].lon), parseFloat(data[0].lat)] } catch {}
  return null
}
export function PassengerHome({ profile }: { profile: Profile }) {
  const [location, setLocation] = useState<[number, number]>(POLOKWANE_CENTER)
  const [pickup, setPickup] = useState(''); const [dropoff, setDropoff] = useState('')
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null); const [dropoffCoords, setDropoffCoords] = useState<[number, number] | null>(null)
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]); const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([])
  const [showPickupSug, setShowPickupSug] = useState(false); const [showDropoffSug, setShowDropoffSug] = useState(false)
  const [route, setRoute] = useState<any>(); const [ride, setRide] = useState<Ride | null>(null)
  const [completedRide, setCompletedRide] = useState<Ride | null>(null); const [completedReceipt, setCompletedReceipt] = useState<Ride | null>(null)
  const [driverProfile, setDriverProfile] = useState<(Profile & { car_make?: string | null; license_plate?: string | null }) | null>(null)
  const { location: liveDriverLocation } = useDriverLiveLocation(ride?.driver_id || null)
  const [loading, setLoading] = useState(false); const [rideError, setRideError] = useState(''); const [distance, setDistance] = useState<number | null>(null)
  const [duration, setDuration] = useState(5); const [price, setPrice] = useState<number | null>(null); const [showEstimate, setShowEstimate] = useState(false)
  const [selectedCat, setSelectedCat] = useState('buddy_go'); const [paymentMethod, setPaymentMethod] = useState<'cash' | 'paystack'>('cash')
  const [categories, setCategories] = useState(CATEGORIES); const [pricingReady, setPricingReady] = useState(true)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('buddy_theme') as any) || 'light')
  const [rating, setRating] = useState(0); const [ratingComment, setRatingComment] = useState('')
  const [showCancelReason, setShowCancelReason] = useState(false); const [cancelReason, setCancelReason] = useState('')
  const [nearbyCars, setNearbyCars] = useState<any[]>([]); const [showChat, setShowChat] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnapPoint>(50); const [pinTarget, setPinTarget] = useState<'pickup' | 'dropoff'>('pickup')
  const [isMapMoving, setIsMapMoving] = useState(false)
  const [safetyProfile, setSafetyProfile] = useState({ avatar_url: profile.avatar_url, selfie_url: profile.selfie_url ?? null, id_document_url: profile.id_document_url ?? null, id_number: profile.id_number ?? null, id_verified: profile.id_verified ?? false, is_verified: profile.is_verified ?? false, })
  const [verificationStatus, setVerificationStatus] = useState(profile.verification_status || 'not_started'); const [verificationRejectionReason, setVerificationRejectionReason] = useState(profile.verification_rejection_reason || ''); const [verificationLoaded, setVerificationLoaded] = useState(false); const [verificationError, setVerificationError] = useState(''); const [uploadToast, setUploadToast] = useState(''); const [showSafetyModal, setShowSafetyModal] = useState(false); const [safetyIdMethod, setSafetyIdMethod] = useState<PassengerIdMethod>('id_photo'); const [safetyIdNumber, setSafetyIdNumber] = useState(''); const [verificationUploadType, setVerificationUploadType] = useState<string | null>(null); const [cameraDocument, setCameraDocument] = useState<PassengerSafetyCapture | null>(null); const [cameraError, setCameraError] = useState(''); const [cameraReady, setCameraReady] = useState(false)
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null); const cameraStreamRef = useRef<MediaStream | null>(null)
  const pickupDebounce = useRef<any>(null); const dropoffDebounce = useRef<any>(null); const pickupAddressRequest = useRef(0); const dropoffAddressRequest = useRef(0); const mapAddressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null); const cancelledRideTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const uploadToastTimer = useRef<number | null>(null)
  const [cancelledNotification, setCancelledNotification] = useState<string | null>(null); const audioRef = useRef<HTMLAudioElement | null>(null); const prevStatusRef = useRef<string>('')
  const isDark = theme === 'dark'; const bg = isDark ? '#121212' : '#ffffff'; const bg2 = isDark ? '#1e1e1e' : '#F2F4F7'; const text = isDark ? 'white' : 'black'; const muted = isDark ? '#aaa' : '#667085'; const border = isDark ? '#333' : '#E4E7EC'
  const isVerified = verificationLoaded && (safetyProfile.is_verified === true || ['verified', 'approved'].includes(verificationStatus)); const rideStatus = String(ride?.status || '').toLowerCase().replace(/[\s-]+/g, '_')
  useEffect(() => {
    if (rideStatus === 'searching' || rideStatus === 'finding') setSheetSnap(25)
    else if (['driver_assigned', 'accepted', 'driver_arriving'].includes(rideStatus)) setSheetSnap(50)
    else if (['arrived', 'passenger_in', 'i_have_arrived'].includes(rideStatus)) setSheetSnap(80)
    else if (['on_trip', 'driving_to_destination', 'picked_up', 'in_progress', 'en_route'].includes(rideStatus)) setSheetSnap(50)
    else if (rideStatus === 'completed') setSheetSnap(90)
  }, [rideStatus])
  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])
  useEffect(() => () => { if (uploadToastTimer.current) window.clearTimeout(uploadToastTimer.current); cameraStreamRef.current?.getTracks().forEach(t => t.stop()) }, [])
  useEffect(() => {
    let active = true
    async function loadPassengerVerification() {
      setVerificationLoaded(false); setVerificationError('')
      try {
        const { data: { user } } = await supabase.auth.getUser(); const effectiveId = user?.id || profile.id
        const { data, error } = await supabase.from('profiles').select('avatar_url,selfie_url,id_document_url,id_number,id_verified,is_verified,id_verification_method,verification_status,verification_rejection_reason').eq('id', effectiveId).single()
        if (error) throw error; if (!active) return
        setSafetyProfile({ avatar_url: data.avatar_url, selfie_url: data.selfie_url, id_document_url: data.id_document_url, id_number: data.id_number, id_verified: data.id_verified, is_verified: data.is_verified })
        setVerificationStatus(data.verification_status || 'not_started'); setVerificationRejectionReason(data.verification_rejection_reason || ''); setSafetyIdNumber(data.id_number || ''); if (data.id_verification_method === 'id_number') setSafetyIdMethod('id_number')
      } catch (error) { if (!active) return; setVerificationError('Could not load safety verification: ' + errMsg(error)) } finally { if (active) setVerificationLoaded(true) }
    }
    void loadPassengerVerification(); return () => { active = false }
  }, [profile.id])
  useEffect(() => {
    if (!cameraDocument) return; let active = true; setCameraReady(false); setCameraError('')
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Camera access is not available in this browser.'); return }
    void navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: cameraDocument.facingMode } }).then(stream => {
      if (!active) { stream.getTracks().forEach(track => track.stop()); return }; cameraStreamRef.current = stream; setCameraReady(true)
      if (cameraVideoRef.current) { cameraVideoRef.current.srcObject = stream; void cameraVideoRef.current.play().catch(error => { setCameraError('Could not start the camera preview: ' + errMsg(error)) }) }
    }).catch(error => { if (active) setCameraError('Could not access the camera: ' + errMsg(error)) })
    return () => { active = false; cameraStreamRef.current?.getTracks().forEach(track => track.stop()); cameraStreamRef.current = null }
  }, [cameraDocument])
  useEffect(() => {
    let active = true
    async function loadFareCategories() {
      try {
        const categoryResult = await supabase.from('fare_categories').select('id,label,active').eq('active', true)
        if (!active) return
        if (!categoryResult.error && categoryResult.data && categoryResult.data.length > 0) {
          const iconById = Object.fromEntries(CATEGORIES.map(category => [category.id, category.icon])); const activeCategories = categoryResult.data.map(category => ({ id: category.id, name: category.label, icon: iconById[category.id] || '🚗' }))
          setCategories(activeCategories); setSelectedCat(current => activeCategories.some(category => category.id === current) ? current : activeCategories[0].id)
        }
      } catch { setCategories(CATEGORIES) } finally { if (active) { setPricingReady(true); setRideError('') } }
    }
    void loadFareCategories(); return () => { active = false }
  }, [])
  useEffect(() => () => { if (mapAddressTimeout.current) clearTimeout(mapAddressTimeout.current); if (pickupDebounce.current) clearTimeout(pickupDebounce.current); if (dropoffDebounce.current) clearTimeout(dropoffDebounce.current); if (cancelledRideTimer.current) clearTimeout(cancelledRideTimer.current) }, [])
  useEffect(() => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    supabase.from('driver_status').select('*').eq('is_online', true).gt('updated_at', fiveMinAgo).then(({ data }) => { if (data) setNearbyCars(data) })
    const ch = createRealtimeChannel('buddyride-cars-live').on('postgres_changes', { event: '*', schema: 'public', table: 'driver_status' }, (payload) => {
      const car = payload.new as any; if (!car) return
      if (car.updated_at && new Date(car.updated_at).getTime() < Date.now() - 5 * 60 * 1000) { setNearbyCars(prev => prev.filter(c => c.driver_id !== car.driver_id)); return }
      if (car.is_online) { setNearbyCars(prev => { const exists = prev.find(c => c.driver_id === car.driver_id); return exists ? prev.map(c => c.driver_id === car.driver_id ? car : c) : [...prev, car] }) } else { setNearbyCars(prev => prev.filter(c => c.driver_id !== car.driver_id)) }
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])
  useEffect(() => {
    let active = true
    navigator.geolocation.getCurrentPosition(async pos => {
      if (!active) return; const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]; setLocation(p); setPickupCoords(p)
      try { const real = await reverseOSM(p); if (active) setPickup(real) } catch { if (active) setPickup('My Location - Polokwane') }
    })
    async function loadActiveRide() {
      const { data: { user } } = await supabase.auth.getUser(); const effectiveId = user?.id || profile.id
      const { data: activeRide, error: activeRideError } = await supabase.from('rides').select('*').eq('passenger_id', effectiveId).in('status', ['searching', 'driver_assigned', 'accepted', 'arrived', 'picked_up', 'en_route', 'in_progress', 'on_trip', 'driving_to_destination', 'awaiting_payment'] as any).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (activeRideError) { if (active) setRideError('Could not restore your active ride: ' + errMsg(activeRideError)); return }
      const { data: completedRideData, error: completedRideError } = activeRide ? { data: null, error: null } as any : await supabase.from('rides').select('*').eq('passenger_id', effectiveId).eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (completedRideError) { if (active) setRideError('Could not restore your pending rating: ' + errMsg(completedRideError)); return }
      const data = activeRide || completedRideData
      if (active && data) {
        prevStatusRef.current = data.status
        if (data.status === 'completed') { const alreadyRated = (data as any).passenger_rating != null || (data as any).rating != null; if (alreadyRated) return; handleRideCompleted(data as Ride) }
        else { setRide(data as Ride); setSheetSnap(data.status === 'completed' ? 90 : 50) }
      }
    }
    void loadActiveRide(); return () => { active = false }
  }, [profile.id])
  useEffect(() => {
    if (!ride?.driver_id) { setDriverProfile(null); return }; let active = true; setDriverProfile(null)
    async function loadDriverDetails() {
      const [{ data: driver, error: driverError }, { data: car, error: carError }] = await Promise.all([
        supabase.from('profiles').select('full_name, avatar_url, phone, phone_number, rating').eq('id', ride!.driver_id!).maybeSingle(),
        supabase.from('driver_profiles').select('car_make, car_model, car_color, license_plate, rating').eq('user_id', ride!.driver_id!).maybeSingle(),
      ])
      if (!active) return
      if (driverError) console.error('Could not load driver profile:', driverError.message)
      if (carError) console.error('Could not load driver vehicle details:', carError.message)
      setDriverProfile({ id: ride!.driver_id!, role: 'driver', email: null, full_name: driver?.full_name || 'Driver', avatar_url: driver?.avatar_url ?? null, phone: driver?.phone ?? null, phone_number: driver?.phone_number ?? driver?.phone ?? null, rating: car?.rating ?? driver?.rating ?? null, car_make: car?.car_make ?? null, car_model: car?.car_model ?? car?.car_make ?? null, car_color: car?.car_color ?? null, license_plate: car?.license_plate ?? null, car_plate: car?.license_plate ?? null } as any)
    }
    void loadDriverDetails(); return () => { active = false }
  }, [ride?.id, ride?.driver_id])
  useEffect(() => {
    if (!ride) return
    const handleUpdate = (p: any) => {
      const newR = p.new as any; if (!newR) return
      const oldStatus = prevStatusRef.current; const newStatus = newR.status
      if (newStatus === 'rated') { setCompletedReceipt(newR as Ride); setCompletedRide(null); clearActiveRideState(); setRating(0); setRatingComment(''); setSheetSnap(50); prevStatusRef.current = newStatus; return }
      if (newStatus === 'completed') { playSound('complete'); prevStatusRef.current = newStatus; handleRideCompleted(newR as Ride); return }
      if (newStatus === 'cancelled' && newR.cancelled_by === 'driver') {
        playSound('cancel'); setCancelledNotification('Driver cancelled: ' + (newR.cancel_reason || 'No reason'))
        if (cancelledRideTimer.current) clearTimeout(cancelledRideTimer.current)
        cancelledRideTimer.current = setTimeout(() => { setCancelledNotification(null); clearActiveRideState(); setCompletedRide(null); setSheetSnap(50); cancelledRideTimer.current = null }, 5000) as any
        prevStatusRef.current = newStatus; return
      } else {
        if (oldStatus !== newStatus) {
          if (newStatus === 'accepted' || newStatus === 'driver_assigned') playSound('accept')
          else if (newStatus === 'arrived') playSound('arrived')
          else if (['picked_up', 'in_progress', 'en_route', 'on_trip', 'driving_to_destination'].includes(newStatus as any)) playSound('start')
          else if (newStatus === 'completed') playSound('complete')
        }
      }
      prevStatusRef.current = newStatus; setRide(newR as Ride)
    }
    const ch = createRealtimeChannel('ride-' + ride.id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: 'id=eq.' + ride.id }, handleUpdate).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [ride?.id])

  function onPickupChange(val: string) { setPickup(val); setPickupCoords(null); setDistance(null); setPrice(null); setShowEstimate(false); if (pickupDebounce.current) clearTimeout(pickupDebounce.current); pickupDebounce.current = setTimeout(() => searchPlaces(val, setPickupSuggestions, setShowPickupSug), 300) }
  function onDropoffChange(val: string) { setDropoff(val); setDropoffCoords(null); setDistance(null); setPrice(null); setShowEstimate(false); if (dropoffDebounce.current) clearTimeout(dropoffDebounce.current); dropoffDebounce.current = setTimeout(() => searchPlaces(val, setDropoffSuggestions, setShowDropoffSug), 300) }
  function selectPickupSuggestion(item: any) { setPickup(item.place_name); setPickupCoords([item.center[0], item.center[1]]); setDistance(null); setPrice(null); setShowEstimate(false); setRoute(undefined); setRideError(''); setShowPickupSug(false); setPinTarget('dropoff') }
  function selectDropoffSuggestion(item: any) { setDropoff(item.place_name); setDropoffCoords([item.center[0], item.center[1]]); setDistance(null); setPrice(null); setShowEstimate(false); setRoute(undefined); setRideError(''); setShowDropoffSug(false); setSheetSnap(90) }
  function onMapMove(coords: [number, number]) {
    setIsMapMoving(true); setShowEstimate(false); setDistance(null); setPrice(null); setRoute(undefined)
    if (pinTarget === 'pickup') {
      setPickupCoords(coords); setShowPickupSug(false)
      if (mapAddressTimeout.current) clearTimeout(mapAddressTimeout.current)
      const requestId = ++pickupAddressRequest.current
      mapAddressTimeout.current = setTimeout(async () => { const address = await reverseOSM(coords); if (requestId === pickupAddressRequest.current) { setPickup(address); setIsMapMoving(false) } }, 250) as any
    } else {
      setDropoffCoords(coords); setShowDropoffSug(false)
      if (mapAddressTimeout.current) clearTimeout(mapAddressTimeout.current)
      const requestId = ++dropoffAddressRequest.current
      mapAddressTimeout.current = setTimeout(async () => { const address = await reverseOSM(coords); if (requestId === dropoffAddressRequest.current) { setDropoff(address); setIsMapMoving(false) } }, 250) as any
    }
  }
  async function ensureCoords() {
    let pCoords = pickupCoords; let dCoords = dropoffCoords
    if (!pCoords && pickup.trim()) { pCoords = await geocodeAddress(pickup); if (pCoords) setPickupCoords(pCoords) }
    if (!dCoords && dropoff.trim()) { dCoords = await geocodeAddress(dropoff); if (dCoords) setDropoffCoords(dCoords) }
    if (!pCoords && /my location/i.test(pickup)) { pCoords = location; setPickupCoords(pCoords) }
    return { pCoords, dCoords }
  }
  async function calculateEstimate() {
    if (!dropoff) { setRideError('Enter a destination before estimating your fare.'); return }
    setLoading(true)
    try {
      const { pCoords, dCoords } = await ensureCoords()
      if (!pCoords || !dCoords) { setRideError('Choose valid pickup and destination locations.'); return }
      setRideError(''); setPickupCoords(pCoords); setDropoffCoords(dCoords)
      let distKm = 0; let durMin = 5; let geometry: any = undefined
      if (TOMTOM_KEY) {
        const res = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${pCoords[1]},${pCoords[0]}:${dCoords[1]},${dCoords[0]}/json?key=${TOMTOM_KEY}&traffic=true`)
        const data = await res.json(); const r = data.routes?.[0]
        if (r) { distKm = r.summary.lengthInMeters / 1000; durMin = Math.round(r.summary.travelTimeInSeconds / 60); geometry = r.legs?.[0]?.points }
      }
      if (distKm === 0) throw new Error('No route found')
      const quote = calculateFare(distKm, durMin, selectedCat)
      setRoute(geometry); setDistance(quote.distanceKm); setDuration(quote.durationMin); setPrice(quote.fare); setShowEstimate(true)
    } catch (error) { setShowEstimate(false); setRideError('Could not calculate fare: ' + errMsg(error)) } finally { setLoading(false) }
  }
  async function useMyLocation() {
    navigator.geolocation.getCurrentPosition(async pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p); setPickupCoords(p); setDistance(null); setPrice(null); setShowEstimate(false); setPinTarget('pickup')
      const real = await reverseOSM(p); setPickup(real); setRideError('')
    }, error => setRideError('Could not access your location: ' + errMsg(error)), { enableHighAccuracy: true, timeout: 10000 })
  }
  async function requestRide() {
    if (!verificationLoaded) { setRideError('Safety verification is still loading. Please try again.'); return }
    if (!pickup.trim() || !dropoff.trim()) { setRideError('Choose a pickup and destination from the location suggestions.'); return }
    const { data: { user } } = await supabase.auth.getUser(); const effectiveId = user?.id || profile.id
    const { data: passengerProfile } = await supabase.from('profiles').select('verification_status,is_verified,is_banned').eq('id', effectiveId).single()
    if (passengerProfile?.is_banned) { setRideError('Your account is banned - contact support on 064 101 8991'); return }
    const isVerifiedRider = passengerProfile?.is_verified === true || ['verified','approved'].includes(passengerProfile?.verification_status || '')
    if (!isVerifiedRider) {
      const hour = new Date().getHours()
      if (hour >= 20 || hour < 5) { setRideError('Night rides (20:00-05:00) need Verified Badge. Tap the blue banner to upload Selfie + SA ID.'); setShowSafetyModal(true); return }
      if (selectedCat === 'buddy_xl' || selectedCat === 'buddy_comfort') { setRideError('XL & Comfort need Verified Badge. Go is available now, or verify to unlock.'); return }
    }
    await createRide(isVerifiedRider)
  }
  // FIXED 100% - NO fare_quotes, NO total_fare, SIMPLE rides INSERT - ALWAYS searching for launch
  async function createRide(isVerifiedRider?: boolean) {
    setLoading(true); setRideError('')
    try {
      const { pCoords, dCoords } = await ensureCoords()
      if (!pCoords || !dCoords || !pickup.trim() || !dropoff.trim()) throw new Error('Choose a pickup and destination from the location suggestions.')
      let geometry2: any = undefined; let distKm2 = 0; let durMin2 = 5
      if (TOMTOM_KEY) {
        try {
          const res = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${pCoords[1]},${pCoords[0]}:${dCoords[1]},${dCoords[0]}/json?key=${TOMTOM_KEY}&traffic=true`)
          const d = await res.json(); const r = d.routes?.[0]
          if (r) { distKm2 = r.summary.lengthInMeters / 1000; durMin2 = Math.round(r.summary.travelTimeInSeconds / 60); geometry2 = r.legs?.[0]?.points }
        } catch {}
      }
      if (distKm2 === 0) {
        const R = 6371; const dLat = (dCoords[1]-pCoords[1])*Math.PI/180; const dLon = (dCoords[0]-pCoords[0])*Math.PI/180
        const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(pCoords[1]*Math.PI/180)*Math.cos(dCoords[1]*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2)
        distKm2 = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); durMin2 = Math.max(5, Math.round(distKm2 * 2.5))
      }
      const quote = calculateFare(distKm2, durMin2, selectedCat)
      const verified = isVerifiedRider ?? (safetyProfile.is_verified === true || ['verified','approved'].includes(verificationStatus))
      if (!verified && quote.fare > 150) { setRideError(`Unverified riders limited to R150. This trip is R${quote.fare.toFixed(0)} — Get Verified to unlock, or choose a shorter trip.`); setLoading(false); return }
      setDistance(quote.distanceKm); setDuration(quote.durationMin); setPrice(quote.fare); setRoute(geometry2)
      const { data: { user } } = await supabase.auth.getUser(); const effectiveId = user?.id || profile.id
      console.log('Creating ride with fare:', quote.fare, 'dist:', quote.distanceKm)
      // FIXED 100% FOR LAUNCH: Always searching - Paystack handled later via Edge Function
      const { data, error } = await supabase.from('rides').insert({
        passenger_id: effectiveId, pickup_lat: pCoords[1], pickup_lng: pCoords[0], pickup_address: pickup,
        dropoff_lat: dCoords[1], dropoff_lng: dCoords[0], dropoff_address: dropoff,
        status: 'searching',
        fare: quote.fare, distance_km: quote.distanceKm, duration_min: quote.durationMin,
        payment_method: paymentMethod, ride_category: selectedCat
      } as any).select().single()
      if (error) { console.error('RIDE INSERT FAILED:', JSON.stringify(error, null, 2)); throw error }
      console.log('Ride created:', data.id); setRide(data as Ride); setSheetSnap(50); prevStatusRef.current = data.status
      // TODO: Enable Paystack later - for now keep searching so driver sees ride
      if (paymentMethod === 'paystack') {
        console.log('Paystack selected - ride is searching, will handle payment after driver accepts (v2)')
      }
    } catch (error) { console.error('createRide error:', error); setRideError(errMsg(error)) } finally { setLoading(false) }
  }
  async function verifyAndRequestRide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setVerificationError('')
    if (!safetyProfile.avatar_url) { setVerificationError('Take a selfie before continuing.'); return }
    const trimmedIdNumber = safetyIdNumber.trim(); const idDocumentUrl = safetyProfile.id_document_url
    if (safetyIdMethod === 'id_photo' && !idDocumentUrl) { setVerificationError('Take a photo of your SA ID or passport before continuing.'); return }
    if (safetyIdMethod === 'id_number') {
      if (!trimmedIdNumber) { setVerificationError('Enter your ID number or passport number.'); return }
      if (/^\d{13}$/.test(trimmedIdNumber) && !isValidSAID(trimmedIdNumber)) { setVerificationError('Enter a valid 13-digit South African ID number.'); return }
    }
    setLoading(true)
    try {
      const { error } = await supabase.rpc('verify_passenger_safety', { p_method: safetyIdMethod, p_id_number: safetyIdMethod === 'id_number' ? trimmedIdNumber : null, p_id_document_url: safetyIdMethod === 'id_photo' ? idDocumentUrl : null })
      if (error) throw error
      setSafetyProfile(current => ({ ...current, id_number: safetyIdMethod === 'id_number' ? trimmedIdNumber : null, id_document_url: safetyIdMethod === 'id_photo' ? idDocumentUrl : null, id_verified: false, is_verified: false }))
      setVerificationStatus('pending_verification'); setVerificationLoaded(true); setShowSafetyModal(false)
      setRideError('✅ Selfie + ID submitted! You can still ride now (Go, up to R150, daytime). We will WhatsApp you when Verified Badge is ready.')
    } catch (error) { setVerificationError('Could not verify your safety details: ' + errMsg(error)) } finally { setLoading(false) }
  }
  async function cancelRide() {
    if (!ride) return; if (!cancelReason) { setShowCancelReason(true); return }
    const rideId = ride.id; const { data: cancelledRide, error } = await updateRide(rideId, { status: 'cancelled', cancel_reason: cancelReason, cancelled_at: new Date().toISOString(), cancelled_by: 'passenger' } as any).select('id').maybeSingle()
    if (error) { setRideError('Could not cancel ride: ' + errMsg(error)); return }
    if (!cancelledRide) { setRideError('This ride is no longer available to cancel.'); return }
    setShowCancelReason(false); setRoute(undefined); setDriverProfile(null); setShowEstimate(false); setRide(null); setShowChat(false); setSheetSnap(50); setCancelReason('')
  }
  async function finishTrip() {
    const finishedRide = completedRide || completedReceipt; if (!finishedRide) return; if (rating === 0 || !finishedRide.driver_id) return
    const { error } = await supabase.rpc('submit_ride_rating', { p_ride_id: finishedRide.id, p_rating: rating, p_comment: ratingComment.trim() || null })
    const alreadyRated = error && (error.code === '23505' || /already rated/i.test(error.message || ''))
    if (error && !alreadyRated) { setRideError('Could not submit rating: ' + errMsg(error)); return }
    if (alreadyRated) alert('Already rated')
    setCompletedReceipt(null); setCompletedRide(null); clearActiveRideState(); setSheetSnap(50); setRating(0); setRatingComment('')
  }
  const sugStyle = (dark: boolean) => ({ position: 'absolute' as const, top: '58px', left: 0, right: 0, zIndex: 9999, background: dark ? '#2a2a2a' : 'white', border: '1px solid ' + (dark ? '#444' : '#ddd'), borderRadius: '12px', maxHeight: '220px', overflowY: 'auto' as const })
  const sugItemStyle = (dark: boolean) => ({ padding: '12px 14px', borderBottom: '1px solid ' + (dark ? '#333' : '#eee'), cursor: 'pointer', fontSize: '14px', color: dark ? 'white' : 'black' })
  function clearActiveRideState() { setRide(null); setDriverProfile(null); setRoute(undefined); setShowChat(false); setShowCancelReason(false); setCancelReason(''); setPickup(''); setDropoff(''); setPickupCoords(null); setDropoffCoords(null); setDistance(null); setPrice(null); setShowEstimate(false); setRideError(''); setRating(0); setRatingComment(''); setSheetSnap(90); setPinTarget('pickup') }
  function handleRideCompleted(finishedRide: Ride) { setCompletedRide(finishedRide); clearActiveRideState() }
  async function uploadPassengerVerification(document: PassengerSafetyCapture, photo: Blob) {
    setVerificationUploadType(document.type); setVerificationError(''); let uploadedPath: string | null = null; let uploadedBucket = ''
    try {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error('Not logged in - please log in again'); const ownerId = user.id
      const bucket = document.type === 'passenger_selfie' ? 'passenger-photos' : 'passenger-ids'; uploadedBucket = bucket
      let blobToUpload: Blob = photo; try { blobToUpload = await compress(photo) } catch { blobToUpload = photo }
      const path = `${ownerId}/${document.type}-${safeUUID()}.jpg`; uploadedPath = path
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blobToUpload, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) throw new Error(`Storage: ${uploadError.message}`)
      const storageRef = `${bucket}:${path}`; const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path); const publicUrl = urlData.publicUrl
      const savedValue = publicUrl && publicUrl.startsWith('https://') ? publicUrl : storageRef; const idSavedValue = document.type === 'passenger_id' ? storageRef : savedValue
      const profileField = document.type === 'passenger_selfie' ? { selfie_url: savedValue, avatar_url: savedValue } : { id_document_url: idSavedValue }
      const { error: saveError } = await supabase.from('profiles').update(profileField).eq('id', ownerId)
      if (saveError) { await supabase.storage.from(bucket).remove([path]).catch(()=>{}); throw new Error(`DB: ${saveError.message}`) }
      setSafetyProfile(current => document.type === 'passenger_selfie' ? { ...current, selfie_url: savedValue, avatar_url: savedValue } : { ...current, id_document_url: idSavedValue })
      if (document.type === 'passenger_id') setSafetyIdMethod('id_photo')
    } catch (error) {
      if (uploadedPath && uploadedBucket) await supabase.storage.from(uploadedBucket).remove([uploadedPath]).catch(()=>{})
      const message = error instanceof Error ? error.message : errMsg(error); setVerificationError('Could not upload verification photo: ' + message); setUploadToast(message)
      if (uploadToastTimer.current) window.clearTimeout(uploadToastTimer.current); uploadToastTimer.current = window.setTimeout(() => setUploadToast(''), 4000) as any
    } finally { setVerificationUploadType(null) }
  }
  function closeVerificationCamera() { cameraStreamRef.current?.getTracks().forEach(track => track.stop()); cameraStreamRef.current = null; setCameraDocument(null); setCameraError(''); setCameraReady(false) }
  async function captureVerificationPhoto() {
    const video = cameraVideoRef.current; const verificationDocument = cameraDocument
    if (!video || !verificationDocument || !video.videoWidth || !video.videoHeight) { setCameraError('Camera is not ready yet. Please wait and try again.'); return }
    const canvas = window.document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; const context = canvas.getContext('2d')
    if (!context) { setCameraError('Could not capture the photo. Please try again.'); return }
    context.drawImage(video, 0, 0, canvas.width, canvas.height); const photo = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!photo) { setCameraError('Could not capture the photo. Please try again.'); return }
    closeVerificationCamera(); await uploadPassengerVerification(verificationDocument, photo)
  }
  function playSound(type: 'accept' | 'arrived' | 'start' | 'complete' | 'cancel' = 'accept') {
    const sounds: any = { accept: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c8b9d2.mp3?filename=success-1-6297.mp3', arrived: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c8b9d2.mp3?filename=notification-2-269292.mp3', start: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_1d171a2a6f.mp3?filename=notification-sound-7062.mp3', complete: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c8b9d2.mp3?filename=success-1-6297.mp3', cancel: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c8b9d2.mp3?filename=notification-sound-7062.mp3' }
    try { const audio = new Audio(sounds[type]); audio.volume = 1.0; audio.play().catch(() => {}) } catch {}; if ('vibrate' in navigator) { if (type === 'arrived') navigator.vibrate([200, 100, 200, 100, 400]); else if (type === 'cancel') navigator.vibrate([500, 200, 500]); else navigator.vibrate(300) }
  }
  return <div className={'ride-app ride-app--' + theme} style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    {uploadToast && <div role="alert" style={{ position: 'fixed', left: 16, right: 16, bottom: 24, zIndex: 100002, margin: '0 auto', maxWidth: 480, padding: '12px 16px', borderRadius: 10, background: '#b91c1c', color: 'white', fontWeight: 700 }}>Verification photo upload failed: {uploadToast}</div>}
    {!isVerified && verificationStatus === 'pending_verification' && <div role="status" style={{ position: 'absolute', top: 68, left: 12, right: 12, zIndex: 80, padding: '11px 14px', borderRadius: 12, background: BLUE_LIGHT, color: BLUE_DARK, border: '1px solid #B2CCFF', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>⏳ Verification pending — You can still ride now (Go, R150 max, daytime).</div>}
    {!isVerified && verificationStatus !== 'pending_verification' && !ride && !completedRide && !completedReceipt && <div onClick={() => setShowSafetyModal(true)} role="button" style={{ position: 'absolute', top: 68, left: 12, right: 12, zIndex: 80, padding: '11px 14px', borderRadius: 12, background: BLUE, color: 'white', fontSize: 13, fontWeight: 800, textAlign: 'center', cursor: 'pointer' }}>🔓 Get Verified Badge — Selfie + SA ID → Unlock Night + XL + No Limit</div>}
    {showSafetyModal && !isVerified && <PassengerSafetyModal dark={isDark} avatarUrl={safetyProfile.selfie_url || safetyProfile.avatar_url} idDocumentUrl={safetyProfile.id_document_url} idNumber={safetyIdNumber} idMethod={safetyIdMethod} paymentMethod={paymentMethod} loading={loading} uploading={verificationUploadType !== null} error={verificationError} onIdNumberChange={setSafetyIdNumber} onIdMethodChange={setSafetyIdMethod} onPaymentMethodChange={setPaymentMethod} onOpenCamera={type => setCameraDocument(type === 'passenger_selfie' ? PASSENGER_SAFETY_CAPTURES[0] : PASSENGER_SAFETY_CAPTURES[1])} onSubmit={event => { void verifyAndRequestRide(event) }} onClose={() => setShowSafetyModal(false)} />}
    {cameraDocument && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 100002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: 'rgba(0,0,0,.88)' }}>
      <section style={{ width: '100%', maxWidth: 480, padding: 16, borderRadius: 18, background: bg, color: text }}>
        <h2 style={{ margin: '0 0 12px' }}>{cameraDocument.action}</h2>
        <video ref={cameraVideoRef} autoPlay playsInline muted style={{ display: 'block', width: '100%', maxHeight: '60vh', borderRadius: 12, background: '#111', objectFit: 'cover' }} />
        {cameraError && <p role="alert" style={{ color: '#dc2626', fontSize: 13 }}>{cameraError}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="button" onClick={closeVerificationCamera} style={{ flex: 1, padding: 13, borderRadius: 12, border: '1px solid ' + border, background: bg2, color: text }}>Cancel</button>
          <button type="button" onClick={() => void captureVerificationPhoto()} disabled={!cameraReady} style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', background: cameraReady ? BLUE : '#555', color: 'white', fontWeight: 700 }}>Capture photo</button>
        </div>
      </section>
    </div>}
    <header className="ride-header" style={{ zIndex: 100, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: bg, color: text, borderBottom: '1px solid ' + border }}>
      <PassengerNavigationMenu profile={profile} theme={theme} onThemeChange={setTheme} onSignOut={() => { void supabase.auth.signOut() }} verificationStatus={verificationStatus} verificationRejectionReason={verificationRejectionReason} onReuploadVerification={() => { setVerificationError(''); setShowSafetyModal(true) }} />
      <strong>BuddyRide<br />{profile.full_name || 'Passenger'} {isVerified ? '✅' : ''}</strong>
      <div style={{ marginLeft: 'auto' }}><button onClick={() => setTheme(isDark ? 'light' : 'dark')} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: '1px solid ' + border }}>{isDark ? '☀️' : '🌙'}</button></div>
    </header>
    {cancelledNotification && (<div style={{ position: 'fixed', top: '70px', left: '12px', right: '12px', zIndex: 99999, background: '#ff3b30', borderRadius: '16px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '24px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>❌</div>
      <div style={{ flex: 1 }}><div style={{ color: 'white', fontWeight: '900' }}>Driver Cancelled Trip!</div><div style={{ color: 'white', fontSize: '13px' }}>{cancelledNotification}</div></div>
      <button onClick={() => setCancelledNotification(null)} style={{ background: 'white', color: '#ff3b30', border: 'none', borderRadius: '20px', padding: '8px 14px', fontWeight: 'bold' }}>OK</button>
    </div>)}
    <div style={{ position: 'absolute', inset: '60px 0 0 0', zIndex: 1 }}>
      <Suspense fallback={<div aria-label="Loading map" style={{ width: '100%', height: '100%', background: bg2 }} />}>
        <OsmMapView center={pickupCoords || location} route={route} driverLocation={liveDriverLocation?.coordinates || (driverProfile?.current_lat != null && driverProfile.current_lng != null ? [driverProfile.current_lng, driverProfile.current_lat] : undefined)} availableCars={nearbyCars as any} theme={theme} onMapMove={ride || completedRide || completedReceipt ? undefined : onMapMove} />
      </Suspense>
      {!ride && !completedRide && !completedReceipt && <>
        <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 300, transform: `translate(-50%, -100%) translateY(${isMapMoving ? -8 : 0})`, fontSize: '34px', lineHeight: 1, pointerEvents: 'none', transition: 'transform 0.15s' }}>{pinTarget === 'pickup' ? '📍' : '🏁'}</div>
        <div style={{ position: 'absolute', left: '50%', top: 'calc(50% + 8px)', transform: 'translateX(-50%)', zIndex: 300, pointerEvents: 'none', background: pinTarget === 'pickup' ? BLUE : '#ef4444', color: 'white', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{pinTarget === 'pickup' ? 'PIN: PICKUP — drag map' : 'PIN: DROP-OFF — drag map'}</div>
      </>}
      <button aria-label="Center map on my location" onClick={useMyLocation} style={{ position: 'absolute', right: '16px', bottom: '100px', zIndex: 400, width: '48px', height: '48px', borderRadius: '24px', background: BLUE, color: 'white', border: 'none', fontSize: '22px' }}>📍</button>
    </div>
    <div style={{ position: 'absolute', inset: 'auto 0 0', height: '90dvh', zIndex: 60 }}>
      <BottomSheet snapPoint={sheetSnap} onSnapChange={setSheetSnap} theme={theme} fitToSnap>
        {!ride && !completedRide && !completedReceipt && (<>
          <h2 style={{ margin: '0 0 12px' }}>Where are you going? {profile.full_name ? 'Hi ' + profile.full_name.split(' ')[0] : ''} {isVerified ? '✅ Verified' : '⚠️ Get Verified'}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setPinTarget('pickup')} style={{ flex: 1, padding: '9px', borderRadius: 999, border: pinTarget === 'pickup' ? `2px solid ${BLUE}` : '1px solid ' + border, background: pinTarget === 'pickup' ? BLUE_LIGHT : bg2, color: text, fontWeight: 800, fontSize: 12 }}>📍 Set Pickup with Pin</button>
              <button type="button" onClick={() => setPinTarget('dropoff')} style={{ flex: 1, padding: '9px', borderRadius: 999, border: pinTarget === 'dropoff' ? `2px solid #ef4444` : '1px solid ' + border, background: pinTarget === 'dropoff' ? (isDark ? '#7f1d1d' : '#fee2e2') : bg2, color: text, fontWeight: 800, fontSize: 12 }}>🏁 Set Dropoff with Pin</button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: muted }}>Tip: Powered by TomTom + OSM. Type townships — TomTom finds them.</p>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={pickup} onFocus={() => setPinTarget('pickup')} onChange={e => onPickupChange(e.target.value)} placeholder="Pickup - My Location" style={{ flex: 1, height: 44, minHeight: 44, marginTop: 0, padding: '14px', borderRadius: '14px', border: pinTarget === 'pickup' ? `2px solid ${BLUE}` : '1px solid ' + border, background: bg2, color: text, boxSizing: 'border-box' }} />
                <button onClick={useMyLocation} style={{ width: '52px', borderRadius: '14px', background: BLUE, border: 'none', fontSize: '20px' }}>📍</button>
              </div>
              {showPickupSug && <div style={sugStyle(isDark) as any}>{pickupSuggestions.map((s, i) => (<div key={i} onClick={() => selectPickupSuggestion(s)} style={sugItemStyle(isDark)}>📍 {s.place_name}</div>))}</div>}
            </div>
            <div style={{ position: 'relative' }}>
              <input value={dropoff} onFocus={() => setPinTarget('dropoff')} onChange={e => onDropoffChange(e.target.value)} placeholder="Destination - Moletji, Mankweng..." style={{ width: '100%', height: 44, minHeight: 44, marginTop: 0, padding: '14px', borderRadius: '14px', border: pinTarget === 'dropoff' ? `2px solid #ef4444` : '1px solid ' + border, background: bg2, color: text, boxSizing: 'border-box' }} />
              {showDropoffSug && <div style={sugStyle(isDark) as any}>{dropoffSuggestions.map((s, i) => (<div key={i} onClick={() => selectDropoffSuggestion(s)} style={sugItemStyle(isDark)}>📍 {s.place_name}</div>))}</div>}
            </div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
              {categories.map(cat => {
                const fare = selectedCat === cat.id && showEstimate ? price : null; const isSel = selectedCat === cat.id
                const locked = !isVerified && (cat.id === 'buddy_xl' || cat.id === 'buddy_comfort')
                return <button key={cat.id} onClick={() => { if (locked) { setRideError('XL & Comfort need Verified Badge. Go is available now.'); return } setSelectedCat(cat.id); setPrice(null); setShowEstimate(false) }} style={{ minWidth: '95px', padding: '10px', borderRadius: '12px', border: isSel ? `2px solid ${BLUE}` : '1px solid ' + border, background: isSel ? BLUE_LIGHT : bg2, color: text, textAlign: 'left', opacity: locked ? 0.5 : 1 }}><div style={{ fontSize: '20px' }}>{cat.icon} {locked ? '🔒' : ''}</div><div style={{ fontWeight: 'bold', fontSize: '12px', color: text }}>{cat.name}</div>{fare !== null && <div style={{ fontWeight: 'bold', color: BLUE, fontSize: '12px' }}>R {fare}</div>}</button>
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['cash', 'Cash'], ['paystack', 'Card • Paystack']] as const).map(([method, label]) => (
                <button key={method} type="button" onClick={() => setPaymentMethod(method)} aria-pressed={paymentMethod === method} style={{ flex: 1, padding: 12, borderRadius: 12, border: paymentMethod === method ? `2px solid ${BLUE}` : '1px solid ' + border, background: paymentMethod === method ? BLUE_LIGHT : bg2, color: text, fontWeight: 'bold' }}>{label}</button>
              ))}
            </div>
            {rideError && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 13, background: '#fee', padding: 8, borderRadius: 8 }}>{rideError}</p>}
            <div style={{ position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', gap: '10px', padding: '10px 0 calc(10px + env(safe-area-inset-bottom))', background: bg, borderTop: '1px solid ' + border }}>
              <button onClick={calculateEstimate} style={{ flex: 1, minHeight: '52px', padding: '14px', borderRadius: '14px', border: '1px solid ' + border, background: bg2, color: text, fontWeight: 'bold' }}>Estimate</button>
              <button onClick={() => { void requestRide() }} disabled={loading || !verificationLoaded} style={{ flex: 1.5, minHeight: '52px', padding: '14px', borderRadius: '14px', border: 'none', background: loading || !verificationLoaded ? '#555' : BLUE, color: 'white', fontWeight: 'bold', opacity: loading || !verificationLoaded ? 0.6 : 1 }}>
                {loading ? 'Finding…' : !verificationLoaded ? 'Checking safety…' : !isVerified ? 'Request Ride • Get Verified' : 'Request Ride ✓ Verified'}
              </button>
            </div>
            {showEstimate && distance !== null && price !== null && (<div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', background: bg2 }}><span>{distance.toFixed(1)} km {isVerified ? '✅' : '• Unverified max R150'}</span><span style={{ fontWeight: 'bold' }}>R {price.toFixed(0)}</span></div>)}
          </div>
        </>)}
        {/* FIXED 100% - DRIVER INFO + CHAT + STATUS */}
        {ride && <div style={{ padding: 16 }}>
          <h3 style={{margin:'0 0 6px'}}>{ride.status === 'searching' ? '🔍 Finding driver nearby...' : ride.status === 'accepted' || ride.status === 'driver_assigned' ? '🚗 Driver coming to you' : ride.status === 'arrived' ? '📍 Driver arrived!' : ride.status === 'picked_up' || ride.status === 'in_progress' || ride.status === 'en_route' || ride.status === 'on_trip' || ride.status === 'driving_to_destination' ? '🛣️ On trip to destination' : `Ride ${ride.status}`}</h3>
          <p style={{margin:'0 0 8px', color: muted, fontSize:14}}>R {ride.fare} • {ride.payment_method === 'paystack' ? 'Card' : 'Cash'} • {ride.distance_km?.toFixed(1)} km • {ride.ride_category}</p>
          <p style={{margin:'0', fontSize:13}}>From: {ride.pickup_address}</p>
          <p style={{margin:'0 0 12px', fontSize:13}}>To: {ride.dropoff_address}</p>
          {driverProfile && ride.status !== 'searching' && (
            <div style={{display:'flex', gap:12, background: bg2, padding:12, borderRadius:16, marginBottom:12, alignItems:'center'}}>
              <div style={{width:48, height:48, borderRadius:24, background: BLUE, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:20}}>{driverProfile.full_name?.[0] || 'D'}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:900}}>{driverProfile.full_name} • {driverProfile.rating ? Number(driverProfile.rating).toFixed(1) : '5.0'}★</div>
                <div style={{fontSize:12, color: muted}}>{driverProfile.car_color} {driverProfile.car_model || driverProfile.car_make} • {driverProfile.car_plate || driverProfile.license_plate}</div>
                {driverProfile.phone_number && <div style={{fontSize:12, color: BLUE}}>{driverProfile.phone_number}</div>}
              </div>
              <button onClick={()=>setShowChat(true)} style={{width:44, height:44, borderRadius:22, background: BLUE, border:'none', fontSize:20, color:'white'}}>💬</button>
            </div>
          )}
          {ride.status === 'searching' && <p>We found you nearby drivers — hang tight...</p>}
          {ride.status === 'arrived' && <div style={{background: BLUE_LIGHT, color: BLUE_DARK, padding:12, borderRadius:12, fontWeight:700, textAlign:'center'}}>Driver arrived at pickup — Go outside</div>}
          <div style={{display:'flex', gap:8, marginTop:12}}>
            <button onClick={()=>setShowChat(true)} style={{flex:1, padding:12, borderRadius:12, border:'1px solid '+border, background:bg2, color:text, fontWeight:'bold'}}>💬 Chat</button>
            <button onClick={() => { setCancelReason('Changed mind'); void cancelRide() }} style={{ flex:1, padding: 12, background: '#ff3b30', color: 'white', borderRadius: 12, border: 'none', fontWeight:'bold' }}>Cancel Ride</button>
          </div>
          {showCancelReason && <div style={{marginTop:12}}><p>Why cancel?</p>{['Changed mind','Driver taking long','Found another ride','Wrong pickup'].map(r=><button key={r} onClick={()=>{setCancelReason(r); setShowCancelReason(false); void cancelRide()}} style={{width:'100%', textAlign:'left', padding:12, marginBottom:6, borderRadius:12, border:'1px solid '+border, background:bg2, color:text}}>{r}</button>)}</div>}
        </div>}
        {(completedRide || completedReceipt) && (
          <div style={{padding:16, textAlign:'center'}}>
            <div style={{fontSize:48}}>✅</div>
            <h2 style={{margin:'8px 0'}}>Trip Completed!</h2><h1 style={{color: BLUE, margin:'4px 0'}}>R {(completedRide || completedReceipt)?.fare}</h1>
            <p>Rate your driver to continue</p>
            <div style={{display:'flex', gap:4, justifyContent:'center', margin:'12px 0'}}>{[1,2,3,4,5].map(s=>(<button key={s} onClick={()=>setRating(s)} style={{fontSize:48, background:'none', border:'none', color: rating>=s? BLUE:'#444'}}>{rating>=s?'★':'☆'}</button>))}</div>
            <textarea value={ratingComment} onChange={e=>setRatingComment(e.target.value)} placeholder="Comment (optional)" style={{width:'100%', padding:12, borderRadius:12, background:bg2, color:text, boxSizing:'border-box'}} />
            <button onClick={finishTrip} disabled={rating===0} style={{width:'100%', marginTop:12, padding:16, borderRadius:14, background: rating===0?'#666':BLUE, color:'white', border:'none', fontWeight:'bold'}}>{rating===0?'Select Stars':'Submit Rating'}</button>
          </div>
        )}
      </BottomSheet>
    </div>
    {showChat && ride && <div style={{position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end'}}><div style={{background:bg, width:'100%', borderTopLeftRadius:32, borderTopRightRadius:32, height:'75vh', display:'flex', flexDirection:'column'}}><div style={{padding:16, display:'flex', justifyContent:'space-between', borderBottom:'1px solid '+border}}><b>Chat with Driver</b><button onClick={()=>setShowChat(false)} style={{width:36, height:36, borderRadius:18, border:'1px solid '+border, background:bg2, color:text}}>✕</button></div><div style={{flex:1, overflow:'hidden'}}><RideChat rideId={ride.id} myId={profile.id} /></div></div></div>}
  </div>
}