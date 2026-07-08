import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { api, getToken, setToken, clearToken } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const { access_token, user: loggedInUser } = await api.login({ username, password });
    setToken(access_token);
    setUser(loggedInUser);
  }, []);

  const register = useCallback(async (username, password, displayName) => {
    const { access_token, user: newUser } = await api.register({ username, password, display_name: displayName });
    setToken(access_token);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // Persists a settings change (privacy/notifications) and refreshes the
  // shared `user` object so every consumer (bell dot, settings page) sees the
  // new value immediately, without each caller re-fetching /auth/me itself.
  const updateSettings = useCallback(async (partial) => {
    const updated = await api.updateMySettings(partial);
    setUser(updated);
    return updated;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateSettings }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
