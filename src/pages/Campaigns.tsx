import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dispatch } from '../lib/dispatch';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num } from '../lib/format';
import { Radio, Plus, PhoneOutgoing, Users, CheckCircle2, Loader2, ChevronRight, MapPin } from 'lucide-react';

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', verifying: 'bg-amber-100 text-amber-700',
  ready: 'bg-blue-100 text-blue-700', running: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700', done: 'bg-slate-200 text-slate-600',
};

export default function Campaigns() {
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => { setLoading(true); dispatch.bootstrap().then(setData).catch((e) => setError(String(e?.message || e))).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const r = await dispatch.saveCampaign({ name: newName.trim() });
      nav(`/campaigns/${r.campaign.slug}`);
    } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(false); }
  };

  const pool = data?.pool || [];
  const byRegion: Record<string, any[]> = {};
  for (const p of pool) (byRegion[p.region] ||= []).push(p);
  const totalRemaining = pool.reduce((s: number, p: any) => s + p.remaining, 0);
  const totalCap = pool.reduce((s: number, p: any) => s + p.cap, 0);

  return (
    <div>
      <PageHeader title="Dispatch AI — Campaigns" description="Upload leads, verify line types, configure Adrian, launch & monitor" showDate={false}
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New campaign</button>} />

      {error && <div className="card mb-5 border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? <LoadingBlock label="Loading dialer pool & campaigns…" /> : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Dial numbers" value={num(pool.length)} sub={`${Object.keys(byRegion).length} regions`} icon={PhoneOutgoing} accent="blue" />
            <KpiCard label="Dials left today" value={num(totalRemaining)} sub={`of ${num(totalCap)} daily cap`} icon={CheckCircle2} accent="green" />
            <KpiCard label="Campaigns" value={num((data?.campaigns || []).length)} icon={Radio} />
            <KpiCard label="Running" value={num((data?.campaigns || []).filter((c: any) => c.status === 'running').length)} icon={Users} accent="amber" />
          </div>

          <SectionCard title="Number pool" description="Rotation health — each number caps at its daily limit">
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(byRegion).map(([region, nums]) => (
                <div key={region} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-bold capitalize text-ink"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {region}</div>
                  <div className="space-y-2">
                    {nums.map((p: any) => (
                      <div key={p.number}>
                        <div className="mb-0.5 flex items-center justify-between text-xs">
                          <span className="font-mono text-ink">{p.number}</span>
                          <span className="text-slate-500">{p.used}/{p.cap}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                          <div className="h-full rounded-full" style={{ width: `${(p.used / p.cap) * 100}%`, background: p.used >= p.cap ? '#dc2626' : '#16a34a' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Numbers needed ≈ target dials/day ÷ {pool[0]?.cap || 100}. Add numbers in the dialer pool for bigger volume.</p>
          </SectionCard>

          <SectionCard title="Campaigns" description="Click a campaign to open the builder">
            {(data?.campaigns || []).length === 0 ? <EmptyState text="No campaigns yet — create one to get started." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2">Campaign</th><th className="px-3 py-2">Agent</th><th className="px-3 py-2 text-right">Leads</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"></th></tr>
                  </thead>
                  <tbody>
                    {(data.campaigns).map((c: any) => (
                      <tr key={c.slug} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => nav(`/campaigns/${c.slug}`)}>
                        <td className="px-3 py-2.5"><span className="font-semibold text-ink">{c.name}</span><div className="text-[11px] text-slate-400">{c.slug}</div></td>
                        <td className="px-3 py-2.5 text-slate-600">{c.agent_name}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{num(c.lead_count)}</td>
                        <td className="px-3 py-2.5"><span className={`pill ${STATUS_PILL[c.status] || 'bg-slate-100 text-slate-600'}`}>{c.status}</span></td>
                        <td className="px-3 py-2.5 text-right"><ChevronRight className="h-4 w-4 text-slate-300" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => setCreating(false)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold text-ink">New campaign</h3>
            <label className="label mb-1 block">Campaign name</label>
            <input autoFocus className="input mb-4" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Miami Off-Market — March" onKeyDown={(e) => e.key === 'Enter' && create()} />
            <button className="btn-primary w-full" disabled={busy || !newName.trim()} onClick={create}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create & open builder'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
