import React from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Flag, Undo2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/time";
import { toast } from "sonner";

export default function Moderation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: queue, isLoading } = useQuery({
    queryKey: ["moderation-queue"],
    queryFn: api.moderationQueue,
    enabled: !!user?.is_admin,
  });

  if (!user) {
    return (
      <div className="px-4 pt-16 flex flex-col items-center text-center">
        <Lock className="w-10 h-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Connecte-toi</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs">
          Cette page est réservée à l&apos;équipe de modération.
        </p>
        <Link to="/login" state={{ from: "/app/moderation" }} className="mt-6">
          <Button className="rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">Se connecter</Button>
        </Link>
      </div>
    );
  }

  if (!user.is_admin) {
    return (
      <div className="px-4 pt-16 flex flex-col items-center text-center">
        <Lock className="w-10 h-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Accès réservé</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs">
          Cette page est réservée à l&apos;équipe de modération.
        </p>
      </div>
    );
  }

  const handleUnhide = async (postId) => {
    try {
      await api.unhidePost(postId);
      toast.success("Signalement restauré", { description: "Il réapparaît dans le fil." });
      queryClient.invalidateQueries({ queryKey: ["moderation-queue"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    } catch (err) {
      toast.error(err.message || "Action impossible");
    }
  };

  return (
    <div className="px-4 pt-4 pb-20">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-hero flex items-center justify-center shadow-glow">
          <ShieldAlert className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold">Modération</h1>
          <p className="text-xs text-muted-foreground">Contenus signalés par la communauté</p>
        </div>
      </div>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground text-center">Chargement…</p>}

      {queue && queue.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground text-center">Aucun signalement pour l&apos;instant.</p>
      )}

      <div className="mt-4 space-y-3">
        {queue?.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">{entry.author.avatar}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-foreground">{entry.author.name}</span>
                  <span className="text-xs text-muted-foreground">· {formatRelativeTime(entry.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-foreground">{entry.text}</p>
              </div>
              {entry.hidden ? (
                <Badge variant="outline" className="rounded-full text-[10px] border-destructive/40 text-destructive bg-destructive/5">
                  Masqué
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full text-[10px] border-warning/40 text-warning bg-warning/5">
                  Signalé
                </Badge>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Flag className="w-3.5 h-3.5" /> {entry.report_count} signalement{entry.report_count > 1 ? "s" : ""}
              </span>
              {entry.hidden && (
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => handleUnhide(entry.id)}>
                  <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Restaurer
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
