import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY - check Vercel Env Vars + .env.local')
}

export const supabase = createClient(url || 'https://configuration-missing.invalid', anonKey || 'configuration-missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // FIXED: PKCE is secure + doesn't leak token in URL like implicit flow
    flowType: 'pkce',
    // FIXED: Unique key so BuddyRide doesn't clash with other Supabase apps on same domain
    storageKey: 'buddyride-auth',
  },
})

export type Role = 'passenger' | 'rider' | 'driver' | 'admin'
export type DriverDocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type DriverDocument = {
  id: string
  driver_id: string
  doc_type: string
  document_type?: string | null
  file_url: string
  document_url?: string | null
  document_date?: string | null
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
  selfie_url?: string | null
  id_document_url?: string | null
  id_number?: string | null
  id_verification_method?: 'id_number' | 'id_photo' | null
  id_verified?: boolean | null
  is_verified?: boolean | null
  verification_status?: string | null
  verification_rejection_reason?: string | null
  verified_at?: string | null
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
  // FIXED: These were used everywhere but missing from type
  city?: string | null
  created_at?: string | null
  updated_at?: string | null
}

// FIXED: Real table is driver_profiles, not drivers
export type DriverProfile = {
  id: string
  user_id: string
  tier?: string | null
  driver_score?: number | null
  rating?: number | null
  acceptance_rate?: number | null
  cancellation_rate?: number | null
  is_online?: boolean | null
  current_lat?: number | null
  current_lng?: number | null
  car_model?: string | null
  car_plate?: string | null
  car_color?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type RideStatus =
  | 'searching'
  | 'awaiting_payment'
  | 'driver_assigned'
  | 'accepted'
  | 'driver_arriving'
  | 'arrived'
  | 'picked_up'
  | 'en_route'
  | 'in_progress'
  | 'on_trip'
  | 'driving_to_destination'
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
  duration_min?: number | null
  fare: number
  booking_fee?: number | null
  // FIXED 100%: Removed total_fare, driver_earnings, buddyride_commission — not in DB yet, calculated in fare.ts
  status: RideStatus
  ride_category?: string | null
  payment_method?: 'cash' | 'paystack' | null
  payment_status?: 'awaiting_payment' | 'paid' | 'cash_due' | 'failed' | 'refunded' | null
  payment_reference?: string | null
  fare_quote_id?: string | null
  offered_driver_id?: string | null
  offer_expires_at?: string | null
  tried_driver_ids?: string[] | null
  cancel_reason?: string | null
  cancelled_by?: 'passenger' | 'driver' | 'system' | null
  cancelled_at?: string | null
  accepted_at?: string | null
  started_at?: string | null
  ended_at?: string | null
  created_at?: string
  updated_at?: string | null
  passenger_name?: string | null
  driver_name?: string | null
  driver_lat?: number | null
  driver_lng?: number | null
  driver_rating?: number | null
}