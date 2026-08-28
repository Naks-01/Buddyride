export const RIDE_CATEGORIES = [
  {
    id: 'go',
    name: 'Go',
    emoji: '🚗',
    maxPassengers: 2,
    base: 25,
    perKm: 6.5,
    description: 'Affordable, compact',
    popular: true,
  },
  {
    id: 'standard',
    name: 'Standard',
    emoji: '🚙',
    maxPassengers: 3,
    base: 35,
    perKm: 8,
    description: 'Everyday ride',
  },
  {
    id: 'xl',
    name: 'XL',
    emoji: '🚐',
    maxPassengers: 6,
    base: 70,
    perKm: 15,
    description: 'Groups + luggage',
  },
  {
    id: 'send',
    name: 'Send',
    emoji: '📦',
    maxPassengers: 0,
    base: 40,
    perKm: 9,
    description: 'Parcels & docs',
    isDelivery: true,
  },
] as const;

export type RideCategory = (typeof RIDE_CATEGORIES)[number];
export type RideCategoryId = RideCategory['id'];
