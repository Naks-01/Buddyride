import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY as string

function parseRouteToLngLats(route: any): [number, number][] {
  if (!route) return []
  try {
    if (Array.isArray(route)) {
      if (route.length === 0) return []
      if (typeof route[0] === 'number') return []
      if (Array.isArray(route[0])) return route.map((c: any) => [c[0], c[1]] as [number, number])
      if (route[0]?.latitude !== undefined) return route.map((p: any) => [p.longitude, p.latitude] as [number, number])
      if (route[0]?.lat !== undefined) return route.map((p: any) => [p.lng ?? p.lon, p.lat] as [number, number])
      return []
    }
    if (route.routes?.[0]?.legs) {
      const pts: [number, number][] = []
      for (const leg of route.routes[0].legs) {
        for (const p of leg.points || []) {
          if (p.latitude !== undefined) pts.push([p.longitude, p.latitude])
        }
      }
      if (pts.length >= 2) return pts
    }
    if (Array.isArray(route.points)) {
      if (route.points[0]?.latitude !== undefined) return route.points.map((p: any) => [p.longitude, p.latitude] as [number, number])
      if (Array.isArray(route.points[0])) return route.points.map((c: any) => [c[0], c[1]] as [number, number])
    }
    let coords: any = null
    if (route.type === 'FeatureCollection' && route.features?.[0]?.geometry?.coordinates) coords = route.features[0].geometry.coordinates
    else if (route.type === 'Feature' && route.geometry?.coordinates) coords = route.geometry.coordinates
    else if (route.geometry?.coordinates) coords = route.geometry.coordinates
    else if (route.coordinates) coords = route.coordinates
    else if (route.geojson?.coordinates) coords = route.geojson.coordinates
    if (Array.isArray(coords) && coords.length > 0) {
      if (typeof coords[0]?.[0] === 'number') return coords as [number, number][]
      if (Array.isArray(coords[0]?.[0])) return coords[0] as [number, number][]
    }
  } catch (e) { console.warn('[Polyline] parse failed', e) }
  return []
}

