import {
  adminClient,
  jsonResponse,
  markRidePaid,
  verifyPaystackTransaction,
  verifyWebhookSignature,
} from '../_shared/paystack.ts'

Deno.serve(async request => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  const rawBody = await request.text()
  const signature = request.headers.get('x-paystack-signature') || ''
  if (!signature || !(await verifyWebhookSignature(rawBody, signature))) {
    return jsonResponse({ error: 'Invalid webhook signature' }, 401)
  }

  try {
    const event = JSON.parse(rawBody)
    if (event.event !== 'charge.success') return jsonResponse({ received: true })
    const reference = event.data?.reference
    const rideId = event.data?.metadata?.ride_id
    const passengerId = event.data?.metadata?.passenger_id
    if (typeof reference !== 'string' || typeof rideId !== 'string' || typeof passengerId !== 'string') {
      return jsonResponse({ error: 'Missing payment metadata' }, 400)
    }

    const { data: ride, error: rideError } = await adminClient
      .from('rides')
      .select('id,passenger_id,payment_method,payment_reference,total_fare')
      .eq('id', rideId)
      .single()
    if (rideError) throw rideError
    if (
      ride.passenger_id !== passengerId
      || ride.payment_method !== 'paystack'
      || ride.payment_reference !== reference
    ) {
      return jsonResponse({ error: 'Payment does not match the ride' }, 400)
    }
    await verifyPaystackTransaction(reference, Math.round(Number(ride.total_fare) * 100), ride.id, ride.passenger_id)
    await markRidePaid(ride.id, reference)
    return jsonResponse({ received: true })
  } catch (error) {
    console.error('Paystack webhook processing failed', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Webhook processing failed' }, 500)
  }
})
