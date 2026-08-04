import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import ProfileModal from './ProfileModal';
import {
  LayoutDashboard, Building2, PieChart, PhoneCall, GitCompare, Bot,
  Sparkles, PenLine, FileBarChart, Users, Activity, LogOut, Menu, X, PanelLeftClose, PanelLeft, UserCog, Contact,
  UserSquare2, Columns3,
} from 'lucide-react';
import { LOGO_MARK } from '../lib/logo';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: UserSquare2 },
  { to: '/seller-contacts', label: 'Contacts', icon: Contact },
  { to: '/pipelines', label: 'Pipelines', icon: Columns3 },
  { to: '/workspaces', label: 'Workspaces', icon: Building2 },
  { to: '/dispositions', label: 'Dispositions', icon: PieChart },
  { to: '/calls', label: 'Call History', icon: PhoneCall },
  { to: '/compare', label: 'Compare', icon: GitCompare },
  { to: '/agents', label: 'Agents & Models', icon: Bot },
  { to: '/suggestions', label: 'AI Suggestions', icon: Sparkles },
  { to: '/prompt-studio', label: 'Prompt Studio', icon: PenLine },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
];
const ADMIN_NAV = [
  { to: '/usage', label: 'Usage Analytics', icon: Activity },
  { to: '/users', label: 'Users & Access', icon: Users },
];

const COLLAPSE_KEY = 'opm_sidebar_collapsed';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const width = collapsed ? 'w-[68px]' : 'w-60';
  const activeLabel = [...NAV, ...ADMIN_NAV].find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)))?.label ?? 'Menu';

  const item = (n: any) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      title={collapsed ? n.label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${collapsed ? 'justify-center' : ''} ${
          isActive ? 'bg-brand text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <n.icon className="h-4 w-4 shrink-0" /> {!collapsed && n.label}
    </NavLink>
  );

  const sidebarInner = (
    <>
      <div className={`mb-6 flex items-center gap-2.5 px-2 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1"><img src={LOGO_MARK} alt="1PropertyMarket" className="h-full w-full object-contain" /></div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold leading-tight text-white">1PropertyMarket</div>
            <div className="text-[11px] font-medium text-slate-400">Outbound</div>
          </div>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV.map(item)}
        {isAdmin && (
          <>
            {!collapsed && <div className="mt-4 mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Admin</div>}
            {collapsed && <div className="my-2 border-t border-white/10" />}
            {ADMIN_NAV.map(item)}
          </>
        )}
      </nav>
      <div className="mt-3 border-t border-white/10 pt-3">
        {!collapsed && (
          <>
            <div className="px-2 text-sm font-semibold text-white">{user?.name}</div>
            <div className="px-2 text-[11px] text-slate-400">{user?.role?.replace('_', ' ')}</div>
          </>
        )}
        <button
          onClick={() => setProfileOpen(true)}
          title="My account"
          className={`mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : ''}`}
        >
          <UserCog className="h-4 w-4" /> {!collapsed && 'My account'}
        </button>
        <button
          onClick={async () => { await logout(); navigate('/login'); }}
          title="Sign out"
          className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="h-4 w-4" /> {!collapsed && 'Sign out'}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-ink px-3 py-4 transition-all md:flex ${width}`}>
        {sidebarInner}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-6 hidden h-6 w-6 items-center justify-center rounded-full border border-line bg-white text-slate-500 shadow-sm hover:text-brand md:flex"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur md:hidden">
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 text-ink hover:bg-surface"><Menu className="h-5 w-5" /></button>
        <span className="font-bold text-ink">{activeLabel}</span>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-ink px-3 py-4">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-lg p-1 text-slate-300 hover:bg-white/10"><X className="h-5 w-5" /></button>
            {sidebarInner}
          </aside>
        </div>
      )}

      <main className={`flex-1 px-4 py-6 pt-20 transition-all md:px-6 md:pt-6 ${collapsed ? 'md:ml-[68px]' : 'md:ml-60'}`}>{children}</main>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
