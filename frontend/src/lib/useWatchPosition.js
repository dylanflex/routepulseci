import { useEffect, useState } from "react";

// Live geolocation watcher for the proximity-alert system. Returns the latest
// {lat, lng} fix, or null while unavailable/denied (in which case no proximity
// alerts fire — graceful, never blocks the app). One watcher per mount; only
// AppShell uses it, so the whole app shares a single subscription.
export function useWatchPosition(enabled = true) {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return undefined;
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => setPosition({ lat: coords.latitude, lng: coords.longitude }),
      () => setPosition(null),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return position;
}
