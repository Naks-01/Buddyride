import { supabase, type Ride } from './supabase'

type RideUpdate = Partial<Pick<
  Ride,
  | 'driver_id'
  | 'status'
  | 'accepted_at'
  | 'offered_driver_id'
  | 'offer_expires_at'
  | 'driver_lat'
  | 'driver_lng'
  | 'cancel_reason'
  | 'cancelled_at'
  | 'cancelled_by'
>>

const VALID_STATUSES = ['requested', 'offered', 'accepted', 'arriving', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_driver'] as const

export async function updateRide(rideId: string, values: RideUpdate) {
  if (!rideId) throw new Error('updateRide: rideId is required')
  if (!values || Object.keys(values).length === 0) throw new Error('updateRide: no values to update')

  // FIX: Status validation - was any string allowed, "completd" typo silently saved and broke UI
  if (values.status && !(VALID_STATUSES as readonly string[]).includes(values.status)) {
    throw new Error(`updateRide: invalid status "${values.status}"`)
  }

  // FIX: Block lat/lng without driver - was saving driver_lat with no driver_id, map showed ghost driver
  if ((values.driver_lat != null || values.driver_lng != null) && !values.driver_id) {
    const { data: existing } = await supabase.from('rides').select('driver_id').eq('id', rideId).single()
    if (!existing?.driver_id) throw new Error('updateRide: cannot set driver location without driver_id')
  }

  // FIX: Auto timestamps - was caller had to remember accepted_at / cancelled_at, most forgot
  const withTimestamps: RideUpdate = { ...values }
  if (values.status === 'accepted' && !values.accepted_at) withTimestamps.accepted_at = new Date().toISOString()
  if (values.status === 'cancelled' && !values.cancelled_at) withTimestamps.cancelled_at = new Date().toISOString()

  const { data, error } = await supabase.from('rides').update(withTimestamps as any).eq('id', rideId).select().single()

  // FIX: Return data + throw on error - was returning raw query, caller couldn't tell if ride was already taken
  if (error) throw new Error(error.message)
  if (!data) throw new Error('updateRide: ride not found - it may have been cancelled')
  return data as Ride
}

// FIX: Atomic accept - was two drivers could accept same ride, race condition
export async function acceptRideAtomic(rideId: string, driverId: string) {
  if (!rideId || !driverId) throw new Error('acceptRideAtomic: rideId and driverId required')
  const { data, error } = await supabase.from('rides')
    .update({ driver_id: driverId, status: 'accepted', accepted_at: new Date().toISOString(), offered_driver_id: null, offer_expires_at: null } as any)
    .eq('id', rideId)
    .in('status', ['requested', 'offered'])
    .select().single()
  if (error || !data) throw new Error('Ride already taken by another driver')
  return data as Ride
}