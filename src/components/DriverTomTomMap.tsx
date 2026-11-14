import { useEffect, useRef } from 'react'
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
}

export function DriverTomTomMap({ center, driverLocation }: Props) {
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<any>(null)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY || 'no-key'
    const map = tt.map({ key: apiKey, container: containerRef.current as any, center: [center[0], center[1]], zoom: 14 })
    map.addControl(new tt.NavigationControl(), 'bottom-right')
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])
  useEffect(() => {
    if (!mapRef.current || !driverLocation) return
    mapRef.current.setCenter([driverLocation[0], driverLocation[1]])
    if (!markerRef.current) {
      const el = document.createElement('div'); el.innerHTML = '🚗'; el.style.fontSize = '32px'
      markerRef.current = new tt.Marker({ element: el }).setLngLat([driverLocation[0], driverLocation[1]]).addTo(mapRef.current)
    } else markerRef.current.setLngLat([driverLocation[0], driverLocation[1]])
  }, [driverLocation])
  return <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#e9eef5' }} />
}