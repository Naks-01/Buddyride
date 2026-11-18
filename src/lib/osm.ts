// BuddyRide - Passenger now uses TomTom like Driver - 1 key, FREE 2500/day
const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY as string

export async function getOSMRoute(from: [number, number], to: [number, number]) {
  // 1. Try TomTom first (same as Driver)
  if (TOMTOM_KEY) {
    try {
      const url = `https://api.tomtom.com/routing/1/calculateRoute/${from[1]},${from[0]}:${to[1]},${to[0]}/json?key=${TOMTOM_KEY}&routeType=fastest&traffic=true`
      const res = await fetch(url)
      const data = await res.json()
      const r = data.routes?.[0]
      if (r) {
        const points = r.legs[0].points.map((p: any) => [p.longitude, p.latitude])
        return {
          geometry: { type: 'LineString', coordinates: points },
          distance: r.summary.lengthInMeters,
          distanceKm: r.summary.lengthInMeters / 1000,
          duration: r.summary.travelTimeInSeconds,
          durationMin: r.summary.travelTimeInSeconds / 60,
          legs: [],
          steps: [],
          route: r,
        }
      }
    } catch {}
  }
  // 2. Fallback to OSRM if TomTom fails
  const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error('OSRM route failed: ' + res.status)
  const data = await res.json()
  if (!data.routes?.[0]) throw new Error('No route')
  const r = data.routes[0]
  return {
    geometry: r.geometry,
    distance: r.distance,
    distanceKm: r.distance / 1000,
    duration: r.duration,
    durationMin: r.duration / 60,
    legs: [],
    steps: [],
    route: r,
  }
}

export async function reverseOSM(c: [number, number]) {
  // TomTom Reverse - accurate for Polokwane townships, not "Polokwane" for everything
  if (TOMTOM_KEY) {
    try {
      const res = await fetch(`https://api.tomtom.com/search/2/reverseGeocode/${c[1]},${c[0]}.json?key=${TOMTOM_KEY}`)
      const d = await res.json()
      const addr = d.addresses?.[0]?.address
      if (addr?.freeformAddress) return addr.freeformAddress
    } catch {}
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${c[1]}&lon=${c[0]}&zoom=16&addressdetails=1`)
    if (!res.ok) throw new Error('Reverse failed')
    const d = await res.json()
    if (d.display_name) return d.display_name?.split(',').slice(0, 3).join(',')
    return `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`
  } catch {
    return `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`
  }
}

export async function geocodeOSM(q: string) {
  try {
    const clean = q.replace(/, Limpopo.*/i, '').replace(/, South Africa/i, '').trim()
    if (clean.length < 2) return []
    // TomTom Search - biased to Limpopo, finds Seshego, Mankweng, etc.
    if (TOMTOM_KEY) {
      const res = await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(clean)}.json?key=${TOMTOM_KEY}&countrySet=ZA&lat=-23.9045&lon=29.4589&radius=50000&limit=5`)
      const data = await res.json()
      if (data.results?.length) {
        return data.results.map((d: any) => ({
          id: `tomtom_${d.id}`,
          center: [d.position.lon, d.position.lat],
          text: d.poi?.name || d.address.freeformAddress.split(',')[0],
          place_name: d.poi?.name ? `${d.poi.name}, ${d.address.freeformAddress}` : d.address.freeformAddress,
          geometry: { coordinates: [d.position.lon, d.position.lat] },
        }))
      }
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(clean + ' Limpopo')}&limit=5&countrycodes=za&viewbox=28.8,-24.6,30.2,-22.9&bounded=1`)
    if (!res.ok) return []
    const data = await res.json()
    return data.map((d: any) => ({
      id: `osm_${d.place_id}`,
      center: [parseFloat(d.lon), parseFloat(d.lat)],
      text: d.display_name.split(',')[0],
      place_name: d.display_name,
      geometry: { coordinates: [parseFloat(d.lon), parseFloat(d.lat)] },
    }))
  } catch {
    return []
  }
}