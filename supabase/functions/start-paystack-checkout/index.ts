import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  adminClient,
  allowedOrigin,
  initializePaystackTransaction,
  jsonResponse,
  serviceRoleKey,
  supabaseAnonKey,
  supabaseUrl,
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
    if (authError || !user?.email) return jsonResponse({ error: 'A verified account email is required' }, 401, origin)

    const { ride_id: rideId } = await request.json()
    if (typeof rideId !== 'string') return jsonResponse({ error: 'ride_id is required' }, 400, origin)

    const { data: ride, error: rideError } = await adminClient
      .from('rides')
      .select('id,passenger_id,status,payment_method,payment_status,total_fare,payment_reference')
      .eq('id', rideId)
      .single()
    if (rideError) throw rideError
    if (
      ride.passenger_id !== user.id
      || ride.status !== 'awaiting_payment'
      || ride.payment_method !== 'paystack'
      || !['awaiting_payment', 'failed'].includes(ride.payment_status)
    ) {
      return jsonResponse({ error: 'Ride is not eligible for Paystack checkout' }, 409, origin)
    }

    const reference = `buddyride-${ride.id}-${crypto.randomUUID()}`
    const { error: referenceError } = await adminClient
      .from('rides')
      .update({ payment_reference: reference, payment_status: 'awaiting_payment' })
      .eq('id', ride.id)
      .eq('passenger_id', user.id)
      .eq('status', 'awaiting_payment')
    if (referenceError) throw referenceError

    const appBaseUrl = Deno.env.get('APP_BASE_URL')
    if (!appBaseUrl) throw new Error('APP_BASE_URL is not configured for the payment function')
    const callback = new URL(appBaseUrl)
    callback.searchParams.set('paystack', 'verify')
    callback.searchParams.set('ride_id', ride.id)
    callback.searchParams.set('reference', reference)

    const transaction = await initializePaystackTransaction({
      email: user.email,
      amountKobo: Math.round(Number(ride.total_fare) * 100),
      reference,
      callbackUrl: callback.toString(),
      rideId: ride.id,
      passengerId: user.id,
    })
    return jsonResponse({ authorization_url: transaction.authorization_url }, 200, origin)
  } catch (error) {
    console.error('Paystack checkout initialization failed', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Checkout initialization failed' }, 500, origin)
  }
})
