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
      if (userHasDraggedRef.current && onMapMove) {
        const c = map.getCenter()
        onMapMove([c.lng, c.lat])
      }
      userHasDraggedRef.current = false
    })
    map.on('dragstart', () => { userHasDraggedRef.current = true })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // TILE LAYER - TOMTOM ONLY
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)

    if (!TOMTOM_KEY) {
      console.error('[BuddyRide] VITE_TOMTOM_API_KEY missing!')
      const err = L.divIcon({ html: `<div style="background:#fee;color:#b91c1c;padding:12px;border-radius:8px;font-weight:700">TomTom key missing - Add VITE_TOMTOM_API_KEY in Vercel and Redeploy</div>` })
      L.marker(map.getCenter(), { icon: err }).addTo(map)
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

    // force resize after tiles load
    setTimeout(() => map.invalidateSize(), 200)
  }, [theme])

  // CENTER UPDATE - ONLY IF USER DID NOT DRAG
  useEffect(() => {
    if (!mapRef.current || isDraggingRef.current) return
    const current = mapRef.current.getCenter()
    const distance = current.distanceTo(L.latLng(center[1], center[0]))
    if (distance > 10) { // only move if >10m diff
      mapRef.current.setView([center[1], center[0]], mapRef.current.getZoom(), { animate: true })
    }
  }, [center])

  // ROUTE LINE
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null }
    if (!route) return

    let latLngs: [number, number][] = []
    try {
      const geom = route.type === 'Feature' ? route.geometry : route
      const coords = geom?.coordinates || route.coordinates || route
      if (Array.isArray(coords) && coords.length > 0) {
        if (typeof coords[0] === 'object' && !Array.isArray(coords[0][0])) {
          // GeoJSON LineString
        }
        if (typeof coords[0][0] === 'number') {
          latLngs = coords.map((c: any) => [c[1], c[0]] as [number, number])
        } else if (Array.isArray(coords[0][0])) {
          latLngs = coords[0].map((c: any) => [c[1], c[0]] as [number, number])
        }
      }
    } catch {}

    if (latLngs.length >= 2) {
      routeLineRef.current = L.polyline(latLngs, { color: '#0066FF', weight: 6, opacity: 0.9 }).addTo(map)
      map.fitBounds(routeLineRef.current.getBounds(), { padding: [60, 60] })
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
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#E6F0FF' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '100%' }} />
      
      {/* Zoom buttons */}
      <div style={{ position: 'absolute', top: 80, right: 12, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => mapRef.current?.zoomIn()} style={{ width: 44, height: 44, borderRadius: 12, background: 'white', border: '1px solid #ddd', fontSize: 20, fontWeight: 900 }}>+</button>
        <button onClick={() => mapRef.current?.zoomOut()} style={{ width: 44, height: 44, borderRadius: 12, background: 'white', border: '1px solid #ddd', fontSize: 20, fontWeight: 900 }}>−</button>
        <button onClick={() => { if(mapRef.current) { mapRef.current.setView([center[1], center[0]], 15, { animate: true }); userHasDraggedRef.current = false } }} style={{ width: 44, height: 44, borderRadius: 12, background: '#0066FF', color: 'white', border: 'none', fontSize: 18 }}>📍</button>
      </div>
    </div>
  )
}

export const OsmMapView = PassengerTomTomMap
export default PassengerTomTomMap