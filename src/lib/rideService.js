// Centralized ride lifecycle + 100% free OSM helpers (Nominatim search, OSRM routing).
// Lifecycle: searching -> driver_assigned -> driver_en_route -> driver_arrived -> trip_started -> completed (or cancelled at any point).
import { db } from './supabaseDb';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from './supabaseDb';

export const RIDE_STATUS = {
  REQUESTED: 'searching',
  DRIVER_ASSIGNED: 'driver_assigned',
  EN_ROUTE: 'driver_en_route',
  ARRIVED: 'driver_arrived',
  ON_TRIP: 'trip_started',
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

// CREATE RIDE - status: searching.
export async function createRide(pickup, dropoff, passengerId, extra = {}) {
  return addDoc(collection(db, 'rides'), {
    pickup,
    dropoff,
    pickupLatLng: { lat: pickup.lat, lng: pickup.lng },
    dropoffLatLng: { lat: dropoff.lat, lng: dropoff.lng },
    passengerId,
    status: RIDE_STATUS.REQUESTED,
    createdAt: serverTimestamp(),
    ...extra,
  });
}

// Live feed of rides waiting for a driver.
export function subscribeToRequestedRides(callback, onError) {
  return onSnapshot(
    query(collection(db, 'rides'), where('status', '==', RIDE_STATUS.REQUESTED)),
    callback,
    onError
  );
}

// Live updates for a single ride document.
export function subscribeToRide(rideId, callback, onError) {
  return onSnapshot(doc(db, 'rides', rideId), callback, onError);
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
  await updateDoc(doc(db, 'rides', rideId), {
    status: RIDE_STATUS.ARRIVED,
    arrivedAt: serverTimestamp(),
    ...extra,
  });
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
    startedAt: serverTimestamp(),
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
    completedAt: serverTimestamp(),
    ...extra,
  });
}

// CANCELLED - ride cancelled by either party.
export async function cancelRide(rideId, extra = {}) {
  await updateDoc(doc(db, 'rides', rideId), {
    status: RIDE_STATUS.CANCELLED,
    cancelledAt: serverTimestamp(),
    cancelReason: extra.cancelReason ?? extra.cancellationReason ?? null,
    ...extra,
  });
}

// Generic field patch for in-trip updates (waiting fares, live driver location, etc.).
export async function updateRideFields(rideId, fields = {}) {
  await updateDoc(doc(db, 'rides', rideId), fields);
}
