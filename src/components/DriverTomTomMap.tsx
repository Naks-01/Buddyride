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
      tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { minZoom: 2, maxZoom: 22, attribution: '&copy; OSM' }).addTo(map)
      return
    }
    const isDark = theme === 'dark'
    const url = isDark
      ? `https://api.tomtom.com/map/1/tile/basic/night/{z}/{x}/{y}.png?key=${KEY}`
      : `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${KEY}`
    tileLayerRef.current = L.tileLayer(url, { minZoom: 2, maxZoom: 22, maxNativeZoom: 19, attribution: '&copy; TomTom' })
      .on('tileerror', () => {
        if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
        tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { minZoom: 2, maxZoom: 22 }).addTo(map)
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
      const coords = geometry?.coordinates || route.coordinates || []
      if (Array.isArray(coords)) latLngs = coords.filter((c: any) => Array.isArray(c)).map((c: any) => [c[1], c[0]] as [number, number])
    }
    if (latLngs.length < 2) return
    if (!routeLineRef.current) {
      routeLineRef.current = L.polyline(latLngs, { color: '#0066FF', weight: 7 }).addTo(map)
    } else {
      routeLineRef.current.setLatLngs(latLngs)
    }
    routeLineRef.current.bringToFront()
  }, [route])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '500px', background: '#e5e7eb', zIndex: 0 }} />
}