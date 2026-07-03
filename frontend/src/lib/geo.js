import { ABIDJAN_CENTER } from "@/lib/mockData";

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
