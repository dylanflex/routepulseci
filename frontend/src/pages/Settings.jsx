import React, { useEffect, useState } from "react";
import { Bell, MapPin, Shield, Settings as SettingsIcon, Volume2, Trash2, Plus, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { PlaceField } from "@/components/routepulse/PlaceField";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { isVoiceEnabled, setVoiceEnabled, isVoiceSupported } from "@/lib/voice";
import { toast } from "sonner";

function SettingsSection({ icon: Icon, title, hint, children }) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
          <Icon className="w-4 h-4 text-foreground" />
        </div>
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-card border border-border p-4">{children}</div>
    </div>
  );
}

function SettingsRow({ label, description, checked, onCheckedChange, disabled }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export default function Settings() {
  const { user, updateSettings } = useAuth();
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zoneQuery, setZoneQuery] = useState("");
  const [addingZone, setAddingZone] = useState(false);
  const [voiceOn, setVoiceOn] = useState(isVoiceEnabled());

  useEffect(() => {
    api
      .listFavoriteZones()
      .then(setZones)
      .catch(() => toast.error("Impossible de charger tes zones favorites"))
      .finally(() => setZonesLoading(false));
  }, []);

  if (!user) return null;

  const toggleSetting = async (key, value) => {
    try {
      await updateSettings({ [key]: value });
    } catch (err) {
      toast.error(err.message || "Modification impossible");
    }
  };

  const addZone = async (place) => {
    setAddingZone(true);
    try {
      const zone = await api.createFavoriteZone({ name: place.name, lat: place.lat, lng: place.lng });
      setZones((prev) => [...prev, zone]);
      setZoneQuery("");
      toast.success("Zone ajoutée");
    } catch (err) {
      toast.error(err.message || "Impossible d'ajouter cette zone");
    } finally {
      setAddingZone(false);
    }
  };

  const removeZone = async (zoneId) => {
    const prev = zones;
    setZones((z) => z.filter((zone) => zone.id !== zoneId));
    try {
      await api.deleteFavoriteZone(zoneId);
    } catch (err) {
      setZones(prev); // restore on failure
      toast.error(err.message || "Suppression impossible");
    }
  };

  const toggleVoice = (enabled) => {
    setVoiceEnabled(enabled);
    setVoiceOn(enabled);
  };

  return (
    <div className="px-4 pt-4 pb-24">
      <h1 className="font-display text-xl font-semibold">Paramètres</h1>

      <SettingsSection icon={Bell} title="Notifications" hint="Alertes autour de toi">
        <SettingsRow
          label="Alertes à proximité"
          description="Un point rouge sur la cloche quand un incident récent apparaît près de toi."
          checked={user.notify_nearby_incidents}
          onCheckedChange={(v) => toggleSetting("notify_nearby_incidents", v)}
        />
      </SettingsSection>

      <SettingsSection icon={MapPin} title="Zones favorites" hint={`${zones.length} zone${zones.length !== 1 ? "s" : ""}`}>
        <PlaceField
          value={zoneQuery}
          onType={setZoneQuery}
          onPick={addZone}
          placeholder="Chercher une rue, un quartier..."
          dotColor="var(--primary)"
          trailing={addingZone ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
        />
        {zonesLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Chargement...</p>
        ) : zones.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Aucune zone enregistrée. Cherche une adresse ci-dessus pour en ajouter une.
          </p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {zones.map((zone) => (
              <div key={zone.id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-sm truncate">{zone.name}</span>
                <button
                  onClick={() => removeZone(zone.id)}
                  aria-label={`Retirer ${zone.name}`}
                  className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection icon={Shield} title="Confidentialité" hint="Anonymat sur tes contributions">
        <SettingsRow
          label="Afficher mon nom"
          description="Si désactivé, tes signalements et posts s'affichent comme venant d'un contributeur anonyme pour les autres (tu te vois toujours toi-même)."
          checked={user.show_real_name}
          onCheckedChange={(v) => toggleSetting("show_real_name", v)}
        />
      </SettingsSection>

      <SettingsSection icon={SettingsIcon} title="Préférences" hint="Thème, langue, unités">
        <SettingsRow
          label={
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Annonces vocales
            </span>
          }
          description={
            isVoiceSupported()
              ? "Lit à voix haute la recommandation \"avant de partir\"."
              : "Non supporté par ce navigateur."
          }
          checked={voiceOn}
          onCheckedChange={toggleVoice}
          disabled={!isVoiceSupported()}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Langue : Français · Unités : kilomètres — seules options disponibles pour l'instant.
        </p>
      </SettingsSection>
    </div>
  );
}
