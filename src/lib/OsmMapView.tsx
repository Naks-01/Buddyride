import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export function OsmMapView({ center, route, driverLocation }: any) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)

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

  // route - FIXED: now clears when route is undefined
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
      routeLineRef.current = L.polyline(latLngs, { color: '#00d181', weight: 6, opacity: 0.9 }).addTo(mapRef.current)
      mapRef.current.fitBounds(routeLineRef.current.getBounds(), { padding: [50, 50] })
    }
  }, [route])

  // driver marker - also clear when no driver
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
        html: '<div style="background:#00d181;width:36px;height:36px;border-radius:18px;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5)">🚗</div>',
        className: '',
        iconSize: [36, 36],
      })
      driverMarkerRef.current = L.marker(latLng, { icon }).addTo(mapRef.current)
    } else {
      driverMarkerRef.current.setLatLng(latLng)
    }
  }, [driverLocation])

  return <div ref={containerRef} style={{ width: '100%', height: '100vh', background: '#e5e7eb', zIndex: 0 }} />
}