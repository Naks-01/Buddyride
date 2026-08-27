import type { Timestamp } from 'firebase/firestore';
import type { Profile, Trip, UserRole } from '../types';

function tsToIso(value: unknown): string {
  const ts = value as Timestamp | undefined;
  return ts?.toDate ? ts.toDate().toISOString() : new Date().toISOString();
}

export function toProfile(uid: string, data: Record<string, unknown>): Profile {
  return {
    id: uid,
    phone: (data.phone as string) ?? null,
    email: (data.email as string) ?? null,
    full_name: (data.name as string) ?? null,
    role: (data.role as UserRole) || 'passenger',
    is_driver_approved: Boolean(data.is_driver_approved),
    vehicle_plate: (data.vehicle_plate as string) ?? null,
    vehicle_model: (data.vehicle_model as string) ?? null,
    created_at: tsToIso(data.createdAt),
    idNumberVerified: Boolean(data.idNumberVerified),
    idNumberLast4: (data.idNumberLast4 as string) ?? null,
    idNumberHash: (data.idNumberHash as string) ?? null,
    selfieUrl: (data.selfieUrl as string) ?? null,
    verificationStatus: (data.verificationStatus as Profile['verificationStatus']) || 'unverified',
    verifiedAt: data.verifiedAt ? tsToIso(data.verifiedAt) : null,
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
