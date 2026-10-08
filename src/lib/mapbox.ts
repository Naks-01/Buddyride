import mapboxgl from 'mapbox-gl'

const token = import.meta.env.VITE_MAPBOX_TOKEN
mapboxgl.accessToken = token || ''

export function assertMapboxConfigured() {
  if (!token) throw new Error('Mapbox token is missing. Add VITE_MAPBOX_TOKEN to .env.local.')
}

export async function geocode(query: string): Promise<[number, number] | null> {
  assertMapboxConfigured()
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&limit=1&access_token=${mapboxgl.accessToken}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Mapbox geocoding failed.')
  const data = await response.json()
  const coords = data.features?.[0]?.geometry?.coordinates
  return coords ? [coords[0], coords[1]] : null
}

export async function reverseGeocode(lng: number, lat: number): Promise<string> {
  assertMapboxConfigured()
  const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&limit=1&access_token=${mapboxgl.accessToken}`
  const response = await fetch(url)
  if (!response.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  const data = await response.json()
  return data.features?.[0]?.properties?.full_address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export async function getRoute(from: [number, number], to: [number, number]) {
  assertMapboxConfigured()
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Mapbox routing failed.')
  const data = await response.json()
  const route = data.routes?.[0]
  if (!route) throw new Error('No route found.')
  return {
    geometry: route.geometry,
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
  }
}