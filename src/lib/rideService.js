// Centralized ride lifecycle + 100% free OSM helpers (Nominatim search, OSRM routing).
// Lifecycle: pending -> driver_assigned -> driver_en_route -> driver_arrived -> trip_started -> completed (or cancelled at any point).
import { db } from './supabaseDb';
import { supabase } from './supabase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  normalizeRideStatus,
  serverTimestamp,
  updateDoc,
} from './supabaseDb';

export const RIDE_STATUS = {
  REQUESTED: 'searching',
  DRIVER_ASSIGNED: 'accepted',
  EN_ROUTE: 'arriving',
  ARRIVED: 'arrived_at_pickup',
  ON_TRIP: 'on_trip',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const NOMINATIM_URL = import.meta.env.VITE_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OSRM_URL = import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org';

// FREE SEARCH - OpenStreetMap Nominatim, restricted to South Africa.
export async function searchAddress(q) {
  if (!q || q.length < 3) return [];
  const res = await fetch(
    `${NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(q)}&countrycodes=za&limit=5&addressdetails=1`
  );
  if (!res.ok) return [];
  return res.json();
}

// Free routing through the public OSRM service.
// Aborts after 6s so a slow/unreachable OSRM server can never hang the UI forever (caller falls back to straight-line distance).
export async function getFreeRoute(from, to) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `${OSRM_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url, { signal: controller.signal });
    const j = await r.json();
    if (j.routes && j.routes[0]) {
      return {
        polyline: j.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]),
        distance: j.routes[0].distance,
        duration: j.routes[0].duration,
      };
    }
  } catch (e) {
    console.error('Failed to fetch OSRM route:', e);
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}

function normalizeRideRow(row) {
  return {
    ...row,
    status: normalizeRideStatus(row.status),
    pickup: row.pickup ?? { address: row.pickup_address, lat: row.pickup_lat, lng: row.pickup_lng },
    dropoff: row.dropoff ?? { address: row.dropoff_address, lat: row.dropoff_lat, lng: row.dropoff_lng },
    pickupLatLng: row.pickupLatLng ?? { lat: row.pickup_lat, lng: row.pickup_lng },
    dropoffLatLng: row.dropoffLatLng ?? { lat: row.dropoff_lat, lng: row.dropoff_lng },
    passengerId: row.passengerId ?? row.passenger_id,
    driverId: row.driverId ?? row.driver_id,
    driverName: row.driverName ?? row.driver_name,
    driverPhone: row.driverPhone ?? row.driver_phone,
    driverPhotoUrl: row.driverPhotoUrl ?? row.driver_photo_url,
    carPlate: row.carPlate ?? row.car_plate,
    driverCar: row.driverCar ?? row.driver_car,
    driverPlate: row.driverPlate ?? row.driver_plate,
    driverRating: row.driverRating ?? row.driver_rating,
    driverLat: row.driverLat ?? row.driver_lat,
    driverLng: row.driverLng ?? row.driver_lng,
    driverSpeed: row.driverSpeed ?? row.driver_speed,
    driverUpdatedAt: row.driverUpdatedAt ?? row.driver_updated_at,
    totalFare: row.totalFare ?? row.total_fare,
    extrasFee: row.extrasFee ?? row.extras_fee,
    packageDescription: row.packageDescription ?? row.package_description,
    recipientName: row.recipientName ?? row.recipient_name,
    recipientPhone: row.recipientPhone ?? row.recipient_phone,
    packageSize: row.packageSize ?? row.package_size,
    passengerCount: row.passengerCount ?? row.passenger_count,
    cancelledBy: row.cancelledBy ?? row.cancelled_by,
    cancelReason: row.cancelReason ?? row.cancel_reason,
    cancelledAt: row.cancelledAt ?? row.cancelled_at,
    createdAt: row.createdAt ?? row.created_at,
    startedAt: row.startedAt ?? row.started_at,
    completedAt: row.completedAt ?? row.completed_at,
  };
}

// CREATE RIDE - status: searching.
export async function createRide(pickup, dropoff, passengerId, extra = {}) {
  const payload = {
    passenger_id: passengerId,
    pickup_address: pickup.address,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_address: dropoff.address,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    distance_km: extra.distance_km ?? null,
    fare: extra.fare ?? extra.price ?? null,
    price: extra.price ?? extra.fare ?? null,
    total_fare: extra.totalFare ?? extra.price ?? extra.fare ?? null,
    type: extra.type ?? 'ride',
    category: extra.category ?? null,
    passenger_count: extra.passengerCount ?? 1,
    extras: extra.extras ?? [],
    extras_fee: extra.extrasFee ?? 0,
    stops: extra.stops ?? null,
    package_description: extra.packageDescription ?? null,
    recipient_name: extra.recipientName ?? null,
    recipient_phone: extra.recipientPhone ?? null,
    package_size: extra.packageSize ?? null,
    status: RIDE_STATUS.REQUESTED,
  };
  return addDoc(collection(db, 'rides'), payload);
}

// Live feed of rides waiting for a driver.
export function subscribeToRequestedRides(callback, onError) {
  let stopped = false;
  let loading = false;
  const channel = supabase
    .channel(`driver-ride-requests-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => { void load(); })
    .subscribe();

  async function load() {
    if (stopped || loading) return;
    loading = true;
    try {
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .in('status', ['searching', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (stopped) return;
      if (error) {
        onError?.(error);
        return;
      }
      callback({
        docs: data ? [{ id: data.id, data: () => normalizeRideRow(data) }] : [],
        empty: !data,
        size: data ? 1 : 0,
      });
    } catch (error) {
      if (!stopped) onError?.(error);
    } finally {
      loading = false;
    }
  }

  void load();
  const pollInterval = window.setInterval(() => void load(), 5000);
  return () => {
    stopped = true;
    window.clearInterval(pollInterval);
    void supabase.removeChannel(channel);
  };
}

// Subscribe to realtime updates and poll as a fallback if the project has not enabled Realtime.
export function subscribeToRide(rideId, callback, onError) {
  const reference = doc(db, 'rides', rideId);
  let stopped = false;
  let loading = false;
  const channel = supabase
    .channel(`ride-${rideId}-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` }, () => { void load(); })
    .subscribe();

  async function load() {
    if (stopped || loading) return;
    loading = true;
    try {
      const snapshot = await getDoc(reference);
      if (!stopped) callback(snapshot);
    } catch (error) {
      if (!stopped) onError?.(error);
    } finally {
      loading = false;
    }
  }

  void load();
  const pollInterval = window.setInterval(() => void load(), 5000);
  return () => {
    stopped = true;
    window.clearInterval(pollInterval);
    void supabase.removeChannel(channel);
  };
}

