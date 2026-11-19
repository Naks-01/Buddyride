import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY as string

function carIcon() {
  return L.divIcon({
    className: 'car-marker',
    html: `<div style="width:36px;height:36px;background:#0066FF;border:2px solid white;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,.3)">🚗</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
}

function driverIcon() {
  return L.divIcon({
    className: 'driver-marker',
    html: `<div style="width:44px;height:44px;background:#00C853;border:3px solid white;border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 12px rgba(0,0,0,.4)">🚕</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  })
}

function pickupIcon() {
  return L.divIcon({
    className: 'pickup-marker',
    html: `<div style="width:28px;height:28px;background:#00C853;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function dropIcon() {
  return L.divIcon({
    className: 'drop-marker',
    html: `<div style="width:28px;height:28px;background:#FF3B30;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

// --- FIX: Parse ANY route format TomTom / GeoJSON / array ---
function parseRouteToLatLngs(route: any): [number, number][] {
  if (!route) return []
  try {
    // 1. Already an array: [[lng,lat],...] or [{lat,lng},...] or [{latitude,longitude}]
    if (Array.isArray(route)) {
      if (route.length === 0) return []
      if (typeof route[0] === 'number') return [] // single point
      if (Array.isArray(route[0])) return route.map((c: any) => [c[1], c[0]] as [number, number])
      if (route[0]?.latitude !== undefined) return route.map((p: any) => [p.latitude, p.longitude] as [number, number])
      if (route[0]?.lat !== undefined) return route.map((p: any) => [p.lat, p.lng ?? p.lon] as [number, number])
      return []
    }
    // 2. TomTom raw: { routes: [{ legs: [{ points: [...] }] }] }
    if (route.routes?.[0]?.legs) {
      const pts: [number, number][] = []
      for (const leg of route.routes[0].legs) {
        for (const p of leg.points || []) {
          if (p.latitude !== undefined) pts.push([p.latitude, p.longitude])
        }
      }
      if (pts.length >= 2) return pts
    }
    // 3. TomTom summary with points directly: { points: [...] }
    if (Array.isArray(route.points)) {
      if (route.points[0]?.latitude !== undefined) return route.points.map((p: any) => [p.latitude, p.longitude] as [number, number])
      if (Array.isArray(route.points[0])) return route.points.map((c: any) => [c[1], c[0]] as [number, number])
    }
    // 4. GeoJSON: Feature / FeatureCollection / LineString / geometry
    let coords: any = null
    if (route.type === 'FeatureCollection' && route.features?.[0]?.geometry?.coordinates) coords = route.features[0].geometry.coordinates
    else if (route.type === 'Feature' && route.geometry?.coordinates) coords = route.geometry.coordinates
    else if (route.geometry?.coordinates) coords = route.geometry.coordinates
    else if (route.coordinates) coords = route.coordinates
    else if (route.geojson?.coordinates) coords = route.geojson.coordinates

    if (Array.isArray(coords) && coords.length > 0) {
      // LineString: [[lng,lat],...]
      if (typeof coords[0]?.[0] === 'number') return coords.map((c: any) => [c[1], c[0]] as [number, number])
      // MultiLineString: [[[lng,lat],...]]
      if (Array.isArray(coords[0]?.[0])) return coords[0].map((c: any) => [c[1], c[0]] as [number, number])
    }
  } catch (e) { console.warn('[Polyline] parse failed', e) }
  return []
}

export function PassengerTomTomMap({ 
  center, 
  route, 
  driverLocation, 
  availableCars = [], 
  theme = 'light', 
  onMapMove 
}: { 
  center: [number, number]
  route?: any
  driverLocation?: [number, number]
  availableCars?: any[]
  theme?: 'dark' | 'light'
  onMapMove?: (coords: [number, number]) => void
}) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)
  const carMarkersRef = useRef<L.Marker[]>([])
  const isDraggingRef = useRef(false)
  const userHasDraggedRef = useRef(false)
  const onMapMoveRef = useRef(onMapMove)
  const lastDraggedCenterRef = useRef<[number, number] | null>(null)

  useEffect(() => { onMapMoveRef.current = onMapMove }, [onMapMove])

  // INIT MAP ONCE
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      scrollWheelZoom: true,
      minZoom: 3,
      maxZoom: 21,
    }).setView([center[1], center[0]], 15)

    map.on('movestart', () => { isDraggingRef.current = true })
    map.on('moveend', () => {
      isDraggingRef.current = false
      if (userHasDraggedRef.current && onMapMoveRef.current) {
        const c = map.getCenter()
        lastDraggedCenterRef.current = [c.lng, c.lat]
        onMapMoveRef.current([c.lng, c.lat])
      }
    })
    map.on('dragstart', () => { userHasDraggedRef.current = true })

    mapRef.current = map
    // FIX screenshot bug - force Leaflet to measure real size
    setTimeout(() => map.invalidateSize(), 100)
    setTimeout(() => map.invalidateSize(), 500)
    setTimeout(() => map.invalidateSize(), 1200)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // TILE LAYER - TOMTOM ONLY
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)

    if (!TOMTOM_KEY) {
      console.error('[BuddyRide] VITE_TOMTOM_API_KEY missing!')
      return
    }

    const style = theme === 'dark' ? 'night' : 'main'
    const url = `https://api.tomtom.com/map/1/tile/basic/${style}/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`
    
    tileLayerRef.current = L.tileLayer(url, {
      minZoom: 3,
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: '© TomTom',
    }).addTo(map)

    tileLayerRef.current.on('tileerror', (e: any) => {
      console.error('[BuddyRide] TomTom tile error - check key quota', e)
    })
    setTimeout(() => map.invalidateSize(), 200)
  }, [theme])

  // CENTER UPDATE - DO NOT SNAP BACK AFTER USER DRAG
  useEffect(() => {
    if (!mapRef.current || isDraggingRef.current) return
    if (lastDraggedCenterRef.current) {
      const dragged = L.latLng(lastDraggedCenterRef.current[1], lastDraggedCenterRef.current[0])
      const newCenter = L.latLng(center[1], center[0])
      if (dragged.distanceTo(newCenter) < 10) return
      lastDraggedCenterRef.current = null
      userHasDraggedRef.current = false
    }
    const current = mapRef.current.getCenter()
    const distance = current.distanceTo(L.latLng(center[1], center[0]))
    if (distance > 10) {
      mapRef.current.setView([center[1], center[0]], mapRef.current.getZoom(), { animate: true })
    }
  }, [center])

  // ROUTE LINE - FIXED
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null }
    if (!route) return

    const latLngs = parseRouteToLatLngs(route)
    console.log('[Polyline] route points:', latLngs.length, 'raw:', route)

    if (latLngs.length >= 2) {
      routeLineRef.current = L.polyline(latLngs, { 
        color: '#0066FF', 
        weight: 6, 
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map)
      // Pickup / Drop markers
      L.marker(latLngs[0], { icon: pickupIcon() }).addTo(map)
      L.marker(latLngs[latLngs.length - 1], { icon: dropIcon() }).addTo(map)
      map.fitBounds(routeLineRef.current.getBounds(), { padding: [60, 60] })
    } else {
      console.warn('[Polyline] No valid points - check tomtom.ts returns routes[0].legs[0].points')
    }
  }, [route])

  // DRIVER LIVE LOCATION
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (driverMarkerRef.current) { map.removeLayer(driverMarkerRef.current); driverMarkerRef.current = null }
    if (!driverLocation) return
    driverMarkerRef.current = L.marker([driverLocation[1], driverLocation[0]], { icon: driverIcon() }).addTo(map)
  }, [driverLocation])

  // NEARBY CARS
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    carMarkersRef.current.forEach(m => map.removeLayer(m))
    carMarkersRef.current = []
    availableCars.forEach((car: any) => {
      if (car.lng && car.lat) {
        const m = L.marker([car.lat, car.lng], { icon: carIcon() }).addTo(map)
        carMarkersRef.current.push(m)
      } else if (car.current_lng && car.current_lat) {
        const m = L.marker([car.current_lat, car.current_lng], { icon: carIcon() }).addTo(map)
        carMarkersRef.current.push(m)
      }
    })
  }, [availableCars])

  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: '100vh', background: '#E6F0FF' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '100vh' }} />
      
      {/* FIX: Zoom buttons - + / - must be visible, not blank white squares. Added explicit color, grid centering, shadow, aria-labels */}
      <div style={{ position: 'absolute', top: 80, right: 12, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} style={{ width: 44, height: 44, borderRadius: 12, background: '#ffffff', color: '#111111', border: '1px solid #ddd', fontSize: 22, fontWeight: 900, lineHeight: 1, display: 'grid', placeItems: 'center', padding: 0, boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>+</button>
        <button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} style={{ width: 44, height: 44, borderRadius: 12, background: '#ffffff', color: '#111111', border: '1px solid #ddd', fontSize: 22, fontWeight: 900, lineHeight: 1, display: 'grid', placeItems: 'center', padding: 0, boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>−</button>
        <button aria-label="Center on my location" onClick={() => { if(mapRef.current) { lastDraggedCenterRef.current = null; userHasDraggedRef.current = false; mapRef.current.setView([center[1], center[0]], 15, { animate: true }) } }} style={{ width: 44, height: 44, borderRadius: 12, background: '#0066FF', color: 'white', border: 'none', fontSize: 18, display: 'grid', placeItems: 'center', padding: 0, boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>📍</button>
      </div>
    </div>
  )
}

export default PassengerTomTomMap