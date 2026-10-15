import { useEffect, useState, useRef } from 'react'
import { OsmMapView } from '../components/OsmMapView'
import { NavigationMenu } from '../components/NavigationMenu'
import { RideChat } from '../components/RideChat'
import { getOSMRoute, reverseOSM } from '../lib/osm'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]

const LOCAL_PLACES = [
  { text: 'Thabo Mbeki Street', place_name: 'Thabo Mbeki Street, Polokwane Central', center: [29.4589, -23.9045] as [number, number] },
  { text: 'Grobler Street', place_name: 'Grobler Street, Polokwane Central', center: [29.4550, -23.9040] as [number, number] },
  { text: 'Church Street', place_name: 'Church Street, Polokwane Central', center: [29.4570, -23.9030] as [number, number] },
  { text: 'Landdros Mare Street', place_name: 'Landdros Mare Street, Polokwane Central', center: [29.4595, -23.9060] as [number, number] },
  { text: 'Hans Van Rensburg Street', place_name: 'Hans Van Rensburg Street, Polokwane', center: [29.4580, -23.9035] as [number, number] },
  { text: 'Bodenstein Street', place_name: 'Bodenstein Street, Polokwane', center: [29.4575, -23.9050] as [number, number] },
  { text: 'Suid Street', place_name: 'Suid Street, Polokwane', center: [29.4600, -23.9070] as [number, number] },
  { text: 'Voortrekker Street', place_name: 'Voortrekker Street, Polokwane', center: [29.4610, -23.9080] as [number, number] },
  { text: 'Market Street', place_name: 'Market Street, Polokwane Central', center: [29.4565, -23.9025] as [number, number] },
  { text: 'Excelsior Street', place_name: 'Excelsior Street, Polokwane', center: [29.4525, -23.9015] as [number, number] },
  { text: 'Munnik Street', place_name: 'Munnik Street, Polokwane', center: [29.4590, -23.9020] as [number, number] },
  { text: 'Compensation Street', place_name: 'Compensation Street, Polokwane', center: [29.4540, -23.9020] as [number, number] },
  { text: 'Magazyn Street', place_name: 'Magazyn Street, Polokwane', center: [29.4560, -23.9048] as [number, number] },
  { text: 'Devenish Street', place_name: 'Devenish Street, Polokwane', center: [29.4530, -23.9055] as [number, number] },
  { text: 'Jorissen Street', place_name: 'Jorissen Street, Polokwane', center: [29.4590, -23.9010] as [number, number] },
  { text: 'Bendor', place_name: 'Bendor, Polokwane', center: [29.4670, -23.8900] as [number, number] },
  { text: 'Flora Park', place_name: 'Flora Park, Polokwane', center: [29.4470, -23.8890] as [number, number] },
  { text: 'Sterpark', place_name: 'Sterpark, Polokwane', center: [29.4650, -23.9120] as [number, number] },
  { text: 'Fauna Park', place_name: 'Fauna Park, Polokwane', center: [29.4350, -23.9150] as [number, number] },
  { text: 'Ladanna', place_name: 'Ladanna, Polokwane', center: [29.4500, -23.8920] as [number, number] },
  { text: 'Ivy Park', place_name: 'Ivy Park, Polokwane', center: [29.4390, -23.8960] as [number, number] },
  { text: 'Mall of the North', place_name: 'Mall of the North, Bendor', center: [29.4395, -23.8885] as [number, number] },
  { text: 'Savannah Mall', place_name: 'Savannah Mall, Fauna Park', center: [29.4422, -23.9042] as [number, number] },
  { text: 'Limpopo Mall', place_name: 'Limpopo Mall, Polokwane CBD', center: [29.4589, -23.9045] as [number, number] },
  { text: 'Makro Polokwane', place_name: 'Makro, Polokwane', center: [29.4521, -23.9145] as [number, number] },
  { text: 'Polokwane Airport', place_name: 'Polokwane International Airport', center: [29.4524, -23.8580] as [number, number] },
  { text: 'Peter Mokaba Stadium', place_name: 'Peter Mokaba Stadium, Magazyn Street, Polokwane', center: [29.4687, -23.9244] as [number, number] },
  { text: 'Seshego', place_name: 'Seshego, Polokwane', center: [29.3900, -23.8600] as [number, number] },
  { text: 'Seshego Zone 1', place_name: 'Seshego Zone 1', center: [29.3850, -23.8520] as [number, number] },
  { text: 'Seshego Zone 2', place_name: 'Seshego Zone 2', center: [29.3880, -23.8550] as [number, number] },
  { text: 'Seshego Zone 3', place_name: 'Seshego Zone 3', center: [29.3920, -23.8580] as [number, number] },
  { text: 'Seshego Zone 4', place_name: 'Seshego Zone 4', center: [29.3900, -23.8600] as [number, number] },
  { text: 'Moletji', place_name: 'Moletji / Moletsi, Polokwane', center: [29.3200, -23.7800] as [number, number] },
  { text: 'Ga-Kolopo', place_name: 'Ga-Kolopo, Moletji', center: [29.3200, -23.7800] as [number, number] },
  { text: 'Mankweng', place_name: 'Mankweng Township, Polokwane', center: [29.7200, -23.8850] as [number, number] },
  { text: 'University of Limpopo', place_name: 'University of Limpopo, Turfloop', center: [29.7400, -23.8800] as [number, number] },
  { text: 'Turfloop', place_name: 'Turfloop, Mankweng', center: [29.7350, -23.8850] as [number, number] },
  { text: 'Lebowakgomo', place_name: 'Lebowakgomo, Limpopo', center: [29.5600, -24.3000] as [number, number] },
  // EXTRA LIMPOPO - REAL
  { text: 'Thohoyandou', place_name: 'Thohoyandou, Vhembe', center: [30.4550, -22.9770] as [number, number] },
  { text: 'Tzaneen', place_name: 'Tzaneen, Mopani', center: [30.1633, -23.8333] as [number, number] },
  { text: 'Giyani', place_name: 'Giyani, Limpopo', center: [30.6921, -23.3022] as [number, number] },
  { text: 'Bela-Bela', place_name: 'Bela-Bela, Waterberg', center: [28.2857, -24.8833] as [number, number] },
  { text: 'Mokopane', place_name: 'Mokopane, Mogalakwena', center: [29.0100, -24.1944] as [number, number] },
  { text: 'Lephalale', place_name: 'Lephalale, Waterberg', center: [27.7419, -23.6667] as [number, number] },
  { text: 'Musina', place_name: 'Musina, Vhembe', center: [30.0385, -22.3396] as [number, number] },
  { text: 'Louis Trichardt', place_name: 'Louis Trichardt, Makhado', center: [29.9058, -23.0422] as [number, number] },
  { text: 'Phalaborwa', place_name: 'Phalaborwa, Mopani', center: [31.1416, -23.9426] as [number, number] },
  { text: 'Burgersfort', place_name: 'Burgersfort, Sekhukhune', center: [30.3200, -24.6670] as [number, number] },
]

