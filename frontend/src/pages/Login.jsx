import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { LOGIN } from "@/constants/testIds";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(location.state?.from || "/app");
    } catch (err) {
      toast.error(err.message || "Connexion impossible");
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
          <h1 className="font-display text-xl font-semibold text-foreground">Se connecter</h1>
          <p className="text-sm text-muted-foreground mt-1">Accède au fil social et à tes badges de contributeur.</p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <Input
              data-testid={LOGIN.emailInput}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nom d'utilisateur"
              autoComplete="username"
              required
            />
            <Input
              data-testid={LOGIN.passwordInput}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              autoComplete="current-password"
              required
            />
            <Button data-testid={LOGIN.submitButton} type="submit" disabled={submitting} className="w-full h-11 rounded-xl bg-foreground text-background">
              {submitting ? "Connexion…" : "Se connecter"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-center text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link data-testid={LOGIN.registerLink} to="/register" className="font-semibold text-primary">
              Créer un profil
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
