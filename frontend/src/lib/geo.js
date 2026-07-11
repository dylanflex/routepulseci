import { ABIDJAN_CENTER } from "@/lib/mockData";
import { api } from "@/lib/api";

const FALLBACK = { lat: ABIDJAN_CENTER[1], lng: ABIDJAN_CENTER[0] };

export function getCurrentPosition({ timeout = 5000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(FALLBACK);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      () => resolve(FALLBACK),
      { timeout }
    );
  });
}

// Great-circle distance in metres between two lat/lng points. Used client-side
// to decide whether a freshly reported incident falls within a user's alert
// radius — the whole point of the proximity notification system.
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Turn a GPS fix into a human address for the trip planner's origin. Backend
// reverse-geocodes (multi-provider chain) and always falls back to the nearest
// Abidjan district, so this only ever returns the literal "Ma position" if the
// request itself fails.
export async function describePosition(lat, lng) {
  try {
    const r = await api.reverseGeocode(lat, lng);
    return r?.name || "Ma position";
  } catch {
    return "Ma position";
  }
}
