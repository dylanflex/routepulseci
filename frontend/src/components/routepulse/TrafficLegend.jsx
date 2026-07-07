import { TRAFFIC_LEVELS } from "@/lib/mockData";

// Deliberately its own module, separate from TrafficMap.jsx: it has no
// mapbox-gl dependency, so importing it doesn't pull that (large) library
// into a bundle chunk that only needs the color legend, not the map itself.
export const TrafficLegend = () => (
  <div className="flex flex-wrap gap-2">
    {Object.entries(TRAFFIC_LEVELS).map(([key, val]) => (
      <div key={key} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border text-xs">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: val.hex }} />
        <span className="text-muted-foreground">{val.label}</span>
      </div>
    ))}
  </div>
);

export default TrafficLegend;
