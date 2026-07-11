import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, X, MapPin } from "lucide-react";
import { INCIDENT_TYPES } from "@/lib/mockData";
import { getIncidentIcon, trafficColorVar } from "@/lib/traffic";
import { distanceMeters } from "@/lib/geo";
import {
  PROXIMITY_RADIUS_M,
  ALERT_MAX_AGE_MS,
  isSelfReported,
  wasNotified,
  markNotified,
} from "@/lib/proximity";
import { toast } from "sonner";

const fmtDist = (m) => (m < 950 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`);

// Fire a best-effort OS/PWA notification. The in-app card is the real confirm
// surface; this just pokes the user when the tab isn't focused. Silent no-op if
// permission wasn't granted or the browser can't.
function osNotify(incident, meta, distM) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const title = `${meta.label} à ${fmtDist(distM)}`;
    const body = `${incident.road} · appuie pour confirmer l'alerte`;
    const opts = { body, tag: `rp-${incident.id}`, icon: "/icon-192.png", badge: "/icon-192.png" };
    if ("serviceWorker" in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => {});
    } else {
      // eslint-disable-next-line no-new
      new Notification(title, opts);
    }
  } catch {
    /* notifications are a bonus — never break the app */
  }
}

// Watches the incident feed against the user's live position and surfaces a
// confirm request for every freshly reported incident within PROXIMITY_RADIUS_M.
export default function ProximityAlerts({ position, incidents, confirmIncident, enabled = true }) {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    if (!enabled || !position || !incidents?.length) return;
    const now = Date.now();
    const fresh = [];
    for (const inc of incidents) {
      if (inc.confirmed_by_me || isSelfReported(inc.id) || wasNotified(inc.id)) continue;
      const age = now - new Date(inc.created_at).getTime();
      if (Number.isNaN(age) || age < 0 || age > ALERT_MAX_AGE_MS) continue;
      const dist = distanceMeters(position.lat, position.lng, inc.lat, inc.lng);
      if (dist > PROXIMITY_RADIUS_M) continue;
      markNotified(inc.id);
      const meta = INCIDENT_TYPES[inc.type] || { label: inc.type, icon: "AlertTriangle" };
      osNotify(inc, meta, dist);
      fresh.push({ ...inc, _dist: dist });
    }
    if (fresh.length) setQueue((prev) => [...fresh, ...prev].slice(0, 4));
  }, [incidents, position, enabled]);

  const dismiss = useCallback((id) => setQueue((prev) => prev.filter((a) => a.id !== id)), []);

  const confirm = useCallback(
    async (inc) => {
      try {
        await confirmIncident(inc.id);
        toast.success("Merci — alerte confirmée");
      } catch (err) {
        toast.error(err.message || "Confirmation impossible", { description: "Connecte-toi pour confirmer." });
      } finally {
        dismiss(inc.id);
      }
    },
    [confirmIncident, dismiss],
  );

  if (!queue.length) return null;

  return (
    <div className="fixed left-0 right-0 bottom-24 z-50 px-4 pointer-events-none">
      <div className="mx-auto max-w-2xl space-y-2">
        <AnimatePresence initial={false}>
          {queue.map((inc) => {
            const meta = INCIDENT_TYPES[inc.type] || { label: inc.type, icon: "AlertTriangle" };
            const Icon = getIncidentIcon(meta.icon);
            return (
              <motion.div
                key={inc.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.22 }}
                className="pointer-events-auto rounded-2xl bg-card border border-border shadow-elevated p-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: trafficColorVar(inc.severity, 0.15), color: trafficColorVar(inc.severity) }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">
                      {meta.label} · <span className="text-muted-foreground font-normal">{fmtDist(inc._dist)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" /> {inc.road} — signalé à proximité. Tu confirmes&nbsp;?
                    </p>
                  </div>
                  <button
                    onClick={() => dismiss(inc.id)}
                    aria-label="Ignorer"
                    className="flex-shrink-0 h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => confirm(inc)}
                    className="flex-1 h-9 rounded-xl bg-foreground text-background text-sm font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" /> Confirmer
                  </button>
                  <button
                    onClick={() => dismiss(inc.id)}
                    className="px-4 h-9 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted"
                  >
                    Ignorer
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
