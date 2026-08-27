import { calcDistance, nearestTown } from './maps';
import { BASE_FARE, BOOKING_FEE, COMMISSION_RATE, DRIVER_RATE, PER_KM_RATE } from '../config/pricing';

export async function getFarePricing(lat: number, lng: number): Promise<{ baseFare: number; perKm: number; town: string }> {
  const town = nearestTown(lat, lng);
  return { baseFare: BASE_FARE, perKm: PER_KM_RATE, town };
}

export function calculateFare(_baseFare: number, _perKm: number, distanceKm: number): number {
  return BASE_FARE + distanceKm * PER_KM_RATE;
}

export function calculateRidePricing(distanceKm: number) {
  const fare = BASE_FARE + distanceKm * PER_KM_RATE;
  const platformCommission = fare * COMMISSION_RATE;
  const driverPayout = fare * DRIVER_RATE;
  const totalToPassenger = fare + BOOKING_FEE;
  const totalPlatform = platformCommission + BOOKING_FEE;
  return { fare, platformCommission, driverPayout, totalToPassenger, totalPlatform };
}

export function calculateFareBreakdown(distanceKm: number) {
  const { fare, platformCommission, driverPayout } = calculateRidePricing(distanceKm);
  return { total: fare, platformCut: platformCommission, driverPayout };
}

// Simple flat-rate fare used for the in-app trip flow: R50 base + R10/km.
export function calculateSimpleFare(distanceKm: number): number {
  return BASE_FARE + distanceKm * PER_KM_RATE;
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
