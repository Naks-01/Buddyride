import { useEffect, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, type DocumentData } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { MapComponent, type MapMarker } from '../../components/MapComponent';
import { CarIcon, LogOutIcon } from '../../components/Icons';
import { TripReceipt } from '../../components/TripReceipt';
import { LocationInput } from '../../components/LocationInput';

export function PassengerDashboard() {
  const { profile } = useAuth();
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState('');
  const [rideId, setRideId] = useState<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [rated, setRated] = useState(false);
  const [distance, setDistance] = useState<string>('');
  const [estimatedFare, setEstimatedFare] = useState<number>(0);

  const calculateFare = () => {
    console.log('calculateFare called', { pickupLocation, dropoffLocation });
    if (!pickupLocation || !dropoffLocation) return;

    const google = (window as any).google;
    if (!google?.maps?.DistanceMatrixService) {
      console.log('Google Maps not loaded yet, retrying...');
      setTimeout(calculateFare, 500);
      return;
    }

    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [pickupLocation],
        destinations: [dropoffLocation],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC,
      },
      (response: any, status: string) => {
        console.log('DistanceMatrixService status:', status, response);
        if (status !== 'OK') return;

        const element = response?.rows?.[0]?.elements?.[0];
        if (!element || element.status !== 'OK') {
          console.log('DistanceMatrixService element status:', element?.status);
          return;
        }

        const distanceKm = element.distance.value / 1000;
        const fareEstimate = Math.round(15 + distanceKm * 4);
        console.log('distance (km):', distanceKm, 'fare (R):', fareEstimate);
        setDistance(element.distance.text);
        setEstimatedFare(fareEstimate);
      }
    );
  };

  const requestRide = async () => {
    if (!profile?.id || !pickupAddress || !pickupLocation || !dropoffAddress || !dropoffLocation) {
      setMessage('Select both pickup and dropoff locations.');
      return;
    }
    setRequesting(true);
    setMessage('');
    try {
      const rideRef = await addDoc(collection(db, 'rides'), {
        passenger_id: profile.id,
        passenger_name: profile.full_name ?? '',
        pickup_location: pickupLocation,
        pickup_address: pickupAddress,
        dropoff_location: dropoffLocation,
        dropoff_address: dropoffAddress,
        distance,
        fare: estimatedFare,
        status: 'pending',
        created_at: serverTimestamp(),
      });
      setRideId(rideRef.id);
      setRideStatus(null);
      setDriverLocation(null);
      setFare(null);
      setRated(false);
      setPickupAddress('');
      setPickupLocation(null);
      setDropoffAddress('');
      setDropoffLocation(null);
      setDistance('');
      setEstimatedFare(0);
      setMessage('Ride requested! Looking for driver...');
    } catch (err) {
      console.error(err);
      setMessage('Failed to request a ride. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  // Recompute the fare estimate whenever both locations are set.
  useEffect(() => {
    if (pickupLocation && dropoffLocation) {
      calculateFare();
    } else {
      setDistance('');
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
      setRideStatus(data.status ?? null);
      setDriverLocation(data.driver_location ?? null);
      setFare(typeof data.fare === 'number' ? data.fare : null);
    });
    return () => unsubscribe();
  }, [rideId]);

  const isAccepted = rideStatus === 'accepted';
  const isCompleted = rideStatus === 'completed';
  const markers: MapMarker[] = isAccepted
    ? [
        ...(pickupLocation ? [{ ...pickupLocation, label: 'Pickup location' }] : []),
        ...(driverLocation ? [{ ...driverLocation, label: 'Your driver' }] : []),
      ]
    : [];

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
        <MapComponent markers={markers} />

        <div className="p-4 max-w-2xl w-full mx-auto">
          {!rideId && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-4">
              <LocationInput
                label="Pickup location"
                placeholder="Search pickup"
                value={pickupAddress}
                coords={pickupLocation}
                onChange={(address, coords) => {
                  setPickupAddress(address);
                  setPickupLocation(coords);
                }}
              />
              <LocationInput
                label="Dropoff location"
                placeholder="Search destination"
                value={dropoffAddress}
                coords={dropoffLocation}
                onChange={(address, coords) => {
                  setDropoffAddress(address);
                  setDropoffLocation(coords);
                }}
              />
              {distance && estimatedFare > 0 && (
                <div className="bg-orange-100 p-3 rounded-lg">
                  <p>
                    Distance: {distance} • R{estimatedFare}
                  </p>
                  <button
                    onClick={() => void requestRide()}
                    disabled={requesting}
                    className="w-full bg-orange-500 disabled:opacity-60 text-white font-bold py-2 rounded-lg mt-2"
                  >
                    Request Ride - R{estimatedFare}
                  </button>
                </div>
              )}
            </div>
          )}
          {isAccepted && (
            <p className="text-center text-sm mb-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg py-2 px-3">
              Your driver is on the way
            </p>
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
          <button
            onClick={() => void requestRide()}
            disabled={requesting}
            className="w-full flex items-center justify-center gap-2 bg-orange-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl"
          >
            <CarIcon size={20} />{' '}
            {requesting
              ? 'Requesting...'
              : estimatedFare > 0
                ? `Request Ride - R${estimatedFare}`
                : 'Request Ride'}
          </button>
        </div>
      </main>
    </div>
  );
}

