import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { REGISTER } from "@/constants/testIds";

export default function Register() {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (password !== passwordConfirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setSubmitting(true);
    try {
      await register(username, password, displayName);
      navigate("/app");
    } catch (err) {
      toast.error(err.message || "Inscription impossible");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-surface px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-hero flex items-center justify-center shadow-glow">
            <Activity className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-semibold text-foreground">
            RoutePulse <span className="text-primary">CI</span>
          </span>
        </Link>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-soft">
          <h1 className="font-display text-xl font-semibold text-foreground">Créer un profil</h1>
          <p className="text-sm text-muted-foreground mt-1">Gratuit. Signaler ne nécessite pas de compte, mais un profil te donne accès au fil social.</p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <Input
              data-testid={REGISTER.nameInput}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nom affiché (ex: Aya K.)"
              autoComplete="name"
              required
            />
            <Input
              data-testid={REGISTER.emailInput}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nom d'utilisateur"
              autoComplete="username"
              required
            />
            <Input
              data-testid={REGISTER.passwordInput}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              autoComplete="new-password"
              required
            />
            <Input
              data-testid={REGISTER.passwordConfirmInput}
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="Confirme le mot de passe"
              autoComplete="new-password"
              required
            />
            <Button data-testid={REGISTER.submitButton} type="submit" disabled={submitting} className="w-full h-11 rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">
              {submitting ? "Création…" : "Créer mon profil"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-center text-muted-foreground">
            Déjà un compte ?{" "}
            <Link data-testid={REGISTER.loginLink} to="/login" className="font-semibold text-primary">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
