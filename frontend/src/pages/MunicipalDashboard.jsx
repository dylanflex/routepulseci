import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Landmark, ArrowLeft, MapPin, ShieldAlert, TrendingUp, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { INCIDENT_TYPES } from "@/lib/mockData";
import { api } from "@/lib/api";

const TONE_CLASSES = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning/10 text-warning",
};

const StatCard = ({ icon: Icon, label, value, tone = "primary" }) => (
  <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${TONE_CLASSES[tone]}`}>
      <Icon className="w-5 h-5" />
    </div>
    <p className="mt-3 font-display text-3xl font-semibold text-foreground">{value}</p>
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

export default function MunicipalDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.municipalDashboard().then(setDashboard).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-hero flex items-center justify-center shadow-glow">
              <Landmark className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold text-foreground">Espace collectivités &amp; partenaires</h1>
              <p className="text-xs text-muted-foreground">RoutePulse CI · Données agrégées, Abidjan</p>
            </div>
          </div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Retour au site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
          Ce que la mairie, l&apos;OSER ou un partenaire (assureur, opérateur télécom) ne voit dans aucune carte
          générique : les communes qui concentrent le plus de signalements, et les tronçons où le même incident
          revient assez souvent pour justifier une priorisation de travaux ou une tarification différenciée.
        </p>

        {error && (
          <p className="mt-6 text-sm text-destructive">Impossible de charger les données : {error}</p>
        )}

        {!dashboard && !error && (
          <p className="mt-8 text-sm text-muted-foreground">Chargement…</p>
        )}

        {dashboard && (
          <>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={TrendingUp} label="Signalements historiques (total)" value={dashboard.citywide.total_reports} tone="primary" />
              <StatCard icon={MapPin} label="Alertes actives en ce moment" value={dashboard.citywide.active_incidents} tone="accent" />
              <StatCard icon={ShieldAlert} label="Zones à risque récurrent détectées" value={dashboard.citywide.risk_zones} tone="warning" />
            </div>

            <div className="mt-8 rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h2 className="font-display font-semibold text-foreground">Par commune</h2>
              </div>
              {dashboard.communes.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">Pas encore assez de données pour ce découpage.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                        <th className="px-5 py-3 font-medium">Commune</th>
                        <th className="px-5 py-3 font-medium">Signalements</th>
                        <th className="px-5 py-3 font-medium">Alertes actives</th>
                        <th className="px-5 py-3 font-medium">Zones à risque</th>
                        <th className="px-5 py-3 font-medium">Type dominant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.communes.map((c) => {
                        const meta = c.top_type ? INCIDENT_TYPES[c.top_type] : null;
                        return (
                          <tr key={c.commune} className="border-b border-border/60 last:border-0">
                            <td className="px-5 py-3 font-semibold text-foreground">{c.commune}</td>
                            <td className="px-5 py-3 text-muted-foreground">{c.total_reports}</td>
                            <td className="px-5 py-3 text-muted-foreground">{c.active_incidents}</td>
                            <td className="px-5 py-3">
                              {c.risk_zones > 0 ? (
                                <Badge variant="outline" className="rounded-full text-[11px] border-warning/40 text-warning bg-warning/5">
                                  {c.risk_zones} zone{c.risk_zones > 1 ? "s" : ""}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">
                              {meta ? <>{meta.emoji} {meta.label}</> : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-8 rounded-2xl border border-dashed border-border p-5">
              <h3 className="font-display font-semibold text-foreground text-sm">Au-delà du tableau de bord</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Ces mêmes zones à risque peuvent être exposées via une API à un assureur (tarification par exposition
                au risque routier plutôt qu&apos;au profil seul) ou à un opérateur télécom/logistique (optimisation de
                tournées). La app reste 100% gratuite pour les citoyens — ce sont ces accès B2B/B2G qui financent
                l&apos;infrastructure, pas un abonnement grand public.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
