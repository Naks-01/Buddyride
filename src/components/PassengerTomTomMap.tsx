import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY as string

function parseRouteToLngLats(route: any): [number, number][] {
  if (!route) return []
  try {
    if (Array.isArray(route)) {
      if (Array.isArray(route[0])) return route.map((c: any) => [c[0], c[1]] as [number, number])
      if (route[0]?.latitude !== undefined) return route.map((p: any) => [p.longitude, p.latitude] as [number, number])
      if (route[0]?.lat !== undefined) return route.map((p: any) => [p.lng ?? p.lon, p.lat] as [number, number])
      return []
    }
    if (route.routes?.[0]?.legs) {
      const pts: [number, number][] = []
      for (const leg of route.routes[0].legs) for (const p of leg.points || []) if (p.latitude !== undefined) pts.push([p.longitude, p.latitude])
      if (pts.length >= 2) return pts
    }
    let coords: any = route.geometry?.coordinates || route.coordinates || route.features?.[0]?.geometry?.coordinates
    if (Array.isArray(coords?.[0]) && typeof coords[0][0] === 'number') return coords as [number, number][]
    if (Array.isArray(coords?.[0]?.[0])) return coords[0] as [number, number][]
  } catch {}
  return []
}

// FIX: No innerHTML - build marker with DOM + textContent, XSS safe
function makeMarker(bg: string, size: number, emoji?: string) {
  const el = document.createElement('div')
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.background = bg
  el.style.border = '3px solid white'
  el.style.borderRadius = size >= 36 ? '50%' : '50%'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.fontSize = '20px'
  el.style.boxShadow = '0 4px 12px rgba(0,0,0,.4)'
  if (emoji) el.textContent = emoji
  return el
}

function getStyle(theme: 'dark' | 'light') {
  const hasKey = TOMTOM_KEY && TOMTOM_KEY.length > 10
  // FIX: Fallback to CARTO if TomTom key missing - was blank map
  if (!hasKey) {
    return {
      version: 8,
      sources: { osm: { type: 'raster', tiles: theme === 'dark' ? ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'] : ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'], tileSize: 256, attribution: '© OpenStreetMap © CARTO', maxzoom: 19 } },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    } as any
  }
  return {
    version: 8,
    sources: { tomtom: { type: 'raster', tiles: [`https://api.tomtom.com/map/1/tile/basic/${theme === 'dark' ? 'night' : 'main'}/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`], tileSize: 256, maxzoom: 19 } },
    layers: [{ id: 'tomtom', type: 'raster', source: 'tomtom', paint: { 'raster-fade-duration': 0 } }],
  } as any
}

