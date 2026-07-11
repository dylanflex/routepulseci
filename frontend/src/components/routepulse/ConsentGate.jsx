import React, { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, MapPin, Users, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Bumped if the terms materially change — a new version re-prompts everyone.
const KEY = "routepulse_consent";
const VERSION = "1";

const POINTS = [
  {
    icon: MapPin,
    text: "Ta position, pour t'alerter des incidents proches de toi et placer tes signalements au bon endroit.",
  },
  {
    icon: Users,
    text: "Tes signalements et confirmations, partagés de façon anonyme pour fiabiliser la carte pour tout le monde.",
  },
  {
    icon: Lock,
    text: "Jamais de revente de tes données individuelles, jamais de suivi en arrière-plan.",
  },
];

export default function ConsentGate() {
  // Mandatory, first-run (or after a terms version bump). Self-gates on
  // localStorage, sits just under the onboarding overlay so it appears once the
  // intro is dismissed.
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== VERSION;
    } catch {
      return false;
    }
  });
  const [checked, setChecked] = useState(false);

  if (!visible) return null;

  const accept = () => {
    if (!checked) return;
    try {
      localStorage.setItem(KEY, VERSION);
    } catch {
      /* private mode — just proceed */
    }
    // Best-effort: ask for notification permission now (a real user gesture) so
    // proximity alerts can reach the user even when the tab isn't focused.
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      /* unsupported — in-app confirm cards still work */
    }
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[55] bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-3xl border border-border shadow-elevated max-h-[92vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
            Tes données, en toute transparence
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            RoutePulse s'améliore grâce à la communauté. Avant de continuer, voici
            ce qu'on collecte — et ce qu'on ne fera jamais.
          </p>

          <div className="mt-5 space-y-3">
            {POINTS.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-foreground/70" />
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          <label className="mt-5 flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-border accent-[hsl(var(--accent))] flex-shrink-0"
            />
            <span className="text-sm text-foreground/85 leading-relaxed">
              J'ai lu et j'accepte les <span className="font-medium text-foreground">conditions d'utilisation</span> et
              cette collecte de données.
            </span>
          </label>

          <Button
            onClick={accept}
            disabled={!checked}
            className="mt-5 w-full h-12 rounded-2xl bg-foreground text-background disabled:opacity-40"
          >
            Accepter et continuer <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="mt-2 w-full text-sm text-muted-foreground hover:text-foreground py-2"
          >
            Refuser et quitter
          </button>
        </div>
      </motion.div>
    </div>
  );
}
