import { useEffect, useRef, useState } from 'react'
import * as tt from '@tomtom-international/web-sdk-maps'
import '@tomtom-international/web-sdk-maps/dist/maps.css'

type Props = {
  center: [number, number]
  driverLocation?: [number, number]
  route?: any
  bearing?: number
  speedKmh?: number
  isNavigating?: boolean
  followDriver?: boolean
  theme?: 'dark' | 'light'
  zoom?: number
}

export function DriverTomTomMap({ center, driverLocation, zoom = 14 }: Props) {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<any>(null)
  const userHasInteractedRef = useRef(false)
  const [myPos, setMyPos] = useState<[number, number] | null>(null)

  // FIX: Get GPS inside the map itself - no need for parent to pass it
  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setMyPos([pos.coords.longitude, pos.coords.latitude]),
      (err) => console.log('GPS blocked:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // Use driverLocation if parent gives it, else my own GPS, else center
  const activeLocation = driverLocation || myPos || center

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY || 'no-key'
    const map = tt.map({
      key: apiKey,
      container: containerRef.current as any,
      center: [center[0], center[1]],
      zoom: zoom,
      dragPan: true,
      scrollZoom: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    if (zoom === 17 && activeLocation) {
      userHasInteractedRef.current = false
      mapRef.current.setCenter([activeLocation[0], activeLocation[1]])
      mapRef.current.setZoom(17)
    }
  }, [zoom])

  useEffect(() => {
    if (!mapRef.current || !activeLocation) return
    if (!markerRef.current) {
      const el = document.createElement('div')
      el.innerHTML = '🚗'
      el.style.fontSize = '32px'
      el.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))'
      // Blue dot behind car so you can see it even on light map
      el.style.background = '#0066FF'
      el.style.borderRadius = '50%'
      el.style.width = '48px'
      el.style.height = '48px'
      el.style.display = 'flex'
      el.style.alignItems = 'center'
      el.style.justifyContent = 'center'
      el.style.border = '3px solid white'
      markerRef.current = new tt.Marker({ element: el }).setLngLat([activeLocation[0], activeLocation[1]]).addTo(mapRef.current)
    } else {
      markerRef.current.setLngLat([activeLocation[0], activeLocation[1]])
    }
    if (!userHasInteractedRef.current) {
      mapRef.current.setCenter([activeLocation[0], activeLocation[1]])
    }
  }, [activeLocation])

  const zoomIn = () => {
    if (!mapRef.current) return
    userHasInteractedRef.current = true
    mapRef.current.setZoom(Math.min(mapRef.current.getZoom() + 1, 19))
  }
  const zoomOut = () => {
    if (!mapRef.current) return
    userHasInteractedRef.current = true
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom() - 1, 3))
  }
  const centerMe = () => {
    if (!mapRef.current || !activeLocation) return
    userHasInteractedRef.current = false
    mapRef.current.setCenter([activeLocation[0], activeLocation[1]])
    mapRef.current.setZoom(16)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', bottom: '110px', right: '12px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button onClick={zoomIn} style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#0066FF', color: 'white', border: 'none', fontSize: '26px', fontWeight: '900', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>+</button>
        <button onClick={zoomOut} style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#0066FF', color: 'white', border: 'none', fontSize: '26px', fontWeight: '900', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>−</button>
        <button onClick={centerMe} style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'white', color: 'black', border: '1px solid #ddd', fontSize: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>🎯</button>
      </div>
    </div>
  )
}