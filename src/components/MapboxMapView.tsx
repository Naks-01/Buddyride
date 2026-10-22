import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

export function MapboxMapView({ center, route, passengerLocation, driverLocation, bearing = 0, isNavigating = false, followDriver = true }: any) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const passengerMarkerRef = useRef<mapboxgl.Marker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: center || driverLocation || [29.4589, -23.9045],
      zoom: 15.5,
      pitch: 0,
      bearing: 0,
      antialias: true
    })
    mapRef.current = map
    map.on('load', () => setTimeout(() => map.resize(), 150))

    const addRoute = () => {
      try {
        if (!map.getSource('route')) {
          map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any })
        }
        if (!map.getLayer('route-line')) {
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#FF6B00', 'line-width': 5.5, 'line-opacity': 0.95 }
          } as any)
        }
        if (!map.getLayer('route-outline')) {
          map.addLayer({
            id: 'route-outline',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.6 },
            // @ts-ignore
            before: 'route-line'
          } as any)
        }
      } catch {}
    }
    map.on('load', addRoute)
    map.on('style.load', addRoute)

    // BEAUTIFUL DRIVER MARKER - Uber style
    const driverEl = document.createElement('div')
    driverEl.style.width = '56px'
    driverEl.style.height = '56px'
    driverEl.style.position = 'relative'
    driverEl.innerHTML = `
      <div style="width:56px;height:56px;background:white;border-radius:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,0.18);border:2px solid white;">
        <div style="width:22px;height:22px;background:#FF6B00;border-radius:50%;box-shadow:0 0 0 6px rgba(255,107,0,0.15);"></div>
      </div>
    `
    driverMarkerRef.current = new mapboxgl.Marker({ element: driverEl, rotationAlignment: 'viewport', pitchAlignment: 'viewport', anchor: 'center' }).setLngLat(driverLocation || center || [29.4589, -23.9045]).addTo(map)

    // PASSENGER PIN
    const passEl = document.createElement('div')
    passEl.innerHTML = `<div style="width:40px;height:40px;background:#111;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.25);">📍</div>`
    passengerMarkerRef.current = new mapboxgl.Marker({ element: passEl, anchor: 'bottom' })

    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    const source: any = mapRef.current.getSource('route')
    if (!source) return
    if (!route) { source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} }); return }
    let coords = route.type === 'Feature' ? route.geometry.coordinates : route.coordinates || route.geometry?.coordinates || route
    source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
  }, [route])

  useEffect(() => {
    if (!passengerLocation || !passengerMarkerRef.current || !mapRef.current) return
    passengerMarkerRef.current.setLngLat(passengerLocation).addTo(mapRef.current)
  }, [passengerLocation])

  useEffect(() => {
    if (!mapRef.current || !driverLocation || !driverMarkerRef.current) return
    driverMarkerRef.current.setLngLat(driverLocation)
    driverMarkerRef.current.setRotation(((bearing % 360) + 360) % 360)
    if (followDriver) {
      if (isNavigating) {
        mapRef.current.easeTo({ center: driverLocation, zoom: 17, pitch: 50, bearing: bearing, duration: 900 })
      } else {
        mapRef.current.easeTo({ center: driverLocation, zoom: 15.5, pitch: 0, bearing: 0, duration: 900 })
      }
    }
  }, [driverLocation, bearing, isNavigating, followDriver])

  return <div ref={containerRef} className="w-full h-full" style={{ width: '100%', height: '100%', background: '#f8f9fa' }} />
}