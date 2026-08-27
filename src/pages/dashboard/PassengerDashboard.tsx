import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Autocomplete, GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc, type DocumentData } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { CarIcon, LogOutIcon } from '../../components/Icons';
import { Logo } from '../../components/Logo';
import { TripReceipt } from '../../components/TripReceipt';
import { searchPolokwanePlaces, type PolokwanePlace } from '../../lib/polokwane';
import { calculateRidePricing } from '../../lib/pricing';
import { BOOKING_FEE, CANCELLATION, COMMISSION_RATE, DRIVER_RATE } from '../../config/pricing';
import { calcDistance } from '../../lib/maps';
import { EmergencyContacts, SOSButton } from '../../components/SafetyTools';
import { RatingModal } from '../../components/RatingModal';

const ACTIVE_TRIP_STATUSES = ['requested', 'accepted', 'driver_arrived', 'in_progress'];
const STATUS_BANNER: Record<string, string> = {
  requested: 'Looking for a driver...',
  accepted: 'Driver is on the way',
  driver_arrived: 'Driver has arrived',
  in_progress: 'On trip to destination',
};
const DEFAULT_CENTER = { lat: -23.9045, lng: 29.4689 };
const MAP_HEIGHT = '70vh';
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
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
  const hasGoogleMapsApiKey = googleMapsApiKey.length > 0;
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: hasGoogleMapsApiKey ? googleMapsApiKey : 'missing-key',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [rideId, setRideId] = useState<string | null>(null);
  const [rideCreatedAt, setRideCreatedAt] = useState<number | null>(null);
  const [cancelSecondsRemaining, setCancelSecondsRemaining] = useState(120);
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
  const [driverId, setDriverId] = useState<string | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [rated, setRated] = useState(false);
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [distance, setDistance] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [estimatedFare, setEstimatedFare] = useState<number>(0);
  const [googleMapsError, setGoogleMapsError] = useState<string | null>(null);
  const [locationStep, setLocationStep] = useState<'pickup' | 'dropoff'>('pickup');
  const [mapLocation, setMapLocation] = useState(DEFAULT_CENTER);
  const [mapAddress, setMapAddress] = useState('');
  const [searchText, setSearchText] = useState('');

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

  const reverseGeocode = async (location: { lat: number; lng: number }) => {
    const fallback = searchPolokwanePlaces(`${location.lat.toFixed(3)} ${location.lng.toFixed(3)}`)[0];
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.lat},${location.lng}&key=${googleMapsApiKey}`
      );
      const data = await response.json();
      const address = data.results?.[0]?.formatted_address;
      setMapAddress(address || fallback?.address || `Seshego Zone X (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`);
    } catch {
      setMapAddress(fallback?.address || `Seshego Zone X (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`);
    }
  };

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
        const { totalToPassenger } = calculateRidePricing(km);
        const fareEstimate = totalToPassenger;
        setDistance(leg.distance.text);
        setDistanceKm(km);
        setEstimatedFare(fareEstimate);
      }
    );
  };

  const handleMapIdle = () => {
    if (rideId || !mapRef.current) return;
    const center = mapRef.current.getCenter();
    if (!center) return;
    const nextLocation = { lat: center.lat(), lng: center.lng() };
    setMapLocation(nextLocation);
    void reverseGeocode(nextLocation);
  };

  const focusMapOnSelection = (location: { lat: number; lng: number }) => {
    const map = mapRef.current;
    if (!map) return;

    map.panTo(location);
    map.setZoom(17);
  };

  const onPlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    const location = place?.geometry?.location;
    if (!location) return;

    const nextLocation = { lat: location.lat(), lng: location.lng() };
    const address = place?.formatted_address ?? place?.name ?? '';
    setMapAddress(address);
    setSearchText(address);
    setMapLocation(nextLocation);
    if (locationStep === 'pickup') setPickupPlaceId(place.place_id ?? null);
    else setDropoffPlaceId(place.place_id ?? null);
    focusMapOnSelection(nextLocation);
  };

  const selectLocalPlace = (place: PolokwanePlace) => {
    const nextLocation = { lat: place.lat, lng: place.lng };
    setMapAddress(place.address);
    setSearchText(place.name);
    setMapLocation(nextLocation);
    focusMapOnSelection(nextLocation);
  };

  const confirmMapLocation = () => {
    if (locationStep === 'pickup') {
      setPickupLocation(mapLocation);
      setPickupAddress(mapAddress || 'Seshego Zone X');
      setPickupPlaceId(null);
      setLocationStep('dropoff');
      setSearchText('');
      setMapAddress('');
    } else {
      setDropoffLocation(mapLocation);
      setDropoffAddress(mapAddress || 'Seshego Zone X');
      setDropoffPlaceId(null);
      setSearchText('');
      setMapAddress('');
    }
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
      setMapLocation(location);
      setMapAddress('Current location');
      setSearchText('Current location');
      focusMapOnSelection(location);
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
    setPickupAddress('');
    setDropoffAddress('');
    setLocationStep('pickup');
    setMapAddress('');
    setSearchText('');
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
        pickup: { address: pickupAddress || 'Seshego Zone X', lat: pickupLocation.lat, lng: pickupLocation.lng, source: 'manual_pin' },
        dropoff: { address: dropoffAddress || 'Seshego Zone X', lat: dropoffLocation.lat, lng: dropoffLocation.lng, source: 'manual_pin' },
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
      setRideCreatedAt(Date.now());
      setCancelSecondsRemaining(CANCELLATION.FREE_CANCEL_SEC);
      setRideStatus('searching');
      setDriverLocation(null);
      setTripPickupLocation({ lat: pickupLocation.lat, lng: pickupLocation.lng });
      setTripDropoffLocation({ lat: dropoffLocation.lat, lng: dropoffLocation.lng });
      setTripDistanceKm(distanceKm);
      setDriverPhone(null);
      setFare(null);
      setRated(false);
      setRatingValue(null);
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
      if (typeof data.driverId === 'string') {
        setDriverId(data.driverId);
      }
      if (nextStatus === 'completed' && typeof data.driverId === 'string' && !rated) {
        setShowRating(true);
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
  useEffect(() => {
    if (!isActiveTrip || rideCreatedAt == null) return;
    const updateCountdown = () => setCancelSecondsRemaining(Math.max(0, Math.ceil(CANCELLATION.FREE_CANCEL_SEC - (Date.now() - rideCreatedAt) / 1000)));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [isActiveTrip, rideCreatedAt]);

  const cancelRide = async () => {
    if (!rideId || !isActiveTrip) return;
    const elapsedSec = rideCreatedAt == null ? CANCELLATION.FREE_CANCEL_SEC : (Date.now() - rideCreatedAt) / 1000;
    const arrived = rideStatus === 'driver_arrived' || rideStatus === 'arrived_at_pickup';
    const driverDistanceKm = driverLocation && tripPickupLocation
      ? calcDistance(driverLocation.lat, driverLocation.lng, tripPickupLocation.lat, tripPickupLocation.lng)
      : null;
    const driverIsDriving = Boolean(driverName || driverPhone);
    const driverIsCloseEnough = driverDistanceKm != null && driverDistanceKm <= 1;
    const cancellationFee = arrived
      ? CANCELLATION.NO_SHOW_FEE
      : elapsedSec >= CANCELLATION.FREE_CANCEL_SEC && driverIsDriving && driverIsCloseEnough
        ? CANCELLATION.LATE_CANCEL_FEE
        : 0;
    try {
      await updateDoc(doc(db, 'rides', rideId), {
        status: 'cancelled',
        cancellationFee,
        cancellationPlatformCut: cancellationFee * COMMISSION_RATE,
        cancellationDriverPayout: cancellationFee * DRIVER_RATE,
        paymentMethod: 'cash',
        cancellationBalanceDue: cancellationFee,
        cancelledAt: serverTimestamp(),
      });
      setMessage(cancellationFee ? `Ride cancelled. Fee: R${cancellationFee.toFixed(2)}` : 'Ride cancelled for free.');
      setRideId(null);
      setRideStatus(null);
      setRideCreatedAt(null);
      setCancelSecondsRemaining(0);
    } catch (err) {
      console.error(err);
      setMessage('Unable to cancel ride. Please try again.');
    }
  };

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
      strictBounds: false,
      types: ['establishment', 'geocode'],
      fields: ['geometry', 'formatted_address', 'place_id', 'name'],
      locationBias: { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, radius: 50000 },
    } as google.maps.places.AutocompleteOptions;
  };

  const mapsError = !hasGoogleMapsApiKey
    ? 'VITE_GOOGLE_MAPS_API_KEY missing in .env file'
    : googleMapsError ?? (loadError ? loadError.message : null);
  const mapsAvailable = hasGoogleMapsApiKey && isLoaded && !mapsError;

  const logout = async () => { await signOut(); localStorage.clear(); navigate('/'); };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex justify-between items-center">
        <Logo size={48} />
        <button onClick={() => void logout()} className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-white hover:bg-red-700">
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
              <button
                type="button"
                onClick={() => void cancelRide()}
                className="mt-2 w-full rounded-lg border border-red-500 py-2 font-semibold text-red-600 hover:bg-red-50"
              >
                {cancelSecondsRemaining > 0
                  ? `Cancel within ${Math.floor(cancelSecondsRemaining / 60)}:${String(cancelSecondsRemaining % 60).padStart(2, '0')} for free, after R${CANCELLATION.LATE_CANCEL_FEE}`
                  : `Cancel Ride - R${CANCELLATION.LATE_CANCEL_FEE} fee`}
              </button>
            </>
          )}

          {mapsAvailable ? (
            <GoogleMap
              mapContainerClassName="h-[70vh] w-full"
              center={isActiveTrip ? liveMapCenter : mapLocation}
              zoom={14}
              onLoad={(map) => {
                mapRef.current = map;
              }}
              onIdle={isActiveTrip || rideId ? undefined : handleMapIdle}
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
              ) : null}
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

            {!rideId && !isActiveTrip && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full text-3xl">
                📍
              </div>
            )}

            {!rideId && !isActiveTrip && (
              <div className="relative z-20 -mt-28 px-3 pb-3">
                <div className="pointer-events-auto rounded-2xl bg-white p-3 shadow-xl">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {locationStep === 'pickup' ? 'Set pickup location' : 'Set destination'}
                  </p>
                  {mapsAvailable ? (
                    <Autocomplete
                      options={getPolokwaneAutocompleteOptions()}
                      onLoad={(autocomplete) => (autocompleteRef.current = autocomplete)}
                      onPlaceChanged={onPlaceChanged}
                    >
                      <input
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        placeholder={locationStep === 'pickup' ? 'Where are you?' : 'Where to?'}
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 shadow-sm"
                      />
                    </Autocomplete>
                  ) : (
                    <input
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="Set location on map"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                    />
                  )}
                  {locationStep === 'pickup' && (
                    <button
                      type="button"
                      onClick={() => void useCurrentLocation()}
                      disabled={locating}
                      className="mt-2 w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60"
                    >
                      {locating ? 'Locating...' : 'Use my current location'}
                    </button>
                  )}
                  {searchText && searchPolokwanePlaces(searchText).length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto border-t border-gray-100 pt-1">
                      {searchPolokwanePlaces(searchText).map((place) => (
                        <button
                          key={place.name}
                          type="button"
                          onClick={() => selectLocalPlace(place)}
                          className="block w-full px-2 py-2 text-left text-sm text-gray-700 hover:bg-orange-50"
                        >
                          {place.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {mapAddress && (
                    <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                      <p><span className="font-semibold">{locationStep === 'pickup' ? 'Pickup' : 'Destination'}:</span> {mapAddress}</p>
                      <button
                        type="button"
                        onClick={confirmMapLocation}
                        className="mt-3 w-full rounded-xl bg-orange-500 py-3 font-bold text-white hover:bg-orange-600"
                      >
                        Confirm {locationStep === 'pickup' ? 'Pickup' : 'Destination'}
                      </button>
                    </div>
                  )}
                  {!mapAddress && searchText && (
                    <button type="button" onClick={() => setMapAddress(searchText)} className="mt-2 w-full rounded-xl bg-gray-100 py-2 text-sm font-semibold text-gray-700">
                      Set location on map
                    </button>
                  )}
                  {locationStep === 'dropoff' && pickupAddress && (
                    <p className="mt-2 text-xs text-gray-500">Pickup: {pickupAddress}</p>
                  )}
                </div>
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
              <p>Distance: {distance}</p>
              <p>Ride R{(estimatedFare - BOOKING_FEE).toFixed(2)} + Booking R{BOOKING_FEE.toFixed(2)} = R{estimatedFare.toFixed(2)}</p>
            </div>
          )}

          {isCompleted && (
            <div className="text-center mb-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg py-3 px-3">
              <p className="mb-2">Trip Complete. Pay R{fare ?? 0} cash to driver</p>
              {driverId && !rated && (
                <button type="button" onClick={() => setShowRating(true)} className="mb-2 rounded-lg bg-yellow-500 px-4 py-2 font-bold text-white">
                  Rate your driver
                </button>
              )}
              {rated && <p className="mb-2 font-semibold text-green-700">You rated {driverName ?? 'your driver'} {ratingValue}★</p>}
              <button
                onClick={() => setShowRating(true)}
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
      {profile?.id && <EmergencyContacts userId={profile.id} />}
      <footer className="p-4 text-center text-xs text-gray-500">BuddyRide Safety: In emergency press SOS or call 10111 / 112</footer>
      <SOSButton rideId={rideId} userRole="passenger" />
      {showRating && driverId && profile?.id && rideId && (
        <RatingModal rideId={rideId} driverId={driverId} driverName={driverName} passengerId={profile.id} onSaved={(value) => { setRated(true); setRatingValue(value); setShowRating(false); }} />
      )}
    </div>
  );
}

