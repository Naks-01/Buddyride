// src/lib/tomtom.ts - PASSENGER - TomTom ONLY, no OSM
const KEY = import.meta.env.VITE_TOMTOM_API_KEY as string

function isKeyOk() {
  if (!KEY || KEY === 'undefined' || KEY === 'null' || KEY.length < 10) {
    console.error('[BuddyRide] VITE_TOMTOM_API_KEY missing - Add in Vercel + Redeploy')
    return false
  }
  return true
}

export async function reverseTomTom(coords: [number, number]): Promise<string> {
  const fallback = `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`
  if (!isKeyOk()) return fallback
  try {
    const res = await fetch(`https://api.tomtom.com/search/2/reverseGeocode/${coords[1]},${coords[0]}.json?key=${KEY}`)
    if (!res.ok) {
      console.error('[BuddyRide] reverseTomTom failed', res.status)
      return fallback
    }
    const data = await res.json()
    return data.addresses?.[0]?.address?.freeformAddress || fallback
  } catch (e) {
    console.error('[BuddyRide] reverseTomTom error', e)
    return fallback
  }
}

export async function geocodeTomTom(query: string) {
  if (!isKeyOk() || !query || query.trim().length < 2) return []
  try {
    const res = await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query.trim())}.json?key=${KEY}&countrySet=ZA&lat=-23.9045&lon=29.4589&radius=50000&limit=8&idxSet=POI,Addr`)
    if (!res.ok) {
      console.error('[BuddyRide] geocodeTomTom failed', res.status)
      return []
    }
    const data = await res.json()
    return (data.results || []).map((r: any) => ({
      id: `tomtom_${r.id}`,
      center: [r.position.lon, r.position.lat] as [number, number],
      text: r.poi?.name || r.address.freeformAddress.split(',')[0],
      place_name: r.poi?.name ? `${r.poi.name}, ${r.address.freeformAddress}` : r.address.freeformAddress,
      geometry: { coordinates: [r.position.lon, r.position.lat] },
    }))
  } catch (e) {
    console.error('[BuddyRide] geocodeTomTom error', e)
    return []
  }
}

export async function getTomTomRoute(from: [number, number], to: [number, number]) {
  if (!isKeyOk()) throw new Error('TomTom key missing - Add VITE_TOMTOM_API_KEY in Vercel and redeploy')
  try {
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${from[1]},${from[0]}:${to[1]},${to[0]}/json?key=${KEY}&routeType=fastest&traffic=true`
    const res = await fetch(url)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[BuddyRide] getTomTomRoute failed', res.status, text.slice(0, 200))
      if (res.status === 403) throw new Error('TomTom key invalid / quota finished - check TomTom dashboard')
      throw new Error('Could not calculate route - TomTom error ' + res.status)
    }
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route) throw new Error('No route found between these points')
    const pts = route.legs?.[0]?.points?.map((p: any) => [p.longitude, p.latitude]) || []
    if (pts.length < 2) throw new Error('No route found between these points')
    return {
      geometry: { type: 'LineString', coordinates: pts },
      distance: route.summary.lengthInMeters,
      distanceKm: route.summary.lengthInMeters / 1000,
      duration: route.summary.travelTimeInSeconds,
      durationMin: route.summary.travelTimeInSeconds / 60,
      legs: [], steps: [], route
    }
  } catch (e: any) {
    // Re-throw with clean message, don't hide it
    throw new Error(e?.message || 'Could not calculate route')
  }
}

// Aliases used in some files
export const reverseGeocode = reverseTomTom
export const searchTomTom = geocodeTomTom