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

export function DriverTomTomMap({ center, driverLocation, route, bearing = 0, followDriver = false, onMapMove }: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const routeOutlineRef = useRef<L.Polyline | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)
  const followRef = useRef(followDriver)
  const onMapMoveRef = useRef(onMapMove)
  const animRef = useRef<number | null>(null)
  const currentPos = useRef<[number, number] | null>(null)
  const currentBearing = useRef(0)
  const targetPos = useRef<[number, number] | null>(null)
  const targetBearing = useRef(0)

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
      tap: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelDebounceTime: 40,
      minZoom: 3,
      maxZoom: 20,
      // FIX TEARING
      fadeAnimation: false,
      zoomAnimation: true,
      // @ts-ignore
      keepBuffer: 8,
    } as any).setView([center[1], center[0]], 16)
    mapRef.current = map

    // FIX: SINGLE TILE LAYER, NEVER RECREATED - light_all is 2x faster than voyager, no white gaps
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      minZoom: 3,
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: '&copy; CARTO &copy; OpenStreetMap',
      keepBuffer: 8,
      updateWhenIdle: false,
      updateWhenZooming: false,
    }).addTo(map)

    const handleUserMove = () => { if (onMapMoveRef.current) onMapMoveRef.current() }
    map.on('movestart', (e: any) => { if (e?.originalEvent) handleUserMove() })
    map.on('zoomstart', (e: any) => { if (e?.originalEvent) handleUserMove() })
    // FIX GREY START - force size 3 times
    const t1 = setTimeout(() => map.invalidateSize(), 50)
    const t2 = setTimeout(() => map.invalidateSize(), 300)
    const t3 = setTimeout(() => map.invalidateSize(), 1000)
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current); map.remove(); mapRef.current = null }
  }, [])

  // NO THEME EFFECT ANYMORE - that was deleting tiles

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
        html: `<div style="position:relative;width:56px;height:56px;"><div style="position:absolute;inset:0;background:#0066FF;opacity:0.25;border-radius:50%;animation:buddyPulse 2s infinite"></div><div id="buddy-car" style="position:absolute;left:4px;top:4px;width:48px;height:48px;background:white;border-radius:50%;box-shadow:0 6px 20px rgba(0,0,0,0.3);display:grid;place-items:center;transform:rotate(${bearing}deg);"><div style="width:30px;height:30px;background:#111;border-radius:9px;display:grid;place-items:center;font-size:17px;">🚗</div></div></div><style>@keyframes buddyPulse{0%{transform:scale(0.7);opacity:0.35}50%{transform:scale(1.15);opacity:0.12}100%{transform:scale(1.4);opacity:0}}</style>`,
        className: '',
        iconSize: [56, 56],
        iconAnchor: [28, 28]
      })
      driverMarkerRef.current = L.marker(newLatLng, { icon, zIndexOffset: 1000 }).addTo(map)
      map.setView(newLatLng, 16, { animate: false })
      return
    }
    targetPos.current = newLatLng
    targetBearing.current = bearing
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const startPos = [...currentPos.current] as [number, number]
    const startBearing = currentBearing.current
    const startTime = performance.now()
    const DURATION = 800
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
      if (followRef.current) {
        map.setView([lat, lng], map.getZoom(), { animate: false })
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
      if (routeOutlineRef.current) map.removeLayer(routeOutlineRef.current)
      routeLineRef.current = null
      routeOutlineRef.current = null
      return
    }
    const latLngs = parseRoute(route)
    if (latLngs.length < 2) return
    if (routeOutlineRef.current) map.removeLayer(routeOutlineRef.current)
    if (routeLineRef.current) map.removeLayer(routeLineRef.current)
    routeOutlineRef.current = L.polyline(latLngs, { color: 'white', weight: 10, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map)
    routeLineRef.current = L.polyline(latLngs, { color: '#0066FF', weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map)
    routeLineRef.current.bringToFront()
  }, [route])

  const zoomIn = () => {
    const map = mapRef.current
    if (!map) return
    if (onMapMoveRef.current) onMapMoveRef.current()
    map.setZoom(map.getZoom() + 1, { animate: true })
  }
  const zoomOut = () => {
    const map = mapRef.current
    if (!map) return
    if (onMapMoveRef.current) onMapMoveRef.current()
    map.setZoom(map.getZoom() - 1, { animate: true })
  }

  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: '100vh', background: '#f2f2f2', zIndex: 0 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '100vh' }} />
      <div style={{ position: 'absolute', right: '14px', top: '86px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button onClick={zoomIn} style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'rgba(255,255,255,0.95)', color: '#111', border: '1px solid rgba(0,0,0,0.06)', fontSize: '24px', fontWeight: '800', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>+</button>
        <button onClick={zoomOut} style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'rgba(255,255,255,0.95)', color: '#111', border: '1px solid rgba(0,0,0,0.06)', fontSize: '24px', fontWeight: '800', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>−</button>
      </div>
    </div>
  )
}