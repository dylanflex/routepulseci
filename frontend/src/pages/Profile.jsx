import React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatChip } from "@/components/routepulse/StatChip";
import { Flame, Award, MapPin, Bell, Settings, Shield, ChevronRight, Zap, ShieldCheck, Heart } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { AlertPost } from "@/components/routepulse/AlertPost";

export default function Profile() {
  const { posts } = useAppData();
  return (
    <div className="pt-4 pb-20">
      <div className="px-4">
        {/* Header card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-dark text-white p-5 shadow-elevated">
          <div className="absolute -top-16 -right-10 w-48 h-48 bg-primary/40 rounded-full blur-3xl" />
          <div className="relative flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-white/20">
              <AvatarFallback className="bg-gradient-hero text-primary-foreground font-semibold text-xl">AK</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="font-display text-xl font-semibold">Aya Kouassi</h1>
              <p className="text-xs text-white/70 flex items-center gap-1"><MapPin className="w-3 h-3" /> Cocody · Membre depuis Mars 2025</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge className="bg-primary/25 text-primary-foreground border-0 hover:bg-primary/30">
                  <Flame className="w-3 h-3 mr-1" /> Contributeur Or
                </Badge>
                <Badge className="bg-white/10 text-white border-0 hover:bg-white/15">
                  <Shield className="w-3 h-3 mr-1" /> Voisin vigilant
                </Badge>
              </div>
            </div>
          </div>

          <div className="relative mt-4 flex gap-2 text-sm">
            <div className="flex-1 text-center">
              <p className="font-display text-xl font-semibold">348</p>
              <p className="text-[11px] text-white/60">signalements</p>
            </div>
            <div className="flex-1 text-center border-x border-white/10">
              <p className="font-display text-xl font-semibold">2 190</p>
              <p className="text-[11px] text-white/60">confirmés</p>
            </div>
            <div className="flex-1 text-center">
              <p className="font-display text-xl font-semibold">Rang #47</p>
              <p className="text-[11px] text-white/60">Abidjan</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 mt-4 grid grid-cols-2 gap-2">
        <StatChip label="Points" value="5 240" icon={Zap} tone="primary" hint="+120 cette semaine" />
        <StatChip label="Impact" value="3h27" icon={Heart} tone="accent" hint="temps sauvé" />
        <StatChip label="Fiabilité" value="96%" icon={ShieldCheck} tone="accent" hint="confirmations" />
        <StatChip label="Badges" value="12" icon={Award} tone="primary" hint="3 en attente" />
      </div>

      {/* Achievements */}
      <div className="px-4 mt-6">
        <h2 className="font-display text-lg font-semibold">Tes badges</h2>
        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-thin -mx-4 px-4 pb-2">
          {[
            { name: "1er signalement", emoji: "🎉", earned: true },
            { name: "10 confirmations", emoji: "✅", earned: true },
            { name: "Photographe", emoji: "📸", earned: true },
            { name: "Nuit blanche", emoji: "🌙", earned: true },
            { name: "Ambassadeur", emoji: "🚀", earned: false },
            { name: "Top 10 Abj", emoji: "🏆", earned: false },
          ].map((b) => (
            <div key={b.name} className={`flex-shrink-0 w-24 p-3 rounded-2xl border text-center ${b.earned ? "bg-card border-border" : "bg-muted/50 border-transparent opacity-50"}`}>
              <div className="text-3xl">{b.emoji}</div>
              <p className="mt-1 text-[11px] font-medium text-foreground">{b.name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Settings list */}
      <div className="px-4 mt-6">
        <h2 className="font-display text-lg font-semibold">Paramètres</h2>
        <div className="mt-3 rounded-2xl bg-card border border-border overflow-hidden">
          {[
            { icon: Bell, label: "Notifications", hint: "Alertes autour de toi" },
            { icon: MapPin, label: "Zones favorites", hint: "3 zones" },
            { icon: Shield, label: "Confidentialité", hint: "Anonymat par défaut" },
            { icon: Settings, label: "Préférences", hint: "Thème, langue, unités" },
          ].map((item, idx) => (
            <button key={idx} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 border-b border-border last:border-b-0 text-left">
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                <item.icon className="w-4 h-4 text-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      {/* Recent posts */}
      <div className="px-4 mt-6">
        <h2 className="font-display text-lg font-semibold">Tes derniers signalements</h2>
        <div className="mt-3 space-y-3">
          <AlertPost post={posts[0]} />
        </div>
      </div>
    </div>
  );
}
