import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const mapboxToken = Deno.env.get('MAPBOX_ACCESS_TOKEN')
const appBaseUrl = Deno.env.get('APP_BASE_URL')

function respond(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  })
}

Deno.serve(async request => {
  const requestOrigin = request.headers.get('origin')
  let allowedOrigin = ''
  try {
    if (appBaseUrl && requestOrigin && new URL(appBaseUrl).origin === new URL(requestOrigin).origin) {
      allowedOrigin = new URL(appBaseUrl).origin
    }
  } catch {
    allowedOrigin = ''
  }
  if (request.method === 'OPTIONS') return respond({}, 200, allowedOrigin || 'null')
  if (!allowedOrigin) return respond({ error: 'Origin not allowed' }, 403, 'null')
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405, allowedOrigin)
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !mapboxToken) {
    console.error('calculate-fare requires Supabase and MAPBOX_ACCESS_TOKEN secrets')
    return respond({ error: 'Fare service is not configured' }, 503, allowedOrigin)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization) return respond({ error: 'Authentication required' }, 401, allowedOrigin)

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return respond({ error: 'Authentication required' }, 401, allowedOrigin)

  let input: {
    pickup?: { lng?: number; lat?: number }
    dropoff?: { lng?: number; lat?: number }
    category?: string
  }
  try {
    input = await request.json()
  } catch {
    return respond({ error: 'Invalid JSON body' }, 400, allowedOrigin)
  }

  const validPoint = (point: typeof input.pickup) =>
    point
    && typeof point.lng === 'number' && Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180
    && typeof point.lat === 'number' && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
  if (!validPoint(input.pickup) || !validPoint(input.dropoff) || typeof input.category !== 'string') {
    return respond({ error: 'Valid pickup, dropoff, and ride category are required' }, 400, allowedOrigin)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: cleanupError } = await adminClient.from('fare_quotes')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .is('used_at', null)
  if (cleanupError) {
    console.error('Could not remove expired fare quotes', cleanupError)
    return respond({ error: 'Fare service could not prepare a quote. Please try again.' }, 500, allowedOrigin)
  }
  const [{ data: category, error: categoryError }, { data: settings, error: settingsError }] = await Promise.all([
    adminClient.from('fare_categories')
      .select('id,base_fare,per_km,per_min,min_fare,max_fare')
      .eq('id', input.category)
      .eq('active', true)
      .single(),
    adminClient.from('app_settings').select('commission').eq('id', 1).single(),
  ])
  if (categoryError || !category || settingsError || !settings) {
    console.error('Fare configuration lookup failed', categoryError || settingsError)
    return respond({ error: 'Selected ride category is unavailable' }, 422, allowedOrigin)
  }

  const directionsUrl = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${input.pickup!.lng},${input.pickup!.lat};${input.dropoff!.lng},${input.dropoff!.lat}`,
  )
  directionsUrl.searchParams.set('access_token', mapboxToken)
  directionsUrl.searchParams.set('overview', 'full')
  directionsUrl.searchParams.set('geometries', 'geojson')
  directionsUrl.searchParams.set('alternatives', 'false')
  let directionsResponse: Response
  let directions: any
  try {
    directionsResponse = await fetch(directionsUrl)
    directions = await directionsResponse.json()
  } catch (error) {
    console.error('Mapbox route request failed', error)
    return respond({ error: 'Route service is temporarily unavailable. Please try again.' }, 502, allowedOrigin)
  }
  const route = directions?.routes?.[0]
  if (!directionsResponse.ok || directions.code !== 'Ok' || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    console.error('Mapbox route calculation failed', directions.code || directions.message || directionsResponse.status)
    return respond({ error: 'Could not calculate a verified route. Please choose different locations.' }, 422, allowedOrigin)
  }

  const distanceKm = route.distance / 1000
  const durationMin = route.duration / 60
  if (distanceKm <= 0 || distanceKm > 500 || durationMin < 0 || durationMin > 600) {
    return respond({ error: 'The calculated route is outside the supported trip limits' }, 422, allowedOrigin)
  }
  const fare = Math.round(Math.min(
    Number(category.max_fare),
    Math.max(
      Number(category.min_fare),
      Number(category.base_fare) + distanceKm * Number(category.per_km) + durationMin * Number(category.per_min),
    ),
  ))
  const commissionRate = Number(settings.commission)
  const commission = Math.round(fare * commissionRate / 100)
  const quoteExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { data: quote, error: quoteError } = await adminClient.from('fare_quotes').insert({
    passenger_id: user.id,
    ride_category: category.id,
    pickup_lng: input.pickup!.lng,
    pickup_lat: input.pickup!.lat,
    dropoff_lng: input.dropoff!.lng,
    dropoff_lat: input.dropoff!.lat,
    distance_km: distanceKm,
    duration_min: durationMin,
    fare,
    booking_fee: 0,
    total_fare: fare,
    commission_rate: commissionRate,
    buddyride_commission: commission,
    driver_earnings: fare - commission,
    expires_at: quoteExpiresAt,
  }).select('id').single()
  if (quoteError || !quote) {
    console.error('Could not persist fare quote', quoteError)
    return respond({ error: 'Could not save your fare quote. Please try again.' }, 500, allowedOrigin)
  }

  return respond({
    quote_id: quote.id,
    expires_at: quoteExpiresAt,
    distance_km: distanceKm,
    duration_min: durationMin,
    fare,
    total_fare: fare,
    driver_earnings: fare - commission,
    buddyride_commission: commission,
    geometry: route.geometry,
  }, 200, allowedOrigin)
})
