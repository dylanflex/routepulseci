import React, { useState } from "react";
import { TrafficMap } from "@/components/routepulse/LazyTrafficMap";
import { PlaceField } from "@/components/routepulse/PlaceField";
import { VoiceToggle } from "@/components/routepulse/VoiceToggle";
import { Button } from "@/components/ui/button";
import { INCIDENT_TYPES } from "@/lib/mockData";
import { getIncidentIcon, trafficColorVar, RECO_STYLE } from "@/lib/traffic";
import { formatRelativeTime } from "@/lib/time";
import { api } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import { speak, primeSpeech } from "@/lib/voice";
import { toast } from "sonner";
import {
  ArrowRight, Clock, TrendingDown, AlertTriangle, Search, Route as RouteIcon,
  Sparkles, LocateFixed, Check, History,
} from "lucide-react";

export default function Trajet() {
  const [from, setFrom] = useState("");
  const [fromSend, setFromSend] = useState("");
  const [to, setTo] = useState("");
  const [toSend, setToSend] = useState("");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [result, setResult] = useState(null);
  const [showReroute, setShowReroute] = useState(false);

  const scan = async () => {
    if (!fromSend.trim() || !toSend.trim()) return;
    primeSpeech();
    setLoading(true);
    setShowReroute(false);
    try {
      const data = await api.scanRoute({ from: fromSend, to: toSend });
      setResult(data);
      if (data.recommendation) {
        speak(`${data.recommendation.title}. ${data.recommendation.message}`);
      }
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
                <VoiceToggle />
              </div>
            </div>
          )}

          <div className="mt-4 rounded-2xl overflow-hidden border border-border bg-card">
            <div className="aspect-[4/3]">
              <TrafficMap routeLine={primaryRoute} altRouteLine={secondaryRoute} showRoutePlanner={false} />
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

          {/* Historical risk zones — recurring patterns (e.g. "floods every
              rainy season") that hold even without a live incident right now */}
          {result.historical_risk_zones?.length > 0 && (
            <div className="mt-5">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-warning" /> Zones à risque historique
              </h3>
              <div className="mt-3 space-y-2">
                {result.historical_risk_zones.map((z) => {
                  const meta = INCIDENT_TYPES[z.type] || { label: z.type, icon: "AlertTriangle" };
                  const Icon = getIncidentIcon(meta.icon);
                  return (
                    <div key={`${z.road}-${z.type}`} className="flex items-center gap-3 p-3 rounded-2xl bg-warning/5 border border-warning/20">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: trafficColorVar(z.typical_severity, 0.15), color: trafficColorVar(z.typical_severity) }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{meta.label} récurrent — {z.road}</p>
                        <p className="text-xs text-muted-foreground">
                          {z.occurrences} signalements historiques · dernier {formatRelativeTime(z.last_reported)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
