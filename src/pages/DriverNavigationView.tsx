import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { getRoute } from '../lib/mapbox'
import { supabase, type Profile, type Ride } from '../lib/supabase'

const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]
const PASSENGER_WAIT_SECONDS = 5 * 60
const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

type RouteData = Awaited<ReturnType<typeof getRoute>>
type NavigationStep = {
  distance?: number
  duration?: number
  maneuver?: {
    instruction?: string
    location?: [number, number]
    modifier?: string
  }
}

type Props = {
  rideId: string
  profile: Profile
  onBack: () => void
}

function distanceInMeters(from: [number, number], to: [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const [lng1, lat1] = from.map(radians)
  const [lng2, lat2] = to.map(radians)
  const deltaLat = lat2 - lat1
  const deltaLng = lng2 - lng1
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isPickupLeg(status: string) {
  return ['accepted', 'driver_arriving', 'arrived', 'driver_arrived'].includes(status)
}

function isArrived(status: string) {
  return status === 'arrived' || status === 'driver_arrived'
}

export function DriverNavigationView({ rideId, profile, onBack }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const latestLocationRef = useRef<[number, number] | null>(null)
  const lastLocationSyncRef = useRef(0)
  const waitingDeadlineRef = useRef<number | null>(null)
  const [ride, setRide] = useState<Ride | null>(null)
  const [rideLoading, setRideLoading] = useState(true)
  const [rideError, setRideError] = useState('')
  const [location, setLocation] = useState<[number, number] | null>(null)
  const [bearing, setBearing] = useState(0)
  const [locationError, setLocationError] = useState('')
  const [locationSyncError, setLocationSyncError] = useState('')
  const [routeData, setRouteData] = useState<RouteData | null>(null)
  const [routeUpdatedAt, setRouteUpdatedAt] = useState(0)
  const [routeError, setRouteError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [followDriver, setFollowDriver] = useState(true)
  const [threeDimensional, setThreeDimensional] = useState(true)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [waitingSeconds, setWaitingSeconds] = useState<number | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const rideStatus = String(ride?.status || '').toLowerCase()
  const isOnPickupLeg = isPickupLeg(rideStatus)
  const target: [number, number] | null = ride
    ? isOnPickupLeg
      ? [ride.pickup_lng, ride.pickup_lat]
      : [ride.dropoff_lng, ride.dropoff_lat]
    : null
  const steps = (routeData?.steps || []) as NavigationStep[]
  const currentStep = steps[Math.min(activeStepIndex, Math.max(steps.length - 1, 0))]
  const instruction = currentStep?.maneuver?.instruction || 'Continue to your destination'
  const distanceToTurn = currentStep?.maneuver?.location && location
    ? distanceInMeters(location, currentStep.maneuver.location)
    : currentStep?.distance
  const distanceText = distanceToTurn === undefined
    ? 'Finding route'
    : distanceToTurn >= 1000
      ? `${(distanceToTurn / 1000).toFixed(1)} km`
      : `${Math.max(10, Math.ceil(distanceToTurn / 10) * 10)} m`
  const etaSeconds = routeData
    ? Math.max(0, Math.ceil(routeData.duration - Math.max(0, now - routeUpdatedAt) / 1000))
    : null

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let active = true
    setRideLoading(true)
    setRideError('')

    void supabase
      .from('rides')
      .select('*')
      .eq('id', rideId)
      .eq('driver_id', profile.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setRideError(`Could not load this ride: ${error.message}`)
        } else if (!data) {
          setRideError('This ride is not assigned to your driver account.')
        } else {
          setRide(data as Ride)
        }
        setRideLoading(false)
      })

    const channel = supabase
      .channel(`driver-navigation-ride-${rideId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rides',
        filter: `id=eq.${rideId}`,
      }, payload => {
        if (active && payload.eventType !== 'DELETE') setRide(payload.new as Ride)
      })
      .subscribe((status, subscribeError) => {
        if (!active) return
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRideError(`Ride updates are unavailable: ${subscribeError?.message || status}`)
        }
      })

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [profile.id, rideId])

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Location services are not available in this browser.')
      return
    }

    const watchId = navigator.geolocation.watchPosition(position => {
      const coordinates: [number, number] = [position.coords.longitude, position.coords.latitude]
      if (latestLocationRef.current) {
        const [oldLng, oldLat] = latestLocationRef.current
        const deltaLng = coordinates[0] - oldLng
        const deltaLat = coordinates[1] - oldLat
        if (Math.abs(deltaLng) > 0.00001 || Math.abs(deltaLat) > 0.00001) {
          setBearing((Math.atan2(deltaLng, deltaLat) * 180 / Math.PI + 360) % 360)
        }
      }
      latestLocationRef.current = coordinates
      setLocation(coordinates)
      setLocationError('')

      if (Date.now() - lastLocationSyncRef.current < 3000) return
      lastLocationSyncRef.current = Date.now()
      void (async () => {
        try {
          const { error } = await supabase
            .from('driver_locations')
            .upsert({
              driver_id: profile.id,
              lat: coordinates[1],
              lng: coordinates[0],
              is_online: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'driver_id' })
          if (error) setLocationSyncError(`Could not share your live location: ${error.message}`)
          else setLocationSyncError('')
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          setLocationSyncError(`Could not share your live location: ${message}`)
        }
      })()
    }, error => {
      setLocationError(`Could not read your location: ${error.message}`)
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [profile.id])

  useEffect(() => {
    if (!ride || !location || !target) return
    let active = true
    const refreshRoute = async () => {
      const origin = latestLocationRef.current || location
      try {
        const nextRoute = await getRoute(origin, target)
        if (!active) return
        setRouteData(nextRoute)
        setRouteUpdatedAt(Date.now())
        setRouteError('')
        setActiveStepIndex(0)
      } catch (error: unknown) {
        if (!active) return
        const message = error instanceof Error ? error.message : String(error)
        setRouteError(`Could not calculate the Mapbox route: ${message}`)
      }
    }

    void refreshRoute()
    const interval = window.setInterval(() => { void refreshRoute() }, 30000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [ride?.id, ride?.status, Boolean(location), target?.[0], target?.[1]])

  useEffect(() => {
    if (!location || steps.length === 0) return
    setActiveStepIndex(current => {
      let next = Math.min(current, steps.length - 1)
      while (next < steps.length - 1) {
        const maneuverLocation = steps[next]?.maneuver?.location
        if (!maneuverLocation || distanceInMeters(location, maneuverLocation) > 35) break
        next += 1
      }
      return next
    })
  }, [location, routeData])

  useEffect(() => {
    if (!mapContainerRef.current || !mapboxToken) {
      if (!mapboxToken) setMapError('Mapbox is not configured. Set VITE_MAPBOX_TOKEN to enable navigation.')
      return
    }

    mapboxgl.accessToken = mapboxToken
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/navigation-day-v1',
      center: location || POLOKWANE_CENTER,
      zoom: 16,
      pitch: 55,
      antialias: true,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false, showZoom: false }), 'bottom-left')
    map.on('load', () => {
      if (!map.getSource('driver-route')) {
        map.addSource('driver-route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
        })
        map.addLayer({
          id: 'driver-route-shadow',
          type: 'line',
          source: 'driver-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#111827', 'line-width': 11, 'line-opacity': 0.3 },
        })
        map.addLayer({
          id: 'driver-route-line',
          type: 'line',
          source: 'driver-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#17c987', 'line-width': 7 },
        })
      }
      setMapReady(true)
    })
    map.on('error', event => {
      if (event.error.message) setMapError(`Mapbox map error: ${event.error.message}`)
    })

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !location) return
    if (!markerRef.current) {
      const element = document.createElement('div')
      element.innerHTML = '<div style="width:38px;height:38px;border-radius:50%;background:#111827;border:3px solid #fff;display:grid;place-items:center;color:#17c987;font-size:20px;box-shadow:0 3px 12px #0007">▲</div>'
      markerRef.current = new mapboxgl.Marker({ element, rotationAlignment: 'map' }).setLngLat(location).addTo(map)
    }
    markerRef.current.setLngLat(location).setRotation(bearing)
    if (followDriver) {
      map.easeTo({
        center: location,
        bearing: threeDimensional ? bearing : 0,
        pitch: threeDimensional ? 55 : 0,
        zoom: 17,
        duration: 500,
      })
    }
  }, [bearing, followDriver, location, mapReady, threeDimensional])

  useEffect(() => {
    const source = mapRef.current?.getSource('driver-route') as mapboxgl.GeoJSONSource | undefined
    const coordinates = routeData?.geometry?.coordinates
    if (!source || !coordinates) return
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    })
  }, [mapReady, routeData])

  useEffect(() => {
    if (!ride || !isArrived(rideStatus)) {
      waitingDeadlineRef.current = null
      setWaitingSeconds(null)
      if (ride && ['in_progress', 'picked_up', 'en_route', 'completed', 'cancelled'].includes(rideStatus)) {
        window.localStorage.removeItem(`buddyride-wait-${ride.id}`)
      }
      return
    }

    const key = `buddyride-wait-${ride.id}`
    const storedDeadline = Number(window.localStorage.getItem(key))
    const deadline = Number.isFinite(storedDeadline) && storedDeadline > now
      ? storedDeadline
      : now + PASSENGER_WAIT_SECONDS * 1000
    waitingDeadlineRef.current = deadline
    window.localStorage.setItem(key, String(deadline))
    setWaitingSeconds(Math.max(0, Math.ceil((deadline - now) / 1000)))
  }, [ride?.id, rideStatus])

  useEffect(() => {
    if (waitingDeadlineRef.current === null) return
    setWaitingSeconds(Math.max(0, Math.ceil((waitingDeadlineRef.current - now) / 1000)))
  }, [now])

  function setMapFollow(enabled: boolean) {
    setFollowDriver(enabled)
    if (enabled && location) {
      mapRef.current?.easeTo({ center: location, zoom: 17, duration: 500 })
    }
  }

  const backToHome = () => {
    onBack()
  }

  async function updateRideStatus(status: 'arrived' | 'in_progress') {
    if (!ride) return
    setActionBusy(true)
    setRideError('')
    try {
      const { data, error } = await supabase
        .from('rides')
        .update({ status })
        .eq('id', ride.id)
        .eq('driver_id', profile.id)
        .select('*')
        .single()
      if (error) throw error
      setRide(data as Ride)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setRideError(`Could not update ride status: ${message}`)
    } finally {
      setActionBusy(false)
    }
  }

  if (rideLoading) {
    return <main style={pageStyle}><p>Loading ride navigation…</p></main>
  }

  if (rideError || !ride) {
    return (
      <main style={pageStyle}>
        <button type="button" onClick={backToHome} style={backButtonStyle}>← Driver home</button>
        <p role="alert">{rideError || 'Ride not found.'}</p>
      </main>
    )
  }

  if (['completed', 'cancelled'].includes(rideStatus)) {
    return (
      <main style={pageStyle}>
        <button type="button" onClick={backToHome} style={backButtonStyle}>← Driver home</button>
        <h1>Ride {rideStatus}</h1>
        <p>This ride is no longer active.</p>
      </main>
    )
  }

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const etaText = etaSeconds === null ? 'Calculating ETA' : `${formatTime(etaSeconds)} to ${isOnPickupLeg ? 'pickup' : 'destination'}`
  const waitingText = waitingSeconds === null
    ? null
    : waitingSeconds === 0
      ? 'Waiting time complete'
      : `Passenger wait ${formatTime(waitingSeconds)}`

  return (
    <main style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#dbe4e8', color: '#111827', fontFamily: 'system-ui, sans-serif' }}>
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />

      <button type="button" aria-label="Back to driver home" onClick={backToHome} style={{ ...backButtonStyle, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', left: 14, zIndex: 5 }}>
        ←
      </button>

      <section aria-live="polite" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 68, right: 14, zIndex: 4, minHeight: 78, borderRadius: 16, background: '#050505', color: 'white', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', boxShadow: '0 8px 24px #0005' }}>
        <div aria-hidden="true" style={{ width: 42, height: 42, flex: 'none', borderRadius: 12, background: '#171717', display: 'grid', placeItems: 'center', color: '#35df9c', fontSize: 26 }}>
          {currentStep?.maneuver?.modifier?.includes('left') ? '↰' : currentStep?.maneuver?.modifier?.includes('right') ? '↱' : '↑'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{instruction}</div>
          <div style={{ color: '#c6c6c6', fontSize: 13, marginTop: 5 }}>{distanceText} · {etaText}</div>
        </div>
      </section>

      <div style={{ position: 'absolute', right: 14, bottom: 'calc(42dvh + 24px + env(safe-area-inset-bottom))', zIndex: 4, display: 'grid', gap: 10 }}>
        <button type="button" aria-label="Center on driver" onClick={() => setMapFollow(true)} style={controlButtonStyle}>◎</button>
        <button type="button" aria-label="Toggle map perspective" onClick={() => setThreeDimensional(value => !value)} style={controlButtonStyle}>{threeDimensional ? '3D' : '2D'}</button>
        <button type="button" aria-label={followDriver ? 'Stop following driver' : 'Follow driver'} onClick={() => setMapFollow(!followDriver)} style={controlButtonStyle}>{followDriver ? '●' : '○'}</button>
      </div>

      <section style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, padding: '18px 20px calc(20px + env(safe-area-inset-bottom))', borderRadius: '24px 24px 0 0', background: '#fff', boxShadow: '0 -8px 32px #0002', maxHeight: '42dvh', overflowY: 'auto' }}>
        <div style={{ width: 42, height: 4, borderRadius: 4, background: '#d1d5db', margin: '-6px auto 15px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>
              {isArrived(rideStatus) ? 'At pickup' : isOnPickupLeg ? 'Heading to pickup' : 'Passenger on board'}
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, marginTop: 3 }}>{isOnPickupLeg ? ride.pickup_address : ride.dropoff_address}</div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none' }}>
            <div style={{ color: '#111827', fontSize: 21, fontWeight: 900 }}>{waitingText || etaText}</div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3 }}>{waitingText ? 'Free waiting period' : `${distanceText} to next turn`}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, color: '#6b7280', fontSize: 13 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#17c987' }} />
          <span>{ride.pickup_address}</span>
          <span aria-hidden="true">→</span>
          <span>{ride.dropoff_address}</span>
        </div>
        {isOnPickupLeg && !isArrived(rideStatus) && (
          <button type="button" disabled={actionBusy} onClick={() => void updateRideStatus('arrived')} style={tripActionStyle}>
            {actionBusy ? 'Updating…' : 'I have arrived'}
          </button>
        )}
        {isArrived(rideStatus) && (
          <button type="button" disabled={actionBusy} onClick={() => void updateRideStatus('in_progress')} style={tripActionStyle}>
            {actionBusy ? 'Updating…' : 'Start trip'}
          </button>
        )}
      </section>

      {(rideError || locationError || locationSyncError || routeError || mapError) && (
        <div role="alert" style={{ position: 'absolute', zIndex: 6, left: 12, right: 12, top: 'calc(env(safe-area-inset-top) + 102px)', padding: '10px 12px', borderRadius: 12, background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>
          {[rideError, locationError, locationSyncError, routeError, mapError].filter(Boolean).join(' · ')}
        </div>
      )}
      {!location && !locationError && (
        <div role="status" style={{ position: 'absolute', top: '50%', left: 12, right: 12, zIndex: 2, textAlign: 'center', color: '#374151', fontWeight: 700 }}>Getting your live location…</div>
      )}
      {mapError && <div style={{ position: 'absolute', inset: '30% 12px auto', zIndex: 1, textAlign: 'center', color: '#991b1b' }}>{mapError}</div>}
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100dvh',
  padding: 24,
  background: '#0b0b0c',
  color: 'white',
  fontFamily: 'system-ui, sans-serif',
}

const backButtonStyle: React.CSSProperties = {
  minWidth: 46,
  minHeight: 46,
  border: 0,
  borderRadius: 14,
  background: '#111827',
  color: 'white',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
}

const controlButtonStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  border: 0,
  borderRadius: 16,
  background: 'white',
  color: '#111827',
  boxShadow: '0 3px 14px #0003',
  fontWeight: 800,
  fontSize: 18,
  cursor: 'pointer',
}

const tripActionStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 50,
  marginTop: 16,
  border: 0,
  borderRadius: 14,
  background: '#111827',
  color: 'white',
  fontSize: 15,
  fontWeight: 800,
  cursor: 'pointer',
}
