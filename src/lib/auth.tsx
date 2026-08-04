import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, tokenStore, workspaceStore } from './api';

type User = {
  id: number; name: string; username: string; email?: string;
  role: 'user' | 'admin' | 'super_admin';
  impersonated_by?: number | null; impersonator_name?: string | null;
} | null;

type AuthCtx = {
  user: User;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  impersonating: boolean;
  impersonatorName: string | null;
  startImpersonation: (id: number) => Promise<void>;
  stopImpersonation: () => Promise<void>;
};

// Where the real admin's token is parked while impersonating, so we can return.
const ADMIN_TOKEN_KEY = 'opm_admin_token';

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!tokenStore.get()) return setLoading(false);
      try {
        const { user } = await api.me();
        setUser(user);
      } catch {
        tokenStore.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const { token, user } = await api.login(username, password);
    tokenStore.set(token);
    setUser(user);
  };
  const logout = async () => {
    try { await api.logout(); } catch {}
    tokenStore.clear();
    localStorage.removeItem(ADMIN_TOKEN_KEY); // don't orphan a parked admin token
    workspaceStore.set(null);
    setUser(null);
  };

  // Super-admin: begin acting as another user. Park the admin token, swap in the
  // impersonation token, and hard-reload so every page refetches under the new identity.
  const startImpersonation = async (id: number) => {
    const { token } = await api.admin.impersonate(id);
    const adminTok = tokenStore.get();
    if (adminTok) localStorage.setItem(ADMIN_TOKEN_KEY, adminTok);
    tokenStore.set(token);
    workspaceStore.set(null); // impersonated user has their own tenant scope
    window.location.assign('/');
  };
  // Return to the admin account: drop the impersonation session, restore the parked token.
  const stopImpersonation = async () => {
    const adminTok = localStorage.getItem(ADMIN_TOKEN_KEY);
    try { await api.logout(); } catch {} // deletes the impersonation session server-side
    if (adminTok) { tokenStore.set(adminTok); localStorage.removeItem(ADMIN_TOKEN_KEY); }
    else tokenStore.clear();
    workspaceStore.set(null);
    window.location.assign('/users');
  };

  const impersonating = !!user?.impersonated_by;

  return (
    <Ctx.Provider value={{
      user, loading, login, logout,
      isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
      impersonating, impersonatorName: user?.impersonator_name ?? null,
      startImpersonation, stopImpersonation,
    }}>
      {children}
    </Ctx.Provider>
  );
}
