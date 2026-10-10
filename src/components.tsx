import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { assertMapboxConfigured } from './lib/mapbox'

export function MapView({ center, route, markers = [], driverLocation, isNavigating, bearing }: {
  center: [number, number]
  route?: GeoJSON.LineString | any
  markers?: Array<{ id: string; lng: number; lat: number; label?: string }>
  driverLocation?: [number, number]
  isNavigating?: boolean
  bearing?: number
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)

  useEffect(() => {
    if (!el.current) return
    try { assertMapboxConfigured() } catch { return }
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

    // BOLT: navigation-day when driver is navigating, streets when passenger
    const style = isNavigating || driverLocation
     ? 'mapbox://styles/mapbox/navigation-day-v1'
      : 'mapbox://styles/mapbox/streets-v12'

    map.current = new mapboxgl.Map({
      container: el.current,
      style,
      center: driverLocation || center,
      zoom: isNavigating? 17 : 13,
      pitch: isNavigating? 45 : 0, // Bolt 3D tilt
      bearing: bearing || 0,
      antialias: true
    })
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right')
    return () => map.current?.remove()
  }, [])

  // BOLT: Update style, zoom, pitch, bearing when navigating
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (isNavigating) {
      m.easeTo({
        center: driverLocation || center,
        zoom: 17,
        pitch: 45,
        bearing: bearing || m.getBearing(),
        duration: 1000
      })
    } else {
      m.easeTo({ center: center, zoom: 13, pitch: 0, duration: 1000 })
    }
  }, [center, driverLocation, isNavigating, bearing])

  // BOLT: Driver car marker with rotation
  useEffect(() => {
    const m = map.current
    if (!m ||!driverLocation) return

    const pos = driverLocation
    if (!driverMarkerRef.current) {
      const div = document.createElement('div')
      div.style.width = '44px'
      div.style.height = '44px'
      div.style.background = '#00d181'
      div.style.border = '3px solid white'
      div.style.borderRadius = '50%'
      div.style.boxShadow = '0 3px 10px rgba(0,0,0,0.4)'
      div.style.display = 'flex'
      div.style.alignItems = 'center'
      div.style.justifyContent = 'center'
      div.style.fontSize = '22px'
      div.innerHTML = '🚗'
      driverMarkerRef.current = new mapboxgl.Marker({ element: div, rotationAlignment: 'map' })
       .setLngLat(pos)
       .addTo(m)
    } else {
      driverMarkerRef.current.setLngLat(pos)
    }
  }, [driverLocation])

  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!isNavigating) m.setCenter(center)

    // clear old markers
    markersRef.current.forEach(x => x.remove())
    markersRef.current = []
    for (const marker of markers) {
      const mk = new mapboxgl.Marker().setLngLat([marker.lng, marker.lat])
      if (marker.label) mk.setPopup(new mapboxgl.Popup().setText(marker.label))
      mk.addTo(m)
      markersRef.current.push(mk)
    }

    if (route && route.coordinates?.length) {
      const geo = route.type === 'Feature'? route.geometry : route
      const apply = () => {
        const data = { type: 'Feature' as const, geometry: geo, properties: {} }
        if (m.getSource('ride-route')) {
          (m.getSource('ride-route') as mapboxgl.GeoJSONSource).setData(data)
        } else {
          m.addSource('ride-route', { type: 'geojson', data })
          // Bolt glow
          m.addLayer({
            id: 'ride-route-glow',
            type: 'line',
            source: 'ride-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00d181', 'line-width': 12, 'line-opacity': 0.25 }
          })
          m.addLayer({
            id: 'ride-route-line',
            type: 'line',
            source: 'ride-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': isNavigating? '#00d181' : '#007AFF',
              'line-width': 6,
              'line-opacity': 0.95
            }
          })
        }
        const bounds = new mapboxgl.LngLatBounds()
        geo.coordinates.forEach((c: any) => bounds.extend(c as any))
        if (!isNavigating) m.fitBounds(bounds, { padding: 100, duration: 800 })
      }
      m.isStyleLoaded()? apply() : m.once('load', apply)
    } else {
      if (m.getLayer('ride-route-line')) m.removeLayer('ride-route-line')
      if (m.getLayer('ride-route-glow')) m.removeLayer('ride-route-glow')
      if (m.getSource('ride-route')) m.removeSource('ride-route')
    }
  }, [center, route, markers, isNavigating])

  return <div ref={el} className="map" style={{ width:'100%', height:'100%' }} />
}

// Keep your old export name if you had MapView in components.tsx
export const MapViewComponent = MapView