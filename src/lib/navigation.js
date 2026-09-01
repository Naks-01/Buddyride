// Shared navigation-provider helpers for driver/passenger map preferences.
export const MAP_PROVIDER_KEY = 'mapProvider';

export function getMapProvider() {
  if (typeof window === 'undefined') return 'inapp';
  return window.localStorage.getItem(MAP_PROVIDER_KEY) || 'inapp';
}

export function setMapProvider(provider) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MAP_PROVIDER_KEY, provider);
}

// Opens turn-by-turn directions in the chosen app. Returns true if an external app was
// launched, or false for 'inapp' so the caller renders the route on the in-app Leaflet map.
export function openNavigation(lat, lng, provider = getMapProvider()) {
  if (provider === 'google') {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    return true;
  }
  if (provider === 'waze') {
    window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank');
    return true;
  }
  return false;
}
