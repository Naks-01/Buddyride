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
}

export type RideStatus =
  | 'searching'
  | 'accepted'
  | 'driver_arriving'
  | 'driver_arrived'
  | 'in_progress'
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
  booking_fee: number
  total_fare: number
  driver_earnings: number
  buddyride_commission: number
  status: RideStatus
  passenger_name?: string
  driver_name?: string
}