const BASE_FARE = 30;
const PER_KILOMETER = 12;
const PER_MINUTE = 2;

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

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'PASTE_YOUR_GOOGLE_KEY_HERE') {
    return res.status(500).json({
      error: 'GOOGLE_MAPS_API_KEY is not configured on the server.',
    });
  }

  const params = new URLSearchParams({
    origins: `${pickup.lat},${pickup.lng}`,
    destinations: `${dropoff.lat},${dropoff.lng}`,
    mode: 'driving',
    key: apiKey,
  });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`,
    );
    const data = await response.json();
    const element = data.rows?.[0]?.elements?.[0];

    if (!response.ok || data.status !== 'OK' || element?.status !== 'OK') {
      return res.status(502).json({ error: 'Google Maps could not calculate this route.' });
    }

    const distanceKm = element.distance.value / 1000;
    const durationMin = element.duration.value / 60;
    const fare = Number(
      (BASE_FARE + distanceKm * PER_KILOMETER + durationMin * PER_MINUTE).toFixed(2),
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
