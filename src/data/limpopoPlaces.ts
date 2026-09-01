// Offline seed data for instant, no-network search results across Limpopo province.
// Coordinates are town/landmark-centre approximations - good enough for pickup pins and as a
// fallback when Mapbox/Photon/Nominatim are slow, rate-limited, or offline.
export type PlaceCategory = 'hospital' | 'mall' | 'taxi_rank' | 'town' | 'suburb' | 'landmark' | 'airport';

export type LimpopoPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
};

export const LIMPOPO_PLACES: LimpopoPlace[] = [
  // --- Polokwane & suburbs ---
  { name: 'Polokwane CBD', address: 'Polokwane CBD, Polokwane, Limpopo', lat: -23.9045, lng: 29.4689, category: 'town' },
  { name: 'Seshego', address: 'Seshego, Polokwane, Limpopo', lat: -23.8333, lng: 29.3833, category: 'suburb' },
  { name: 'Seshego Zone 1', address: 'Seshego Zone 1, Polokwane, Limpopo', lat: -23.8218, lng: 29.3792, category: 'suburb' },
  { name: 'Seshego Zone 4', address: 'Seshego Zone 4, Polokwane, Limpopo', lat: -23.8245, lng: 29.3923, category: 'suburb' },
  { name: 'Seshego Zone 5', address: 'Seshego Zone 5, Polokwane, Limpopo', lat: -23.8442, lng: 29.3972, category: 'suburb' },
  { name: 'Seshego Hospital', address: 'Seshego Hospital, Seshego, Polokwane', lat: -23.8331, lng: 29.3855, category: 'hospital' },
  { name: 'Polokwane Provincial Hospital', address: 'Polokwane Provincial Hospital, Polokwane, Limpopo', lat: -23.8996, lng: 29.4740, category: 'hospital' },
  { name: 'Pietersburg Hospital', address: 'Pietersburg Hospital, Polokwane, Limpopo', lat: -23.9089, lng: 29.4652, category: 'hospital' },
  { name: 'Mankweng', address: 'Mankweng, Polokwane, Limpopo', lat: -23.8833, lng: 29.6667, category: 'suburb' },
  { name: 'Mankweng Hospital', address: 'Mankweng Hospital, Mankweng, Polokwane', lat: -23.8814, lng: 29.6702, category: 'hospital' },
  { name: 'University of Limpopo (Turfloop)', address: 'University of Limpopo, Mankweng, Polokwane', lat: -23.8809, lng: 29.7397, category: 'landmark' },
  { name: 'Lebowakgomo', address: 'Lebowakgomo, Limpopo', lat: -24.2000, lng: 29.5167, category: 'town' },
  { name: 'Limpopo Mall', address: 'Limpopo Mall, Lebowakgomo, Limpopo', lat: -24.1963, lng: 29.5131, category: 'mall' },
  { name: 'Mall of the North', address: 'Mall of the North, Bendor, Polokwane', lat: -23.8585, lng: 29.4707, category: 'mall' },
  { name: 'Mall of Limpopo', address: 'Mall of Limpopo, Fauna Park, Polokwane', lat: -23.8657, lng: 29.4501, category: 'mall' },
  { name: 'Savannah Mall', address: 'Savannah Mall, Suider Street, Polokwane', lat: -23.9042, lng: 29.4485, category: 'mall' },
  { name: 'Ladanna Mall', address: 'Ladanna Mall, Ladanna, Polokwane', lat: -23.9271, lng: 29.4514, category: 'mall' },
  { name: 'Makro Polokwane', address: 'Makro, Bendor, Polokwane', lat: -23.8862, lng: 29.4568, category: 'mall' },
  { name: 'Game City Polokwane', address: 'Game City, Polokwane', lat: -23.9060, lng: 29.4610, category: 'mall' },
  { name: 'Polokwane International Airport', address: 'Polokwane International Airport, Polokwane', lat: -23.8452, lng: 29.4586, category: 'airport' },
  { name: 'Polokwane Taxi Rank', address: 'Polokwane Main Taxi Rank, Polokwane CBD', lat: -23.9017, lng: 29.4634, category: 'taxi_rank' },
  { name: 'Magna Via', address: 'Magna Via, Polokwane, Limpopo', lat: -23.9148, lng: 29.4518, category: 'landmark' },
  { name: 'Bendor', address: 'Bendor, Polokwane, Limpopo', lat: -23.8843, lng: 29.4634, category: 'suburb' },
  { name: 'Fauna Park', address: 'Fauna Park, Polokwane, Limpopo', lat: -23.8666, lng: 29.4453, category: 'suburb' },
  { name: 'Flora Park', address: 'Flora Park, Polokwane, Limpopo', lat: -23.8770, lng: 29.4444, category: 'suburb' },
  { name: 'Westenburg', address: 'Westenburg, Polokwane, Limpopo', lat: -23.9250, lng: 29.4275, category: 'suburb' },
  { name: 'Nirvana', address: 'Nirvana, Polokwane, Limpopo', lat: -23.8790, lng: 29.4930, category: 'suburb' },
  { name: 'Sterpark', address: 'Sterpark, Polokwane, Limpopo', lat: -23.8880, lng: 29.4550, category: 'suburb' },
  { name: 'Ivy Park', address: 'Ivy Park, Polokwane, Limpopo', lat: -23.9160, lng: 29.4380, category: 'suburb' },
  { name: 'Moletjie', address: 'Moletjie, Polokwane, Limpopo', lat: -23.7333, lng: 29.4000, category: 'suburb' },
  { name: 'Sebayeng', address: 'Sebayeng, Polokwane, Limpopo', lat: -23.7833, lng: 29.7333, category: 'suburb' },
  { name: 'Ga-Rankuwa (Limpopo border)', address: 'Ga-Rankuwa area, Limpopo', lat: -23.7500, lng: 29.5500, category: 'suburb' },

  // --- Waterberg district ---
  { name: 'Bela-Bela', address: 'Bela-Bela, Limpopo', lat: -24.8833, lng: 28.2833, category: 'town' },
  { name: 'Bela-Bela Hospital', address: 'Bela-Bela Hospital, Bela-Bela, Limpopo', lat: -24.8880, lng: 28.2870, category: 'hospital' },
  { name: 'Modimolle', address: 'Modimolle, Limpopo', lat: -24.7000, lng: 28.4000, category: 'town' },
  { name: 'Mookgophong (Naboomspruit)', address: 'Mookgophong, Limpopo', lat: -24.5167, lng: 28.7000, category: 'town' },
  { name: 'Vaalwater', address: 'Vaalwater, Limpopo', lat: -24.2333, lng: 28.1167, category: 'town' },
  { name: 'Lephalale', address: 'Lephalale, Limpopo', lat: -23.6667, lng: 27.7167, category: 'town' },
  { name: 'Mokopane', address: 'Mokopane, Limpopo', lat: -24.1833, lng: 29.0000, category: 'town' },
  { name: 'Mahwelereng', address: 'Mahwelereng, Mokopane, Limpopo', lat: -24.1667, lng: 28.9833, category: 'suburb' },
  { name: 'Voortrekker Mall Mokopane', address: 'Voortrekker Mall, Mokopane, Limpopo', lat: -24.1912, lng: 28.9987, category: 'mall' },
  { name: 'Mokopane Provincial Hospital', address: 'Mokopane Hospital, Mokopane, Limpopo', lat: -24.1855, lng: 29.0090, category: 'hospital' },
  { name: 'Marble Hall', address: 'Marble Hall, Limpopo', lat: -24.9667, lng: 29.2667, category: 'town' },
  { name: 'Groblersdal', address: 'Groblersdal, Limpopo', lat: -25.1667, lng: 29.4000, category: 'town' },

  // --- Capricorn district (around Polokwane) ---
  { name: 'Zebediela', address: 'Zebediela, Limpopo', lat: -24.3250, lng: 29.2833, category: 'town' },
  { name: 'Senwabarwana (Bochum)', address: 'Senwabarwana, Limpopo', lat: -23.3833, lng: 29.2667, category: 'town' },
  { name: 'Dendron (Mogwadi)', address: 'Mogwadi (Dendron), Limpopo', lat: -23.4667, lng: 29.3333, category: 'town' },
  { name: 'Chuenespoort', address: 'Chuenespoort, Limpopo', lat: -24.0333, lng: 29.6167, category: 'town' },
  { name: 'Aganang', address: 'Aganang, Limpopo', lat: -23.7167, lng: 29.6167, category: 'town' },

  // --- Mopani district (Tzaneen area) ---
  { name: 'Tzaneen', address: 'Tzaneen, Limpopo', lat: -23.8333, lng: 30.1667, category: 'town' },
  { name: 'Tzaneen Hospital', address: 'Tzaneen Hospital, Tzaneen, Limpopo', lat: -23.8296, lng: 30.1590, category: 'hospital' },
  { name: 'Tzaneen Lifestyle Centre', address: 'Tzaneen Lifestyle Centre, Tzaneen, Limpopo', lat: -23.8280, lng: 30.1640, category: 'mall' },
  { name: 'Modjadjiskloof (Duiwelskloof)', address: 'Modjadjiskloof, Limpopo', lat: -23.6833, lng: 30.1667, category: 'town' },
  { name: 'Nkowankowa', address: 'Nkowankowa, Limpopo', lat: -23.8667, lng: 30.2333, category: 'suburb' },
  { name: 'Lenyenye', address: 'Lenyenye, Limpopo', lat: -23.9167, lng: 30.2333, category: 'suburb' },
  { name: 'Giyani', address: 'Giyani, Limpopo', lat: -23.3000, lng: 30.7167, category: 'town' },
  { name: 'Giyani Hospital', address: 'Giyani Hospital, Giyani, Limpopo', lat: -23.3050, lng: 30.7210, category: 'hospital' },
  { name: 'Giyani Taxi Rank', address: 'Giyani Taxi Rank, Giyani, Limpopo', lat: -23.3020, lng: 30.7180, category: 'taxi_rank' },
  { name: 'Phalaborwa', address: 'Phalaborwa, Limpopo', lat: -23.9500, lng: 31.1500, category: 'town' },
  { name: 'Namakgale', address: 'Namakgale, Phalaborwa, Limpopo', lat: -23.9333, lng: 31.1500, category: 'suburb' },
  { name: 'Hoedspruit', address: 'Hoedspruit, Limpopo', lat: -24.3547, lng: 31.0011, category: 'town' },
  { name: 'Gravelotte', address: 'Gravelotte, Limpopo', lat: -23.9333, lng: 30.6167, category: 'town' },
  { name: 'Ba-Phalaborwa Mall', address: 'Ba-Phalaborwa Mall, Phalaborwa, Limpopo', lat: -23.9420, lng: 31.1420, category: 'mall' },

  // --- Vhembe district (Thohoyandou / Louis Trichardt area) ---
  { name: 'Thohoyandou', address: 'Thohoyandou, Limpopo', lat: -22.9500, lng: 30.4833, category: 'town' },
  { name: 'Thohoyandou Taxi Rank', address: 'Thohoyandou Taxi Rank, Thohoyandou, Limpopo', lat: -22.9483, lng: 30.4841, category: 'taxi_rank' },
  { name: 'Thulamela Mall', address: 'Thulamela Mall, Thohoyandou, Limpopo', lat: -22.9520, lng: 30.4790, category: 'mall' },
  { name: 'Univen (University of Venda)', address: 'University of Venda, Thohoyandou, Limpopo', lat: -22.9782, lng: 30.4489, category: 'landmark' },
  { name: 'Sibasa', address: 'Sibasa, Limpopo', lat: -22.9333, lng: 30.4667, category: 'suburb' },
  { name: 'Vuwani', address: 'Vuwani, Limpopo', lat: -23.0667, lng: 30.3500, category: 'town' },
  { name: 'Malamulele', address: 'Malamulele, Limpopo', lat: -23.0333, lng: 30.6667, category: 'town' },
  { name: 'Elim', address: 'Elim, Limpopo', lat: -23.1333, lng: 30.2167, category: 'town' },
  { name: 'Louis Trichardt (Makhado)', address: 'Makhado (Louis Trichardt), Limpopo', lat: -23.0500, lng: 29.9000, category: 'town' },
  { name: 'Makhado Hospital', address: 'Louis Trichardt Memorial Hospital, Makhado, Limpopo', lat: -23.0480, lng: 29.9040, category: 'hospital' },
  { name: 'Musina', address: 'Musina, Limpopo', lat: -22.3333, lng: 30.0333, category: 'town' },
  { name: 'Beitbridge Border Post', address: 'Beitbridge Border Post, Musina, Limpopo', lat: -22.2167, lng: 29.9667, category: 'landmark' },

  // --- Sekhukhune district (Burgersfort area) ---
  { name: 'Burgersfort', address: 'Burgersfort, Limpopo', lat: -24.6667, lng: 30.3333, category: 'town' },
  { name: 'Burgersfort Taxi Rank', address: 'Burgersfort Taxi Rank, Burgersfort, Limpopo', lat: -24.6690, lng: 30.3320, category: 'taxi_rank' },
  { name: 'Jane Furse', address: 'Jane Furse, Limpopo', lat: -24.6667, lng: 29.8333, category: 'town' },
  { name: 'Ohrigstad', address: 'Ohrigstad, Limpopo', lat: -24.6000, lng: 30.6000, category: 'town' },
  { name: 'Steelpoort', address: 'Steelpoort, Limpopo', lat: -24.7833, lng: 30.1833, category: 'town' },
];

export function searchLimpopoPlaces(value: string): LimpopoPlace[] {
  const search = value.trim().toLowerCase();
  if (!search) return [];
  return LIMPOPO_PLACES.filter((place) => `${place.name} ${place.address}`.toLowerCase().includes(search));
}
