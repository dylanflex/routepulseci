import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { toast } from "sonner";
import { Maximize2, Minimize2, Search, LocateFixed, X, Sparkles, History, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlaceField } from "@/components/routepulse/PlaceField";
import { VoiceToggle } from "@/components/routepulse/VoiceToggle";
import { INCIDENT_TYPES, ABIDJAN_CENTER } from "@/lib/mockData";
import { trafficColorHex, RECO_STYLE } from "@/lib/traffic";
import { useAppData } from "@/context/AppDataContext";
import { api } from "@/lib/api";
import { getCurrentPosition, describePosition } from "@/lib/geo";
import { speak, primeSpeech } from "@/lib/voice";

// Full Mapbox GL JS. Public token (pk.*) is safe to ship client-side; it comes
// from REACT_APP_MAPBOX_TOKEN (frontend/.env) so it isn't hardcoded in source.
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;
// Mapbox Standard (v3): a real 3D basemap — extruded buildings + realistic
// lighting — so the tilted camera shows actual geometry, not flat tiles.
const MAP_STYLE = "mapbox://styles/mapbox/standard";
// Overview (browsing) vs navigation (follow-me) camera presets.
const OVERVIEW_CAMERA = { pitch: 45, bearing: -8, zoom: 12.5 };
const NAV_CAMERA = { pitch: 62, zoom: 16.5 };

// When a map is torn down mid-load (React StrictMode double-mounts in dev),
// mapbox-gl aborts its in-flight style/tile fetches. Those cancellations reject
// with a benign "signal is aborted without reason" AbortError that escapes as an
// unhandled rejection — a try/catch around map.remove() can't catch it — and
// CRA's dev overlay then flags it as an "Uncaught runtime error". Swallow only
// that exact AbortError so it stops spamming the overlay. Never fires in prod
// (StrictMode double-mount + the overlay are both dev-only).
if (typeof window !== "undefined" && !window.__routepulseAbortSwallow) {
  window.__routepulseAbortSwallow = true;
  const isBenignAbort = (err) =>
    err && err.name === "AbortError" && /signal is aborted without reason/i.test(err.message || "");
  window.addEventListener("unhandledrejection", (e) => {
    if (isBenignAbort(e.reason)) e.preventDefault();
  });
  window.addEventListener("error", (e) => {
    if (isBenignAbort(e.error)) e.preventDefault();
  });
}

