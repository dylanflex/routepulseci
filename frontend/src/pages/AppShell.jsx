import React, { Suspense, useMemo, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/routepulse/BottomNav";
import CopilotChat from "@/components/routepulse/CopilotChat";
import Onboarding from "@/components/routepulse/Onboarding";
import ConsentGate from "@/components/routepulse/ConsentGate";
import ProximityAlerts from "@/components/routepulse/ProximityAlerts";
import InstallPrompt from "@/components/routepulse/InstallPrompt";
import { useAppData } from "@/context/AppDataContext";
import { INCIDENT_TYPES } from "@/lib/mockData";
import { formatRelativeTime } from "@/lib/time";
import { distanceMeters } from "@/lib/geo";
import { useWatchPosition } from "@/lib/useWatchPosition";
import { PROXIMITY_RADIUS_M } from "@/lib/proximity";
import { Activity, Bell, ChevronLeft, Search, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

// An incident younger than this drives the unread dot on the bell.
const RECENT_MS = 15 * 60 * 1000;

const typeLabel = (type) => INCIDENT_TYPES[type]?.label || type;

export default function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { incidents, posts, confirmIncident } = useAppData();
  const { user } = useAuth();
  const isDetail = pathname.includes("/feed/") || pathname.includes("/parametres");
  const backTo = pathname.includes("/parametres") ? "/app/profil" : "/app/feed";

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Logged-out users have no setting to read yet -- default to on, same as
  // the server-side column default for a fresh account.
  const notificationsEnabled = user ? user.notify_nearby_incidents : true;

  // One geolocation watcher for the whole app, gated on the notifications
  // setting. Everything proximity-related (the bell, the confirm cards) reads
  // from this single position fix.
  const position = useWatchPosition(notificationsEnabled);

  // "Notifications" now means "what's within PROXIMITY_RADIUS_M of me", not a
  // firehose of every recent report across Abidjan — nearest first.
  const nearby = useMemo(() => {
    if (!position) return [];
    return incidents
      .map((i) => ({ ...i, _dist: distanceMeters(position.lat, position.lng, i.lat, i.lng) }))
      .filter((i) => i._dist <= PROXIMITY_RADIUS_M)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 8);
  }, [incidents, position]);

  const hasUnread = useMemo(
    () => notificationsEnabled && nearby.some((i) => Date.now() - new Date(i.created_at).getTime() < RECENT_MS),
    [nearby, notificationsEnabled],
  );

  const fmtDist = (m) => (m < 950 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { incidents: [], posts: [] };
    return {
      incidents: incidents
        .filter((i) => `${i.road} ${typeLabel(i.type)}`.toLowerCase().includes(q))
        .slice(0, 5),
      posts: posts
        .filter((p) => `${p.location} ${p.text}`.toLowerCase().includes(q))
        .slice(0, 5),
    };
  }, [query, incidents, posts]);

  const openSearch = () => {
    setQuery("");
    setSearchOpen(true);
  };

  const go = (path) => {
    setSearchOpen(false);
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* First-run mobile onboarding, then a mandatory data-collection consent
          gate (both self-gate on localStorage; consent sits just under the
          onboarding overlay so it appears once the intro is dismissed). */}
      <Onboarding />
      <ConsentGate />

      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-lg border-b border-border">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          {isDetail ? (
            <Link to={backTo} className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <ChevronLeft className="w-5 h-5" /> Retour
            </Link>
          ) : (
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-hero flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
              </div>
              <span className="font-display font-semibold text-foreground">RoutePulse <span className="text-primary">CI</span></span>
            </Link>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={openSearch}
              className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center"
              aria-label="Rechercher"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
            </button>

            <Popover>
              <PopoverTrigger asChild>
                <button className="relative h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center" aria-label="Notifications">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  {hasUnread && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="font-semibold text-sm">Alertes à proximité</p>
                  <p className="text-xs text-muted-foreground">Dans un rayon d’1 km autour de toi</p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {!notificationsEnabled ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                      Alertes de proximité désactivées. Active-les dans les paramètres.
                    </p>
                  ) : !position ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                      Active ta localisation pour recevoir les alertes près de toi.
                    </p>
                  ) : nearby.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground text-center">Rien à signaler près de toi.</p>
                  ) : (
                    nearby.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => navigate("/app/carte")}
                        className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border/60 last:border-0"
                      >
                        <p className="text-sm font-medium truncate flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          {typeLabel(i.type)} · {i.road}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          à {fmtDist(i._dist)} · {formatRelativeTime(i.created_at)} · {i.confirmed} confirm.
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl pb-28">
        {/* Its own boundary so switching tabs (Carte/Fil/Trajet/...) only
            blanks the page content while its chunk loads, not the header/nav
            above and below — those stay mounted. */}
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>

      <BottomNav />

      {/* Conversational AI copilot — floating, available across the app shell */}
      <CopilotChat />

      {/* Proximity confirm-requests: a fresh report within 1 km asks the user
          to confirm it. Single shared position fix from useWatchPosition. */}
      <ProximityAlerts
        position={position}
        incidents={incidents}
        confirmIncident={confirmIncident}
        enabled={notificationsEnabled}
      />

      {/* PWA install invitation (Android/Chrome native prompt, iOS manual steps) */}
      <InstallPrompt />

      {/* Search */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Rechercher</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Une rue, un quartier, un mot-clé…"
            className="rounded-xl"
          />
          <div className="mt-2 max-h-72 overflow-y-auto space-y-4">
            {query.trim() && results.incidents.length === 0 && results.posts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun résultat.</p>
            )}
            {results.incidents.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sur la carte</p>
                {results.incidents.map((i) => (
                  <button key={i.id} onClick={() => go("/app/carte")} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted">
                    <span className="text-sm font-medium">{typeLabel(i.type)} · {i.road}</span>
                  </button>
                ))}
              </div>
            )}
            {results.posts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Dans le fil</p>
                {results.posts.map((p) => (
                  <button key={p.id} onClick={() => go(`/app/feed/${p.id}`)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted">
                    <span className="text-sm font-medium truncate block">{p.location}</span>
                    <span className="text-xs text-muted-foreground truncate block">{p.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
