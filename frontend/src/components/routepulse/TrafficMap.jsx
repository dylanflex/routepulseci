import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { INCIDENT_TYPES, TRAFFIC_LEVELS, ABIDJAN_CENTER } from "@/lib/mockData";
import { trafficColorHex } from "@/lib/traffic";
import { useAppData } from "@/context/AppDataContext";

// OpenFreeMap — free vector tiles, no API key or account required.
// https://openfreemap.org
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export const TrafficMap = ({ onPickIncident, activeFilter = "all", routeLine = null, altRouteLine = null, recenterKey = 0, roadConditions = null }) => {
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
      const meta = INCIDENT_TYPES[incident.type] || { label: incident.type, icon: "AlertTriangle", emoji: "⚠️" };

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

  // Draw the scanned itinerary (when provided) and fit the map to it.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const data = routeLine && routeLine.length > 1
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: routeLine } }
      : { type: "FeatureCollection", features: [] };

    if (map.getSource("scanned-route")) {
      map.getSource("scanned-route").setData(data);
    } else {
      map.addSource("scanned-route", { type: "geojson", data });
      map.addLayer({
        id: "scanned-route",
        type: "line",
        source: "scanned-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#6d5efc", "line-width": 6, "line-opacity": 0.9 },
      });
    }

    const fitPoints = [
      ...(routeLine && routeLine.length > 1 ? routeLine : []),
      ...(altRouteLine && altRouteLine.length > 1 ? altRouteLine : []),
    ];
    if (fitPoints.length > 1) {
      const bounds = fitPoints.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(fitPoints[0], fitPoints[0])
      );
      map.fitBounds(bounds, { padding: 48, duration: 600, maxZoom: 14 });
    }
  }, [ready, routeLine, altRouteLine]);

  // Real road-condition stretches (coloured by nearby incidents). Updated
  // dynamically as incidents change; replaces the old static demo segments.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const features = (roadConditions || [])
      .filter((s) => Array.isArray(s.coords) && s.coords.length > 1)
      .map((s) => ({
        type: "Feature",
        properties: { color: trafficColorHex(s.level) },
        geometry: { type: "LineString", coordinates: s.coords },
      }));
    const data = { type: "FeatureCollection", features };

    if (map.getSource("road-conditions")) {
      map.getSource("road-conditions").setData(data);
    } else {
      map.addSource("road-conditions", { type: "geojson", data });
      map.addLayer({
        id: "road-conditions",
        type: "line",
        source: "road-conditions",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 6, "line-opacity": 0.85 },
      });
    }
  }, [ready, roadConditions]);

  // Recenter the map on the user's current position when asked (button click).
  useEffect(() => {
    if (!ready || !mapRef.current || !recenterKey || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => mapRef.current.flyTo({ center: [coords.longitude, coords.latitude], zoom: 14, duration: 800 }),
      () => {},
      { timeout: 5000 }
    );
  }, [ready, recenterKey]);

  // Draw the alternative (deviation) itinerary as a dashed overlay.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const data = altRouteLine && altRouteLine.length > 1
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: altRouteLine } }
      : { type: "FeatureCollection", features: [] };

    if (map.getSource("alt-route")) {
      map.getSource("alt-route").setData(data);
    } else {
      map.addSource("alt-route", { type: "geojson", data });
      map.addLayer({
        id: "alt-route",
        type: "line",
        source: "alt-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2fb56b", "line-width": 5, "line-opacity": 0.9, "line-dasharray": [1.5, 1.2] },
      });
    }
  }, [ready, altRouteLine]);

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
