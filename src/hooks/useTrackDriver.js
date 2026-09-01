// Live driver position + ride data for the passenger's active trip.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useTrackDriver(rideId) {
  const [driverPos, setDriverPos] = useState(null);
  const [ride, setRide] = useState(null);

  useEffect(() => {
    if (!rideId) {
      setDriverPos(null);
      setRide(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'rides', rideId), (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      setRide({ id: snapshot.id, ...data });
      const lat = data.driverLat ?? data.driverLocation?.lat;
      const lng = data.driverLng ?? data.driverLocation?.lng;
      if (typeof lat === 'number' && typeof lng === 'number') {
        setDriverPos([lat, lng]);
      }
    });
    return () => unsubscribe();
  }, [rideId]);

  return { driverPos, ride };
}
