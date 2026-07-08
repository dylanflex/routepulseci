import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatChip } from "@/components/routepulse/StatChip";
import { MapPin, Bell, Settings, Shield, ChevronRight, ShieldCheck, LogOut, Trophy, Sparkles } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { formatMonthYear } from "@/lib/time";
import { AlertPost } from "@/components/routepulse/AlertPost";

export default function Profile() {
  const { posts, leaderboard } = useAppData();
  const { user, logout } = useAuth();

  // Earned tier / points / distance to the next tier — the "level up" data.
  const { data: myStats } = useQuery({
    queryKey: ["me-stats", user?.username],
    queryFn: api.myStats,
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="px-4 pt-16 flex flex-col items-center text-center">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="bg-muted text-muted-foreground">?</AvatarFallback>
        </Avatar>
        <h1 className="mt-4 font-display text-xl font-semibold">Pas encore connecté</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs">
          Crée un profil pour accéder à tes signalements, tes confirmations et ton fil social.
        </p>
        <div className="mt-6 flex gap-2">
          <Link to="/login" state={{ from: "/app/profil" }}>
            <Button variant="outline" className="rounded-xl">Se connecter</Button>
          </Link>
          <Link to="/register">
            <Button className="rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">Créer un profil</Button>
          </Link>
        </div>
      </div>
    );
  }

  const myPosts = posts.filter((p) => p.author.handle === `@${user.username}`);
  const confirmationsReceived = myPosts.reduce((sum, p) => sum + p.confirmed, 0);

  return (
    <div className="pt-4 pb-20">
      <div className="px-4">
        {/* Header card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-dark text-white p-5 shadow-elevated">
          <div className="absolute -top-16 -right-10 w-48 h-48 bg-primary/40 rounded-full blur-3xl" />
          <div className="relative flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-white/20">
              <AvatarFallback className="bg-gradient-hero text-primary-foreground font-semibold text-xl">{user.avatar}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="font-display text-xl font-semibold">{user.display_name}</h1>
              <p className="text-xs text-white/70 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> @{user.username} · Membre depuis {formatMonthYear(user.created_at)}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="text-white/70 hover:text-white hover:bg-white/10" aria-label="Se déconnecter">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

          <div className="relative mt-4 flex gap-2 text-sm">
            <div className="flex-1 text-center">
              <p className="font-display text-xl font-semibold">{myPosts.length}</p>
              <p className="text-[11px] text-white/60">signalements</p>
            </div>
            <div className="flex-1 text-center border-x border-white/10">
              <p className="font-display text-xl font-semibold">{confirmationsReceived}</p>
              <p className="text-[11px] text-white/60">confirmations reçues</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contribution tier + progress to the next level */}
      {myStats && (
        <div className="px-4 mt-4">
          <div className="rounded-2xl bg-card border border-border p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-hero text-primary-foreground flex items-center justify-center shadow-glow">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-sm flex items-center gap-1.5">
                  {myStats.tier}
                  {myStats.verified && <ShieldCheck className="w-3.5 h-3.5 text-primary" />}
                </p>
                <p className="text-xs text-muted-foreground">{myStats.points} points de contribution</p>
              </div>
            </div>
            {myStats.next_tier ? (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-hero transition-all"
                    style={{ width: `${Math.min(100, Math.round((myStats.points / myStats.next_tier.at) * 100))}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Encore <span className="font-semibold text-foreground">{myStats.next_tier.points_needed} pts</span> pour devenir <span className="font-semibold text-foreground">{myStats.next_tier.label}</span>
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-accent font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Niveau maximum atteint — merci pour tes signalements !
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="px-4 mt-4 grid grid-cols-2 gap-2">
        <StatChip label="Signalements" value={myStats?.posts ?? myPosts.length} icon={ShieldCheck} tone="primary" />
        <StatChip label="Confirmations" value={myStats?.confirmations ?? confirmationsReceived} icon={ShieldCheck} tone="accent" />
      </div>

      {/* Community leaderboard */}
      {leaderboard.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Classement de la communauté
          </h2>
          <div className="mt-3 rounded-2xl bg-card border border-border overflow-hidden">
            {leaderboard.map((entry) => {
              const isMe = entry.handle === `@${user.username}`;
              const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
              return (
                <div
                  key={entry.handle}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 ${isMe ? "bg-primary/5" : ""}`}
                >
                  <div className="w-6 text-center font-display font-semibold text-sm text-muted-foreground">
                    {medal || entry.rank}
                  </div>
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">{entry.avatar || entry.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                      {entry.name}
                      {isMe && <span className="text-[10px] font-medium text-primary">toi</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{entry.tier}</p>
                  </div>
                  <span className="text-sm font-display font-semibold text-foreground">{entry.points}<span className="text-[10px] text-muted-foreground font-medium ml-0.5">pts</span></span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings list */}
      <div className="px-4 mt-6">
        <h2 className="font-display text-lg font-semibold">Paramètres</h2>
        <div className="mt-3 rounded-2xl bg-card border border-border overflow-hidden">
          {[
            { icon: Bell, label: "Notifications", hint: "Alertes autour de toi" },
            { icon: MapPin, label: "Zones favorites", hint: "Tes lieux fréquents" },
            { icon: Shield, label: "Confidentialité", hint: "Anonymat sur tes contributions" },
            { icon: Settings, label: "Préférences", hint: "Voix, langue, unités" },
          ].map((item, idx) => (
            <Link
              key={idx}
              to="/app/parametres"
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 border-b border-border last:border-b-0 text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                <item.icon className="w-4 h-4 text-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>

      {/* Recent posts */}
      {myPosts.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="font-display text-lg font-semibold">Tes derniers signalements</h2>
          <div className="mt-3 space-y-3">
            {myPosts.slice(0, 3).map((p) => (
              <AlertPost key={p.id} post={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
