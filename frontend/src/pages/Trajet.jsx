import React, { useState } from "react";
import { TrafficMap } from "@/components/routepulse/TrafficMap";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { INCIDENTS, INCIDENT_TYPES } from "@/lib/mockData";
import { MapPin, ArrowRight, Clock, TrendingDown, AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat, Search, Route as RouteIcon } from "lucide-react";

const iconMap = { AlertTriangle, Siren, CarFront, Waves, ShieldAlert, HardHat };

export default function Trajet() {
  const [from, setFrom] = useState("Cocody Riviera 3");
  const [to, setTo] = useState("Plateau, Immeuble CCIA");
  const [showResult, setShowResult] = useState(false);

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
        <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/60">
          <span className="w-2.5 h-2.5 rounded-full bg-accent" />
          <Input value={from} onChange={(e) => setFrom(e.target.value)} className="border-0 bg-transparent focus-visible:ring-0 h-8 p-0 text-sm" placeholder="Point de départ" />
        </div>
        <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/60">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
          <Input value={to} onChange={(e) => setTo(e.target.value)} className="border-0 bg-transparent focus-visible:ring-0 h-8 p-0 text-sm" placeholder="Destination" />
        </div>
        <Button onClick={() => setShowResult(true)} className="w-full h-11 rounded-xl bg-foreground text-background">
          <Search className="w-4 h-4 mr-2" /> Scanner l’itinéraire
        </Button>
      </div>

      {/* Result */}
      {showResult && (
        <>
          <div className="mt-4 rounded-2xl overflow-hidden border border-border bg-card">
            <div className="aspect-[4/3]">
              <TrafficMap showRoute />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="p-3 rounded-2xl bg-card border border-border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Distance</p>
              <p className="font-display text-lg font-semibold">14,2 km</p>
            </div>
            <div className="p-3 rounded-2xl bg-card border border-border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Temps</p>
              <p className="font-display text-lg font-semibold text-primary">42 min</p>
            </div>
            <div className="p-3 rounded-2xl bg-card border border-border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Alertes</p>
              <p className="font-display text-lg font-semibold">3</p>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" /> Sur ton chemin
            </h3>
            <div className="mt-3 space-y-2">
              {INCIDENTS.slice(0, 3).map((i, idx) => {
                const meta = INCIDENT_TYPES[i.type];
                const Icon = iconMap[meta.icon] || AlertTriangle;
                return (
                  <div key={i.id} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
                    <div className="font-display text-xl font-semibold text-muted-foreground w-6">{idx+1}</div>
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `hsl(var(--traffic-${i.severity}) / 0.15)`, color: `hsl(var(--traffic-${i.severity}))` }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{meta.label} — {i.road}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" />{i.time}</p>
                    </div>
                    <span className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" /> +{6+idx*3} min
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 p-4 rounded-2xl bg-gradient-accent text-accent-foreground">
            <p className="font-display font-semibold">Déviation recommandée</p>
            <p className="text-sm mt-1 text-accent-foreground/85">
              Via Bd VGE → Autoroute du Nord → Pont HKB. Gain estimé : <span className="font-semibold">12 min</span>.
            </p>
            <Button variant="outline" size="sm" className="mt-3 rounded-xl bg-white/15 border-white/20 text-accent-foreground hover:bg-white/25">
              Utiliser cette route <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
