import { useEffect, useRef } from 'react'
import * as tt from '@tomtom-international/web-sdk-maps'
import '@tomtom-international/web-sdk-maps/dist/maps.css'

type Props = {
  center: [number, number] // [lng, lat]
  availableCars?: { driver_id: string, lat: number, lng: number }[]
  theme?: 'dark' | 'light'
  pickup?: [number, number] | null
  dropoff?: [number, number] | null
  route?: any
}

export function PassengerTomTomMap({ center, availableCars = [], theme = 'light', pickup, dropoff, route }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY || 'no-key'

    const map = tt.map({
      key: apiKey,
      container: containerRef.current as any,
      center: center,
      zoom: 13,
      minZoom: 2,   // can zoom out to see whole world
      maxZoom: 22,  // can zoom in to street names / houses
      dragPan: true,
      scrollZoom: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
      dragRotate: true,
      style: 'https://api.tomtom.com/style/2/custom/style/20.1.0-8/main.json?key=' + apiKey,
    })

    map.addControl(new tt.NavigationControl(), 'top-right')
    map.addControl(new tt.FullscreenControl(), 'top-right')

    mapRef.current = map
    return () => { try { map.remove() } catch {}; mapRef.current = null }
  }, [])

  // Update center when it changes
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.setCenter(center)
    }
  }, [center])

  // Cars + pins
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    availableCars.forEach(c => {
      const el = document.createElement('div')
      el.innerHTML = `<div style="width:32px;height:32px;border-radius:50%;background:#0066FF;border:2px solid white;display:grid;place-items:center;color:white;font-size:16px;box-shadow:0 2px 8px #0005">🚗</div>`
      const marker = new tt.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map)
      markersRef.current.push(marker)
    })

    if (pickup) {
      const el = document.createElement('div')
      el.innerHTML = `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0066FF;border:3px solid white;display:grid;place-items:center"><span style="transform:rotate(45deg)">📍</span></div>`
      markersRef.current.push(new tt.Marker({ element: el }).setLngLat(pickup).addTo(map))
    }
    if (dropoff) {
      const el = document.createElement('div')
      el.innerHTML = `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#dc2626;border:3px solid white;display:grid;place-items:center"><span style="transform:rotate(45deg)">🏁</span></div>`
      markersRef.current.push(new tt.Marker({ element: el }).setLngLat(dropoff).addTo(map))
    }
  }, [availableCars, pickup, dropoff])

  // Route line
  useEffect(() => {
    const map = mapRef.current
    if (!map || !route?.coordinates) return
    if (map.getSource('route')) {
      (map.getSource('route') as any).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: route.coordinates } })
    } else {
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: route.coordinates } } })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#0066FF', 'line-width': 6 } })
    }
  }, [route])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '400px' }} />
}