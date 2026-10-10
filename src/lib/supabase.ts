import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn('BuddyRide1: Supabase environment variables are missing.')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder')

export type Role = 'passenger' | 'driver' | 'admin'

export type Profile = {
  id: string
  email: string | null
  role: Role
  full_name: string | null
  phone: string | null
  avatar_url: string | null
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
  | 'accepted'
  | 'arrived'
  | 'picked_up'
  | 'en_route'
  | 'in_progress'
  | 'driver_arriving'
  | 'driver_arrived'
  | 'completed'
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
  payment_method?: string | null
  ride_category?: string | null
  started_at?: string | null
  ended_at?: string | null
  created_at?: string
}