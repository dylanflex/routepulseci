import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Landmark, ArrowLeft, MapPin, ShieldAlert, TrendingUp, Building2, Radar, Clock, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { INCIDENT_TYPES } from "@/lib/mockData";
import { api } from "@/lib/api";

const TONE_CLASSES = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning/10 text-warning",
};

const RISK_COLORS = {
  élevé: { bar: "bg-traffic-blocked", text: "text-traffic-blocked", chip: "border-traffic-blocked/40 text-traffic-blocked bg-traffic-blocked/5" },
  modéré: { bar: "bg-traffic-dense", text: "text-traffic-dense", chip: "border-traffic-dense/40 text-traffic-dense bg-traffic-dense/5" },
  faible: { bar: "bg-traffic-fluid", text: "text-traffic-fluid", chip: "border-traffic-fluid/40 text-traffic-fluid bg-traffic-fluid/5" },
};

const TrendIcon = ({ trend }) =>
  trend === "en hausse" ? <TrendingUp className="w-3.5 h-3.5 text-traffic-blocked" />
  : trend === "en baisse" ? <TrendingDown className="w-3.5 h-3.5 text-traffic-fluid" />
  : <Minus className="w-3.5 h-3.5 text-muted-foreground" />;

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
  const [predictions, setPredictions] = useState([]);
  const [predSummary, setPredSummary] = useState(null);
  const [cityScore, setCityScore] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.municipalDashboard().then(setDashboard).catch((err) => setError(err.message));
    api.predictions().then(setPredictions).catch(() => {});
    api.predictionsSummary().then(setPredSummary).catch(() => {});
    api.cityScore().then(setCityScore).catch(() => {});
  }, []);

  const fmt = (n) => (typeof n === "number" ? n.toLocaleString("fr-FR") : "—");

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

        {/* Flagship: RoutePulse Mobility Intelligence Score */}
        {cityScore && (
          <div className="mt-6 rounded-3xl bg-gradient-dark text-white p-6 sm:p-8 shadow-elevated relative overflow-hidden">
            <div className="absolute -top-16 -right-10 w-64 h-64 bg-primary/30 rounded-full blur-3xl" />
            <div className="relative">
              <p className="text-xs uppercase tracking-widest text-white/60">RoutePulse Mobility Intelligence Score · Abidjan</p>
              <div className="mt-3 grid lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-4 flex items-end gap-3">
                  <span className="font-display text-6xl sm:text-7xl font-semibold leading-none">{cityScore.score}</span>
                  <div className="pb-2">
                    <span className="text-2xl text-white/50">/100</span>
                    <p className="font-semibold text-primary-glow">Mobilité {cityScore.label}</p>
                  </div>
                </div>
                <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ["Fluidité", cityScore.components.fluidite],
                    ["Sécurité", cityScore.components.securite],
                    ["Inondations", cityScore.components.inondations],
                    ["Infrastructure", cityScore.components.infrastructure],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs text-white/70">
                        <span>{label}</span><span className="font-semibold text-white">{val}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow" style={{ width: `${val}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Heures perdues (aujourd'hui)", `${fmt(cityScore.economic_estimate.hours_lost)} h`],
                  ["Coût économique estimé", `${fmt(cityScore.economic_estimate.cost_fcfa)} FCFA`],
                  ["Carburant gaspillé", `${fmt(cityScore.economic_estimate.fuel_liters)} L`],
                  ["Émissions CO₂", `${fmt(cityScore.economic_estimate.co2_kg)} kg`],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-2xl bg-white/10 backdrop-blur p-3">
                    <p className="font-display text-lg font-semibold">{val}</p>
                    <p className="text-[11px] text-white/60">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-white/45">
                Estimation à hypothèses transparentes : {cityScore.economic_estimate.assumptions.join(" · ")}.
              </p>
            </div>
          </div>
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

            {/* Predictive layer — the "que va-t-il se passer" data product */}
            <div className="mt-8 flex items-center gap-2">
              <Radar className="w-4 h-4 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Prévision de risque</h2>
              <Badge variant="outline" className="ml-auto rounded-full text-[10px] text-muted-foreground">
                modèle explicable · spatio-temporel
              </Badge>
            </div>

            {predSummary && predSummary.patterns > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="font-display text-2xl font-semibold text-foreground">{predSummary.patterns}</p>
                  <p className="text-xs text-muted-foreground">motifs détectés</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="font-display text-2xl font-semibold text-traffic-blocked">{predSummary.high_risk}</p>
                  <p className="text-xs text-muted-foreground">zones à risque élevé</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="font-display text-2xl font-semibold text-foreground">{predSummary.avg_score}</p>
                  <p className="text-xs text-muted-foreground">score moyen /100</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="font-display text-2xl font-semibold text-foreground">{predSummary.communes_covered}</p>
                  <p className="text-xs text-muted-foreground">communes couvertes</p>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
              {predictions.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">Pas encore assez d&apos;historique pour prévoir.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                        <th className="px-4 py-3 font-medium">Zone · Type</th>
                        <th className="px-4 py-3 font-medium">Score de risque</th>
                        <th className="px-4 py-3 font-medium">Créneau de pointe</th>
                        <th className="px-4 py-3 font-medium">Répartition horaire</th>
                        <th className="px-4 py-3 font-medium">Gravité</th>
                        <th className="px-4 py-3 font-medium">Tendance</th>
                        <th className="px-4 py-3 font-medium">Relevés</th>
                        <th className="px-4 py-3 font-medium">Fiabilité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predictions.map((p, i) => {
                        const meta = INCIDENT_TYPES[p.type];
                        const c = RISK_COLORS[p.risk_level] || RISK_COLORS.faible;
                        return (
                          <tr key={i} className="border-b border-border/60 last:border-0 align-middle">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-foreground flex items-center gap-1.5">
                                <span>{meta?.emoji || "⚠️"}</span> {p.commune}
                              </p>
                              <p className="text-xs text-muted-foreground">{meta?.label || p.type}</p>
                            </td>
                            <td className="px-4 py-3 min-w-[130px]">
                              <div className="flex items-center gap-2">
                                <span className={`font-display font-semibold ${c.text}`}>{p.risk_score}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${p.risk_score}%` }} />
                                </div>
                              </div>
                              <Badge variant="outline" className={`mt-1 rounded-full text-[10px] ${c.chip}`}>{p.risk_level}</Badge>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 text-foreground"><Clock className="w-3 h-3" />{p.peak_window}</span>
                              <p className="text-xs text-muted-foreground">{Math.round(p.peak_share * 100)}% des cas</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-end gap-0.5 h-8" title="Répartition sur la journée">
                                {(p.window_distribution || []).map((w) => (
                                  <div key={w.window} className="w-2.5 rounded-sm bg-primary/70" style={{ height: `${Math.max(6, w.share * 100)}%` }} title={`${w.window}: ${Math.round(w.share * 100)}%`} />
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground uppercase text-xs">{p.dominant_severity}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><TrendIcon trend={p.trend} />{p.trend}</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {p.occurrences}<span className="text-xs"> · {p.span_days}j</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{p.confidence}</td>
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
                Zones à risque, prévisions et scoring sont exposés via une <span className="font-medium text-foreground">API REST documentée</span> (OpenAPI/Swagger) : un assureur tarifie par exposition au risque routier plutôt qu&apos;au profil seul, un opérateur télécom/logistique optimise ses tournées. La app reste 100% gratuite pour les citoyens — ce sont ces accès B2B/B2G qui financent
                l&apos;infrastructure, pas un abonnement grand public. Données B2B agrégées et anonymisées.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
