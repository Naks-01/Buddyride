import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Props = {
  center: [number, number]
  driverLocation?: [number, number]
  route?: any
  bearing?: number
  speedKmh?: number
  isNavigating?: boolean
  followDriver?: boolean
  theme?: 'dark' | 'light' | string
}

// FIX: Parse ALL route formats - TomTom raw + array + GeoJSON
function parseRoute(route: any): [number, number][] {
  if (!route) return []
  try {
    // 1. TomTom raw: { routes: [{ legs: [{ points: [...] }] }] }
    if (route.routes?.[0]?.legs) {
      const pts: [number, number][] = []
      for (const leg of route.routes[0].legs) {
        for (const p of leg.points || []) {
          if (p.latitude !== undefined) pts.push([p.latitude, p.longitude])
        }
      }
      if (pts.length >= 2) return pts
    }
    // 2. TomTom points directly: { points: [{latitude, longitude}] }
    if (Array.isArray(route.points) && route.points[0]?.latitude !== undefined) {
      return route.points.map((p: any) => [p.latitude, p.longitude] as [number, number])
    }
    // 3. Array of {latitude, longitude}
    if (Array.isArray(route) && route.length > 0 && route[0]?.latitude !== undefined) {
      return route.map((p: any) => [p.latitude, p.longitude] as [number, number])
    }
    // 4. Array of {lat, lng}
    if (Array.isArray(route) && route.length > 0 && route[0]?.lat !== undefined) {
      return route.map((p: any) => [p.lat, p.lng ?? p.lon] as [number, number])
    }
    // 5. Array of [lng, lat]
    if (Array.isArray(route) && route.length > 0 && Array.isArray(route[0])) {
      return route.map((c: any) => [c[1], c[0]] as [number, number])
    }
    // 6. GeoJSON Feature / FeatureCollection / LineString / MultiLineString
    let coords: any = null
    if (route.type === 'FeatureCollection' && route.features?.[0]?.geometry?.coordinates) coords = route.features[0].geometry.coordinates
    else if (route.type === 'Feature' && route.geometry?.coordinates) coords = route.geometry.coordinates
    else if (route.geometry?.coordinates) coords = route.geometry.coordinates
    else if (route.coordinates) coords = route.coordinates
    if (Array.isArray(coords) && coords.length > 0) {
      if (typeof coords[0]?.[0] === 'number') return coords.map((c: any) => [c[1], c[0]] as [number, number])
      if (Array.isArray(coords[0]?.[0])) return coords[0].map((c: any) => [c[1], c[0]] as [number, number])
    }
  } catch {}
  return []
}

export function DriverTomTomMap({ center, driverLocation, route, bearing = 0, followDriver = true, theme = 'light' }: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const followRef = useRef(followDriver)
  useEffect(() => { followRef.current = followDriver }, [followDriver])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: false,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      keyboard: true,
      zoomSnap: 0.5,
      zoomDelta: 1,
      minZoom: 2,
      maxZoom: 22,
      maxBoundsViscosity: 0,
    } as any).setView([center[1], center[0]], 16)
    mapRef.current = map
    const t1 = setTimeout(() => map.invalidateSize(), 100)
    const t2 = setTimeout(() => map.invalidateSize(), 600)
    const t3 = setTimeout(() => map.invalidateSize(), 1500)
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); window.removeEventListener('resize', onResize); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    const KEY = import.meta.env.VITE_TOMTOM_API_KEY as string
    console.log('[DriverMap] TomTom key exists?', !!KEY)
    if (!KEY || KEY === 'undefined') {
      console.error('[DriverMap] VITE_TOMTOM_API_KEY missing - TomTom only, no fallback')
      return
    }
    const isDark = theme === 'dark'
    const url = isDark
      ? `https://api.tomtom.com/map/1/tile/basic/night/{z}/{x}/{y}.png?key=${KEY}`
      : `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${KEY}`
    tileLayerRef.current = L.tileLayer(url, { minZoom: 2, maxZoom: 22, maxNativeZoom: 19, attribution: '&copy; TomTom' })
      .on('tileerror', () => {
        console.error('[DriverMap] TomTom tile error - check key / quota')
      })
      .addTo(map)
  }, [theme])

  useEffect(() => {
    if (!mapRef.current || !driverLocation) return
    const latLng: any = [driverLocation[1], driverLocation[0]]
    if (!driverMarkerRef.current) {
      const icon = L.divIcon({ html: `<div style="width:40px;height:40px;border-radius:50%;background:#0066FF;border:3px solid white;display:grid;place-items:center;color:white;transform:rotate(${bearing}deg)">▲</div>`, className: '', iconSize: [40,40], iconAnchor: [20,20] })
      driverMarkerRef.current = L.marker(latLng, { icon }).addTo(mapRef.current)
    } else {
      driverMarkerRef.current.setLatLng(latLng)
      try { (driverMarkerRef.current.getElement() as any).firstChild.style.transform = `rotate(${bearing}deg)` } catch {}
    }
    if (followRef.current) {
      mapRef.current.setView([driverLocation[1], driverLocation[0]], mapRef.current.getZoom(), { animate: false })
    }
  }, [driverLocation, bearing])

  // POLYLINE - FIXED
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!route) {
      if (routeLineRef.current) map.removeLayer(routeLineRef.current)
      routeLineRef.current = null
      return
    }
    const latLngs = parseRoute(route)
    console.log('[Driver Polyline] points:', latLngs.length, 'route type:', Array.isArray(route) ? 'array' : route?.type || Object.keys(route || {}))
    if (latLngs.length < 2) {
      console.warn('[Driver Polyline] No valid points - check what DriverHome passes as route')
      return
    }
    if (!routeLineRef.current) {
      routeLineRef.current = L.polyline(latLngs, { color: '#0066FF', weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map)
    } else {
      routeLineRef.current.setLatLngs(latLngs)
    }
    routeLineRef.current.bringToFront()
    // Only fit once when route first appears - don't fight followDriver
    // If you want auto-zoom to route, uncomment:
    // map.fitBounds(routeLineRef.current.getBounds(), { padding: [60, 60] })
  }, [route])

  // FIX: screenshot bug - container must have real height, not 100% of unknown parent
  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: '100vh', background: '#e5e7eb', zIndex: 0 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '100vh' }} />
    </div>
  )
}