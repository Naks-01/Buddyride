import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, type DocumentData } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { MapComponent } from '../../components/MapComponent';
import { CarIcon, LogOutIcon } from '../../components/Icons';
import { calculateFare } from '../../utils/fare.js';

interface RideRequest {
  id: string;
  passenger_name: string;
  pickup_address: string;
  dropoff_address: string;
  distance: string;
  fare: number;
}

interface ActiveRide {
  id: string;
  passenger_name: string;
  pickup_address: string;
  pickup_location: { lat: number; lng: number } | null;
  dropoff_location: { lat: number; lng: number } | null;
  driver_location: { lat: number; lng: number } | null;
}

interface CompletedRide {
  id: string;
  fare: number;
  tip: number;
  totalEarned: number;
}

export function DriverDashboard() {
  const { profile } = useAuth();
  const [online, setOnline] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [rides, setRides] = useState<RideRequest[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completedFare, setCompletedFare] = useState<number | null>(null);
  const [completedRides, setCompletedRides] = useState<CompletedRide[]>([]);

  // Mock incoming ride request UI, kept as a fallback when there is no live request.
  const [mockRequest, setMockRequest] = useState<{
    pickup: string;
    dropoff: string;
    fare: number;
    distanceKm: number;
  } | null>(null);
  const [mockAcceptedMessage, setMockAcceptedMessage] = useState<string | null>(null);

  const acceptMockRide = () => {
    setMockAcceptedMessage('You accepted the ride. Navigating to passenger...');
  };

  const declineMockRide = () => {
    setMockRequest(null);
    setMockAcceptedMessage(null);
  };

  const toggleOnline = async () => {
    if (!profile?.id) return;
    setUpdating(true);
    try {
      const next = !online;
      await setDoc(doc(db, 'users', profile.id), { is_online: next }, { merge: true });
      setOnline(next);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    const ridesQuery = query(collection(db, 'rides'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(ridesQuery, (snapshot) => {
      setRides(
        snapshot.docs.map((d) => {
          const data = d.data() as DocumentData;
          return {
            id: d.id,
            passenger_name: data.passenger_name ?? '',
            pickup_address: data.pickup_address ?? '',
            dropoff_address: data.dropoff_address ?? '',
            distance: data.distance ?? '',
            fare: typeof data.fare === 'number' ? data.fare : 0,
          };
        }),
      );
    });
    return () => unsubscribe();
  }, []);

  // Track this driver's currently accepted ride so we know where to push location updates.
  useEffect(() => {
    if (!profile?.id) return;
    const activeQuery = query(
      collection(db, 'rides'),
      where('driver_id', '==', profile.id),
      where('status', 'in', ['accepted', 'active']),
    );
    const unsubscribe = onSnapshot(activeQuery, (snapshot) => {
      if (snapshot.empty) {
        setActiveRide(null);
        return;
      }
      const rideDoc = snapshot.docs[0];
      const data = rideDoc.data() as DocumentData;
      setCompletedFare(null);
      setActiveRide({
        id: rideDoc.id,
        passenger_name: data.passenger_name ?? '',
        pickup_address: data.pickup_address ?? '',
        pickup_location: data.pickup_location ?? null,
        dropoff_location: data.dropoff_location ?? null,
        driver_location: data.driver_location ?? null,
      });
    });
    return () => unsubscribe();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;

    const completedQuery = query(
      collection(db, 'rides'),
      where('driver_id', '==', profile.id),
      where('status', '==', 'completed'),
    );

    const unsubscribe = onSnapshot(completedQuery, (snapshot) => {
      setCompletedRides(
        snapshot.docs.map((rideDoc) => {
          const data = rideDoc.data() as DocumentData;
          const fare = typeof data.fare === 'number' ? data.fare : 0;
          const tip = typeof data.tip === 'number' ? data.tip : 0;

          return {
            id: rideDoc.id,
            fare,
            tip,
            totalEarned:
              typeof data.totalEarned === 'number'
                ? data.totalEarned
                : Number((fare + tip).toFixed(2)),
          };
        }),
      );
    });

    return () => unsubscribe();
  }, [profile?.id]);

  // While a ride is accepted, watch the driver's position and push updates every 5 seconds.
  useEffect(() => {
    const activeRideId = activeRide?.id;
    if (!activeRideId || !navigator.geolocation) return;

    let lastPosition: { lat: number; lng: number } | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        lastPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
      },
      (err) => console.error(err),
      { enableHighAccuracy: true },
    );

    const intervalId = setInterval(() => {
      if (!lastPosition) return;
      void updateDoc(doc(db, 'rides', activeRideId), { driver_location: lastPosition }).catch((err) =>
        console.error(err),
      );
    }, 5000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(intervalId);
    };
  }, [activeRide?.id]);

  const acceptRide = async (rideId: string) => {
    if (!profile?.id) return;
    setAccepting(rideId);
    try {
      await updateDoc(doc(db, 'rides', rideId), {
        status: 'accepted',
        driver_id: profile.id,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setAccepting(null);
    }
  };

  const completeTrip = async (rideId: string) => {
    setCompleting(true);
    try {
      if (!activeRide?.pickup_location || !activeRide.dropoff_location) {
        throw new Error('This ride is missing pickup or dropoff coordinates.');
      }

      const { distanceKm, durationMin, fare } = await calculateFare(
        activeRide.pickup_location,
        activeRide.dropoff_location,
      );
      await updateDoc(doc(db, 'rides', rideId), {
        status: 'completed',
        fare,
        distanceKm,
        durationMin,
        totalEarned: fare,
        completedAt: serverTimestamp(),
      });
      setCompletedFare(fare);
      window.alert(`Trip Completed! Fare: R${fare.toFixed(2)}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCompleting(false);
    }
  };

  const logout = async () => { await auth.signOut(); window.location.href = '/'; };


  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-orange-500">BuddyRide1 - Driver</h1>
        <button onClick={() => void logout()} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <LogOutIcon size={20} /> Logout
        </button>
      </header>

      <main className="flex-1 flex flex-col">
        <div className="p-4 max-w-2xl w-full mx-auto">
          <button
            onClick={() => void toggleOnline()}
            disabled={updating}
            className={`w-full flex items-center justify-center gap-2 font-bold py-3 rounded-xl text-white disabled:opacity-60 ${online ? 'bg-green-500' : 'bg-gray-700'}`}
          >
            <CarIcon size={20} /> {online ? 'Online - Go Offline' : 'Go Online'}
          </button>
        </div>

        {rides.length === 0 && mockRequest && (
          <div className="p-4 max-w-2xl w-full mx-auto">
            <div className="bg-white border border-orange-200 rounded-xl p-4">
              <h2 className="text-lg font-bold text-gray-800 mb-2">Incoming Ride Request</h2>
              <p className="text-gray-700">Pickup: {mockRequest.pickup}</p>
              <p className="text-gray-700">Dropoff: {mockRequest.dropoff}</p>
              <p className="text-gray-700">Fare: R{mockRequest.fare}</p>
              <p className="text-gray-700 mb-3">Distance: {mockRequest.distanceKm}km</p>
              {mockAcceptedMessage ? (
                <p className="text-center text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg py-2 px-3">
                  {mockAcceptedMessage}
                </p>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={acceptMockRide}
                    className="flex-1 bg-orange-500 text-white font-bold py-2 rounded-lg"
                  >
                    Accept Ride
                  </button>
                  <button
                    onClick={declineMockRide}
                    className="flex-1 bg-gray-200 text-gray-700 font-bold py-2 rounded-lg"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <MapComponent />

        <div className="p-4 max-w-2xl w-full mx-auto flex-1">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Incoming Ride Requests</h2>
          {rides.length === 0 && <p className="text-sm text-gray-500">No ride requests right now.</p>}
          <div className="space-y-3">
            {rides.map((ride) => (
              <div key={ride.id} className="bg-white border border-orange-200 rounded-xl p-4">
                {ride.passenger_name && <p className="text-sm text-gray-500 mb-1">{ride.passenger_name}</p>}
                <p className="text-gray-700">Pickup: {ride.pickup_address}</p>
                <p className="text-gray-700">Dropoff: {ride.dropoff_address}</p>
                <p className="text-gray-700">Fare: R{ride.fare}</p>
                <p className="text-gray-700 mb-3">Distance: {ride.distance}</p>
                <button
                  onClick={() => void acceptRide(ride.id)}
                  disabled={accepting === ride.id}
                  className="w-full bg-orange-500 disabled:opacity-60 text-white font-bold py-2 rounded-lg"
                >
                  {accepting === ride.id ? 'Accepting...' : 'Accept Ride'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {completedFare !== null && !activeRide && (
          <div className="p-4 max-w-2xl w-full mx-auto">
            <p className="text-center text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg py-2 px-3">
              Trip Complete. You earned R{completedFare}
            </p>
          </div>
        )}

        {completedRides.length > 0 && (
          <div className="p-4 max-w-2xl w-full mx-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Trip Earnings</h2>
            <div className="space-y-3">
              {completedRides.map((ride) => (
                <div key={ride.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-gray-700">Fare: R{ride.fare.toFixed(2)}</p>
                  <p className="text-gray-700">Tip: R{ride.tip.toFixed(2)}</p>
                  <p className="font-bold text-green-700 mt-1">
                    Total: R{ride.totalEarned.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeRide && (
          <div className="p-4 max-w-2xl w-full mx-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Active Trip</h2>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div>
                <p className="font-semibold text-gray-800">{activeRide.passenger_name}</p>
                <p className="text-sm text-gray-500">{activeRide.pickup_address}</p>
              </div>
              <button
                onClick={() => void completeTrip(activeRide.id)}
                disabled={completing}
                className="mt-4 w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-lg font-bold py-4 rounded-lg"
              >
                {completing ? 'Completing...' : 'Complete Trip'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

