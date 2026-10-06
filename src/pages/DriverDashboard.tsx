import { lazy, Suspense, useEffect, useRef, useState, type TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from '../../lib/supabaseDb';
import {
  MapPin,
  Menu,
  Navigation as NavigationIcon,
  Phone,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { auth, db } from '../../lib/supabaseDb';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { BOOKING_FEE, DRIVER_RATE } from '../../config/pricing';
import { CANCELLATION } from '../../config/pricing';
import { calcDistance } from '../../lib/maps';
import { initMapbox } from '../../lib/mapbox';
import { startRequestLoop, stopRequestLoop } from '../../utils/sound';
import { DriverDrawer } from '../../components/driver/DriverDrawer';
import { RideChat } from '../../components/RideChat';
import ThemeToggle from '../../components/ThemeToggle';

const DriverMapLeaflet = lazy(() => import('../../components/Map/DriverMapLeaflet'));
import DriverMapMapbox from '../../components/Map/DriverMapMapbox';
import {
  RIDE_STATUS,
  acceptRide as acceptRideService,
  completeRide as completeRideService,
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
  const user = auth.currentUser;
  const [driverProfile, setDriverProfile] = useState<Record<string, unknown> | null>(null);
  const [rides, setRides] = useState<RideRequest[]>([]);
  const [acceptedRide, setAcceptedRide] = useState<RideRequest | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [waitSecondsRemaining, setWaitSecondsRemaining] = useState(0);
  const [stopWaitingSeconds, setStopWaitingSeconds] = useState(0);
  const tipToastRef = useRef<string | null>(null);
  const knownRideIdsRef = useRef<Set<string>>(new Set());
  const handledCancellationRef = useRef<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [toast, setToast] = useState('');
  const [drivingMode, setDrivingMode] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(true);
  const [followTrigger, setFollowTrigger] = useState(0);
  const [routeDistanceM, setRouteDistanceM] = useState<number | null>(null);
  const [routeDurationSec, setRouteDurationSec] = useState<number | null>(null);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const lastMapboxRouteAtRef = useRef(0);
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(null);
  const driverLocationRef = useRef<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [passengerName, setPassengerName] = useState('Passenger');
  const sheetTouchStartY = useRef<number | null>(null);
  const mapTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const navigationHistoryRef = useRef(false);
  const dismissedNavigationRideRef = useRef<string | null>(null);

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
    if (authLoading || !user?.id) return;
    const controller = new AbortController();
    let active = true;

    const loadTodayEarnings = async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, 'rides'), where('driver_id', '==', user.id), where('status', '==', 'completed')),
          { signal: controller.signal },
        );
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
        if (active && !controller.signal.aborted) setTodayEarnings(total);
      } catch (earningsError) {
        if (controller.signal.aborted) return;
        console.error('Failed to load today earnings:', earningsError);
      }
    };
    void loadTodayEarnings();
    const intervalId = window.setInterval(() => void loadTodayEarnings(), 5000);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [authLoading, user?.id]);

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
      },
    );
    return () => unsubscribe();
    } catch (err) {
      console.error('Failed to subscribe to ride requests:', err);
      return undefined;
    }
  }, [authLoading, user?.id, isOnline, acceptedRide?.id]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const acceptRide = async (ride: RideRequest) => {
    const uid = auth.currentUser?.id;
    if (!uid) return;
    setAccepting(ride.id);
    stopRequestLoop();
    try {
      const location = await getDriverLocation();
      try {
        await acceptRideService(ride.id, {
          driver_id: uid,
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
        await updateRideFields(ride.id, { status: RIDE_STATUS.DRIVER_ASSIGNED, driver_id: uid });
      }
      const nextAcceptedRide = { ...ride, status: 'driver_assigned' };
      dismissedNavigationRideRef.current = null;
      setSheetVisible(true);
      setSheetExpanded(false);
      setAcceptedRide(nextAcceptedRide);
      setDrivingMode(true);
      showToast('Ride Accepted! Navigating to pickup...');
      window.setTimeout(() => {
        setAcceptedRide((prev) => {
          if (!prev || prev.id !== ride.id || prev.status !== 'driver_assigned') return prev;
          void updateRideFields(ride.id, { status: RIDE_STATUS.EN_ROUTE, driverStatus: 'coming' }).catch((err: unknown) => {
            console.error('Failed to update ride status:', err);
          });
          return { ...prev, status: 'driver_en_route' };
        });
      }, 3000);
      setFollowTrigger((prev) => prev + 1);
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
          const status = typeof data.status === 'string' ? data.status : '';
          if (status === 'cancelled' || status.startsWith('cancelled')) {
            const cancelledBy = data.cancelledBy ?? data.cancelled_by;
            const cancellationKey = `${acceptedRide.id}:${status}:${cancelledBy}`;
            if (handledCancellationRef.current !== cancellationKey) {
              handledCancellationRef.current = cancellationKey;
              if (cancelledBy === 'passenger') window.alert('Passenger cancelled');
              setAcceptedRide((prev) => (
                prev
                  ? {
                      ...prev,
                      ...data,
                      status: 'cancelled',
                      cancelledBy: String(cancelledBy ?? prev.cancelledBy ?? 'passenger'),
                      cancelReason: String(data.cancelReason ?? data.cancel_reason ?? prev.cancelReason ?? 'No reason provided'),
                    }
                  : prev
              ));
              setDrivingMode(false);
              setIsOnline(true);
            }
            return;
          }
          const tipAmount = Number(data.tipAmount ?? 0);
          if (tipAmount > 0 && tipToastRef.current !== `${acceptedRide.id}:${tipAmount}`) {
            tipToastRef.current = `${acceptedRide.id}:${tipAmount}`;
            setError(`You received R${tipAmount.toFixed(2)} tip!`);
          }
          setAcceptedRide((prev) => {
            if (!prev || prev.id !== acceptedRide.id) return prev;
            return {
              ...prev,
              ...data,
              status: typeof data.status === 'string' ? data.status : prev.status,
              arrivedAt: data.arrivedAt ?? data.arrived_at ?? prev.arrivedAt,
            };
          });
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
    if (!acceptedRide) {
      dismissedNavigationRideRef.current = null;
      return;
    }
    if (['driver_assigned', 'accepted', 'arrived', 'driver_arrived', 'driver_en_route'].includes(acceptedRide.status ?? '')
      && dismissedNavigationRideRef.current !== acceptedRide.id) {
      setDrivingMode(true);
      setSheetVisible(true);
    }
  }, [acceptedRide?.id, acceptedRide?.status]);

  useEffect(() => {
    if (!drivingMode) return;
    window.history.pushState({ driverFullscreenRide: true }, '');
    navigationHistoryRef.current = true;
    const handleBack = () => {
      if (!navigationHistoryRef.current) return;
      navigationHistoryRef.current = false;
      dismissedNavigationRideRef.current = acceptedRide?.id ?? null;
      setDrivingMode(false);
      setSheetVisible(true);
      setSheetExpanded(false);
    };
    window.addEventListener('popstate', handleBack);
    return () => {
      window.removeEventListener('popstate', handleBack);
      if (navigationHistoryRef.current) {
        navigationHistoryRef.current = false;
        window.history.back();
      }
    };
  }, [drivingMode, acceptedRide?.id]);

  useEffect(() => {
    driverLocationRef.current = driverLocation;
  }, [driverLocation]);

  const [updatingStatus, setUpdatingStatus] = useState(false);

  const declineRide = async (ride: RideRequest) => {
    const uid = auth.currentUser?.id;
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
    if (!ride.id || updatingStatus) return;

    setError('');
    setUpdatingStatus(true);

    const localArrivedAt = Date.now();

    // Update the UI immediately, but also persist the exact same state to the ride record.
    setAcceptedRide((prev) => (
      prev?.id === ride.id
        ? { ...prev, status: 'driver_arrived', arrivedAt: localArrivedAt }
        : prev
    ));

    try {
      await updateRideFields(ride.id, {
        status: 'driver_arrived',
        driverStatus: 'arrived',
        arrivedAt: serverTimestamp(),
      });

      // Re-apply the local state after the write so a delayed realtime event
      // cannot make the button jump backwards while the database catches up.
      setAcceptedRide((prev) => (
        prev?.id === ride.id
          ? { ...prev, status: 'driver_arrived', arrivedAt: localArrivedAt }
          : prev
      ));

      showToast('Arrived at pickup');
    } catch (err) {
      console.error('Failed to mark driver arrived:', err);
      setAcceptedRide((prev) => (
        prev?.id === ride.id
          ? { ...prev, status: 'driver_en_route' }
          : prev
      ));
      setError('Failed to update ride status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  useEffect(() => {
    const pickup = acceptedRide ? getLocationCoordinates(acceptedRide.pickup, acceptedRide.pickupLatLng) : null;
    const currentStop = acceptedRide?.stops?.[acceptedRide.currentStopIndex ?? 1];
    const destination = acceptedRide?.status === 'trip_started'
      ? currentStop && currentStop.lat != null && currentStop.lng != null
        ? { lat: currentStop.lat, lng: currentStop.lng }
        : acceptedRide ? getLocationCoordinates(acceptedRide.dropoff, acceptedRide.dropoffLatLng) : null
      : pickup;
    if (!acceptedRide || !destination) {
      setRoutePath([]);
      setRouteDistanceM(null);
      setRouteDurationSec(null);
      return;
    }

    let activeController: AbortController | null = null;
    let timeoutId: number | undefined;
    const loadRoadRoute = async () => {
      const origin = driverLocationRef.current;
      if (!origin) return;
      activeController?.abort();
      if (timeoutId != null) window.clearTimeout(timeoutId);
      const controller = new AbortController();
      activeController = controller;
      timeoutId = window.setTimeout(() => controller.abort(), 6000);
      try {
        const token = initMapbox().accessToken;
        if (!token) {
          console.error('Mapbox token missing');
          setRoutePath([]);
          return;
        }
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true&access_token=${encodeURIComponent(token)}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Mapbox Directions request failed with ${response.status}`);
        const data = await response.json() as { routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: Array<[number, number]> }; legs?: Array<{ steps?: Array<{ maneuver?: { instruction?: string; location?: [number, number] } }> }> }> };
        const route = data.routes?.[0];
        const coordinates = route?.geometry?.coordinates ?? [];
        if (!route || !coordinates.length) throw new Error('Mapbox returned no route geometry');
        setRoutePath(coordinates.map(([lng, lat]) => [lat, lng] as [number, number]));
        setRouteDistanceM(typeof route.distance === 'number' ? route.distance : null);
        setRouteDurationSec(typeof route.duration === 'number' ? route.duration : null);
        const steps = route.legs?.[0]?.steps ?? [];
        const nextStep = steps.find((step) => {
          const maneuver = step.maneuver?.location;
          return maneuver && calcDistance(origin.lat, origin.lng, maneuver[1], maneuver[0]) > 0.04;
        });
      } catch (routeError) {
        if ((routeError as Error).name === 'AbortError') return;
        console.error('Failed to load road route:', routeError);
        setRoutePath([[origin.lat, origin.lng], [destination.lat, destination.lng]]);
      }
    };

    void loadRoadRoute();
    const intervalId = window.setInterval(() => void loadRoadRoute(), 5000);
    return () => {
      window.clearInterval(intervalId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      activeController?.abort();
    };
  }, [acceptedRide?.id, acceptedRide?.status, acceptedRide?.currentStopIndex, acceptedRide?.pickupLatLng?.lat, acceptedRide?.pickupLatLng?.lng, acceptedRide?.dropoffLatLng?.lat, acceptedRide?.dropoffLatLng?.lng, acceptedRide?.stops?.[acceptedRide?.currentStopIndex ?? 1]?.lat, acceptedRide?.stops?.[acceptedRide?.currentStopIndex ?? 1]?.lng]);
  const driverCancelRide = async (ride: RideRequest) => {
    setUpdatingStatus(true);
    try {
      const { error } = await supabase.from('rides').update({
        status: 'cancelled',
        cancelled_by: 'driver',
        cancelled_at: new Date().toISOString(),
      }).eq('id', ride.id);
      if (error) throw error;
      setAcceptedRide(null);
      setDrivingMode(false);
      setIsOnline(true);
      showToast('Ride cancelled');
    } catch (err) {
      console.error(err);
      showToast('Failed to cancel');
    } finally {
      setUpdatingStatus(false);
    }
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
    setUpdatingStatus(true);
    try {
      await startTripService(ride.id, { currentStopIndex: 1, stopArrivalTime: null, waitingSeconds: 0, waitingFare: 0, driverStatus: 'on_trip' });
      setAcceptedRide((prev) => (prev ? { ...prev, status: 'trip_started', currentStopIndex: 1, stopArrivalTime: null, waitingSeconds: 0 } : prev));
      setDrivingMode(true);
    } catch (err) {
      console.error(err);
      setError('Failed to update ride status.');
    } finally {
      setUpdatingStatus(false);
    }
  };
  const completeTrip = async (ride: RideRequest) => {
    setUpdatingStatus(true);
    const fare = Number(ride.totalFare ?? ride.price ?? ride.fare ?? 0);
    try {
      await completeRideService(ride.id, { fare, price: fare, total_fare: fare });
      setAcceptedRide((prev) => (prev ? { ...prev, status: 'completed', fare, price: fare, totalFare: fare } : prev));
      setDrivingMode(false);
      setTodayEarnings((prev) => prev + fare);
    } catch (err) {
      console.error('Failed to complete ride:', err);
      setError('Failed to complete trip. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
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

  const getDriverLocation = (): Promise<(Coordinates & { accuracy: number }) | undefined> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(undefined);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDriverLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
        },
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
          setDriverLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
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
    void getDoc(doc(db, 'profiles', passengerId)).then((snapshot) => {
      if (cancelled) return;
      const data = snapshot.data() as Record<string, unknown> | undefined;
      setPassengerName((data?.full_name as string) || (data?.name as string) || 'Passenger');
    });
    return () => {
      cancelled = true;
    };
  }, [acceptedRide?.passengerId]);

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
    setDrivingMode(false);
  };

  // Dismisses the full-screen RIDE CANCELLED overlay (e.g. passenger cancelled while driver was en route).
  const clearCancelledRide = () => {
    setAcceptedRide(null);
    setDrivingMode(false);
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
  const mapContainerClass = drivingMode
    ? 'fixed inset-0 w-screen h-screen z-10 rounded-none'
    : isOnline
      ? 'h-[70vh] w-full rounded-2xl'
      : 'h-[60vh] min-h-[450px] w-full rounded-2xl';
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
    if (deltaY < -30) {
      setSheetVisible(true);
      setSheetExpanded(true);
    } else if (deltaY > 30) {
      setSheetExpanded(false);
      setSheetVisible(false);
    }
  };
  const exitDrivingMode = () => {
    dismissedNavigationRideRef.current = acceptedRide?.id ?? null;
    setDrivingMode(false);
    setSheetVisible(true);
    setSheetExpanded(false);
    if (navigationHistoryRef.current) {
      navigationHistoryRef.current = false;
      window.history.back();
    }
  };
  const handleMapTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    mapTouchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleMapTouchEnd = (e: TouchEvent) => {
    const start = mapTouchStartRef.current;
    mapTouchStartRef.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaY) < 80 || Math.abs(deltaY) < Math.abs(deltaX) * 1.4) return;
    if (deltaY > 0) exitDrivingMode();
    else if (!sheetVisible) {
      setSheetVisible(true);
      setSheetExpanded(true);
    }
  };

  const displayRide = acceptedRide ?? rides[0] ?? null;
  const displayPickup = displayRide ? getLocationCoordinates(displayRide.pickup, displayRide.pickupLatLng) : null;
  const displayDropoff = displayRide ? getLocationCoordinates(displayRide.dropoff, displayRide.dropoffLatLng) : null;
  const displayFare = displayRide ? Number(displayRide.fare ?? displayRide.totalFare ?? displayRide.price ?? 0) : 0;
  const displayPickupLabel = displayRide ? formatLoc(displayRide.pickup) : 'Waiting for a ride request';
  const displayDropoffLabel = displayRide ? formatLoc(displayRide.dropoff) : 'Go online to receive rides';

  return (
    <>
      <div className={`relative h-[100dvh] overflow-hidden bg-[#F6F7F9] text-[#171717] ${drivingMode ? 'driving-mode' : ''}`}>
        {acceptedRide?.status === 'cancelled' && (
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-red-600 p-6 text-center text-white">
            <h1 className="mb-5 text-4xl font-black">RIDE CANCELLED</h1>
            <p className="mb-2 text-xl">{acceptedRide.cancelledBy === 'passenger' ? 'Cancelled by passenger' : 'Cancelled by driver'}</p>
            <p className="text-base opacity-90">{acceptedRide.cancelReason || 'No reason provided'}</p>
            <button onClick={clearCancelledRide} className="mt-8 rounded-xl bg-white px-10 py-3 text-lg font-bold text-red-600">OK, Got it</button>
          </div>
        )}

        {!drivingMode && <header className="relative z-30 flex h-16 items-center justify-between rounded-b-2xl bg-white px-4 shadow-sm dark:bg-zinc-900">
          <button type="button" onClick={() => setIsDrawerOpen(true)} aria-label="Open driver menu" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#171717] dark:text-white"><Menu size={26} /></button>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-gray-900 dark:text-white">{isOnline ? 'Online' : 'Offline'}</span>
            <button type="button" role="switch" aria-checked={isOnline} aria-label={isOnline ? 'Go offline' : 'Go online'} onClick={() => (isOnline ? void handleGoOffline() : void toggleOnline())} className={`relative h-9 w-16 rounded-full p-1 transition-all duration-300 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}>
              <span className={`absolute left-1 top-1 h-7 w-7 rounded-full bg-white shadow transition-transform duration-300 ${isOnline ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
            <ThemeToggle />
          </div>
        </header>}

        {!drivingMode && <DriverDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} profile={profile} driverProfile={driverProfile} driverId={user.id} todayEarnings={todayEarnings} isOnline={isOnline} onGoOffline={() => void handleGoOffline()} />}

        <main className={`relative mx-auto flex w-full flex-col gap-4 overflow-hidden ${drivingMode ? 'fixed inset-0 z-20 h-[100dvh] max-w-none p-0' : 'h-[calc(100vh-4rem)] max-w-xl px-4 py-4'}`}>
          <section onTouchStart={drivingMode ? handleMapTouchStart : undefined} onTouchEnd={drivingMode ? handleMapTouchEnd : undefined} className={`transition-all duration-500 ease-in-out ${mapContainerClass} overflow-hidden bg-[#DDE4E8] shadow-sm`}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-gray-500">Loading map...</div>}>
              <DriverMapMapbox
                driver={driverLocation}
                pickup={displayPickup}
                dropoff={displayDropoff}
                followTrigger={followTrigger}
                routePath={routePath}
                fullscreen={drivingMode}
              />
            </Suspense>
          </section>

          {!drivingMode && <section className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-center text-[32px] font-black leading-none text-[#171717] dark:text-white">R{displayFare.toFixed(2)}</p>
                <div className="mt-5 space-y-4">
                  <div className="flex items-start gap-3"><MapPin size={22} className="mt-0.5 shrink-0 text-green-600" /><p className="text-sm text-gray-700 dark:text-gray-200"><span className="font-bold">Pickup</span> • {displayPickupLabel}</p></div>
                  <div className="flex items-start gap-3"><MapPin size={22} className="mt-0.5 shrink-0 text-red-600" /><p className="text-sm text-gray-700 dark:text-gray-200"><span className="font-bold">Dropoff</span> • {displayDropoffLabel}</p></div>
                </div>
              </div>
              <div className="flex w-24 shrink-0 flex-col items-center gap-1 text-center"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-600"><UserRound size={20} /></div><span className="text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300">{profile?.full_name || 'Driver'}</span><span className="text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300">{isOnline ? 'Online' : 'Offline'}</span></div>
            </div>
          </section>}

          {!drivingMode && locationError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><p>Location permission is required.</p><button onClick={requestLocation} className="mt-2 font-bold underline">Enable location</button></div>}
          {!drivingMode && toast && <div className="rounded-xl bg-[#171717] px-4 py-3 text-center text-sm font-semibold text-white">{toast}</div>}
          {!drivingMode && !displayRide && <p className="rounded-xl bg-white px-4 py-5 text-center text-sm text-gray-500 shadow-sm">{isOnline ? 'Waiting for ride request' : 'Turn on Go Online to receive rides.'}</p>}

          {!drivingMode && displayRide && !acceptedRide && <div className="flex flex-col gap-3">
            <button type="button" onClick={() => void acceptRide(displayRide)} disabled={accepting === displayRide.id} className="h-14 w-full rounded-xl bg-[#FF5500] text-base font-bold text-white shadow-sm disabled:opacity-60">{accepting === displayRide.id ? 'Accepting...' : 'Accept Ride'}</button>
            <button type="button" onClick={() => void declineRide(displayRide)} className="self-center px-3 py-3 text-sm text-[#666] underline">Decline</button>
          </div>}

          {acceptedRide && !drivingMode && <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><p className="font-bold text-[#171717]">{acceptedRide.status === 'completed' ? 'Ride completed' : `Status: ${acceptedRide.status?.split('_').join(' ')}`}</p><button type="button" onClick={() => setFollowTrigger((prev) => prev + 1)} aria-label="Recenter route" className="rounded-lg p-2 text-[#FF5500]"><NavigationIcon size={20} /></button></div>
            <div className="flex flex-col gap-3">
              {(acceptedRide.status === 'driver_assigned' || acceptedRide.status === 'driver_en_route') && <button type="button" onClick={() => void markArrivedAtPickup(acceptedRide)} disabled={updatingStatus} className="h-12 rounded-xl bg-[#FF5500] font-bold text-white disabled:opacity-60">Arrived at Pickup</button>}
              {acceptedRide.status === 'driver_arrived' && <button type="button" onClick={() => void startTrip(acceptedRide)} disabled={updatingStatus} className="h-12 rounded-xl bg-[#FF5500] font-bold text-white disabled:opacity-60">Start Trip</button>}
              {isTripPhase && <button type="button" onClick={() => void completeTrip(acceptedRide)} disabled={updatingStatus} className="h-12 rounded-xl bg-[#FF5500] font-bold text-white disabled:opacity-60">Complete Trip</button>}
              {acceptedRide.status !== 'completed' && <button type="button" onClick={() => void driverCancelRide(acceptedRide)} disabled={updatingStatus} className="h-12 rounded-xl border border-gray-300 bg-white font-semibold text-gray-600 disabled:opacity-60">Cancel Ride</button>}
              {acceptedRide.status === 'completed' && <button type="button" onClick={finishRide} className="h-12 rounded-xl bg-gray-100 font-bold text-gray-700">Done</button>}
            </div>
          </section>}
        </main>

        {acceptedRide && drivingMode && (
          <header className="fixed left-0 right-0 top-0 z-30 flex h-12 items-center justify-between bg-white/90 px-3 text-gray-900 shadow-sm backdrop-blur-sm">
            <button type="button" onClick={exitDrivingMode} aria-label="Show driver menu" className="flex h-10 w-10 items-center justify-center text-2xl">←</button>
            <div className="min-w-0 truncate text-center text-sm font-bold">
              R{displayFare.toFixed(2)} • Driving to {isTripPhase ? 'dropoff' : 'pickup'}
            </div>
            <a href={acceptedRide.passengerPhone ? `tel:${acceptedRide.passengerPhone}` : undefined} aria-label="Call passenger" className={`flex h-10 w-10 items-center justify-center ${acceptedRide.passengerPhone ? 'text-gray-900' : 'pointer-events-none text-gray-300'}`}>
              <Phone size={20} />
            </a>
          </header>
        )}

        {acceptedRide && drivingMode && (
          <section onTouchStart={handleSheetTouchStart} onTouchEnd={handleSheetTouchEnd} className={`fixed bottom-0 left-0 right-0 z-20 rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-gray-900 shadow-[0_-8px_30px_rgba(0,0,0,0.2)] transition-transform duration-300 ${sheetVisible ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-gray-300" />
            <p className="truncate text-base font-bold">{isTripPhase ? displayDropoffLabel : displayPickupLabel}</p>
            <p className="mt-1 text-sm font-semibold text-gray-600">
              {routeDistanceKm ?? '—'} km • {routeEtaMin ?? '—'} min {isTripPhase ? 'to dropoff' : 'to pickup'}
            </p>
            {sheetExpanded && (
              <div className="mt-3 max-h-[45vh] space-y-3 overflow-y-auto border-t border-gray-200 pt-3">
                <p className="text-sm font-semibold">Passenger: {passengerName}</p>
                <RideDetails ride={acceptedRide} />
                <PassengerBadge passengerId={acceptedRide.passengerId} revealed />
              </div>
            )}
            {(acceptedRide.status === 'driver_assigned' || acceptedRide.status === 'driver_en_route') && (
              <button type="button" onClick={() => void markArrivedAtPickup(acceptedRide)} disabled={updatingStatus} className="mt-3 h-12 w-full rounded-xl bg-[#FF5500] font-bold text-white disabled:opacity-60">
                Arrived at Pickup
              </button>
            )}
            {acceptedRide.status === 'driver_arrived' && (
              <button type="button" onClick={() => void startTrip(acceptedRide)} disabled={updatingStatus} className="mt-3 h-12 w-full rounded-xl bg-[#FF5500] font-bold text-white disabled:opacity-60">Start Trip</button>
            )}
            {isTripPhase && (
              <button type="button" onClick={() => void completeTrip(acceptedRide)} disabled={updatingStatus} className="mt-3 h-12 w-full rounded-xl bg-[#FF5500] font-bold text-white disabled:opacity-60">Complete Trip</button>
            )}
          </section>
        )}

        {acceptedRide && !drivingMode && <RideChat rideId={acceptedRide.id} currentUserId={user.id} currentUserRole="driver" rideStatus={acceptedRide.status} />}
      </div>
    </>
  );
}

function PassengerBadge({ passengerId, revealed }: { passengerId?: string | null; revealed: boolean }) {
  const [passenger, setPassenger] = useState<{ verificationStatus?: string; selfieUrl?: string } | null>(null);

  useEffect(() => {
    if (!passengerId) return;
    void getDoc(doc(db, 'profiles', passengerId)).then((snapshot) => {
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