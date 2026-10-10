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

export function calculateFare(distanceKm: number, durationMin: number = 10): FareEstimate {
  // BOLT FORMULA - EXACT
  const BASE = 20; // Bolt base
  const BOOKING = 0; // Bolt includes booking in fare - no extra
  const hour = new Date().getHours()
  const isPeak = hour >= 16 && hour <= 19 // 4pm-7pm surge like Bolt Polokwane
  
  const PER_KM = isPeak ? 11 : 8.5
  const PER_MIN = 1.5

  let calcFare = BASE + (distanceKm * PER_KM) + (durationMin * PER_MIN)
  
  if (isPeak) {
    calcFare = calcFare * 1.3 // 1.3x surge
  }
  
  if (calcFare < 35) calcFare = 35 // Bolt min R35 in Polokwane
  
  calcFare = Math.round(calcFare)
  const total = calcFare + BOOKING

  return {
    distance: distanceKm,
    distanceKm,
    duration: durationMin,
    durationMin,
    fare: calcFare,
    total,
    price: calcFare,
    bookingFee: BOOKING,
    booking_fee: BOOKING
  };
}

export default calculateFare;
export const getFare = calculateFare;
export const estimateFare = calculateFare;
export const getFareEstimate = calculateFare;