// Bolt-style live tracking helpers: drivers push their GPS position on an interval,
// passengers read it back via onSnapshot on the ride document.
import { db } from '../lib/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';

export const RIDE_STATUS = {
  SEARCHING: 'searching',
  ASSIGNED: 'driver_assigned',
  EN_ROUTE: 'driver_en_route',
  ARRIVED: 'driver_arrived',
  TRIP_STARTED: 'trip_started',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  });
}

// Starts pushing the driver's live GPS position every 5s to drivers/{driverId} and rides/{rideId}.
// Returns the intervalId so the caller can stop tracking later.
let locationDeniedAlertShown = false;

export function startDriverTracking(driverId, rideId) {
  const pushPosition = async () => {
    try {
      const position = await getCurrentPosition();
      const { latitude: lat, longitude: lng } = position.coords;
      await updateDoc(doc(db, 'drivers', driverId), { lat, lng, lastUpdate: serverTimestamp() });
      await updateDoc(doc(db, 'rides', rideId), { driverLat: lat, driverLng: lng, driverUpdatedAt: Date.now() });
    } catch (err) {
      if (err && err.code === err.PERMISSION_DENIED && !locationDeniedAlertShown) {
        locationDeniedAlertShown = true;
        window.alert('Please enable location');
      }
      console.error('Failed to update driver location:', err);
    }
  };

  void pushPosition();
  const intervalId = setInterval(pushPosition, 5000);
  return intervalId;
}

export function stopDriverTracking(intervalId) {
  if (intervalId) clearInterval(intervalId);
}

export async function updateRideStatus(rideId, status) {
  await updateDoc(doc(db, 'rides', rideId), { status, updatedAt: serverTimestamp() });
}
