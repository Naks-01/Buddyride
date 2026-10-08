import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { assertMapboxConfigured } from './lib/mapbox'

export function MapView({ center, route, markers = [] }: {
  center: [number, number]
  route?: GeoJSON.LineString
  markers?: Array<{ id: string; lng: number; lat: number; label?: string }>
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  useEffect(() => {
    if (!el.current) return
    try { assertMapboxConfigured() } catch { return }
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
    map.current = new mapboxgl.Map({
      container: el.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 13,
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    return () => map.current?.remove()
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    m.setCenter(center)

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
      const apply = () => {
        if (m.getSource('ride-route')) {
          (m.getSource('ride-route') as mapboxgl.GeoJSONSource).setData({ type: 'Feature', geometry: route, properties: {} })
        } else {
          m.addSource('ride-route', { type: 'geojson', data: { type: 'Feature', geometry: route, properties: {} } })
          m.addLayer({
            id: 'ride-route-line',
            type: 'line',
            source: 'ride-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#007AFF',
              'line-width': 6,
              'line-opacity': 0.95
            }
          })
        }
        // auto zoom to route
        const bounds = new mapboxgl.LngLatBounds()
        route.coordinates.forEach((c: any) => bounds.extend(c as any))
        m.fitBounds(bounds, { padding: 100, duration: 800 })
      }
      m.isStyleLoaded()? apply() : m.once('load', apply)
    } else {
      // remove old line if no route
      if (m.getLayer('ride-route-line')) m.removeLayer('ride-route-line')
      if (m.getSource('ride-route')) m.removeSource('ride-route')
    }
  }, [center, route, markers])

  return <div ref={el} className="map" style={{ width:'100%', height:'100%' }} />
}