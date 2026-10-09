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
  const BASE = 15;
  const PER_KM = 6.5;
  const PER_MIN = 0.5;
  const BOOKING = 5;

  let calcFare = BASE + distanceKm * PER_KM + durationMin * PER_MIN;
  if (calcFare < 35) calcFare = 35;
  calcFare = Math.round(calcFare);
  const total = calcFare + BOOKING;

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