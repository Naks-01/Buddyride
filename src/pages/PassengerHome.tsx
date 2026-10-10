import { useEffect, useState, useRef } from 'react'
import { MapView } from '../components'
import { NavigationMenu } from '../NavigationMenu'
import { getRoute, geocode, reverseGeocode } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]

const CATEGORIES = [
  { id: 'buddy_go', name: 'Go', icon: '🚗', base: 15, perKm: 7.5, min: 35, seats: 2, mult: 1 },
  { id: 'buddy_comfort', name: 'Comfort', icon: '✨', base: 20, perKm: 9, min: 45, seats: 3, mult: 1.2 },
  { id: 'buddy_xl', name: 'XL', icon: '🚐', base: 28, perKm: 11, min: 60, seats: 6, mult: 1.5 },
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

  const pickupDebounce = useRef<any>(null)
  const dropoffDebounce = useRef<any>(null)

  const isDark = theme === 'dark'
  const bg = isDark? '#121212' : '#ffffff'
  const bg2 = isDark? '#1e1e1e' : '#f2f2f2'
  const text = isDark? 'white' : 'black'
  const border = isDark? '#333' : '#ddd'

  useEffect(() => { localStorage.setItem('buddy_theme', theme) }, [theme])

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(async pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p)
      setPickupCoords(p)
      try { const real = await reverseGeocode(p); setPickup(real) } catch { setPickup('My Location - Polokwane') }
    })
    async function loadActiveRide() {
      const { data } = await supabase.from('rides').select('*').eq('passenger_id', profile.id).in('status', ['searching','accepted','arrived','picked_up','en_route','in_progress'] as any).order('created_at', { ascending: false }).limit(1).single()
      if (data) setRide(data as Ride)
    }
    loadActiveRide()
  }, [profile.id])

  useEffect(() => {
    if (ride?.driver_id) {
      supabase.from('profiles').select('*').eq('id', ride.driver_id).single().then(({ data }) => { if (data) setDriverProfile(data as any) })
    } else { setDriverProfile(null) }
  }, [ride?.driver_id])

  useEffect(() => {
    if (!ride) return
    const ch = supabase.channel(`passenger-${ride.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` }, p => { setRide(p.new as Ride) }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [ride?.id])

  function calcFareForCategory(catId: string, km: number) {
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0]
    let fare = cat.base + (km * cat.perKm)
    if (fare < cat.min) fare = cat.min
    if (fare > 350) fare = 350
    return Math.ceil(fare / 5) * 5
  }

  async function searchPlaces(query: string, setter: (v:any[])=>void, setShow: (v:boolean)=>void) {
    if (!query || query.trim().length < 2) { setter([]); setShow(false); return }
    if (query.toLowerCase().includes('my location')) { setter([]); setShow(false); return }
    try {
      const results = await geocode(query + ' Polokwane') as any
      let places = results?.features || results
      if (Array.isArray(places) && places.length > 0) {
        const normalized = places.slice(0, 5).map((p:any) => ({ center: p.center || p.geometry?.coordinates, place_name: p.place_name || p.text, text: p.text || p.place_name })).filter((p:any) => p.center)
        setter(normalized); setShow(normalized.length > 0)
      } else { setter([]); setShow(false) }
    } catch (e) { console.log('geocode err', e) }
  }

  function onPickupChange(val: string) { setPickup(val); setShowEstimate(false); setPrice(null); if (pickupDebounce.current) clearTimeout(pickupDebounce.current); pickupDebounce.current = setTimeout(() => { searchPlaces(val, setPickupSuggestions, setShowPickupSug) }, 300) }
  function onDropoffChange(val: string) { setDropoff(val); setShowEstimate(false); setPrice(null); if (dropoffDebounce.current) clearTimeout(dropoffDebounce.current); dropoffDebounce.current = setTimeout(() => { searchPlaces(val, setDropoffSuggestions, setShowDropoffSug) }, 300) }
  function selectPickupSuggestion(item: any) { setPickup(item.place_name || item.text); setPickupCoords([item.center[0], item.center[1]] as [number, number]); setPickupSuggestions([]); setShowPickupSug(false) }
  function selectDropoffSuggestion(item: any) { setDropoff(item.place_name || item.text); setDropoffCoords([item.center[0], item.center[1]] as [number, number]); setDropoffSuggestions([]); setShowDropoffSug(false) }

  async function ensureCoords() {
    let pCoords = pickupCoords
    let dCoords = dropoffCoords
    if (!pCoords && pickup &&!pickup.toLowerCase().includes('my location')) { try { const res = await geocode(pickup + ' Polokwane') as any; const first = res?.[0] || res?.features?.[0]; const c = first?.center || first?.geometry?.coordinates; if (c) pCoords = [c[0], c[1]] } catch {} }
    if (!pCoords) pCoords = location
    if (!dCoords && dropoff) { try { const res = await geocode(dropoff + ' Polokwane') as any; const first = res?.[0] || res?.features?.[0]; const c = first?.center || first?.geometry?.coordinates; if (c) dCoords = [c[0], c[1]] } catch {} }
    if (!dCoords && dropoff.toLowerCase().includes('makro')) {
      dCoords = [29.4521, -23.9145] as any
    }
    return { pCoords, dCoords }
  }

  async function calculateEstimate() {
    const { pCoords, dCoords } = await ensureCoords()
    if (!pCoords ||!dCoords) { alert('Please enter destination - e.g. Makro'); return }
    setPickupCoords(pCoords); setDropoffCoords(dCoords)
    try {
      const r = await getRoute(pCoords, dCoords) as any;
      setRoute(r.geometry);
      const km = r.distance / 1000;
      setDistance(km);
      const fare = calcFareForCategory(selectedCat, km)
      setPrice(fare);
      setShowEstimate(true)
    } catch {
      setDistance(3);
      setPrice(calcFareForCategory(selectedCat, 3));
      setShowEstimate(true)
    }
  }

  async function useMyLocation() {
    navigator.geolocation.getCurrentPosition(async pos => { const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]; setLocation(p); setPickupCoords(p); try { const real = await reverseGeocode(p); setPickup(real) } catch { setPickup('My Location - Polokwane') }; setPickupSuggestions([]); setShowPickupSug(false) })
  }

  async function requestRide() {
    setLoading(true)
    const { pCoords, dCoords } = await ensureCoords()
    if (!dCoords) { setLoading(false); alert('Please enter destination'); return }
    setPickupCoords(pCoords); setDropoffCoords(dCoords)
    let finalFare = price || calcFareForCategory(selectedCat, 3)
    let finalKm = distance || 3
    if (!price) {
      try { const r = await getRoute(pCoords!, dCoords) as any; const km = r.distance / 1000; finalKm = km; finalFare = calcFareForCategory(selectedCat, km) } catch { finalFare = calcFareForCategory(selectedCat, 3) }
    }
    let realPickup = pickup
    if (!pickup || pickup.toLowerCase().includes('my location')) { try { realPickup = await reverseGeocode(pCoords!) } catch { realPickup = 'Polokwane' } }
    const { data, error } = await supabase.from('rides').insert({ passenger_id: profile.id, pickup_lat: pCoords![1], pickup_lng: pCoords![0], pickup_address: realPickup, dropoff_lat: dCoords[1], dropoff_lng: dCoords[0], dropoff_address: dropoff, status: 'searching', fare: finalFare, distance_km: finalKm, payment_method: 'cash', ride_category: selectedCat } as any).select().single()
    if (error) { setLoading(false); alert(error.message); return }
    if (data) {
      setRide(data as Ride)
      try {
        const { data: onlineDrivers } = await supabase.from('profiles').select('id, current_lat, current_lng').eq('role','driver').eq('is_online', true).limit(20)
        if (onlineDrivers && onlineDrivers.length > 0) {
          function dist(a:number,b:number,c:number,d:number){ if(!a||!b||!c||!d) return 9999; const R=6371, dLat=(c-a)*Math.PI/180, dLng=(d-b)*Math.PI/180; const aa=Math.sin(dLat/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLng/2)**2; return R*2*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa)) }
          onlineDrivers.sort((x:any,y:any)=> dist(pCoords![1],pCoords![0],x.current_lat,x.current_lng) - dist(pCoords![1],pCoords![0],y.current_lat,y.current_lng))
          const closest = onlineDrivers[0]
          await supabase.from('rides').update({ offered_driver_id: closest.id, offer_expires_at: new Date(Date.now()+12000).toISOString(), tried_driver_ids: [] } as any).eq('id', data.id)
        }
      } catch (e) { console.log('dispatch err', e) }
    }
    setLoading(false)
  }

  async function cancelRide() { if (!ride) return; await supabase.from('rides').update({ status: 'cancelled' as any }).eq('id', ride.id); setRide(null); setRoute(undefined); setShowEstimate(false) }

  const sugStyle = (dark:boolean) => ({ position: 'absolute' as const, top: '58px', left: 0, right: 0, zIndex: 9999, background: dark? '#2a2a2a' : 'white', border: `1px solid ${dark? '#444' : '#ddd'}`, borderRadius: '12px', maxHeight: '200px', overflowY: 'auto' as const, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' })
  const sugItemStyle = (dark:boolean) => ({ padding: '12px 14px', borderBottom: `1px solid ${dark? '#333' : '#eee'}`, cursor: 'pointer', fontSize: '14px', color: dark? 'white' : 'black' })

  return <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <header style={{ zIndex: 100, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: bg, color: text, borderBottom: `1px solid ${border}` }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide1</strong>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, fontSize: '16px' }}>{isDark? '☀️' : '🌙'}</button>
        <button onClick={() => void supabase.auth.signOut()} style={{ background: bg2, color: text, border: `1px solid ${border}`, padding: '8px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '13px' }}>Logout</button>
      </div>
    </header>
    <div style={{ height: '100%', paddingBottom: '420px' }}>
      <MapView center={pickupCoords || location} route={route} driverLocation={driverProfile?.current_lat? [driverProfile.current_lng, driverProfile.current_lat] as any : undefined} />
      <button onClick={useMyLocation} style={{ position: 'absolute', right: '16px', bottom: '430px', zIndex: 50, width: '48px', height: '48px', borderRadius: '24px', background: isDark? 'white' : 'black', color: isDark? 'black' : 'white', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', fontSize: '22px' }}>📍</button>
    </div>
    <section style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60, background: bg, borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '16px', color: text, borderTop: `1px solid ${border}` }}>
      {!ride && (<>
          <div style={{ width: '40px', height: '4px', background: '#555', borderRadius: '2px', margin: '0 auto 12px' }} />
          <h2 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 'bold' }}>Where are you going?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={pickup} onChange={e => onPickupChange(e.target.value)} onFocus={() => pickupSuggestions.length && setShowPickupSug(true)} placeholder="Pickup - e.g. My Location" style={{ flex: 1, padding: '14px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontSize: '14px' }} />
                <button onClick={useMyLocation} style={{ width: '52px', borderRadius: '14px', background: '#ff7a00', border: 'none', fontSize: '20px' }}>📍</button>
              </div>
              {showPickupSug && pickupSuggestions.length > 0 && (<div style={sugStyle(isDark) as any}>{pickupSuggestions.map((s,i) => (<div key={i} onClick={() => selectPickupSuggestion(s)} style={sugItemStyle(isDark)}>📍 {s.place_name || s.text}</div>))}</div>)}
            </div>
            <div style={{ position: 'relative' }}>
              <input value={dropoff} onChange={e => onDropoffChange(e.target.value)} onFocus={() => dropoffSuggestions.length && setShowDropoffSug(true)} placeholder="Destination - e.g. Makro" style={{ width: '100%', padding: '14px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontSize: '14px', boxSizing: 'border-box' }} />
              {showDropoffSug && dropoffSuggestions.length > 0 && (<div style={sugStyle(isDark) as any}>{dropoffSuggestions.map((s,i) => (<div key={i} onClick={() => selectDropoffSuggestion(s)} style={sugItemStyle(isDark)}>📍 {s.place_name || s.text}</div>))}</div>)}
            </div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '6px 0' }}>
              {CATEGORIES.map(cat => {
                const fare = distance? calcFareForCategory(cat.id, distance) : null
                const isSel = selectedCat === cat.id
                return (
                  <button key={cat.id} onClick={() => { setSelectedCat(cat.id); if (distance) setPrice(calcFareForCategory(cat.id, distance)) }} style={{ minWidth: '95px', padding: '10px', borderRadius: '12px', border: isSel? '2px solid #ff7a00' : `1px solid ${border}`, background: isSel? (isDark? '#3a2a1a' : '#fff3e0') : bg2, textAlign: 'left' }}>
                    <div style={{ fontSize: '20px' }}>{cat.icon}</div>
                    <div style={{ fontWeight: 'bold', fontSize: '12px', color: text }}>{cat.name}</div>
                    <div style={{ fontSize: '10px', opacity: 0.6 }}>{cat.seats} seats • {cat.seats} pax</div>
                    {fare && <div style={{ fontWeight: 'bold', color: '#ff7a00', fontSize: '12px', marginTop: '2px' }}>R {fare}</div>}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
              <button onClick={calculateEstimate} style={{ flex: 1, padding: '14px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontWeight: 'bold' }}>Estimate</button>
              <button onClick={requestRide} disabled={loading} style={{ flex: 1.5, padding: '14px', borderRadius: '14px', border: 'none', background: '#ff7a00', color: 'white', fontWeight: 'bold', fontSize: '15px' }}>{loading? 'Finding Buddy...' : 'Request Buddy'}</button>
            </div>
            {showEstimate && distance!== null && price!== null && (<div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', background: bg2, marginTop: '2px', border: `1px solid ${border}` }}><span style={{ opacity: 0.8, fontSize: '13px' }}>{distance.toFixed(1)} km • {CATEGORIES.find(c=>c.id===selectedCat)?.name} ({CATEGORIES.find(c=>c.id===selectedCat)?.seats} pax)</span><span style={{ fontWeight: 'bold', fontSize: '15px' }}>R {price.toFixed(0)}</span></div>)}
          </div>
        </>)}
      {ride && (<>
          {ride.status === 'searching' && (<><h3 style={{ margin: '0 0 6px' }}>Searching Buddy driver... <span style={{ color: '#ff7a00' }}>●</span></h3><p style={{ opacity: 0.7, fontSize: '13px' }}>{ride.pickup_address} → {ride.dropoff_address}</p><p style={{ fontWeight: 'bold' }}>R {ride.fare}</p></>)}
          {(ride.status === 'accepted' || ride.status === 'arrived') && driverProfile && (<div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}><div style={{ width: '48px', height: '48px', borderRadius: '24px', background: '#ff7a00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>👨</div><div style={{ flex: 1 }}><div style={{ fontWeight: 'bold' }}>{driverProfile.full_name || 'Buddy Driver'} • {driverProfile.rating?.toFixed(1) || '4.9'}★</div><div style={{ fontSize: '13px', opacity: 0.8 }}>{driverProfile.car_model || 'White Corolla'} • {driverProfile.car_plate || 'ND 123 L'}</div><div style={{ fontSize: '13px', color: '#ff7a00', fontWeight: 'bold' }}>{ride.status === 'arrived'? 'Buddy has arrived - 5 min free wait' : 'Buddy is coming - 3 min away'}</div></div><a href={`tel:${driverProfile.phone || ''}`} style={{ width: '40px', height: '40px', borderRadius: '20px', background: bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>📞</a></div>)}
          {(ride.status as any) === 'en_route' || (ride.status as any) === 'in_progress' || (ride.status as any) === 'picked_up'? (<><h3>Heading to {ride.dropoff_address}</h3><p style={{ fontSize: '13px', opacity: 0.7 }}>Cash trip • R {ride.fare}</p><div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}><button style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#ff3b30', border: 'none', color: 'white', fontWeight: 'bold' }}>SOS</button><button style={{ flex: 1, padding: '12px', borderRadius: '10px', background: bg2, border: `1px solid ${border}`, color: text }}>Share Trip</button></div></>) : null}
          <button onClick={cancelRide} style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '12px', border: `1px solid ${border}`, background: bg2, color: text, fontWeight: 'bold' }}>Cancel Ride</button>
        </>)}
    </section>
    {(showPickupSug || showDropoffSug) && (<div onClick={() => { setShowPickupSug(false); setShowDropoffSug(false) }} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />)}
  </div>
}