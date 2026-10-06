const BASE_FARE = 30;
const PER_KILOMETER = 12;
const PER_MINUTE = 2;

export async function calculateFare(pickup, dropoff) {
  if (!pickup || !dropoff) {
    throw new Error('Pickup and dropoff coordinates are required.');
  }

  const response = await fetch('/api/fare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pickup, dropoff }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? `Fare request failed (${response.status}).`);
  }

  return response.json();
}
