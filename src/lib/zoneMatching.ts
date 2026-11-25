import { supabase } from './supabase'

export const LIMPOPO_ZONE_KEYWORDS: Record<string, string[]> = {
  'Polokwane CBD': ['polokwane', 'ladanna', 'flora park', 'fauna park', 'ivory park', 'sterpark'],
  'Seshego': ['seshego'],
  'Mankweng': ['mankweng', 'turfloop', 'university of limpopo'],
  'Lebowakgomo': ['lebowakgomo'],
  'Tzaneen': ['tzaneen', 'letsitele', 'nkowankowa', 'lenyenye'],
  'Giyani': ['giyani', 'dzumeri', 'malamulele', 'giyani town'],
  'Thohoyandou': ['thohoyandou', 'sibasa', 'venda'],
  'Musina': ['musina', 'beitbridge', 'beit bridge'],
  'Makhado': ['makhado', 'louis trichardt'],
  'Bela-Bela': ['bela-bela', 'warmbaths'],
  'Mokopane': ['mokopane', 'potgietersrus', 'mahwelereng'],
  'Burgersfort': ['burgersfort', 'steelpoort', 'tubase'],
  'Phalaborwa': ['phalaborwa', 'namakgale', 'loloka'],
  'Lephalale': ['lephalale', 'ellisras', 'marapong'],
}

export async function findZoneForPickup(pickupText: string) {
  if (!pickupText?.trim()) return null
  const lower = pickupText.toLowerCase().trim()
  const { data: zones, error } = await supabase.from('service_zones').select('id,name').eq('is_active', true)
  if (error || !zones || zones.length === 0) return null

  const sorted = [...zones].sort((a,b) => b.name.length - a.name.length)
  const exact = sorted.find(z => lower.includes(z.name.toLowerCase()))
  if (exact) return exact

  let best: typeof zones[0] | null = null
  let bestLen = 0
  for (const z of zones) {
    const keywords = LIMPOPO_ZONE_KEYWORDS[z.name] || []
    for (const kw of keywords) {
      if (lower.includes(kw) && kw.length > bestLen) {
        best = z
        bestLen = kw.length
      }
    }
  }
  // FIX: No silent Polokwane fallback - was sending Seshego riders to Polokwane drivers, 40km away
  return best
}

export async function getDriversInZone(zoneId: string) {
  if (!zoneId) return []
  let { data: vehicles, error } = await supabase
    .from('driver_vehicles')
    .select('driver_id, service_zones, ride_type, make_model, colour, registration')
    .contains('service_zones', [zoneId])

  if (error) { console.error(error); return [] }

  if (!vehicles?.length) {
    const { data: zoneRow } = await supabase.from('service_zones').select('name').eq('id', zoneId).single()
    if (zoneRow) {
      const retry = await supabase.from('driver_vehicles')
        .select('driver_id, service_zones, ride_type, make_model, colour, registration')
        .contains('service_zones', [zoneRow.name])
      vehicles = retry.data || []
    }
  }

  if (!vehicles?.length) return []
  const driverIds = [...new Set(vehicles.map(v => v.driver_id))]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, verification_status')
    .in('id', driverIds)
    .eq('verification_status', 'approved')

  if (!profiles?.length) return []

  // FIX: Single query for online - was 2 queries (online + count), wasted + race
  const { data: online } = await supabase
    .from('driver_locations')
    .select('driver_id')
    .in('driver_id', driverIds)
    .eq('is_online', true)

  const onlineIds = new Set(online?.map(o => o.driver_id) || [])
  // FIX: If driver_locations empty (no one ever published), don't block all drivers - fall back to approved list
  const shouldFilterOnline = (online?.length || 0) > 0 || (await supabase.from('driver_locations').select('driver_id', { count: 'exact', head: true })).count! > 0

  return vehicles
    .filter(v => !shouldFilterOnline || onlineIds.has(v.driver_id))
    .map(v => ({
      ...v,
      profile: profiles?.find(p => p.id === v.driver_id),
    }))
    .filter(v => v.profile)
}

export async function requestRideInZone(params: {
  riderId: string
  pickupText: string
  dropoffText: string
  rideType: string
  fare: number
}) {
  if (!params.riderId) throw new Error('You must be logged in to request a ride.')
  if (!params.pickupText?.trim() || !params.dropoffText?.trim()) throw new Error('Please enter pickup and dropoff.')
  if (!Number.isFinite(params.fare) || params.fare <= 0) throw new Error('Invalid fare.')

  const zone = await findZoneForPickup(params.pickupText)
  if (!zone) throw new Error('We do not serve this pickup area yet. Try Polokwane CBD.')

  const drivers = await getDriversInZone(zone.id)
  if (drivers.length === 0) {
    throw new Error(`No drivers online in ${zone.name} right now. Try again in a few minutes.`)
  }

  const { data: ride, error } = await supabase.from('rides').insert({
    rider_id: params.riderId,
    pickup_address: params.pickupText,
    dropoff_address: params.dropoffText,
    pickup_zone_id: zone.id,
    pickup_zone_name: zone.name,
    ride_type: params.rideType,
    fare: params.fare,
    // FIX: 'requesting' -> 'requested' - your realtime + updateRide only listen for 'requested', 'requesting' rides were invisible
    status: 'requested',
  }).select().single()

  if (error) throw error

  const requests = drivers.map(d => ({
    ride_id: ride.id,
    driver_id: d.driver_id,
    status: 'pending',
  }))
  const { error: reqError } = await supabase.from('ride_requests').insert(requests)
  if (reqError) console.error('ride_requests insert failed', reqError)

  return { ride, zone, driversCount: drivers.length, drivers }
}