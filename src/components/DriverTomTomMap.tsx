import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type Props = {
  center: [number, number]
  driverLocation?: [number, number]
  route?: any
  bearing?: number
  speedKmh?: number
  isNavigating?: boolean
  followDriver?: boolean
  theme?: string
  onMapMove?: () => void
}

function parseRoute(route: any): [number, number][] {
  if (!route) return []
  try {
    if (route.routes?.[0]?.legs) {
      const pts: [number, number][] = []
      for (const leg of route.routes[0].legs) for (const p of leg.points || []) if (p.latitude !== undefined) pts.push([p.longitude, p.latitude])
      if (pts.length >= 2) return pts
    }
    let coords: any = route.geometry?.coordinates || route.coordinates || route.features?.[0]?.geometry?.coordinates
    if (Array.isArray(coords?.[0]) && typeof coords[0][0] === 'number') return coords as [number, number][]
    if (Array.isArray(coords?.[0]?.[0])) return coords[0] as [number, number][]
    if (Array.isArray(route.points)) return route.points.map((p: any) => [p.longitude ?? p.lng, p.latitude ?? p.lat] as [number, number])
    if (Array.isArray(route) && route[0]?.latitude !== undefined) return route.map((p: any) => [p.longitude, p.latitude] as [number, number])
  } catch {}
  return []
}

function lerpAngle(a: number, b: number, t: number) {
  let diff = (b - a) % 360
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return a + diff * t
}

export function DriverTomTomMap({ center, driverLocation, route, bearing = 0, followDriver = true, onMapMove }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const markerElRef = useRef<HTMLDivElement | null>(null)
  const followRef = useRef(followDriver)
  const onMapMoveRef = useRef(onMapMove)
  const animRef = useRef<number | null>(null)
  const currentPos = useRef<[number, number] | null>(null)
  const currentBearing = useRef(0)

  useEffect(() => { followRef.current = followDriver }, [followDriver])
  useEffect(() => { onMapMoveRef.current = onMapMove }, [onMapMove])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
            maxzoom: 19
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      } as any,
      center: [center[0], center[1]],
      zoom: 16,
      attributionControl: false,
    })
    mapRef.current = map
    // FIX: Add bottom padding so center is above banner
    map.setPadding({ top: 0, bottom: 190, left: 0, right: 0 })
    map.on('movestart', (e: any) => { if (e.originalEvent) onMapMoveRef.current?.() })
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !driverLocation) return
    const lngLat: [number, number] = [driverLocation[0], driverLocation[1]]
    if (!markerRef.current) {
      const el = document.createElement('div')
      el.style.width = '48px'; el.style.height = '48px'; el.style.background = '#111'; el.style.borderRadius = '14px'; el.style.border = '3px solid white'; el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)'; el.style.display = 'grid'; el.style.placeItems = 'center'; el.style.transform = `rotate(${bearing}deg)`; el.innerHTML = `<div style="color:white;font-size:22px">▲</div>`
      markerElRef.current = el
      currentPos.current = lngLat; currentBearing.current = bearing
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(map)
      map.setCenter(lngLat)
      return
    }
    const start = currentPos.current || lngLat
    const startB = currentBearing.current
    const startTime = performance.now()
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / 800, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const lng = start[0] + (lngLat[0] - start[0]) * eased
      const lat = start[1] + (lngLat[1] - start[1]) * eased
      const b = lerpAngle(startB, bearing, eased)
      currentPos.current = [lng, lat]; currentBearing.current = b
      markerRef.current?.setLngLat([lng, lat])
      if (markerElRef.current) markerElRef.current.style.transform = `rotate(${b}deg)`
      if (followRef.current) map.setCenter([lng, lat])
      if (t < 1) animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)
  }, [driverLocation, bearing])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const routeId = 'buddy-route'; const outlineId = 'buddy-route-outline'
    const draw = () => {
      if (!route) { if (map.getLayer(routeId)) map.removeLayer(routeId); if (map.getLayer(outlineId)) map.removeLayer(outlineId); if (map.getSource(routeId)) map.removeSource(routeId); if (map.getSource(outlineId)) map.removeSource(outlineId); return }
      const coords = parseRoute(route); if (coords.length < 2) return
      if (map.getSource(routeId)) { (map.getSource(routeId) as any).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }); (map.getSource(outlineId) as any).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }); return }
      map.addSource(outlineId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } as any })
      map.addSource(routeId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } as any })
      map.addLayer({ id: outlineId, type: 'line', source: outlineId, paint: { 'line-color': 'white', 'line-width': 10 } })
      map.addLayer({ id: routeId, type: 'line', source: routeId, paint: { 'line-color': '#0066FF', 'line-width': 6 } })
    }
    if (map.isStyleLoaded()) draw(); else map.once('load', draw)
  }, [route])

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 190, width: '100%', background: '#F8F9FA', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', top: 80, right: 12, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => mapRef.current?.zoomIn()} style={{ width: 44, height: 44, borderRadius: 12, background: '#ffffff', color: '#111111', border: '1px solid #ddd', fontSize: 22, fontWeight: 900, display: 'grid', placeItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>+</button>
        <button onClick={() => mapRef.current?.zoomOut()} style={{ width: 44, height: 44, borderRadius: 12, background: '#ffffff', color: '#111111', border: '1px solid #ddd', fontSize: 22, fontWeight: 900, display: 'grid', placeItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>−</button>
        <button onClick={() => { if (mapRef.current && driverLocation) { followRef.current = true; mapRef.current.setCenter([driverLocation[0], driverLocation[1]]); mapRef.current.setZoom(16) } else if (mapRef.current) { mapRef.current.setCenter([center[0], center[1]]) } }} style={{ width: 44, height: 44, borderRadius: 12, background: '#0066FF', color: 'white', border: 'none', fontSize: 18, display: 'grid', placeItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.14)', cursor: 'pointer' }}>📍</button>
      </div>
    </div>
  )
}