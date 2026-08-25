import { useEffect, useRef, useState } from 'react';
import { Autocomplete, GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, type DocumentData } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { CarIcon, LogOutIcon } from '../../components/Icons';
import { TripReceipt } from '../../components/TripReceipt';

const ACTIVE_TRIP_STATUSES = ['requested', 'accepted', 'driver_arrived', 'in_progress'];
const STATUS_BANNER: Record<string, string> = {
  requested: 'Looking for a driver...',
  accepted: 'Driver is on the way',
  driver_arrived: 'Driver has arrived',
  in_progress: 'On trip to destination',
};
const DEFAULT_CENTER = { lat: -23.9045, lng: 29.4689 };
const MAP_HEIGHT = '500px';
const GOOGLE_MAPS_LIBRARIES: ('places' | 'marker')[] = ['places', 'marker'];

function GoogleMapsBillingHelp() {
  return (
    <button
      type="button"
      onClick={() => window.open('https://console.cloud.google.com/billing', '_blank', 'noopener,noreferrer')}
      className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700"
    >
      Check Billing
    </button>
  );
}

export function PassengerDashboard() {
  const { profile } = useAuth();
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
  const hasGoogleMapsApiKey = googleMapsApiKey.length > 0;
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: hasGoogleMapsApiKey ? googleMapsApiKey : 'missing-key',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const pickupAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const dropoffAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [rideId, setRideId] = useState<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupPlaceId, setPickupPlaceId] = useState<string | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffPlaceId, setDropoffPlaceId] = useState<string | null>(null);
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [tripPickupLocation, setTripPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [tripDropoffLocation, setTripDropoffLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [tripDistanceKm, setTripDistanceKm] = useState<number | null>(null);
  const [driverPhone, setDriverPhone] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [rated, setRated] = useState(false);
  const [distance, setDistance] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [estimatedFare, setEstimatedFare] = useState<number>(0);
  const [googleMapsError, setGoogleMapsError] = useState<string | null>(null);
  const [pricing, setPricing] = useState({ baseFare: 20, perKm: 8 });

  // Live pricing set by the admin in Settings - Pricing.
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'pricing'), (snapshot) => {
      const data = snapshot.data();
      if (data) {
        setPricing({
          baseFare: Number(data.baseFare ?? 20),
          perKm: Number(data.perKm ?? 8),
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loadError) return;

    try {
      throw loadError;
    } catch (error) {
      const exactError = error instanceof Error ? error.message : String(error);
      console.error('Google Maps load error:', error);
      setGoogleMapsError(exactError);
    }
  }, [loadError]);

  useEffect(() => {
    const windowWithMapsAuth = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = windowWithMapsAuth.gm_authFailure;
    windowWithMapsAuth.gm_authFailure = () => {
      const exactError = 'Enable billing: console.cloud.google.com/billing';
      console.error('Google Maps error code: gm_authFailure');
      setGoogleMapsError(exactError);
      previousAuthFailure?.();
    };

    return () => {
      windowWithMapsAuth.gm_authFailure = previousAuthFailure;
    };
  }, []);

  const reverseGeocode = (location: { lat: number; lng: number }, setAddress: (value: string) => void) => {
    const google = (window as any).google;
    if (!google?.maps?.Geocoder) {
      setTimeout(() => reverseGeocode(location, setAddress), 500);
      return;
    }
    new google.maps.Geocoder().geocode({ location }, (results: any, status: string) => {
      setAddress(status === 'OK' && results?.[0] ? results[0].formatted_address : `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`);
    });
  };

  // Reverse-geocode each pin so its address shows in the text box above the map.
  useEffect(() => {
    if (pickupLocation) reverseGeocode(pickupLocation, setPickupAddress);
    else setPickupAddress('');
  }, [pickupLocation]);

  useEffect(() => {
    if (dropoffLocation) reverseGeocode(dropoffLocation, setDropoffAddress);
    else setDropoffAddress('');
  }, [dropoffLocation]);

  const calculateFare = () => {
    if (!pickupLocation || !dropoffLocation) return;

    const google = (window as any).google;
    if (!google?.maps?.DirectionsService) {
      setTimeout(calculateFare, 500);
      return;
    }

    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: pickupLocation,
        destination: dropoffLocation,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result: any, status: string) => {
        if (status !== 'OK') return;

        const leg = result?.routes?.[0]?.legs?.[0];
        if (!leg) return;

        const km = leg.distance.value / 1000;
        const fareEstimate = Math.round(pricing.baseFare + km * pricing.perKm);
        setDistance(leg.distance.text);
        setDistanceKm(km);
        setEstimatedFare(fareEstimate);
      }
    );
  };

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng || rideId) return;
    const point = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    if (!pickupLocation) setPickupLocation(point);
    else if (!dropoffLocation) setDropoffLocation(point);
  };

  const handlePickupDragEnd = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    setPickupLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    setPickupPlaceId(null);
  };

  const handleDropoffDragEnd = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    setDropoffLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    setDropoffPlaceId(null);
  };

  const focusMapOnSelection = (location: { lat: number; lng: number }) => {
    const map = mapRef.current;
    if (!map) return;

    map.panTo(location);
    map.setZoom(17);
  };

  const onPickupPlaceChanged = () => {
    const place = pickupAutocompleteRef.current?.getPlace();
    const location = place?.geometry?.location;
    if (!location) return;

    const nextLocation = { lat: location.lat(), lng: location.lng() };
    setPickupAddress(place?.formatted_address ?? place?.name ?? '');
    setPickupLocation(nextLocation);
    setPickupPlaceId(place.place_id ?? null);
    focusMapOnSelection(nextLocation);
  };

  const onDropoffPlaceChanged = () => {
    const place = dropoffAutocompleteRef.current?.getPlace();
    const location = place?.geometry?.location;
    if (!location) return;

    const nextLocation = { lat: location.lat(), lng: location.lng() };
    setDropoffAddress(place?.formatted_address ?? place?.name ?? '');
    setDropoffLocation(nextLocation);
    setDropoffPlaceId(place.place_id ?? null);
    focusMapOnSelection(nextLocation);
  };

  const getCurrentPosition = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });

  const useCurrentLocation = async () => {
    setLocating(true);
    setMessage('');
    try {
      const position = await getCurrentPosition();
      const location = { lat: position.coords.latitude, lng: position.coords.longitude };
      setPickupLocation(location);
      setPickupPlaceId(null);
      reverseGeocode(location, setPickupAddress);
    } catch (err) {
      console.error(err);
      setMessage(
        err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED
          ? 'Please allow location access'
          : 'Unable to access your location. Please enable location permissions and try again.'
      );
    } finally {
      setLocating(false);
    }
  };

  const resetPins = () => {
    setPickupLocation(null);
    setDropoffLocation(null);
  };

  const requestRide = async () => {
    if (!pickupLocation || !dropoffLocation) {
      setMessage('Drop both a pickup (A) and dropoff (B) pin on the map.');
      return;
    }
    setRequesting(true);
    setMessage('');
    try {
      const rideRef = await addDoc(collection(db, 'rides'), {
        pickup: pickupAddress || 'Polokwane Airport',
        dropoff: dropoffAddress || '27 Zune St, Magna Via, 0700, South Africa',
        pickupLatLng: { lat: pickupLocation.lat, lng: pickupLocation.lng },
        dropoffLatLng: { lat: dropoffLocation.lat, lng: dropoffLocation.lng },
        distance: distance || `${(distanceKm ?? 0).toFixed(1)} km`,
        price: estimatedFare,
        status: 'searching',
        passengerId: profile?.id ?? 'test123',
        pickupPlaceId: pickupPlaceId ?? null,
        dropoffPlaceId: dropoffPlaceId ?? null,
        createdAt: serverTimestamp(),
      });

      setRideId(rideRef.id);
      setRideStatus('searching');
      setDriverLocation(null);
      setTripPickupLocation({ lat: pickupLocation.lat, lng: pickupLocation.lng });
      setTripDropoffLocation({ lat: dropoffLocation.lat, lng: dropoffLocation.lng });
      setTripDistanceKm(distanceKm);
      setDriverPhone(null);
      setFare(null);
      setRated(false);
      setMessage('Ride requested! Looking for driver...');
    } catch (err) {
      console.error(err);
      setMessage('Failed to request a ride. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  // Recompute the fare estimate whenever both pins are set.
  useEffect(() => {
    if (pickupLocation && dropoffLocation) {
      calculateFare();
    } else {
      setDistance('');
      setDistanceKm(null);
      setEstimatedFare(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupLocation, dropoffLocation]);

  // Follow the requested ride's status and the driver's live location once accepted.
  useEffect(() => {
    if (!rideId) return;
    const unsubscribe = onSnapshot(doc(db, 'rides', rideId), (snapshot) => {
      const data = snapshot.data() as DocumentData | undefined;
      if (!data) return;

      const nextStatus = typeof data.status === 'string' ? data.status : null;
      setRideStatus(nextStatus);

      if (nextStatus === 'accepted') {
        const acceptedDriverName = typeof data.driverName === 'string' ? data.driverName : 'Driver';
        setDriverName(acceptedDriverName);
        setMessage(`Driver on the way! ${acceptedDriverName} is heading to you.`);
      }

      const pickupLatLng = data.pickupLatLng ?? data.pickup ?? null;
      const dropoffLatLng = data.dropoffLatLng ?? data.destination ?? null;

      if (pickupLatLng && typeof pickupLatLng.lat === 'number' && typeof pickupLatLng.lng === 'number') {
        setTripPickupLocation({ lat: pickupLatLng.lat, lng: pickupLatLng.lng });
      }
      if (dropoffLatLng && typeof dropoffLatLng.lat === 'number' && typeof dropoffLatLng.lng === 'number') {
        setTripDropoffLocation({ lat: dropoffLatLng.lat, lng: dropoffLatLng.lng });
      }

      if (typeof data.driverLocation?.lat === 'number' && typeof data.driverLocation?.lng === 'number') {
        setDriverLocation({ lat: data.driverLocation.lat, lng: data.driverLocation.lng });
      }
      if (typeof data.driverPhone === 'string') {
        setDriverPhone(data.driverPhone);
      } else if (data.driverPhone == null) {
        setDriverPhone(null);
      }
      if (typeof data.driverName === 'string') {
        setDriverName(data.driverName);
      }
      if (typeof data.price === 'number') {
        setFare(data.price);
      }
      if (typeof data.distance === 'string') {
        setDistance(data.distance);
        const parsed = Number.parseFloat(data.distance);
        setDistanceKm(Number.isFinite(parsed) ? parsed : null);
      }
    });
    return () => unsubscribe();
  }, [rideId]);

  const isCompleted = rideStatus === 'completed';
  const isActiveTrip = rideStatus != null && ACTIVE_TRIP_STATUSES.includes(rideStatus);

  // Center the live map over every known point: pickup, dropoff, and the driver (once assigned).
  const knownPoints = [tripPickupLocation, tripDropoffLocation, driverLocation].filter(
    (point): point is { lat: number; lng: number } => point != null
  );
  const liveMapCenter =
    knownPoints.length > 0
      ? {
          lat: knownPoints.reduce((sum, p) => sum + p.lat, 0) / knownPoints.length,
          lng: knownPoints.reduce((sum, p) => sum + p.lng, 0) / knownPoints.length,
        }
      : DEFAULT_CENTER;

  // Center the pin-drop map over the pins the passenger has placed so far.
  const pinPoints = [pickupLocation, dropoffLocation].filter(
    (point): point is { lat: number; lng: number } => point != null
  );
  const pinMapCenter =
    pinPoints.length > 0
      ? {
          lat: pinPoints.reduce((sum, p) => sum + p.lat, 0) / pinPoints.length,
          lng: pinPoints.reduce((sum, p) => sum + p.lng, 0) / pinPoints.length,
        }
      : DEFAULT_CENTER;

  const getPolokwaneAutocompleteOptions = (): google.maps.places.AutocompleteOptions | undefined => {
    const google = (window as any).google;
    if (!google?.maps?.LatLngBounds) return undefined;

    const polokwaneBounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(-24.1, 29.3),
      new google.maps.LatLng(-23.8, 29.6)
    );

    return {
      componentRestrictions: { country: 'za' },
      bounds: polokwaneBounds,
      strictBounds: true,
      types: ['address'],
      fields: ['geometry', 'formatted_address', 'place_id', 'name'],
    };
  };

  const mapsError = !hasGoogleMapsApiKey
    ? 'VITE_GOOGLE_MAPS_API_KEY missing in .env file'
    : googleMapsError ?? (loadError ? loadError.message : null);
  const mapsAvailable = hasGoogleMapsApiKey && isLoaded && !mapsError;

  const logout = async () => { await auth.signOut(); window.location.href = '/'; };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-orange-500">BuddyRide1 - Passenger</h1>
        <button onClick={() => void logout()} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <LogOutIcon size={20} /> Logout
        </button>
      </header>

      <main className="flex-1 flex flex-col">
        <div className="p-4 max-w-2xl w-full mx-auto">
          {!hasGoogleMapsApiKey && (
            <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>VITE_GOOGLE_MAPS_API_KEY missing in .env file</p>
              <GoogleMapsBillingHelp />
            </div>
          )}
          {hasGoogleMapsApiKey && mapsError && (
            <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>Map failed to load. Common fix: Enable billing at console.cloud.google.com/billing</p>
              <p className="mt-1 break-words font-mono text-xs">{mapsError}</p>
              <GoogleMapsBillingHelp />
            </div>
          )}
          {isActiveTrip && (
            <>
              <p className="text-center text-sm mb-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg py-2 px-3">
                {STATUS_BANNER[rideStatus!] ?? 'Ride in progress'}
              </p>
              {driverName && (
                <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  <span className="font-semibold">Driver:</span> {driverName}
                  {driverPhone && <span className="ml-2">• {driverPhone}</span>}
                </div>
              )}
              <div className="bg-white border border-gray-200 rounded-lg py-2 px-3 mb-3 text-sm text-gray-700">
                {tripDistanceKm != null && <span>Distance: {tripDistanceKm.toFixed(1)} km • </span>}
                <span>Fare: R{(fare ?? 0).toFixed(2)}</span>
              </div>
            </>
          )}

          {!rideId && (
            <div className="mb-3 space-y-2">
              <button
                onClick={() => void useCurrentLocation()}
                disabled={locating}
                className="w-full rounded-lg border border-blue-500 py-2 px-3 text-sm font-bold text-blue-600 disabled:opacity-60 hover:bg-blue-50"
              >
                {locating ? 'Locating...' : 'Use my current location'}
              </button>
              {mapsAvailable ? (
                <Autocomplete
                  options={getPolokwaneAutocompleteOptions()}
                  onLoad={(autocomplete) => (pickupAutocompleteRef.current = autocomplete)}
                  onPlaceChanged={onPickupPlaceChanged}
                >
                  <input
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="Pickup location"
                    className="w-full rounded-lg border border-blue-200 bg-blue-50 py-2 px-3 text-sm text-gray-700"
                  />
                </Autocomplete>
              ) : (
                <input
                  readOnly
                  value={pickupAddress}
                  placeholder="Pickup location"
                  className="w-full rounded-lg border border-blue-200 bg-blue-50 py-2 px-3 text-sm text-gray-700"
                />
              )}
              {mapsAvailable ? (
                <Autocomplete
                  options={getPolokwaneAutocompleteOptions()}
                  onLoad={(autocomplete) => (dropoffAutocompleteRef.current = autocomplete)}
                  onPlaceChanged={onDropoffPlaceChanged}
                >
                  <input
                    value={dropoffAddress}
                    onChange={(e) => setDropoffAddress(e.target.value)}
                    placeholder="Dropoff location"
                    className="w-full rounded-lg border border-red-200 bg-red-50 py-2 px-3 text-sm text-gray-700"
                  />
                </Autocomplete>
              ) : (
                <input
                  readOnly
                  value={dropoffAddress}
                  placeholder="Dropoff location"
                  className="w-full rounded-lg border border-red-200 bg-red-50 py-2 px-3 text-sm text-gray-700"
                />
              )}
              <p className="text-xs text-gray-500">You can type OR tap map to set locations</p>
            </div>
          )}

          {mapsAvailable ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: MAP_HEIGHT }}
              center={isActiveTrip ? liveMapCenter : pinMapCenter}
              zoom={14}
              onLoad={(map) => {
                mapRef.current = map;
              }}
              onClick={rideId ? undefined : handleMapClick}
            >
              {isActiveTrip ? (
                <>
                  {tripPickupLocation && (
                    <Marker
                      position={tripPickupLocation}
                      label="A"
                      icon="http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                    />
                  )}
                  {tripDropoffLocation && (
                    <Marker
                      position={tripDropoffLocation}
                      label="B"
                      icon="http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                    />
                  )}
                  {driverLocation && (
                    <Marker
                      position={driverLocation}
                      label="Driver"
                      icon="https://maps.google.com/mapfiles/kml/shapes/cabs.png"
                    />
                  )}
                </>
              ) : (
                <>
                  {pickupLocation && (
                    <Marker
                      position={pickupLocation}
                      label="A"
                      draggable
                      onDragEnd={handlePickupDragEnd}
                      icon="http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                    />
                  )}
                  {dropoffLocation && (
                    <Marker
                      position={dropoffLocation}
                      label="B"
                      draggable
                      onDragEnd={handleDropoffDragEnd}
                      icon="http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                    />
                  )}
                </>
              )}
            </GoogleMap>
          ) : (
            <div
              style={{ height: MAP_HEIGHT }}
              className="w-full flex items-center justify-center bg-gray-100 rounded-lg text-gray-500"
            >
              {mapsError
                ? 'Map failed to load. Common fix: Enable billing at console.cloud.google.com/billing'
                : 'Loading map...'}
            </div>
          )}

          {!rideId && (pickupLocation || dropoffLocation) && (
            <button onClick={resetPins} className="mt-2 text-sm text-gray-500 underline">
              Clear pins
            </button>
          )}

          {isActiveTrip && driverPhone && (
            <a
              href={`tel:${driverPhone}`}
              className="mt-3 inline-block bg-orange-500 text-white font-bold py-2 px-4 rounded-lg"
            >
              Call Driver
            </a>
          )}

          {!rideId && distance && estimatedFare > 0 && (
            <div className="bg-orange-100 p-3 rounded-lg mt-3">
              <p>
                Distance: {distance} • R{estimatedFare}
              </p>
            </div>
          )}

          {isCompleted && (
            <div className="text-center mb-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg py-3 px-3">
              <p className="mb-2">Trip Complete. Pay R{fare ?? 0} cash to driver</p>
              <button
                onClick={() => setRated(true)}
                disabled={rated}
                className="bg-orange-500 disabled:opacity-60 text-white font-bold py-2 px-4 rounded-lg"
              >
                {rated ? 'Thanks for rating!' : 'Rate Driver'}
              </button>
              {rideId && <TripReceipt rideId={rideId} fare={fare ?? 0} />}
            </div>
          )}
          {message && (
            <p className="text-center text-sm mb-3 bg-green-50 text-green-700 border border-green-200 rounded-lg py-2 px-3">
              {message}
            </p>
          )}
          {!rideId && pickupLocation && dropoffLocation && (
            <button
              onClick={() => void requestRide()}
              disabled={requesting}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl mt-3"
            >
              <CarIcon size={20} />{' '}
              {requesting ? 'Requesting...' : `Request BuddyRide - R${estimatedFare}`}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

