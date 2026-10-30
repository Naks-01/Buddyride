import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { getRoute } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]
const PASSENGER_WAIT_SECONDS = 5 * 60
const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

type RouteData = Awaited<ReturnType<typeof getRoute>>

export function DriverNavigationView({ rideId, profile, onBack }: { rideId: string; profile: Profile; onBack: () => void }) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const latestLocationRef = useRef<[number, number] | null>(null)
  const lastLocationSyncRef = useRef(0)
  
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

  const rideStatus = String(ride?.status || '').toLowerCase()
  const isOnPickupLeg = ['accepted', 'driver_arriving', 'arrived', 'driver_arrived'].includes(rideStatus)
  const target: [number, number] | null = ride
    ? isOnPickupLeg ? [ride.pickup_lng, ride.pickup_lat] : [ride.dropoff_lng, ride.dropoff_lat]
    : null

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  // Load ride + realtime
  useEffect(() => {
    let active = true
    setRideLoading(true)
    supabase.from('rides').select('*').eq('id', rideId).eq('driver_id', profile.id).single()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) setRideError(error?.message || 'Ride not assigned to you')
        else setRide(data as Ride)
        setRideLoading(false)
      })

    const channel = supabase.channel(`driver-nav-${rideId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
        p => { if (active && p.new) setRide(p.new as Ride) }
      ).subscribe()
    return () => { active = false; void supabase.removeChannel(channel) }
  }, [profile.id, rideId])

  // Location watch + sync to BOTH tables (profiles + driver_locations) - FIXED for RLS
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Location not available')
      return
    }
    const watchId = navigator.geolocation.watchPosition(pos => {
      const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      if (latestLocationRef.current) {
        const [oldLng, oldLat] = latestLocationRef.current
        const dLng = coords[0] - oldLng; const dLat = coords[1] - oldLat
        if (Math.abs(dLng) > 0.00001 || Math.abs(dLat) > 0.00001) {
          setBearing((Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360)
        }
      }
      latestLocationRef.current = coords
      setLocation(coords)
      setLocationError('')

      if (Date.now() - lastLocationSyncRef.current < 3000) return
      lastLocationSyncRef.current = Date.now()
      // Silent sync - don't break UI if RLS blocks
      void supabase.from('driver_locations').upsert({
        driver_id: profile.id, lat: coords[1], lng: coords[0], is_online: true, updated_at: new Date().toISOString()
      }, { onConflict: 'driver_id' }).then(()=>{})
      void supabase.from('profiles').update({ current_lat: coords[1], current_lng: coords[0] } as any).eq('id', profile.id).then(()=>{})
    }, err => setLocationError(err.message), { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [profile.id])

  // Route refresh every 30s
  useEffect(() => {
    if (!ride || !location || !target) return
    let active = true
    const refresh = async () => {
      try {
        const origin = latestLocationRef.current || location
        const nextRoute = await getRoute(origin, target)
        if (!active) return
        setRouteData(nextRoute); setRouteUpdatedAt(Date.now()); setRouteError(''); setActiveStepIndex(0)
      } catch (e:any) { if (active) setRouteError(e.message) }
    }
    void refresh()
    const interval = window.setInterval(refresh, 30000)
    return () => { active = false; window.clearInterval(interval) }
  }, [ride?.id, ride?.status, target?.[0], target?.[1], location])

  // Map init
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (!mapboxToken) { setMapError('Add VITE_MAPBOX_TOKEN in Vercel env'); return }
    mapboxgl.accessToken = mapboxToken
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/navigation-day-v1',
      center: location || POLOKWANE_CENTER,
      zoom: 16, pitch: 55, antialias: true
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false, showZoom: false }), 'bottom-left')
    map.on('load', () => {
      if (!map.getSource('driver-route')) {
        map.addSource('driver-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } })
        map.addLayer({ id: 'driver-route-shadow', type: 'line', source: 'driver-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#111827', 'line-width': 11, 'line-opacity': 0.3 } })
        map.addLayer({ id: 'driver-route-line', type: 'line', source: 'driver-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#17c987', 'line-width': 7 } })
      }
      setMapReady(true)
    })
    map.on('error', e => setMapError(e.error?.message || 'Map error'))
    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !location) return
    if (!markerRef.current) {
      const el = document.createElement('div')
      el.innerHTML = '<div style="width:38px;height:38px;border-radius:50%;background:#111827;border:3px solid #fff;display:grid;place-items:center;color:#17c987;font-size:20px;box-shadow:0 3px 12px #0007">▲</div>'
      markerRef.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat(location).addTo(map)
    }
    markerRef.current.setLngLat(location).setRotation(bearing)
    if (followDriver) map.easeTo({ center: location, bearing: threeDimensional ? bearing : 0, pitch: threeDimensional ? 55 : 0, zoom: 17, duration: 500 })
  }, [bearing, followDriver, location, mapReady, threeDimensional])

  useEffect(() => {
    const source = mapRef.current?.getSource('driver-route') as mapboxgl.GeoJSONSource | undefined
    if (!source || !routeData?.geometry?.coordinates) return
    source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeData.geometry.coordinates } })
  }, [mapReady, routeData])

  async function updateRideStatus(status: 'arrived' | 'in_progress') {
    if (!ride) return
    setActionBusy(true)
    try {
      const { data, error } = await supabase.from('rides').update({ status }).eq('id', ride.id).eq('driver_id', profile.id).select('*').single()
      if (error) throw error
      setRide(data as Ride)
    } catch (e:any) { setRideError(e.message) } finally { setActionBusy(false) }
  }

  if (rideLoading) return <main style={{ padding: 24, background: '#0b0b0c', color: 'white', minHeight: '100dvh' }}>Loading navigation…</main>
  if (rideError || !ride) return <main style={{ padding: 24, background: '#0b0b0c', color: 'white', minHeight: '100dvh' }}><button onClick={onBack} style={{ padding: '10px 16px', borderRadius: 12, background: '#222', color: 'white', border: 0 }}>← Back</button><p style={{ color: '#ff5555', marginTop: 20 }}>{rideError || 'Ride not found'}</p></main>

  const steps = (routeData?.steps || []) as any[]
  const currentStep = steps[Math.min(activeStepIndex, Math.max(steps.length - 1, 0))]
  const instruction = currentStep?.maneuver?.instruction || 'Continue to destination'
  const etaSeconds = routeData ? Math.max(0, Math.ceil(routeData.duration - (Date.now() - routeUpdatedAt) / 1000)) : null

  return (
    <main style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#dbe4e8', color: '#111827', fontFamily: 'system-ui, sans-serif' }}>
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />
      <button onClick={onBack} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', left: 14, zIndex: 5, minWidth: 46, minHeight: 46, border: 0, borderRadius: 14, background: '#111827', color: 'white', fontSize: 18, fontWeight: 700 }}>←</button>

      <section style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 68, right: 14, zIndex: 4, minHeight: 78, borderRadius: 16, background: '#050505', color: 'white', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', boxShadow: '0 8px 24px #0005' }}>
        <div style={{ width: 42, height: 42, flex: 'none', borderRadius: 12, background: '#171717', display: 'grid', placeItems: 'center', color: '#35df9c', fontSize: 26 }}>↑</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{instruction}</div>
          <div style={{ color: '#c6c6c6', fontSize: 13, marginTop: 5 }}>{etaSeconds !== null ? `${Math.floor(etaSeconds/60)}:${String(etaSeconds%60).padStart(2,'0')} to ${isOnPickupLeg ? 'pickup' : 'dropoff'}` : 'Finding route'} • {routeData ? `${routeData.distanceKm.toFixed(1)}km` : ''}</div>
        </div>
      </section>

      <div style={{ position: 'absolute', right: 14, bottom: 'calc(42dvh + 24px)', zIndex: 4, display: 'grid', gap: 10 }}>
        <button onClick={() => setFollowDriver(true)} style={{ width: 48, height: 48, border: 0, borderRadius: 16, background: 'white', boxShadow: '0 3px 14px #0003', fontWeight: 800 }}>◎</button>
        <button onClick={() => setThreeDimensional(v => !v)} style={{ width: 48, height: 48, border: 0, borderRadius: 16, background: 'white', boxShadow: '0 3px 14px #0003', fontWeight: 800 }}>{threeDimensional ? '3D' : '2D'}</button>
      </div>

      <section style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, padding: '18px 20px calc(20px + env(safe-area-inset-bottom))', borderRadius: '24px 24px 0 0', background: '#fff', boxShadow: '0 -8px 32px #0002', maxHeight: '42dvh', overflowY: 'auto' }}>
        <div style={{ width: 42, height: 4, borderRadius: 4, background: '#d1d5db', margin: '-6px auto 15px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: 11, fontWeight: 800 }}>{isOnPickupLeg ? 'Heading to pickup' : 'Passenger on board'}</div><div style={{ fontSize: 19, fontWeight: 800, marginTop: 3 }}>{isOnPickupLeg ? ride.pickup_address : ride.dropoff_address}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 21, fontWeight: 900 }}>{etaSeconds !== null ? `${Math.floor(etaSeconds/60)} min` : '--'}</div><div style={{ color: '#6b7280', fontSize: 12 }}>{routeData?.distanceKm.toFixed(1) || '0'} km</div></div>
        </div>
        {isOnPickupLeg && rideStatus !== 'arrived' && (
          <button disabled={actionBusy} onClick={() => void updateRideStatus('arrived')} style={{ width: '100%', minHeight: 50, marginTop: 16, border: 0, borderRadius: 14, background: '#111827', color: 'white', fontSize: 15, fontWeight: 800 }}>{actionBusy ? 'Updating…' : 'I have arrived'}</button>
        )}
        {rideStatus === 'arrived' && (
          <button disabled={actionBusy} onClick={() => void updateRideStatus('in_progress')} style={{ width: '100%', minHeight: 50, marginTop: 16, border: 0, borderRadius: 14, background: '#00d181', color: 'white', fontSize: 15, fontWeight: 800 }}>{actionBusy ? 'Updating…' : 'Start Trip → Passenger In'}</button>
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