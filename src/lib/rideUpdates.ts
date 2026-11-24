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

export function updateRide(rideId: string, values: RideUpdate) {
  if (!rideId) throw new Error('updateRide: rideId is required')
  if (!values || Object.keys(values).length === 0) throw new Error('updateRide: no values to update')
  return supabase.from('rides').update(values as any).eq('id', rideId) as any
}