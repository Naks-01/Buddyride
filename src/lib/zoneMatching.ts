import { supabase } from './supabase'

// FIXED: No overlaps. Each keyword belongs to ONE zone only.
export const LIMPOPO_ZONE_KEYWORDS: Record<string, string[]> = {
  'Polokwane CBD': ['polokwane', 'ladanna', 'flora park', 'fauna park', 'ivory park', 'sterpark'],
  'Seshego': ['seshego'],
  'Mankweng': ['mankweng', 'turfloop', 'university of limpopo'],
  'Lebowakgomo': ['lebowakgomo'],
  'Tzaneen': ['tzaneen', 'letsitele', 'nkowankowa', 'lenyenye'],
  'Giyani': ['giyani', 'dzumeri', 'malamulele', 'giyani town'],
  'Thohoyandou': ['thohoyandou', 'sibasa', 'venda'], // REMOVED 'makhado'
  'Musina': ['musina', 'beitbridge', 'beit bridge'],
  'Makhado': ['makhado', 'louis trichardt'], // OWN zone now
  'Bela-Bela': ['bela-bela', 'warmbaths'], // FIXED: was 'bela' - too short
  'Mokopane': ['mokopane', 'potgietersrus', 'mahwelereng'],
  'Burgersfort': ['burgersfort', 'steelpoort', 'tubase'],
  'Phalaborwa': ['phalaborwa', 'namakgale', 'loloka'],
  'Lephalale': ['lephalale', 'ellisras', 'marapong'],
}

export async function findZoneForPickup(pickupText: string) {
  const lower = pickupText.toLowerCase().trim()
  const { data: zones, error } = await supabase.from('service_zones').select('id,name').eq('is_active', true)
  if (error || !zones || zones.length === 0) return null

  // 1. Exact zone name match - longest match wins (e.g. Bela-Bela beats Bela)
  const sorted = [...zones].sort((a,b) => b.name.length - a.name.length)
  const exact = sorted.find(z => lower.includes(z.name.toLowerCase()))
  if (exact) return exact

  // 2. Keyword match - longest keyword wins
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
  if (best) return best

  // 3. Fallback: Polokwane CBD
  return zones.find(z => z.name === 'Polokwane CBD') || zones[0]
}

export async function getDriversInZone(zoneId: string) {
  // Try ID match first (DriverOnboarding saves IDs)
  let { data: vehicles, error } = await supabase
    .from('driver_vehicles')
    .select('driver_id, service_zones, ride_type, make_model, colour, registration')
    .contains('service_zones', [zoneId])

  if (error) { console.error(error); return [] }

  // Fallback: if zones stored as NAMES not IDs (old data), try name match
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
  const driverIds = vehicles.map(v => v.driver_id)

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, verification_status')
    .in('id', driverIds)
    .eq('verification_status', 'approved')

  if (!profiles?.length) return []

  // FIXED: Only online drivers. If driver_status table empty, assume all approved are online for now,
  // but if table HAS rows and none online in zone, return []
  const { data: online } = await supabase
    .from('driver_status')
    .select('driver_id, is_online')
    .in('driver_id', driverIds)
    .eq('is_online', true)

  // If driver_status table exists and has ANY online drivers globally, we must filter by online
  // If table is empty (you haven't implemented online yet), don't block
  const { count: totalOnline } = await supabase.from('driver_status').select('*', { count: 'exact', head: true }).eq('is_online', true)
  const shouldFilterOnline = (totalOnline || 0) > 0

  const onlineIds = new Set(online?.map(o => o.driver_id) || [])

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
  const zone = await findZoneForPickup(params.pickupText)
  if (!zone) throw new Error('No service zone found for pickup. Admin must create service_zones.')

  const drivers = await getDriversInZone(zone.id)
  if (drivers.length === 0) {
    throw new Error(`No drivers online in ${zone.name} right now. Try Polokwane CBD.`)
  }

  const { data: ride, error } = await supabase.from('rides').insert({
    rider_id: params.riderId,
    pickup_address: params.pickupText,
    dropoff_address: params.dropoffText,
    pickup_zone_id: zone.id,
    pickup_zone_name: zone.name,
    ride_type: params.rideType,
    fare: params.fare,
    status: 'requesting',
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