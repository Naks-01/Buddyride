const mapbox_access_token = import.meta.env.VITE_MAPBOX_TOKEN as string;

export function assertMapboxConfigured() {
  if (!mapbox_access_token) {
    throw new Error("VITE_MAPBOX_TOKEN missing");
  }
}

async function fetchMapboxSearchBox(query: string): Promise<any> {
  try {
    const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(query)}&proximity=29.4589,-23.9045&bbox=28.8,-24.6,30.2,-22.9&country=ZA&language=en&limit=6&types=address,street,poi,place&access_token=${mapbox_access_token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const features = [];
    for (const s of (data.suggestions || []).slice(0, 3)) {
      try {
        const detUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${s.mapbox_id}?session_token=${s.mapbox_id}&access_token=${mapbox_access_token}`;
        const detRes = await fetch(detUrl);
        const det = await detRes.json();
        if (det.features?.[0]) {
          const f = det.features[0];
          features.push({
            id: f.id,
            text: f.properties?.name || s.name,
            place_name: f.properties?.full_address || s.full_address || s.name,
            center: f.geometry.coordinates,
            geometry: f.geometry
          });
        }
      } catch {}
    }
    return { features };
  } catch { return null; }
}

async function fetchGeocodeRaw(query: string, extra: string = ""): Promise<any> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${extra}country=za&limit=8&types=address,poi,place,locality,neighborhood,street&fuzzyMatch=true&autocomplete=true&language=en&access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

async function fetchOSM(query: string): Promise<any> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Polokwane')}&format=json&countrycodes=za&limit=4&viewbox=28.8,-24.6,30.2,-22.9&bounded=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const features = data.map((d: any) => ({
      id: `osm_${d.place_id}`,
      text: d.display_name.split(',')[0],
      place_name: d.display_name,
      center: [parseFloat(d.lon), parseFloat(d.lat)],
      geometry: { coordinates: [parseFloat(d.lon), parseFloat(d.lat)] }
    }));
    return { features };
  } catch { return null; }
}

export async function geocode(query: string): Promise<any> {
  assertMapboxConfigured();
  let cleanQuery = query.replace(/, Limpopo.*/i, "").replace(/, South Africa/i, "").trim();
  if (cleanQuery.length < 2) return { features: [] };
  let allFeatures: any[] = [];
  const sb = await fetchMapboxSearchBox(cleanQuery);
  if (sb?.features?.length) allFeatures = [...allFeatures,...sb.features];
  if (allFeatures.length < 3) {
    const data = await fetchGeocodeRaw(cleanQuery, "proximity=29.4589,-23.9045&bbox=28.8,-24.6,30.2,-22.9&");
    if (data?.features) allFeatures = [...allFeatures,...data.features];
  }
  if (allFeatures.length < 2) {
    const osm = await fetchOSM(cleanQuery);
    if (osm?.features) allFeatures = [...allFeatures,...osm.features];
  }
  const unique = Array.from(new Map(allFeatures.map((f: any) => [f.place_name, f])).values());
  return { features: unique.slice(0, 8) };
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
  if (Array.isArray(lng)) { lngVal = lng[0]; latVal = lng[1]; } else { lngVal = lng; latVal = lat!; }
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
    steps: route.legs?.[0]?.steps || [],
    route: route
  };
}

export const getRouteBetween = getRoute;