export const TrafficMap = ({
  onPickIncident,
  activeFilter = "all",
  routeLine = null,
  altRouteLine = null,
  recenterKey = 0,
  roadConditions = null,
  allowFullscreen = true,
  // The Trajet page already has its own "avant de partir" search UI and
  // drives routeLine/altRouteLine itself — it opts out so fullscreen there
  // doesn't show a second, redundant planner on top of its own.
  showRoutePlanner = true,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [navMode, setNavMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { incidents } = useAppData();

  // "Avant de partir" mini trip planner, available inline in fullscreen so
  // the live map and route scanning don't have to be two separate pages.
  const [plannerFrom, setPlannerFrom] = useState("");
  const [plannerFromSend, setPlannerFromSend] = useState("");
  const [plannerTo, setPlannerTo] = useState("");
  const [plannerToSend, setPlannerToSend] = useState("");
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerLocating, setPlannerLocating] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // A scanned route takes over the map's route display; otherwise fall back
  // to whatever the parent passed in (e.g. the Trajet page's own scan).
  const effectiveRouteLine = scanResult?.route ?? routeLine;
  const effectiveAltRouteLine = scanResult?.reroute?.route ?? altRouteLine;
  const plannerReco = scanResult?.recommendation ?? null;
  const plannerRecoStyle = plannerReco ? RECO_STYLE[plannerReco.level] || RECO_STYLE.caution : null;
  const PlannerRecoIcon = plannerRecoStyle?.icon;

  const runPlannerScan = async () => {
    if (!plannerFromSend.trim() || !plannerToSend.trim()) return;
    primeSpeech();
    setPlannerLoading(true);
    try {
      const data = await api.scanRoute({ from: plannerFromSend, to: plannerToSend });
      setScanResult(data);
      if (data.recommendation) {
        speak(`${data.recommendation.title}. ${data.recommendation.message}`);
      }
    } catch (err) {
      toast.error(err.message || "Impossible de scanner l'itinéraire");
    } finally {
      setPlannerLoading(false);
    }
  };

  const locatePlanner = async () => {
    setPlannerLocating(true);
    try {
      const { lat, lng } = await getCurrentPosition();
      setPlannerFromSend(`${lat},${lng}`);
      setPlannerFrom(await describePosition(lat, lng));
    } catch {
      toast.error("Impossible de récupérer ta position");
    } finally {
      setPlannerLocating(false);
    }
  };

  const clearPlannerScan = () => setScanResult(null);

  // Fullscreen is meant to be entered/exited fresh each time — drop any scan
  // and search text so reopening it later doesn't show a stale itinerary.
  useEffect(() => {
    if (fullscreen) return;
    setScanResult(null);
    setPlannerFrom("");
    setPlannerFromSend("");
    setPlannerTo("");
    setPlannerToSend("");
  }, [fullscreen]);

  // Create or move the "you are here" GPS dot without duplicating markers.
  const placeUserDot = (lng, lat) => {
    if (!mapRef.current) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([lng, lat]);
    } else {
      const el = document.createElement("div");
      el.className = "routepulse-user-dot";
      userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(mapRef.current);
    }
  };

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    // Give each map its own fresh inner element rather than mounting straight
    // into the ref'd host. Because teardown is deferred (see cleanup), the old
    // map's canvas can briefly linger; a dedicated per-map div keeps every new
    // map's container empty, avoiding mapbox's "container should be empty" warn.
    const host = containerRef.current;
    const inner = document.createElement("div");
    inner.style.width = "100%";
    inner.style.height = "100%";
    host.appendChild(inner);

    const map = new mapboxgl.Map({
      container: inner,
      style: MAP_STYLE,
      center: ABIDJAN_CENTER,
      zoom: OVERVIEW_CAMERA.zoom,
      pitch: OVERVIEW_CAMERA.pitch,
      bearing: OVERVIEW_CAMERA.bearing,
      attributionControl: false,
      cooperativeGestures: false,
    });
    mapRef.current = map;
    // `removed` guards async callbacks (load, geolocation) so they never touch
    // a map that React StrictMode has already torn down under them.
    let removed = false;

    // Aborted/failed style & tile fetches (teardown, or a browser reload
    // cancelling in-flight requests) are benign — don't let them spam the
    // console as red errors. Surface anything genuinely unexpected.
    map.on("error", (e) => {
      const msg = e?.error?.message || "";
      if (/abort|Failed to fetch/i.test(msg)) return;
      // eslint-disable-next-line no-console
      console.error("mapbox:", msg || e?.error);
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");

    let readied = false;
    const markReady = () => {
      if (removed || readied) return;
      readied = true;
      // Day lighting keeps the 3D basemap bright and legible (roads, labels,
      // the route line) instead of the moodier dusk/night presets — closer to
      // the clear, high-contrast look of dedicated nav apps (Yango, Google
      // Maps) than a stylized dark map.
      try {
        map.setConfigProperty("basemap", "lightPreset", "day");
        map.setConfigProperty("basemap", "show3dObjects", true);
      } catch {
        /* older style/config API — 3D buildings still ship by default */
      }
      setReady(true);
    };
    // "load" can race with StrictMode's double-mount on the heavy Standard
    // style, so also latch on "idle" (guaranteed to fire once the map has
    // finished rendering) as a belt-and-braces fallback.
    map.on("load", markReady);
    map.once("idle", markReady);
    if (map.isStyleLoaded()) markReady();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (removed || !mapRef.current) return;
          placeUserDot(coords.longitude, coords.latitude);
        },
        () => {},
        { timeout: 5000 }
      );
    }

    return () => {
      removed = true;
      setReady(false);
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      userMarkerRef.current = null;
      // Removing a map whose style is still loading aborts its in-flight
      // requests, which reject with a benign "signal is aborted without reason"
      // AbortError. That rejection is asynchronous, so a try/catch here can't
      // catch it — instead, wait until the style has finished loading before
      // tearing the map down, so there are no pending requests to abort. This
      // only matters under React StrictMode's dev double-mount.
      let destroyed = false;
      const destroy = () => {
        if (destroyed) return;
        destroyed = true;
        try {
          map.remove();
        } catch {
          /* already gone */
        }
        inner.remove();
      };
      if (map.loaded()) {
        destroy();
      } else {
        map.once("load", destroy);
        map.once("idle", destroy);
      }
      mapRef.current = null;
    };
  }, []);

  // Navigation ("follow-me") mode: a chase camera that tracks the live GPS
  // position with a heading-up bearing — the closest a web map gets to a GPS
  // navigation view without the paid Navigation SDK.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    if (!navMode) {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      map.easeTo({ ...OVERVIEW_CAMERA, duration: 800 });
      return;
    }

    if (!navigator.geolocation) {
      setNavMode(false);
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!mapRef.current) return;
        placeUserDot(coords.longitude, coords.latitude);
        const camera = {
          center: [coords.longitude, coords.latitude],
          pitch: NAV_CAMERA.pitch,
          zoom: NAV_CAMERA.zoom,
          duration: 900,
        };
        // Orient the map to the direction of travel when we have a heading.
        if (Number.isFinite(coords.heading)) camera.bearing = coords.heading;
        map.easeTo(camera);
      },
      () => setNavMode(false),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 8000 }
    );

    return () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [ready, navMode]);

  // Incident markers are HTML overlays — they don't need the style loaded, so
  // they attach as soon as the map exists (independent of `ready`), which keeps
  // them reliable even while the heavy 3D basemap is still streaming in.
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const visible = incidents.filter((i) => activeFilter === "all" || i.type === activeFilter);
    visible.forEach((incident) => {
      const meta = INCIDENT_TYPES[incident.type] || { label: incident.type, icon: "AlertTriangle" };

      const el = document.createElement("button");
      el.className = "routepulse-incident-marker";
      el.style.backgroundColor = trafficColorHex(incident.severity);
      el.setAttribute("aria-label", meta.label);
      if (incident.confirmed >= 5) el.classList.add("animate-pulse-ring");
      // Clean colored pin: severity color + white centre dot (no emoji). The
      // type is conveyed by the tooltip below and the list/detail UI.
      el.innerHTML = `<span style="width:9px;height:9px;border-radius:9999px;background:#fff;opacity:.95;box-shadow:0 0 0 1px rgba(0,0,0,.06)"></span>`;
      el.addEventListener("click", () => onPickIncident?.(incident));

      const tooltip = document.createElement("div");
      tooltip.className = "routepulse-marker-tooltip";
      tooltip.textContent = `${meta.label} · ${incident.confirmed} confirm.`;
      el.appendChild(tooltip);

      const marker = new mapboxgl.Marker({ element: el }).setLngLat([incident.lng, incident.lat]).addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [incidents, activeFilter, onPickIncident]);

  // Draw the scanned itinerary (when provided) and fit the map to it.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const data = effectiveRouteLine && effectiveRouteLine.length > 1
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: effectiveRouteLine } }
      : { type: "FeatureCollection", features: [] };

    if (map.getSource("scanned-route")) {
      map.getSource("scanned-route").setData(data);
    } else {
      map.addSource("scanned-route", { type: "geojson", data });
      map.addLayer({
        id: "scanned-route",
        type: "line",
        source: "scanned-route",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#6d5efc", "line-width": 6, "line-opacity": 0.9 },
      });
    }

    const fitPoints = [
      ...(effectiveRouteLine && effectiveRouteLine.length > 1 ? effectiveRouteLine : []),
      ...(effectiveAltRouteLine && effectiveAltRouteLine.length > 1 ? effectiveAltRouteLine : []),
    ];
    if (fitPoints.length > 1) {
      const bounds = fitPoints.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(fitPoints[0], fitPoints[0])
      );
      map.fitBounds(bounds, { padding: 48, duration: 600, maxZoom: 14 });
    }
  }, [ready, effectiveRouteLine, effectiveAltRouteLine]);

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
        slot: "middle",
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
    const data = effectiveAltRouteLine && effectiveAltRouteLine.length > 1
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: effectiveAltRouteLine } }
      : { type: "FeatureCollection", features: [] };

    if (map.getSource("alt-route")) {
      map.getSource("alt-route").setData(data);
    } else {
      map.addSource("alt-route", { type: "geojson", data });
      map.addLayer({
        id: "alt-route",
        type: "line",
        source: "alt-route",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2fb56b", "line-width": 5, "line-opacity": 0.9, "line-dasharray": [1.5, 1.2] },
      });
    }
  }, [ready, effectiveAltRouteLine]);

  // Fullscreen swaps the container from filling its parent card to covering
  // the viewport (see the className below) — mapbox-gl auto-resizes on that
  // via its own ResizeObserver, but we still nudge it explicitly since the
  // container's CSS transition can otherwise leave the canvas briefly
  // mis-sized. Escape and body-scroll-lock match what a fullscreen UI should
  // feel like even though this is a CSS overlay, not the native Fullscreen API
  // (which iOS Safari doesn't support on arbitrary elements).
  useEffect(() => {
    if (!fullscreen) return;
    const raf = requestAnimationFrame(() => mapRef.current?.resize());
    const onKeyDown = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  // The mapbox container keeps its original single-level `h-full` sizing (a
  // known-good height chain); the nav toggle is an absolutely-positioned child
  // overlaid on top — mapbox appends its canvas as a sibling and leaves it be.
  return (
    <div
      ref={containerRef}
      className={
        fullscreen
          ? "fixed inset-0 z-50 h-screen w-screen"
          : "relative w-full h-full rounded-2xl overflow-hidden"
      }
    >
      {/* Grouped top-left so neither button collides with mapbox's own
          top-right zoom/compass control or MapView's bottom overlays. */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setNavMode((v) => !v)}
          aria-pressed={navMode}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold shadow-elevated border transition-colors ${
            navMode
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card/95 text-foreground border-border hover:border-primary/40"
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          {navMode ? "Quitter la nav" : "Navigation"}
        </button>
        {allowFullscreen && (
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
            title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
            className="h-9 w-9 rounded-full shadow-elevated border bg-card/95 text-foreground border-border hover:border-primary/40 flex items-center justify-center flex-shrink-0"
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* "Avant de partir" mini trip planner — only in fullscreen, and only
          when this TrafficMap isn't already driven by a parent-controlled
          route (see showRoutePlanner). Lets someone plan a route without
          leaving the immersive live map. */}
      {fullscreen && showRoutePlanner && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="max-w-xl mx-auto rounded-2xl glass shadow-elevated p-3 space-y-2">
            {plannerReco && (
              <div
                className="flex items-start gap-2 px-3 py-2 rounded-xl border"
                style={{ background: plannerRecoStyle.bg, borderColor: plannerRecoStyle.tone }}
              >
                <PlannerRecoIcon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: plannerRecoStyle.tone }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: plannerRecoStyle.tone }}>
                    {plannerReco.title}
                    {plannerReco.source === "ai" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                        <Sparkles className="w-3 h-3" /> IA
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{plannerReco.message}</p>
                  {scanResult?.historical_risk_zones?.length > 0 && (
                    <p className="text-[10px] font-medium text-warning flex items-center gap-1 mt-0.5">
                      <History className="w-3 h-3 flex-shrink-0" />
                      {scanResult.historical_risk_zones.length} zone{scanResult.historical_risk_zones.length > 1 ? "s" : ""} à risque historique sur ce trajet
                    </p>
                  )}
                </div>
                <VoiceToggle />
                <button
                  type="button"
                  onClick={clearPlannerScan}
                  aria-label="Effacer l'itinéraire"
                  className="p-1 rounded-full hover:bg-background/60 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            )}
            <PlaceField
              value={plannerFrom}
              onType={(v) => { setPlannerFrom(v); setPlannerFromSend(v); }}
              onPick={(it) => { setPlannerFrom(it.name); setPlannerFromSend(it.name); }}
              placeholder="Point de départ"
              dotColor="hsl(var(--accent))"
              trailing={(
                <button
                  type="button"
                  onClick={locatePlanner}
                  disabled={plannerLocating}
                  title="Partir de ma position"
                  aria-label="Partir de ma position"
                  className="flex-shrink-0 h-7 w-7 rounded-lg hover:bg-background flex items-center justify-center text-muted-foreground disabled:opacity-50"
                >
                  <LocateFixed className={`w-4 h-4 ${plannerLocating ? "animate-pulse text-primary" : ""}`} />
                </button>
              )}
            />
            <PlaceField
              value={plannerTo}
              onType={(v) => { setPlannerTo(v); setPlannerToSend(v); }}
              onPick={(it) => { setPlannerTo(it.name); setPlannerToSend(it.name); }}
              placeholder="Destination"
              dotColor="hsl(var(--primary))"
            />
            <Button onClick={runPlannerScan} disabled={plannerLoading} className="w-full h-10 rounded-xl bg-foreground text-background">
              <Search className="w-4 h-4 mr-2" /> {plannerLoading ? "Analyse en cours…" : "Scanner l'itinéraire"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrafficMap;
