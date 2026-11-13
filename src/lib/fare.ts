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
    buddy_go: { base: 15, perKm: 8, perMin: 0.5, min: 27, max: 1200 },
    buddy_comfort: { base: 18, perKm: 10, perMin: 0.7, min: 35, max: 1500 },
    buddy_xl: { base: 22, perKm: 12, perMin: 1, min: 50, max: 1800 },
  },
  commission: COMMISSION,
}

function normalizeCategory(category: string): string {
  const c = String(category || 'buddy_go').toLowerCase().trim().replace(/[\s-]+/g, '_')
  if (c === 'go' || c === 'buddygo') return 'buddy_go'
  if (c === 'comfort' || c === 'buddycomfort') return 'buddy_comfort'
  if (c === 'xl' || c === 'buddyxl' || c === 'buddy_xl') return 'buddy_xl'
  return c
}

export function calculateFare(
  distanceKm: number,
  durationMin: number = 5,
  category: string = 'buddy_go',
  config: FareConfig = DEFAULT_FARE_CONFIG,
): FareEstimate {
  const normalized = normalizeCategory(category)
  const rates = config.categories[normalized] || config.categories.buddy_go

  const safeKm = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0
  const safeMin = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 5

  let calcFare = rates.base + (safeKm * rates.perKm) + (safeMin * rates.perMin)

  if (calcFare < rates.min) calcFare = rates.min
  if (calcFare > rates.max) calcFare = rates.max
  calcFare = Math.round(calcFare)

  const bookingFee = 0
  const total = calcFare

  // FIXED: Round platform first, driver = total - platform, so they always sum to total (no R1 mismatch)
  const platformGets = Math.round(total * config.commission)
  const driverGets = total - platformGets

  return {
    distance: safeKm,
    distanceKm: safeKm,
    duration: safeMin * 60,
    durationMin: safeMin,
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