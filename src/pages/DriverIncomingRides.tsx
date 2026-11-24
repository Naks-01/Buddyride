import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type RideRequest = {
  id: string
  ride_id: string
  driver_id: string
  status: string
  rides?: {
    id: string
    pickup_address: string
    dropoff_address: string
    pickup_zone_name: string
    fare: number
    ride_type: string
    ride_category?: string
    category?: string
    status: string
  }
}

// ===== YOUR 3 CATEGORIES - MATCHES SUPABASE =====
const RIDE_CATEGORIES: Record<string, { label: string, seats: string, icon: string }> = {
  buddy_lite: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  buddy_plus: { label: 'Buddy Plus', seats: '3 seats', icon: '🚗' },
  buddy_max: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  // old values fallback
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

  useEffect(() => {
    async function init() {
      // 1. What zones did this driver pick? (Seshego, etc.)
      const { data: vehicle } = await supabase.from('driver_vehicles').select('service_zones').eq('driver_id', driverId).maybeSingle()
      const zones = vehicle?.service_zones || []
      setDriverZones(zones)

      // Map IDs to names for display
      if (zones.length > 0) {
        const { data: z } = await supabase.from('service_zones').select('id,name').in('id', zones)
        if (z) setZoneNames(Object.fromEntries(z.map((x: any) => [x.id, x.name])))
      }

      // 2. Load pending requests ONLY for this driver (zoneMatching.ts already filtered by zone)
      const { data, error } = await supabase
        .from('ride_requests')
        .select('*, rides(*)')
        .eq('driver_id', driverId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (!error && data) setRequests(data as any)
      setLoading(false)
    }
    void init()

    // 3. LIVE listener - ONLY this driver's requests (no Tzaneen leak)
    const ch = supabase.channel(`driver-${driverId}-rides`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ride_requests',
        filter: `driver_id=eq.${driverId}`
      }, payload => {
        const newReq = payload.new as any
        if (newReq.status !== 'pending') return
        // Fetch full ride details
        void supabase.from('rides').select('*').eq('id', newReq.ride_id).single().then(({ data: ride }) => {
          setRequests(prev => [{ ...newReq, rides: ride }, ...prev])
          // Optional: Play sound / vibrate
          if ('vibrate' in navigator) navigator.vibrate(200)
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'ride_requests',
        filter: `driver_id=eq.${driverId}`
      }, payload => {
        const updated = payload.new as any
        if (updated.status !== 'pending') {
          setRequests(prev => prev.filter(r => r.id !== updated.id))
        }
      })
      .subscribe()

    return () => { void supabase.removeChannel(ch) }
  }, [driverId])

  async function handleAccept(req: RideRequest) {
    setMsg('')
    // Accept: Update ride_requests + rides
    const { error: reqErr } = await supabase.from('ride_requests').update({ status: 'accepted' }).eq('id', req.id)
    if (reqErr) { setMsg('Could not accept: ' + reqErr.message); return }

    const { error: rideErr } = await supabase.from('rides').update({ status: 'accepted', driver_id: driverId }).eq('id', req.ride_id)
    if (rideErr) { setMsg('Could not update ride: ' + rideErr.message); return }

    // Reject other drivers for same ride (Bolt style - first accept wins)
    await supabase.from('ride_requests').update({ status: 'rejected' }).eq('ride_id', req.ride_id).neq('driver_id', driverId)

    // TODO: Deduct bundle credit here via RPC
    setMsg(`✅ Accepted! Go to ${req.rides?.dropoff_address}`)
    setRequests(prev => prev.filter(r => r.id !== req.id))
  }

  async function handleDecline(reqId: string) {
    await supabase.from('ride_requests').update({ status: 'declined' }).eq('id', reqId)
    setRequests(prev => prev.filter(r => r.id !== reqId))
  }

  return <main style={{ minHeight: '100vh', background: '#0e0e10', color: 'white', padding: 16 }}>
    <button onClick={onBack} style={{ background: '#242428', color: 'white', border: '1px solid #333', padding: '8px 14px', borderRadius: 8 }}>← Back Home</button>
    <h1 style={{ marginTop: 12 }}>Incoming Rides — Your Zones</h1>
    <p style={{ fontSize: 13, color: '#9ca3af' }}>
      You drive in: {driverZones.length ? driverZones.map(id => zoneNames[id] || id).join(', ') : 'No zones picked — go to Driver Onboarding'} 
    </p>
    <p style={{ fontSize: 12, color: '#f59e0b', background: '#451a03', padding: 8, borderRadius: 8 }}>
      ✅ Filter ON: You will ONLY get requests from {driverZones.length ? driverZones.map(id => zoneNames[id] || id).join(', ') : 'your zones'}. 
      No more Tzaneen requests if you drive Seshego.
    </p>
    {msg && <p style={{ background: '#14532d', color: '#86efac', padding: 10, borderRadius: 8 }}>{msg}</p>}
    {loading ? <p>Loading...</p> : requests.length === 0 ? (
      <div style={{ marginTop: 20, padding: 20, background: '#18181b', borderRadius: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <p>No ride requests in your zones right now.</p>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>Stay online in {driverZones.map(id => zoneNames[id] || id).join(', ') || 'Seshego'}. When rider in Seshego requests, you will see it here.</p>
      </div>
    ) : requests.map(req => {
      const cat = categoryForRide(req.rides)
      return (
      <section key={req.id} style={{ background: '#18181b', border: '1px solid #333', padding: 16, borderRadius: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <strong style={{ fontSize: 16 }}>{req.rides?.pickup_zone_name || 'Ride'}</strong>
          <strong style={{ color: '#22c55e' }}>R{req.rides?.fare?.toFixed(2)}</strong>
        </div>
        <div style={{ marginTop: 8, display: 'inline-block', padding: '6px 12px', borderRadius: 999, background: '#0066FF', color: 'white', fontWeight: 800, fontSize: 13 }}>
          {cat.icon} {cat.label} • {cat.seats}
        </div>
        <div style={{ marginTop: 8, fontSize: 14 }}>
          <div>📍 From: {req.rides?.pickup_address}</div>
          <div>🏁 To: {req.rides?.dropoff_address}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Type: {cat.label} • {cat.seats} • Zone: {req.rides?.pickup_zone_name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => void handleDecline(req.id)} style={{ flex: 1, padding: 12, borderRadius: 8, background: '#333', color: 'white', border: 0, fontWeight: 700 }}>Decline</button>
          <button onClick={() => void handleAccept(req)} style={{ flex: 2, padding: 12, borderRadius: 8, background: '#22c55e', color: 'black', border: 0, fontWeight: 800 }}>Accept → R{req.rides?.fare?.toFixed(0)}</button>
        </div>
      </section>
      )
    })}
  </main>
}