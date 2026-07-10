import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Radio, Route as RouteIcon, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "routepulse_onboarded";

const STEPS = [
  {
    icon: Zap,
    title: "Signale en 1 tap",
    text: "Bouchon, accident, inondation, nid-de-poule… géolocalisé automatiquement, sans compte. En 3 secondes.",
  },
  {
    icon: Radio,
    title: "La route en direct",
    text: "La carte se met à jour en temps réel, fiabilisée par toute la communauté. Tu vois le danger avant de le subir.",
  },
  {
    icon: RouteIcon,
    title: "« Avant de partir »",
    text: "Scanne ton trajet : RoutePulse t'annonce ce qui bloque et te propose une déviation, avant même de démarrer.",
  },
];

export default function Onboarding() {
  // First-run only: once dismissed, never shown again on this device.
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(KEY);
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);

  if (!visible) return null;

  const finish = (primeLocation) => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode — just proceed */
    }
    // Prime the geolocation permission on the user's tap (best-effort).
    if (primeLocation && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5000 });
    }
    setVisible(false);
  };

  const isLast = step === STEPS.length - 1;
  const Icon = STEPS[step].icon;

  return (
    <div className="fixed inset-0 z-[60] bg-gradient-dark text-white flex flex-col">
      {/* Skip */}
      <div className="flex justify-end p-4">
        <button onClick={() => finish(false)} className="text-sm text-white/60 hover:text-white px-3 py-1.5">
          Passer
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28 }}
            className="flex flex-col items-center"
          >
            <div className="w-24 h-24 rounded-3xl bg-gradient-hero flex items-center justify-center shadow-glow">
              <Icon className="w-11 h-11 text-primary-foreground" strokeWidth={2} />
            </div>
            <h1 className="mt-8 font-display text-3xl font-semibold">{STEPS[step].title}</h1>
            <p className="mt-3 text-base text-white/70 max-w-sm leading-relaxed">{STEPS[step].text}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots + actions */}
      <div className="px-8 pb-10">
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-white/25"}`}
            />
          ))}
        </div>

        {isLast ? (
          <div className="space-y-3 max-w-sm mx-auto">
            <Button
              onClick={() => finish(true)}
              className="w-full h-14 rounded-2xl bg-gradient-hero text-primary-foreground shadow-glow text-base font-semibold"
            >
              <MapPin className="w-4 h-4 mr-2" /> Activer ma position & commencer
            </Button>
            <button onClick={() => finish(false)} className="w-full text-sm text-white/60 hover:text-white py-2">
              Plus tard
            </button>
          </div>
        ) : (
          <div className="max-w-sm mx-auto">
            <Button
              onClick={() => setStep((s) => s + 1)}
              className="w-full h-14 rounded-2xl bg-white text-foreground hover:bg-white/90 text-base font-semibold"
            >
              Suivant <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
