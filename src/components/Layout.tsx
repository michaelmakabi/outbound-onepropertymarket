import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useWorkspace } from '../lib/workspace';
import ProfileModal from './ProfileModal';
import NotificationBell from './NotificationBell';
import {
  LayoutDashboard, Building2, PieChart, PhoneCall, GitCompare, Bot,
  Sparkles, PenLine, FileBarChart, Users, Activity, LogOut, Menu, X, PanelLeftClose, PanelLeft, UserCog, Contact,
  Columns3, ChevronDown, Check, DollarSign, PhoneOutgoing, Webhook, Boxes, CreditCard, FileSignature, Copy, Camera, Headset, Radio, Waypoints, Bell, MessageSquare,
} from 'lucide-react';
import { LOGO_MARK } from '../lib/logo';

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { workspaces, active, activeName, setActive } = useWorkspace();
  const [open, setOpen] = useState(false);
  if (workspaces.length <= 1) return null; // single tenant → nothing to switch
  return (
    <div className="relative mb-3">
      <button onClick={() => setOpen((o) => !o)} title="Switch workspace"
        className={`flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left text-sm font-semibold text-white hover:bg-white/10 ${collapsed ? 'justify-center' : ''}`}>
        <Building2 className="h-4 w-4 shrink-0 text-slate-300" />
        {!collapsed && <><span className="min-w-0 flex-1 truncate">{activeName || 'Workspace'}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /></>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-xl">
            {workspaces.map((w) => (
              <button key={w.slug} onClick={() => { setOpen(false); if (w.slug !== active) setActive(w.slug); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-surface">
                <span className="w-4 shrink-0">{w.slug === active && <Check className="h-3.5 w-3.5 text-brand" />}</span>
                <span className="truncate">{w.display_name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// op:true = operator tooling, hidden from customers (role=user).
const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/seller-contacts', label: 'Contacts', icon: Contact },
  { to: '/pipelines', label: 'Pipelines', icon: Columns3 },
  { to: '/campaigns', label: 'Campaigns', icon: Radio },
  { to: '/team', label: 'Team', icon: MessageSquare },
  { to: '/workspaces', label: 'Workspaces', icon: Building2, op: true },
  { to: '/dispositions', label: 'Dispositions', icon: PieChart },
  { to: '/calls', label: 'Call History', icon: PhoneCall },
  { to: '/compare', label: 'Compare', icon: GitCompare, op: true },
  { to: '/agents', label: 'Agents & Models', icon: Bot, op: true },
  { to: '/ai-agents', label: 'AI Agents', icon: Headset },
  { to: '/test-ai', label: 'Test AI', icon: PhoneOutgoing },
  { to: '/suggestions', label: 'AI Suggestions', icon: Sparkles, op: true },
  { to: '/prompt-studio', label: 'Prompt Studio', icon: PenLine, op: true },
  { to: '/reports', label: 'Reports', icon: FileBarChart, op: true },
];
const ADMIN_NAV = [
  { to: '/usage', label: 'Usage Analytics', icon: Activity },
  { to: '/users', label: 'Users & Access', icon: Users },
];

const COLLAPSE_KEY = 'opm_sidebar_collapsed';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin, impersonating, stopImpersonation } = useAuth();
  const { active: activeWs, roles, isStaff, ownsActive } = useWorkspace();
  const isCustomer = user?.role === 'user';
  // Lead Routing is management tooling: owner/admin/manager (workspace role) or platform admin/staff.
  const canRoute = isAdmin || isStaff || ownsActive || (activeWs ? ['owner', 'admin', 'manager'].includes(roles[activeWs] || '') : false);
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const width = collapsed ? 'w-[68px]' : 'w-60';
  const activeLabel = [{ to: '/notifications-center', label: 'Notification Center' }, ...NAV, { to: '/leads', label: 'Contacts' }, { to: '/routing', label: 'Lead Routing' }, { to: '/notifications', label: 'Notifications' }, ...ADMIN_NAV, { to: '/account', label: 'Account & Billing' }, { to: '/tenants', label: 'Customers' }, { to: '/onboarding', label: 'Card Authorization' }, { to: '/agent-clone', label: 'Clone Agent' }, { to: '/snapshots', label: 'Snapshots' }].find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)))?.label ?? 'Menu';

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
      <WorkspaceSwitcher collapsed={collapsed} />
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV.filter((n) => !isCustomer || !n.op).map(item)}
        {canRoute && item({ to: '/routing', label: 'Lead Routing', icon: Waypoints })}
        {canRoute && item({ to: '/notifications', label: 'Notifications', icon: Bell })}
        {isCustomer && item({ to: '/account', label: 'Account & Billing', icon: CreditCard })}
        {isAdmin && (
          <>
            {!collapsed && <div className="mt-4 mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Admin</div>}
            {collapsed && <div className="my-2 border-t border-white/10" />}
            {ADMIN_NAV.map(item)}
            {user?.role === 'super_admin' && item({ to: '/tenants', label: 'Customers', icon: Boxes })}
            {user?.role === 'super_admin' && item({ to: '/billing', label: 'Billing', icon: DollarSign })}
            {user?.role === 'super_admin' && item({ to: '/onboarding', label: 'Card Authorization', icon: FileSignature })}
            {user?.role === 'super_admin' && item({ to: '/agent-clone', label: 'Clone Agent', icon: Copy })}
            {user?.role === 'super_admin' && item({ to: '/snapshots', label: 'Snapshots', icon: Camera })}
            {user?.role === 'super_admin' && item({ to: '/integrations', label: 'Integrations', icon: Webhook })}
          </>
        )}
      </nav>
      <div className="mt-3 border-t border-white/10 pt-3">
        {/* Notification bell — present on every page for all users (desktop sidebar). */}
        <div className={`mb-2 flex items-center ${collapsed ? 'justify-center' : 'justify-between px-1'}`}>
          {!collapsed && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notifications</span>}
          <NotificationBell variant="sidebar" panelClassName={collapsed ? 'fixed left-[72px] bottom-4' : 'fixed left-[248px] bottom-4'} />
        </div>
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
        <div className="ml-auto"><NotificationBell variant="topbar" /></div>
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

      <main className={`flex-1 px-4 py-6 pt-20 transition-all md:px-6 md:pt-6 ${collapsed ? 'md:ml-[68px]' : 'md:ml-60'}`}>
        {impersonating && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5">
            <span className="text-sm font-semibold text-amber-800">
              You're viewing as <b>{user?.name}</b>. Everything you see and do is scoped to this user's access.
            </span>
            <button onClick={stopImpersonation} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
              <LogOut className="h-3.5 w-3.5" /> Return to my account
            </button>
          </div>
        )}
        {children}
      </main>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
