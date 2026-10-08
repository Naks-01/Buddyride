export const FARE = {
  base: 15,
  perKm: 7.5,
  bookingFee: 5,
  minimum: 35,
  driverShare: 0.8,
  platformShare: 0.2,
}

export function calculateFare(distanceKm: number) {
  const distanceFare = FARE.base + Math.max(0, distanceKm) * FARE.perKm
  const fare = Math.max(FARE.minimum, distanceFare)
  const total = fare + FARE.bookingFee
  return {
    fare: Number(fare.toFixed(2)),
    bookingFee: FARE.bookingFee,
    total: Number(total.toFixed(2)),
    driverEarnings: Number((total * FARE.driverShare).toFixed(2)),
    buddyrideCommission: Number((total * FARE.platformShare).toFixed(2)),
  }
}