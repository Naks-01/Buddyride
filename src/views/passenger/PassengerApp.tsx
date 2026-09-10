import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { auth, db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';

type LocationPoint = {
  lat: number;
  lng: number;
  address?: string;
};

type SearchResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
};

type RideCategory = {
  name: string;
  base: number;
  perKm: number;
  desc: string;
  price: number;
};

const DEFAULT_CENTER: [number, number] = [-23.9045, 29.4689];
const NOMINATIM_HEADERS = { Accept: 'application/json' };

const markerIcon = (color: string, label: string) =>
  L.divIcon({
    className: '',
    html: `<div style="background:${color};width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.35)"><span style="transform:rotate(45deg);color:white;font-weight:800;font-size:16px">${label}</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });

const pickupIcon = markerIcon('#2563eb', 'A');
const destinationIcon = markerIcon('#f97316', 'B');

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: ({ latlng }) => onClick(latlng.lat, latlng.lng) });
  return null;
}

function MapCenter({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(center, Math.max(map.getZoom(), 14));
  }, [center, map]);

  return null;
}

export default function PassengerApp() {
  const { profile } = useAuth();
  const user = auth.currentUser;
  const mapRef = useRef<L.Map | null>(null);
  const [pickup, setPickup] = useState<LocationPoint | null>(null);
  const [destination, setDestination] = useState<LocationPoint | null>(null);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<RideCategory | null>(null);
  const [searching, setSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const distanceKm = useMemo(() => {
    if (!pickup || !destination) return 0;
    return L.latLng(pickup.lat, pickup.lng).distanceTo(L.latLng(destination.lat, destination.lng)) / 1000;
  }, [destination, pickup]);

  const categories = useMemo<RideCategory[]>(() => {
    if (!pickup || !destination) return [];
    return [
      { name: '214 Shared', base: 15, perKm: 8, desc: 'Cheapest, shared' },
      { name: '214 Direct', base: 20, perKm: 12, desc: 'Fast, direct' },
      { name: '214 XL', base: 30, perKm: 15, desc: 'Big, luggage' },
    ].map((category) => ({
      ...category,
      price: Math.max(25, Math.round(category.base + distanceKm * category.perKm)),
    }));
  }, [destination, distanceKm, pickup]);

  useEffect(() => {
    if (!pickup || !destination) {
      setSelectedCategory(null);
      return;
    }
    setSelectedCategory((current) => categories.find((category) => category.name === current?.name) ?? categories[0] ?? null);
  }, [categories, destination, pickup]);

  useEffect(() => {
    if (query.trim().length <= 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({
          format: 'json',
          q: query.trim(),
          limit: '5',
          countrycodes: 'za',
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          headers: NOMINATIM_HEADERS,
          signal: controller.signal,
        });
        if (response.ok) setResults((await response.json()) as SearchResult[]);
      } catch (error) {
        if ((error as DOMException).name !== 'AbortError') console.error('Place search failed:', error);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const setMapPoint = (lat: number, lng: number) => {
    const point = { lat, lng, address: 'Map pin' };
    if (!pickup) setPickup(point);
    else setDestination(point);
    setCenter([lat, lng]);
  };

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      window.alert('GPS not supported');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
          const data = (await response.json()) as { display_name?: string };
          const address = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setPickup({ lat, lng, address });
          setQuery(address);
          setResults([]);
        } catch {
          setPickup({ lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
        }
        setCenter([lat, lng]);
        mapRef.current?.setView([lat, lng], 16);
        setIsLocating(false);
      },
      (err) => {
        window.alert(err.message);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const selectSearchResult = (result: SearchResult) => {
    const point = { lat: parseFloat(result.lat), lng: parseFloat(result.lon), address: result.display_name };
    setDestination(point);
    setQuery(result.display_name);
    setResults([]);
    setCenter([point.lat, point.lng]);
  };

  const requestRide = async () => {
    if (!pickup || !destination || !selectedCategory) return;
    setRequesting(true);
    try {
      await addDoc(collection(db, 'rides'), {
        passengerId: (profile as any)?.id || (profile as any)?.uid || user?.uid || 'guest',
        pickup,
        destination,
        category: selectedCategory,
        fare: selectedCategory.price,
        distanceKm,
        status: 'requested',
        createdAt: serverTimestamp(),
      });
      window.alert('Ride requested successfully.');
      setPickup(null);
      setDestination(null);
      setQuery('');
      setSelectedCategory(null);
      setCenter(DEFAULT_CENTER);
    } catch (error) {
      console.error('Ride request failed:', error);
      window.alert('Unable to request your ride. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-slate-100">
      <div className="absolute inset-0 z-0">
        <MapContainer ref={mapRef} center={DEFAULT_CENTER} zoom={13} zoomControl={false} className="h-full w-full">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
            maxZoom={19}
          />
          <MapCenter center={center} />
          <MapClickHandler onClick={setMapPoint} />
          {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />}
          {destination && <Marker position={[destination.lat, destination.lng]} icon={destinationIcon} />}
        </MapContainer>
      </div>

      <section className="absolute left-4 right-4 top-4 z-[1000] space-y-3">
        <div onClick={handleUseCurrentLocation} className="cursor-pointer rounded-xl bg-white px-4 py-3 font-semibold text-slate-800 shadow-lg">
          {isLocating ? '📍 Locating...' : '📍 Current location'}
        </div>
        <div className="relative">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Where to? e.g. Seshego Mall"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-slate-900 shadow-lg outline-none focus:border-orange-500"
          />
          {(searching || results.length > 0) && (
            <div className="absolute left-0 right-0 top-full z-[5000] mt-1 max-h-60 overflow-y-auto rounded-xl bg-white shadow-xl">
              {searching && <div className="px-4 py-3 text-sm text-slate-500">Searching...</div>}
              {results.map((result) => (
                <button key={result.place_id} type="button" onClick={() => selectSearchResult(result)} className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm text-slate-700 last:border-0 hover:bg-orange-50">
                  {result.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="absolute bottom-0 left-0 right-0 z-[1000] max-h-[57vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Your route</p>
            <p className="mt-1 text-sm text-slate-700">{pickup?.address ?? 'Choose a pickup on the map'}{destination ? ` to ${destination.address}` : ''}</p>
          </div>
          {pickup && destination && <span className="text-sm font-semibold text-slate-500">{distanceKm.toFixed(1)} km</span>}
        </div>

        {pickup && destination && (
          <>
            <div className="space-y-3">
              {categories.map((category) => (
                <button key={category.name} type="button" onClick={() => setSelectedCategory(category)} className={`flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left transition ${selectedCategory?.name === category.name ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'}`}>
                  <span><strong className="block text-slate-900">{category.name}</strong><span className="text-sm text-slate-500">{category.desc}</span></span>
                  <span className="text-right"><strong className="block text-lg text-slate-900">R{category.price}</strong><span className="text-xs text-slate-500">{Math.round(3 + distanceKm * 2)} min</span></span>
                </button>
              ))}
            </div>
            {selectedCategory && <p className="mt-4 text-center text-sm text-slate-500">{selectedCategory.name}: R{selectedCategory.price} · ETA {Math.round(3 + distanceKm * 2)} min</p>}
            {selectedCategory && <button type="button" onClick={requestRide} disabled={requesting} className="mt-4 w-full rounded-2xl bg-orange-500 px-4 py-4 font-bold text-white shadow-lg hover:bg-orange-600 disabled:opacity-60">{requesting ? 'Requesting...' : `Request ${selectedCategory.name} - R${selectedCategory.price}`}</button>}
          </>
        )}
      </section>
    </main>
  );
}
