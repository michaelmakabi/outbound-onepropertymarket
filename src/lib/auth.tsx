import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, tokenStore } from './api';

type User = { id: number; name: string; username: string; role: 'user' | 'admin' | 'super_admin' } | null;

type AuthCtx = {
  user: User;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
};

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
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, isAdmin: user?.role === 'admin' || user?.role === 'super_admin' }}>
      {children}
    </Ctx.Provider>
  );
}
