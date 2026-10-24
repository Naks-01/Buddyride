import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type OsmMapViewProps = {
  center: [number, number]
  route?: any
  driverLocation?: [number, number]
  availableCars?: any[]
  theme?: 'dark' | 'light'
  onMapMove?: (center: [number, number]) => void
}

export function OsmMapView({ center, route, driverLocation, availableCars, theme = 'light', onMapMove }: OsmMapViewProps) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  const driverMarkerRef = useRef<L.Marker | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const carsRef = useRef<Map<string, L.Marker>>(new Map())
  const onMapMoveRef = useRef(onMapMove)

  useEffect(() => {
    onMapMoveRef.current = onMapMove
  }, [onMapMove])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView([center[1], center[0]], 14)

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    map.on('dragend', () => {
      const mapCenter = map.getCenter()
      onMapMoveRef.current?.([mapCenter.lng, mapCenter.lat])
    })

    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 500)

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // FIXED - NO MORE API KEY REQUIRED - Normal OSM tiles
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    
    // Normal map - no API key needed, no green tint
    const url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    
    tileLayerRef.current = L.tileLayer(url, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)
  }, [theme])

  // center update
  useEffect(() => {
    if (mapRef.current && center) {
      const currentCenter = mapRef.current.getCenter()
      if (Math.abs(currentCenter.lat - center[1]) > 0.000001 || Math.abs(currentCenter.lng - center[0]) > 0.000001) {
        mapRef.current.setView([center[1], center[0]], mapRef.current.getZoom())
      }
    }
  }, [center])

  // Passenger route line
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!route) {
      if (routeLineRef.current) map.removeLayer(routeLineRef.current)
      routeLineRef.current = null
      return
    }

    const geometry = route.type === 'Feature' ? route.geometry : route
    const coordinates = geometry?.coordinates
    const latLngs = Array.isArray(coordinates)
      ? coordinates
          .filter((coordinate: unknown) =>
            Array.isArray(coordinate) &&
            coordinate.length >= 2 &&
            Number.isFinite(coordinate[0]) &&
            Number.isFinite(coordinate[1]),
          )
          .map((coordinate: [number, number]) => [coordinate[1], coordinate[0]] as [number, number])
      : []

    if (latLngs.length < 2) {
      if (routeLineRef.current) map.removeLayer(routeLineRef.current)
      routeLineRef.current = null
      return
    }

    if (!routeLineRef.current) {
      routeLineRef.current = L.polyline(latLngs, {
        color: '#2962FF', 
        weight: 7, 
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map)
    } else {
      routeLineRef.current.setLatLngs(latLngs)
    }

    routeLineRef.current.bringToFront()
    map.fitBounds(routeLineRef.current.getBounds(), { padding: [50, 50], maxZoom: 16 })
  }, [route])

  // driver marker - follows like Google Maps
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
        html: '<div style="background:#000;width:48px;height:48px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,0.3);font-size:24px">🚗</div>',
        className: '',
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      })
      driverMarkerRef.current = L.marker(latLng, { icon }).addTo(mapRef.current)
    } else {
      driverMarkerRef.current.setLatLng(latLng)
      // Follow driver like Google Maps
      mapRef.current.panTo(latLng)
    }
  }, [driverLocation])

  // Available cars
  useEffect(() => {
    if (!mapRef.current) return
    if (!availableCars) return

    const currentIds = new Set(availableCars.map((c:any)=> c.driver_id))

    carsRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        mapRef.current?.removeLayer(marker)
        carsRef.current.delete(id)
      }
    })

    availableCars.forEach((car:any) => {
      const latLng: any = [car.lat, car.lng]
      const existing = carsRef.current.get(car.driver_id)
      if (existing) {
        existing.setLatLng(latLng)
      } else {
        const icon = L.divIcon({
          html: '<div style="background:white;width:40px;height:40px;border-radius:50%;border:2px solid #2962FF;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.18);font-size:20px">🚗</div>',
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        })
        const m = L.marker(latLng, { icon }).addTo(mapRef.current!)
        carsRef.current.set(car.driver_id, m)
      }
    })
  }, [availableCars])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#f8f9fa', zIndex: 0 }} />
}