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
};

const CATEGORY_RATES: Record<string, { base: number; perKm: number; perMin: number; min: number }> = {
  buddy_go: { base: 15, perKm: 7.5, perMin: 1.2, min: 35 },
  buddy_comfort: { base: 20, perKm: 9, perMin: 1.5, min: 45 },
  buddy_xl: { base: 28, perKm: 11, perMin: 1.8, min: 60 },
  go: { base: 15, perKm: 7.5, perMin: 1.2, min: 35 },
}

function isPeakHour() {
  const hour = new Date().getHours()
  return hour >= 16 && hour <= 19 // 4-7pm Polokwane surge like Bolt
}

export function calculateFare(distanceKm: number, durationMin: number = 10, category: string = 'buddy_go'): FareEstimate {
  const rates = CATEGORY_RATES[category] || CATEGORY_RATES.buddy_go
  const surge = isPeakHour()? 1.3 : 1.0

  let calcFare = rates.base + (distanceKm * rates.perKm) + (durationMin * rates.perMin)
  calcFare = calcFare * surge

  if (calcFare < rates.min) calcFare = rates.min
  if (calcFare > 350) calcFare = 350
  calcFare = Math.ceil(calcFare / 5) * 5 // Round to R5 like Bolt

  const bookingFee = 0
  const total = calcFare + bookingFee

  return {
    distance: distanceKm,
    distanceKm,
    duration: durationMin * 60,
    durationMin,
    fare: calcFare,
    total,
    price: calcFare,
    bookingFee,
    booking_fee: bookingFee
  };
}

// For PassengerHome compatibility
export function calculateFareForCategory(catId: string, km: number, min: number = 10) {
  return calculateFare(km, min, catId).fare
}

export default calculateFare;
export const getFare = calculateFare;
export const estimateFare = calculateFare;
export const getFareEstimate = calculateFare;