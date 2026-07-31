import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" /> {label || 'Loading…'}
    </div>
  );
}

export function PageHead({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'brand' | 'good' | 'warn' }) {
  const bar = tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-brand';
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className={`h-8 w-1 rounded-full ${bar}`} />
        <div>
          <div className="label">{label}</div>
          <div className="mt-0.5 text-xl font-extrabold text-ink">{value}</div>
        </div>
      </div>
      {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const trial = status === 'trial_expired';
  return (
    <span className={`pill ${trial ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
      {trial ? 'Trial expired' : 'Active'}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="card p-10 text-center text-sm text-slate-400">{text}</div>;
}

const RANGES = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All time' },
];

export function RangePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${value === r.key ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface'}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function rangeToMs(value: string): { start: number | null; end: number | null } {
  if (value === 'all') return { start: null, end: null };
  const days = Number(value);
  return { start: Date.now() - days * 86400000, end: null };
}
