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

export function DriverTomTomMap({ center, driverLocation, route, bearing = 0, followDriver = false, onMapMove }: Props) {
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
    const KEY = import.meta.env.VITE_TOMTOM_API_KEY
    
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.tomtom.com/map/1/style/20.1.0-8/style.json?map=basic_main&poi=poi_main&key=${KEY}`,
      center: [center[0], center[1]],
      zoom: 16,
      pitch: 0,
    })

    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('movestart', (e: any) => { if (e.originalEvent) onMapMoveRef.current?.() })
    map.on('zoomstart', (e: any) => { if (e.originalEvent) onMapMoveRef.current?.() })

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !driverLocation) return
    const lngLat: [number, number] = [driverLocation[0], driverLocation[1]]

    if (!markerRef.current) {
      const el = document.createElement('div')
      el.style.width = '48px'
      el.style.height = '48px'
      el.style.background = '#111'
      el.style.borderRadius = '14px'
      el.style.border = '3px solid white'
      el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)'
      el.style.display = 'grid'
      el.style.placeItems = 'center'
      el.style.transform = `rotate(${bearing}deg)`
      el.innerHTML = `<div style="color:white;font-size:22px">▲</div>`
      markerElRef.current = el
      currentPos.current = lngLat
      currentBearing.current = bearing
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
      currentPos.current = [lng, lat]
      currentBearing.current = b
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
    const routeId = 'buddy-route'
    const outlineId = 'buddy-route-outline'

    const draw = () => {
      if (!route) {
        if (map.getLayer(routeId)) map.removeLayer(routeId)
        if (map.getLayer(outlineId)) map.removeLayer(outlineId)
        if (map.getSource(routeId)) map.removeSource(routeId)
        if (map.getSource(outlineId)) map.removeSource(outlineId)
        return
      }
      const coords = parseRoute(route)
      if (coords.length < 2) return

      if (map.getSource(routeId)) {
        (map.getSource(routeId) as any).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })
        ;(map.getSource(outlineId) as any).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })
        return
      }

      map.addSource(outlineId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } as any })
      map.addSource(routeId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } as any })
      map.addLayer({ id: outlineId, type: 'line', source: outlineId, paint: { 'line-color': 'white', 'line-width': 10, 'line-opacity': 1 } })
      map.addLayer({ id: routeId, type: 'line', source: routeId, paint: { 'line-color': '#0066FF', 'line-width': 6, 'line-opacity': 0.95 } })
    }

    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
  }, [route])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}