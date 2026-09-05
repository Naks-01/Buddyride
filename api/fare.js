// Google Distance Matrix (paid, billed) removed - replaced with the free OSRM public router.
const BASE_FARE = 20;
const PER_KILOMETER = 8.5;
const PER_MINUTE = 1.2;
const FLAT_FEE = 5;
const OSRM_URL = process.env.VITE_OSRM_URL || 'https://router.project-osrm.org';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { pickup, dropoff } = req.body ?? {};
  if (!isCoordinate(pickup) || !isCoordinate(dropoff)) {
    return res.status(400).json({
      error: 'Valid pickup and dropoff coordinates are required.',
    });
  }

  try {
    const url = `${OSRM_URL}/route/v1/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?overview=false`;
    const response = await fetch(url);
    const data = await response.json();
    const route = data.routes?.[0];

    if (!response.ok || data.code !== 'Ok' || !route) {
      return res.status(502).json({ error: 'Route not found for these coordinates.' });
    }

    const distanceKm = route.distance / 1000;
    const durationMin = route.duration / 60;
    const fare = Number(
      (BASE_FARE + distanceKm * PER_KILOMETER + durationMin * PER_MINUTE + FLAT_FEE).toFixed(2),
    );

    return res.status(200).json({ distanceKm, durationMin, fare });
  } catch (error) {
    console.error('Fare calculation failed:', error);
    return res.status(502).json({ error: 'Unable to calculate fare.' });
  }
}

function isCoordinate(value) {
  return (
    value &&
    Number.isFinite(Number(value.lat)) &&
    Number.isFinite(Number(value.lng))
  );
}
