import React, { useState } from "react";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Share2, Flag, ShieldCheck, MapPin, MoreHorizontal, Bookmark } from "lucide-react";
import { INCIDENT_TYPES, TRAFFIC_LEVELS } from "@/lib/mockData";
import { trafficColorVar } from "@/lib/traffic";
import { formatRelativeTime } from "@/lib/time";
import { useAppData } from "@/context/AppDataContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export const AlertPost = ({ post, compact = false }) => {
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();
  const { likePost, confirmPost, reportPost } = useAppData();
  // Server is the source of truth for the current user's vote state (§3.3),
  // so the same post stays consistent across the feed, detail and profile.
  const liked = post.liked_by_me;
  const confirmedByMe = post.confirmed_by_me;
  const meta = INCIDENT_TYPES[post.type] || { label: post.type, icon: "AlertTriangle", emoji: "⚠️" };
  const severity = TRAFFIC_LEVELS[post.severity] || { label: post.severity, hex: "#94a3b8" };

  const handleLike = async () => {
    try {
      await likePost(post.id);
    } catch (err) {
      toast.error(err.message || "Action impossible", { description: "Connecte-toi pour réagir." });
    }
  };

  const handleShare = async () => {
    const link = `${window.location.origin}/app/feed/${post.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Lien copié dans le presse-papier", { description: "Partage avec ta communauté 🙌" });
    } catch {
      toast.error("Impossible de copier le lien", { description: link });
    }
  };

  const handleReport = async () => {
    try {
      await reportPost(post.id);
      toast("Signalement envoyé", { description: "Un modérateur va vérifier ce contenu." });
    } catch (err) {
      toast.error(err.message || "Signalement impossible", { description: "Connecte-toi pour signaler." });
    }
  };

  const handleConfirm = async () => {
    try {
      await confirmPost(post.id);
      if (!confirmedByMe) {
        toast.success("Alerte confirmée ✅", { description: "Merci, tu aides à fiabiliser l'info." });
      }
    } catch (err) {
      toast.error(err.message || "Confirmation impossible", { description: "Connecte-toi pour confirmer." });
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col bg-card border border-border rounded-2xl overflow-hidden hover:shadow-elevated transition-shadow duration-300"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <Avatar className="h-11 w-11 ring-2 ring-primary/10">
          <AvatarFallback className="bg-gradient-hero text-primary-foreground font-semibold text-sm">
            {post.author.avatar}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-foreground truncate">{post.author.name}</span>
            {post.author.verified && (
              <ShieldCheck className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            )}
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium border-primary/20 text-primary bg-primary/5">
              {post.author.badge}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{post.location}</span>
            <span>·</span>
            <span>{formatRelativeTime(post.created_at)}</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-full hover:bg-muted transition-colors" aria-label="Plus">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-2" /> Copier le lien
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleReport} className="text-destructive focus:text-destructive">
              <Flag className="w-4 h-4 mr-2" /> Signaler
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Type banner */}
      <div className="flex items-center gap-2 px-4 pb-2">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: trafficColorVar(post.severity, 0.12), color: trafficColorVar(post.severity) }}
        >
          <span className="text-sm leading-none">{meta.emoji}</span>
          <span>{meta.label}</span>
          <span className="opacity-70">· {severity.label}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
            <ShieldCheck className="w-3 h-3" />
            {post.confirmed} confirm.
          </span>
        </div>
      </div>

      {/* Text */}
      <p className="px-4 text-[15px] leading-relaxed text-foreground">{post.text}</p>

      {/* Image */}
      {post.image && !compact && (
        <div className="mt-3 mx-4 rounded-xl overflow-hidden border border-border">
          <img src={post.image} alt="Alerte" className="w-full h-56 object-cover" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 mt-auto p-2 pt-3 border-t border-border/60 mx-2">
        <Button variant="ghost" size="sm" onClick={handleLike} className={`flex-1 gap-1.5 rounded-xl ${liked ? "text-primary" : "text-muted-foreground"}`}>
          <Heart className={`w-4 h-4 ${liked ? "fill-primary" : ""}`} />
          <span className="text-xs font-medium">{post.likes}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/app/feed/${post.id}`)} className="flex-1 gap-1.5 rounded-xl text-muted-foreground">
          <MessageCircle className="w-4 h-4" />
          <span className="text-xs font-medium">{post.comments}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleShare} className="flex-1 gap-1.5 rounded-xl text-muted-foreground">
          <Share2 className="w-4 h-4" />
          <span className="text-xs font-medium">{post.shares}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleConfirm} className={`flex-1 gap-1.5 rounded-xl hover:text-accent hover:bg-accent/10 ${confirmedByMe ? "text-accent" : "text-muted-foreground"}`}>
          <ShieldCheck className={`w-4 h-4 ${confirmedByMe ? "fill-accent/20" : ""}`} />
          <span className="text-xs font-medium hidden sm:inline">{confirmedByMe ? "Confirmé" : "Confirmer"}</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setSaved(!saved)} className="h-9 w-9 rounded-xl text-muted-foreground">
          <Bookmark className={`w-4 h-4 ${saved ? "fill-primary text-primary" : ""}`} />
        </Button>
      </div>
    </motion.article>
  );
};

export default AlertPost;
