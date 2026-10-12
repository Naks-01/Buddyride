const mapbox_access_token = import.meta.env.VITE_MAPBOX_TOKEN as string;

export function assertMapboxConfigured() {
  if (!mapbox_access_token) {
    throw new Error("VITE_MAPBOX_TOKEN missing");
  }
}

async function fetchGeocodeRaw(query: string, extra: string = ""): Promise<any> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${extra}country=za&limit=10&types=address,poi,place,locality,neighborhood,street&fuzzyMatch=true&autocomplete=true&language=en&access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

export async function geocode(query: string): Promise<any> {
  assertMapboxConfigured();
  let cleanQuery = query.replace(/, Limpopo.*/i, "").replace(/, South Africa/i, "").trim();
  if (cleanQuery.length < 2) return { features: [] };

  // For streets, Mapbox needs "Polokwane" added if user just types street name
  const isStreetSearch =!cleanQuery.toLowerCase().includes("mall") &&!cleanQuery.toLowerCase().includes("seshego") && cleanQuery.split(" ").length <= 3;

  let allFeatures: any[] = [];

  // 1. Main search - Greater Polokwane
  let data = await fetchGeocodeRaw(cleanQuery, "proximity=29.4589,-23.9045&bbox=28.8,-24.6,30.2,-22.9&");
  if (data?.features) allFeatures = [...allFeatures,...data.features];

  // 2. If it looks like a street name, search again with "Street" + Polokwane
  if (isStreetSearch && allFeatures.length < 3) {
    let data2 = await fetchGeocodeRaw(cleanQuery + " Street Polokwane", "proximity=29.4589,-23.9045&bbox=28.8,-24.6,30.2,-22.9&");
    if (data2?.features) allFeatures = [...allFeatures,...data2.features];
  }

  // 3. Wide search no bbox
  if (allFeatures.length < 2) {
    let data3 = await fetchGeocodeRaw(cleanQuery, "proximity=29.4589,-23.9045&");
    if (data3?.features) allFeatures = [...allFeatures,...data3.features];
  }

  // 4. Add Polokwane word
  if (allFeatures.length === 0 &&!cleanQuery.toLowerCase().includes("polokwane")) {
    let data4 = await fetchGeocodeRaw(cleanQuery + " Polokwane", "proximity=29.4589,-23.9045&");
    if (data4?.features) allFeatures = [...allFeatures,...data4.features];
  }

  // Remove duplicates
  const unique = Array.from(new Map(allFeatures.map((f:any) => [f.id, f])).values());

  return { features: unique.slice(0, 10) }
}

export async function geocodeCoords(query: string): Promise<[number, number] | null> {
  const data = await geocode(query)
  if (!data?.features?.length) return null
  return data.features[0].center || data.features[0].geometry?.coordinates || null
}

export async function searchPlaces(query: string): Promise<any[]> {
  assertMapboxConfigured();
  const cleanQuery = query.replace(/, Limpopo.*/i, "").replace(/, South Africa/i, "").trim();
  const data = await geocode(cleanQuery);
  return data?.features || [];
}

export async function reverseGeocode(lng: number | [number, number], lat?: number): Promise<string> {
  assertMapboxConfigured();
  let lngVal: number, latVal: number;
  if (Array.isArray(lng)) {
    lngVal = lng[0];
    latVal = lng[1];
  } else {
    lngVal = lng;
    latVal = lat!;
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lngVal},${latVal}.json?access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) return `${latVal.toFixed(5)}, ${lngVal.toFixed(5)}`;
  const data = await res.json();
  return data.features?.[0]?.place_name || `${latVal.toFixed(5)}, ${lngVal.toFixed(5)}`;
}

export async function getRoute(from: [number, number], to: [number, number]) {
  assertMapboxConfigured();
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&steps=true&banner_instructions=true&voice_instructions=true&access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Route failed");
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("No route");
  return {
    geometry: route.geometry,
    distance: route.distance,
    duration: route.duration,
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    legs: route.legs,
    route: route
  };
}

export const getRouteBetween = getRoute;