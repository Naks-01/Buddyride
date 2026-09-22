import { lazy, Suspense, useEffect, useRef, useState, type TouchEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from '../../lib/supabaseDb';
import {
  Car as CarPin,
  HelpCircle,
  Home as HomeNav,
  MapPin,
  Menu,
  Navigation as NavigationIcon,
  Phone,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Wallet,
} from 'lucide-react';
import { auth, db } from '../../lib/supabaseDb';
import { useAuth } from '../../context/AuthContext';
import { BOOKING_FEE, DRIVER_RATE } from '../../config/pricing';
import { CANCELLATION, COMMISSION_RATE } from '../../config/pricing';
import { calcDistance } from '../../lib/maps';
import { initMapbox, MAPBOX_TOKEN } from '../../lib/mapbox';
import { startRequestLoop, stopRequestLoop } from '../../utils/sound';
import { DriverDrawer } from '../../components/driver/DriverDrawer';
import { RideChat } from '../../components/RideChat';

const DriverMapLeaflet = lazy(() => import('../../components/Map/DriverMapLeaflet'));
import DriverMapMapbox from '../../components/Map/DriverMapMapbox';
import {
  acceptRide as acceptRideService,
  cancelRide as cancelRideService,
  completeRide as completeRideService,
  markArrived,
  startTrip as startTripService,
  subscribeToRequestedRides,
  subscribeToRide,
  updateRideFields,
} from '../../lib/rideService';
import { RIDE_CATEGORIES } from '../../config/categories';

// Statuses during which the driver's live GPS position should keep broadcasting to the ride doc.
const LOCATION_SHARING_STATUSES = new Set(['driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started']);
// Statuses during which the map goes fullscreen and the bottom sheet becomes a minimized nav bar.
const ACTIVE_NAV_STATUSES = new Set(['driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started']);


type Location = { placeId?: string; address?: string; name?: string; description?: string; lat?: number; lng?: number };
type Stop = { id: string; address: string; lat: number | null; lng: number | null };

type RideRequest = {
  id: string;
  pickup?: string | Location;
  dropoff?: string | Location;
  pickupLatLng?: { lat: number; lng: number };
  dropoffLatLng?: { lat: number; lng: number };
  distance?: string | number;
  fare?: number;
  price?: number;
  status?: string;
  passengerId?: string;
  driverId?: string | null;
  driverPhone?: string | null;
  passengerPhone?: string | null;
  extras?: string[];
  extrasFee?: number;
  category?: string;
  createdAt?: unknown;
  arrivedAt?: unknown;
  tipAmount?: number;
  type?: 'ride' | 'send';
  passengerCount?: number;
  packageDescription?: string;
  recipientName?: string;
  recipientPhone?: string;
  packageSize?: 'small' | 'medium' | 'large';
  stops?: Stop[];
  currentStopIndex?: number;
  stopArrivalTime?: unknown;
  waitingSeconds?: number;
  waitingFare?: number;
  pickupWaitSeconds?: number;
  pickupWaitFare?: number;
  baseFare?: number;
  totalFare?: number;
  cancelledBy?: string;
  cancelReason?: string;
};

type Coordinates = { lat: number; lng: number };

// Driver must be within this radius of the pickup pin to confirm arrival (accounts for GPS drift).
const ARRIVAL_RADIUS_KM = 0.2;

function toMillis(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return typeof value === 'number' ? value : null;
}

function getLocationCoordinates(location?: string | Location, fallback?: Coordinates): Coordinates | null {
  if (location && typeof location !== 'string' && typeof location.lat === 'number' && typeof location.lng === 'number') {
    return { lat: location.lat, lng: location.lng };
  }
  return fallback ?? null;
}

// Firestore for this project is provisioned in the africa-south1 region.
export function DriverDashboard() {
  const { loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const user = auth.currentUser;
  const [driverProfile, setDriverProfile] = useState<Record<string, unknown> | null>(null);
  const [rides, setRides] = useState<RideRequest[]>([]);
  const [acceptedRide, setAcceptedRide] = useState<RideRequest | null>(null);
  const [isAccepted, setIsAccepted] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [waitSecondsRemaining, setWaitSecondsRemaining] = useState(0);
  const [stopWaitingSeconds, setStopWaitingSeconds] = useState(0);
  const tipToastRef = useRef<string | null>(null);
  const knownRideIdsRef = useRef<Set<string>>(new Set());
  const [isOnline, setIsOnline] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [toast, setToast] = useState('');
  const [checkingArrival, setCheckingArrival] = useState(false);
  const [followTrigger, setFollowTrigger] = useState(0);
  const [routeDistanceM, setRouteDistanceM] = useState<number | null>(null);
  const [routeDurationSec, setRouteDurationSec] = useState<number | null>(null);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [passengerName, setPassengerName] = useState('Passenger');
  const sheetTouchStartY = useRef<number | null>(null);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('Location granted', pos.coords);
        setDriverLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationError(null);
        navigator.geolocation.watchPosition((p) => {
          setDriverLocation({ lat: p.coords.latitude, lng: p.coords.longitude });
        });
      },
      (err) => {
        console.error(err);
        if (err.code === 1) {
          setLocationError('PERMISSION_DENIED');
          alert('Please tap the lock icon in address bar and Allow Location, then refresh');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  const toggleOnline = async () => {
    const next = !isOnline;
    setIsOnline(next);
    if (next) requestLocation();
  };

  const handleGoOffline = async () => {
    if (!window.confirm('Stop receiving rides? You will go offline')) return;
    setIsOnline(false);
    setRides([]);
    stopRequestLoop();
  };

  useEffect(() => {
    if ('Notification' in window) void Notification.requestPermission();
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    const loadTodayEarnings = async () => {
      try {
        const snapshot = await getDocs(query(collection(db, 'rides'), where('driverId', '==', user.uid), where('status', '==', 'completed')));
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const total = snapshot.docs.reduce((sum, rideSnapshot) => {
          const data = rideSnapshot.data() as Record<string, unknown>;
          const completedAtValue = data.completedAt ?? data.completed_at;
          const completedAt = completedAtValue instanceof Date
            ? completedAtValue
            : typeof completedAtValue === 'string'
              ? new Date(completedAtValue)
              : toMillis(completedAtValue) != null
                ? new Date(toMillis(completedAtValue) as number)
                : null;
          if (!completedAt || Number.isNaN(completedAt.getTime()) || completedAt < startOfToday) return sum;
          return sum + Number(data.fare ?? data.totalFare ?? data.price ?? data.total_fare ?? 0);
        }, 0);
        setTodayEarnings(total);
      } catch (earningsError) {
        console.error('Failed to load today earnings:', earningsError);
      }
    };
    void loadTodayEarnings();
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading) return;

    const loadDriverProfile = async () => {
      try {
        const { data, error: authError } = await auth.getUser();
        if (authError) {
          console.error('DRIVER PROFILE ERROR:', JSON.stringify(authError, null, 2));
          throw authError;
        }
        const authenticatedUser = data.user;
        if (!authenticatedUser) return;

        const driver = {
          ...(profile ?? {}),
          id: authenticatedUser.id,
          uid: authenticatedUser.id,
          email: profile?.email ?? authenticatedUser.email ?? null,
          role: profile?.role ?? 'driver',
        };
        setDriverProfile(driver);
      } catch (error: any) {
        console.error('DRIVER PROFILE ERROR:', JSON.stringify(error, null, 2));
        setError(error?.message || 'Failed to load driver profile.');
      }
    };

    void loadDriverProfile();
  }, [authLoading]);

  useEffect(() => {
    if (authLoading || !user || !isOnline) {
      setRides([]);
      stopRequestLoop();
      return;
    }

    try {
    const unsubscribe = subscribeToRequestedRides(
      (snapshot: any) => {
        const nextRides = snapshot.docs
          .map((d: any) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as RideRequest));
        setRides(nextRides);

        const newRides = nextRides.filter((ride: RideRequest) => !knownRideIdsRef.current.has(ride.id));
        knownRideIdsRef.current = new Set(nextRides.map((ride: RideRequest) => ride.id));

        if (!acceptedRide && nextRides.length > 0) {
          startRequestLoop();
        } else {
          stopRequestLoop();
        }

        for (const _ride of newRides) {
          if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('New ride');
            } catch (notificationError) {
              console.log(notificationError);
            }
          }
        }
      },
      (err: any) => {
        console.error('REAL RIDE REQUEST READ ERROR:', JSON.stringify(err, null, 2));
        setError(err?.message || 'Failed to load ride requests.');
      },
    );
    return () => unsubscribe();
    } catch (err) {
      console.error('Failed to subscribe to ride requests:', err);
      setError('Failed to load ride requests.');
      return undefined;
    }
  }, [authLoading, user, isOnline]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const openRideNavigation = (ride: RideRequest) => {
    const pickup = getLocationCoordinates(ride.pickup, ride.pickupLatLng);
    if (!pickup) {
      setError('Pickup location is missing coordinates.');
      return;
    }
    const destination = `${pickup.lat},${pickup.lng}`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
    const nativeNavigationUrl = `google.navigation:q=${destination}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      window.setTimeout(() => {
        window.location.href = nativeNavigationUrl;
      }, 150);
    }
  };

  const acceptRide = async (ride: RideRequest) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setAccepting(ride.id);
    stopRequestLoop();
    try {
      const location = await getDriverLocation();
      try {
        await acceptRideService(ride.id, {
          driverId: uid,
          driverName: profile?.full_name || auth.currentUser?.displayName || 'Driver',
          driverPhone: auth.currentUser?.phoneNumber ?? null,
          driverPhotoUrl: auth.currentUser?.photoURL ?? null,
          carPlate: profile?.vehicle_plate ?? null,
          driverCar: profile?.vehicle_model ?? null,
          driverPlate: profile?.vehicle_plate ?? null,
          driverRating: Number(driverProfile?.avgRating ?? 4.9),
          ...(location && {
            driverLocation: { ...location, updatedAt: serverTimestamp() },
            driverStatus: 'coming',
          }),
        });
      } catch (acceptError) {
        console.error('Failed to accept ride with driver details:', JSON.stringify(acceptError));
        await updateRideFields(ride.id, { status: 'driver_assigned' });
      }
      const nextAcceptedRide = { ...ride, status: 'driver_assigned' };
      setAcceptedRide(nextAcceptedRide);
      setIsAccepted(true);
      showToast('Ride Accepted! Navigating to pickup...');
      window.setTimeout(() => openRideNavigation(ride), 800);
      window.setTimeout(() => {
        setAcceptedRide((prev) => {
          if (!prev || prev.id !== ride.id || prev.status !== 'driver_assigned') return prev;
          void updateRideFields(ride.id, { status: 'driver_en_route', driverStatus: 'coming' }).catch((err: unknown) => {
            console.error('Failed to update ride status:', err);
          });
          return { ...prev, status: 'driver_en_route' };
        });
      }, 3000);
      await navigateToPickup(nextAcceptedRide);
    } catch (err) {
      console.error('Failed to accept ride:', JSON.stringify(err));
      setError('Failed to accept ride.');
    } finally {
      setAccepting(null);
    }
  };

  // Keep the accepted ride's status in sync as the passenger and driver progress through the ride.
  useEffect(() => {
    if (!acceptedRide) return;
    let unsubscribe: () => void = () => {};
    try {
      unsubscribe = subscribeToRide(
        acceptedRide.id,
        (snapshot: any) => {
          const data = snapshot.data() as Record<string, unknown> | undefined;
          if (!data) return;
          const tipAmount = Number(data.tipAmount ?? 0);
          if (tipAmount > 0 && tipToastRef.current !== `${acceptedRide.id}:${tipAmount}`) {
            tipToastRef.current = `${acceptedRide.id}:${tipAmount}`;
            setError(`You received R${tipAmount.toFixed(2)} tip!`);
          }
          setAcceptedRide((prev) => (prev ? { ...prev, ...data } : prev));
        },
        (err: unknown) => {
          console.error('Failed to load accepted ride:', err);
          setError('Failed to load accepted ride details.');
        },
      );
    } catch (err) {
      console.error('Failed to subscribe to accepted ride:', err);
      setError('Failed to load accepted ride details.');
    }
    return () => unsubscribe();
  }, [acceptedRide?.id]);

  useEffect(() => {
    const pickup = acceptedRide ? getLocationCoordinates(acceptedRide.pickup, acceptedRide.pickupLatLng) : null;
    const currentStop = acceptedRide?.stops?.[acceptedRide.currentStopIndex ?? 1];
    const destination = acceptedRide?.status === 'trip_started'
      ? currentStop && currentStop.lat != null && currentStop.lng != null
        ? { lat: currentStop.lat, lng: currentStop.lng }
        : acceptedRide ? getLocationCoordinates(acceptedRide.dropoff, acceptedRide.dropoffLatLng) : null
      : pickup;
    const origin = acceptedRide?.status === 'trip_started' ? pickup : driverLocation;
    if (!acceptedRide || !origin || !destination) {
      setRoutePath([]);
      setRouteDistanceM(null);
      setRouteDurationSec(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 6000);
    const loadRoadRoute = async () => {
      try {
        const token = initMapbox().accessToken;
        if (!token) {
          console.error('Mapbox token missing');
          setRoutePath([]);
          return;
        }
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&access_token=${encodeURIComponent(token)}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Mapbox Directions request failed with ${response.status}`);
        const data = await response.json() as { routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: Array<[number, number]> } }> };
        const route = data.routes?.[0];
        const coordinates = route?.geometry?.coordinates ?? [];
        if (!route || !coordinates.length) throw new Error('OSRM returned no route geometry');
        setRoutePath(coordinates.map(([lng, lat]) => [lat, lng] as [number, number]));
        setRouteDistanceM(typeof route.distance === 'number' ? route.distance : null);
        setRouteDurationSec(typeof route.duration === 'number' ? route.duration : null);
      } catch (routeError) {
        if ((routeError as Error).name === 'AbortError') return;
        console.error('Failed to load road route:', routeError);
        setRoutePath([[origin.lat, origin.lng], [destination.lat, destination.lng]]);
      }
    };
    void loadRoadRoute();
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [acceptedRide?.id, acceptedRide?.status, acceptedRide?.pickup, acceptedRide?.pickupLatLng, acceptedRide?.dropoff, acceptedRide?.dropoffLatLng, acceptedRide?.currentStopIndex, acceptedRide?.stops, driverLocation?.lat, driverLocation?.lng]);

  const [updatingStatus, setUpdatingStatus] = useState(false);

  const declineRide = async (ride: RideRequest) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    stopRequestLoop();
    setUpdatingStatus(true);
    try {
      await updateRideFields(ride.id, { status: 'declined', declinedBy: uid, declinedReason: 'driver_not_equipped' });
    } catch (err) {
      console.error(err);
      setError('Failed to update ride status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const markArrivedAtPickup = async (ride: RideRequest) => {
    setError('');
    const pickup = getLocationCoordinates(ride.pickup, ride.pickupLatLng);
    setCheckingArrival(true);
    const location = await getDriverLocation();
    setCheckingArrival(false);

    if (!location) {
      setError('Enable location access to confirm you are at the pickup point.');
      return;
    }
    const distanceKm = pickup ? calcDistance(location.lat, location.lng, pickup.lat, pickup.lng) : null;
    if (distanceKm != null && distanceKm > ARRIVAL_RADIUS_KM) {
      setError(`You must be within ${ARRIVAL_RADIUS_KM * 1000}m of the pickup point to confirm arrival (currently ${(distanceKm * 1000).toFixed(0)}m away).`);
      return;
    }

    // Update local state immediately so the Start Trip button appears without waiting on the snapshot round-trip.
    setAcceptedRide((prev) => (prev ? { ...prev, status: 'driver_arrived', arrivedAt: Date.now() } : prev));
    setUpdatingStatus(true);
    try {
      await markArrived(ride.id, ride.passengerId, {
        driverLocation: location,
        ...(distanceKm != null && { arrivalDistanceM: distanceKm * 1000 }),
      });
    } catch (err) {
      console.error(err);
      setError('Failed to update ride status.');
    } finally {
      setUpdatingStatus(false);
    }
  };
  const driverCancelRide = async (ride: RideRequest) => {
    setUpdatingStatus(true);
    try {
      const arrivedAt = toMillis(ride.arrivedAt);
      const waitedLongEnough = arrivedAt != null && Date.now() - arrivedAt >= CANCELLATION.DRIVER_WAIT_MIN * 60 * 1000;
      if (waitedLongEnough) {
        await cancelRideService(ride.id, {
          cancellationFee: CANCELLATION.NO_SHOW_FEE,
          cancellationPlatformCut: CANCELLATION.NO_SHOW_FEE * COMMISSION_RATE,
          cancellationDriverPayout: CANCELLATION.NO_SHOW_FEE * DRIVER_RATE,
          cancellationReason: 'passenger_no_show',
          cancelledBy: 'driver',
          cancelReason: 'Passenger no-show',
        });
      } else {
        await cancelRideService(ride.id, {
          status: 'cancelled_by_driver',
          cancellationFee: 0,
          cancellationReason: 'driver_cancelled',
          driverPenalty: true,
        });
      }
    } catch (err) {
      console.error(err);
      setError('Failed to update ride status.');
    } finally {
      setUpdatingStatus(false);
    }
    setAcceptedRide(null);
    setIsAccepted(false);
  };

  useEffect(() => {
    if (acceptedRide?.status !== 'driver_arrived') {
      setWaitSecondsRemaining(0);
      return;
    }
    const updateWait = () => {
      const arrivedAt = toMillis(acceptedRide.arrivedAt);
      setWaitSecondsRemaining(Math.max(0, (arrivedAt == null ? CANCELLATION.DRIVER_WAIT_MIN * 60 : Math.ceil((arrivedAt + CANCELLATION.DRIVER_WAIT_MIN * 60 * 1000 - Date.now()) / 1000))));
    };
    updateWait();
    const timer = window.setInterval(updateWait, 1000);
    return () => window.clearInterval(timer);
  }, [acceptedRide?.status, acceptedRide?.arrivedAt]);

  const waitFare = (seconds: number) => seconds > 180 ? Math.ceil((seconds - 180) / 60) : 0;

  // Pickup wait timer: 3 min free, then R1/min - persisted to Firestore every 10s so the passenger sees it too.
  const [pickupWaitSeconds, setPickupWaitSeconds] = useState(0);
  useEffect(() => {
    const arrivedAt = toMillis(acceptedRide?.arrivedAt);
    if (!acceptedRide || acceptedRide.status !== 'driver_arrived' || arrivedAt == null) {
      setPickupWaitSeconds(0);
      return;
    }
    const updatePickupWait = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - arrivedAt) / 1000));
      setPickupWaitSeconds(elapsed);
      if (elapsed > 0 && elapsed % 10 === 0) {
        const pickupWaitFare = waitFare(elapsed);
        void updateRideFields(acceptedRide.id, {
          pickupWaitSeconds: elapsed,
          pickupWaitFare,
          totalFare: Number(acceptedRide.baseFare ?? acceptedRide.totalFare ?? acceptedRide.price ?? 0) + pickupWaitFare,
        }).catch((err: unknown) => {
          console.error('Failed to update pickup waiting fare:', err);
        });
      }
    };
    updatePickupWait();
    const timer = window.setInterval(updatePickupWait, 1000);
    return () => window.clearInterval(timer);
  }, [acceptedRide?.id, acceptedRide?.status, acceptedRide?.arrivedAt]);

  const startTrip = async (ride: RideRequest) => {
    setAcceptedRide((prev) => (prev ? { ...prev, status: 'trip_started', currentStopIndex: 1, stopArrivalTime: null, waitingSeconds: 0 } : prev));
    setUpdatingStatus(true);
    try {
      await startTripService(ride.id, { currentStopIndex: 1, stopArrivalTime: null, waitingSeconds: 0, waitingFare: 0, driverStatus: 'on_trip' });
    } catch (err) {
      console.error(err);
      setError('Failed to update ride status.');
    } finally {
      setUpdatingStatus(false);
    }
    await navigateToDestination(ride);
  };
  const completeTrip = (ride: RideRequest) => {
    setAcceptedRide((prev) => (prev ? { ...prev, status: 'completed' } : prev));
    const fare = Number(ride.fare ?? ride.totalFare ?? ride.price ?? 0);
    setTodayEarnings((prev) => prev + fare);
    void completeRideService(ride.id);
  };

  const arriveAtStop = async (ride: RideRequest) => {
    setAcceptedRide((prev) => (prev ? { ...prev, stopArrivalTime: Date.now(), waitingSeconds: 0 } : prev));
    await updateRideFields(ride.id, { stopArrivalTime: serverTimestamp(), waitingSeconds: 0 });
  };

  const continueToNextStop = async (ride: RideRequest) => {
    const currentStopIndex = ride.currentStopIndex ?? 1;
    setAcceptedRide((prev) => (prev ? { ...prev, currentStopIndex: currentStopIndex + 1, stopArrivalTime: undefined } : prev));
    await updateRideFields(ride.id, {
      currentStopIndex: currentStopIndex + 1,
      stopArrivalTime: null,
      waitingSeconds: stopWaitingSeconds,
      waitingFare: waitFare(stopWaitingSeconds),
      totalFare: Number(ride.baseFare ?? ride.totalFare ?? ride.price ?? 0) + waitFare(stopWaitingSeconds),
    });
    setStopWaitingSeconds(0);
    await navigateToDestination({ ...ride, currentStopIndex: currentStopIndex + 1, stopArrivalTime: null });
  };

  useEffect(() => {
    const arrivedAt = toMillis(acceptedRide?.stopArrivalTime);
    if (!acceptedRide || acceptedRide.status !== 'trip_started' || arrivedAt == null) {
      setStopWaitingSeconds(0);
      return;
    }

    const updateWaitingTime = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - arrivedAt) / 1000));
      setStopWaitingSeconds(elapsed);
      if (elapsed > 0 && elapsed % 10 === 0) {
        const waitingFare = waitFare(elapsed);
        void updateRideFields(acceptedRide.id, {
          waitingSeconds: elapsed,
          waitingFare,
          totalFare: Number(acceptedRide.baseFare ?? acceptedRide.totalFare ?? acceptedRide.price ?? 0) + waitingFare,
        }).catch((err: unknown) => {
          console.error('Failed to update stop waiting fare:', err);
          setError('Unable to update stop waiting time.');
        });
      }
    };
    updateWaitingTime();
    const timer = window.setInterval(updateWaitingTime, 1000);
    return () => window.clearInterval(timer);
  }, [acceptedRide?.id, acceptedRide?.status, acceptedRide?.stopArrivalTime]);

  const navigateTo = async (_destination: Coordinates, _origin?: Coordinates) => {
    setFollowTrigger((prev) => prev + 1);
  };

  const getDriverLocation = (): Promise<Coordinates | undefined> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(undefined);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setError('Please enable location access to continue.');
          }
          resolve(undefined);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });

  // Single source of truth for the driver's live position - Bolt-style: poll every 5s with
  // getCurrentPosition (not a continuous watchPosition) and only write when accuracy is good
  // enough to trust, straight onto the ride doc so the passenger's onSnapshot listener picks it
  // up with zero extra reads/writes beyond the existing ride-status subscription.
  useEffect(() => {
    if (!acceptedRide || !LOCATION_SHARING_STATUSES.has(acceptedRide.status ?? '') || !navigator.geolocation) return;

    const rideId = acceptedRide.id;
    const tick = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (position.coords.accuracy > 50) return; // too imprecise to trust - skip this tick
          void updateDoc(doc(db, 'rides', rideId), {
            driverLat: position.coords.latitude,
            driverLng: position.coords.longitude,
            driverSpeed: position.coords.speed ?? null,
            driverUpdatedAt: serverTimestamp(),
          }).catch((err: unknown) => {
            console.error('Failed to update driver location:', err);
            setError('Unable to share your live location.');
          });
        },
        (err) => {
          console.error('Failed to get driver location:', err);
          setError('Location permission is required to share your route.');
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    };

    tick();
    const intervalId = window.setInterval(tick, 5000);
    return () => window.clearInterval(intervalId);
  }, [acceptedRide?.id, acceptedRide?.status]);

  // Clear the nav overlay once the ride ends (completed/cancelled/dismissed).
  const lastRideIdForCleanupRef = useRef<string | null>(null);
  useEffect(() => {
    if (acceptedRide?.id) lastRideIdForCleanupRef.current = acceptedRide.id;
  }, [acceptedRide?.id]);
  useEffect(() => {
    if (!acceptedRide) {
      setRouteDistanceM(null);
      setRouteDurationSec(null);
      lastRideIdForCleanupRef.current = null;
    }
  }, [acceptedRide]);

  // Bottom sheet starts minimized on every new ride and re-minimizes when the phase changes (pickup -> trip).
  useEffect(() => {
    setSheetExpanded(false);
  }, [acceptedRide?.id, acceptedRide?.status]);

  // Passenger display name for the nav bottom sheet (ride doc itself has no name field).
  useEffect(() => {
    const passengerId = acceptedRide?.passengerId;
    if (!passengerId) {
      setPassengerName('Passenger');
      return;
    }
    let cancelled = false;
    void getDoc(doc(db, 'users', passengerId)).then((snapshot) => {
      if (cancelled) return;
      const data = snapshot.data() as Record<string, unknown> | undefined;
      setPassengerName((data?.full_name as string) || (data?.name as string) || 'Passenger');
    });
    return () => {
      cancelled = true;
    };
  }, [acceptedRide?.passengerId]);

  const navigateToPickup = async (ride: RideRequest) => {
    const pickup = getLocationCoordinates(ride.pickup, ride.pickupLatLng);
    if (!pickup) {
      setError('Pickup location is missing coordinates.');
      return;
    }
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance('Navigating to pickup location'));
    await navigateTo(pickup, await getDriverLocation());
  };

  const navigateToDestination = async (ride: RideRequest) => {
    const currentStopIndex = ride.currentStopIndex ?? 1;
    const currentStop = ride.stops?.[currentStopIndex];
    const pickup = getLocationCoordinates(ride.pickup, ride.pickupLatLng);
    const destination = currentStop && currentStop.lat != null && currentStop.lng != null
      ? { lat: currentStop.lat, lng: currentStop.lng }
      : getLocationCoordinates(ride.dropoff, ride.dropoffLatLng);
    if (!destination) {
      setError('Destination is missing coordinates.');
      return;
    }
    await navigateTo(destination, pickup ?? undefined);
  };

  // Whichever point the driver should currently be heading to: pickup pre-trip, dropoff/current stop once trip_started.
  const getCurrentNavTarget = (ride: RideRequest): Coordinates | null => {
    if (ride.status === 'trip_started') {
      const currentStopIndex = ride.currentStopIndex ?? 1;
      const currentStop = ride.stops?.[currentStopIndex];
      if (currentStop && currentStop.lat != null && currentStop.lng != null) return { lat: currentStop.lat, lng: currentStop.lng };
      return getLocationCoordinates(ride.dropoff, ride.dropoffLatLng);
    }
    return getLocationCoordinates(ride.pickup, ride.pickupLatLng);
  };

  const finishRide = () => {
    setAcceptedRide(null);
    setIsAccepted(false);
  };

  // Dismisses the full-screen RIDE CANCELLED overlay (e.g. passenger cancelled while driver was en route).
  const clearCancelledRide = () => {
    setAcceptedRide(null);
    setIsAccepted(false);
  };

  if (authLoading) {
    return <div className="min-h-screen bg-[#121212] p-8 text-white">Loading...</div>;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  if (!user) {
    navigate('/login?role=driver', { replace: true });
    return null;
  }

  const hasActiveOverlay = Boolean(acceptedRide) || rides.length > 0;
  const isActiveNav = Boolean(acceptedRide && ACTIVE_NAV_STATUSES.has(acceptedRide.status ?? ''));
  const isTripPhase = acceptedRide?.status === 'trip_started';
  const mapContainerClass = acceptedRide?.status === 'driver_assigned' || acceptedRide?.status === 'driver_en_route' || acceptedRide?.status === 'driver_arrived' || acceptedRide?.status === 'trip_started'
    ? 'fixed inset-0 h-screen w-screen z-20 rounded-none'
    : isOnline
      ? 'h-[70vh] w-full rounded-2xl'
      : 'h-[40vh] w-full rounded-2xl';
  const navTarget = acceptedRide ? getCurrentNavTarget(acceptedRide) : null;
  const routeDistanceKm = routeDistanceM != null ? (routeDistanceM / 1000).toFixed(1) : null;
  const routeEtaMin = routeDurationSec != null ? Math.max(1, Math.round(routeDurationSec / 60)) : null;
  const formatLoc = (loc?: string | Location) => {
    if (!loc) return '—';
    if (typeof loc === 'string') return loc;
    return loc.address ?? loc.name ?? loc.description ?? '—';
  };
  const handleSheetTouchStart = (e: TouchEvent) => {
    sheetTouchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const handleSheetTouchEnd = (e: TouchEvent) => {
    const startY = sheetTouchStartY.current;
    sheetTouchStartY.current = null;
    if (startY == null) return;
    const deltaY = (e.changedTouches[0]?.clientY ?? startY) - startY;
    if (deltaY < -30) setSheetExpanded(true);
    else if (deltaY > 30) setSheetExpanded(false);
  };

  const displayRide = acceptedRide ?? rides[0] ?? null;
  const displayPickup = displayRide ? getLocationCoordinates(displayRide.pickup, displayRide.pickupLatLng) : null;
  const displayDropoff = displayRide ? getLocationCoordinates(displayRide.dropoff, displayRide.dropoffLatLng) : null;
  const displayFare = displayRide ? Number(displayRide.fare ?? displayRide.totalFare ?? displayRide.price ?? 0) : 0;
  const displayPickupLabel = displayRide ? formatLoc(displayRide.pickup) : 'Waiting for a ride request';
  const displayDropoffLabel = displayRide ? formatLoc(displayRide.dropoff) : 'Go online to receive rides';

  return (
    <>
      <div className="relative h-screen overflow-hidden bg-[#F6F7F9] text-[#171717]">
        {acceptedRide?.status === 'cancelled' && (
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-red-600 p-6 text-center text-white">
            <h1 className="mb-5 text-4xl font-black">RIDE CANCELLED</h1>
            <p className="mb-2 text-xl">{acceptedRide.cancelledBy === 'passenger' ? 'Cancelled by passenger' : 'Cancelled by driver'}</p>
            <p className="text-base opacity-90">{acceptedRide.cancelReason || 'No reason provided'}</p>
            <button onClick={clearCancelledRide} className="mt-8 rounded-xl bg-white px-10 py-3 text-lg font-bold text-red-600">OK, Got it</button>
          </div>
        )}

        <header className={`relative z-30 flex h-16 items-center justify-between rounded-b-2xl bg-white px-4 shadow-sm transition-all duration-300 ease-in-out ${isAccepted ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
          <button type="button" onClick={() => setIsDrawerOpen(true)} aria-label="Open driver menu" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#171717]"><Menu size={26} /></button>
          <span className="text-lg font-bold">{isOnline ? 'Online' : 'Offline'}</span>
          <button type="button" role="switch" aria-checked={isOnline} aria-label={isOnline ? 'Go offline' : 'Go online'} onClick={() => (isOnline ? void handleGoOffline() : void toggleOnline())} className={`relative h-9 w-16 rounded-full p-1 transition-all duration-300 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}>
            <span className={`absolute left-1 top-1 h-7 w-7 rounded-full bg-white shadow transition-transform duration-300 ${isOnline ? 'translate-x-7' : 'translate-x-0'}`} />
          </button>
        </header>

        <DriverDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} profile={profile} driverProfile={driverProfile} driverId={user.uid} todayEarnings={todayEarnings} isOnline={isOnline} onGoOffline={() => void handleGoOffline()} />

        <main className="relative mx-auto flex h-[calc(100vh-4rem)] w-full max-w-xl flex-col gap-4 overflow-hidden px-4 py-4">
          <section className={`transition-all duration-500 ease-in-out ${mapContainerClass} overflow-hidden bg-[#DDE4E8] shadow-sm`}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-gray-500">Loading map...</div>}>
              {MAPBOX_TOKEN && (
                <DriverMapMapbox
                  driver={driverLocation}
                  pickup={displayPickup}
                  dropoff={displayDropoff}
                  followTrigger={followTrigger}
                  routePath={routePath}
                />
              )}
            </Suspense>
          </section>

          <section className={`rounded-2xl bg-white p-5 shadow-sm transition-all duration-500 ${isAccepted ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-center text-[32px] font-black leading-none text-[#171717]">R{displayFare.toFixed(2)}</p>
                <div className="mt-5 space-y-4">
                  <div className="flex items-start gap-3"><MapPin size={22} className="mt-0.5 shrink-0 text-green-600" /><p className="text-sm text-gray-700"><span className="font-bold">Pickup</span> • {displayPickupLabel}</p></div>
                  <div className="flex items-start gap-3"><MapPin size={22} className="mt-0.5 shrink-0 text-red-600" /><p className="text-sm text-gray-700"><span className="font-bold">Dropoff</span> • {displayDropoffLabel}</p></div>
                </div>
              </div>
              <div className="flex w-24 shrink-0 flex-col items-center gap-1 text-center"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-600"><UserRound size={20} /></div><p className="text-[11px] font-semibold leading-tight text-gray-600">Passenger • {passengerName}</p></div>
            </div>
          </section>

          {!isAccepted && error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {!isAccepted && locationError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><p>Location permission is required.</p><button onClick={requestLocation} className="mt-2 font-bold underline">Enable location</button></div>}
          {!isAccepted && toast && <div className="rounded-xl bg-[#171717] px-4 py-3 text-center text-sm font-semibold text-white">{toast}</div>}
          {!displayRide && <p className="rounded-xl bg-white px-4 py-5 text-center text-sm text-gray-500 shadow-sm">{isOnline ? 'Waiting for nearby ride requests...' : 'Turn on Go Online to receive rides.'}</p>}

          {displayRide && !acceptedRide && <div className={`flex flex-col gap-3 transition-all duration-500 ${isAccepted ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
            <button type="button" onClick={() => void acceptRide(displayRide)} disabled={accepting === displayRide.id} className="h-14 w-full rounded-xl bg-[#FF5500] text-base font-bold text-white shadow-sm disabled:opacity-60">{accepting === displayRide.id ? 'Accepting...' : 'Accept Ride'}</button>
            <button type="button" onClick={() => openRideNavigation(displayRide)} className="h-14 w-full rounded-xl border-2 border-[#FF5500] bg-white text-base font-bold text-[#FF5500]">Open in Maps</button>
            <button type="button" onClick={() => void declineRide(displayRide)} className="self-center px-3 py-3 text-sm text-[#666] underline">Decline</button>
          </div>}

          {acceptedRide && !isAccepted && <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><p className="font-bold text-[#171717]">{acceptedRide.status === 'completed' ? 'Ride completed' : `Status: ${acceptedRide.status?.split('_').join(' ')}`}</p><button type="button" onClick={() => setFollowTrigger((prev) => prev + 1)} aria-label="Recenter route" className="rounded-lg p-2 text-[#FF5500]"><NavigationIcon size={20} /></button></div>
            <div className="flex flex-col gap-3">
              {(acceptedRide.status === 'driver_assigned' || acceptedRide.status === 'driver_en_route') && <button type="button" onClick={() => void markArrivedAtPickup(acceptedRide)} disabled={updatingStatus || checkingArrival} className="h-12 rounded-xl bg-[#FF5500] font-bold text-white disabled:opacity-60">{checkingArrival ? 'Checking location...' : 'Arrived at Pickup'}</button>}
              {acceptedRide.status === 'driver_arrived' && <button type="button" onClick={() => void startTrip(acceptedRide)} disabled={updatingStatus} className="h-12 rounded-xl bg-[#FF5500] font-bold text-white disabled:opacity-60">Start Trip</button>}
              {isTripPhase && <button type="button" onClick={() => completeTrip(acceptedRide)} disabled={updatingStatus} className="h-12 rounded-xl bg-[#FF5500] font-bold text-white disabled:opacity-60">Complete Trip</button>}
              {acceptedRide.status !== 'completed' && <button type="button" onClick={() => void driverCancelRide(acceptedRide)} disabled={updatingStatus} className="h-12 rounded-xl border border-gray-300 bg-white font-semibold text-gray-600 disabled:opacity-60">Cancel Ride</button>}
              {acceptedRide.status === 'completed' && <button type="button" onClick={finishRide} className="h-12 rounded-xl bg-gray-100 font-bold text-gray-700">Done</button>}
            </div>
          </section>}
        </main>

        {acceptedRide && isAccepted && (
          <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 px-4 py-4 text-white drop-shadow-lg">
            <button type="button" onClick={() => setIsAccepted(false)} aria-label="Minimize navigation" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-xl">←</button>
            <div className="rounded-full bg-black/55 px-4 py-2 text-sm font-semibold backdrop-blur-sm">
              Driving to pickup {routeDistanceKm ? `• ${routeDistanceKm} km` : ''} {routeEtaMin ? `• ${routeEtaMin} min` : ''}
            </div>
          </div>
        )}

        {acceptedRide && isAccepted && (
          <section className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl bg-white p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.2)] transition-transform duration-500 ease-out">
            <button type="button" onClick={() => setIsAccepted(false)} aria-label="Minimize map" className="absolute right-4 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600">
              <span className="text-xl leading-none">×</span>
            </button>
            <div className="pr-10">
              <div className="flex items-center gap-2 text-lg font-bold text-gray-900"><span className="h-3 w-3 animate-pulse rounded-full bg-green-500" />Driving to pickup</div>
              <p className="mt-2 text-sm text-gray-600">{displayPickupLabel}</p>
              <p className="mt-1 text-sm font-semibold text-gray-800">Customer: {passengerName}</p>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <button type="button" onClick={() => openRideNavigation(acceptedRide)} className="h-12 rounded-xl bg-[#FF5500] font-bold text-white">Open Navigation</button>
              <button type="button" onClick={() => void markArrivedAtPickup(acceptedRide)} disabled={updatingStatus || checkingArrival} className="h-12 rounded-xl border-2 border-green-500 bg-white font-bold text-green-600 disabled:opacity-60">{checkingArrival ? 'Checking location...' : 'Arrived at Pickup'}</button>
            </div>
            <button type="button" onClick={() => void driverCancelRide(acceptedRide)} className="mt-4 w-full py-2 text-center text-sm text-gray-600 underline">Cancel Ride</button>
          </section>
        )}

        {acceptedRide && <RideChat rideId={acceptedRide.id} currentUserId={user.uid} currentUserRole="driver" rideStatus={acceptedRide.status} />}
      </div>
      {acceptedRide && false && ((acceptedRide: RideRequest) => {
        return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#121212] text-white">
      {acceptedRide?.status === 'cancelled' && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#FF0000',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          <h1 style={{ fontSize: '48px', fontWeight: 900, marginBottom: '20px' }}>RIDE CANCELLED</h1>
          <p style={{ fontSize: '20px', marginBottom: '10px' }}>
            {acceptedRide.cancelledBy === 'passenger' ? 'Cancelled by passenger' : 'Cancelled by driver'}
          </p>
          <p style={{ fontSize: '16px', opacity: 0.9 }}>{acceptedRide.cancelReason || 'No reason provided'}</p>
          <button
            onClick={clearCancelledRide}
            style={{
              marginTop: '30px',
              background: 'white',
              color: 'red',
              padding: '15px 40px',
              borderRadius: '30px',
              fontSize: '18px',
              fontWeight: 'bold',
              border: 'none',
            }}
          >
            OK, Got it
          </button>
        </div>
      )}
      <div className={`absolute inset-x-0 top-0 z-0 ${isActiveNav ? 'bottom-0' : 'bottom-[72px]'}`}>
        <Suspense fallback={<div className="h-full w-full bg-[#0a0a0a]" />}>
          {driverLocation && navTarget ? (
            <DriverMapLeaflet driver={driverLocation} dropoff={navTarget} followTrigger={followTrigger} />
          ) : (
            <div className="h-full w-full bg-slate-200" />
          )}
        </Suspense>
      </div>

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-4 pointer-events-none">
        <div className="h-11 w-11" aria-hidden="true" />
        {!isActiveNav && (
          <div className="pointer-events-auto flex flex-col items-center rounded-full bg-[#3A3D45] px-5 py-2 shadow-lg">
            <span className="text-base font-bold leading-none text-white">R {todayEarnings.toFixed(2)}</span>
            <span className="text-[11px] text-gray-400">Today</span>
          </div>
        )}
        <button type="button" aria-label="Safety" className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white shadow-lg backdrop-blur-xl">
          <ShieldCheck size={20} />
        </button>
      </div>
      {/* Hamburger gets its own top-left container so it never sits under the map debug badge/controls. */}
      <div className="absolute z-[60]" style={{ top: 12, left: 12 }}>
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          aria-label="Menu"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white shadow-lg backdrop-blur-xl"
        >
          <Menu size={20} />
        </button>
      </div>


      <DriverDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        profile={profile}
        driverProfile={driverProfile}
        driverId={user.uid}
        todayEarnings={todayEarnings}
        isOnline={isOnline}
        onGoOffline={() => void handleGoOffline()}
      />

      {error && (
        <div className="absolute inset-x-4 top-20 z-30 rounded-lg border border-red-500 bg-red-900/90 px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}

      {locationError && (
        <div style={{ background: 'red', padding: '15px', borderRadius: '10px' }} className="absolute inset-x-4 top-20 z-30 shadow-lg">
          <p>Location permission is required</p>
          <button
            onClick={requestLocation}
            style={{ background: 'white', color: 'red', padding: '10px 20px', borderRadius: '20px', fontWeight: 'bold' }}
          >
            🔓 TAP TO ENABLE LOCATION
          </button>
        </div>
      )}

      <div
        className={`absolute right-4 z-20 flex flex-col gap-3 pointer-events-auto ${
          isActiveNav ? (sheetExpanded ? 'bottom-[46vh]' : 'bottom-[104px]') : 'bottom-24'
        }`}
      >
        {!hasActiveOverlay && (
          <button type="button" aria-label="Filter" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3A3D45] text-white shadow-lg">
            <SlidersHorizontal size={20} />
          </button>
        )}
      </div>

      {acceptedRide && (
        <RideChat
          rideId={acceptedRide.id}
          currentUserId={user.uid}
          currentUserRole="driver"
          rideStatus={acceptedRide.status}
        />
      )}

      {!isOnline && !hasActiveOverlay && (
        <button
          type="button"
          onClick={() => void toggleOnline()}
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00C853] px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-[#00b34b] pointer-events-auto"
        >
          GO ONLINE
        </button>
      )}

      {isOnline && !hasActiveOverlay && (
        <div className="absolute left-1/2 top-24 z-10 flex -translate-x-1/2 flex-col items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 rounded-full bg-[#00C853] px-6 py-2 font-bold text-white shadow-lg">
            <span className="h-2 w-2 rounded-full bg-white" /> You're online
          </div>
          <button
            type="button"
            onClick={() => void handleGoOffline()}
            className="rounded-full border border-red-500 bg-[#1E2128] px-6 py-2 text-sm font-bold text-red-500 shadow-lg"
          >
            Go Offline
          </button>
        </div>
      )}

      {!acceptedRide && rides.length > 0 && (
        <div className="absolute inset-x-0 bottom-[4.5rem] z-30 max-h-[40vh] overflow-y-auto rounded-t-[20px] bg-[#121212] px-4 pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.35)]">
          <div className="space-y-3 pb-2">
            {rides.map((ride) => (
              <div key={ride.id} className="rounded-2xl bg-white p-4 shadow-2xl">
                <RideDetails ride={ride} />
                <PassengerBadge passengerId={ride.passengerId} revealed={false} />
                <p className="mb-3 text-sm text-gray-500">Passenger: {ride.passengerId ?? 'test123'}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => navigateToPickup(ride)}
                    className="w-full rounded-lg border border-orange-500 py-2 font-bold text-orange-600 hover:bg-orange-50"
                  >
                    Open in Maps
                  </button>
                  <button
                    onClick={() => void acceptRide(ride)}
                    disabled={accepting === ride.id}
                    className="w-full rounded-lg bg-orange-500 py-2 font-bold text-white disabled:opacity-60"
                  >
                    {accepting === ride.id ? 'Accepting...' : 'Accept Ride'}
                  </button>
                  <button type="button" onClick={() => void declineRide(ride)} className="w-full rounded-lg border border-red-500 py-2 font-bold text-red-600 hover:bg-red-50">
                    Decline if not equipped
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {acceptedRide && isActiveNav && (
        <div
          className={`absolute inset-x-0 bottom-0 z-30 rounded-t-[24px] border border-white/10 border-b-0 bg-black/70 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-[max-height] duration-300 ${
            sheetExpanded ? 'max-h-[75vh] overflow-y-auto' : 'h-[90px] overflow-hidden'
          }`}
          onTouchStart={handleSheetTouchStart}
          onTouchEnd={handleSheetTouchEnd}
        >
          <button
            type="button"
            onClick={() => setSheetExpanded((v) => !v)}
            className="flex w-full flex-col items-center pt-2 pb-1"
            aria-label={sheetExpanded ? 'Collapse ride details' : 'Expand ride details'}
          >
            <span className="h-1 w-10 rounded-full bg-white/30" />
          </button>

          <div className="px-4 pb-3">
            <div className="flex items-center justify-between gap-2 text-white">
              <span className="max-w-[38%] truncate text-sm font-bold">
                {isTripPhase ? 'Trip in progress' : passengerName}
              </span>
              <span className="max-w-[38%] truncate text-xs text-white/60">
                {isTripPhase ? 'Dropoff: ' : 'Pickup: '}
                {formatLoc(isTripPhase ? acceptedRide.dropoff : acceptedRide.pickup)}
              </span>
              <span className="whitespace-nowrap text-xs font-semibold text-white/50">
                {routeDistanceKm != null ? `${routeDistanceKm}km` : '—'}
                {routeEtaMin != null ? ` · ETA ${routeEtaMin}min` : ''}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <a
                href={`tel:${acceptedRide.passengerPhone ?? ''}`}
                className="flex items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/5 py-2 text-xs font-bold text-white"
              >
                <Phone size={14} /> CALL
              </a>
              <button
                type="button"
                onClick={() => setFollowTrigger((prev) => prev + 1)}
                title="Center the OSM map on the route"
                className="flex items-center justify-center gap-1 rounded-lg bg-[#FF6B00] py-2 text-xs font-bold text-white shadow-[0_0_18px_rgba(255,107,0,0.28)]"
              >
                <NavigationIcon size={14} /> NAVIGATE
              </button>
              {(acceptedRide.status === 'driver_assigned' || acceptedRide.status === 'driver_en_route') && (
                <button
                  type="button"
                  onClick={() => void markArrivedAtPickup(acceptedRide)}
                  disabled={updatingStatus || checkingArrival}
                  className="rounded-lg bg-[#FF6B00] py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {checkingArrival ? '...' : 'ARRIVED'}
                </button>
              )}
              {acceptedRide.status === 'driver_arrived' && (
                <button
                  type="button"
                  onClick={() => void startTrip(acceptedRide)}
                  disabled={updatingStatus}
                  className="rounded-lg bg-[#FF6B00] py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  START TRIP
                </button>
              )}
              {isTripPhase && (() => {
                const stops = acceptedRide.stops ?? [];
                const currentStopIndex = acceptedRide.currentStopIndex ?? 1;
                const hasNextStop = currentStopIndex < stops.length - 1;
                if (!hasNextStop) {
                  return (
                    <button
                      type="button"
                      onClick={() => completeTrip(acceptedRide)}
                      disabled={updatingStatus}
                      className="rounded-lg bg-[#FF6B00] py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      COMPLETE TRIP
                    </button>
                  );
                }
                return acceptedRide.stopArrivalTime ? (
                  <button
                    type="button"
                    onClick={() => void continueToNextStop(acceptedRide)}
                    disabled={updatingStatus}
                    className="rounded-lg bg-[#FF6B00] py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    CONTINUE
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void arriveAtStop(acceptedRide)}
                    disabled={updatingStatus}
                    className="rounded-lg bg-[#FF6B00] py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    ARRIVED AT STOP
                  </button>
                );
              })()}
            </div>
          </div>

          {sheetExpanded && (
            <div className="px-4 pb-4">
              <section className="mb-2 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl">
                <h2 className="mb-3 text-lg font-bold text-white">Accepted Ride</h2>
                <RideDetails ride={acceptedRide} />
                <PassengerBadge passengerId={acceptedRide.passengerId} revealed />
                {acceptedRide.status === 'driver_arrived' && (
                  <>
                    <div className="mt-2 rounded-lg border border-[#FF6B00]/30 bg-[#FF6B00]/10 px-3 py-2 text-center text-sm font-semibold text-[#FF9A52]">
                      {pickupWaitSeconds <= 180
                        ? `Free wait: ${Math.floor((180 - pickupWaitSeconds) / 60)}:${String((180 - pickupWaitSeconds) % 60).padStart(2, '0')} remaining`
                        : `Waiting: ${Math.floor(pickupWaitSeconds / 60)}:${String(pickupWaitSeconds % 60).padStart(2, '0')} - Extra R${waitFare(pickupWaitSeconds)}`}
                    </div>
                    <p className="mt-2 text-center text-sm font-semibold text-[#FF9A52]">
                      {waitSecondsRemaining > 0
                        ? `Wait ${Math.floor(waitSecondsRemaining / 60)}:${String(waitSecondsRemaining % 60).padStart(2, '0')} before marking no-show`
                        : 'Passenger no-show is available'}
                    </p>
                    {waitSecondsRemaining === 0 && (
                      <button
                        onClick={() => void driverCancelRide(acceptedRide)}
                        disabled={updatingStatus}
                        className="mt-2 w-full rounded-lg bg-red-600 py-3 font-bold text-white disabled:opacity-60"
                      >
                        Passenger no-show (R20)
                      </button>
                    )}
                  </>
                )}
                {(acceptedRide.status === 'driver_assigned' || acceptedRide.status === 'driver_en_route' || acceptedRide.status === 'driver_arrived') && (
                  <button
                    onClick={() => void driverCancelRide(acceptedRide)}
                    disabled={updatingStatus}
                    className="mt-2 w-full rounded-lg border border-red-400/60 py-2 font-semibold text-red-300 disabled:opacity-60"
                  >
                    Cancel Ride (no fee before wait)
                  </button>
                )}
                {isTripPhase && (() => {
                  const stops = acceptedRide.stops ?? [];
                  const currentStopIndex = acceptedRide.currentStopIndex ?? 1;
                  const hasNextStop = currentStopIndex < stops.length - 1;
                  const waitingFare = waitFare(stopWaitingSeconds);
                  return hasNextStop && acceptedRide.stopArrivalTime ? (
                    <p className="mt-2 text-center text-sm font-semibold text-[#FF9A52]">
                      Waiting: {Math.floor(stopWaitingSeconds / 60)}:{String(stopWaitingSeconds % 60).padStart(2, '0')} (R{waitingFare})
                    </p>
                  ) : null;
                })()}
              </section>
            </div>
          )}
        </div>
      )}

      {acceptedRide && !isActiveNav && (
        <div className="absolute inset-x-0 bottom-[4.5rem] z-30 max-h-[40vh] overflow-y-auto rounded-t-[20px] bg-[#121212] px-4 pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.35)]">
          <section className="mb-2 rounded-2xl border border-green-200 bg-white p-4 shadow-2xl">
            <h2 className="mb-3 text-lg font-bold text-green-900">Ride Complete</h2>
            <RideDetails ride={acceptedRide} />
            <PassengerBadge passengerId={acceptedRide.passengerId} revealed />
            {acceptedRide.status === 'completed' && (
              <div className="mt-3 space-y-2">
                <p className="text-center text-sm font-semibold text-green-800">
                  Collect R{Number(acceptedRide.fare ?? acceptedRide.price ?? 0).toFixed(2)} + R{Number(acceptedRide.tipAmount ?? 0).toFixed(2)} tip = R{(Number(acceptedRide.fare ?? acceptedRide.price ?? 0) + Number(acceptedRide.tipAmount ?? 0)).toFixed(2)} cash
                </p>
                <button
                  onClick={finishRide}
                  className="w-full rounded-lg bg-gray-200 py-2 font-bold text-gray-700 hover:bg-gray-300"
                >
                  Done
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {!isActiveNav && (
        <div className="absolute inset-x-0 bottom-0 z-[9999] flex items-center justify-around bg-[#2A2D36] py-3 pointer-events-auto">
          <button
            type="button"
            onClick={() => navigate('/driver')}
            className={`flex flex-col items-center gap-1 ${location.pathname === '/driver' ? 'text-white' : 'text-gray-400'}`}
          >
            <HomeNav size={20} />
            <span className="text-[11px] font-semibold">Home</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/driver/performance')}
            className={`flex flex-col items-center gap-1 ${location.pathname === '/driver/performance' ? 'text-white' : 'text-gray-400'}`}
          >
            <Wallet size={20} />
            <span className="text-[11px]">Earn more</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/driver/rides')}
            className={`flex flex-col items-center gap-1 ${location.pathname === '/driver/rides' ? 'text-white' : 'text-gray-400'}`}
          >
            <CarPin size={20} />
            <span className="text-[11px]">Rides</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/driver/help')}
            className={`flex flex-col items-center gap-1 ${location.pathname === '/driver/help' ? 'text-white' : 'text-gray-400'}`}
          >
            <HelpCircle size={20} />
            <span className="text-[11px]">Help</span>
          </button>
        </div>
      )}
    </div>
        );
      })(acceptedRide!)}
    </>
  );
}

function PassengerBadge({ passengerId, revealed }: { passengerId?: string | null; revealed: boolean }) {
  const [passenger, setPassenger] = useState<{ verificationStatus?: string; selfieUrl?: string } | null>(null);

  useEffect(() => {
    if (!passengerId) return;
    void getDoc(doc(db, 'users', passengerId)).then((snapshot) => {
      if (snapshot.exists()) setPassenger(snapshot.data());
    });
  }, [passengerId]);

  const verified = passenger?.verificationStatus === 'verified';

  return (
    <div className="mb-3 flex items-center gap-2">
      {passenger?.selfieUrl && (
        <img
          src={passenger.selfieUrl}
          alt="Passenger"
          className="h-9 w-9 rounded-full object-cover"
          style={{ filter: revealed ? 'none' : 'blur(6px)' }}
        />
      )}
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
          verified ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
        }`}
      >
        {verified ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
        {verified ? 'Verified' : 'Unverified'}
      </span>
    </div>
  );
}

function RideDetails({ ride }: { ride: RideRequest }) {
  const formatLocation = (loc?: string | Location) => {
    if (!loc) return '—';
    if (typeof loc === 'string') return loc;
    return loc.address ?? loc.name ?? loc.description ?? JSON.stringify(loc);
  };
  const total = Number(ride.fare ?? ride.price ?? 0);
  const driverPayout = Math.max(total - BOOKING_FEE, 0) * DRIVER_RATE;
  const tipAmount = Number(ride.tipAmount ?? 0);
  const extrasFee = Number(ride.extrasFee ?? 0);
  const isSend = ride.type === 'send';
  const rideCategoryMeta = RIDE_CATEGORIES.find((c) => c.id === ride.category);
  const extraLabels = (ride.extras ?? []).map((extra) => extra === 'pet' ? 'Pet' : extra === 'luggage' ? 'Luggage' : extra === 'childSeat' ? 'Child seat' : 'Extra stop');
  return (
    <div className="space-y-1 text-sm text-gray-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${isSend ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
          {isSend ? `📦 SEND${ride.packageSize ? ` (${ride.packageSize})` : ''}` : `👤 ${ride.passengerCount ?? 1}`}
        </span>
        {!isSend && rideCategoryMeta && (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
            {rideCategoryMeta.emoji} {rideCategoryMeta.name}
          </span>
        )}
      </div>
      <p><span className="font-semibold">Pickup:</span> {formatLocation(ride.pickup)}</p>
      {(ride.stops ?? []).slice(1, -1).map((stop, index) => (
        <p key={stop.id}><span className="font-semibold">Stop {index + 1}:</span> {stop.address}</p>
      ))}
      <p><span className="font-semibold">Dropoff:</span> {formatLocation(ride.dropoff)}</p>
      <p><span className="font-semibold">Distance:</span> {typeof ride.distance === 'number' ? `${ride.distance} km` : ride.distance ?? '—'}</p>
      {isSend && (
        <>
          {ride.packageDescription && <p><span className="font-semibold">Sending:</span> {ride.packageDescription}</p>}
          {ride.recipientName && <p><span className="font-semibold">Recipient:</span> {ride.recipientName}</p>}
          {ride.recipientPhone && (
            <p>
              <span className="font-semibold">Recipient phone:</span>{' '}
              <a href={`tel:${ride.recipientPhone}`} className="font-semibold text-orange-600 underline">{ride.recipientPhone}</a>
              {' '}<span className="text-xs text-gray-500">(call on arrival)</span>
            </p>
          )}
        </>
      )}
      <p><span className="font-semibold">Fare:</span> R{total.toFixed(2)}</p>
      <p className="font-semibold text-green-700">You earn: R{driverPayout.toFixed(2)} (80%)</p>
      {extraLabels.length > 0 && <p className="font-semibold text-orange-700">⚠️ {extraLabels.join(' + ')}</p>}
      {extrasFee > 0 && <p>Extras: R{extrasFee.toFixed(2)} (you get R{(extrasFee * DRIVER_RATE).toFixed(2)})</p>}
      <p>Tip (100%): R{tipAmount.toFixed(2)}</p>
      <p className="font-semibold text-green-700">Total you get: R{(driverPayout + tipAmount).toFixed(2)}</p>
    </div>
  );
}

