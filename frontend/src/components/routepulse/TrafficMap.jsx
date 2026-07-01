import React, { useState } from "react";
import { motion } from "framer-motion";
import { INCIDENT_TYPES, ROAD_NETWORK, INCIDENTS, TRAFFIC_LEVELS } from "@/lib/mockData";
import { AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat } from "lucide-react";

const iconMap = { AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat };

const colorFor = (level) => {
  switch (level) {
    case "fluid": return "hsl(var(--traffic-fluid))";
    case "dense": return "hsl(var(--traffic-dense))";
    case "blocked": return "hsl(var(--traffic-blocked))";
    case "danger": return "hsl(var(--traffic-danger))";
    default: return "hsl(var(--muted-foreground))";
  }
};

export const TrafficMap = ({ onPickIncident, activeFilter = "all", showRoute = false }) => {
  const [hovered, setHovered] = useState(null);

  const visibleIncidents = INCIDENTS.filter(
    (i) => activeFilter === "all" || i.type === activeFilter
  );

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl">
      {/* Map background — abstract topological */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(158_35%_92%)] via-[hsl(40_25%_95%)] to-[hsl(210_35%_92%)]" />
      <div className="absolute inset-0 grid-bg opacity-70" />

      {/* Water shapes */}
      <svg viewBox="0 0 800 600" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="water" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(200 70% 82%)" />
            <stop offset="100%" stopColor="hsl(200 60% 70%)" />
          </linearGradient>
          <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(40 40% 95%)" />
            <stop offset="100%" stopColor="hsl(40 30% 90%)" />
          </linearGradient>
        </defs>

        {/* Lagoon shape */}
        <path
          d="M 0 580 Q 200 500 400 560 Q 600 620 800 550 L 800 600 L 0 600 Z"
          fill="url(#water)"
          opacity="0.55"
        />
        {/* districts */}
        <path d="M -20 -20 L 380 -20 L 340 240 L 60 320 Z" fill="url(#land)" opacity="0.5" />
        <path d="M 420 -20 L 820 -20 L 820 260 L 500 240 Z" fill="url(#land)" opacity="0.4" />

        {/* Roads — base outline (wider gray) */}
        {ROAD_NETWORK.map((r) => (
          <path
            key={`bg-${r.id}`}
            d={r.d}
            fill="none"
            stroke="hsl(220 15% 90%)"
            strokeWidth="14"
            strokeLinecap="round"
          />
        ))}
        {/* Roads — colored by traffic level */}
        {ROAD_NETWORK.map((r) => (
          <path
            key={`fg-${r.id}`}
            d={r.d}
            fill="none"
            stroke={colorFor(r.level)}
            strokeWidth="7"
            strokeLinecap="round"
            opacity={0.95}
            className={r.level === "blocked" || r.level === "danger" ? "animate-dash" : ""}
          />
        ))}

        {/* Route preview */}
        {showRoute && (
          <path
            d="M 80 500 Q 240 380 380 320 T 700 180"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="5"
            strokeDasharray="2 8"
            strokeLinecap="round"
          />
        )}

        {/* Confirmed zones (halos) */}
        {visibleIncidents.filter((i) => i.confirmed >= 8).map((i) => (
          <circle
            key={`halo-${i.id}`}
            cx={i.x}
            cy={i.y}
            r="36"
            fill={colorFor(i.severity)}
            opacity="0.18"
          />
        ))}
      </svg>

      {/* Incident pins */}
      {visibleIncidents.map((incident, idx) => {
        const meta = INCIDENT_TYPES[incident.type];
        const Icon = iconMap[meta.icon] || AlertTriangle;
        const leftPct = (incident.x / 800) * 100;
        const topPct = (incident.y / 600) * 100;
        const isConfirmed = incident.confirmed >= 5;
        return (
          <motion.button
            key={incident.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: idx * 0.08, type: "spring", stiffness: 200 }}
            onClick={() => onPickIncident?.(incident)}
            onMouseEnter={() => setHovered(incident.id)}
            onMouseLeave={() => setHovered(null)}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
          >
            <div
              className={`relative flex items-center justify-center w-9 h-9 rounded-full shadow-elevated ring-2 ring-white ${isConfirmed ? "animate-pulse-ring" : ""}`}
              style={{ backgroundColor: colorFor(incident.severity) }}
            >
              <Icon className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            {hovered === incident.id && (
              <div className="absolute left-1/2 -translate-x-1/2 -top-14 whitespace-nowrap px-2.5 py-1.5 rounded-lg glass text-xs font-medium text-foreground shadow-elevated z-10">
                {meta.label} · {incident.confirmed} confirm.
              </div>
            )}
          </motion.button>
        );
      })}

      {/* User location */}
      <div className="absolute left-[10%] bottom-[16%]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/25 blur-sm animate-pulse-ring w-6 h-6" />
          <div className="relative w-4 h-4 rounded-full bg-primary ring-4 ring-white shadow-elevated" />
        </div>
      </div>
    </div>
  );
};

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

export default TrafficMap;
