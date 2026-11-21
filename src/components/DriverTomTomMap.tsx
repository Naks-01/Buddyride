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
  onMapMove?: () => void
}

function parseRoute(route: any): [number, number][] {
  if (!route) return []
  try {
    if (route.routes?.[0]?.legs) {
      const pts: [number, number][] = []
      for (const leg of route.routes[0].legs) {
        for (const p of leg.points || []) {
          if (p.latitude !== undefined) pts.push([p.latitude, p.longitude])
        }
      }
      if (pts.length >= 2) return pts
    }
    if (Array.isArray(route.points) && route.points[0]?.latitude !== undefined) {
      return route.points.map((p: any) => [p.latitude, p.longitude] as [number, number])
    }
    if (Array.isArray(route) && route.length > 0 && route[0]?.latitude !== undefined) {
      return route.map((p: any) => [p.latitude, p.longitude] as [number, number])
    }
    if (Array.isArray(route) && route.length > 0 && route[0]?.lat !== undefined) {
      return route.map((p: any) => [p.lat, p.lng ?? p.lon] as [number, number])
    }
    if (Array.isArray(route) && route.length > 0 && Array.isArray(route[0])) {
      return route.map((c: any) => [c[1], c[0]] as [number, number])
    }
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

function lerpAngle(a: number, b: number, t: number) {
  let diff = (b - a) % 360
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return a + diff * t
}

export function DriverTomTomMap({ center, driverLocation, route, bearing = 0, followDriver = true, theme = 'light', onMapMove }: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const followRef = useRef(followDriver)
  const onMapMoveRef = useRef(onMapMove)
  const animRef = useRef<number | null>(null)
  const currentPos = useRef<[number, number] | null>(null)
  const currentBearing = useRef(0)
  const targetPos = useRef<[number, number] | null>(null)
  const targetBearing = useRef(0)
  const isUserInteracting = useRef(false)

  useEffect(() => { followRef.current = followDriver }, [followDriver])
  useEffect(() => { onMapMoveRef.current = onMapMove }, [onMapMove])

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
      zoomAnimation: true,
      fadeAnimation: true,
    } as any).setView([center[1], center[0]], 16)
    mapRef.current = map
    const handleUserMove = () => {
      isUserInteracting.current = true
      if (onMapMoveRef.current) onMapMoveRef.current()
      setTimeout(() => { isUserInteracting.current = false }, 500)
    }
    map.on('movestart', (e: any) => { if (e?.originalEvent) handleUserMove() })
    map.on('zoomstart', (e: any) => { if (e?.originalEvent) handleUserMove() })
    const t1 = setTimeout(() => map.invalidateSize(), 100)
    const t2 = setTimeout(() => map.invalidateSize(), 600)
    const t3 = setTimeout(() => map.invalidateSize(), 1500)
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    const KEY = import.meta.env.VITE_TOMTOM_API_KEY as string
    if (!KEY || KEY === 'undefined') return
    const isDark = theme === 'dark'
    const url = isDark
      ? `https://api.tomtom.com/map/1/tile/basic/night/{z}/{x}/{y}.png?key=${KEY}`
      : `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${KEY}`
    tileLayerRef.current = L.tileLayer(url, { minZoom: 2, maxZoom: 22, maxNativeZoom: 19, attribution: '&copy; TomTom' }).addTo(map)
  }, [theme])

  useEffect(() => {
    if (!mapRef.current || !driverLocation) return
    const map = mapRef.current
    const newLatLng: [number, number] = [driverLocation[1], driverLocation[0]]
    if (!currentPos.current) {
      currentPos.current = newLatLng
      targetPos.current = newLatLng
      currentBearing.current = bearing
      targetBearing.current = bearing
      const icon = L.divIcon({
        html: `<div id="buddy-car" style="width:48px;height:48px;display:grid;place-items:center;transform:rotate(${bearing}deg);transition:transform 0.1s linear;"><div style="width:38px;height:56px;background:#111;border-radius:10px;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:20px;">▲</div></div>`,
        className: '',
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      })
      driverMarkerRef.current = L.marker(newLatLng, { icon, zIndexOffset: 1000 }).addTo(map)
      map.setView(newLatLng, 17, { animate: true })
      return
    }
    targetPos.current = newLatLng
    targetBearing.current = bearing
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const startPos = [...currentPos.current] as [number, number]
    const startBearing = currentBearing.current
    const startTime = performance.now()
    const DURATION = 1000
    const animate = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(elapsed / DURATION, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const lat = startPos[0] + (targetPos.current![0] - startPos[0]) * eased
      const lng = startPos[1] + (targetPos.current![1] - startPos[1]) * eased
      const b = lerpAngle(startBearing, targetBearing.current, eased)
      currentPos.current = [lat, lng]
      currentBearing.current = b
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([lat, lng])
        const el = driverMarkerRef.current.getElement()?.querySelector('#buddy-car') as HTMLElement
        if (el) el.style.transform = `rotate(${b}deg)`
      }
      if (followRef.current && !isUserInteracting.current) {
        map.panTo([lat, lng], { animate: true, duration: 0.3 })
      }
      if (t < 1) animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)
  }, [driverLocation, bearing])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!route) {
      if (routeLineRef.current) map.removeLayer(routeLineRef.current)
      routeLineRef.current = null
      return
    }
    const latLngs = parseRoute(route)
    if (latLngs.length < 2) return
    if (!routeLineRef.current) {
      routeLineRef.current = L.polyline(latLngs, { color: '#0066FF', weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map)
    } else {
      routeLineRef.current.setLatLngs(latLngs)
    }
    routeLineRef.current.bringToFront()
  }, [route])

  const zoomIn = () => mapRef.current?.zoomIn()
  const zoomOut = () => mapRef.current?.zoomOut()

  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: '100vh', background: '#e5e7eb', zIndex: 0 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '100vh' }} />
      <div style={{ position: 'absolute', right: '12px', top: '76px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button onClick={(e) => { e.stopPropagation(); zoomIn() }} style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'white', color: 'black', border: 'none', fontSize: '22px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', touchAction: 'manipulation' }}>+</button>
        <button onClick={(e) => { e.stopPropagation(); zoomOut() }} style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'white', color: 'black', border: 'none', fontSize: '22px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', touchAction: 'manipulation' }}>−</button>
      </div>
    </div>
  )
}