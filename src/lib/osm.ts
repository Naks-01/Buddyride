export async function getOSMRoute(from: [number, number], to: [number, number]) {
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
    // FIX: Match Mapbox shape - PassengerHome expects legs/steps, old file returned undefined -> crash
    legs: [],
    steps: [],
    route: r,
  }
}

export async function reverseOSM(c: [number, number]) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${c[1]}&lon=${c[0]}&zoom=16&addressdetails=1`)
    if (!res.ok) throw new Error('Reverse failed')
    const d = await res.json()
    // FIX: Old code returned 'Polokwane' on ANY failure - Tzaneen passenger showed as Polokwane. Now return coords, never wrong town.
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
    // FIX: Was no Limpopo bias / no bbox - searching "Mall" returned Mall in Johannesburg. Now biased to Limpopo bbox.
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