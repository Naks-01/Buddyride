import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

export function MapboxMapView({ center, route, driverLocation, theme, bearing = 0, isNavigating = false, followDriver = true, speedKmh = 0 }: any) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/navigation-day-v1', // GOOGLE-LIKE nav style
      center: center || driverLocation || [29.4589, -23.9045],
      zoom: 18,
      pitch: 60, // TILT like Google Maps navigation
      bearing: bearing,
      antialias: true,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')

    map.on('load', () => {
      // BLUE ROUTE LINE like Google
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } })
      map.addLayer({ id: 'route-bg', type: 'line', source: 'route', paint: { 'line-color': '#1a237e', 'line-width': 12, 'line-opacity': 0.3 } })
      map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#2962FF', 'line-width': 8, 'line-opacity': 1 } })

      // 3D Buildings like Google
      map.addLayer({ id: '3d-buildings', source: 'composite', 'source-layer': 'building', type: 'fill-extrusion', minzoom: 15, paint: { 'fill-extrusion-color': '#aaa', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.6 } })

      // Driver arrow like Google Maps
      const el = document.createElement('div')
      el.innerHTML = `<div style="width:60px;height:60px;display:flex;align-items:center;justify-content:center;transform:rotate(${bearing}deg)"><svg viewBox="0 0 24 24" width="48" height="48" fill="#2962FF" stroke="white" stroke-width="2"><path d="M12 2L4 20L12 16L20 20L12 2Z"/></svg></div>`
      new mapboxgl.Marker({ element: el }).setLngLat(driverLocation || center || [29.4589, -23.9045]).addTo(map)
    })

    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (route) {
      const src = map.getSource('route') as any
      if (src) {
        const coords = route.type === 'Feature' ? route.geometry.coordinates : route.coordinates || route
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
      }
    }
    if (driverLocation && followDriver) {
      map.easeTo({
        center: driverLocation,
        zoom: isNavigating ? 18 : 16,
        pitch: isNavigating ? 60 : 0, // Tilt when navigating like Google
        bearing: isNavigating ? bearing : 0, // Rotate map when driving
        duration: 800,
      })
    }
  }, [route, driverLocation, bearing, isNavigating, followDriver])

  return <div ref={containerRef} style={{ width:'100%', height:'100%' }} />
}