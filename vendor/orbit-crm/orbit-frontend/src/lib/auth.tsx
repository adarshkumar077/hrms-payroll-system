import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet, apiPost, setToken, getToken } from "./api";

type User = { id: string; name: string; email: string; is_ceo: boolean; tenant_id: string; role_id: string | null };
type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (org: string, name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try { setUser(await apiGet<User>("/me")); } catch { setToken(null); }
      }
      setLoading(false);
    })();
  }, []);

  // Global 401 handling: api.ts clears the token and fires this event when any
  // request comes back unauthorized. Clearing user here makes Protected (App.tsx)
  // redirect to /login on the next render.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("orbit:unauthorized", onUnauthorized);
    return () => window.removeEventListener("orbit:unauthorized", onUnauthorized);
  }, []);

  async function login(email: string, password: string) {
    const res = await apiPost<{ token: string; user: User }>("/auth/login", { email, password });
    setToken(res.token);
    setUser(res.user ?? (await apiGet<User>("/me")));
  }
  async function signup(org: string, name: string, email: string, password: string) {
    const res = await apiPost<{ token: string; user: User }>("/auth/signup", { org, name, email, password });
    setToken(res.token);
    setUser(res.user ?? (await apiGet<User>("/me")));
  }
  async function logout() {
    try { await apiPost("/auth/logout"); } catch { /* ignore */ }
    setToken(null);
    setUser(null);
  }

  return <Ctx.Provider value={{ user, loading, login, signup, logout }}>{children}</Ctx.Provider>;
}
