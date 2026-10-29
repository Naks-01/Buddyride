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

export const COMMISSION = 0.20

export type FareCategoryRate = { base: number; perKm: number; perMin: number; min: number; max: number }
export type FareConfig = { categories: Record<string, FareCategoryRate>; commission: number }

export const DEFAULT_FARE_CONFIG: FareConfig = {
  categories: {
    buddy_go: { base: 15, perKm: 8, perMin: 0.5, min: 27, max: 350 },
    buddy_comfort: { base: 18, perKm: 10, perMin: 0.7, min: 35, max: 350 },
    buddy_xl: { base: 22, perKm: 12, perMin: 1, min: 50, max: 350 },
  },
  commission: COMMISSION,
}

export function calculateFare(
  distanceKm: number,
  durationMin: number = 5,
  category: string = 'buddy_go',
  config: FareConfig = DEFAULT_FARE_CONFIG,
): FareEstimate {
  const rates = config.categories[category] || config.categories.buddy_go

  let calcFare = rates.base + (distanceKm * rates.perKm) + (durationMin * rates.perMin)

  if (calcFare < rates.min) calcFare = rates.min
  if (calcFare > rates.max) calcFare = rates.max
  calcFare = Math.round(calcFare)

  const bookingFee = 0
  const total = calcFare

  const platformGets = Math.round(total * config.commission)
  const driverGets = total - platformGets

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
    breakdown: `Total R${total} = Driver R${driverGets} (${Math.round((1 - config.commission) * 100)}%) + Buddy R${platformGets} (${Math.round(config.commission * 100)}%)`,
    commission: config.commission
  };
}

export function calculateFareForCategory(catId: string, km: number, min: number = 5, config: FareConfig = DEFAULT_FARE_CONFIG) {
  return calculateFare(km, min, catId, config)
}

export default calculateFare;
export const getFare = calculateFare;
export const estimateFare = calculateFare;
export const getFareEstimate = calculateFare;