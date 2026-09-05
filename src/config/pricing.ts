export const BASE_FARE = 15;
export const PER_KM_RATE = 8.5;
export const BOOKING_FEE = 3;
// OSRM distance/duration-based category pricing: basePrice = FLAT_START + km*PER_KM + min*PER_MIN + FLAT_FEE.
export const CATEGORY_FLAT_START = 20;
export const CATEGORY_PER_KM = 8.5;
export const CATEGORY_PER_MIN = 1.2;
export const CATEGORY_FLAT_FEE = 5;
export const VERIFICATION_FEE = 0; // NLTA ID verification is free for now
export const TIP_OPTIONS = [5, 10, 20, 30];
export const TIP_PRESETS = [5, 10, 20];
export const RIDE_EXTRAS = {
	luggage: { label: 'Extra Luggage', fee: 15, icon: '🧳', desc: 'Large suitcase, airport' },
	extraStop: { label: 'Extra Stop', fee: 20, icon: '📍', desc: 'Add stop along route' },
} as const;
export const COMMISSION_RATE = 0.20;
export const DRIVER_RATE = 0.80;
export const CANCELLATION = {
	FREE_CANCEL_SEC: 120,
	LATE_CANCEL_FEE: 20,
	NO_SHOW_FEE: 20,
	DRIVER_WAIT_MIN: 7,
	COMMISSION_ON_CANCEL: true,
};