const CATEGORIES = [
  { id: 'buddy_go', name: 'Go', icon: '🚗', base: 15, perKm: 7.5, min: 35 },
  { id: 'buddy_comfort', name: 'Comfort', icon: '✨', base: 20, perKm: 9, min: 45 },
  { id: 'buddy_xl', name: 'XL', icon: '🚐', base: 28, perKm: 11, min: 60 },
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
  const [loading, setLoading] = useState(false)
  const [distance, setDistance] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [showEstimate, setShowEstimate] = useState(false)
  const [selectedCat, setSelectedCat] = useState('buddy_go')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('buddy_theme') as any) || 'dark')
  const [rating, setRating] = useState(0)
  const [showCancelReason, setShowCancelReason] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [nearbyCars, setNearbyCars] = useState<any[]>([])
  const [showChat, setShowChat] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(58)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(58)
  const pickupDebounce = useRef<any>(null)
  const dropoffDebounce = useRef<any>(null)
  const [cancelledNotification, setCancelledNotification] = useState<string | null>(null)
  const isDark = theme === 'dark'
  const bg = isDark? '#121212' : '#ffffff'
  const bg2 = isDark? '#1e1e1e' : '#f2f2f2'
  const text = isDark? 'white' : 'black'
  const border = isDark? '#333' : '#ddd'

  function onDragStart(e: any) {
    setIsDragging(true)
    dragStartY.current = e.touches? e.touches[0].clientY : e.clientY
    dragStartH.current = sheetHeight
  }
  function onDragMove(e: any) {
    if (!isDragging) return
    const y = e.touches? e.touches[0].clientY : e.clientY
    const deltaY = y - dragStartY.current
    const deltaVh = (deltaY / window.innerHeight) * 100
    let newH = dragStartH.current - deltaVh
    if (newH < 18) newH = 18
    if (newH > 75) newH = 75
    setSheetHeight(newH)
  }
  function onDragEnd() {
    setIsDragging(false)
    dragStartY.current = 0
    if (sheetHeight < 28) setSheetHeight(18)
    else if (sheetHeight < 52) setSheetHeight(38)
    else setSheetHeight(62)
  }
  function toggleSheet() {
    if (sheetHeight > 40) setSheetHeight(18)
    else setSheetHeight(62)
  }

  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(async pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p); setPickupCoords(p)
      try { const real = await reverseOSM(p); setPickup(real) } catch { setPickup('My Location - Polokwane') }
    })
    async function loadActiveRide() {
      const { data } = await supabase.from('rides').select('*').eq('passenger_id', profile.id).in('status', ['searching','accepted','arrived','picked_up','en_route','in_progress'] as any).order('created_at', { ascending: false }).limit(1).single()
      if (data) { setRide(data as Ride); setSheetHeight(38) }
    }
    loadActiveRide()
  }, [profile.id])

  useEffect(() => {
    supabase.from('driver_status').select('*').eq('is_online', true).then(({data}) => { if(data) setNearbyCars(data) })
    const ch = supabase.channel('buddyride-cars-live')
.on('postgres_changes', { event: '*', schema: 'public', table: 'driver_status' }, (payload) => {
          const car = payload.new as any
          if (!car) return
          if (car.is_online) {
            setNearbyCars(prev => {
              const exists = prev.find(c => c.driver_id === car.driver_id)
              return exists? prev.map(c => c.driver_id === car.driver_id? car : c) : [...prev, car]
            })
          } else {
            setNearbyCars(prev => prev.filter(c => c.driver_id!== car.driver_id))
          }
        }
      ).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    if (ride?.driver_id) supabase.from('profiles').select('*').eq('id', ride.driver_id).single().then(({ data }) => { if (data) setDriverProfile(data as any) })
    else setDriverProfile(null)
  }, [ride?.driver_id])

  useEffect(() => {
    if (!ride) return
    const ch = supabase.channel(`passenger-${ride.id}`)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` }, p => {
        const newR = p.new as any
        if (!newR) return
        // REAL: Driver cancelled notification
        if (newR.status === 'cancelled' && newR.cancelled_by === 'driver') {
          setCancelledNotification(`Driver cancelled: ${newR.cancel_reason || 'No reason'} - R${newR.fare} trip cancelled`)
          setTimeout(() => { setCancelledNotification(null); setRide(null); setRoute(undefined); setDriverProfile(null); setShowChat(false); setSheetHeight(58) }, 5000)
        }
        setRide(newR as Ride)
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [ride?.id])

  function calcFareForCategory(catId: string, km: number) {
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0]
    let fare = cat.base + (km * cat.perKm)
    if (fare < cat.min) fare = cat.min
    if (fare > 350) fare = 350
    return Math.ceil(fare / 5) * 5
  }

  // REAL LIMPOPO SEARCH - local + live OSM
  async function searchPlaces(query: string, setter: any, setShow: any) {
    if (!query || query.trim().length < 2) { setter([]); setShow(false); return }
    const lower = query.toLowerCase()
    let localMatches = LOCAL_PLACES.filter((p:any) => p.text.toLowerCase().includes(lower) || p.place_name.toLowerCase().includes(lower))

    // Show local immediately for fast autocomplete
    if (localMatches.length > 0) {
      setter(localMatches.slice(0,8))
      setShow(true)
    }

    // REAL: Also search OpenStreetMap for ALL Limpopo live
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=za&viewbox=21,-26,32,-22&bounded=0&limit=8&addressdetails=1`)
      const osmData = await res.json()
      const osmPlaces = osmData.map((o:any) => ({
        text: o.display_name.split(',')[0],
        place_name: o.display_name,
        center: [parseFloat(o.lon), parseFloat(o.lat)] as [number, number],
        isOSM: true
      }))
      // Merge local + OSM, remove duplicates
      const merged = [...localMatches,...osmPlaces]
      const unique = Array.from(new Map(merged.map((m:any) => [m.place_name, m])).values())
      setter(unique.slice(0,10))
      setShow(unique.length > 0)
    } catch (e) {
      if (localMatches.length === 0) { setter([]); setShow(false) }
    }
  }

  function onPickupChange(val: string) { setPickup(val); setShowEstimate(false); if (pickupDebounce.current) clearTimeout(pickupDebounce.current); pickupDebounce.current = setTimeout(() => searchPlaces(val, setPickupSuggestions, setShowPickupSug), 300) }
  function onDropoffChange(val: string) { setDropoff(val); setShowEstimate(false); if (dropoffDebounce.current) clearTimeout(dropoffDebounce.current); dropoffDebounce.current = setTimeout(() => searchPlaces(val, setDropoffSuggestions, setShowDropoffSug), 300) }
  function selectPickupSuggestion(item: any) { setPickup(item.place_name); setPickupCoords([item.center[0], item.center[1]]); setShowPickupSug(false) }
  function selectDropoffSuggestion(item: any) { setDropoff(item.place_name); setDropoffCoords([item.center[0], item.center[1]]); setShowDropoffSug(false); setSheetHeight(62) }

  async function ensureCoords() {
    let pCoords = pickupCoords; let dCoords = dropoffCoords
    const findLocal = (name: string) => {
      if (!name) return null; const l = name.toLowerCase()
      return LOCAL_PLACES.find((p:any) => l.includes(p.text.toLowerCase()) || p.text.toLowerCase().includes(l))
    }
    if (!pCoords && pickup) { const local = findLocal(pickup); if (local) pCoords = local.center }
    if (!pCoords) pCoords = location
    if (!dCoords && dropoff) { const local = findLocal(dropoff); if (local) dCoords = local.center }
    if (!dCoords && dropoff) dCoords = [pCoords![0] + 0.018, pCoords![1] + 0.018] as any
    return { pCoords, dCoords }
  }

  async function calculateEstimate() {
    if (!dropoff) { alert('Enter destination'); return }
    const { pCoords, dCoords } = await ensureCoords()
    if (!pCoords ||!dCoords) return
    setPickupCoords(pCoords); setDropoffCoords(dCoords!)
    try { const r = await getOSMRoute(pCoords, dCoords!); setRoute(r.geometry); setDistance(r.distanceKm); setPrice(calcFareForCategory(selectedCat, r.distanceKm)); setShowEstimate(true) } catch { setDistance(2.5); setPrice(calcFareForCategory(selectedCat, 2.5)); setShowEstimate(true) }
  }

  async function useMyLocation() {
    navigator.geolocation.getCurrentPosition(async pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p); setPickupCoords(p)
      const real = await reverseOSM(p); setPickup(real)
    })
  }

  async function requestRide() {
    setLoading(true)
    const { pCoords, dCoords } = await ensureCoords()
    if (!pCoords ||!dCoords) { setLoading(false); return }
    let finalFare = price || calcFareForCategory(selectedCat, 3)
    let finalKm = distance || 2.5
    try { const r = await getOSMRoute(pCoords, dCoords); finalKm = r.distanceKm; finalFare = calcFareForCategory(selectedCat, r.distanceKm) } catch {}
    const { data } = await supabase.from('rides').insert({ passenger_id: profile.id, pickup_lat: pCoords[1], pickup_lng: pCoords[0], pickup_address: pickup, dropoff_lat: dCoords[1], dropoff_lng: dCoords[0], dropoff_address: dropoff, status: 'searching', fare: finalFare, distance_km: finalKm, payment_method: 'cash', ride_category: selectedCat } as any).select().single()
    if (data) {
      setRide(data as Ride); setSheetHeight(35)
      try { await supabase.functions.invoke('dispatch', { body: { ride_id: (data as any).id } }) } catch {}
    }
    setLoading(false)
  }

  async function cancelRide() {
    if (!ride) return
    if (!cancelReason) { setShowCancelReason(true); return }
    const rideId = ride.id
    setShowCancelReason(false); setRoute(undefined); setDriverProfile(null); setShowEstimate(false); setRide(null); setShowChat(false); setSheetHeight(58)
    await supabase.from('rides').update({ status: 'cancelled', cancel_reason: cancelReason, cancelled_at: new Date().toISOString(), cancelled_by: 'passenger' } as any).eq('id', rideId)
    setCancelReason('')
  }

  async function finishTrip() {
    if (!ride) return
    await supabase.from('rides').update({ status: 'rated' as any }).eq('id', ride.id)
    setRide(null); setShowChat(false); setRoute(undefined); setSheetHeight(58)
  }

  const sugStyle = (dark:boolean) => ({ position: 'absolute' as const, top: '58px', left: 0, right: 0, zIndex: 9999, background: dark? '#2a2a2a' : 'white', border: `1px solid ${dark? '#444' : '#ddd'}`, borderRadius: '12px', maxHeight: '220px', overflowY: 'auto' as const })
  const sugItemStyle = (dark:boolean) => ({ padding: '12px 14px', borderBottom: `1px solid ${dark? '#333' : '#eee'}`, cursor: 'pointer', fontSize: '14px', color: dark? 'white' : 'black' })

  return <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <header style={{ zIndex: 100, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: bg, color: text, borderBottom: `1px solid ${border}` }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide1</strong>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
        <button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}` }}>{isDark? '☀️' : '🌙'}</button>
      </div>
    </header>

    {/* CANCELLATION NOTIFICATION - DRIVER CANCELLED */}
    {cancelledNotification && (
      <div style={{position:'fixed', top:'70px', left:'12px', right:'12px', zIndex:99999, background:'#ff3b30', borderRadius:'16px', padding:'16px', display:'flex', gap:'12px', alignItems:'center', boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
        <div style={{width:'48px', height:'48px', borderRadius:'24px', background:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px'}}>❌</div>
        <div style={{flex:1}}><div style={{color:'white', fontWeight:'900', fontSize:'15px'}}>Driver Cancelled Trip!</div><div style={{color:'white', fontSize:'13px', opacity:0.9}}>{cancelledNotification}</div></div>
        <button onClick={() => setCancelledNotification(null)} style={{background:'white', color:'#ff3b30', border:'none', borderRadius:'20px', padding:'8px 14px', fontWeight:'bold'}}>OK</button>
      </div>
    )}

    <div style={{ position: 'absolute', inset: '60px 0 0 0', zIndex: 1 }}>
      <OsmMapView center={pickupCoords || location} route={route} driverLocation={driverProfile?.current_lat? [driverProfile.current_lng, driverProfile.current_lat] as any : undefined} availableCars={nearbyCars as any} />
      <button onClick={useMyLocation} style={{ position: 'absolute', right: '16px', bottom: '100px', zIndex: 400, width: '48px', height: '48px', borderRadius: '24px', background: isDark? 'white' : 'black', color: isDark? 'black' : 'white', border: 'none', fontSize: '22px' }}>📍</button>
    </div>

    <section style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60, background: bg, borderTopLeftRadius: '24px', borderTopRightRadius: '24px', color: text, borderTop: `1px solid ${border}`, height: `${sheetHeight}vh`, overflowY: 'auto', transition: isDragging? 'none' : 'height 0.28s ease' }}>
      <div
        onClick={toggleSheet}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
        onMouseDown={onDragStart}
        onMouseMove={(e:any) => e.buttons===1 && onDragMove(e)}
        onMouseUp={onDragEnd}
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '14px 0 8px 0', cursor: 'grab', touchAction: 'none', position: 'sticky', top: 0, background: bg, zIndex: 5 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '48px', height: '6px', background: sheetHeight > 40? '#ff7a00' : '#666', borderRadius: '3px' }} />
          <span style={{ fontSize: '10px', color: '#888' }}>{sheetHeight > 45? '▼ Slide down for map' : '▲ Slide up for ride'}</span>
        </div>
      </div>

      <div style={{ padding: '0 16px 20px 16px' }}>
        {!ride && (<>
            <h2 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 'bold' }}>Where are you going?</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={pickup} onChange={e => onPickupChange(e.target.value)} placeholder="Pickup - My Location" style={{ flex: 1, padding: '14px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text }} />
                  <button onClick={useMyLocation} style={{ width: '52px', borderRadius: '14px', background: '#ff7a00', border: 'none', fontSize: '20px' }}>📍</button>
                </div>
                {showPickupSug && <div style={sugStyle(isDark) as any}>{pickupSuggestions.map((s,i) => (<div key={i} onClick={() => selectPickupSuggestion(s)} style={sugItemStyle(isDark)}>📍 {s.place_name}</div>))}</div>}
              </div>
              <div style={{ position: 'relative' }}>
                <input value={dropoff} onChange={e => onDropoffChange(e.target.value)} placeholder="Destination - Moletji, Mankweng, Seshego, Tzaneen..." style={{ width: '100%', padding: '14px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, boxSizing: 'border-box' }} />
                {showDropoffSug && <div style={sugStyle(isDark) as any}>{dropoffSuggestions.map((s,i) => (<div key={i} onClick={() => selectDropoffSuggestion(s)} style={sugItemStyle(isDark)}>📍 {s.place_name} {s.isOSM? '🌍' : ''}</div>))}</div>}
              </div>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                {CATEGORIES.map(cat => {
                  const fare = distance? calcFareForCategory(cat.id, distance) : null
                  const isSel = selectedCat === cat.id
                  return <button key={cat.id} onClick={() => { setSelectedCat(cat.id); if (distance) setPrice(calcFareForCategory(cat.id, distance)) }} style={{ minWidth: '95px', padding: '10px', borderRadius: '12px', border: isSel? '2px solid #ff7a00' : `1px solid ${border}`, background: isSel? (isDark? '#3a2a1a' : '#fff3e0') : bg2, textAlign: 'left' }}><div style={{ fontSize: '20px' }}>{cat.icon}</div><div style={{ fontWeight: 'bold', fontSize: '12px', color: text }}>{cat.name}</div>{fare && <div style={{ fontWeight: 'bold', color: '#ff7a00', fontSize: '12px' }}>R {fare}</div>}</button>
                })}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={calculateEstimate} style={{ flex: 1, padding: '14px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontWeight: 'bold' }}>Estimate</button>
                <button onClick={requestRide} disabled={loading} style={{ flex: 1.5, padding: '14px', borderRadius: '14px', border: 'none', background: '#ff7a00', color: 'white', fontWeight: 'bold' }}>{loading? 'Finding...' : 'Request Buddy'}</button>
              </div>
              {showEstimate && distance!== null && price!== null && (<div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', background: bg2 }}><span>{distance.toFixed(1)} km</span><span style={{ fontWeight: 'bold' }}>R {price.toFixed(0)}</span></div>)}
            </div>
          </>)}
        {ride && ride.status === 'searching' && (<><h3>Searching driver... ●</h3><p style={{ fontSize: '13px' }}>{ride.pickup_address} → {ride.dropoff_address}</p><button onClick={() => setShowCancelReason(true)} style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>Cancel</button></>)}
        {ride && (ride.status === 'accepted' || ride.status === 'arrived' || (ride.status as any) === 'picked_up') && driverProfile && (
          <>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#ff7a00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👨</div>
                <div>
                  <div style={{ fontWeight: 'bold' }}>{driverProfile.full_name} • {driverProfile.rating?.toFixed(1)}★</div>
                  <div style={{ fontSize: '13px' }}>{driverProfile.car_model} • {driverProfile.car_plate}</div>
                  <div style={{ color: '#ff7a00', fontWeight: 'bold', fontSize: '13px' }}>{ride.status === 'arrived'? 'Arrived' : 'Coming'}</div>
                </div>
              </div>
              <button onClick={() => setShowChat(true)} style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#00d181', border: 'none', fontSize: '22px' }}>💬</button>
            </div>
            <button onClick={() => setShowCancelReason(true)} style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '12px', background: bg2, color: text, border: `1px solid ${border}`, fontWeight: 'bold' }}>Cancel</button>
          </>
        )}
        {ride && ride.status === 'completed' && (<><div style={{ textAlign: 'center' }}><div style={{ fontSize: '48px' }}>✅</div><h2>R {ride.fare}</h2><div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>{[1,2,3,4,5].map(s => (<button key={s} onClick={() => setRating(s)} style={{ fontSize: '40px', background: 'none', border: 'none', color: rating >= s? '#FFB400' : '#444' }}>{rating >= s? '★' : '☆'}</button>))}</div></div><button onClick={finishTrip} style={{ width: '100%', padding: '16px', borderRadius: '14px', background: '#ff7a00', color: 'white', border: 'none', fontWeight: 'bold' }}>Finish</button></>)}
      </div>
    </section>

    {showChat && ride && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ background: bg, width: '100%', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', height: '75vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontWeight: 'bold', color: text }}>{driverProfile?.full_name}</div><div style={{ fontSize: '11px', color: '#999' }}>Chat disappears after trip</div></div>
            <button onClick={() => setShowChat(false)} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, color: text }}>✕</button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <RideChat rideId={ride.id} myId={profile.id} />
          </div>
        </div>
      </div>
    )}

    {showCancelReason && (
      <div style={{position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'flex-end'}}>
        <div style={{background: isDark? '#18181b':'white', width:'100%', borderTopLeftRadius:'24px', borderTopRightRadius:'24px', padding:'20px', color: text}}>
          {['Driver too far','Waiting too long','Changed my mind','Other'].map(reason => (
            <button key={reason} onClick={() => setCancelReason(reason)} style={{ width:'100%', textAlign:'left', padding:'14px', borderRadius:'12px', marginBottom:'8px', background: cancelReason===reason? '#00d181':'#242428', color: text, border: `1px solid ${border}` }}>{reason} {cancelReason===reason? '✓':''}</button>
          ))}
          <div style={{display:'flex', gap:'8px', marginTop:'16px'}}>
            <button onClick={() => setShowCancelReason(false)} style={{flex:1, padding:'14px', borderRadius:'12px', background:bg2, color:text, border:`1px solid ${border}`, fontWeight:'bold'}}>Back</button>
            <button onClick={cancelRide} style={{flex:1.5, padding:'14px', borderRadius:'12px', background:'#ff3b30', color:'white', border:'none', fontWeight:'bold'}} disabled={!cancelReason}>Confirm Cancel</button>
          </div>
        </div>
      </div>
    )}
  </div>
}