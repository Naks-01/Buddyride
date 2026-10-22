import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

type Coordinates = [number, number]

type MapboxMapViewProps = {
  center?: Coordinates
  route?: any
  passengerLocation?: Coordinates
  driverLocation?: Coordinates
  theme: 'light' | 'dark'
  bearing?: number
  isNavigating?: boolean
  followDriver?: boolean
  speedKmh?: number
}

const DEFAULT_CENTER: Coordinates = [29.4589, -23.9045]

export function MapboxMapView({
  center,
  route,
  passengerLocation,
  driverLocation,
  theme,
  bearing = 0,
  isNavigating = false,
  followDriver = true,
  speedKmh = 0,
}: MapboxMapViewProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const driverArrowRef = useRef<SVGSVGElement | null>(null)
  const passengerMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const routeRef = useRef(route)
  const smoothBearingRef = useRef(bearing)

  routeRef.current = route

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/navigation-day-v1',
      center: center || driverLocation || DEFAULT_CENTER,
      zoom: 15.5,
      pitch: 0,
      bearing: 0,
      antialias: true,
    })
    mapRef.current = map

    const routeFeature = () => {
      const currentRoute = routeRef.current
      if (!currentRoute) {
        return {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: [] },
          properties: {},
        }
      }
      const coordinates = currentRoute.type === 'Feature'
        ? currentRoute.geometry.coordinates
        : currentRoute.coordinates || currentRoute.geometry?.coordinates || currentRoute
      return {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates },
        properties: {},
      }
    }

    const addRoute = () => {
      if (!map.isStyleLoaded()) return
      if (!map.getSource('route')) {
        map.addSource('route', {
          type: 'geojson',
          data: routeFeature(),
        })
      } else {
        (map.getSource('route') as mapboxgl.GeoJSONSource).setData(routeFeature())
      }
      if (!map.getLayer('route-outline')) {
        map.addLayer({
          id: 'route-outline',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.6 },
        })
      }
      if (!map.getLayer('route-line')) {
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#2962FF', 'line-width': 5.5, 'line-opacity': 0.95 },
        })
      }
    }

    const simplifyNavigationStyle = () => {
      for (const layerId of ['building', 'poi-label']) {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none')
      }
    }
    const onLoad = () => {
      map.resize()
      simplifyNavigationStyle()
      addRoute()
    }
    const onStyleData = () => addRoute()

    map.on('load', onLoad)
    map.on('styledata', onStyleData)

    const driverEl = document.createElement('div')
    driverEl.style.width = '48px'
    driverEl.style.height = '48px'
    driverEl.innerHTML = `
      <div style="width:48px;height:48px;background:#000;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,0.18);">
        <svg id="car-rotate" viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" style="fill:#fff;transform:rotate(${bearing}deg);transform-origin:center;">
          <path d="M12 2 4.5 20.5l7.5-4 7.5 4L12 2z" />
        </svg>
      </div>
    `
    driverArrowRef.current = driverEl.querySelector<SVGSVGElement>('#car-rotate')
    driverMarkerRef.current = new mapboxgl.Marker({
      element: driverEl,
      rotationAlignment: 'viewport',
      anchor: 'center',
    })
      .setLngLat(driverLocation || center || DEFAULT_CENTER)
      .addTo(map)

    const passengerEl = document.createElement('div')
    passengerEl.innerHTML = `
      <div style="width:40px;height:40px;background:#111;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.25);">📍</div>
    `
    passengerMarkerRef.current = new mapboxgl.Marker({ element: passengerEl, anchor: 'bottom' })

    return () => {
      map.off('load', onLoad)
      map.off('styledata', onStyleData)
      map.remove()
      mapRef.current = null
      driverMarkerRef.current = null
      driverArrowRef.current = null
      passengerMarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    routeRef.current = route
    const source = mapRef.current?.getSource('route') as mapboxgl.GeoJSONSource | undefined
    if (!source) return
    const coordinates = route
      ? route.type === 'Feature'
        ? route.geometry.coordinates
        : route.coordinates || route.geometry?.coordinates || route
      : []
    source.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {},
    })
  }, [route])

  useEffect(() => {
    if (!passengerMarkerRef.current || !mapRef.current) return
    if (passengerLocation) passengerMarkerRef.current.setLngLat(passengerLocation).addTo(mapRef.current)
    else passengerMarkerRef.current.remove()
  }, [passengerLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !driverMarkerRef.current) return
    if (driverLocation) driverMarkerRef.current.setLngLat(driverLocation)
    if (speedKmh > 5) {
      smoothBearingRef.current = smoothBearingRef.current * 0.7 + bearing * 0.3
    }
    if (driverArrowRef.current) {
      driverArrowRef.current.style.transform = `rotate(${smoothBearingRef.current}deg)`
    }
    if (driverLocation && followDriver) {
      map.easeTo({
        center: driverLocation,
        zoom: isNavigating ? 17 : 15.5,
        pitch: isNavigating ? 30 : 0,
        bearing: isNavigating ? smoothBearingRef.current : 0,
        padding: isNavigating
          ? { top: window.innerHeight * 0.4, right: 0, bottom: 0, left: 0 }
          : undefined,
        duration: 1000,
      })
    }
  }, [driverLocation, bearing, speedKmh, isNavigating, followDriver])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        width: '100%',
        height: '100%',
        background: theme === 'dark' ? '#0a0a0a' : '#f8f9fa',
      }}
    />
  )
}
