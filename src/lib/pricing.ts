import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { db } from './firebase';
import { calcDistance, nearestTown } from './maps';

export async function getFarePricing(lat: number, lng: number): Promise<{ baseFare: number; perKm: number; town: string }> {
  const town = nearestTown(lat, lng);
  const townSnap = await getDoc(doc(db, 'town_pricing', town));

  if (townSnap.exists()) {
    const townData = townSnap.data();
    return { baseFare: Number(townData.base_fare), perKm: Number(townData.per_km), town };
  }

  const settingsSnap = await getDocs(query(collection(db, 'app_settings'), limit(1)));
  const settings = settingsSnap.docs[0]?.data();

  return {
    baseFare: settings ? Number(settings.default_base_fare) : 15,
    perKm: settings ? Number(settings.default_per_km) : 8,
    town,
  };
}

export function calculateFare(baseFare: number, perKm: number, distanceKm: number): number {
  return Math.round(baseFare + perKm * distanceKm);
}

// Simple flat-rate fare used for the in-app trip flow: R50 base + R10/km.
export function calculateSimpleFare(distanceKm: number): number {
  return Math.round(50 + distanceKm * 10);
}

export async function calculateTripFare(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number
): Promise<{ fare: number; distance: number; baseFare: number; perKm: number; town: string }> {
  const distance = calcDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const { baseFare, perKm, town } = await getFarePricing(pickupLat, pickupLng);
  const fare = calculateFare(baseFare, perKm, distance);
  return { fare, distance, baseFare, perKm, town };
}
