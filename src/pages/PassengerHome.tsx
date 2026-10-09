import { useEffect, useState } from 'react'
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
  const [route, setRoute] = useState<any>()
  const [ride, setRide] = useState<Ride | null>(null)
  const [loading, setLoading] = useState(false)
  const [distance, setDistance] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [showEstimate, setShowEstimate] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('buddy_theme') as any) || 'dark')

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

  async function calculateEstimate() {
    if (!pickupCoords ||!dropoffCoords) {
      alert('Select pickup and destination first')
      return
    }
    try {
      const r = await getRoute(pickupCoords, dropoffCoords) as any
      setRoute(r.geometry)
      const km = r.distance / 1000
      setDistance(km)
      // R20 minimum: Base R10 + R6 per km, min R20
      const calc = 10 + (km * 6)
      setPrice(Math.max(20, Math.round(calc)))
      setShowEstimate(true)
    } catch {
      // Fallback if mapbox fails - calculate straight line
      const km = 3 // estimate
      setDistance(km)
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
    })
  }

  async function handleSearchPickup() {
    if (!pickup || pickup === 'My Location') return
    try {
      const results = await geocode(pickup + ' Polokwane') as any
      if (results && results[0] && results[0].center) {
        const c = results[0].center
        setPickupCoords([c[0], c[1]] as [number, number])
        setShowEstimate(false)
        setPrice(null)
        setDistance(null)
      }
    } catch {}
  }

  async function handleSearchDropoff() {
    if (!dropoff) return
    try {
      const results = await geocode(dropoff + ' Polokwane') as any
      if (results && results[0] && results[0].center) {
        const c = results[0].center
        setDropoffCoords([c[0], c[1]] as [number, number])
        setShowEstimate(false)
        setPrice(null)
        setDistance(null)
      }
    } catch {}
  }

  async function requestRide() {
    if (!pickupCoords ||!dropoffCoords) {
      alert('Please enter pickup and dropoff')
      return
    }
    // Auto-calculate if user didn't click Estimate
    if (!price) {
      await calculateEstimate()
    }
    setLoading(true)
    const { data, error } = await supabase.from('rides').insert({
      passenger_id: profile.id,
      pickup_lat: pickupCoords[1],
      pickup_lng: pickupCoords[0],
      pickup_address: pickup,
      dropoff_lat: dropoffCoords[1],
      dropoff_lng: dropoffCoords[0],
      dropoff_address: dropoff,
      status: 'searching',
      fare: price || 20
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

  return <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: bg }}>
    <header style={{ zIndex: 100, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: bg, color: text, borderBottom: `1px solid ${border}` }}>
      <NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} />
      <strong>BuddyRide1</strong>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setTheme(isDark? 'light' : 'dark')} style={{ width: '36px', height: '36px', borderRadius: '18px', background: bg2, border: `1px solid ${border}`, fontSize: '16px' }}>{isDark? '☀️' : '🌙'}</button>
        <button onClick={() => void supabase.auth.signOut()} style={{ background: bg2, color: text, border: `1px solid ${border}`, padding: '8px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '13px' }}>Logout</button>
      </div>
    </header>

    <div style={{ height: '100%', paddingBottom: '300px' }}>
      <MapView center={pickupCoords || location} route={route} />
      <button onClick={useMyLocation} style={{ position: 'absolute', right: '16px', bottom: '320px', zIndex: 50, width: '48px', height: '48px', borderRadius: '24px', background: isDark? 'white' : 'black', color: isDark? 'black' : 'white', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', fontSize: '22px' }}>📍</button>
    </div>

    <section style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60, background: bg, borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '16px', color: text, borderTop: `1px solid ${border}` }}>
      {!ride && (
        <>
          <div style={{ width: '40px', height: '4px', background: '#555', borderRadius: '2px', margin: '0 auto 12px' }} />
          <p style={{ textAlign: 'center', fontSize: '12px', opacity: 0.6, margin: '0 0 12px' }}>▼ Tap to hide - see driver on map</p>
          <h2 style={{ margin: '0 0 16px', fontSize: '22px', fontWeight: 'bold' }}>Where are you going?</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={pickup} onChange={e => { setPickup(e.target.value); setShowEstimate(false) }} onBlur={handleSearchPickup} placeholder="7 Marmer Street, Polokwane" style={{ flex: 1, padding: '16px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontSize: '15px' }} />
              <button onClick={useMyLocation} style={{ width: '52px', borderRadius: '14px', background: '#ff7a00', border: 'none', fontSize: '20px' }}>📍</button>
            </div>
            <input value={dropoff} onChange={e => { setDropoff(e.target.value); setShowEstimate(false); setPrice(null) }} onBlur={handleSearchDropoff} placeholder="Destination - e.g. Mall of the North" style={{ padding: '16px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontSize: '15px' }} />

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button onClick={calculateEstimate} style={{ flex: 1, padding: '16px', borderRadius: '14px', border: `1px solid ${border}`, background: bg2, color: text, fontWeight: 'bold' }}>Estimate</button>
              <button onClick={requestRide} disabled={loading} style={{ flex: 1.5, padding: '16px', borderRadius: '14px', border: 'none', background: '#ff7a00', color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{loading? '...' : 'Request ride'}</button>
            </div>

            {/* PRICE ONLY SHOWS AFTER ESTIMATE - NOT ALWAYS */}
            {showEstimate && distance!== null && price!== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', background: bg2, marginTop: '4px', border: `1px solid ${border}` }}>
                <span style={{ opacity: 0.8 }}>{distance.toFixed(1)} km •</span>
                <span style={{ fontWeight: 'bold', fontSize: '16px' }}>R {price.toFixed(2)}</span>
              </div>
            )}
            {showEstimate && price === 20 && (
              <p style={{ fontSize: '11px', opacity: 0.5, textAlign: 'center', margin: '0' }}>Minimum fare R20 applies</p>
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
  </div>
}