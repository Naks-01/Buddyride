// Vercel serverless function - proxies Google Directions so GOOGLE_MAPS_SERVER_KEY never reaches the browser.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { origin, destination } = req.query;
  if (!origin || !destination) {
    return res.status(400).json({ error: 'missing' });
  }

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    return res.status(500).json({ error: 'no server key' });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${key}&mode=driving`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes?.[0]) {
      return res.status(404).json({ error: data.status, raw: data });
    }

    const route = data.routes[0];
    return res.status(200).json({
      polyline: route.overview_polyline.points,
      distance: route.legs[0].distance,
      duration: route.legs[0].duration,
    });
  } catch (error) {
    console.error('Directions proxy failed:', error);
    return res.status(502).json({ error: 'Unable to fetch directions.' });
  }
}
