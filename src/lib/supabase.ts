import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url || 'https://configuration-missing.invalid', anonKey || 'configuration-missing')

export type Role = 'passenger' | 'driver' | 'admin'

export type DriverDocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type DriverDocument = {
  id: string
  driver_id: string
  doc_type: string
  file_url: string
  file_path: string | null
  storage_path: string | null
  file_name: string | null
  status: DriverDocumentStatus
  rejection_reason: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  expiry_date: string | null
  prdp_number?: string | null
  document_hash?: string | null
  created_at: string
}

export type Profile = {
  id: string
  email: string | null
  role: Role
  full_name: string | null
  phone: string | null
  phone_number?: string | null
  avatar_url: string | null
  id_document_url?: string | null
  id_number?: string | null
  id_verification_method?: 'id_number' | 'id_photo' | null
  id_verified?: boolean | null
  is_verified?: boolean | null
  verification_status?: string | null
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
  bank_name?: string | null
  bank_account_holder?: string | null
  bank_account_number?: string | null
  bank_branch_code?: string | null
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
  driver_rating?: number | null
  cancel_reason?: string | null
  cancelled_by?: 'passenger' | 'driver' | 'system' | null
  cancelled_at?: string | null
  accepted_at?: string | null
  started_at?: string | null
  ended_at?: string | null
  created_at?: string
}