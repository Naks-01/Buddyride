import { useEffect, useRef, useState } from 'react'
import * as tt from '@tomtom-international/web-sdk-maps'
import '@tomtom-international/web-sdk-maps/dist/maps.css'
import { getOSMRoute as getRoute } from '../lib/osm'
import { createRealtimeChannel } from '../lib/realtime'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]
const PASSENGER_WAIT_SECONDS = 5 * 60

type RouteData = Awaited<ReturnType<typeof getRoute>>

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

const ARRIVED_STATUSES = ['arrived', 'driver_arrived']
const isArrivedStatus = (s: string) => ARRIVED_STATUSES.includes(s.toLowerCase())

export function DriverNavigationView({ rideId, profile, onBack }: { rideId: string; profile: Profile; onBack: () => void }) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const destMarkerRef = useRef<any>(null)
  const latestLocationRef = useRef<[number, number] | null>(null)
  const lastLocationSyncRef = useRef(0)
  const arrivedAtRef = useRef<number | null>(null)
  const userHasInteractedRef = useRef(false)
  
  const [ride, setRide] = useState<Ride | null>(null)
  const [rideLoading, setRideLoading] = useState(true)
  const [rideError, setRideError] = useState('')
  const [location, setLocation] = useState<[number, number] | null>(null)
  const [bearing, setBearing] = useState(0)
  const [locationError, setLocationError] = useState('')
  const [routeData, setRouteData] = useState<RouteData | null>(null)
  const [routeUpdatedAt, setRouteUpdatedAt] = useState(0)
  const [routeError, setRouteError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [followDriver, setFollowDriver] = useState(true)
  const [threeDimensional, setThreeDimensional] = useState(true)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [actionBusy, setActionBusy] = useState(false)
  const [passenger, setPassenger] = useState<{ full_name?: string, phone?: string } | null>(null)
  const [arrivedAt, setArrivedAt] = useState<number | null>(null)

  const rideStatus = String(ride?.status || '').toLowerCase()
  const isOnPickupLeg = ['accepted', 'driver_arriving', 'arrived', 'driver_arrived', 'driver_assigned'].includes(rideStatus)
  const target: [number, number] | null = ride
    ? isOnPickupLeg ? [ride.pickup_lng, ride.pickup_lat] : [ride.dropoff_lng, ride.dropoff_lat]
    : null

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let active = true
    setRideLoading(true)
    supabase.from('rides').select('*').eq('id', rideId).eq('driver_id', profile.id).single()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) setRideError(error?.message || 'Ride not assigned to you')
        else {
          setRide(data as Ride)
          if ((data as any).passenger_id) {
            supabase.from('profiles').select('full_name,phone').eq('id', (data as any).passenger_id).single().then(({ data: p }) => { if (p) setPassenger(p as any) })
          }
          if (isArrivedStatus(String((data as any).status)) && (data as any).arrived_at) {
            const t = new Date((data as any).arrived_at).getTime()
            arrivedAtRef.current = t
            setArrivedAt(t)
          }
        }
        setRideLoading(false)
      })
    const channel = createRealtimeChannel(`driver-nav-${rideId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
        p => { if (active && p.new) { setRide(p.new as Ride); if (isArrivedStatus(String((p.new as any).status)) && !arrivedAtRef.current) { const t = Date.now(); arrivedAtRef.current = t; setArrivedAt(t) } } }
      ).subscribe()
    return () => { active = false; void supabase.removeChannel(channel) }
  }, [profile.id, rideId])

  useEffect(() => {
    if (!navigator.geolocation) { setLocationError('Location not available'); return }
    const watchId = navigator.geolocation.watchPosition(pos => {
      const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      if (latestLocationRef.current) {
        const [oldLng, oldLat] = latestLocationRef.current
        const dLng = coords[0] - oldLng; const dLat = coords[1] - oldLat
        if (Math.abs(dLng) > 0.00001 || Math.abs(dLat) > 0.00001) setBearing((Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360)
      }
      latestLocationRef.current = coords
      setLocation(coords); setLocationError('')
      if (Date.now() - lastLocationSyncRef.current < 3000) return
      lastLocationSyncRef.current = Date.now()
      void supabase.from('driver_locations').upsert({ driver_id: profile.id, lat: coords[1], lng: coords[0], is_online: true, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' }).then(()=>{})
      void supabase.from('profiles').update({ current_lat: coords[1], current_lng: coords[0] } as any).eq('id', profile.id).then(()=>{})
    }, err => setLocationError(err.message), { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [profile.id])

  const hasLocation = location !== null

  useEffect(() => {
    if (!ride || !target) return
    let active = true; let refreshing = false
    const refresh = async () => {
      if (refreshing) return
      const origin = latestLocationRef.current; if (!origin) return
      refreshing = true
      try {
        const nextRoute = await getRoute(origin, target)
        if (!active) return
        setRouteData(nextRoute); setRouteUpdatedAt(Date.now()); setRouteError(''); setActiveStepIndex(0)
      } catch (e:any) { if (active) setRouteError(e.message) } finally { refreshing = false }
    }
    void refresh()
    const interval = window.setInterval(refresh, 15000)
    return () => { active = false; window.clearInterval(interval) }
  }, [ride?.id, ride?.status, target?.[0], target?.[1], hasLocation])

  // TOMTOM MAP - REPLACES MAPBOX
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY || 'no-key'
    try {
      const map = tt.map({
        key: apiKey,
        container: mapContainerRef.current as any,
        center: location || POLOKWANE_CENTER,
        zoom: 16,
        dragPan: true,
        scrollZoom: true,
        doubleClickZoom: true,
        touchZoomRotate: true,
      })
      map.on('dragstart', () => { userHasInteractedRef.current = true; setFollowDriver(false) })
      map.on('zoomstart', () => { userHasInteractedRef.current = true })
      map.on('touchstart', () => { userHasInteractedRef.current = true })
      mapRef.current = map
      setMapReady(true)
    } catch (e: any) { setMapError(e.message || 'Map error') }
    return () => { mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; destMarkerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Draw route line on TomTom
  useEffect(() => {
    if (!mapReady || !mapRef.current || !routeData?.geometry?.coordinates) return
    const map = mapRef.current
    const coords = routeData.geometry.coordinates
    if (map.getSource('driver-route')) {
      (map.getSource('driver-route') as any).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })
    } else {
      map.addSource('driver-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } })
      map.addLayer({ id: 'driver-route-shadow', type: 'line', source: 'driver-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#111827', 'line-width': 11, 'line-opacity': 0.3 } })
      map.addLayer({ id: 'driver-route-line', type: 'line', source: 'driver-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': BLUE, 'line-width': 7 } })
    }
  }, [mapReady, routeData])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !location) return
    if (!markerRef.current) {
      const el = document.createElement('div')
      el.innerHTML = `<div style="width:38px;height:38px;border-radius:50%;background:${BLUE};border:3px solid #fff;display:grid;place-items:center;color:#fff;font-size:20px;box-shadow:0 3px 12px #0007">▲</div>`
      markerRef.current = new tt.Marker({ element: el }).setLngLat(location).addTo(map)
    }
    markerRef.current.setLngLat(location)
    if (followDriver && !userHasInteractedRef.current) {
      map.setCenter(location)
      map.setZoom(17)
    }
  }, [bearing, followDriver, location, mapReady, threeDimensional])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !target) return
    const bg = isOnPickupLeg ? BLUE : '#dc2626'
    const emoji = isOnPickupLeg ? '📍' : '🏁'
    if (!destMarkerRef.current) {
      const el = document.createElement('div')
      el.innerHTML = `<div style="width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${bg};border:3px solid #fff;display:grid;place-items:center;box-shadow:0 3px 12px #0007"><span style="transform:rotate(45deg);font-size:18px">${emoji}</span></div>`
      destMarkerRef.current = new tt.Marker({ element: el }).setLngLat(target).addTo(map)
    } else {
      destMarkerRef.current.setLngLat(target)
    }
  }, [mapReady, target?.[0], target?.[1], isOnPickupLeg])

  useEffect(() => {
    if (!location || !routeData?.steps?.length) return
    const steps = routeData.steps as any[]
    let best = activeStepIndex
    for (let i = activeStepIndex; i < steps.length; i++) {
      const loc = steps[i]?.maneuver?.location as [number, number] | undefined
      if (!loc) continue
      const dist = Math.hypot(loc[0] - location[0], loc[1] - location[1])
      if (dist < 0.0009) best = Math.min(i + 1, steps.length - 1)
    }
    if (best !== activeStepIndex) setActiveStepIndex(best)
  }, [location, routeData])

  async function updateRideStatus(status: 'arrived' | 'in_progress') {
    if (!ride) return
    setActionBusy(true)
    setRideError('')
    try {
      const current = String(ride.status).toLowerCase()
      if (status === 'arrived' && !['accepted','driver_assigned','driver_arriving','arrived','driver_arrived'].includes(current)) throw new Error(`Cannot mark arrived from ${current}`)
      if (status === 'in_progress' && !isArrivedStatus(current)) throw new Error(`Cannot start trip from ${current}`)
      const payload: any = { status }
      if (status === 'arrived') payload.arrived_at = new Date().toISOString()
      const { data, error } = await supabase
        .from('rides')
        .update(payload)
        .eq('id', ride.id)
        .eq('driver_id', profile.id)
        .select('*')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Ride changed - refresh and try again')
      setRide(data as Ride)
      if (status === 'arrived') {
        const t = Date.now()
        arrivedAtRef.current = t
        setArrivedAt(t)
      }
    } catch (e:any) { setRideError(e.message) } finally { setActionBusy(false) }
  }

  async function cancelNoShow() {
    if (!ride || !confirm('Passenger did not show after 5 min. Cancel as No-Show?')) return
    setActionBusy(true)
    try {
      const { error } = await supabase
        .from('rides')
        .update({ status: 'cancelled', cancel_reason: 'no_show', cancelled_by: 'driver', cancelled_at: new Date().toISOString() } as any)
        .eq('id', ride.id)
        .eq('driver_id', profile.id)
      if (error) throw error
      onBack()
    } catch (e:any) { setRideError(e.message) } finally { setActionBusy(false) }
  }

  async function sendSos() {
    if (!confirm('Send SOS alert to admin?')) return
    try {
      const { error } = await supabase.from('sos_reports').insert({ user_id: profile.id, ride_id: ride?.id, message: 'Driver SOS from navigation', status: 'open' } as any)
      if (error) throw error
      alert('SOS sent to admin. Help is on the way.')
    } catch (e:any) {
      alert(`SOS failed: ${e.message || String(e)}. Call admin directly.`)
    }
  }

  if (rideLoading) return <main style={{ padding: 24, background: '#0b0b0c', color: 'white', minHeight: '100dvh' }}>Loading navigation…</main>
  if (rideError || !ride) return <main style={{ padding: 24, background: '#0b0b0c', color: 'white', minHeight: '100dvh' }}><button onClick={onBack} style={{ padding: '10px 16px', borderRadius: 12, background: '#222', color: 'white', border: 0 }}>← Back</button><p style={{ color: '#ff5555', marginTop: 20 }}>{rideError || 'Ride not found'}</p></main>

  const steps = (routeData?.steps || []) as any[]
  const currentStep = steps[Math.min(activeStepIndex, Math.max(steps.length - 1, 0))]
  const instruction = currentStep?.maneuver?.instruction || 'Continue to destination'
  const etaSeconds = routeData ? Math.max(0, Math.ceil(routeData.duration - (Date.now() - routeUpdatedAt) / 1000)) : null
  const waitedSeconds = arrivedAt ? Math.floor((now - arrivedAt) / 1000) : 0
  const isArrived = isArrivedStatus(rideStatus)
  const canNoShow = isArrived && waitedSeconds >= PASSENGER_WAIT_SECONDS
  const waitLeft = isArrived ? Math.max(0, PASSENGER_WAIT_SECONDS - waitedSeconds) : 0

  return (
    <main style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#dbe4e8', color: '#111827', fontFamily: 'system-ui, sans-serif' }}>
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
      <button onClick={onBack} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', left: 14, zIndex: 5, minWidth: 46, minHeight: 46, border: 0, borderRadius: 14, background: '#111827', color: 'white', fontSize: 18, fontWeight: 700 }}>←</button>
      <button onClick={() => sendSos()} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', right: 14, zIndex: 5, minWidth: 46, minHeight: 46, border: 0, borderRadius: 14, background: '#dc2626', color: 'white', fontSize: 18, fontWeight: 800 }}>SOS</button>

      <section style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 68, right: 68, zIndex: 4, minHeight: 78, borderRadius: 16, background: BLUE, color: 'white', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', boxShadow: '0 8px 24px #0005' }}>
        <div style={{ width: 42, height: 42, flex: 'none', borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', color: 'white', fontSize: 26 }}>↑</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{instruction}</div>
          <div style={{ color: '#DCE9FF', fontSize: 13, marginTop: 5 }}>{etaSeconds !== null ? `${Math.floor(etaSeconds/60)}:${String(etaSeconds%60).padStart(2,'0')} to ${isOnPickupLeg ? 'pickup' : 'dropoff'}` : 'Finding route'} • {routeData ? `${routeData.distanceKm.toFixed(1)}km` : ''}</div>
        </div>
      </section>

      <div style={{ position: 'absolute', right: 14, bottom: 'calc(42dvh + 24px)', zIndex: 4, display: 'grid', gap: 10 }}>
        <button onClick={() => { userHasInteractedRef.current = false; setFollowDriver(true) }} style={{ width: 48, height: 48, border: 0, borderRadius: 16, background: 'white', boxShadow: '0 3px 14px #0003', fontWeight: 800, color: BLUE }}>◎</button>
        <button onClick={() => { userHasInteractedRef.current = true; mapRef.current?.zoomIn() }} style={{ width: 48, height: 48, border: 0, borderRadius: 16, background: 'white', boxShadow: '0 3px 14px #0003', fontWeight: 800, color: BLUE, fontSize: 24 }}>+</button>
        <button onClick={() => { userHasInteractedRef.current = true; mapRef.current?.zoomOut() }} style={{ width: 48, height: 48, border: 0, borderRadius: 16, background: 'white', boxShadow: '0 3px 14px #0003', fontWeight: 800, color: BLUE, fontSize: 24 }}>−</button>
        <button onClick={() => setThreeDimensional(v => !v)} style={{ width: 48, height: 48, border: 0, borderRadius: 16, background: 'white', boxShadow: '0 3px 14px #0003', fontWeight: 800, color: BLUE }}>{threeDimensional ? '3D' : '2D'}</button>
      </div>

      <section style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, padding: '18px 20px calc(20px + env(safe-area-inset-bottom))', borderRadius: '24px 24px 0 0', background: '#fff', boxShadow: '0 -8px 32px #0002', maxHeight: '42dvh', overflowY: 'auto' }}>
        <div style={{ width: 42, height: 4, borderRadius: 4, background: '#d1d5db', margin: '-6px auto 15px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ color: BLUE, textTransform: 'uppercase', fontSize: 11, fontWeight: 800 }}>{isOnPickupLeg ? 'Heading to pickup' : 'Passenger on board'}</div><div style={{ fontSize: 19, fontWeight: 800, marginTop: 3 }}>{isOnPickupLeg ? ride.pickup_address : ride.dropoff_address}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 21, fontWeight: 900, color: BLUE }}>{etaSeconds !== null ? `${Math.floor(etaSeconds/60)} min` : '--'}</div><div style={{ color: '#6b7280', fontSize: 12 }}>{routeData?.distanceKm.toFixed(1) || '0'} km</div></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: BLUE_LIGHT, padding: '10px 12px', borderRadius: 12, marginTop: 12 }}>
          <div><div style={{ fontWeight: 800 }}>{passenger?.full_name || 'Passenger'}</div><div style={{ fontSize: 12, color: '#6b7280' }}>Fare: R{(ride as any).fare_amount || (ride as any).fare || '—'} • {isArrived ? `Waiting ${Math.floor(waitedSeconds / 60)}:${String(waitedSeconds % 60).padStart(2,'0')}` : rideStatus}</div></div>
          {passenger?.phone && <a href={`tel:${passenger.phone}`} style={{ padding: '10px 14px', borderRadius: 10, background: BLUE, color: 'white', fontWeight: 800, textDecoration: 'none' }}>📞 Call</a>}
        </div>
        {isArrived && !canNoShow && <p style={{ fontSize: 13, color: '#b45309', background: '#fef3c7', padding: '8px 10px', borderRadius: 8 }}>Waiting for passenger... No-show available in {Math.floor(waitLeft/60)}:{String(waitLeft%60).padStart(2,'0')}</p>}
        {canNoShow && <button disabled={actionBusy} onClick={() => cancelNoShow()} style={{ width: '100%', minHeight: 48, marginTop: 10, border: '1px solid #fecaca', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', fontWeight: 800 }}>Cancel - Passenger No-Show</button>}
        {isOnPickupLeg && !isArrived && (
          <button disabled={actionBusy} onClick={() => void updateRideStatus('arrived')} style={{ width: '100%', minHeight: 50, marginTop: 16, border: 0, borderRadius: 14, background: BLUE, color: 'white', fontSize: 15, fontWeight: 800 }}>{actionBusy ? 'Updating…' : 'I have arrived'}</button>
        )}
        {isArrived && (
          <button disabled={actionBusy} onClick={() => void updateRideStatus('in_progress')} style={{ width: '100%', minHeight: 50, marginTop: 16, border: 0, borderRadius: 14, background: BLUE, color: 'white', fontSize: 15, fontWeight: 800 }}>{actionBusy ? 'Updating…' : 'Start Trip → Passenger In'}</button>
        )}
        {rideStatus === 'in_progress' && <div style={{ marginTop: 16, textAlign: 'center', color: '#6b7280' }}>Drive to destination - Complete in DriverHome</div>}
      </section>

      {(rideError || locationError || routeError || mapError) && (
        <div style={{ position: 'absolute', zIndex: 6, left: 12, right: 12, top: 'calc(env(safe-area-inset-top) + 102px)', padding: '10px 12px', borderRadius: 12, background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>
          {[rideError, locationError, routeError, mapError].filter(Boolean).join(' · ')}
        </div>
      )}
    </main>
  )
}