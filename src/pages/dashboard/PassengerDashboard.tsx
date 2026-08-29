import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc, type DocumentData } from 'firebase/firestore';
import { LockKeyhole } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { CarIcon, LogOutIcon } from '../../components/Icons';
import { Logo } from '../../components/Logo';
import { TripReceipt } from '../../components/TripReceipt';
import { searchPolokwanePlaces, type PolokwanePlace } from '../../lib/polokwane';
import { BOOKING_FEE, CANCELLATION, COMMISSION_RATE, DRIVER_RATE, RIDE_EXTRAS } from '../../config/pricing';
import { RIDE_CATEGORIES, type RideCategoryId } from '../../config/categories';
import { calcDistance } from '../../lib/maps';
import { EmergencyContacts, SOSButton } from '../../components/SafetyTools';
import { RatingModal } from '../../components/RatingModal';
import { playSound } from '../../utils/sound';
import AppMap, { type AppMapMarker } from '../../components/Map/AppMap';

const formatR = (n: number) => `R${Number(n || 0).toFixed(2)}`;

// "Helen Joseph St, Seshego Ext 6, Polokwane, 0742, South Africa" -> "Helen Joseph St, Seshego"
function shortAddress(full: string): string {
  if (!full) return '';
  const parts = full.split(',').map((part) => part.trim());
  return parts.slice(0, 2).join(', ');
}

type NominatimResult = { display_name: string; lat: string; lon: string };

