// Static reference data (incident taxonomy, colors, road layout) — not
// domain data. Incidents/posts/comments now come from the backend API,
// see src/context/AppDataContext.jsx.
export const INCIDENT_TYPES = {
  degraded: { label: "Route dégradée", icon: "AlertTriangle", color: "traffic-dense", emoji: "🕳️" },
  accident: { label: "Accident", icon: "Siren", color: "traffic-blocked", emoji: "🚧" },
  jam: { label: "Embouteillage", icon: "CarFront", color: "traffic-dense", emoji: "🚗" },
  flood: { label: "Inondation", icon: "Waves", color: "traffic-danger", emoji: "🌊" },
  police: { label: "Contrôle", icon: "ShieldAlert", color: "info", emoji: "👮" },
  works: { label: "Travaux", icon: "HardHat", color: "traffic-dense", emoji: "🚜" },
};

export const TRAFFIC_LEVELS = {
  fluid: { label: "Fluide", color: "traffic-fluid", hex: "#2fb56b" },
  dense: { label: "Dense", color: "traffic-dense", hex: "#f59e0b" },
  blocked: { label: "Bloqué", color: "traffic-blocked", hex: "#e0432c" },
  danger: { label: "Danger", color: "traffic-danger", hex: "#a855c9" },
};

// Approximate real-world road positions around Abidjan/Cocody — indicative
// waypoints for the demo, not surveyed road geometry. Coordinates are
// [lng, lat] pairs (GeoJSON order).
export const ROAD_SEGMENTS = [
  { id: "r1", name: "Bd Latrille", coords: [[-3.990, 5.375], [-3.978, 5.372], [-3.965, 5.368]], level: "blocked" },
  { id: "r2", name: "Bd de France", coords: [[-4.025, 5.325], [-4.017, 5.320], [-4.010, 5.315]], level: "dense" },
  { id: "r3", name: "Autoroute du Nord", coords: [[-4.000, 5.400], [-3.950, 5.450], [-3.900, 5.500]], level: "fluid" },
  { id: "r4", name: "Pont HKB", coords: [[-3.970, 5.340], [-3.960, 5.320], [-3.955, 5.300]], level: "dense" },
  { id: "r5", name: "Bd VGE", coords: [[-3.965, 5.365], [-3.960, 5.360], [-3.955, 5.355]], level: "fluid" },
  { id: "r6", name: "Rue des Jardins", coords: [[-3.980, 5.372], [-3.975, 5.368], [-3.970, 5.364]], level: "blocked" },
  { id: "r7", name: "Bd Giscard d'Estaing", coords: [[-3.968, 5.358], [-3.963, 5.355], [-3.958, 5.352]], level: "dense" },
  { id: "r8", name: "Corniche", coords: [[-4.000, 5.338], [-3.995, 5.333], [-3.990, 5.328]], level: "danger" },
];

export const ABIDJAN_CENTER = [-4.0083, 5.3600];

export const STATS = {
  activeAlerts: 247,
  contributors: 12840,
  citiesCovered: 6,
  timeSaved: "3h27",
};
