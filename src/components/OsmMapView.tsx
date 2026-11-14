import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type OsmMapViewProps = {
  center: [number, number]
  route?: any
  driverLocation?: [number, number]
  availableCars?: any[]
  theme?: 'dark' | 'light'
  onMapMove?: (center: [number, number]) => void
}

export function OsmMapView({ center, route, driverLocation, availableCars, theme = 'light', onMapMove }: OsmMapViewProps) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const carsRef = useRef<Map<string, L.Marker>>(new Map())
  const onMapMoveRef = useRef(onMapMove)
  const isUserDraggingRef = useRef(false)
  const lastProgrammaticCenterRef = useRef<[number, number] | null>(null)
  useEffect(() => { onMapMoveRef.current = onMapMove }, [onMapMove])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: false,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
      zoomSnap: 0.5,
    } as any).setView([center[1], center[0]], 14)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    map.on('movestart', () => { isUserDraggingRef.current = true })
    map.on('moveend', () => {
      const c = map.getCenter()
      isUserDraggingRef.current = false
      const last = lastProgrammaticCenterRef.current
      if (last && Math.abs(last[0] - c.lng) < 0.00005 && Math.abs(last[1] - c.lat) < 0.00005) {
        lastProgrammaticCenterRef.current = null
        return
      }
      onMapMoveRef.current?.([c.lng, c.lat])
    })
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 500)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    const isDark = theme === 'dark'
    const url = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    tileLayerRef.current = L.tileLayer(url, { maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map)
  }, [theme])

  useEffect(() => {
    if (mapRef.current && center) {
      if (isUserDraggingRef.current) return
      const cur = mapRef.current.getCenter()
      const dLat = Math.abs(cur.lat - center[1])
      const dLng = Math.abs(cur.lng - center[0])
      if (dLat > 0.001 || dLng > 0.001) {
        lastProgrammaticCenterRef.current = [center[0], center[1]]
        mapRef.current.setView([center[1], center[0]], mapRef.current.getZoom(), { animate: false })
      }
    }
  }, [center])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!route) {
      if (routeLineRef.current) map.removeLayer(routeLineRef.current)
      routeLineRef.current = null
      return
    }
    let latLngs: [number, number][] = []
    if (Array.isArray(route) && route.length > 0 && route[0]?.latitude !== undefined) {
      latLngs = route.map((p: any) => [p.latitude, p.longitude] as [number, number])
    } else if (Array.isArray(route) && route.length > 0 && Array.isArray(route[0])) {
      latLngs = route.map((c: any) => [c[1], c[0]] as [number, number])
    } else {
      const geometry = route.type === 'Feature' ? route.geometry : route
      const coords = geometry?.coordinates || []
      latLngs = coords.filter((c: any) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])).map((c: any) => [c[1], c[0]] as [number, number])
    }
    if (latLngs.length < 2) {
      if (routeLineRef.current) map.removeLayer(routeLineRef.current)
      routeLineRef.current = null
      return
    }
    if (!routeLineRef.current) {
      routeLineRef.current = L.polyline(latLngs, { color: '#2962FF', weight: 7, opacity: 1, lineJoin: 'round', lineCap: 'round' }).addTo(map)
    } else {
      routeLineRef.current.setLatLngs(latLngs)
    }
    routeLineRef.current.bringToFront()
    map.fitBounds(routeLineRef.current.getBounds(), { padding: [50, 50], maxZoom: 16 })
  }, [route])

  useEffect(() => {
    if (!mapRef.current) return
    if (!driverLocation) {
      if (driverMarkerRef.current) { mapRef.current.removeLayer(driverMarkerRef.current); driverMarkerRef.current = null }
      return
    }
    const latLng: any = [driverLocation[1], driverLocation[0]]
    if (!driverMarkerRef.current) {
      const icon = L.divIcon({ html: '<div style="background:#000;width:48px;height:48px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,0.3);font-size:24px">🚗</div>', className: '', iconSize: [48, 48], iconAnchor: [24, 24] })
      driverMarkerRef.current = L.marker(latLng, { icon }).addTo(mapRef.current)
    } else {
      driverMarkerRef.current.setLatLng(latLng)
    }
  }, [driverLocation])

  useEffect(() => {
    if (!mapRef.current || !availableCars) return
    const currentIds = new Set(availableCars.map((c: any) => c.driver_id))
    carsRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) { mapRef.current?.removeLayer(marker); carsRef.current.delete(id) }
    })
    availableCars.forEach((car: any) => {
      const lat = car.current_lat ?? car.lat ?? car.latitude
      const lng = car.current_lng ?? car.lng ?? car.longitude
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      const latLng: any = [lat, lng]
      const existing = carsRef.current.get(car.driver_id)
      if (existing) existing.setLatLng(latLng)
      else {
        const icon = L.divIcon({ html: '<div style="background:white;width:40px;height:40px;border-radius:50%;border:2px solid #2962FF;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.18);font-size:20px">🚗</div>', className: '', iconSize: [40, 40], iconAnchor: [20, 20] })
        const m = L.marker(latLng, { icon }).addTo(mapRef.current!)
        carsRef.current.set(car.driver_id, m)
      }
    })
  }, [availableCars])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#f8f9fa', zIndex: 0, touchAction: 'none' }} />
}