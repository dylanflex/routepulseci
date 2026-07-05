import React, { useEffect, useRef, useState } from "react";
import { TrafficMap } from "@/components/routepulse/TrafficMap";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { INCIDENT_TYPES } from "@/lib/mockData";
import { getIncidentIcon, trafficColorVar } from "@/lib/traffic";
import { formatRelativeTime } from "@/lib/time";
import { api } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import { toast } from "sonner";
import {
  ArrowRight, Clock, TrendingDown, AlertTriangle, Search, Route as RouteIcon,
  Sparkles, ShieldCheck, ShieldAlert, Ban, MapPin, LocateFixed, Check,
} from "lucide-react";

const RECO_STYLE = {
  clear: { icon: ShieldCheck, tone: "#2fb56b", bg: "rgba(47,181,107,0.10)" },
  caution: { icon: ShieldAlert, tone: "#f59e0b", bg: "rgba(245,158,11,0.10)" },
  avoid: { icon: Ban, tone: "#e0432c", bg: "rgba(224,67,44,0.10)" },
};

// Input with debounced address autocomplete backed by GET /api/geocode/suggest.
function PlaceField({ value, onType, onPick, placeholder, dotColor, trailing }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [focused, setFocused] = useState(false);
  const skipRef = useRef(false); // don't re-query right after a pick

  useEffect(() => {
    if (!focused) return;
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.suggestPlaces(q);
        setItems(res);
        setOpen(res.length > 0);
      } catch {
        // Autocomplete is best-effort; a failed lookup shouldn't disrupt typing.
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value, focused]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/60">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <Input
          value={value}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => { setFocused(false); setOpen(false); }, 150)}
          className="border-0 bg-transparent focus-visible:ring-0 h-8 p-0 text-sm"
          placeholder={placeholder}
        />
        {trailing}
      </div>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-border bg-popover shadow-elevated overflow-hidden">
          {items.map((it, i) => (
            <button
              key={`${it.name}-${i}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { skipRef.current = true; onPick(it); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Trajet() {
  const [from, setFrom] = useState("Cocody Riviera 3");
  const [fromSend, setFromSend] = useState("Cocody Riviera 3");
  const [to, setTo] = useState("Plateau, Immeuble CCIA");
  const [toSend, setToSend] = useState("Plateau, Immeuble CCIA");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [result, setResult] = useState(null);
  const [showReroute, setShowReroute] = useState(false);

  const scan = async () => {
    if (!fromSend.trim() || !toSend.trim()) return;
    setLoading(true);
    setShowReroute(false);
    try {
      const data = await api.scanRoute({ from: fromSend, to: toSend });
      setResult(data);
    } catch (err) {
      toast.error(err.message || "Impossible de scanner l'itinéraire");
    } finally {
      setLoading(false);
    }
  };

  const locate = async () => {
    setLocating(true);
    try {
      const { lat, lng } = await getCurrentPosition();
      setFrom("Ma position");
      setFromSend(`${lat},${lng}`);
      toast.success("Position récupérée 📍");
    } finally {
      setLocating(false);
    }
  };

  const reco = result?.recommendation;
  const recoStyle = reco ? RECO_STYLE[reco.level] || RECO_STYLE.caution : null;
  const RecoIcon = recoStyle?.icon;
  const reroute = result?.reroute;
  const hasReroute = !!reroute;

  const primaryRoute = showReroute && reroute ? reroute.route : result?.route;
  const secondaryRoute = reroute ? (showReroute ? result?.route : reroute.route) : null;

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
          <RouteIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold">Avant de partir</h1>
          <p className="text-xs text-muted-foreground">On scanne ton itinéraire pour toi</p>
        </div>
      </div>

      {/* Search card */}
      <div className="mt-4 p-4 rounded-2xl bg-card border border-border shadow-soft space-y-2">
        <PlaceField
          value={from}
          onType={(v) => { setFrom(v); setFromSend(v); }}
          onPick={(it) => { setFrom(it.name); setFromSend(it.name); }}
          placeholder="Point de départ"
          dotColor="hsl(var(--accent))"
          trailing={(
            <button
              onClick={locate}
              disabled={locating}
              title="Partir de ma position"
              aria-label="Partir de ma position"
              className="flex-shrink-0 h-7 w-7 rounded-lg hover:bg-background flex items-center justify-center text-muted-foreground disabled:opacity-50"
            >
              <LocateFixed className={`w-4 h-4 ${locating ? "animate-pulse text-primary" : ""}`} />
            </button>
          )}
        />
        <PlaceField
          value={to}
          onType={(v) => { setTo(v); setToSend(v); }}
          onPick={(it) => { setTo(it.name); setToSend(it.name); }}
          placeholder="Destination"
          dotColor="hsl(var(--primary))"
        />
        <Button onClick={scan} disabled={loading} className="w-full h-11 rounded-xl bg-foreground text-background">
          <Search className="w-4 h-4 mr-2" /> {loading ? "Analyse en cours…" : "Scanner l’itinéraire"}
        </Button>
      </div>

      {/* Result */}
      {result && (
        <>
          {/* AI recommendation */}
          {reco && (
            <div className="mt-4 p-4 rounded-2xl border" style={{ background: recoStyle.bg, borderColor: recoStyle.tone }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: recoStyle.tone, color: "#fff" }}>
                  <RecoIcon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-display font-semibold text-sm flex items-center gap-1.5" style={{ color: recoStyle.tone }}>
                    {reco.title}
                    {reco.source === "ai" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                        <Sparkles className="w-3 h-3" /> IA
                      </span>
                    )}
                  </p>
                  <p className="text-sm mt-0.5 text-foreground/85">{reco.message}</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-2xl overflow-hidden border border-border bg-card">
            <div className="aspect-[4/3]">
              <TrafficMap routeLine={primaryRoute} altRouteLine={secondaryRoute} />
            </div>
          </div>

          {/* Direct vs deviation comparison */}
          <div className="mt-4">
            <h3 className="font-display text-lg font-semibold mb-2">Comparer les itinéraires</h3>
            <div className={`grid gap-2 ${hasReroute ? "grid-cols-2" : "grid-cols-1"}`}>
              <RouteCard
                label="Direct"
                active={!showReroute}
                distanceKm={result.distance_km}
                durationMin={result.duration_min}
                severeCount={result.severe_count}
                onSelect={() => setShowReroute(false)}
              />
              {hasReroute && (
                <RouteCard
                  label="Déviation"
                  accent
                  active={showReroute}
                  distanceKm={reroute.distance_km}
                  durationMin={reroute.duration_min}
                  severeCount={reroute.severe_count ?? 0}
                  savedMin={reroute.minutes_saved}
                  onSelect={() => setShowReroute(true)}
                />
              )}
            </div>
            {!hasReroute && (
              <p className="mt-2 text-xs text-muted-foreground">
                {result.severe_count > 0
                  ? "Aucune déviation plus sûre trouvée (routage alternatif indisponible sans clé)."
                  : "Pas de zone grave sur ce trajet — le direct suffit."}
              </p>
            )}
          </div>

          {/* Alerts along the way */}
          <div className="mt-5">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" /> Sur ton chemin
            </h3>
            {result.alerts.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground p-4 rounded-2xl bg-card border border-border">
                Aucun incident signalé le long de ce trajet. 🎉
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {result.alerts.map((i, idx) => {
                  const meta = INCIDENT_TYPES[i.type] || { label: i.type, icon: "AlertTriangle" };
                  const Icon = getIncidentIcon(meta.icon);
                  return (
                    <div key={i.id} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
                      <div className="font-display text-xl font-semibold text-muted-foreground w-6">{idx + 1}</div>
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: trafficColorVar(i.severity, 0.15), color: trafficColorVar(i.severity) }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{meta.label} — {i.road}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" />{formatRelativeTime(i.created_at)} · {i.confirmed} confirm.</p>
                      </div>
                      <span className="text-xs font-semibold text-destructive flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" /> +{i.delay_min} min
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RouteCard({ label, active, accent, distanceKm, durationMin, severeCount, savedMin, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`text-left p-3 rounded-2xl border transition-all ${
        active ? "border-foreground shadow-glow" : "border-border hover:border-foreground/30"
      } ${accent ? "bg-accent/5" : "bg-card"}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">{label}</span>
        {active && <Check className="w-3.5 h-3.5 text-foreground" />}
      </div>
      <p className="mt-1 font-display text-lg font-semibold">
        {durationMin} min <span className="text-sm font-medium text-muted-foreground">· {distanceKm} km</span>
      </p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className={severeCount > 0 ? "text-destructive font-medium" : "text-accent font-medium"}>
          {severeCount} zone{severeCount > 1 ? "s" : ""} à risque
        </span>
        {savedMin > 0 && (
          <span className="inline-flex items-center gap-0.5 text-accent font-semibold">
            <ArrowRight className="w-3 h-3" />-{savedMin} min
          </span>
        )}
      </div>
    </button>
  );
}
