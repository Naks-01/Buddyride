import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  adminClient,
  allowedOrigin,
  jsonResponse,
  markRidePaid,
  serviceRoleKey,
  supabaseAnonKey,
  supabaseUrl,
  verifyPaystackTransaction,
} from '../_shared/paystack.ts'

Deno.serve(async request => {
  const origin = allowedOrigin(request)
  if (request.method === 'OPTIONS') return jsonResponse({}, 200, origin || 'null')
  if (!origin) return jsonResponse({ error: 'Origin not allowed' }, 403)
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, origin)

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return jsonResponse({ error: 'Authentication required' }, 401, origin)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return jsonResponse({ error: 'Authentication required' }, 401, origin)

    const { ride_id: rideId, reference } = await request.json()
    if (typeof rideId !== 'string' || typeof reference !== 'string') {
      return jsonResponse({ error: 'ride_id and reference are required' }, 400, origin)
    }
    const { data: ride, error: rideError } = await adminClient
      .from('rides')
      .select('id,passenger_id,status,payment_method,payment_status,payment_reference,total_fare')
      .eq('id', rideId)
      .single()
    if (rideError) throw rideError
    if (ride.passenger_id !== user.id || ride.payment_method !== 'paystack' || ride.payment_reference !== reference) {
      return jsonResponse({ error: 'Ride/payment reference mismatch' }, 403, origin)
    }
    if (ride.payment_status !== 'paid') {
      await verifyPaystackTransaction(reference, Math.round(Number(ride.total_fare) * 100), ride.id, user.id)
      await markRidePaid(ride.id, reference)
    }
    return jsonResponse({ paid: true, ride_id: ride.id }, 200, origin)
  } catch (error) {
    console.error('Paystack payment verification failed', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Payment verification failed' }, 400, origin)
  }
})
