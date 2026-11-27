// src/lib/tomtom.ts - PASSENGER - TomTom ONLY + Photon fallback + Plus Code for RDP
import { OpenLocationCode } from 'open-location-code'

const KEY = import.meta.env.VITE_TOMTOM_API_KEY as string
const olc = new OpenLocationCode()

export function getPlusCodeFromCoords(lat: number, lng: number) {
  return olc.encode(lat, lng, 10)
}

export function decodePlusCode(code: string) {
  try {
    const clean = code.trim().toUpperCase().replace(/\s/g, '')
    const match = clean.match(/([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/)
    if (!match) return null
    const decoded = olc.decode(match[1])
    return { lat: decoded.latitudeCenter, lng: decoded.longitudeCenter, code: match[1] }
  } catch { return null }
}

function isKeyOk() {
  if (!KEY || KEY === 'undefined' || KEY === 'null' || KEY.length < 10) {
    console.error('[BuddyRide] VITE_TOMTOM_API_KEY missing')
    return false
  }
  return true
}

const reverseCache = new Map<string, string>()
const searchCache = new Map<string, any[]>()

async function reversePhoton(coords: [number, number]): Promise<string | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lon=${coords[0]}&lat=${coords[1]}&lang=en`)
    if (!res.ok) return null
    const data = await res.json()
    const p = data.features?.[0]?.properties
    if (!p) return null
    const street = p.street || p.name || ''
    const district = p.district || ''
    const city = p.city || p.county || 'Polokwane'
    if (!street && !district) return null
    const parts = [street, district, city].filter(Boolean)
    const out = parts.join(', ')
    // Don't accept if it's just city
    if (out === city || out === 'Polokwane') return null
    return out
  } catch { return null }
}

export async function reverseTomTom(coords: [number, number]): Promise<string> {
  const plusCode = getPlusCodeFromCoords(coords[1], coords[0])
  const fallback = `Dropped Pin - ${plusCode}`
  const cacheKey = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`
  if (reverseCache.has(cacheKey)) return reverseCache.get(cacheKey)!
  
  if (isKeyOk()) {
    try {
      const res = await fetch(`https://api.tomtom.com/search/2/reverseGeocode/${coords[1]},${coords[0]}.json?key=${KEY}&returnSpeedLimit=false&entityType=Address`)
      if (res.ok) {
        const data = await res.json()
        const a = data.addresses?.[0]?.address
        if (a) {
          const street = a.streetName || a.street || ''
          const number = a.streetNumber || ''
          const suburb = a.municipalitySubdivision || a.suburb || a.district || ''
          const city = a.municipality || 'Polokwane'
          const free = a.freeformAddress || ''
          let out = ''
          if (street && !street.includes('Local Municipality')) {
            out = number ? `${number} ${street}` : street
            if (suburb && suburb !== city && !suburb.includes('Local Municipality')) out += `, ${suburb}`
            else out += `, ${city}`
          } else if (suburb && !suburb.includes('Local Municipality')) {
            out = `${suburb}, ${city}`
          } else if (free && !free.includes('Local Municipality') && free !== city) {
            out = free
          }
          if (out && out !== city && out !== 'Polokwane' && !out.includes('Local Municipality')) {
            reverseCache.set(cacheKey, out)
            return out
          }
        }
      }
    } catch {}
  }
  
  const photonAddr = await reversePhoton(coords)
  if (photonAddr) {
    reverseCache.set(cacheKey, photonAddr)
    return photonAddr
  }
  
  reverseCache.set(cacheKey, fallback)
  return fallback
}

async function searchPhoton(query: string) {
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=-23.9045&lon=29.4589&limit=8&lang=en`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.features || []).map((f: any) => {
      const [lon, lat] = f.geometry.coordinates
      const p = f.properties || {}
      const name = p.name || p.street || query
      const place = [p.name, p.street, p.district, p.city, p.state].filter(Boolean).join(', ')
      return { id: `photon_${lon}_${lat}`, center: [lon, lat] as [number, number], text: name, place_name: place || name, geometry: { coordinates: [lon, lat] } }
    })
  } catch { return [] }
}

export async function geocodeTomTom(query: string) {
  if (!query || query.trim().length < 2) return []
  const q = query.trim()
  const cacheKey = q.toLowerCase()
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!
  const plus = decodePlusCode(q)
  if (plus) {
    const out = [{ id: `plus_${plus.code}`, center: [plus.lng, plus.lat] as [number, number], text: `📍 Exact Pin - ${plus.code}`, place_name: `Exact Location ${plus.code}, Limpopo`, geometry: { coordinates: [plus.lng, plus.lat] } }]
    searchCache.set(cacheKey, out)
    return out
  }
  let tomtomResults: any[] = []
  if (isKeyOk()) {
    try {
      const queries = [q]
      if (!q.toLowerCase().includes('polokwane') && !q.toLowerCase().includes('seshego') && !q.toLowerCase().includes('mankweng')) queries.push(`${q}, Polokwane, Limpopo`)
      for (const queryToTry of queries) {
        const res = await fetch(`https://api.tomtom.com/search/2/fuzzySearch/${encodeURIComponent(queryToTry)}.json?key=${KEY}&countrySet=ZA&lat=-23.9045&lon=29.4589&radius=200000&limit=10&idxSet=POI,Addr,Geo`)
        if (!res.ok) continue
        const data = await res.json()
        const mapped = (data.results || []).map((r: any) => ({ id: `tomtom_${r.id}`, center: [r.position.lon, r.position.lat] as [number, number], text: r.poi?.name || r.address.freeformAddress.split(',')[0], place_name: r.poi?.name ? `${r.poi.name}, ${r.address.freeformAddress}` : r.address.freeformAddress, geometry: { coordinates: [r.position.lon, r.position.lat] } }))
        if (mapped.length > 0) { tomtomResults = mapped; break }
      }
    } catch (e) { console.error('[BuddyRide] geocodeTomTom error', e) }
  }
  if (tomtomResults.length === 0) {
    const photon = await searchPhoton(q)
    if (photon.length > 0) { searchCache.set(cacheKey, photon); return photon }
    const photon2 = await searchPhoton(`${q}, Polokwane`)
    searchCache.set(cacheKey, photon2)
    return photon2
  }
  const out = tomtomResults.slice(0, 10)
  searchCache.set(cacheKey, out)
  return out
}

export async function getTomTomRoute(from: [number, number], to: [number, number]) {
  if (!isKeyOk()) throw new Error('TomTom key missing')
  try {
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${from[1]},${from[0]}:${to[1]},${to[0]}/json?key=${KEY}&routeType=fastest&traffic=true`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Could not calculate route')
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route) throw new Error('No route found')
    const pts = route.legs?.[0]?.points?.map((p: any) => [p.longitude, p.latitude]) || []
    return { geometry: { type: 'LineString', coordinates: pts }, distance: route.summary.lengthInMeters, distanceKm: route.summary.lengthInMeters / 1000, duration: route.summary.travelTimeInSeconds, durationMin: route.summary.travelTimeInSeconds / 60, legs: [], steps: [], route }
  } catch (e: any) { throw new Error(e?.message || 'Could not calculate route') }
}

export const reverseGeocode = reverseTomTom
export const searchTomTom = geocodeTomTom