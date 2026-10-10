import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { assertMapboxConfigured } from './lib/mapbox'

export function MapView({ center, route, markers = [], driverLocation, isNavigating, bearing, followDriver }: {
  center: [number, number]
  route?: GeoJSON.LineString | any
  markers?: Array<{ id: string; lng: number; lat: number; label?: string }>
  driverLocation?: [number, number]
  isNavigating?: boolean
  bearing?: number
  followDriver?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const lastCenterRef = useRef<[number, number]>(center)
  const hasFitRoute = useRef(false)

  useEffect(() => {
    if (!el.current) return
    try { assertMapboxConfigured() } catch { return }
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

    const style = isNavigating || driverLocation
    ? 'mapbox://styles/mapbox/navigation-day-v1'
      : 'mapbox://styles/mapbox/streets-v12'

    map.current = new mapboxgl.Map({
      container: el.current,
      style,
      center: driverLocation || center,
      zoom: isNavigating? 17 : 13,
      pitch: isNavigating? 45 : 0,
      bearing: bearing || 0,
      antialias: true
    })
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right')
    lastCenterRef.current = center
    return () => map.current?.remove()
  }, []) // create once

  // ✅ FIXED: Only change zoom/pitch when isNavigating toggles, NOT on every location
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (isNavigating) {
      m.easeTo({ zoom: 17, pitch: 45, duration: 800 })
    } else {
      m.easeTo({ zoom: 13, pitch: 0, duration: 800 })
      hasFitRoute.current = false
    }
  }, [isNavigating])

  // ✅ FIXED: Driver marker moves, map ONLY follows if >30m away and followDriver=true
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

    // Follow logic - only if followDriver enabled and far
    if (followDriver && isNavigating) {
      const currentCenter = m.getCenter()
      const dist = Math.hypot(currentCenter.lng - pos[0], currentCenter.lat - pos[1])
      if (dist > 0.0003) { // ~30m
        m.easeTo({ center: pos, duration: 1000 })
      }
    }
  }, [driverLocation, isNavigating, followDriver])

  // ✅ FIXED: center updates only when NOT navigating
  useEffect(() => {
    const m = map.current
    if (!m || isNavigating) return
    const dist = Math.hypot(center[0] - lastCenterRef.current[0], center[1] - lastCenterRef.current[1])
    if (dist > 0.0001) {
      m.easeTo({ center, duration: 800 })
      lastCenterRef.current = center
    }
  }, [center, isNavigating])

  // ✅ FIXED: markers and route - no more setCenter or fitBounds when navigating
  useEffect(() => {
    const m = map.current
    if (!m) return

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
        // Fit bounds ONLY once when route first appears and NOT navigating
        if (!isNavigating &&!hasFitRoute.current) {
          const bounds = new mapboxgl.LngLatBounds()
          geo.coordinates.forEach((c: any) => bounds.extend(c as any))
          m.fitBounds(bounds, { padding: 100, duration: 800 })
          hasFitRoute.current = true
        }
      }
      m.isStyleLoaded()? apply() : m.once('load', apply)
    } else {
      if (m.getLayer('ride-route-line')) m.removeLayer('ride-route-line')
      if (m.getLayer('ride-route-glow')) m.removeLayer('ride-route-glow')
      if (m.getSource('ride-route')) m.removeSource('ride-route')
      hasFitRoute.current = false
    }
  }, [route, markers, isNavigating])

  return <div ref={el} className="map" style={{ width:'100%', height:'100%' }} />
}

export const MapViewComponent = MapView