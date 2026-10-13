import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

export function MapboxMapView({ center, route, passengerLocation, driverLocation, mapStyle, theme }: any) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle || 'mapbox://styles/mapbox/streets-v12',
      center: center || [29.4589, -23.9045],
      zoom: 15,
      pitch: 55,
      bearing: -10,
      antialias: true
    })
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    mapRef.current = map

    const addRouteLayer = () => {
      try {
        if (!map.getSource('route')) {
          map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any })
        }
        if (!map.getLayer('route-line')) {
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            paint: { 'line-color': '#1E90FF', 'line-width': 6, 'line-opacity': 0.95 }
          })
        }
        // 3D buildings
        try {
          const layers = map.getStyle().layers
          const labelLayerId = layers?.find(l => l.type === 'symbol' && (l.layout as any)?.['text-field'])?.id
          if (!map.getLayer('3d-buildings')) {
            map.addLayer({
              id: '3d-buildings',
              source: 'composite',
              'source-layer': 'building',
              filter: ['==', 'extrude', 'true'],
              type: 'fill-extrusion',
              minzoom: 15,
              paint: { 'fill-extrusion-color': '#aaa', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'min_height'], 'fill-extrusion-opacity': 0.6 }
            }, labelLayerId)
          }
        } catch {}
      } catch {}
    }

    map.on('load', addRouteLayer)
    map.on('style.load', addRouteLayer)

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // FIX: clear route when undefined + blue polyline
  useEffect(() => {
    if (!mapRef.current) return
    const source: any = mapRef.current.getSource('route')
    if (!source) return

    if (!route) {
      source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} })
      return
    }

    let coords: any = []
    if (route.type === 'Feature') coords = route.geometry.coordinates
    else if (route.coordinates) coords = route.coordinates
    else if (route.geometry?.coordinates) coords = route.geometry.coordinates
    else coords = route

    source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
  }, [route])

  useEffect(() => {
    if (!mapRef.current ||!center) return
    try { mapRef.current.flyTo({ center, duration: 1000 }) } catch {}
  }, [center])

  useEffect(() => {
    if (!mapRef.current ||!mapStyle) return
    try { mapRef.current.setStyle(mapStyle) } catch {}
  }, [mapStyle])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}