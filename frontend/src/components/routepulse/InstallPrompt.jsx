import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "routepulse_install_dismissed";

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;

// Invites the user to install the PWA. On Android/Chrome it captures the native
// `beforeinstallprompt` and triggers it on tap; on iOS Safari (which has no such
// event) it shows the manual "Partager → Sur l'écran d'accueil" steps. Hidden if
// already installed or previously dismissed.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return undefined;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return undefined;
    } catch {
      /* ignore */
    }

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires beforeinstallprompt — show the manual banner after a beat.
    let iosTimer;
    if (isIOS()) {
      iosTimer = setTimeout(() => setVisible(true), 2500);
    }

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const close = () => {
    setVisible(false);
    setShowIosHelp(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice.catch(() => ({ outcome: "dismissed" }));
      setDeferred(null);
      setVisible(false);
      if (outcome !== "accepted") {
        try {
          localStorage.setItem(DISMISS_KEY, "1");
        } catch {
          /* ignore */
        }
      }
    } else if (isIOS()) {
      setShowIosHelp((v) => !v);
    }
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.25 }}
        className="fixed left-0 right-0 bottom-24 z-40 px-4 pointer-events-none"
      >
        <div className="mx-auto max-w-2xl pointer-events-auto rounded-2xl bg-foreground text-background shadow-elevated p-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-background/15 flex items-center justify-center flex-shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Installer RoutePulse</p>
              <p className="text-xs text-background/70">Accès direct, plein écran, même hors-ligne.</p>
            </div>
            <Button
              onClick={install}
              className="h-9 rounded-xl bg-background text-foreground hover:bg-background/90 text-sm font-semibold px-4"
            >
              Installer
            </Button>
            <button
              onClick={close}
              aria-label="Fermer"
              className="flex-shrink-0 h-7 w-7 rounded-lg hover:bg-background/15 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {showIosHelp && (
            <div className="mt-3 pt-3 border-t border-background/15 text-xs text-background/80 space-y-1.5">
              <p className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  1. Appuie sur <Share className="w-3.5 h-3.5" /> (Partager)
                </span>
              </p>
              <p className="flex items-center gap-2">
                2. Choisis <Plus className="w-3.5 h-3.5" /> « Sur l'écran d'accueil »
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
