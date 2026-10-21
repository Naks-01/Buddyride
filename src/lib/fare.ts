export type FareEstimate = {
  distance: number;
  distanceKm: number;
  duration: number;
  durationMin: number;
  fare: number;
  total: number;
  price: number;
  bookingFee: number;
  booking_fee: number;
  // NEW - your 20% breakdown
  driverGets: number;
  platformGets: number;
  breakdown: string;
  commission: number;
};

export const COMMISSION = 0.20 // BuddyRide takes 20%

const CATEGORY_RATES: Record<string, { base: number; perKm: number; perMin: number; min: number }> = {
  // NEW CHEAPER POLOKWANE PRICING - undercuts Bolt 2026
  buddy_go: { base: 8, perKm: 5.5, perMin: 0.5, min: 20 },
  go: { base: 8, perKm: 5.5, perMin: 0.5, min: 20 },
  buddy_comfort: { base: 12, perKm: 7.0, perMin: 0.7, min: 30 },
  buddy_xl: { base: 18, perKm: 9.0, perMin: 1.0, min: 45 },
}

export function calculateFare(distanceKm: number, durationMin: number = 5, category: string = 'buddy_go'): FareEstimate {
  const rates = CATEGORY_RATES[category] || CATEGORY_RATES.buddy_go

  let calcFare = rates.base + (distanceKm * rates.perKm) + (durationMin * rates.perMin)

  if (calcFare < rates.min) calcFare = rates.min
  if (calcFare > 350) calcFare = 350
  calcFare = Math.round(calcFare) // No R5 rounding, exact pricing

  const bookingFee = 0
  const total = calcFare
  const driverGets = Math.round(calcFare * (1 - COMMISSION))
  const platformGets = Math.round(calcFare * COMMISSION)

  return {
    distance: distanceKm,
    distanceKm,
    duration: durationMin * 60,
    durationMin,
    fare: calcFare, // passenger pays
    total,
    price: calcFare,
    bookingFee,
    booking_fee: bookingFee,
    driverGets, // driver gets 80%
    platformGets, // you get 20%
    breakdown: `R${rates.base} + ${distanceKm.toFixed(1)}km×R${rates.perKm} + ${durationMin.toFixed(0)}min×R${rates.perMin}`,
    commission: COMMISSION
  };
}

// For PassengerHome compatibility
export function calculateFareForCategory(catId: string, km: number, min: number = 5) {
  return calculateFare(km, min, catId)
}

export default calculateFare;
export const getFare = calculateFare;
export const estimateFare = calculateFare;
export const getFareEstimate = calculateFare;