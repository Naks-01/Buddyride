export const BASE_FARE = 15;
export const PER_KM_RATE = 8.5;
export const BOOKING_FEE = 3;
export const VERIFICATION_FEE = 0; // NLTA ID verification is free for now
export const TIP_OPTIONS = [5, 10, 20, 30];
export const TIP_PRESETS = [5, 10, 20];
export const RIDE_EXTRAS = {
	luggage: { label: 'Extra Luggage', fee: 20, icon: '🧳', desc: 'Large suitcase, airport' },
	pet: { label: 'Pet Friendly', fee: 30, icon: '🐶', desc: 'Small pet allowed' },
	childSeat: { label: 'Child Seat', fee: 25, icon: '👶', desc: 'Baby seat provided' },
	stop: { label: 'Extra Stop', fee: 15, icon: '📍', desc: 'Add stop along route' },
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