export function PassengerTomTomMap({ center, route, driverLocation, availableCars = [], theme = 'light', onMapMove }: { center: [number, number]; route?: any; driverLocation?: [number, number]; availableCars?: any[]; theme?: 'dark' | 'light'; onMapMove?: (coords: [number, number]) => void }) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeMarkersRef = useRef<maplibregl.Marker[]>([])
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null)
  const carMarkersRef = useRef<maplibregl.Marker[]>([])
  const userHasDraggedRef = useRef(false)
  const onMapMoveRef = useRef(onMapMove)
  const lastDraggedCenterRef = useRef<[number, number] | null>(null)
  const routeRef = useRef(route)

  useEffect(() => { onMapMoveRef.current = onMapMove }, [onMapMove])
  useEffect(() => { routeRef.current = route }, [route])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getStyle(theme),
      center: [center[0], center[1]], zoom: 15,
    })
    map.setPadding({ top: 0, bottom: 220, left: 0, right: 0 })
    map.on('movestart', (e: any) => { if (e.originalEvent) userHasDraggedRef.current = true })
    map.on('moveend', (e: any) => {
      if (userHasDraggedRef.current && onMapMoveRef.current && e.originalEvent) {
        const c = map.getCenter()
        lastDraggedCenterRef.current = [c.lng, c.lat]
        onMapMoveRef.current([c.lng, c.lat])
      }
    })
    mapRef.current = map
    return () => {
      // FIX: Cleanup all markers on unmount - was leaking car/driver markers
      routeMarkersRef.current.forEach(m => m.remove()); routeMarkersRef.current = []
      carMarkersRef.current.forEach(m => m.remove()); carMarkersRef.current = []
      driverMarkerRef.current?.remove(); driverMarkerRef.current = null
      map.remove(); mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // FIX: Theme change now swaps tiles - was ignored after mount
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter(); const z = map.getZoom()
    map.setStyle(getStyle(theme))
    map.once('style.load', () => {
      map.setPadding({ top: 0, bottom: 220, left: 0, right: 0 })
      map.jumpTo({ center: [c.lng, c.lat], zoom: z })
      if (driverMarkerRef.current) driverMarkerRef.current.addTo(map)
      carMarkersRef.current.forEach(m => m.addTo(map))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !driverLocation) return
    if (driverMarkerRef.current) { driverMarkerRef.current.setLngLat([driverLocation[0], driverLocation[1]]); return }
    const el = makeMarker('#00C853', 44, '🚕')
    driverMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([driverLocation[0], driverLocation[1]]).addTo(map)
  }, [driverLocation])

  useEffect(() => {
    const map = mapRef.current; if (!map) return
    carMarkersRef.current.forEach(m => m.remove()); carMarkersRef.current = []
    availableCars.forEach((car: any) => {
      const lng = Number(car.lng || car.current_lng); const lat = Number(car.lat || car.current_lat)
      if (!lng || !lat || Number.isNaN(lng) || Number.isNaN(lat)) return
      const el = makeMarker('#0066FF', 36, '🚗')
      carMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map))
    })
  }, [availableCars])

  useEffect(() => {
    const map = mapRef.current; if (!map) return
    const routeId = 'passenger-route'; const outlineId = 'passenger-route-outline'
    const draw = () => {
      if (map.getLayer(routeId)) map.removeLayer(routeId); if (map.getLayer(outlineId)) map.removeLayer(outlineId)
      if (map.getSource(routeId)) map.removeSource(routeId); if (map.getSource(outlineId)) map.removeSource(outlineId)
      routeMarkersRef.current.forEach(m => m.remove()); routeMarkersRef.current = []
      if (!route) return
      const coords = parseRouteToLngLats(route); if (coords.length < 2) return
      map.addSource(outlineId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } as any })
      map.addSource(routeId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } as any })
      map.addLayer({ id: outlineId, type: 'line', source: outlineId, paint: { 'line-color': 'white', 'line-width': 10 } })
      map.addLayer({ id: routeId, type: 'line', source: routeId, paint: { 'line-color': '#0066FF', 'line-width': 6 } })
      const pEl = makeMarker('#00C853', 28)
      const dEl = makeMarker('#FF3B30', 28)
      routeMarkersRef.current = [new maplibregl.Marker({ element: pEl }).setLngLat(coords[0]).addTo(map), new maplibregl.Marker({ element: dEl }).setLngLat(coords[coords.length - 1]).addTo(map)]
      const bounds = new maplibregl.LngLatBounds(); coords.forEach(c => bounds.extend(c))
      map.fitBounds(bounds, { padding: { top: 80, bottom: 280, left: 40, right: 40 } })
    }
    if (map.isStyleLoaded()) draw(); else map.once('load', draw)
  }, [route])

  const isDark = theme === 'dark'
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 190, width: '100%', background: isDark ? '#171719' : '#E6F0FF', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 80, right: 12, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => mapRef.current?.zoomIn()} style={{ width: 44, height: 44, borderRadius: 12, background: isDark ? '#242426' : '#ffffff', color: isDark ? 'white' : '#111111', border: `1px solid ${isDark ? '#38383a' : '#ddd'}`, fontSize: 22, fontWeight: 900, display: 'grid', placeItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>+</button>
        <button onClick={() => mapRef.current?.zoomOut()} style={{ width: 44, height: 44, borderRadius: 12, background: isDark ? '#242426' : '#ffffff', color: isDark ? 'white' : '#111111', border: `1px solid ${isDark ? '#38383a' : '#ddd'}`, fontSize: 22, fontWeight: 900, display: 'grid', placeItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>−</button>
        <button onClick={() => { if (mapRef.current) { lastDraggedCenterRef.current = null; userHasDraggedRef.current = false; mapRef.current.setCenter([center[0], center[1]]); mapRef.current.setZoom(15) } }} style={{ width: 44, height: 44, borderRadius: 12, background: '#0066FF', color: 'white', border: 'none', fontSize: 18, display: 'grid', placeItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>📍</button>
      </div>
    </div>
  )
}
export default PassengerTomTomMap