export type PolokwanePlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export const POLOKWANE_PLACES: PolokwanePlace[] = [
  { name: 'Seshego Circle Centre', address: 'Seshego Circle Centre, Seshego, Polokwane', lat: -23.8335, lng: 29.3886 },
  { name: 'Mall of the North', address: 'Mall of the North, Bendor, Polokwane', lat: -23.8585, lng: 29.4707 },
  { name: 'Savannah Mall', address: 'Savannah Mall, 1 Suider Street, Polokwane', lat: -23.9042, lng: 29.4485 },
  { name: 'Seshego Hospital', address: 'Seshego Hospital, Seshego, Polokwane', lat: -23.8331, lng: 29.3855 },
  { name: 'Polokwane International Airport', address: 'Polokwane International Airport, Polokwane', lat: -23.8452, lng: 29.4586 },
  { name: 'Ladanna Mall', address: 'Ladanna Mall, Ladanna, Polokwane', lat: -23.9271, lng: 29.4514 },
  { name: 'Magna Via', address: 'Magna Via, Polokwane, South Africa', lat: -23.9148, lng: 29.4518 },
  { name: 'Seshego Zone 4', address: 'Seshego Zone 4, Polokwane', lat: -23.8245, lng: 29.3923 },
  { name: 'Seshego Zone 5', address: 'Seshego Zone 5, Polokwane', lat: -23.8442, lng: 29.3972 },
  { name: 'Polokwane CBD', address: 'Polokwane CBD, Polokwane', lat: -23.9045, lng: 29.4689 },
];

export function searchPolokwanePlaces(value: string): PolokwanePlace[] {
  const search = value.trim().toLowerCase();
  if (!search) return POLOKWANE_PLACES;
  return POLOKWANE_PLACES.filter((place) => `${place.name} ${place.address}`.toLowerCase().includes(search));
}
