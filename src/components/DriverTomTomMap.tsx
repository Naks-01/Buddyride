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
  const [zoomLevel, setZoomLevel] = useState(14)

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
    map.on('zoom', () => setZoomLevel(Math.round(map.getZoom() * 10) / 10))
    map.on('dragstart', () => { userHasInteractedRef.current = true })
    map.on('zoomstart', () => { userHasInteractedRef.current = true })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    if (zoom === 17) {
      userHasInteractedRef.current = false
      if (driverLocation) {
        mapRef.current.setCenter([driverLocation[0], driverLocation[1]])
        mapRef.current.setZoom(17)
      }
    }
  }, [zoom])

  useEffect(() => {
    if (!mapRef.current || !driverLocation) return
    if (!markerRef.current) {
      const el = document.createElement('div')
      el.innerHTML = '🚗'
      el.style.fontSize = '32px'
      markerRef.current = new tt.Marker({ element: el }).setLngLat([driverLocation[0], driverLocation[1]]).addTo(mapRef.current)
    } else {
      markerRef.current.setLngLat([driverLocation[0], driverLocation[1]])
    }
    if (!userHasInteractedRef.current) {
      mapRef.current.setCenter([driverLocation[0], driverLocation[1]])
    }
  }, [driverLocation])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#e9eef5' }} />
      
      {/* FIX: Zoom buttons moved to BOTTOM-LEFT, above GO OFFLINE sheet - NOT on top header */}
      <div style={{ position: 'absolute', bottom: '110px', left: '12px', zIndex: 40, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button onClick={(e) => { e.stopPropagation(); userHasInteractedRef.current = true; mapRef.current?.zoomIn(); }} style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'white', border: '1px solid #ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', fontSize: '24px', fontWeight: 'bold' }}>+</button>
        <button onClick={(e) => { e.stopPropagation(); userHasInteractedRef.current = true; mapRef.current?.zoomOut(); }} style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'white', border: '1px solid #ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', fontSize: '24px', fontWeight: 'bold' }}>−</button>
        <button onClick={(e) => { e.stopPropagation(); userHasInteractedRef.current = false; if(driverLocation){ mapRef.current?.setCenter([driverLocation[0], driverLocation[1]]); mapRef.current?.setZoom(16);} }} style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'white', border: '1px solid #ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', fontSize: '18px' }}>🎯</button>
      </div>
    </div>
  )
}