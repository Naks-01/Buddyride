import type { Timestamp } from './supabaseDb';
import type { Profile, Trip, UserRole } from '../types';

function tsToIso(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const ts = value as Timestamp | undefined;
  return ts?.toDate ? ts.toDate().toISOString() : new Date().toISOString();
}

export function toProfile(uid: string, data: Record<string, unknown>): Profile {
  return {
    id: uid,
    phone: (data.phone as string) ?? null,
    email: (data.email as string) ?? null,
    full_name: (data.full_name as string) ?? (data.name as string) ?? null,
    role: (data.role as UserRole) || 'passenger',
    is_driver_approved: Boolean(data.is_driver_approved),
    vehicle_plate: (data.vehicle_plate as string) ?? null,
    vehicle_model: (data.vehicle_model as string) ?? null,
    created_at: tsToIso(data.created_at ?? data.createdAt),
    idNumberVerified: Boolean(data.id_number_verified ?? data.idNumberVerified),
    idNumberLast4: (data.id_number_last4 as string) ?? (data.idNumberLast4 as string) ?? null,
    idNumberHash: (data.id_number_hash as string) ?? (data.idNumberHash as string) ?? null,
    selfieUrl: (data.selfie_url as string) ?? (data.selfieUrl as string) ?? null,
    verificationStatus: ((data.verification_status ?? data.verificationStatus) as Profile['verificationStatus']) || 'unverified',
    verifiedAt: data.verified_at || data.verifiedAt ? tsToIso(data.verified_at ?? data.verifiedAt) : null,
  };
}

export function toTrip(id: string, data: Record<string, unknown>): Trip {
  return {
    id,
    passenger_id: data.passenger_id as string,
    driver_id: (data.driver_id as string) ?? null,
    pickup_lat: Number(data.pickup_lat) || 0,
    pickup_lng: Number(data.pickup_lng) || 0,
    pickup_address: (data.pickup_address as string) ?? null,
    dropoff_lat: Number(data.dropoff_lat) || 0,
    dropoff_lng: Number(data.dropoff_lng) || 0,
    dropoff_address: (data.dropoff_address as string) ?? null,
    distance_km: data.distance_km != null ? Number(data.distance_km) : null,
    fare: Number(data.fare) || 0,
    commission: Number(data.commission) || 0,
    status: data.status as Trip['status'],
    payment_method: (data.payment_method as Trip['payment_method']) || 'cash',
    payment_status: (data.payment_status as Trip['payment_status']) || 'pending',
    town: (data.town as string) ?? null,
    created_at: tsToIso(data.created_at),
    accepted_at: null,
    arrived_at: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
  };
}
