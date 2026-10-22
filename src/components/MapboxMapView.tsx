import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

// Helper: ensure [lng, lat] order — fixes green lines bug
function toLngLat(pos: any): [number, number] {
  if (!pos) return [29.4589, -23.9045] // Polokwane
  // If it's [lat, lng] with lat negative like -23, swap it
  if (Array.isArray(pos) && pos[0] < 0) return [pos[1], pos[0]]
  if (Array.isArray(pos)) return pos
  if (pos.lng && pos.lat) return [pos.lng, pos.lat]
  return [29.4589, -23.9045]
}

export function MapboxMapView({ center, route, driverLocation, theme, bearing = 0, isNavigating = false, followDriver = true, speedKmh = 0 }: any) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const initialCenter = toLngLat(center || driverLocation)

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: isNavigating 
        ? 'mapbox://styles/mapbox/navigation-day-v1' // Blue line mode when driving
        : 'mapbox://styles/mapbox/streets-v12', // NORMAL streets when offline — NO GREEN LINES
      center: initialCenter,
      zoom: 16,
      pitch: isNavigating ? 60 : 0,
      bearing: bearing,
      antialias: true,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')

    map.on('load', () => {
      // BLUE ROUTE like Google Maps
      if (!map.getSource('route')) {
        map.addSource('route', { 
          type: 'geojson', 
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any
        })
        map.addLayer({ id: 'route-bg', type: 'line', source: 'route', paint: { 'line-color': '#1a237e', 'line-width': 12, 'line-opacity': 0.3, 'line-blur': 1 } })
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#2962FF', 'line-width': 8, 'line-join': 'round', 'line-cap': 'round' } })
      }

      // Driver arrow
      const el = document.createElement('div')
      el.innerHTML = `<div style="width:50px;height:50px;display:flex;align-items:center;justify-content:center;transform:rotate(${bearing}deg)"><svg viewBox="0 0 24 24" width="40" height="40" fill="#2962FF" stroke="white" stroke-width="2"><path d="M12 2L4 20L12 16L20 20L12 2Z"/></svg></div>`
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(initialCenter).addTo(map)
      markerRef.current = marker
    })

    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Update route blue line
    if (route) {
      const src = map.getSource('route') as any
      if (src) {
        const coords = route.type === 'Feature' ? route.geometry.coordinates : route.coordinates || route
        // Normalize all coords to [lng,lat]
        const fixed = coords.map((c:any) => toLngLat(c))
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: fixed }, properties: {} })
      }
    }

    // Update style when GO ONLINE / start navigating
    if (isNavigating && map.getStyle().name !== 'Mapbox Navigation Day') {
      map.setStyle('mapbox://styles/mapbox/navigation-day-v1')
    }

    if (driverLocation && followDriver) {
      const lngLat = toLngLat(driverLocation)
      map.easeTo({
        center: lngLat,
        zoom: isNavigating ? 18 : 16,
        pitch: isNavigating ? 60 : 0,
        bearing: isNavigating ? bearing : 0,
        duration: 800,
      })
      if (markerRef.current) markerRef.current.setLngLat(lngLat)
    }
  }, [route, driverLocation, bearing, isNavigating, followDriver])

  return <div ref={containerRef} style={{ width:'100%', height:'100vh', position:'absolute', inset:0 }} />
}