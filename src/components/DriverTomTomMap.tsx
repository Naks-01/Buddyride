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
    map.on('touchstart', () => { userHasInteractedRef.current = true })
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
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#e9eef5', touchAction: 'none' }} />
      {/* ZOOM BUTTONS REMOVED - they were covering header / day-night button. Use pinch to zoom. */}
    </div>
  )
}