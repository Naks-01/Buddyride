import { useEffect, useState, useRef } from 'react'
import { MapView } from '../components'
import { NavigationMenu } from '../NavigationMenu'
import { getRoute, geocode } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]

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
  const [loading, setLoading] = useState(false)
  const [distance, setDistance] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [showEstimate, setShowEstimate] = useState(false)
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
    navigator.geolocation.getCurrentPosition(pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p)
      setPickupCoords(p)
      setPickup('My Location')
    })
    async function loadActiveRide() {
      const { data } = await supabase.from('rides').select('*').eq('passenger_id', profile.id)
    .in('status', ['searching','accepted','picked_up','en_route'] as any)
    .order('created_at', { ascending: false }).limit(1).single()
      if (data) setRide(data as Ride)
    }
    loadActiveRide()
  }, [profile.id])

  useEffect(() => {
    if (!ride) return
    const ch = supabase.channel(`passenger-${ride.id}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` }, p => {
        setRide(p.new as Ride)
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [ride?.id])

  // AUTOCOMPLETE SEARCH
  async function searchPlaces(query: string, setter: (v:any[])=>void, setShow: (v:boolean)=>void) {
    if (!query || query.length < 2 || query.toLowerCase().includes('my location')) {
      setter([])
      setShow(false)
      return
    }
    try {
      const results = await geocode(query + ' Polokwane') as any
      if (results && results.length > 0) {
        setter(results.slice(0, 5))
        setShow(true)
      }
    } catch {}
  }

  function onPickupChange(val: string) {
    setPickup(val)
    setShowEstimate(false)
    setPrice(null)
    if (pickupDebounce.current) clearTimeout(pickupDebounce.current)
    pickupDebounce.current = setTimeout(() => {
      searchPlaces(val, setPickupSuggestions, setShowPickupSug)
    }, 300)
  }

  function onDropoffChange(val: string) {
    setDropoff(val)
    setShowEstimate(false)
    setPrice(null)
    if (dropoffDebounce.current) clearTimeout(dropoffDebounce.current)
    dropoffDebounce.current = setTimeout(() => {
      searchPlaces(val, setDropoffSuggestions, setShowDropoffSug)
    }, 300)
  }

  function selectPickupSuggestion(item: any) {
    setPickup(item.place_name || item.text)
    setPickupCoords([item.center[0], item.center[1]] as [number, number])
    setPickupSuggestions([])
    setShowPickupSug(false)
  }

  function selectDropoffSuggestion(item: any) {
    setDropoff(item.place_name || item.text)
    setDropoffCoords([item.center[0], item.center[1]] as [number, number])
    setDropoffSuggestions([])
    setShowDropoffSug(false)
  }

  // --- FIXED: auto-geocode if user didn't click suggestion ---
  async function ensureCoords() {
    let pCoords = pickupCoords
    let dCoords = dropoffCoords

    if (!pCoords && pickup &&!pickup.toLowerCase().includes('my location')) {
      try {
        const res = await geocode(pickup + ' Polokwane') as any
        if (res?.[0]?.center) pCoords = [res[0].center[0], res[0].center[1]]
      } catch {}
    }
    if (!pCoords) pCoords = location // fallback to current location

    if (!dCoords && dropoff) {
      try {
        const res = await geocode(dropoff + ' Polokwane') as any
        if (res?.[0]?.center) dCoords = [res[0].center[0], res[0].center[1]]
      } catch {}
    }
    return { pCoords, dCoords }
  }

  async function calculateEstimate() {
    const { pCoords, dCoords } = await ensureCoords()
    if (!pCoords ||!dCoords) {
      alert('Could not find destination. Try selecting from dropdown or type e.g. "Puma garage Makgofe"')
      return
    }
    setPickupCoords(pCoords)
    setDropoffCoords(dCoords)
    try {
      const r = await getRoute(pCoords, dCoords) as any
      setRoute(r.geometry)
      const km = r.distance / 1000
      setDistance(km)
      const calc = 10 + (km * 6)
      setPrice(Math.max(20, Math.round(calc)))
      setShowEstimate(true)
    } catch {
      setDistance(3)
      setPrice(20)
      setShowEstimate(true)
    }
  }

  async function useMyLocation() {
    navigator.geolocation.getCurrentPosition(pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p)
      setPickupCoords(p)
      setPickup('My Location - Polokwane')
      setPickupSuggestions([])
      setShowPickupSug(false)
    })
  }

  async function requestRide() {
    setLoading(true)
    const { pCoords, dCoords } = await ensureCoords()

    if (!dCoords) {
      setLoading(false)
      alert('Please enter destination. If "Puma makgofe" not found, try "Makgofe" or select from list')
      return
    }

    setPickupCoords(pCoords)
    setDropoffCoords(dCoords)

    let finalFare = price || 20
    if (!price) {
      try {
        const r = await getRoute(pCoords!, dCoords) as any
        const km = r.distance / 1000
        finalFare = Math.max(20, Math.round(10 + km * 6))
      } catch { finalFare = 20 }
    }
    const { data, error } = await supabase.from('rides').insert({
      passenger_id: profile.id,
      pickup_lat: pCoords![1],
      pickup_lng: pCoords![0],
      pickup_address: pickup || 'My Location - Polokwane',
      dropoff_lat: dCoords[1],
      dropoff_lng: dCoords[0],
      dropoff_address: dropoff,
      status: 'searching',
      fare: finalFare
    } as any).select().single()
    setLoading(false)
    if (error) alert(error.message)
    else if (data) setRide(data as Ride)
  }

  async function cancelRide() {
    if (!ride) return
    await supabase.from('rides').update({ status: 'cancelled' as any }).eq('id', ride.id)
    setRide(null)
    setRoute(undefined)
    setShowEstimate(false)
  }

  const sugStyle = (dark:boolean) => ({
    position: 'absolute' as const,
    top: '58px',
    left: 0,
    right: 0,
    zIndex: 100,
    background: dark? '#2a2a2a' : 'white',
    border: `1px solid ${dark? '#444' : '#ddd'}`,
    borderRadius: '12px',
    maxHeight: '200px',
    overflowY: 'auto' as const,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
  })

  const sugItemStyle = (dark:boolean) => ({
    padding: '12px 14px',
    borderBottom: `1px solid ${dark? '#333' : '#eee'}`,
    cursor: 'pointer',
    fontSize: '14px',
    color: dark? 'white' : 'black'
  })

  return <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <header style={{ zIndex: 100, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: bg, color: text, borderBottom: `1px solid ${border}` }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide1</strong>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, fontSize: '16px' }}>{isDark? '☀️' : '🌙'}</button>
        <button onClick={() => void supabase.auth.signOut()} style={{ background: bg2, color: text, border: `1px solid ${border}`, padding: '8px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '13px' }}>Logout</button>
      </div>
    </header>

    <div style={{ height: '100%', paddingBottom: '350px' }}>
      <MapView center={pickupCoords || location} route={route} />
      <button onClick={useMyLocation} style={{ position: 'absolute', right: '16px', bottom: '360px', zIndex: 50, width: '48px', height: '48px', borderRadius: '24px', background: isDark? 'white' : 'black', color: isDark? 'black' : 'white', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', fontSize: '22px' }}>📍</button>
    </div>

    <section style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60, background: bg, borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '16px', color: text, borderTop: `1px solid ${border}` }}>
      {!ride && (
        <>
          <div style={{ width: '40px', height: '4px', background: '#555', borderRadius: '2px', margin: '0 auto 12px' }} />
          <h2 style={{ margin: '0 0 16px', fontSize: '22px', fontWeight: 'bold' }}>Where are you going?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* PICKUP WITH AUTOCOMPLETE */}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={pickup} onChange={e => onPickupChange(e.target.value)} onFocus={() => pickupSuggestions.length && setShowPickupSug(true)} placeholder="Pickup - e.g. My Location" style={{ flex: 1, padding: '16px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontSize: '15px' }} />
                <button onClick={useMyLocation} style={{ width: '52px', borderRadius: '14px', background: '#ff7a00', border: 'none', fontSize: '20px' }}>📍</button>
              </div>
              {showPickupSug && pickupSuggestions.length > 0 && (
                <div style={sugStyle(isDark) as any}>
                  {pickupSuggestions.map((s,i) => (
                    <div key={i} onClick={() => selectPickupSuggestion(s)} style={sugItemStyle(isDark)}>
                      📍 {s.place_name || s.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DROPOFF WITH AUTOCOMPLETE */}
            <div style={{ position: 'relative' }}>
              <input value={dropoff} onChange={e => onDropoffChange(e.target.value)} onFocus={() => dropoffSuggestions.length && setShowDropoffSug(true)} placeholder="Destination - e.g. Makro" style={{ width: '100%', padding: '16px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontSize: '15px', boxSizing: 'border-box' }} />
              {showDropoffSug && dropoffSuggestions.length > 0 && (
                <div style={sugStyle(isDark) as any}>
                  {dropoffSuggestions.map((s,i) => (
                    <div key={i} onClick={() => selectDropoffSuggestion(s)} style={sugItemStyle(isDark)}>
                      📍 {s.place_name || s.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button onClick={calculateEstimate} style={{ flex: 1, padding: '16px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontWeight: 'bold' }}>Estimate</button>
              <button onClick={requestRide} disabled={loading} style={{ flex: 1.5, padding: '16px', borderRadius: '14px', border: 'none', background: '#ff7a00', color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{loading? '...' : 'Request ride'}</button>
            </div>

            {showEstimate && distance!== null && price!== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', background: bg2, marginTop: '4px', border: `1px solid ${border}` }}>
                <span style={{ opacity: 0.8 }}>{distance.toFixed(1)} km •</span>
                <span style={{ fontWeight: 'bold', fontSize: '16px' }}>R {price.toFixed(2)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {ride && (
        <>
          <h3 style={{ margin: '0 0 6px' }}>{ride.status === 'searching'? 'Searching driver...' : (ride.status as any) === 'accepted'? 'Driver is coming!' : 'On trip'}</h3>
          <p style={{ opacity: 0.7, fontSize: '13px' }}>{ride.pickup_address} → {ride.dropoff_address}</p>
          {price && <p style={{ fontWeight: 'bold' }}>R {price}</p>}
          <button onClick={cancelRide} style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '12px', border: `1px solid ${border}`, background: bg2, color: text, fontWeight: 'bold' }}>Cancel Ride</button>
        </>
      )}
    </section>

    {(showPickupSug || showDropoffSug) && (
      <div onClick={() => { setShowPickupSug(false); setShowDropoffSug(false) }} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
    )}
  </div>
}