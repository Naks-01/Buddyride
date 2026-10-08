import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { assertMapboxConfigured } from './lib/mapbox'

export function MapView({ center, route, markers = [] }: {
  center: [number, number]
  route?: GeoJSON.LineString
  markers?: Array<{ id: string; lng: number; lat: number; label?: string }>
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)

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
    for (const marker of markers) new mapboxgl.Marker().setLngLat([marker.lng, marker.lat]).setPopup(marker.label ? new mapboxgl.Popup().setText(marker.label) : undefined).addTo(m)
    if (route) {
      const apply = () => {
        if (m.getSource('ride-route')) (m.getSource('ride-route') as mapboxgl.GeoJSONSource).setData({ type: 'Feature', geometry: route, properties: {} })
        else {
          m.addSource('ride-route', { type: 'geojson', data: { type: 'Feature', geometry: route, properties: {} } })
          m.addLayer({ id: 'ride-route-line', type: 'line', source: 'ride-route', paint: { 'line-width': 5 } })
        }
      }
      m.isStyleLoaded() ? apply() : m.once('load', apply)
    }
  }, [center, route, markers])

  return <div ref={el} className="map" />
}