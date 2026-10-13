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
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle || 'mapbox://styles/mapbox/dark-v11',
      center: center || [29.4589, -23.9045],
      zoom: 13
    })
    mapRef.current = map

    // Re-add route after style loads (for day/night switch)
    map.on('style.load', () => {
      if (routeCacheRef.current) {
        setTimeout(() => addRouteToMap(routeCacheRef.current), 100)
      }
    })

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // NEW: Day/Night map switch - keeps route
  useEffect(() => {
    if (!mapRef.current ||!mapStyle) return
    // Save route before switching
    if (route) routeCacheRef.current = route

    const currentStyle = (mapRef.current as any).style?.stylesheet?.name || ''
    if (mapRef.current.isStyleLoaded()) {
      mapRef.current.setStyle(mapStyle)
    }
  }, [mapStyle])

  function addRouteToMap(routeData: any) {
    if (!mapRef.current ||!routeData) return
    const map = mapRef.current
    const geo = routeData.type === 'Feature'? routeData : { type: 'Feature', geometry: routeData, properties: {} }

    try {
      if (map.getSource('route')) {
        (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geo as any)
      } else {
        map.addSource('route', { type: 'geojson', data: geo as any })
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#00d181', 'line-width': 7, 'line-opacity': 0.95 }
        })
        map.addLayer({
          id: 'route-arrows',
          type: 'symbol',
          source: 'route',
          layout: {
            'symbol-placement': 'line',
            'text-field': '▲',
            'text-size': 18,
            'symbol-spacing': 75,
            'text-keep-upright': false,
            'text-rotation-alignment': 'map',
            'text-allow-overlap': true
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#00d181',
            'text-halo-width': 2
          }
        })
      }
    } catch (e) {
      // Retry after style fully loaded
      setTimeout(() => {
        try {
          if (!map.getSource('route')) {
            map.addSource('route', { type: 'geojson', data: geo as any })
            map.addLayer({
              id: 'route-line',
              type: 'line',
              source: 'route',
              paint: { 'line-color': '#00d181', 'line-width': 7, 'line-opacity': 0.95 }
            })
          }
        } catch {}
      }, 300)
    }
  }

  useEffect(() => {
    if (!mapRef.current ||!followDriver ||!driverLocation) return
    mapRef.current.easeTo({
      center: driverLocation,
      bearing: isNavigating? bearing : 0,
      pitch: isNavigating? 55 : 0,
      zoom: isNavigating? 17 : 13,
      duration: 1000
    })
  }, [driverLocation, followDriver, bearing, isNavigating])

  useEffect(() => {
    if (!mapRef.current ||!route) return
    routeCacheRef.current = route
    const map = mapRef.current

    const doAdd = () => addRouteToMap(route)

    if (!map.isStyleLoaded()) map.once('load', doAdd)
    else doAdd()
  }, [route])

  useEffect(() => {
    if (!mapRef.current ||!driverLocation) return
    const map = mapRef.current
    if (!driverMarkerRef.current) {
      const el = document.createElement('div')
      el.style.width = '36px'
      el.style.height = '36px'
      el.style.background = '#00d181'
      el.style.borderRadius = '18px'
      el.style.border = '3px solid white'
      el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)'
      el.style.display = 'flex'
      el.style.alignItems = 'center'
      el.style.justifyContent = 'center'
      el.style.fontSize = '18px'
      el.innerText = '▲'
      el.style.color = 'white'
      driverMarkerRef.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat(driverLocation).addTo(map)
    } else {
      driverMarkerRef.current.setLngLat(driverLocation)
      const el = driverMarkerRef.current.getElement()
      el.style.transform = `rotate(${bearing}deg)`
    }
  }, [driverLocation, bearing])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', background: theme === 'light'? '#f5f5f7' : '#0e0e10' }} />
}