import { useEffect, useRef, useState } from 'react'
import * as tt from '@tomtom-international/web-sdk-maps'
import '@tomtom-international/web-sdk-maps/dist/maps.css'

type Props = {
  center: [number, number]
  driverLocation?: [number, number]
  route?: any
  bearing?: number
  speedKmh?: number
  isNavigating?: boolean
  followDriver?: boolean
  theme?: 'dark' | 'light'
  zoom?: number
}

// FIXED: TomTom needs [lng, lat], callers pass [lat, lng] like [-23.9, 29.4]
// SA lat is -35 to -17, SA lng is 16 to 33. If first is negative and second positive, it is [lat, lng] -> swap.
function normalizeLatLng(input: [number, number]): [number, number] {
  const [a, b] = input
  if (a < 0 && b > 0 && a >= -40 && a <= -15 && b >= 15 && b <= 35) return [b, a]
  return [a, b]
}

function distMeters(a: [number, number], b: [number, number]) {
  const R = 6371000
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function DriverTomTomMap({ center, driverLocation, route, bearing, speedKmh, isNavigating, followDriver = true, theme = 'dark', zoom = 14 }: Props) {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<any>(null)
  const markerElRef = useRef<HTMLDivElement | null>(null)
  const routeLayerRef = useRef<string | null>(null)
  const userHasInteractedRef = useRef(false)
  const lastPosRef = useRef<[number, number] | null>(null)
  const [myPos, setMyPos] = useState<[number, number] | null>(null)
  const [mapError, setMapError] = useState('')

  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // FIXED: GPS is already [lng, lat] - do NOT normalize it
        const next: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        // FIXED: Skip jitter under 10m - was re-centering on every 2m wobble
        if (lastPosRef.current && distMeters(lastPosRef.current, next) < 10) return
        lastPosRef.current = next
        setMyPos(next)
      },
      (err) => console.log('GPS blocked:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // FIXED: Normalize center + driverLocation, GPS stays as-is
  const normalizedCenter = normalizeLatLng(center)
  const normalizedDriver = driverLocation ? normalizeLatLng(driverLocation) : undefined
  const activeLocation = normalizedDriver || myPos || normalizedCenter

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY as string | undefined
    if (!apiKey) { setMapError('TomTom map key missing. Set VITE_TOMTOM_API_KEY in .env.local and restart.'); return }
    try {
      const map = tt.map({
        key: apiKey,
        container: containerRef.current as any,
        center: [normalizedCenter[0], normalizedCenter[1]],
        zoom: zoom,
        dragPan: true,
        scrollZoom: true,
        doubleClickZoom: true,
        touchZoomRotate: true,
      })
      mapRef.current = map
      // FIXED: Track real user pan - was only set by +/- buttons
      const onInteract = () => { userHasInteractedRef.current = true }
      map.on('dragstart', onInteract)
      map.on('movestart', onInteract)
      return () => { try { map.off('dragstart', onInteract); map.off('movestart', onInteract) } catch {} map.remove(); mapRef.current = null }
    } catch (e: any) {
      setMapError(e?.message || 'Could not load TomTom map.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // FIXED: Draw route polyline when parent passes it - was ignored
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layerId = 'buddyride-route'
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(layerId)) map.removeSource(layerId)
      routeLayerRef.current = null
      if (!route) return
      // Accept GeoJSON LineString, or array of [lat,lng] / [lng,lat] points
      let coords: [number, number][] = []
      if (Array.isArray(route)) coords = route.map((p: any) => normalizeLatLng(Array.isArray(p) ? [p[0], p[1]] : [p.lng ?? p.lon ?? 0, p.lat ?? 0]))
      else if (route?.geometry?.coordinates) coords = route.geometry.coordinates.map((p: any) => normalizeLatLng([p[0], p[1]]))
      else if (route?.coordinates) coords = route.coordinates.map((p: any) => normalizeLatLng([p[0], p[1]]))
      if (coords.length < 2) return
      map.addSource(layerId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } })
      map.addLayer({ id: layerId, type: 'line', source: layerId, paint: { 'line-color': '#0066FF', 'line-width': 5, 'line-opacity': 0.9 } })
      routeLayerRef.current = layerId
    } catch {}
  }, [route])

  // FIXED: Rotate car marker with bearing - was ignored
  useEffect(() => {
    if (markerElRef.current && typeof bearing === 'number') {
      markerElRef.current.style.transform = `rotate(${bearing}deg)`
    }
  }, [bearing])

  useEffect(() => {
    if (!mapRef.current || !activeLocation) return
    if (!markerRef.current) {
      const el = document.createElement('div')
      el.innerHTML = '🚗'
      el.style.fontSize = '32px'
      el.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))'
      el.style.background = '#0066FF'
      el.style.borderRadius = '50%'
      el.style.width = '48px'
      el.style.height = '48px'
      el.style.display = 'flex'
      el.style.alignItems = 'center'
      el.style.justifyContent = 'center'
      el.style.border = '3px solid white'
      el.style.transition = 'transform 200ms ease'
      markerElRef.current = el
      markerRef.current = new tt.Marker({ element: el }).setLngLat([activeLocation[0], activeLocation[1]]).addTo(mapRef.current)
    } else {
      markerRef.current.setLngLat([activeLocation[0], activeLocation[1]])
    }
    // FIXED: Only auto-center if following, or user has not panned yet
    if (followDriver || !userHasInteractedRef.current) {
      mapRef.current.setCenter([activeLocation[0], activeLocation[1]])
    }
  }, [activeLocation, followDriver])

  const zoomIn = () => {
    if (!mapRef.current) return
    userHasInteractedRef.current = true
    mapRef.current.setZoom(Math.min(mapRef.current.getZoom() + 1, 19))
  }
  const zoomOut = () => {
    if (!mapRef.current) return
    userHasInteractedRef.current = true
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom() - 1, 3))
  }
  const centerMe = () => {
    if (!mapRef.current || !activeLocation) return
    userHasInteractedRef.current = false
    mapRef.current.setCenter([activeLocation[0], activeLocation[1]])
    mapRef.current.setZoom(16)
  }

  if (mapError) {
    return <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: theme === 'dark' ? '#121212' : '#f2f2f2', padding: 16, textAlign: 'center' }}><div><div style={{ fontSize: 32 }}>🗺️</div><p style={{ color: theme === 'dark' ? 'white' : 'black', fontWeight: 700 }}>Map unavailable</p><p style={{ fontSize: 13, color: '#888' }}>{mapError}</p></div></div>
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {typeof speedKmh === 'number' && isNavigating && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 9999, background: 'rgba(0,0,0,0.75)', color: 'white', padding: '8px 12px', borderRadius: 10, fontWeight: 800, fontSize: 14 }}>
          {Math.round(speedKmh)} km/h
        </div>
      )}
      <div style={{ position: 'absolute', bottom: '110px', right: '12px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button onClick={zoomIn} aria-label="Zoom in" style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#0066FF', color: 'white', border: 'none', fontSize: '26px', fontWeight: '900', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', cursor: 'pointer' }}>+</button>
        <button onClick={zoomOut} aria-label="Zoom out" style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#0066FF', color: 'white', border: 'none', fontSize: '26px', fontWeight: '900', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', cursor: 'pointer' }}>−</button>
        <button onClick={centerMe} aria-label="Center on me" style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'white', color: 'black', border: '1px solid #ddd', fontSize: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', cursor: 'pointer' }}>🎯</button>
      </div>
    </div>
  )
}