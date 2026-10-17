import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

export function MapboxMapView({ center, route, passengerLocation, driverLocation, mapStyle, theme, bearing = 0, isNavigating = false, followDriver = true }: any) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const passengerMarkerRef = useRef<mapboxgl.Marker | null>(null)

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle || 'mapbox://styles/mapbox/streets-v12',
      center: center || driverLocation || [29.4589, -23.9045],
      zoom: 15,
      pitch: 0,
      bearing: 0,
      antialias: true
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right')
    mapRef.current = map

    const addRouteLayer = () => {
      try {
        if (!map.getSource('route')) {
          map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any })
        }
        if (!map.getLayer('route-glow')) {
          map.addLayer({
            id: 'route-glow',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#1E90FF', 'line-width': 14, 'line-opacity': 0.2 }
          } as any)
        }
        if (!map.getLayer('route-line')) {
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#1E90FF', 'line-width': 6, 'line-opacity': 0.95 }
          } as any)
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

    // Driver marker - blue arrow that rotates with bearing
    const driverEl = document.createElement('div')
    driverEl.style.width = '46px'
    driverEl.style.height = '46px'
    driverEl.style.background = '#007AFF'
    driverEl.style.border = '3px solid white'
    driverEl.style.borderRadius = '23px'
    driverEl.style.boxShadow = '0 3px 12px rgba(0,0,0,0.5)'
    driverEl.style.display = 'flex'
    driverEl.style.alignItems = 'center'
    driverEl.style.justifyContent = 'center'
    driverEl.style.fontSize = '20px'
    driverEl.style.color = 'white'
    driverEl.innerHTML = '▲'
    driverMarkerRef.current = new mapboxgl.Marker({ element: driverEl, rotationAlignment: 'map' })
      .setLngLat(driverLocation || center || [29.4589, -23.9045])
      .addTo(map)

    // Passenger marker
    const passEl = document.createElement('div')
    passEl.style.width = '36px'
    passEl.style.height = '36px'
    passEl.style.background = 'black'
    passEl.style.borderRadius = '18px'
    passEl.style.display = 'flex'
    passEl.style.alignItems = 'center'
    passEl.style.justifyContent = 'center'
    passEl.style.fontSize = '18px'
    passEl.innerHTML = '👤'
    passengerMarkerRef.current = new mapboxgl.Marker({ element: passEl })
    
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Route line
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

  // Passenger pin
  useEffect(() => {
    if (!passengerLocation || !passengerMarkerRef.current || !mapRef.current) return
    passengerMarkerRef.current.setLngLat(passengerLocation).addTo(mapRef.current)
  }, [passengerLocation])

  // DRIVER FOLLOW + BEARING - This fixes your nav
  useEffect(() => {
    if (!mapRef.current || !driverLocation || !driverMarkerRef.current) return
    driverMarkerRef.current.setLngLat(driverLocation)
    
    const el = driverMarkerRef.current.getElement()
    if (el) el.style.transform = `rotate(${bearing}deg)`

    if (followDriver) {
      if (isNavigating) {
        // Driving mode: tilted 60°, zoomed in, rotates with car
        mapRef.current.easeTo({ center: driverLocation, zoom: 17.5, pitch: 60, bearing: bearing, duration: 1000 })
      } else {
        // Idle: top-down
        mapRef.current.easeTo({ center: driverLocation, zoom: 15, pitch: 0, bearing: 0, duration: 1000 })
      }
    } else if (center) {
      // Not following, but center prop changed (passenger app)
      mapRef.current.easeTo({ center, duration: 1000 })
    }
  }, [driverLocation, center, bearing, isNavigating, followDriver])

  useEffect(() => {
    if (!mapRef.current || !mapStyle) return
    try { mapRef.current.setStyle(mapStyle) } catch {}
  }, [mapStyle])

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <style>{`
       .mapboxgl-ctrl-top-right { top: 75px!important; right: 12px!important; z-index: 500!important; }
       .mapboxgl-ctrl-group { background: white!important; border-radius: 12px!important; box-shadow: 0 4px 12px rgba(0,0,0,0.35)!important; }
       .mapboxgl-ctrl-group button { width: 42px!important; height: 42px!important; }
      `}</style>
    </>
  )
}