// DRIVER_ASSIGNED - a driver accepts the ride.
export async function acceptRide(rideId, driverData = {}) {
  await updateDoc(doc(db, 'rides', rideId), {
    status: RIDE_STATUS.DRIVER_ASSIGNED,
    ...driverData,
    acceptedAt: serverTimestamp(),
  });
}

// ARRIVED - driver is at the pickup point. Also notifies the passenger.
export async function markArrived(rideId, passengerId, extra = {}) {
  const payload = {
    status: RIDE_STATUS.ARRIVED,
    arrived_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  const { error } = await supabase.from('rides').update(payload).eq('id', rideId);
  if (error) throw error;
  void updateDoc(doc(db, 'ride_requests', rideId), payload).catch(() => {});

  try {
    await addDoc(collection(db, 'notifications'), {
      rideId,
      passengerId: passengerId ?? null,
      type: 'driver_arrived',
      message: 'Driver has arrived at pickup',
      createdAt: serverTimestamp(),
      read: false,
    });
  } catch (e) {
    console.error('Failed to write passenger notification:', e);
  }
}

// ON_TRIP - passenger picked up, heading to destination.
export async function startTrip(rideId, extra = {}) {
  await updateDoc(doc(db, 'rides', rideId), {
    status: RIDE_STATUS.ON_TRIP,
    started_at: serverTimestamp(),
    ...extra,
  });
}

// Alias for startTrip.
export const startRide = startTrip;

// Alias for markArrived.
export const arrivedRide = markArrived;

// COMPLETED - trip finished.
export async function completeRide(rideId, extra = {}) {
  await updateDoc(doc(db, 'rides', rideId), {
    status: RIDE_STATUS.COMPLETED,
    completed_at: serverTimestamp(),
    ...extra,
  });
}

// CANCELLED - ride cancelled by either party.
export async function cancelRide(rideId, extra = {}) {
  const { status: _ignoredStatus, cancelledBy, cancelled_by, cancelReason, cancellationReason, ...metadata } = extra;
  const cancellingParty = cancelledBy ?? cancelled_by;
  const payload = {
    ...Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value]),
    ),
    status: cancellingParty === 'driver'
      ? 'cancelled_by_driver'
      : cancellingParty === 'passenger'
        ? 'cancelled_by_passenger'
        : RIDE_STATUS.CANCELLED,
    cancelled_by: cancellingParty ?? null,
    cancel_reason: cancelReason ?? cancellationReason ?? null,
    cancelled_at: serverTimestamp(),
  };

  const { error } = await supabase.from('rides').update(payload).eq('id', rideId);
  if (error) throw error;
  void updateDoc(doc(db, 'ride_requests', rideId), payload).catch(() => {});
}

// Generic field patch for in-trip updates (waiting fares, live driver location, etc.).
export async function updateRideFields(rideId, fields = {}) {
  await updateDoc(doc(db, 'rides', rideId), fields);
}
