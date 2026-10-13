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
    if (!TOKEN) {
      console.error('Missing VITE_MAPBOX_TOKEN in.env.local')
      return
    }
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
    setTimeout(() => map.resize(), 600)
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)

    map.on('style.load', () => {
      try {
        map.setFog({
          color: theme === 'light'? '#e8f0fe' : '#0e0e10',
          'high-color': theme === 'light'? '#87ceeb' : '#1a1a2e',
          'horizon-blend': 0.02,
        } as any)

        if (!map.getLayer('sky')) {
          map.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
              'sky-type': 'gradient',
              'sky-gradient': [
                'interpolate', ['linear'], ['sky-radial-progress'],
                0.8, theme === 'light'? '#b0d5f5' : '#1a1a1f',
                1, theme === 'light'? '#ffffff' : '#0e0e10'
              ],
            }
          } as any)
        }

        const labelId = map.getStyle().layers?.find((l: any) => l.type === 'symbol' && l.layout?.['text-field'])?.id
        if (!map.getLayer('3d-buildings')) {
          map.addLayer({
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': theme === 'light'? '#d1d5db' : '#2a2a2e',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.6,
            },
          } as any, labelId)
        }
      } catch {}
      if (routeCacheRef.current) setTimeout(() => addRouteToMap(routeCacheRef.current), 200)
      map.resize()
    })

    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    if (route) routeCacheRef.current = route
    // FIX: don't call setStyle every render, only when theme changes
    if (mapRef.current.isStyleLoaded() && mapStyle && mapRef.current.getStyle().sprite!== mapStyle) {
      mapRef.current.setStyle(mapStyle)
    }
  }, [mapStyle])

  function addRouteToMap(routeData: any) {
    if (!mapRef.current ||!routeData) return
    const map = mapRef.current
    const geo = routeData.type === 'Feature'? routeData : { type: 'Feature', geometry: routeData, properties: {} }
    try {
      if (map.getSource('route')) (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geo as any)
      else {
        map.addSource('route', { type: 'geojson', data: geo as any })
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#00d181', 'line-width': 7, 'line-opacity': 0.95 } })
        map.addLayer({
          id: 'route-arrows', type: 'symbol', source: 'route',
          layout: { 'symbol-placement': 'line', 'text-field': '▶', 'text-size': 16, 'symbol-spacing': 80, 'text-keep-upright': false, 'text-rotation-alignment': 'map' },
          paint: { 'text-color': '#fff', 'text-halo-color': '#00d181', 'text-halo-width': 2 }
        })
      }
    } catch {}
  }

  useEffect(() => {
    if (!mapRef.current ||!followDriver ||!driverLocation) return
    mapRef.current.easeTo({
      center: driverLocation,
      bearing: isNavigating? bearing : 0,
      pitch: isNavigating? 45 : 0,
      zoom: isNavigating? 16.5 : 14,
      duration: 1000,
      // @ts-ignore
      padding: { bottom: isNavigating? 180 : 0 }
    })
  }, [driverLocation, followDriver, bearing, isNavigating])

  useEffect(() => {
    if (!mapRef.current ||!route) return
    routeCacheRef.current = route
    const doAdd = () => addRouteToMap(route)
    if (!mapRef.current.isStyleLoaded()) mapRef.current.once('load', doAdd)
    else doAdd()
  }, [route])

  useEffect(() => {
    if (!mapRef.current ||!driverLocation) return
    if (!driverMarkerRef.current) {
      const el = document.createElement('div')
      el.style.width = '40px'; el.style.height = '40px'; el.style.background = '#00d181'
      el.style.borderRadius = '20px'; el.style.border = '3px solid white'
      el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)'
      el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center'
      el.innerText = '🚗'
      driverMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(driverLocation).addTo(mapRef.current)
    } else driverMarkerRef.current.setLngLat(driverLocation)
  }, [driverLocation])

  if (!TOKEN) {
    return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: 'white' }}>Missing VITE_MAPBOX_TOKEN</div>
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '100vh', background: theme === 'light'? '#f5f5f7' : '#0e0e10' }} />
}