// Free OSM Nominatim address search, restricted to South Africa.
async function searchAddress(query: string): Promise<NominatimResult[]> {
  if (!query.trim()) return [];
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=za&limit=5`
  );
  if (!response.ok) return [];
  return response.json();
}
const ACTIVE_TRIP_STATUSES = ['searching', 'requested', 'accepted', 'driver_arrived', 'arrived_at_pickup', 'in_progress'];
const STATUS_BANNER: Record<string, string> = {
  searching: 'Looking for a driver...',
  requested: 'Looking for a driver...',
  accepted: 'Driver is on the way',
  driver_arrived: 'Driver has arrived - 3 min free wait',
  arrived_at_pickup: 'Driver has arrived - 3 min free wait',
  in_progress: 'On trip to destination',
};
const DEFAULT_CENTER = { lat: -23.9045, lng: 29.4689 };
const BASE_FARE = 25;
const RATE_KM = 8;
const RATE_MIN = 1;
const STOP_FEE = 10;

type Stop = { id: string; address: string; lat: number | null; lng: number | null };

function toMillis(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return typeof value === 'number' ? value : null;
}

export function PassengerDashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const geocodeTimerRef = useRef<number | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const lastGeocodedLocationRef = useRef<{ lat: number; lng: number } | null>(null);
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
  const [driverPhotoUrl, setDriverPhotoUrl] = useState<string | null>(null);
  const [carPlate, setCarPlate] = useState<string | null>(null);
  const [driverRating, setDriverRating] = useState(4.9);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [fare, setFare] = useState<number | null>(null);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [waitingFare, setWaitingFare] = useState(0);
  const [totalFare, setTotalFare] = useState<number | null>(null);
  const [baseFare, setBaseFare] = useState<number | null>(null);
  const [stopArrivalTime, setStopArrivalTime] = useState<unknown>(null);
  const [pickupArrivedAt, setPickupArrivedAt] = useState<unknown>(null);
  const [pickupWaitSeconds, setPickupWaitSeconds] = useState(0);
  const [pickupWaitFare, setPickupWaitFare] = useState(0);
  const [rated, setRated] = useState(false);
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [distance, setDistance] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [estimatedFare, setEstimatedFare] = useState<number>(0);
  const [locationStep, setLocationStep] = useState<'pickup' | 'dropoff'>('pickup');
  const [mapLocation, setMapLocation] = useState(DEFAULT_CENTER);
  const [mapAddress, setMapAddress] = useState('');
  const [stops, setStops] = useState<Stop[]>([
    { id: 'pickup', address: '', lat: null, lng: null },
    { id: 'dropoff', address: '', lat: null, lng: null },
  ]);
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [isLocationLocked, setIsLocationLocked] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [nominatimResults, setNominatimResults] = useState<NominatimResult[]>([]);
  const [mode, setMode] = useState<'ride' | 'send'>('ride');
  const [tripType, setTripType] = useState<'ride' | 'send'>('ride');
  const [packageDescription, setPackageDescription] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [packageSize, setPackageSize] = useState<'small' | 'medium' | 'large'>('small');
  const [sendPaymentMethod, setSendPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [rideCategory, setRideCategory] = useState<RideCategoryId>('go');
  const [passengerCount, setPassengerCount] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState<Array<keyof typeof RIDE_EXTRAS>>([]);
  const extrasFee = selectedExtras.reduce((total, extra) => total + RIDE_EXTRAS[extra].fee, 0);
  const total = estimatedFare;
  const roundedTotal = Math.round(total * 100) / 100;
  const ridePrice = total - BOOKING_FEE - extrasFee;

  const reverseGeocode = async (location: { lat: number; lng: number }) => {
    const fallback = searchPolokwanePlaces(`${location.lat.toFixed(3)} ${location.lng.toFixed(3)}`)[0];
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}`
      );
      const data = await response.json();
      const address = data.display_name;
      setMapAddress(address || fallback?.address || `Seshego Zone X (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`);
    } catch {
      setMapAddress(fallback?.address || `Seshego Zone X (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`);
    }
  };

  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    if (searchText.trim().length < 3) {
      setNominatimResults([]);
      return;
    }
    searchTimerRef.current = window.setTimeout(async () => {
      const results = await searchAddress(searchText);
      setNominatimResults(results);
    }, 400);
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    };
  }, [searchText]);

  const scheduleReverseGeocode = (location: { lat: number; lng: number }) => {
    const previousLocation = lastGeocodedLocationRef.current;
    if (previousLocation && calcDistance(previousLocation.lat, previousLocation.lng, location.lat, location.lng) < 0.02) return;

    if (geocodeTimerRef.current) window.clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = window.setTimeout(() => {
      lastGeocodedLocationRef.current = location;
      void reverseGeocode(location);
    }, 1000);
  };

  useEffect(() => () => {
    if (geocodeTimerRef.current) window.clearTimeout(geocodeTimerRef.current);
  }, []);

  const calculateFareFallback = () => {
    const origin = stops[0];
    const dest = stops[stops.length - 1];
    if (origin.lat == null || origin.lng == null || dest.lat == null || dest.lng == null) return;

    const km = calcDistance(origin.lat, origin.lng, dest.lat, dest.lng);
    const minutes = (km / 30) * 60; // assume ~30km/h average city speed
    const fareEstimate = BASE_FARE + km * RATE_KM + minutes * RATE_MIN + (stops.length - 2) * STOP_FEE;
    setDistance(`${km.toFixed(1)} km`);
    setDistanceKm(km);
    setEstimatedFare(fareEstimate);
  };

  const calculateFare = () => {
    if (stops.some((stop) => stop.lat == null || stop.lng == null)) return;
    calculateFareFallback();
  };

  const selectCategory = (catId: RideCategoryId) => {
    const cat = RIDE_CATEGORIES.find((c) => c.id === catId);
    if (!cat) return;
    if (catId === 'go' && passengerCount > cat.maxPassengers) {
      setRideCategory('standard');
      setMessage('Go is max 2, moved to Standard');
      return;
    }
    setRideCategory(catId);
  };

  const selectMode = (nextMode: 'ride' | 'send') => {
    setMode(nextMode);
    setMessage('');
    if (nextMode === 'send') {
      setRideCategory('send');
    } else if (rideCategory === 'send') {
      setRideCategory('go');
      setPassengerCount(1);
    }
  };

  const selectNominatimResult = (result: NominatimResult) => {
    const nextLocation = { lat: Number(result.lat), lng: Number(result.lon) };
    setMapAddress(result.display_name);
    setSearchText(shortAddress(result.display_name));
    setMapLocation(nextLocation);
    setNominatimResults([]);
    if (locationStep === 'pickup') setPickupPlaceId(null);
    else setDropoffPlaceId(null);
  };

  const selectLocalPlace = (place: PolokwanePlace) => {
    const nextLocation = { lat: place.lat, lng: place.lng };
    setMapAddress(place.address);
    setSearchText(place.name);
    setMapLocation(nextLocation);
  };

  const confirmMapLocation = () => {
    const confirmedStop = { ...stops[activeStopIndex], address: mapAddress || 'Seshego Zone X', lat: mapLocation.lat, lng: mapLocation.lng };
    setStops((current) => current.map((stop, index) => index === activeStopIndex ? confirmedStop : stop));
    if (activeStopIndex === 0) {
      setPickupLocation(mapLocation);
      setPickupAddress(mapAddress || 'Seshego Zone X');
      setPickupPlaceId(null);
      setIsLocationLocked(true);
      setLocationStep('dropoff');
      setActiveStopIndex(Math.min(1, stops.length - 1));
      setSearchText('');
      setMapAddress('');
    } else if (activeStopIndex === stops.length - 1) {
      setDropoffLocation(mapLocation);
      setDropoffAddress(mapAddress || 'Seshego Zone X');
      setDropoffPlaceId(null);
      setSearchText('');
      setMapAddress('');
    }
  };

  const selectStop = (index: number) => {
    setActiveStopIndex(index);
    setLocationStep(index === 0 ? 'pickup' : 'dropoff');
    const stop = stops[index];
    setSearchText(stop.address);
    setMapAddress(stop.address);
    if (stop.lat != null && stop.lng != null) setMapLocation({ lat: stop.lat, lng: stop.lng });
  };

  const addStop = () => {
    if (stops.length >= 4) return;
    const next = [...stops.slice(0, -1), { id: `stop-${Date.now()}`, address: '', lat: null, lng: null }, stops[stops.length - 1]];
    setStops(next);
    setActiveStopIndex(next.length - 2);
    setLocationStep('dropoff');
    setSearchText('');
    setMapAddress('');
  };

  const removeStop = (index: number) => {
    if (index === 0 || index === stops.length - 1) return;
    const next = stops.filter((_, stopIndex) => stopIndex !== index);
    setStops(next);
    setActiveStopIndex(Math.min(activeStopIndex, next.length - 1));
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
        maximumAge: 0,
      });
    });

  const useCurrentLocation = async () => {
    if (isLocationLocked) return;
    setLocating(true);
    setMessage('');
    try {
      const position = await getCurrentPosition();
      const { latitude, longitude, accuracy } = position.coords;
      console.log('GPS accuracy:', accuracy);
      if (accuracy > 50) {
        setLocationAccuracy(accuracy);
        setMessage(`Low GPS accuracy: ${Math.round(accuracy)}m. Move near a window and refresh.`);
        return;
      }
      const location = { lat: latitude, lng: longitude };
      setUserLocation(location);
      setLocationAccuracy(accuracy);
      setMapLocation(location);
      setSearchText('Current location');
      scheduleReverseGeocode(location);
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
    setStops([{ id: 'pickup', address: '', lat: null, lng: null }, { id: 'dropoff', address: '', lat: null, lng: null }]);
    setActiveStopIndex(0);
    setLocationStep('pickup');
    setUserLocation(null);
    setLocationAccuracy(null);
    setIsLocationLocked(false);
    setMapAddress('');
    setSearchText('');
    setPackageDescription('');
    setRecipientName('');
    setRecipientPhone('');
    setPackageSize('small');
  };

  const requestRide = async () => {
    if (stops.some((stop) => stop.lat == null || stop.lng == null)) {
      setMessage('Set a location for every stop before requesting a ride.');
      return;
    }
    const pickup = stops[0];
    const dropoff = stops[stops.length - 1];
    if (mode === 'send' && (!packageDescription.trim() || !recipientName.trim() || !recipientPhone.trim())) {
      setMessage('Tell us what you are sending and the recipient name + phone number.');
      return;
    }
    setRequesting(true);
    setMessage('');
    try {
      const rideRef = await addDoc(
        collection(db, 'rides'),
        mode === 'send'
          ? {
              type: 'send',
              packageDescription: packageDescription.trim(),
              recipientName: recipientName.trim(),
              recipientPhone: recipientPhone.trim(),
              packageSize,
              pickup: { address: pickup.address, lat: pickup.lat!, lng: pickup.lng!, source: 'manual_pin' },
              dropoff: { address: dropoff.address, lat: dropoff.lat!, lng: dropoff.lng!, source: 'manual_pin' },
              pickupLatLng: { lat: pickup.lat!, lng: pickup.lng! },
              dropoffLatLng: { lat: dropoff.lat!, lng: dropoff.lng! },
              distance: distance || `${(distanceKm ?? 0).toFixed(1)} km`,
              price: estimatedFare,
              fare: estimatedFare - BOOKING_FEE,
              totalFare: estimatedFare,
              baseFare: estimatedFare,
              stops,
              currentStopIndex: 0,
              stopArrivalTime: null,
              waitingSeconds: 0,
              waitingFare: 0,
              category: 'send',
              paymentMethod: sendPaymentMethod,
              status: 'searching',
              passengerId: profile?.id ?? 'test123',
              pickupPlaceId: pickupPlaceId ?? null,
              dropoffPlaceId: dropoffPlaceId ?? null,
              createdAt: serverTimestamp(),
            }
          : {
              type: 'ride',
              pickup: { address: pickup.address, lat: pickup.lat!, lng: pickup.lng!, source: 'manual_pin' },
              dropoff: { address: dropoff.address, lat: dropoff.lat!, lng: dropoff.lng!, source: 'manual_pin' },
              pickupLatLng: { lat: pickup.lat!, lng: pickup.lng! },
              dropoffLatLng: { lat: dropoff.lat!, lng: dropoff.lng! },
              distance: distance || `${(distanceKm ?? 0).toFixed(1)} km`,
              price: estimatedFare,
              fare: estimatedFare - BOOKING_FEE - extrasFee,
              totalFare: estimatedFare,
              baseFare: estimatedFare,
              stops,
              currentStopIndex: 0,
              stopArrivalTime: null,
              waitingSeconds: 0,
              waitingFare: 0,
              category: rideCategory,
              passengerCount,
              extras: selectedExtras,
              extrasFee,
              status: 'searching',
              passengerId: profile?.id ?? 'test123',
              pickupPlaceId: pickupPlaceId ?? null,
              dropoffPlaceId: dropoffPlaceId ?? null,
              createdAt: serverTimestamp(),
            }
      );

      setRideId(rideRef.id);
      setTripType(mode);
      setRideCreatedAt(Date.now());
      setCancelSecondsRemaining(CANCELLATION.FREE_CANCEL_SEC);
      setRideStatus('searching');
      setDriverLocation(null);
      setTripPickupLocation({ lat: pickup.lat!, lng: pickup.lng! });
      setTripDropoffLocation({ lat: dropoff.lat!, lng: dropoff.lng! });
      setTripDistanceKm(distanceKm);
      setDriverPhone(null);
      setDriverPhotoUrl(null);
      setCarPlate(null);
      setDriverRating(4.9);
      setFare(null);
      setRated(false);
      setRatingValue(null);
      setMessage(mode === 'send' ? 'Parcel request sent! Looking for a driver...' : 'Ride requested! Looking for driver...');
    } catch (err) {
      console.error(err);
      setMessage('Failed to request a ride. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const handleRequestClick = () => {
    // TODO: Re-enable after launch - SA NETA passenger verification
    // if (!profile?.idNumberVerified || profile?.verificationStatus !== 'verified') {
    //   setShowVerifyModal(true);
    //   return;
    // }
    void requestRide();
  };

  // Recompute the fare estimate whenever both pins are set.
  useEffect(() => {
    if (stops.every((stop) => stop.lat != null && stop.lng != null)) {
      calculateFare();
    } else {
      setDistance('');
      setDistanceKm(null);
      setEstimatedFare(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, extrasFee, rideCategory]);

  // Follow the requested ride's status and the driver's live location once accepted.
  const lastSoundStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!rideId) return;
    const unsubscribe = onSnapshot(doc(db, 'rides', rideId), (snapshot) => {
      const data = snapshot.data() as DocumentData | undefined;
      if (!data) return;

      const nextStatus = typeof data.status === 'string' ? data.status : null;
      setRideStatus(nextStatus);

      if (nextStatus && nextStatus !== lastSoundStatusRef.current) {
        lastSoundStatusRef.current = nextStatus;
        if (nextStatus === 'accepted') playSound('accepted');
        else if (nextStatus === 'arrived_at_pickup' || nextStatus === 'driver_arrived') playSound('arrived');
        else if (nextStatus === 'cancelled') playSound('cancel');
      }

      if (data.type === 'send' || data.type === 'ride') {
        setTripType(data.type);
      }

      if (nextStatus === 'accepted') {
        const acceptedDriverName = typeof data.driverName === 'string' ? data.driverName : 'Driver';
        setDriverName(acceptedDriverName);
        setMessage(
          data.type === 'send'
            ? `Driver on the way! ${acceptedDriverName} is coming to collect your parcel.`
            : `Driver on the way! ${acceptedDriverName} is heading to you.`
        );
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
      if (typeof data.driverPhotoUrl === 'string') {
        setDriverPhotoUrl(data.driverPhotoUrl);
      } else if (data.driverPhotoUrl == null) {
        setDriverPhotoUrl(null);
      }
      if (typeof data.carPlate === 'string') {
        setCarPlate(data.carPlate);
      } else if (data.carPlate == null) {
        setCarPlate(null);
      }
      if (typeof data.driverRating === 'number' && Number.isFinite(data.driverRating)) {
        setDriverRating(data.driverRating);
      }
      if (typeof data.paymentMethod === 'string') {
        setPaymentMethod(data.paymentMethod);
      }
      if (nextStatus === 'completed' && typeof data.driverId === 'string' && !rated) {
        setShowRating(true);
      }
      if (typeof data.price === 'number') {
        setFare(data.price);
      }
      if (typeof data.waitingSeconds === 'number') {
        setWaitingSeconds(data.waitingSeconds);
      }
      if (typeof data.waitingFare === 'number') {
        setWaitingFare(data.waitingFare);
      }
      if (typeof data.totalFare === 'number') {
        setTotalFare(data.totalFare);
      }
      if (typeof data.baseFare === 'number') {
        setBaseFare(data.baseFare);
      }
      setStopArrivalTime(data.stopArrivalTime ?? null);
      setPickupArrivedAt(data.arrivedAt ?? null);
      if (typeof data.pickupWaitSeconds === 'number') {
        setPickupWaitSeconds(data.pickupWaitSeconds);
      }
      if (typeof data.pickupWaitFare === 'number') {
        setPickupWaitFare(data.pickupWaitFare);
      }
      if (typeof data.distance === 'string') {
        setDistance(data.distance);
        const parsed = Number.parseFloat(data.distance);
        setDistanceKm(Number.isFinite(parsed) ? parsed : null);
      }
    });
    return () => unsubscribe();
  }, [rideId]);

  // Live-count the 3 min free pickup wait, then R1/min extra, while the driver waits at pickup.
  useEffect(() => {
    const arrivedAt = toMillis(pickupArrivedAt);
    if (rideStatus !== 'arrived_at_pickup' || arrivedAt == null) return;
    const updatePickupWaiting = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - arrivedAt) / 1000));
      setPickupWaitSeconds(seconds);
      setPickupWaitFare(seconds > 180 ? Math.ceil((seconds - 180) / 60) : 0);
    };
    updatePickupWaiting();
    const timer = window.setInterval(updatePickupWaiting, 1000);
    return () => window.clearInterval(timer);
  }, [rideStatus, pickupArrivedAt]);

  useEffect(() => {
    const arrivedAt = toMillis(stopArrivalTime);
    if (rideStatus !== 'in_progress' || arrivedAt == null) return;
    const updateWaiting = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - arrivedAt) / 1000));
      setWaitingSeconds(seconds);
      setWaitingFare(seconds > 180 ? Math.ceil((seconds - 180) / 60) : 0);
    };
    updateWaiting();
    const timer = window.setInterval(updateWaiting, 1000);
    return () => window.clearInterval(timer);
  }, [rideStatus, stopArrivalTime]);

  const isCompleted = rideStatus === 'completed';
  const isActiveTrip = rideStatus != null && ACTIVE_TRIP_STATUSES.includes(rideStatus);
  const isShareableTrip = rideStatus === 'accepted' || rideStatus === 'arrived_at_pickup' || rideStatus === 'in_progress';
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
      setMessage(cancellationFee ? `Ride cancelled. Fee: ${formatR(cancellationFee)}` : 'Ride cancelled for free.');
      setRideId(null);
      setRideStatus(null);
      setRideCreatedAt(null);
      setCancelSecondsRemaining(0);
    } catch (err) {
      console.error(err);
      setMessage('Unable to cancel ride. Please try again.');
    }
  };

  const shareTrip = () => {
    if (!rideId) return;
    const message = `🚗 I'm on BuddyRide! Driver ${driverName ?? 'Driver'} (${carPlate ?? 'Plate pending'}) is taking me from ${pickupAddress || 'my pickup'} to ${dropoffAddress || 'my destination'}. Track me: https://buddyride1.vercel.app/track/${rideId} - ETA ${driverEtaMinutes ?? 0} mins. Fare: ${formatR(fare ?? estimatedFare)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  // Center the live map over every known point: pickup, dropoff, and the driver (once assigned).
  const knownPoints = [tripPickupLocation, tripDropoffLocation, driverLocation].filter(
    (point): point is { lat: number; lng: number } => point != null
  );
  const driverDistanceKm = driverLocation && tripPickupLocation
    ? calcDistance(driverLocation.lat, driverLocation.lng, tripPickupLocation.lat, tripPickupLocation.lng)
    : null;
  const driverEtaMinutes = driverDistanceKm == null ? null : Math.max(1, Math.ceil((driverDistanceKm / 30) * 60));
  const liveMapCenter =
    knownPoints.length > 0
      ? {
          lat: knownPoints.reduce((sum, p) => sum + p.lat, 0) / knownPoints.length,
          lng: knownPoints.reduce((sum, p) => sum + p.lng, 0) / knownPoints.length,
        }
      : DEFAULT_CENTER;

  const handleMapClick = (lat: number, lng: number) => {
    const location = { lat, lng };
    setIsLocationLocked(true);
    setUserLocation(location);
    setMapLocation(location);
    setSearchText('Pinned location');
    scheduleReverseGeocode(location);
  };

  const tripMarkers: AppMapMarker[] = isActiveTrip
    ? [
        ...(tripPickupLocation ? [{ id: 'pickup', position: [tripPickupLocation.lat, tripPickupLocation.lng] as [number, number], color: '#1a73e8', emoji: 'A' }] : []),
        ...(tripDropoffLocation ? [{ id: 'dropoff', position: [tripDropoffLocation.lat, tripDropoffLocation.lng] as [number, number], color: '#d93025', emoji: 'B' }] : []),
        ...(driverLocation ? [{ id: 'driver', position: [driverLocation.lat, driverLocation.lng] as [number, number], color: '#00C853', emoji: '🚕' }] : []),
      ]
    : [];

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
          {!rideId && !isActiveTrip && (
            <div className="flex gap-2 p-2 bg-gray-100 rounded-xl mb-3">
              <button type="button" onClick={() => selectMode('ride')} className={`flex-1 rounded-lg py-2 text-sm font-bold ${mode === 'ride' ? 'bg-black text-white' : 'bg-white text-gray-700'}`}>
                🚗 Ride
              </button>
              <button type="button" onClick={() => selectMode('send')} className={`flex-1 rounded-lg py-2 text-sm font-bold ${mode === 'send' ? 'bg-black text-white' : 'bg-white text-gray-700'}`}>
                📦 Send
              </button>
            </div>
          )}
          {isActiveTrip && (
            <>
              <p className="text-center text-sm mb-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg py-2 px-3">
                {tripType === 'send' && (rideStatus === 'accepted' || rideStatus === 'in_progress')
                  ? 'Driver is delivering your parcel'
                  : STATUS_BANNER[rideStatus!] ?? 'Ride in progress'}
              </p>
              {isShareableTrip && (
                <div className="mb-3 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  {driverPhotoUrl ? (
                    <img src={driverPhotoUrl} alt="Driver" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-lg font-bold text-white">
                      {(driverName ?? 'D').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{driverName ?? 'Driver'}</p>
                    <p className="truncate text-xs">{carPlate ?? 'Plate pending'} • Rating {driverRating.toFixed(1)}★</p>
                    {driverPhone && <a href={`tel:${driverPhone}`} className="text-xs font-semibold text-green-800 underline">Call {driverPhone}</a>}
                  </div>
                  <button type="button" onClick={shareTrip} className="rounded-lg border border-green-700 px-3 py-2 text-sm font-bold text-green-800 hover:bg-green-100">
                    🛡️ Share Trip
                  </button>
                </div>
              )}
              <div className="bg-white border border-gray-200 rounded-lg py-2 px-3 mb-3 text-sm text-gray-700">
                {tripDistanceKm != null && <span>Distance: {tripDistanceKm.toFixed(1)} km • </span>}
                <span>Fare: {formatR((baseFare ?? totalFare ?? fare ?? 0) + pickupWaitFare + waitingFare)}</span>
              </div>
              {rideStatus === 'arrived_at_pickup' && (
                <p className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-center text-sm font-semibold text-orange-800">
                  {pickupWaitSeconds <= 180
                    ? `Driver has arrived - 3 min free wait: ${Math.floor((180 - pickupWaitSeconds) / 60)}:${String((180 - pickupWaitSeconds) % 60).padStart(2, '0')}`
                    : `Waiting: ${Math.floor(pickupWaitSeconds / 60)}:${String(pickupWaitSeconds % 60).padStart(2, '0')} - Extra ${formatR(pickupWaitFare)}`}
                </p>
              )}
              {rideStatus === 'in_progress' && (
                <p className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-center text-sm font-semibold text-orange-800">
                  Driver waiting: {Math.floor(waitingSeconds / 60)}:{String(waitingSeconds % 60).padStart(2, '0')} - Extra {formatR(waitingFare)} (R1/min after 3 min)
                </p>
              )}
              {driverDistanceKm != null && driverEtaMinutes != null && (
                <p className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-center text-sm font-semibold text-green-800">
                  Driver is {driverDistanceKm.toFixed(1)} km away - ETA {driverEtaMinutes} min{driverEtaMinutes === 1 ? '' : 's'}
                </p>
              )}
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

          <div className="relative h-[70vh] w-full overflow-hidden rounded-lg">
            <AppMap
              mode="passenger"
              center={isActiveTrip ? [liveMapCenter.lat, liveMapCenter.lng] : [mapLocation.lat, mapLocation.lng]}
              zoom={14}
              markers={tripMarkers}
              onMapClick={isActiveTrip || rideId ? undefined : handleMapClick}
            />

            {!rideId && !isActiveTrip && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full text-3xl">
                📍
              </div>
            )}
          </div>

            {!rideId && !isActiveTrip && (
              <div className="relative z-20 -mt-28 px-3 pb-3">
                <div className="pointer-events-auto rounded-2xl bg-white p-3 shadow-xl">
                  <div className="mb-3 space-y-2">
                    {stops.map((stop, index) => (
                      <div key={stop.id} className="flex items-center gap-2">
                        <button type="button" onClick={() => selectStop(index)} className={`w-5 text-sm font-bold ${activeStopIndex === index ? 'text-orange-600' : 'text-gray-400'}`} aria-label={`Select stop ${index + 1}`}>
                          {index === 0 ? '●' : index === stops.length - 1 ? '■' : '○'}
                        </button>
                        <button type="button" onClick={() => selectStop(index)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-gray-700">
                          {stop.address || (index === 0 ? 'Pickup location' : index === stops.length - 1 ? 'Where to?' : `Add stop ${index}`)}
                        </button>
                        {index > 0 && index < stops.length - 1 && <button type="button" onClick={() => removeStop(index)} className="text-sm font-bold text-red-600" aria-label={`Remove stop ${index}`}>Remove</button>}
                      </div>
                    ))}
                    {stops.length < 4 && <button type="button" onClick={addStop} className="text-sm font-bold text-orange-600">+ Add stop</button>}
                  </div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {activeStopIndex === 0 ? 'Set pickup location' : activeStopIndex === stops.length - 1 ? 'Set destination' : `Set stop ${activeStopIndex}`}
                  </p>
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder={activeStopIndex === 0 ? 'Where are you?' : activeStopIndex === stops.length - 1 ? 'Where to?' : `Add stop ${activeStopIndex}`}
                    className="w-full truncate overflow-hidden text-ellipsis whitespace-nowrap rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 shadow-sm"
                  />
                  {locationStep === 'pickup' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void useCurrentLocation()}
                        disabled={locating || isLocationLocked}
                        className="mt-2 w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60"
                      >
                        {locating ? 'Locating...' : userLocation ? 'Refresh location' : 'Use my current location'}
                      </button>
                      {locationAccuracy != null && (
                        <p className={`mt-2 text-center text-xs font-semibold ${locationAccuracy <= 50 ? 'text-green-700' : 'text-orange-700'}`}>
                          GPS Accuracy: {Math.round(locationAccuracy)}m {locationAccuracy <= 50 ? 'OK' : 'Needs improvement'}
                        </p>
                      )}
                      {isLocationLocked && (
                        <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-gray-600">
                          <LockKeyhole size={14} /> Pickup location locked
                        </p>
                      )}
                    </>
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
                  {nominatimResults.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto border-t border-gray-100 pt-1">
                      {nominatimResults.map((result) => (
                        <button
                          key={`${result.lat}-${result.lon}`}
                          type="button"
                          onClick={() => selectNominatimResult(result)}
                          className="block w-full truncate px-2 py-2 text-left text-sm text-gray-700 hover:bg-orange-50"
                        >
                          {shortAddress(result.display_name)}
                        </button>
                      ))}
                    </div>
                  )}
                  {mapAddress && (
                    <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{activeStopIndex === 0 ? 'Pickup' : activeStopIndex === stops.length - 1 ? 'Destination' : `Stop ${activeStopIndex}`}</p>
                      <p className="font-bold truncate">{shortAddress(mapAddress)}</p>
                      <p className="truncate text-xs text-gray-500">{mapAddress}</p>
                      <button
                        type="button"
                        onClick={confirmMapLocation}
                        className="mt-3 w-full rounded-xl bg-orange-500 py-3 font-bold text-white hover:bg-orange-600"
                      >
                        Confirm {activeStopIndex === 0 ? 'Pickup' : activeStopIndex === stops.length - 1 ? 'Destination' : `Stop ${activeStopIndex}`}
                      </button>
                    </div>
                  )}
                  {!mapAddress && searchText && (
                    <button type="button" onClick={() => setMapAddress(searchText)} className="mt-2 w-full rounded-xl bg-gray-100 py-2 text-sm font-semibold text-gray-700">
                      Set location on map
                    </button>
                  )}
                  {locationStep === 'dropoff' && pickupAddress && (
                    <p className="mt-2 truncate text-xs text-gray-500">Pickup: {shortAddress(pickupAddress)}</p>
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
              {mode === 'ride' && (
                <>
                  <div className="flex gap-3 overflow-x-auto pb-3 snap-x scrollbar-hide px-2">
                    {RIDE_CATEGORIES.filter((cat) => !('isDelivery' in cat && cat.isDelivery)).map((cat) => {
                      const selected = rideCategory === cat.id;
                      const price = cat.base + (distanceKm ?? 0) * cat.perKm + BOOKING_FEE + extrasFee;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => selectCategory(cat.id)}
                          className={`min-w-[120px] snap-start rounded-xl p-3 border-2 flex flex-col items-center ${selected ? 'border-black bg-black text-white' : 'border-gray-200 bg-white'}`}
                        >
                          <div className="text-2xl">{cat.emoji}</div>
                          <div className="font-bold text-sm mt-1">{cat.name.replace('Buddy ', '')}</div>
                          <div className="text-xs opacity-70">👤 {cat.maxPassengers}</div>
                          <div className="text-xs mt-1">{formatR(price)}</div>
                          {'popular' in cat && cat.popular && <span className="text-[10px] bg-black text-white px-2 rounded mt-1">POPULAR</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mb-3">
                    <select value={passengerCount} onChange={(event) => setPassengerCount(Number(event.target.value))} className="rounded border px-2 text-sm">
                      {Array.from({ length: 7 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} pax</option>)}
                    </select>
                  </div>
                  <p className="mb-2 font-semibold text-gray-700">Add extras</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.entries(RIDE_EXTRAS) as Array<[keyof typeof RIDE_EXTRAS, (typeof RIDE_EXTRAS)[keyof typeof RIDE_EXTRAS]]>).map(([key, extra]) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg bg-white p-2 text-sm"><input type="checkbox" checked={selectedExtras.includes(key)} onChange={() => setSelectedExtras((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} /> <span>{extra.icon} {extra.label} +{formatR(extra.fee)}</span></label>
                    ))}
                  </div>
                  <p>Distance: {distance}</p>
                  <p>Ride {formatR(ridePrice)} + Booking {formatR(BOOKING_FEE)}{extrasFee > 0 ? ` + Extras ${formatR(extrasFee)}` : ''} = {formatR(roundedTotal)}</p>
                  {rideCategory === 'xl' && passengerCount === 6 && selectedExtras.includes('luggage') && <p className="mt-2 font-semibold text-green-700">Perfect for airport trip</p>}
                </>
              )}
              {mode === 'send' && (
                <>
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800">📦 Buddy Send - parcel delivery</p>
                  <input
                    value={packageDescription}
                    onChange={(event) => setPackageDescription(event.target.value)}
                    placeholder="What are you sending? (e.g. Documents, Food, Keys)"
                    className="mb-2 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-800"
                  />
                  <div className="mb-2 grid gap-2 sm:grid-cols-2">
                    <input
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                      placeholder="Recipient name"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-800"
                    />
                    <input
                      value={recipientPhone}
                      onChange={(event) => setRecipientPhone(event.target.value)}
                      placeholder="Recipient phone number"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-800"
                    />
                  </div>
                  <p className="mb-1 text-sm font-semibold text-gray-700">Package size</p>
                  <div className="mb-2 flex gap-2">
                    {(['small', 'medium', 'large'] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setPackageSize(size)}
                        className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize ${packageSize === size ? 'bg-black text-white' : 'bg-white text-gray-700'}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <p className="mb-2 text-xs italic text-gray-600">Driver will call recipient</p>
                  <p className="mb-1 text-sm font-semibold text-gray-700">Payment</p>
                  <div className="mb-2 flex gap-2">
                    {(['cash', 'card'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setSendPaymentMethod(method)}
                        className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize ${sendPaymentMethod === method ? 'bg-black text-white' : 'bg-white text-gray-700'}`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                  <p>Distance: {distance}</p>
                  <p>Delivery {formatR(estimatedFare - BOOKING_FEE)} + Booking {formatR(BOOKING_FEE)} = {formatR(roundedTotal)}</p>
                </>
              )}
            </div>
          )}

          {isCompleted && (
            <div className="text-center mb-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg py-3 px-3">
              <p className="mb-2">Trip Complete. Pay {formatR(fare ?? 0)} cash to driver</p>
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
              {rideId && <TripReceipt rideId={rideId} fare={fare ?? 0} driverId={driverId} paymentMethod={paymentMethod} />}
            </div>
          )}
          {message && (
            <p className="text-center text-sm mb-3 bg-green-50 text-green-700 border border-green-200 rounded-lg py-2 px-3">
              {message}
            </p>
          )}
          {!rideId && stops.every((stop) => stop.lat != null && stop.lng != null) && (
            <button
              onClick={handleRequestClick}
              disabled={requesting}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl mt-3"
            >
              {mode === 'send' ? <span>📦</span> : <CarIcon size={20} />}{' '}
              {requesting
                ? 'Requesting...'
                : mode === 'send'
                  ? `Send Parcel - ${formatR(roundedTotal)}`
                  : `Request BuddyRide - ${formatR(roundedTotal)}`}
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

