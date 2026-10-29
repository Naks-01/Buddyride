import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url || 'https://configuration-missing.invalid', anonKey || 'configuration-missing')

export type Role = 'passenger' | 'driver' | 'admin'

export type Profile = {
  id: string
  email: string | null
  role: Role
  full_name: string | null
  phone: string | null
  phone_number?: string | null
  avatar_url: string | null
  is_verified?: boolean | null
  is_banned?: boolean | null
  is_online?: boolean | null
  current_lat?: number | null
  current_lng?: number | null
  wallet_balance?: number | null
  trips_completed?: number | null
  rating?: number | null
  car_model?: string | null
  car_plate?: string | null
  car_color?: string | null
  created_at?: string | null
}

export type RideStatus =
  | 'searching'
  | 'awaiting_payment'  // <-- ADDED: required for Paystack flow
  | 'accepted'
  | 'arrived'
  | 'picked_up'
  | 'en_route'
  | 'in_progress'
  | 'driver_arriving'
  | 'driver_arrived'
  | 'completed'
  | 'rated'
  | 'cancelled'

export type Ride = {
  id: string
  passenger_id: string
  driver_id: string | null
  pickup_address: string
  dropoff_address: string
  pickup_lat: number
  pickup_lng: number
  dropoff_lat: number
  dropoff_lng: number
  distance_km: number
  fare: number
  booking_fee?: number | null
  total_fare?: number | null
  driver_earnings?: number | null
  buddyride_commission?: number | null
  status: RideStatus
  passenger_name?: string | null
  driver_name?: string | null
  driver_lat?: number | null
  driver_lng?: number | null
  offered_driver_id?: string | null
  offer_expires_at?: string | null
  tried_driver_ids?: string[] | null
  payment_method?: 'cash' | 'paystack' | null
  payment_status?: 'awaiting_payment' | 'paid' | 'cash_due' | 'failed' | 'refunded' | null
  payment_reference?: string | null
  ride_category?: string | null
  duration_min?: number | null
  cancel_reason?: string | null
  cancelled_by?: 'passenger' | 'driver' | 'system' | null
  cancelled_at?: string | null
  started_at?: string | null
  ended_at?: string | null
  created_at?: string
}