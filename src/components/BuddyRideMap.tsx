import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { ArrowLeft, ChevronDown, Compass, Flag, Minus, MoreHorizontal, Navigation, Pause, Plus, Share2, Volume2 } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAP_CENTER: [number, number] = [29.4587, -23.9045];
const FROM: [number, number] = [29.389, -23.854];
const TO: [number, number] = [29.466, -23.904];
const MAP_STYLE = 'mapbox://styles/mapbox/navigation-night-v1';
const token = import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN;

type RouteGeometry = GeoJSON.LineString;

function addRouteLayer(map: mapboxgl.Map, geometry: RouteGeometry) {
  const sourceId = 'buddyride-route';
  const glowId = 'buddyride-route-glow';
  const routeId = 'buddyride-route-line';
  const source: mapboxgl.GeoJSONSource = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
  const data: GeoJSON.Feature<GeoJSON.LineString> = { type: 'Feature', properties: {}, geometry };

  if (source) {
    source.setData(data);
    return;
  }

  map.addSource(sourceId, { type: 'geojson', data });
  map.addLayer({ id: glowId, type: 'line', source: sourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
    'line-color': '#4A6CFF',
    'line-width': 14,
    'line-opacity': 0.25,
    'line-blur': 6,
  } });
  map.addLayer({ id: routeId, type: 'line', source: sourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
    'line-color': '#6C8BFF',
    'line-width': 6,
    'line-opacity': 1,
  } });
}

function addBuildingsLayer(map: mapboxgl.Map) {
  const layers = map.getStyle().layers || [];
  const labelLayer = layers.find((layer) => layer.type === 'symbol' && (layer.layout as Record<string, unknown> | undefined)?.['text-field']);
  if (map.getLayer('buddyride-3d-buildings')) return;
  map.addLayer({
    id: 'buddyride-3d-buildings',
    source: 'composite',
    'source-layer': 'building',
    filter: ['==', 'extrude', 'true'],
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': '#182234',
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'min_height'],
      'fill-extrusion-opacity': 0.72,
    },
  }, labelLayer?.id);
}

export function BuddyRideMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapError, setMapError] = useState('');
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !token) {
      setMapError('Add NEXT_PUBLIC_MAPBOX_TOKEN to load navigation.');
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: MAP_CENTER,
      zoom: 14.8,
      pitch: 60,
      bearing: -12,
      attributionControl: false,
    });
    mapRef.current = map;

    const loadNavigation = async () => {
      try {
        addBuildingsLayer(map);
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${FROM.join(',')};${TO.join(',')}?geometries=geojson&overview=full&access_token=${token}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Directions request failed');
        const data = await response.json() as { routes?: Array<{ geometry?: RouteGeometry }> };
        const geometry = data.routes?.[0]?.geometry;
        if (!geometry) throw new Error('No route returned');
        addRouteLayer(map, geometry);
      } catch {
        setMapError('Route preview unavailable. Check your Mapbox token.');
      }
    };

    map.once('load', loadNavigation);
    map.on('error', (event: { error?: Error }) => {
      if (event.error?.message?.toLowerCase().includes('token')) setMapError('Check your Mapbox token.');
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const zoom = (delta: number) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + delta, duration: 250 });
  const resetBearing = () => mapRef.current?.easeTo({ bearing: -12, pitch: 60, duration: 450 });

  return (
    <main className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden bg-[#101722] text-white">
      <div ref={containerRef} className="absolute inset-0" aria-label="BuddyRide Mapbox navigation map" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.48),transparent_27%,transparent_62%,rgba(0,0,0,.32))]" />
      {mapError && <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 rounded-xl bg-black/80 px-4 py-3 text-center text-sm text-white shadow-xl">{mapError}</div>}

      <header className="absolute left-3 right-3 top-3 z-10 rounded-2xl bg-black/95 px-4 py-4 shadow-2xl sm:left-6 sm:right-6 sm:top-5 sm:px-5">
        <div className="flex items-start gap-3">
          <button className="mt-0.5 rounded-full p-1 text-white" aria-label="Go back"><ArrowLeft size={21} /></button>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-5 sm:text-base">In 400 m, take the exit towards R37 / Polokwane CBD</p>
            <p className="mt-1 text-xs text-white/60 sm:text-sm">4.3 km · Continue for 3.2 km</p>
          </div>
          <button className="rounded-full p-1 text-white/60" aria-label="More directions"><MoreHorizontal size={21} /></button>
        </div>
      </header>

      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 sm:right-6">
        <button onClick={resetBearing} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1c2028] text-white shadow-lg" aria-label="Reset compass"><Compass size={19} /></button>
        <button onClick={() => zoom(1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1c2028] text-white shadow-lg" aria-label="Zoom in"><Plus size={19} /></button>
        <button onClick={() => zoom(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1c2028] text-white shadow-lg" aria-label="Zoom out"><Minus size={19} /></button>
      </div>

      <section className="absolute bottom-3 left-3 right-3 z-10 rounded-2xl bg-white p-4 text-[#11151c] shadow-2xl sm:bottom-5 sm:left-6 sm:right-6 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-3xl font-bold tracking-tight">15 min</p><p className="mt-1 text-sm text-[#606671]">Arrive ~13:39</p></div>
          <div className="text-right"><p className="text-xl font-semibold">12 km</p><p className="mt-1 text-sm text-[#606671]">Polokwane CBD</p></div>
        </div>
        <div className="my-4 h-px bg-[#e5e7eb]" />
        <div className="flex gap-2">
          <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f0f2f5] py-3 text-sm font-semibold"><Flag size={16} /> Report</button>
          <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f0f2f5] py-3 text-sm font-semibold"><Pause size={16} /> Pause</button>
        </div>
        <div className="mt-4 flex items-center justify-between px-1 text-xs font-medium text-[#606671]">
          <button onClick={() => setMuted(!muted)} className="flex items-center gap-1.5" aria-label={muted ? 'Unmute' : 'Mute'}><Volume2 size={16} /> {muted ? 'Unmute' : 'Mute'}</button>
          <button className="flex items-center gap-1.5"><Navigation size={15} /> Details <ChevronDown size={14} /></button>
          <button className="flex items-center gap-1.5"><Share2 size={15} /> Share</button>
        </div>
      </section>
    </main>
  );
}

export default BuddyRideMap;