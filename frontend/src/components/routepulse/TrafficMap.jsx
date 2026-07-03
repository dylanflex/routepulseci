import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { INCIDENT_TYPES, ROAD_SEGMENTS, TRAFFIC_LEVELS, ABIDJAN_CENTER } from "@/lib/mockData";
import { trafficColorHex } from "@/lib/traffic";
import { useAppData } from "@/context/AppDataContext";

// OpenFreeMap — free vector tiles, no API key or account required.
// https://openfreemap.org
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export const TrafficMap = ({ onPickIncident, activeFilter = "all" }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);
  const { incidents } = useAppData();

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: ABIDJAN_CENTER,
      zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      ROAD_SEGMENTS.forEach((r) => {
        map.addSource(`road-${r.id}`, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.coords } },
        });
        map.addLayer({
          id: `road-${r.id}`,
          type: "line",
          source: `road-${r.id}`,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": trafficColorHex(r.level), "line-width": 5, "line-opacity": 0.85 },
        });
      });
      setReady(true);
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const el = document.createElement("div");
          el.className = "routepulse-user-dot";
          new maplibregl.Marker({ element: el }).setLngLat([coords.longitude, coords.latitude]).addTo(map);
        },
        () => {},
        { timeout: 5000 }
      );
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const visible = incidents.filter((i) => activeFilter === "all" || i.type === activeFilter);
    visible.forEach((incident) => {
      const meta = INCIDENT_TYPES[incident.type];

      const el = document.createElement("button");
      el.className = "routepulse-incident-marker";
      el.style.backgroundColor = trafficColorHex(incident.severity);
      el.setAttribute("aria-label", meta.label);
      if (incident.confirmed >= 5) el.classList.add("animate-pulse-ring");
      el.innerHTML = `<span>${meta.emoji}</span>`;
      el.addEventListener("click", () => onPickIncident?.(incident));

      const tooltip = document.createElement("div");
      tooltip.className = "routepulse-marker-tooltip";
      tooltip.textContent = `${meta.label} · ${incident.confirmed} confirm.`;
      el.appendChild(tooltip);

      const marker = new maplibregl.Marker({ element: el }).setLngLat([incident.lng, incident.lat]).addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [ready, incidents, activeFilter, onPickIncident]);

  return <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" />;
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
