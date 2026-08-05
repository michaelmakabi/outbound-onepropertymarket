import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { opm, workspaceStore } from './api';
import { useAuth } from './auth';

export type Tenant = { slug: string; display_name: string };

type WorkspaceCtx = {
  workspaces: Tenant[];
  active: string | null;
  activeName: string;
  isStaff: boolean;
  roles: Record<string, string>;
  ownsActive: boolean;
  loading: boolean;
  setActive: (slug: string) => void;
};

const Ctx = createContext<WorkspaceCtx>({
  workspaces: [], active: null, activeName: '', isStaff: false, roles: {}, ownsActive: false, loading: true, setActive: () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Tenant[]>([]);
  const [active, setActiveState] = useState<string | null>(workspaceStore.get());
  const [isStaff, setIsStaff] = useState(false);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const setActive = useCallback((slug: string) => {
    workspaceStore.set(slug);
    setActiveState(slug);
    // Reload so every page refetches under the new tenant scope.
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    opm.workspaces().then((d: any) => {
      if (cancelled) return;
      const list: Tenant[] = d.workspaces || [];
      setWorkspaces(list);
      setIsStaff(!!d.is_staff);
      setRoles(d.roles || {});
      // Adopt a valid active workspace: keep the stored one if it's still allowed, else the backend's.
      const stored = workspaceStore.get();
      const valid = stored && list.some((w) => w.slug === stored) ? stored : (d.active || list[0]?.slug || null);
      if (valid !== stored) workspaceStore.set(valid);
      setActiveState(valid);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const activeName = workspaces.find((w) => w.slug === active)?.display_name || '';
  const ownsActive = !!active && roles[active] === 'owner';

  return <Ctx.Provider value={{ workspaces, active, activeName, isStaff, roles, ownsActive, loading, setActive }}>{children}</Ctx.Provider>;
}

export const useWorkspace = () => useContext(Ctx);
