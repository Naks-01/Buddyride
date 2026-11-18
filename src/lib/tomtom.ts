// src/lib/tomtom.ts - PASSENGER - 1 free TomTom key for driver + passenger
const KEY = import.meta.env.VITE_TOMTOM_API_KEY as string

export async function reverseTomTom(coords: [number, number]) {
  try {
    const res = await fetch(`https://api.tomtom.com/search/2/reverseGeocode/${coords[1]},${coords[0]}.json?key=${KEY}`)
    const data = await res.json()
    return data.addresses?.[0]?.address?.freeformAddress || `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`
  } catch {
    return `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`
  }
}

export async function geocodeTomTom(query: string) {
  if (!KEY || query.length < 2) return []
  try {
    const res = await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${KEY}&countrySet=ZA&lat=-23.9045&lon=29.4589&radius=50000&limit=5`)
    const data = await res.json()
    return (data.results || []).map((r: any) => ({
      id: `tomtom_${r.id}`,
      center: [r.position.lon, r.position.lat],
      text: r.poi?.name || r.address.freeformAddress.split(',')[0],
      place_name: r.poi?.name ? `${r.poi.name}, ${r.address.freeformAddress}` : r.address.freeformAddress,
      geometry: { coordinates: [r.position.lon, r.position.lat] },
    }))
  } catch { return [] }
}

export async function getTomTomRoute(from: [number, number], to: [number, number]) {
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from[1]},${from[0]}:${to[1]},${to[0]}/json?key=${KEY}&routeType=fastest&traffic=true`
  const res = await fetch(url)
  const data = await res.json()
  const route = data.routes?.[0]
  if (!route) throw new Error('No route')
  const pts = route.legs[0].points.map((p: any) => [p.longitude, p.latitude])
  return {
    geometry: { type: 'LineString', coordinates: pts },
    distance: route.summary.lengthInMeters,
    distanceKm: route.summary.lengthInMeters / 1000,
    duration: route.summary.travelTimeInSeconds,
    durationMin: route.summary.travelTimeInSeconds / 60,
    legs: [], steps: [], route
  }
}