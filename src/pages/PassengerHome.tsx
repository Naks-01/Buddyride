import { useEffect, useMemo, useState } from 'react'
import { MapView } from '../components'
import { NavigationMenu } from '../NavigationMenu'
import { geocode, getRoute, reverseGeocode } from '../lib/mapbox'
import { calculateFare } from '../lib/fare'
import { supabase, type Profile, type Ride } from '../lib/supabase'

export function PassengerHome({ profile }: { profile: Profile }) {
  const [location, setLocation] = useState<[number, number]>([28.0473, -26.2041])
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [route, setRoute] = useState<GeoJSON.LineString>()
  const [distance, setDistance] = useState(0)
  const [fare, setFare] = useState(calculateFare(0))
  const [ride, setRide] = useState<Ride | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [categories, setCategories] = useState<any[]>([])
  const [selectedCat, setSelectedCat] = useState('buddy_go')
  const [sheetCollapsed, setSheetCollapsed] = useState(false)

  useEffect(() => {
    async function loadCats() {
      const { data } = await supabase.from('ride_categories').select('*').order('base_price')
      if (data) { setCategories(data); setSelectedCat(data[0]?.id) }
    }
    loadCats()
  }, [])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(async pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p)
      try { setPickup(await reverseGeocode(p[0], p[1])) } catch {}
    })
  }, [])

  useEffect(() => {
    const channel = supabase.channel(`passenger-${profile.id}`)
     .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `passenger_id=eq.${profile.id}` }, payload => {
        setRide(payload.new as Ride)
        setSheetCollapsed(false) // auto open when status changes
      })
     .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile.id])

  async function preview() {
    setBusy(true); setMessage('')
    try {
      const a = await geocode(pickup); const b = await geocode(dropoff)
      if (!a ||!b) throw new Error('Could not find one of the addresses.')
      const r = await getRoute(a, b)
      setLocation(a); setRoute(r.geometry); setDistance(r.distanceKm); setFare(calculateFare(r.distanceKm))
    } catch (e) { setMessage(e instanceof Error? e.message : 'Could not calculate route.') }
    finally { setBusy(false) }
  }

  async function requestRide() {
    setBusy(true); setMessage('')
    try {
      const a = await geocode(pickup); const b = await geocode(dropoff)
      if (!a ||!b) throw new Error('Choose valid addresses.')
      const r = await getRoute(a, b); const f = calculateFare(r.distanceKm)
      const sel = categories.find(c => c.id === selectedCat)
      const mult = sel?.base_multiplier || 1
      const finalTotal = f.total * mult
      const { data, error } = await supabase.from('rides').insert({
        passenger_id: profile.id, pickup_address: pickup, dropoff_address: dropoff,
        pickup_lat: a[1], pickup_lng: a[0], dropoff_lat: b[1], dropoff_lng: b[0],
        distance_km: r.distanceKm, fare: f.fare * mult, booking_fee: f.bookingFee, total_fare: finalTotal,
        driver_earnings: finalTotal * 0.8, buddyride_commission: finalTotal * 0.2, status: 'searching',
        category_id: selectedCat
      }).select().single()
      if (error) throw error
      setRide(data); setRoute(r.geometry); setDistance(r.distanceKm); setFare(f)
      setSheetCollapsed(false)
    } catch (e) { setMessage(e instanceof Error? e.message : 'Ride request failed.') }
    finally { setBusy(false) }
  }

  async function cancel() {
    if (!ride) return
    await supabase.from('rides').update({ status: 'cancelled' }).eq('id', ride.id)
    setRide(null)
  }

  const statusText = useMemo(() => ride? ride.status.replaceAll('_', ' ') : '', [ride])
  const selectedCategory = categories.find(c => c.id === selectedCat)

  return <div className="app-shell" style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
    <header className="topbar"><NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} /><strong>BuddyRide1</strong><span>{profile.full_name || profile.email}</span></header>

    <div className="map-wrap" style={{ height: '100%', paddingBottom: sheetCollapsed? '80px' : '380px' }}>
      <MapView center={location} route={route} />
    </div>

    {/* SLIDE SHEET */}
    <section
      className="sheet"
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50,
        borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
        transform: sheetCollapsed? 'translateY(calc(100% - 70px))' : 'translateY(0)',
        transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -8px 30px rgba(0,0,0,0.3)'
      }}
    >
      {/* DRAG HANDLE */}
      <div
        onClick={() => setSheetCollapsed(!sheetCollapsed)}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '10px 0 6px' }}
      >
        <div style={{ width: '40px', height: '5px', borderRadius: '10px', background: '#555' }} />
        <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>
          {sheetCollapsed? '▲ Tap to see details' : '▼ Tap to hide - see driver'}
        </div>
      </div>

      <h2>Where are you going?</h2>
      <input value={pickup} onChange={e => setPickup(e.target.value)} placeholder="Pickup location" />
      <input value={dropoff} onChange={e => setDropoff(e.target.value)} placeholder="Destination" />

      <div className="grid grid-cols-2 gap-2 my-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '12px 0' }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat.id)}
            className={selectedCat === cat.id? 'primary' : ''}
            style={{ padding: '10px', borderRadius: '12px', border: selectedCat === cat.id? '2px solid #ff7a00' : '1px solid #444', textAlign: 'left', background: selectedCat === cat.id? '#ff7a001a' : '#2a2a2a', color: 'white' }}
          >
            <div>{cat.icon} {cat.name}</div>
            <div style={{ fontSize: '11px', opacity: 0.7 }}>{cat.description}</div>
          </button>
        ))}
      </div>

      <div className="button-row" style={{ display: 'flex', gap: '8px' }}><button onClick={preview} disabled={busy} style={{ flex: 1 }}>Estimate</button><button className="primary" onClick={requestRide} disabled={busy} style={{ flex: 1.5, background: '#ff7a00' }}>Request {selectedCategory?.name || 'ride'}</button></div>
      <div className="fare-card" style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0', padding: '10px', background: '#1e1e1e', borderRadius: '12px' }}><span>{distance.toFixed(1)} km • {selectedCategory?.name}</span><strong>R {(fare.total * (selectedCategory?.base_multiplier || 1)).toFixed(2)}</strong></div>
      {ride && <div className="ride-status" style={{ padding: '12px', background: '#1e1e1e', borderRadius: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>Ride {ride.id.slice(0, 8)}</b><span className="capitalize" style={{ color: '#ff7a00' }}>{statusText}</span></div><button onClick={cancel} style={{ width: '100%', marginTop: '10px' }}>Cancel ride</button></div>}
      {message && <div className="error" style={{ color: '#ff4444', marginTop: '8px' }}>{message}</div>}
      <div style={{ height: '20px' }} />
    </section>
  </div>
}