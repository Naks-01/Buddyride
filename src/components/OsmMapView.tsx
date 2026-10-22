import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export function OsmMapView({ center, route, driverLocation, availableCars, theme = 'light' }: any) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  // ADDED FOR CARS
  const carsRef = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView([center[1], center[0]], 14)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 500)

    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    const url = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    tileLayerRef.current = L.tileLayer(url, {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '&copy; CARTO',
    }).addTo(map)
  }, [theme])

  // center update
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.setView([center[1], center[0]], mapRef.current.getZoom())
    }
  }, [center])

  // Route clears from the map when no ride is active.
  useEffect(() => {
    if (!mapRef.current) return

    if (!route) {
      if (routeLineRef.current) {
        mapRef.current.removeLayer(routeLineRef.current)
        routeLineRef.current = null
      }
      return
    }

    const coords = route.type === 'Feature'? route.geometry.coordinates : route.coordinates
    // GeoJSON is [lng, lat] -> Leaflet needs [lat, lng]
    const latLngs = coords.map((c: any) => [c[1], c[0]])

    if (routeLineRef.current) {
      routeLineRef.current.setLatLngs(latLngs)
    } else {
      routeLineRef.current = L.polyline(latLngs, { color: '#2962FF', weight: 5, opacity: 0.95 }).addTo(mapRef.current)
      mapRef.current.fitBounds(routeLineRef.current.getBounds(), { padding: [50, 50] })
    }
  }, [route])

  // driver marker
  useEffect(() => {
    if (!mapRef.current) return

    if (!driverLocation) {
      if (driverMarkerRef.current) {
        mapRef.current.removeLayer(driverMarkerRef.current)
        driverMarkerRef.current = null
      }
      return
    }

    const latLng: any = [driverLocation[1], driverLocation[0]]
    if (!driverMarkerRef.current) {
      const icon = L.divIcon({
        html: '<div style="background:#fff;width:48px;height:48px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,0.18);font-size:24px">🚗</div>',
        className: '',
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      })
      driverMarkerRef.current = L.marker(latLng, { icon }).addTo(mapRef.current)
    } else {
      driverMarkerRef.current.setLatLng(latLng)
    }
  }, [driverLocation])

  // ADDED FOR CARS - shows available cars BEFORE ride starts
  useEffect(() => {
    if (!mapRef.current) return
    if (!availableCars) return

    const currentIds = new Set(availableCars.map((c:any)=> c.driver_id))

    // Remove offline cars
    carsRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        mapRef.current?.removeLayer(marker)
        carsRef.current.delete(id)
      }
    })

    // Add / update online cars
    availableCars.forEach((car:any) => {
      const latLng: any = [car.lat, car.lng]
      const existing = carsRef.current.get(car.driver_id)
      if (existing) {
        existing.setLatLng(latLng)
      } else {
        const icon = L.divIcon({
          html: '<div style="background:white;width:40px;height:40px;border-radius:50%;border:2px solid #FF6B00;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.18);font-size:20px">🚗</div>',
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        })
        const m = L.marker(latLng, { icon }).addTo(mapRef.current!)
        carsRef.current.set(car.driver_id, m)
      }
    })
  }, [availableCars])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', background: theme === 'dark' ? '#0a0a0a' : '#f8f9fa', zIndex: 0 }} />
}