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
  driverGets: number;
  platformGets: number;
  breakdown: string;
  commission: number;
};

export const COMMISSION = 0.20 // Buddy takes 20% FROM the total fare

const CATEGORY_RATES: Record<string, { base: number; perKm: number; perMin: number; min: number }> = {
  // FIXED FOR POLOKWANE - R27 MINIMUM
  buddy_go: { base: 15, perKm: 8, perMin: 0.5, min: 27 },
  go: { base: 15, perKm: 8, perMin: 0.5, min: 27 },
  buddy_comfort: { base: 18, perKm: 10, perMin: 0.7, min: 35 },
  buddy_xl: { base: 22, perKm: 12, perMin: 1.0, min: 50 },
}

export function calculateFare(distanceKm: number, durationMin: number = 5, category: string = 'buddy_go'): FareEstimate {
  const rates = CATEGORY_RATES[category] || CATEGORY_RATES.buddy_go

  let calcFare = rates.base + (distanceKm * rates.perKm) + (durationMin * rates.perMin)

  if (calcFare < rates.min) calcFare = rates.min
  if (calcFare > 350) calcFare = 350
  calcFare = Math.round(calcFare)

  const bookingFee = 0
  const total = calcFare // Passenger pays: R27
  
  // Buddy takes 20% FROM that R27
  const platformGets = Math.round(total * COMMISSION) // R27 * 0.20 = R5
  const driverGets = total - platformGets // R27 - R5 = R22

  return {
    distance: distanceKm,
    distanceKm,
    duration: durationMin * 60,
    durationMin,
    fare: calcFare,
    total,
    price: calcFare,
    bookingFee,
    booking_fee: bookingFee,
    driverGets,
    platformGets,
    breakdown: `Total R${total} = Driver R${driverGets} (80%) + Buddy R${platformGets} (20%)`,
    commission: COMMISSION
  };
}

export function calculateFareForCategory(catId: string, km: number, min: number = 5) {
  return calculateFare(km, min, catId)
}

export default calculateFare;
export const getFare = calculateFare;
export const estimateFare = calculateFare;
export const getFareEstimate = calculateFare;