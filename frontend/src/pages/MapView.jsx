import React, { useState } from "react";
import { TrafficMap } from "@/components/routepulse/LazyTrafficMap";
import { TrafficLegend } from "@/components/routepulse/TrafficLegend";
import { INCIDENT_TYPES } from "@/lib/mockData";
import { getIncidentIcon, trafficColorVar, estimateDelayMin } from "@/lib/traffic";
import { formatRelativeTime } from "@/lib/time";
import { useAppData } from "@/context/AppDataContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { MapPin, Clock, Users, Navigation, Share2 } from "lucide-react";
import { toast } from "sonner";

const FILTERS = [
  { key: "all", label: "Tout", emoji: "🌐" },
  { key: "jam", label: "Bouchons", emoji: "🚗" },
  { key: "accident", label: "Accidents", emoji: "🚧" },
  { key: "flood", label: "Inondations", emoji: "🌊" },
  { key: "degraded", label: "Nids de poule", emoji: "🕳️" },
  { key: "police", label: "Contrôles", emoji: "👮" },
  { key: "works", label: "Travaux", emoji: "🚜" },
];

export default function MapView() {
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const { incidents, confirmIncident, loading, incidentsUpdatedAt, incidentsFetching, roadConditions } = useAppData();
  const selected = incidents.find((i) => i.id === selectedId) || null;

  // "Mis à jour" reflects the last successful fetch — the map now polls, so
  // this is a real freshness indicator, not a frozen string.
  const lastUpdated = incidentsUpdatedAt ? new Date(incidentsUpdatedAt).toISOString() : null;

  const handleConfirmSelected = async () => {
    try {
      await confirmIncident(selected.id);
      if (!selected.confirmed_by_me) {
        toast.success("Confirmation envoyée 💪");
      }
    } catch (err) {
      toast.error(err.message || "Confirmation impossible", { description: "Connecte-toi pour confirmer." });
    }
  };

  const handleShareSelected = async () => {
    const link = `${window.location.origin}/app/carte?lat=${selected.lat}&lng=${selected.lng}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Lien copié 🔗");
    } catch {
      toast.error("Impossible de copier le lien", { description: link });
    }
  };

  return (
    <div className="px-4 pt-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground flex items-center gap-2">
          Carte en direct
          <span className={`inline-block w-2 h-2 rounded-full ${incidentsFetching ? "bg-accent animate-pulse" : "bg-accent/60"}`} title={incidentsFetching ? "Mise à jour…" : "En direct"} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Abidjan{lastUpdated ? ` · mis à jour ${formatRelativeTime(lastUpdated)}` : ""}
        </p>
      </div>

      {/* Filters */}
      <div className="mt-3 -mx-4 px-4 overflow-x-auto scrollbar-thin">
        <div className="flex gap-2 pb-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filter === f.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              <span className="mr-1">{f.emoji}</span>{f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map card */}
      <div className="mt-2 rounded-2xl overflow-hidden border border-border bg-card shadow-soft relative">
        <div className="aspect-[3/4] sm:aspect-[4/3]">
          <TrafficMap activeFilter={filter} onPickIncident={(i) => setSelectedId(i.id)} recenterKey={recenterKey} roadConditions={roadConditions} />
        </div>
        {/* Legend overlay */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <div className="glass rounded-xl p-2"><TrafficLegend /></div>
          <Button
            size="icon"
            onClick={() => setRecenterKey((k) => k + 1)}
            aria-label="Recentrer sur ma position"
            className="h-10 w-10 rounded-full bg-card text-foreground hover:bg-card shadow-elevated border border-border"
          >
            <Navigation className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Incident list */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Alertes proches</h2>
          <span className="text-xs text-muted-foreground">{incidents.length} résultats</span>
        </div>
        <div className="mt-3 space-y-2">
          {loading && <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>}
          {incidents.filter((i) => filter === "all" || i.type === filter).map((i) => {
            const meta = INCIDENT_TYPES[i.type] || { label: i.type, icon: "AlertTriangle", emoji: "⚠️" };
            const Icon = getIncidentIcon(meta.icon);
            return (
              <button
                key={i.id}
                onClick={() => setSelectedId(i.id)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card border border-border hover:shadow-elevated transition-shadow text-left"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: trafficColorVar(i.severity, 0.15), color: trafficColorVar(i.severity) }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{meta.label} · {i.road}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelativeTime(i.created_at)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{i.confirmed} confirm.</span>
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wide" style={{ borderColor: trafficColorVar(i.severity, 0.4), color: trafficColorVar(i.severity) }}>
                  {i.severity}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh]">
          {selected && (() => {
            const meta = INCIDENT_TYPES[selected.type] || { label: selected.type, icon: "AlertTriangle", emoji: "⚠️" };
            const Icon = getIncidentIcon(meta.icon);
            return (
              <>
                <SheetHeader className="text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: trafficColorVar(selected.severity, 0.15), color: trafficColorVar(selected.severity) }}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <SheetTitle className="font-display text-xl">{meta.label}</SheetTitle>
                      <SheetDescription className="flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3.5 h-3.5" /> {selected.road} · {formatRelativeTime(selected.created_at)}
                      </SheetDescription>
                    </div>
                  </div>
                </SheetHeader>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-xl bg-muted/60">
                    <p className="text-xs text-muted-foreground">Gravité</p>
                    <p className="font-semibold uppercase text-sm" style={{ color: trafficColorVar(selected.severity) }}>{selected.severity}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/60">
                    <p className="text-xs text-muted-foreground">Confirmations</p>
                    <p className="font-semibold text-sm text-foreground">{selected.confirmed}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/60">
                    <p className="text-xs text-muted-foreground">Impact</p>
                    <p className="font-semibold text-sm text-foreground">+{estimateDelayMin(selected.type, selected.severity)} min</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                  Les utilisateurs à proximité rapportent une {meta.label.toLowerCase()} confirmée. Une déviation par la voie parallèle est conseillée. Rejoins la discussion dans le fil.
                </p>
                <div className="mt-5 flex gap-2">
                  <Button
                    className={`flex-1 rounded-xl ${selected.confirmed_by_me ? "bg-accent text-accent-foreground" : "bg-foreground text-background"}`}
                    onClick={handleConfirmSelected}
                  >
                    {selected.confirmed_by_me ? "Confirmé ✓" : "Confirmer"}
                  </Button>
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={handleShareSelected}>
                    <Share2 className="w-4 h-4 mr-2" /> Partager
                  </Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
