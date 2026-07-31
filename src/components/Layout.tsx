import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  LayoutDashboard, Building2, PieChart, PhoneCall, GitCompare, Bot,
  Sparkles, PenLine, FileBarChart, Users, LogOut, Radio,
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

  const item = (n: any) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
          isActive ? 'bg-brand text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <n.icon className="h-4 w-4" /> {n.label}
    </NavLink>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col bg-ink px-3 py-4">
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
      </aside>
      <main className="ml-60 flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
