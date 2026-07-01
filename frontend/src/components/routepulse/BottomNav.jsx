import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Map, Newspaper, Plus, Route, User } from "lucide-react";

const items = [
  { to: "/app/carte", icon: Map, label: "Carte" },
  { to: "/app/feed", icon: Newspaper, label: "Fil" },
  { to: "/app/signaler", icon: Plus, label: "Signaler", primary: true },
  { to: "/app/trajet", icon: Route, label: "Trajet" },
  { to: "/app/profil", icon: User, label: "Profil" },
];

export const BottomNav = () => {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-2xl px-3 pb-3">
        <div className="glass rounded-2xl shadow-elevated px-2 py-1.5 flex items-center justify-between">
          {items.map(({ to, icon: Icon, label, primary }) => {
            const active = pathname === to || (to === "/app/carte" && pathname === "/app");
            if (primary) {
              return (
                <NavLink key={to} to={to} className="relative -mt-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-hero shadow-glow flex items-center justify-center ring-4 ring-background">
                    <Icon className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
                  </div>
                </NavLink>
              );
            }
            return (
              <NavLink
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl min-w-[56px] ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
