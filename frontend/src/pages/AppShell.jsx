import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { BottomNav } from "@/components/routepulse/BottomNav";
import { Activity, Bell, ChevronLeft, Search } from "lucide-react";

export default function AppShell() {
  const { pathname } = useLocation();
  const isDetail = pathname.includes("/feed/");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-lg border-b border-border">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          {isDetail ? (
            <Link to="/app/feed" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
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
            <button className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center" aria-label="Rechercher">
              <Search className="w-4 h-4 text-muted-foreground" />
            </button>
            <button className="relative h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center" aria-label="Notifications">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl pb-28">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
