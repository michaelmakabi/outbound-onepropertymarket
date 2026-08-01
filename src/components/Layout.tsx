import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  LayoutDashboard, Building2, PieChart, PhoneCall, GitCompare, Bot,
  Sparkles, PenLine, FileBarChart, Users, LogOut, Radio, Menu, X,
} from 'lucide-react';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/workspaces', label: 'Workspaces', icon: Building2 },
  { to: '/dispositions', label: 'Dispositions', icon: PieChart },
  { to: '/calls', label: 'Call History', icon: PhoneCall },
  { to: '/compare', label: 'Compare', icon: GitCompare },
  { to: '/agents', label: 'Agents & Models', icon: Bot },
  { to: '/suggestions', label: 'AI Suggestions', icon: Sparkles },
  { to: '/prompt-studio', label: 'Prompt Studio', icon: PenLine },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
];
const ADMIN_NAV = [{ to: '/users', label: 'Users & Access', icon: Users }];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const item = (n: any) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
          isActive ? 'bg-brand text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <n.icon className="h-4 w-4" /> {n.label}
    </NavLink>
  );

  const sidebar = (
    <>
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand">
          <Radio className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-extrabold leading-tight text-white">One Property Market</div>
          <div className="text-[11px] font-medium text-slate-400">Outbound</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV.map(item)}
        {isAdmin && (
          <>
            <div className="mt-4 mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Admin</div>
            {ADMIN_NAV.map(item)}
          </>
        )}
      </nav>
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="px-2 text-sm font-semibold text-white">{user?.name}</div>
        <div className="px-2 text-[11px] text-slate-400">{user?.role?.replace('_', ' ')}</div>
        <button
          onClick={async () => { await logout(); navigate('/login'); }}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-3 md:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-ink hover:bg-surface" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand"><Radio className="h-4 w-4 text-white" /></div>
          <span className="text-sm font-extrabold text-ink">One Property Market</span>
        </div>
      </header>

      {/* Backdrop (mobile) */}
      {open && <div className="fixed inset-0 z-40 bg-ink/40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Sidebar: drawer on mobile, fixed rail on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-ink px-3 py-4 transition-transform duration-200 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-1 text-slate-300 hover:bg-white/10 md:hidden" aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
        {sidebar}
      </aside>

      <main className="px-4 py-6 md:ml-60 md:px-6">{children}</main>
    </div>
  );
}
