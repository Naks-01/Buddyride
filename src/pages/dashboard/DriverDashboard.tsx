import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  Car as CarPin,
  HelpCircle,
  Home as HomeNav,
  LocateFixed,
  Menu,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { BOOKING_FEE, DRIVER_RATE } from '../../config/pricing';
import { CANCELLATION, COMMISSION_RATE } from '../../config/pricing';
import { calcDistance } from '../../lib/maps';
import { startRequestLoop, stopRequestLoop } from '../../utils/sound';
import { DriverDrawer } from '../../components/driver/DriverDrawer';
import AppMap, { type AppMapMarker } from '../../components/Map/AppMap';
import {
  acceptRide as acceptRideService,
  cancelRide as cancelRideService,
  completeRide as completeRideService,
  getFreeRoute,
  markArrived,
  startTrip as startTripService,
  subscribeToRequestedRides,
  subscribeToRide,
  updateRideFields,
} from '../../lib/rideService';
import { getMapProvider, openNavigation as openExternalNavigation } from '../../lib/navigation';
import { RIDE_CATEGORIES } from '../../config/categories';

// Statuses during which the driver's live GPS position should keep broadcasting to the ride doc.
const LOCATION_SHARING_STATUSES = new Set(['driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started']);


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
  const user = auth.currentUser;
  const [driverProfile, setDriverProfile] = useState<Record<string, unknown> | null>(null);
  const [drivers, setDrivers] = useState<Record<string, unknown>[] | null>(null);
  const [rides, setRides] = useState<RideRequest[]>([]);
  const [acceptedRide, setAcceptedRide] = useState<RideRequest | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [waitSecondsRemaining, setWaitSecondsRemaining] = useState(0);
  const [stopWaitingSeconds, setStopWaitingSeconds] = useState(0);
  const tipToastRef = useRef<string | null>(null);
  const knownRideIdsRef = useRef<Set<string>>(new Set());
  const lastLocationUpdateRef = useRef(0);
  const [isOnline, setIsOnline] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [centerTrigger, setCenterTrigger] = useState(0);
  const [checkingArrival, setCheckingArrival] = useState(false);
  const [routePath, setRoutePath] = useState<[number, number][] | null>(null);
  const [routeMarkers, setRouteMarkers] = useState<AppMapMarker[]>([]);

  const toggleOnline = async () => {
    const next = !isOnline;
    setIsOnline(next);
    if (user) {
      await updateDoc(doc(db, 'drivers', user.uid), { isOnline: next, lastSeen: serverTimestamp() }).catch((err) => {
        console.error('Failed to update online status:', err);
      });
    }
  };

  const handleGoOffline = async () => {
    if (!window.confirm('Stop receiving rides? You will go offline')) return;
    setIsOnline(false);
    setRides([]);
    stopRequestLoop();
    if (user) {
      await updateDoc(doc(db, 'drivers', user.uid), { isOnline: false, lastOffline: serverTimestamp(), lastSeen: serverTimestamp() }).catch((err) => {
        console.error('Failed to update offline status:', err);
      });
    }
  };

  useEffect(() => {
    if ('Notification' in window) void Notification.requestPermission();
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;

    const loadDriverProfile = async () => {
      try {
        const driverRef = doc(db, 'drivers', user.uid);
        const existing = await getDoc(driverRef);
        if (existing.exists()) {
          const profile = existing.data();
          setDriverProfile(profile);
          setDrivers([profile]);
          setIsOnline(Boolean(profile.isOnline));
          return;
        }

        const newDriver = {
          uid: user.uid,
          email: user.email ?? null,
          role: 'driver',
          createdAt: serverTimestamp(),
        };
        await setDoc(driverRef, newDriver);
        setDriverProfile(newDriver);
        setDrivers([newDriver]);
      } catch (err) {
        console.error('Failed to load driver profile:', err);
        setError('Failed to load driver profile.');
      }
    };

    void loadDriverProfile();
  }, [authLoading, user]);

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

        for (const ride of newRides) {
          if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
          if ('Notification' in window && Notification.permission === 'granted') {
            const pickupLabel = typeof ride.pickup === 'string' ? ride.pickup : ride.pickup?.address ?? 'Pickup';
            const dropoffLabel = typeof ride.dropoff === 'string' ? ride.dropoff : ride.dropoff?.address ?? 'Dropoff';
            new Notification('New Buddy Request! 🚗', {
              body: `${pickupLabel} -> ${dropoffLabel} - R${Number(ride.price ?? ride.fare ?? 0).toFixed(2)}`,
            });
          }
        }
      },
      (err: any) => {
        console.error(err);
        setError('Failed to load ride requests.');
      },
    );
    return () => unsubscribe();
    } catch (err) {
      console.error('Failed to subscribe to ride requests:', err);
      setError('Failed to load ride requests.');
      return undefined;
    }
  }, [authLoading, user, isOnline]);

  const acceptRide = async (ride: RideRequest) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setAccepting(ride.id);
    stopRequestLoop();
    try {
      const location = await getDriverLocation();
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
      const acceptedRide = { ...ride, status: 'driver_assigned' };
      setAcceptedRide(acceptedRide);
      window.setTimeout(() => {
        setAcceptedRide((prev) => {
          if (!prev || prev.id !== ride.id || prev.status !== 'driver_assigned') return prev;
          void updateRideFields(ride.id, { status: 'driver_en_route' }).catch((err: unknown) => {
            console.error('Failed to update ride status:', err);
          });
          return { ...prev, status: 'driver_en_route' };
        });
      }, 3000);
      await navigateToPickup(acceptedRide);
    } catch (err) {
      console.error(err);
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
        });
      } else {
        await cancelRideService(ride.id, { cancellationFee: 0, cancellationReason: 'driver_cancelled', driverPenalty: true });
      }
    } catch (err) {
      console.error(err);
      setError('Failed to update ride status.');
    } finally {
      setUpdatingStatus(false);
    }
    setAcceptedRide(null);
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
    setAcceptedRide((prev) => (prev ? { ...prev, status: 'trip_started', currentStopIndex: 1 } : prev));
    setUpdatingStatus(true);
    try {
      await startTripService(ride.id, { currentStopIndex: 1 });
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
    const total = Number(ride.fare ?? ride.price ?? 0);
    const driverPayout = Math.max(total - BOOKING_FEE, 0) * DRIVER_RATE + Number(ride.tipAmount ?? 0);
    setTodayEarnings((prev) => prev + driverPayout);
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

  // Google/Waze open the external app; 'inapp' draws the OSRM route on the Leaflet map instead.
  const navigateTo = async (destination: Coordinates, origin?: Coordinates) => {
    const provider = getMapProvider();
    const openedExternally = openExternalNavigation(destination.lat, destination.lng, provider);
    if (openedExternally) {
      setRoutePath(null);
      setRouteMarkers([]);
      return;
    }
    setRouteMarkers([{ id: 'nav-destination', position: [destination.lat, destination.lng], color: '#FF3B30', emoji: '📍' }]);
    if (origin) {
      const route = await getFreeRoute(origin, destination);
      setRoutePath(route?.polyline ?? null);
    }
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

  const recenterMap = () => setCenterTrigger((prev) => prev + 1);

  // Single source of truth for the driver's live position - runs for the entire active ride
  // (assigned through trip_started) so the passenger's driver marker never freezes mid-trip.
  useEffect(() => {
    if (!acceptedRide || !LOCATION_SHARING_STATUSES.has(acceptedRide.status ?? '') || !navigator.geolocation) return;

    const rideId = acceptedRide.id;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastLocationUpdateRef.current < 5000) return;
        lastLocationUpdateRef.current = now;
        void updateRideFields(rideId, {
          driverLocation: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading: position.coords.heading ?? null,
            updatedAt: serverTimestamp(),
          },
          driverStatus: acceptedRide.status === 'trip_started' ? 'on_trip' : 'coming',
        }).catch((err: unknown) => {
          console.error('Failed to update driver location:', err);
          setError('Unable to share your live location.');
        });
      },
      (err) => {
        console.error('Failed to watch driver location:', err);
        setError('Location permission is required to share your route.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [acceptedRide?.id, acceptedRide?.status]);

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

  const finishRide = () => setAcceptedRide(null);

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

  if (!drivers && !error) {
    return <div className="min-h-screen bg-[#121212] p-8 text-white">Loading...</div>;
  }

  const hasActiveOverlay = Boolean(acceptedRide) || rides.length > 0;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#121212] text-white">
      <div className="absolute inset-0 top-0 bottom-[72px] z-0">
        <AppMap mode="driver" centerBtn={centerTrigger} routePath={routePath ?? undefined} markers={routeMarkers} />
      </div>

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-4 pointer-events-auto">
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          aria-label="Menu"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3A3D45] text-white shadow-lg"
        >
          <Menu size={20} />
        </button>
        <div className="flex flex-col items-center rounded-full bg-[#3A3D45] px-5 py-2 shadow-lg">
          <span className="text-base font-bold leading-none text-white">R {todayEarnings.toFixed(2)}</span>
          <span className="text-[11px] text-gray-400">Today</span>
        </div>
        <button type="button" aria-label="Safety" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3A3D45] text-white shadow-lg">
          <ShieldCheck size={20} />
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

      {!hasActiveOverlay && (
        <div className="absolute right-4 bottom-24 z-10 flex flex-col gap-3 pointer-events-auto">
          <button type="button" onClick={recenterMap} aria-label="Locate me" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3A3D45] text-white shadow-lg">
            <LocateFixed size={20} />
          </button>
          <button type="button" aria-label="Filter" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3A3D45] text-white shadow-lg">
            <SlidersHorizontal size={20} />
          </button>
        </div>
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

      {acceptedRide && (
        <div className="absolute inset-x-0 bottom-[4.5rem] z-30 max-h-[40vh] overflow-y-auto rounded-t-[20px] bg-[#121212] px-4 pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.35)]">
          <section className="mb-2 rounded-2xl border border-green-200 bg-white p-4 shadow-2xl">
            <h2 className="mb-3 text-lg font-bold text-green-900">Accepted Ride</h2>
            <RideDetails ride={acceptedRide} />
            <PassengerBadge passengerId={acceptedRide.passengerId} revealed />
            <a
              href={`tel:${acceptedRide.passengerPhone ?? ''}`}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-green-600 py-2 font-bold text-green-700 hover:bg-green-100"
            >
              Call Passenger
            </a>
            <button
              onClick={() => navigateToPickup(acceptedRide)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-bold text-white hover:bg-green-700"
            >
              Navigate
            </button>
            {(acceptedRide.status === 'driver_assigned' || acceptedRide.status === 'driver_en_route') && (
              <button
                onClick={() => void markArrivedAtPickup(acceptedRide)}
                disabled={updatingStatus || checkingArrival}
                className="mt-2 w-full rounded-lg bg-orange-500 py-3 font-bold text-white disabled:opacity-60"
              >
                {checkingArrival ? 'Checking your location...' : 'Arrived at Pickup'}
              </button>
            )}
            {acceptedRide.status === 'driver_arrived' && (
              <>
                <div className="mt-2 rounded-lg bg-orange-50 border border-orange-200 py-2 px-3 text-center text-sm font-semibold text-orange-700">
                  {pickupWaitSeconds <= 180
                    ? `Free wait: ${Math.floor((180 - pickupWaitSeconds) / 60)}:${String((180 - pickupWaitSeconds) % 60).padStart(2, '0')} remaining`
                    : `Waiting: ${Math.floor(pickupWaitSeconds / 60)}:${String(pickupWaitSeconds % 60).padStart(2, '0')} - Extra R${waitFare(pickupWaitSeconds)}`}
                </div>
                <p className="mt-2 text-center text-sm font-semibold text-orange-700">
                  {waitSecondsRemaining > 0
                    ? `Wait ${Math.floor(waitSecondsRemaining / 60)}:${String(waitSecondsRemaining % 60).padStart(2, '0')} before marking no-show`
                    : 'Passenger no-show is available'}
                </p>
                {waitSecondsRemaining === 0 ? (
                  <button
                    onClick={() => void driverCancelRide(acceptedRide)}
                    disabled={updatingStatus}
                    className="mt-2 w-full rounded-lg bg-red-600 py-3 font-bold text-white disabled:opacity-60"
                  >
                    Passenger no-show (R20)
                  </button>
                ) : (
                  <p className="mt-1 text-center text-xs text-gray-500">Must be at pickup location</p>
                )}
                <button
                  onClick={() => void startTrip(acceptedRide)}
                  disabled={updatingStatus}
                  className="mt-2 w-full rounded-lg bg-orange-500 py-3 font-bold text-white disabled:opacity-60"
                >
                  Start Trip
                </button>
              </>
            )}
            {(acceptedRide.status === 'driver_assigned' || acceptedRide.status === 'driver_en_route' || acceptedRide.status === 'driver_arrived') && (
              <button
                onClick={() => void driverCancelRide(acceptedRide)}
                disabled={updatingStatus}
                className="mt-2 w-full rounded-lg border border-red-500 py-2 font-semibold text-red-600 disabled:opacity-60"
              >
                Cancel Ride (no fee before wait)
              </button>
            )}
            {acceptedRide.status === 'trip_started' && (() => {
              const stops = acceptedRide.stops ?? [];
              const currentStopIndex = acceptedRide.currentStopIndex ?? 1;
              const hasNextStop = currentStopIndex < stops.length - 1;
              const waitingFare = waitFare(stopWaitingSeconds);
              return hasNextStop ? (
                <>
                  {acceptedRide.stopArrivalTime ? (
                    <>
                      <p className="mt-2 text-center text-sm font-semibold text-orange-700">
                        Waiting: {Math.floor(stopWaitingSeconds / 60)}:{String(stopWaitingSeconds % 60).padStart(2, '0')} (R{waitingFare})
                      </p>
                      <p className="mt-1 text-center text-xs text-gray-600">First 3 minutes free, then R1 per started minute</p>
                      <button
                        onClick={() => void continueToNextStop(acceptedRide)}
                        disabled={updatingStatus}
                        className="mt-2 w-full rounded-lg bg-green-600 py-3 font-bold text-white disabled:opacity-60"
                      >
                        Continue to next
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => void arriveAtStop(acceptedRide)}
                      disabled={updatingStatus}
                      className="mt-2 w-full rounded-lg bg-orange-500 py-3 font-bold text-white disabled:opacity-60"
                    >
                      Arrived at Stop {currentStopIndex}
                    </button>
                  )}
                  <button
                    onClick={() => void navigateToDestination(acceptedRide)}
                    className="mt-2 w-full rounded-lg border border-orange-500 py-2 font-bold text-orange-600 hover:bg-orange-50"
                  >
                    Navigate to Stop {currentStopIndex}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => completeTrip(acceptedRide)}
                  disabled={updatingStatus}
                  className="mt-2 w-full rounded-lg bg-orange-500 py-3 font-bold text-white disabled:opacity-60"
                >
                  Complete Trip
                </button>
              );
            })()}
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

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-around bg-[#2A2D36] py-3 pointer-events-auto">
        <button type="button" className="flex flex-col items-center gap-1 text-white">
          <HomeNav size={20} />
          <span className="text-[11px] font-semibold">Home</span>
        </button>
        <button type="button" className="flex flex-col items-center gap-1 text-gray-400">
          <Wallet size={20} />
          <span className="text-[11px]">Earn more</span>
        </button>
        <button type="button" className="flex flex-col items-center gap-1 text-gray-400">
          <CarPin size={20} />
          <span className="text-[11px]">Rides</span>
        </button>
        <button type="button" className="flex flex-col items-center gap-1 text-gray-400">
          <HelpCircle size={20} />
          <span className="text-[11px]">Help</span>
        </button>
      </div>
    </div>
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

