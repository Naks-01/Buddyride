import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
if (TOKEN) mapboxgl.accessToken = TOKEN

export function MapView({ center, route, driverLocation, isNavigating, followDriver, bearing = 0, mapStyle, theme }: any) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const routeCacheRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!TOKEN) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle || (theme === 'dark'? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'),
      center: center || [29.4589, -23.9045],
      zoom: 13,
      pitch: 0,
      antialias: true,
    })
    mapRef.current = map
    setTimeout(() => map.resize(), 100)

    map.on('style.load', () => {
      if (routeCacheRef.current) setTimeout(() => addRouteToMap(routeCacheRef.current), 200)
      map.resize()
    })

    return () => { map.remove(); mapRef.current = null }
  }, [])

  function addRouteToMap(routeData: any) {
    if (!mapRef.current ||!routeData) return
    const map = mapRef.current
    const geo = routeData.type === 'Feature'? routeData : { type: 'Feature', geometry: routeData, properties: {} }
    try {
      if (map.getSource('route')) (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geo as any)
      else {
        map.addSource('route', { type: 'geojson', data: geo as any })
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#1E90FF', 'line-width': 6, 'line-opacity': 0.95 } })
      }
    } catch {}
  }

  // FIX: CLEAR ROUTE WHEN UNDEFINED - stops ghost at 01:07
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current

    if (!route) {
      routeCacheRef.current = null
      try {
        const source = map.getSource('route') as any
        if (source) source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} })
      } catch {}
      return
    }

    routeCacheRef.current = route
    const doAdd = () => addRouteToMap(route)
    if (!map.isStyleLoaded()) map.once('load', doAdd)
    else doAdd()
  }, [route])

  useEffect(() => {
    if (!mapRef.current ||!followDriver ||!driverLocation) return
    mapRef.current.easeTo({ center: driverLocation, bearing: isNavigating? bearing : 0, pitch: isNavigating? 45 : 0, zoom: isNavigating? 16.5 : 14, duration: 1000 })
  }, [driverLocation, followDriver, bearing, isNavigating])

  useEffect(() => {
    if (!mapRef.current ||!driverLocation) return
    if (!driverMarkerRef.current) {
      const el = document.createElement('div')
      el.style.width = '40px'; el.style.height = '40px'; el.style.background = '#1E90FF'
      el.style.borderRadius = '20px'; el.style.border = '3px solid white'
      el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)'
      el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center'
      el.innerText = '🚗'
      driverMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(driverLocation).addTo(mapRef.current)
    } else driverMarkerRef.current.setLngLat(driverLocation)
  }, [driverLocation])

  if (!TOKEN) return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: 'white' }}>Missing VITE_MAPBOX_TOKEN</div>

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '100vh', background: theme === 'light'? '#f5f5f7' : '#0e0e10' }} />
}