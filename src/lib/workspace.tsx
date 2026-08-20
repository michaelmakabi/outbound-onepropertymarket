import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { opm, workspaceStore } from './api';
import { useAuth } from './auth';

export type Tenant = { slug: string; display_name: string };

// Sentinel passed to setActive() to enter the cross-tenant "All Workspaces" view.
export const ALL_WORKSPACES = '__all__';
const ALL_FLAG = 'opm_view_all';

type WorkspaceCtx = {
  workspaces: Tenant[];
  active: string | null;        // a CONCRETE workspace for single-tenant operations (never the sentinel)
  activeName: string;
  viewAll: boolean;             // true => aggregate analytics across every workspace
  isStaff: boolean;
  roles: Record<string, string>;
  ownsActive: boolean;
  loading: boolean;
  setActive: (slug: string) => void;
};

const Ctx = createContext<WorkspaceCtx>({
  workspaces: [], active: null, activeName: '', viewAll: false, isStaff: false, roles: {}, ownsActive: false, loading: true, setActive: () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Tenant[]>([]);
  const [active, setActiveState] = useState<string | null>(workspaceStore.get());
  const [viewAll, setViewAll] = useState<boolean>(localStorage.getItem(ALL_FLAG) === '1');
  const [isStaff, setIsStaff] = useState(false);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const setActive = useCallback((slug: string) => {
    if (slug === ALL_WORKSPACES) {
      // All-Workspaces: clear the API-layer scope (null => analytics aggregate across all tenants).
      localStorage.setItem(ALL_FLAG, '1');
      workspaceStore.set(null);
    } else {
      localStorage.removeItem(ALL_FLAG);
      workspaceStore.set(slug);
    }
    // Reload so every page refetches under the new scope.
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
      // All-Workspaces only makes sense with more than one tenant.
      const allMode = localStorage.getItem(ALL_FLAG) === '1' && list.length > 1;
      setViewAll(allMode);
      // In All-Workspaces mode the API-layer scope (workspaceStore) stays null so analytics aggregate,
      // while `active` still points at a real tenant (the default) for pages that must operate on one.
      const stored = workspaceStore.get();
      if (allMode) {
        setActiveState(d.active || list[0]?.slug || null);
      } else {
        const valid = stored && list.some((w) => w.slug === stored) ? stored : (d.active || list[0]?.slug || null);
        if (valid !== stored) workspaceStore.set(valid);
        setActiveState(valid);
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const activeName = viewAll ? 'All Workspaces' : (workspaces.find((w) => w.slug === active)?.display_name || '');
  const ownsActive = !viewAll && !!active && roles[active] === 'owner';

  return <Ctx.Provider value={{ workspaces, active, activeName, viewAll, isStaff, roles, ownsActive, loading, setActive }}>{children}</Ctx.Provider>;
}

export const useWorkspace = () => useContext(Ctx);