function makeEl(html: string, size: number) {
  const el = document.createElement('div')
  el.innerHTML = html
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  return el
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
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeMarkersRef = useRef<maplibregl.Marker[]>([])
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null)
  const carMarkersRef = useRef<maplibregl.Marker[]>([])
  const isDraggingRef = useRef(false)
  const userHasDraggedRef = useRef(false)
  const onMapMoveRef = useRef(onMapMove)
  const lastDraggedCenterRef = useRef<[number, number] | null>(null)

  useEffect(() => { onMapMoveRef.current = onMapMove }, [onMapMove])

  // INIT - MapLibre + TomTom Vector
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!TOMTOM_KEY) {
      console.error('[BuddyRide] VITE_TOMTOM_API_KEY missing!')
      return
    }

    // TomTom vector style - main = light, night = dark
    const mapStyle = theme === 'dark' ? 'night' : 'main'
    // MapLibre uses style.json, not raster tiles
    const styleUrl = `https://api.tomtom.com/map/1/style/20.1.0-8/style.json?map=basic_${mapStyle}&poi=poi_${mapStyle}&key=${TOMTOM_KEY}`

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [center[0], center[1]],
      zoom: 15,
      pitch: 0,
      minZoom: 3,
      maxZoom: 21,
    })

    map.on('movestart', (e: any) => { if (e.originalEvent) { isDraggingRef.current = true; userHasDraggedRef.current = true } })
    map.on('moveend', (e: any) => {
      isDraggingRef.current = false
      if (userHasDraggedRef.current && onMapMoveRef.current && e.originalEvent) {
        const c = map.getCenter()
        lastDraggedCenterRef.current = [c.lng, c.lat]
        onMapMoveRef.current([c.lng, c.lat])
      }
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // THEME CHANGE - reload style
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const mapStyle = theme === 'dark' ? 'night' : 'main'
    const styleUrl = `https://api.tomtom.com/map/1/style/20.1.0-8/style.json?map=basic_${mapStyle}&poi=poi_${mapStyle}&key=${TOMTOM_KEY}`
    // Only set if different - MapLibre will re-add sources, so we re-draw route after
    if ((map as any)._currentStyleUrl !== styleUrl) {
      (map as any)._currentStyleUrl = styleUrl
      map.setStyle(styleUrl)
    }
  }, [theme])

  // CENTER follow
  useEffect(() => {
    const map = mapRef.current
    if (!map || isDraggingRef.current) return
    if (lastDraggedCenterRef.current) {
      const dragged = lastDraggedCenterRef.current
      const dist = Math.hypot((dragged[0] - center[0]) * 111000, (dragged[1] - center[1]) * 111000)
      if (dist < 10) return
      lastDraggedCenterRef.current = null
      userHasDraggedRef.current = false
    }
    const current = map.getCenter()
    const distance = Math.hypot((current.lng - center[0]) * 111000, (current.lat - center[1]) * 111000)
    if (distance > 10) {
      map.setCenter([center[0], center[1]])
    }
  }, [center])

  // ROUTE
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const routeId = 'passenger-route'
    const outlineId = 'passenger-route-outline'

    const draw = () => {
      // clear old
      if (map.getLayer(routeId)) map.removeLayer(routeId)
      if (map.getLayer(outlineId)) map.removeLayer(outlineId)
      if (map.getSource(routeId)) map.removeSource(routeId)
      if (map.getSource(outlineId)) map.removeSource(outlineId)
      routeMarkersRef.current.forEach(m => m.remove())
      routeMarkersRef.current = []

      if (!route) return
      const coords = parseRouteToLngLats(route)
      if (coords.length < 2) return

      map.addSource(outlineId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } as any })
      map.addSource(routeId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } as any })
      map.addLayer({ id: outlineId, type: 'line', source: outlineId, paint: { 'line-color': 'white', 'line-width': 10 } })
      map.addLayer({ id: routeId, type: 'line', source: routeId, paint: { 'line-color': '#0066FF', 'line-width': 6, 'line-opacity': 0.95 } })

      const pickupEl = makeEl(`<div style="width:28px;height:28px;background:#00C853;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`, 28)
      const dropEl = makeEl(`<div style="width:28px;height:28px;background:#FF3B30;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`, 28)
      const p = new maplibregl.Marker({ element: pickupEl }).setLngLat(coords[0]).addTo(map)
      const d = new maplibregl.Marker({ element: dropEl }).setLngLat(coords[coords.length - 1]).addTo(map)
      routeMarkersRef.current = [p, d]

      const bounds = new maplibregl.LngLatBounds()
      coords.forEach(c => bounds.extend(c))
      map.fitBounds(bounds, { padding: 60 })
    }

    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
  }, [route])

  // DRIVER
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null }
    if (!driverLocation) return
    const el = makeEl(`<div style="width:44px;height:44px;background:#00C853;border:3px solid white;border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 12px rgba(0,0,0,.4)">🚕</div>`, 44)
    driverMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([driverLocation[0], driverLocation[1]]).addTo(map)
  }, [driverLocation])

  // AVAILABLE CARS
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    carMarkersRef.current.forEach(m => m.remove())
    carMarkersRef.current = []
    availableCars.forEach((car: any) => {
      let lng: number | undefined, lat: number | undefined
      if (car.lng && car.lat) { lng = car.lng; lat = car.lat }
      else if (car.current_lng && car.current_lat) { lng = car.current_lng; lat = car.current_lat }
      if (lng === undefined || lat === undefined) return
      const el = makeEl(`<div style="width:36px;height:36px;background:#0066FF;border:2px solid white;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,.3)">🚗</div>`, 36)
      const m = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
      carMarkersRef.current.push(m)
    })
  }, [availableCars])

  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#E6F0FF', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 80, right: 12, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} style={{ width: 44, height: 44, borderRadius: 12, background: '#ffffff', color: '#111111', border: '1px solid #ddd', fontSize: 22, fontWeight: 900, lineHeight: 1, display: 'grid', placeItems: 'center', padding: 0, boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>+</button>
        <button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} style={{ width: 44, height: 44, borderRadius: 12, background: '#ffffff', color: '#111111', border: '1px solid #ddd', fontSize: 22, fontWeight: 900, lineHeight: 1, display: 'grid', placeItems: 'center', padding: 0, boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>−</button>
        <button aria-label="Center on my location" onClick={() => { if(mapRef.current) { lastDraggedCenterRef.current = null; userHasDraggedRef.current = false; mapRef.current.setCenter([center[0], center[1]]); mapRef.current.setZoom(15) } }} style={{ width: 44, height: 44, borderRadius: 12, background: '#0066FF', color: 'white', border: 'none', fontSize: 18, display: 'grid', placeItems: 'center', padding: 0, boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>📍</button>
      </div>
    </div>
  )
}

export default PassengerTomTomMap