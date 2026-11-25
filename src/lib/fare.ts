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
  breakdown: string;
  surgeMultiplier?: number;
};

export type FareCategoryRate = { base: number; perKm: number; perMin: number; min: number; max: number }
export type FareConfig = { categories: Record<string, FareCategoryRate> }

export const DEFAULT_FARE_CONFIG: FareConfig = {
  categories: {
    buddy_go: { base: 15, perKm: 8, perMin: 0.5, min: 27, max: 1200 },
    buddy_comfort: { base: 18, perKm: 10, perMin: 0.7, min: 35, max: 1500 },
    buddy_xl: { base: 22, perKm: 12, perMin: 1, min: 50, max: 1800 },
  },
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
  opts: { surgeMultiplier?: number } = {},
): FareEstimate {
  const normalized = normalizeCategory(category)
  const rates = config.categories[normalized] || config.categories.buddy_go

  // FIX: Clamp insane inputs - was NaN -> 0, 9999km -> R80k fare shown to passenger
  const safeKm = Number.isFinite(distanceKm) && distanceKm > 0 ? Math.min(distanceKm, 500) : 0
  const safeMin = Number.isFinite(durationMin) && durationMin > 0 ? Math.min(durationMin, 600) : 5
  // FIX: Surge clamped 1.0 - 2.0 - was no param, any future caller could pass 10x
  const surge = Number.isFinite(opts.surgeMultiplier) ? Math.min(Math.max(opts.surgeMultiplier || 1, 1), 2) : 1

  let calcFare = (rates.base + (safeKm * rates.perKm) + (safeMin * rates.perMin)) * surge

  if (calcFare < rates.min) calcFare = rates.min
  if (calcFare > rates.max) calcFare = rates.max
  calcFare = Math.round(calcFare)

  const bookingFee = 0
  const total = calcFare
  const driverGets = total

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
    surgeMultiplier: surge,
    breakdown: `Base R${rates.base} + ${safeKm.toFixed(1)}km × R${rates.perKm} + ${safeMin.toFixed(0)}min × R${rates.perMin}${surge > 1 ? ` × ${surge.toFixed(1)}x surge` : ''} = R${total}. Driver receives 100%. BuddyRide earns from driver bundles.`,
  };
}

export function calculateFareForCategory(catId: string, km: number, min: number = 5, config: FareConfig = DEFAULT_FARE_CONFIG) {
  return calculateFare(km, min, catId, config)
}

export default calculateFare;
export const getFare = calculateFare;
export const estimateFare = calculateFare;
export const getFareEstimate = calculateFare;