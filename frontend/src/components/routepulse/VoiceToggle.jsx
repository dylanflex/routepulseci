import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isVoiceSupported, isVoiceEnabled, setVoiceEnabled } from "@/lib/voice";

// Mute/unmute control for the "avant de partir" voice announcements.
// Renders nothing on browsers without SpeechSynthesis (nothing to toggle).
// A presenter needs to be able to kill the voice mid-demo, so this must be
// a visible, always-reachable control next to the recommendation it reads.
export function VoiceToggle({ className = "" }) {
  const [enabled, setEnabled] = useState(isVoiceEnabled);

  if (!isVoiceSupported()) return null;

  const toggle = () => {
    const next = !enabled;
    setVoiceEnabled(next);
    setEnabled(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Couper les annonces vocales" : "Activer les annonces vocales"}
      title={enabled ? "Couper les annonces vocales" : "Activer les annonces vocales"}
      className={`flex-shrink-0 p-1 rounded-full hover:bg-background/60 text-muted-foreground ${className}`}
    >
      {enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
    </button>
  );
}

export default VoiceToggle;
