import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type RideRequest = {
  id: string, ride_id: string, driver_id: string, status: string,
  rides?: { id: string, pickup_address: string, dropoff_address: string, pickup_zone_name: string, fare: number, ride_type: string, ride_category?: string, category?: string, status: string, distance_km?: number }
}

const RIDE_CATEGORIES: Record<string, { label: string, seats: string, icon: string }> = {
  buddy_lite: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  buddy_plus: { label: 'Buddy Plus', seats: '3 seats', icon: '🚗' },
  buddy_max: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  buddy: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  go: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  economy: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  comfort: { label: 'Buddy Plus', seats: '3 seats', icon: '🚗' },
  xl: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  buddy_xl: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  buddy_family: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
}
function categoryForRide(ride: any) {
  const raw = String(ride?.ride_category || ride?.ride_type || ride?.category || 'buddy_plus').toLowerCase().trim()
  return RIDE_CATEGORIES[raw] || RIDE_CATEGORIES.buddy_plus
}

export function DriverIncomingRides({ driverId, onBack }: { driverId: string, onBack: () => void }) {
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [driverZones, setDriverZones] = useState<string[]>([])
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [tripsLeft, setTripsLeft] = useState<number | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    async function init() {
      // FIX: Columns are service_zones (array) + ride_type, not service_area - was always MISSING
      const { data: prof } = await supabase.from('profiles').select('service_zones,ride_type,vehicle_make_model,vehicle_registration').eq('id', driverId).maybeSingle()
      if (prof) setProfile(prof)
      const { data: vehicle } = await supabase.from('driver_vehicles').select('service_zones').eq('driver_id', driverId).maybeSingle()
      const zones = vehicle?.service_zones || (prof as any)?.service_zones || []
      setDriverZones(zones)
      if (zones.length > 0) {
        const { data: z } = await supabase.from('service_zones').select('id,name').in('id', zones)
        if (z) setZoneNames(Object.fromEntries(z.map((x: any) => [x.id, x.name])))
      }
      // FIX: Only active + not expired - was counting expired bundles
      const { data: bundles } = await supabase.from('driver_bundles').select('trips_remaining').eq('driver_id', driverId).eq('status', 'active').gt('trips_remaining', 0).gt('expires_at', new Date().toISOString())
      if (bundles) setTripsLeft(bundles.reduce((s: number, b: any) => s + (b.trips_remaining || 0), 0))
      const { data, error } = await supabase.from('ride_requests').select('*, rides(*)').eq('driver_id', driverId).eq('status', 'pending').order('created_at', { ascending: false })
      if (!error && data) setRequests(data as any)
      setLoading(false)
    }
    void init()
    const ch = supabase.channel(`driver-${driverId}-rides`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${driverId}` }, payload => {
        const newReq = payload.new as any
        if (newReq.status !== 'pending') return
        void supabase.from('rides').select('*').eq('id', newReq.ride_id).single().then(({ data: ride }) => {
          setRequests(prev => prev.some(r => r.id === newReq.id) ? prev : [{ ...newReq, rides: ride }, ...prev])
          if ('vibrate' in navigator) navigator.vibrate(200)
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${driverId}` }, payload => {
        const updated = payload.new as any
        if (updated.status !== 'pending') setRequests(prev => prev.filter(r => r.id !== updated.id))
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [driverId])

  async function handleAccept(req: RideRequest) {
    setMsg('')
    if (tripsLeft !== null && tripsLeft <= 0) { setMsg('No bundle trips left! Buy a bundle to accept rides.'); window.location.assign('/driver/bundles'); return }
    setAccepting(req.id)
    try {
      const { data, error: rpcErr } = await supabase.rpc('accept_ride_with_bundle', { p_ride_id: req.ride_id })
      if (rpcErr) {
        // FIX: No manual fallback - was accepting without deducting bundle, free rides
        setMsg('Could not accept: ' + rpcErr.message + ' - Try again. No credit was taken.')
        return
      }
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (result?.trips_remaining !== undefined) setTripsLeft(result.trips_remaining)
      if (result?.success === false) { setMsg(result?.error || 'Could not accept ride'); return }
      setMsg(`✅ Accepted! ${result?.credits_used || 1} credit used. ${result?.trips_remaining ?? ''} trips left. Go to ${req.rides?.dropoff_address}`)
      setRequests(prev => prev.filter(r => r.id !== req.id))
    } catch (e: any) { setMsg('Could not accept: ' + (e?.message || String(e))) } finally { setAccepting(null) }
  }

  async function handleDecline(reqId: string) {
    await supabase.from('ride_requests').update({ status: 'declined' }).eq('id', reqId)
    setRequests(prev => prev.filter(r => r.id !== reqId))
  }

  const goToOnboarding = () => window.location.assign('/driver/onboarding')
  const missingZones = !profile?.service_zones?.length && driverZones.length === 0
  const missingRideType = !profile?.ride_type

  return <main style={{ minHeight: '100vh', background: '#0e0e10', color: 'white', padding: 16 }}>
    <button onClick={onBack} style={{ background: '#242428', color: 'white', border: '1px solid #333', padding: '8px 14px', borderRadius: 8 }}>← Back Home</button>
    <h1 style={{ marginTop: 12 }}>Incoming Rides — Your Zones</h1>
    {tripsLeft !== null && (
      <p style={{ fontSize: 13, fontWeight: 800, color: tripsLeft === 0 ? '#fca5a5' : '#86efac', background: tripsLeft === 0 ? '#7f1d1d' : '#14532d', padding: 8, borderRadius: 8 }}>
        {tripsLeft} bundle trips left {tripsLeft === 0 ? '- Buy bundle to accept rides' : ''}
        {tripsLeft === 0 && <button onClick={() => window.location.assign('/driver/bundles')} style={{ marginLeft: 8, background: 'white', color: '#7f1d1d', padding: '6px 10px', borderRadius: 8, fontWeight: 900, border: 0 }}>Buy Bundle</button>}
      </p>
    )}
    {profile && (missingZones || missingRideType) && (
      <div style={{ background: '#7f1d1d', color: '#fee2e2', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        ⚠️ Vehicle Details Incomplete<br />
        Service Area: {missingZones ? 'MISSING - Tap to fix' : `${driverZones.length} zones ✅`}<br />
        Ride Type: {profile.ride_type || 'MISSING - Tap to fix'}<br />
        <button onClick={goToOnboarding} style={{ marginTop: 8, background: 'white', color: '#7f1d1d', padding: '8px 14px', borderRadius: 8, fontWeight: 900, border: 0 }}>Fix Now →</button>
      </div>
    )}
    <p style={{ fontSize: 13, color: '#9ca3af' }}>You drive in: {driverZones.length ? driverZones.map(id => zoneNames[id] || id).join(', ') : 'No zones picked — go to Driver Onboarding'}</p>
    {driverZones.length === 0 && (
      <div style={{ background: '#7f1d1d', color: '#fee2e2', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 700 }}>
        ❌ You picked NO zones. You will get ZERO rides until you fix this.
        <button onClick={goToOnboarding} style={{ display: 'block', marginTop: 8, background: 'white', color: '#7f1d1d', padding: '8px 14px', borderRadius: 8, fontWeight: 900, border: 0 }}>Pick Zones Now →</button>
      </div>
    )}
    <p style={{ fontSize: 12, color: '#f59e0b', background: '#451a03', padding: 8, borderRadius: 8 }}>✅ Filter ON: You will ONLY get requests from {driverZones.length ? driverZones.map(id => zoneNames[id] || id).join(', ') : 'your zones'}.</p>
    {msg && <p style={{ background: '#14532d', color: '#86efac', padding: 10, borderRadius: 8 }}>{msg}</p>}
    {loading ? <p>Loading...</p> : requests.length === 0 ? (
      <div style={{ marginTop: 20, padding: 20, background: '#18181b', borderRadius: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <p>No ride requests in your zones right now.</p>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>Stay online in {driverZones.map(id => zoneNames[id] || id).join(', ') || 'Seshego'}. When rider in Seshego requests, you will see it here.</p>
      </div>
    ) : requests.map(req => {
      const cat = categoryForRide(req.rides)
      const credits = (req.rides?.distance_km || 0) > 100 ? 2 : 1
      return (
        <section key={req.id} style={{ background: '#18181b', border: '1px solid #333', padding: 16, borderRadius: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <strong style={{ fontSize: 16 }}>{req.rides?.pickup_zone_name || 'Ride'}</strong>
            <strong style={{ color: '#22c55e' }}>R{req.rides?.fare?.toFixed(2)}</strong>
          </div>
          <div style={{ marginTop: 8, display: 'inline-block', padding: '6px 12px', borderRadius: 999, background: '#0066FF', color: 'white', fontWeight: 800, fontSize: 13 }}>{cat.icon} {cat.label} • {cat.seats}</div>
          <div style={{ marginTop: 8, fontSize: 14 }}>
            <div>📍 From: {req.rides?.pickup_address}</div>
            <div>🏁 To: {req.rides?.dropoff_address}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Type: {cat.label} • {cat.seats} • Zone: {req.rides?.pickup_zone_name} • {req.rides?.distance_km ? `${req.rides.distance_km.toFixed(1)}km` : ''} • {credits} credit{credits > 1 ? 's' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => void handleDecline(req.id)} style={{ flex: 1, padding: 12, borderRadius: 8, background: '#333', color: 'white', border: 0, fontWeight: 700 }}>Decline</button>
            <button disabled={accepting === req.id} onClick={() => void handleAccept(req)} style={{ flex: 2, padding: 12, borderRadius: 8, background: '#22c55e', color: 'black', border: 0, fontWeight: 800, opacity: accepting === req.id ? 0.6 : 1 }}>{accepting === req.id ? 'Accepting...' : `Accept → R${req.rides?.fare?.toFixed(0)} • ${credits} credit${credits > 1 ? 's' : ''}`}</button>
          </div>
        </section>
      )
    })}
  </main>
}