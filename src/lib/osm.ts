export async function getOSMRoute(from: [number, number], to: [number, number]) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.routes?.[0]) throw new Error('No route')
  const r = data.routes[0]
  return { geometry: r.geometry, distance: r.distance, distanceKm: r.distance/1000, durationMin: r.duration/60 }
}
export async function reverseOSM(c: [number, number]) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${c[1]}&lon=${c[0]}`)
    const d = await res.json()
    return d.display_name?.split(',').slice(0,3).join(',') || 'Polokwane'
  } catch { return 'Polokwane' }
}
export async function geocodeOSM(q: string) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=za`)
  const data = await res.json()
  return data.map((d:any)=>({ center: [parseFloat(d.lon), parseFloat(d.lat)], text: d.display_name.split(',')[0], place_name: d.display_name }))
}