import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const supabaseUrl = Deno.env.get('SUPABASE_URL')!
export const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
export const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
export const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY')!

export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export function jsonResponse(body: unknown, status = 200, origin = '*') {
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

export function allowedOrigin(request: Request) {
  const configuredOrigin = Deno.env.get('APP_BASE_URL')
  const requestOrigin = request.headers.get('origin')
  if (!configuredOrigin || !requestOrigin) return null
  try {
    return new URL(configuredOrigin).origin === new URL(requestOrigin).origin
      ? new URL(configuredOrigin).origin
      : null
  } catch {
    return null
  }
}

export async function initializePaystackTransaction(input: {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  rideId: string
  passengerId: string
}) {
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: 'ZAR',
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: { ride_id: input.rideId, passenger_id: input.passengerId },
    }),
  })
  const payload = await response.json()
  if (!response.ok || !payload.status || !payload.data?.authorization_url) {
    throw new Error(payload.message || 'Paystack could not initialize checkout')
  }
  return payload.data as { authorization_url: string, access_code: string, reference: string }
}

export async function verifyPaystackTransaction(reference: string, expectedAmountKobo: number, rideId: string, passengerId: string) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecretKey}` },
  })
  const payload = await response.json()
  const transaction = payload.data
  if (!response.ok || !payload.status || transaction?.status !== 'success') {
    throw new Error(payload.message || 'Paystack has not confirmed this payment')
  }
  if (
    transaction.reference !== reference
    || Number(transaction.amount) !== expectedAmountKobo
    || transaction.currency !== 'ZAR'
    || transaction.metadata?.ride_id !== rideId
    || transaction.metadata?.passenger_id !== passengerId
  ) {
    throw new Error('Payment details do not match this ride')
  }
  return transaction
}

export async function markRidePaid(rideId: string, reference: string) {
  const { data: ride, error: rideError } = await adminClient
    .from('rides')
    .select('id,status,payment_status,payment_reference')
    .eq('id', rideId)
    .single()
  if (rideError) throw rideError
  if (ride.payment_status === 'paid') {
    if (ride.payment_reference !== reference) throw new Error('Ride has already been paid with a different reference')
    return ride
  }
  if (ride.status !== 'awaiting_payment' || ride.payment_reference !== reference) {
    throw new Error('Ride is not awaiting this payment')
  }

  const { data: updated, error: updateError } = await adminClient
    .from('rides')
    .update({ payment_status: 'paid', status: 'searching' })
    .eq('id', rideId)
    .eq('payment_status', 'awaiting_payment')
    .eq('payment_reference', reference)
    .select('id,status,payment_status,payment_reference')
    .single()
  if (updateError) throw updateError
  return updated
}

export async function verifyWebhookSignature(rawBody: string, signature: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(paystackSecretKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
  const expected = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  if (signature.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}
