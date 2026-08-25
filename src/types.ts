export type AppRole = 'passenger' | 'driver' | 'admin';

export type UserRole = AppRole;

export type TripStatus =
  | 'requested'
  | 'accepted'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_driver';

export type PaymentMethod = 'cash' | 'card';

export type PaymentStatus = 'pending' | 'cash_pending' | 'paid' | 'unpaid';

export type DocType = 'id' | 'license' | 'prdp' | 'vehicle_papers';

export type DocStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_driver_approved: boolean;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  created_at: string;
}

export interface DriverDocument {
  id: string;
  driver_id: string;
  doc_type: DocType;
  file_url: string;
  status: DocStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Trip {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string | null;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string | null;
  distance_km: number | null;
  fare: number;
  commission: number;
  status: TripStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  town: string | null;
  created_at: string;
  accepted_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface TownPricing {
  id: string;
  town: string;
  base_fare: number;
  per_km: number;
  updated_at: string;
}

export interface AppSettings {
  id: string;
  commission_pct: number;
  default_base_fare: number;
  default_per_km: number;
  updated_at: string;
}

export interface TripWithNames extends Trip {
  passenger_name?: string | null;
  passenger_phone?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
}
