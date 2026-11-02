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

export function updateRide(values: RideUpdate) {
  return supabase.from('rides').update(values as any)
}
