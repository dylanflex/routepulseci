import { lazy, Suspense } from "react";

// mapbox-gl is the single heaviest dependency in this app (it's a large,
// self-contained WebGL library) and TrafficMap.jsx imports it at module
// scope. A regular import would bundle it into every page that renders a
// map — including the Landing page, the very first thing a visitor loads.
// Splitting it into its own chunk means it only downloads once a map is
// actually about to render.
const TrafficMapImpl = lazy(() => import("./TrafficMap"));

export function TrafficMap(props) {
  return (
    <Suspense fallback={<div className="w-full h-full rounded-2xl bg-muted animate-pulse" />}>
      <TrafficMapImpl {...props} />
    </Suspense>
  );
}

export default TrafficMap;
