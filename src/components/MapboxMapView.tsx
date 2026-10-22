import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

export function MapboxMapView({ center, route, passengerLocation, driverLocation, mapStyle, theme, bearing = 0, isNavigating = false, followDriver = true }: any) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const passengerMarkerRef = useRef<mapboxgl.Marker | null>(null)

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

    map.on('load', () => {
      setTimeout(() => map.resize(), 100)
    })

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
            paint: { 
              'line-color': '#FF6B00',
              'line-width': 20, 
              'line-opacity': 0.28, 
              'line-blur': 12 
            }
          } as any)
        }
        if (!map.getLayer('route-line')) {
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 
              'line-color': '#FF6B00',
              'line-width': 6.5, 
              'line-opacity': 1 
            }
          } as any)
        }
      } catch {}
    }

    map.on('load', addRouteLayer)
    map.on('style.load', addRouteLayer)

    const driverEl = document.createElement('div')
    driverEl.style.width = '52px'
    driverEl.style.height = '52px'
    driverEl.style.background = '#FF6B00'
    driverEl.style.border = '4px solid white'
    driverEl.style.borderRadius = '26px'
    driverEl.style.boxShadow = '0 4px 16px rgba(255,107,0,0.5)'
    driverEl.style.display = 'flex'
    driverEl.style.alignItems = 'center'
    driverEl.style.justifyContent = 'center'
    driverEl.style.fontSize = '22px'
    driverEl.style.color = 'white'
    driverEl.style.transition = 'transform 0.3s linear'
    driverEl.innerHTML = '▲'
    // FIX: use viewport alignment and let Mapbox handle rotation
    driverMarkerRef.current = new mapboxgl.Marker({ element: driverEl, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat(driverLocation || center || [29.4589, -23.9045]).addTo(map)

    const passEl = document.createElement('div')
    passEl.style.width = '40px'
    passEl.style.height = '40px'
    passEl.style.background = '#121214'
    passEl.style.border = '3px solid white'
    passEl.style.borderRadius = '20px'
    passEl.style.display = 'flex'
    passEl.style.alignItems = 'center'
    passEl.style.justifyContent = 'center'
    passEl.style.fontSize = '20px'
    passEl.innerHTML = '📍'
    passengerMarkerRef.current = new mapboxgl.Marker({ element: passEl })
    
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    const source: any = mapRef.current.getSource('route')
    if (!source) return
    if (!route) { source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} }); return }
    let coords: any = []
    if (route.type === 'Feature') coords = route.geometry.coordinates
    else if (route.coordinates) coords = route.coordinates
    else if (route.geometry?.coordinates) coords = route.geometry.coordinates
    else coords = route
    source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
  }, [route])

  useEffect(() => {
    if (!passengerLocation || !passengerMarkerRef.current || !mapRef.current) return
    passengerMarkerRef.current.setLngLat(passengerLocation).addTo(mapRef.current)
  }, [passengerLocation])

  useEffect(() => {
    if (!mapRef.current || !driverLocation || !driverMarkerRef.current) return
    driverMarkerRef.current.setLngLat(driverLocation)
    // FIX: Use Mapbox rotation API - keeps movement straight
    const normalizedBearing = ((bearing % 360) + 360) % 360
    driverMarkerRef.current.setRotation(normalizedBearing)
    if (followDriver) {
      if (isNavigating) { mapRef.current.easeTo({ center: driverLocation, zoom: 17.5, pitch: 60, bearing: bearing, duration: 1000 }) }
      else { mapRef.current.easeTo({ center: driverLocation, zoom: 15, pitch: 0, bearing: 0, duration: 1000 }) }
    } else if (center) { mapRef.current.easeTo({ center, duration: 1000 }) }
  }, [driverLocation, center, bearing, isNavigating, followDriver])

  // Keep this so parent can still change style if needed
  useEffect(() => { 
    if (!mapRef.current || !mapStyle) return; 
    try { mapRef.current.setStyle(mapStyle) } catch {} 
  }, [mapStyle])

  return (
    <>
      <div ref={containerRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
      <style>{`.mapboxgl-ctrl-top-right{top:75px!important;right:12px!important;}.mapboxgl-ctrl-group{background:#ffffff!important;border-radius:12px!important;border:1px solid #ddd!important;}`}</style>
    </>
  )
}