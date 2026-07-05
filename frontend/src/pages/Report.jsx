import React, { useRef, useState } from "react";
import { INCIDENT_TYPES, TRAFFIC_LEVELS } from "@/lib/mockData";
import { getIncidentIcon, trafficColorVar } from "@/lib/traffic";
import { Camera, MapPin, Zap, Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";

export default function Report() {
  const [step, setStep] = useState(1);
  const [type, setType] = useState(null);
  const [severity, setSeverity] = useState("dense");
  const [note, setNote] = useState("");
  const [postToFeed, setPostToFeed] = useState(true);
  const [image, setImage] = useState(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const { submitReport } = useAppData();
  const { user } = useAuth();
  const canPostToFeed = postToFeed && !!user;

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Format non supporté", { description: "Choisis une image." });
      return;
    }
    // ~2.5 MB cap keeps the data URL small enough for the JSON payload.
    if (file.size > 2.5 * 1024 * 1024) {
      toast.error("Image trop lourde", { description: "Choisis une photo de moins de 2,5 Mo." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setSending(true);
    try {
      // Only feed posts carry an image (incidents have no image field).
      await submitReport({ type, severity, note, postToFeed: canPostToFeed, image: canPostToFeed ? image : null });
      setSent(true);
      toast.success("Alerte envoyée ⚡", { description: "Merci, ta ville te remercie !" });
      setTimeout(() => navigate(canPostToFeed ? "/app/feed" : "/app/carte"), 1600);
    } catch (err) {
      toast.error(err.message || "Envoi impossible, réessaie.");
      setSending(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-20">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-hero flex items-center justify-center shadow-glow">
          <Zap className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold">Signaler un incident</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="w-3 h-3 text-primary" /> Position GPS active
          </p>
        </div>
      </div>

      {/* Progress dots */}
      <div className="mt-4 flex items-center gap-1.5">
        {[1,2,3].map((s) => (
          <div key={s} className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-primary flex-1" : "bg-muted flex-1 opacity-60"}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-16 flex flex-col items-center text-center"
          >
            <div className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center">
              <Check className="w-10 h-10 text-accent" strokeWidth={3} />
            </div>
            <h2 className="mt-5 font-display text-2xl font-semibold">Alerte envoyée !</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Ta contribution est visible sur la carte et dans le fil. +15 pts 🔥
            </p>
          </motion.div>
        ) : step === 1 ? (
          <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <p className="mt-6 text-sm font-medium text-foreground">1. Que se passe-t-il ?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(INCIDENT_TYPES).map(([key, meta]) => {
                const Icon = getIncidentIcon(meta.icon);
                const active = type === key;
                return (
                  <button
                    key={key}
                    onClick={() => setType(key)}
                    className={`p-4 rounded-2xl border text-left transition-all flex flex-col gap-2 ${
                      active ? "border-primary bg-primary/5 shadow-glow" : "border-border bg-card hover:border-foreground/30"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{meta.label}</p>
                      <p className="text-[11px] text-muted-foreground">{meta.emoji}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <Button disabled={!type} onClick={() => setStep(2)} className="mt-6 w-full h-12 rounded-xl bg-foreground text-background disabled:opacity-40">
              Continuer
            </Button>
          </motion.div>
        ) : step === 2 ? (
          <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <p className="mt-6 text-sm font-medium">2. Quel est le niveau ?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(TRAFFIC_LEVELS).map(([key, val]) => {
                const active = severity === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSeverity(key)}
                    className={`p-4 rounded-2xl border text-left transition-all ${active ? "border-foreground" : "border-border"}`}
                    style={active ? { borderColor: trafficColorVar(key), background: trafficColorVar(key, 0.06) } : {}}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: val.hex }} />
                      <span className="font-semibold text-sm">{val.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {key === "fluid" && "Léger, ça passe"}
                      {key === "dense" && "Ralentissements"}
                      {key === "blocked" && "Ça n’avance plus"}
                      {key === "danger" && "Risque important"}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-12 rounded-xl">Retour</Button>
              <Button onClick={() => setStep(3)} className="flex-1 h-12 rounded-xl bg-foreground text-background">Continuer</Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="s3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
            <p className="mt-6 text-sm font-medium">3. Ajoute une note (optionnel)</p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Décris la situation en quelques mots..."
              className="mt-2 min-h-[110px] rounded-2xl border-border bg-card resize-none"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhoto}
            />
            {image ? (
              <div className="mt-3 relative rounded-2xl overflow-hidden border border-border">
                <img src={image} alt="Aperçu" className="w-full h-40 object-cover" />
                <button
                  type="button"
                  onClick={() => { setImage(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center text-foreground hover:bg-background"
                  aria-label="Retirer la photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 w-full p-4 rounded-2xl border border-dashed border-border bg-card flex items-center gap-3 text-left hover:border-primary transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Ajouter une photo</p>
                  <p className="text-[11px] text-muted-foreground">
                    {canPostToFeed ? "Aide la commu à confirmer plus vite" : "Connecte-toi et publie dans le fil pour joindre une photo"}
                  </p>
                </div>
              </button>
            )}

            <div className="mt-4 flex items-center justify-between p-4 rounded-2xl bg-card border border-border">
              <div>
                <p className="font-semibold text-sm flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary" /> Publier dans le fil</p>
                <p className="text-[11px] text-muted-foreground">
                  {user ? "Ta commu pourra réagir et confirmer" : (
                    <>
                      <Link to="/login" state={{ from: "/app/signaler" }} className="text-primary font-medium">Connecte-toi</Link> pour publier dans le fil
                    </>
                  )}
                </p>
              </div>
              <Switch checked={canPostToFeed} disabled={!user} onCheckedChange={setPostToFeed} />
            </div>

            <div className="mt-6 flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={sending} className="flex-1 h-12 rounded-xl">Retour</Button>
              <Button onClick={submit} disabled={sending} className="flex-1 h-12 rounded-xl bg-gradient-hero text-primary-foreground shadow-glow disabled:opacity-60">
                {sending ? "Envoi…" : "Envoyer l’alerte ⚡"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
