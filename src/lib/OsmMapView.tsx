import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export function OsmMapView({ center, route, driverLocation, availableCars }: any) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)
  // ADDED FOR CARS
  const carsRef = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView([center[1], center[0]], 14)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 500)

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // center update
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.setView([center[1], center[0]], mapRef.current.getZoom())
    }
  }, [center])

  // route - BLUE + clears when undefined
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
      routeLineRef.current = L.polyline(latLngs, { color: '#1E90FF', weight: 6, opacity: 0.95 }).addTo(mapRef.current)
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
        html: '<div style="background:#1E90FF;width:36px;height:36px;border-radius:18px;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5)">🚗</div>',
        className: '',
        iconSize: [36, 36],
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
          html: '<div style="background:white;width:36px;height:36px;border-radius:18px;border:2px solid #ff7a00;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4);font-size:20px">🚗</div>',
          className: '',
          iconSize: [36, 36],
        })
        const m = L.marker(latLng, { icon }).addTo(mapRef.current!)
        carsRef.current.set(car.driver_id, m)
      }
    })
  }, [availableCars])

  return <div ref={containerRef} style={{ width: '100%', height: '100vh', background: '#e5e7eb', zIndex: 0 }} />
}