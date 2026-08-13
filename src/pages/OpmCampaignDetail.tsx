import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { opm, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num } from '../lib/format';
import { ArrowLeft, DollarSign, PhoneOutgoing, Voicemail, PhoneCall, Loader2, CheckCircle2, Clock, AlertCircle, ExternalLink, Radio } from 'lucide-react';

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', launching: 'bg-blue-100 text-blue-700',
  dripping: 'bg-amber-100 text-amber-700', throttled: 'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700', paused: 'bg-slate-200 text-slate-600',
};
const LEAD_PILL: Record<string, string> = {
  launched: 'bg-emerald-100 text-emerald-700', completed: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700', failed: 'bg-red-100 text-red-700',
};

export default function OpmCampaignDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dripBusy, setDripBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError('');
    opm.campaignDetail(id).then(setData).catch((e: any) => setError(String(e?.message || e))).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingBlock label="Loading campaign…" />;
  if (error || !data?.campaign) return <div className="card p-10 text-center text-slate-400">{error || 'Campaign not found.'}</div>;

  const c = data.campaign;
  const k = data.kpis || {};
  const leads: any[] = data.leads || [];
  const launchedLeads = leads.filter((l) => l.status === 'launched' || l.status === 'completed' || l.call_id);
  const pendingLeads = leads.filter((l) => l.status === 'pending');
  const failedLeads = leads.filter((l) => l.status === 'failed');

  const runDrip = async () => { setDripBusy(true); try { await opm.campaignDripRun(); load(); } catch (e: any) { setError(String(e?.message || e)); } finally { setDripBusy(false); } };
  const showAllLeads = () => nav(`/leads?tag=${encodeURIComponent(data.tag)}&ws=${encodeURIComponent(c.workspace)}`);

  return (
    <div>
      <button onClick={() => nav('/campaigns')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> All campaigns</button>
      <PageHeader title={c.name} showDate={false}
        description={`${c.workspace} · ${c.agent_name || 'agent'}${c.dial_mode ? ` · ${c.dial_mode === 'all_numbers' ? 'all numbers' : 'primary only'}` : ''}${c.timezone ? ` · ${c.timezone}` : ''} · created ${c.created_at ? new Date(c.created_at).toLocaleDateString() : ''}`}
        actions={<div className="flex items-center gap-2">
          <span className={`pill ${STATUS_PILL[c.status] || 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
          {isSuper && c.status === 'dripping' && <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-surface disabled:opacity-50" disabled={dripBusy} onClick={runDrip}>{dripBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneOutgoing className="h-3.5 w-3.5" />} Process drip now</button>}
        </div>} />

      {/* KPIs — cost is shown clearly here (customer-facing) */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total cost" value={fmt.money((k.total_cost_cents || 0) / 100)} sub={`${num(k.total_calls || 0)} calls`} icon={DollarSign} accent="blue" />
        <KpiCard label="Avg call cost" value={fmt.money((k.avg_cost_cents || 0) / 100)} sub="per completed call" icon={DollarSign} accent="default" />
        <KpiCard label="Pickup rate" value={`${((k.pickup_rate || 0) * 100).toFixed(0)}%`} sub={`${num(k.answered || 0)} answered`} icon={PhoneCall} accent="green" />
        <KpiCard label="Voicemail rate" value={`${((k.voicemail_rate || 0) * 100).toFixed(0)}%`} sub={`${num(k.voicemail || 0)} voicemails`} icon={Voicemail} accent="amber" />
      </div>

      {/* Drip / status panel */}
      <SectionCard title="Progress" className="mb-4"
        description={`${num(k.launched || 0)} launched of ${num(k.total_leads || 0)} · ${num(k.pending || 0)} still pending${k.failed ? ` · ${num(k.failed)} failed` : ''}`}
        action={<button className="btn-ghost !py-1.5" onClick={showAllLeads}><ExternalLink className="h-3.5 w-3.5" /> Show all leads for this campaign</button>}>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-line p-3"><div className="text-[11px] font-semibold uppercase text-slate-500">Total leads</div><div className="text-xl font-extrabold text-ink">{num(k.total_leads || 0)}</div></div>
          <div className="rounded-lg border border-line p-3"><div className="text-[11px] font-semibold uppercase text-slate-500">Launched</div><div className="text-xl font-extrabold text-emerald-600">{num(k.launched || 0)}</div></div>
          <div className="rounded-lg border border-line p-3"><div className="text-[11px] font-semibold uppercase text-slate-500">Pending</div><div className="text-xl font-extrabold text-amber-600">{num(k.pending || 0)}</div></div>
          <div className="rounded-lg border border-line p-3"><div className="text-[11px] font-semibold uppercase text-slate-500">Completed</div><div className="text-xl font-extrabold text-ink">{num(k.total_calls || 0)}</div></div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full bg-brand transition-all" style={{ width: `${k.total_leads ? Math.min(100, (k.launched / k.total_leads) * 100) : 0}%` }} /></div>
        {c.status === 'throttled'
          ? <p className="mt-2 flex items-center gap-1.5 text-xs text-orange-600"><AlertCircle className="h-3.5 w-3.5" /> All numbers hit their daily cap — dialing auto-pauses and resumes tomorrow morning{c.next_drip_at ? ` (~${new Date(c.next_drip_at).toLocaleString()})` : ''}.</p>
          : c.status === 'dripping'
            ? <p className="mt-2 text-xs text-amber-600">Dialing is dripping automatically — paced ~1 call/15s, rotating across the agent's numbers, 9am–8pm local{c.next_drip_at ? ` · next batch ~${new Date(c.next_drip_at).toLocaleString()}` : ''}.</p>
            : null}
      </SectionCard>

      {/* Disposition breakdown with count + cost */}
      <SectionCard title="Disposition breakdown" description="Outcome, calls, and cost per disposition" className="mb-4">
        {(k.dispositions || []).length === 0 ? <EmptyState text="No completed calls yet — outcomes appear as calls finish." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Disposition</th><th className="px-3 py-2 text-right">Count</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Share</th></tr>
              </thead>
              <tbody>
                {(k.dispositions || []).map((d: any) => (
                  <tr key={d.disposition} className="border-t border-line">
                    <td className="px-3 py-2 font-medium text-ink">{fmt.title(d.disposition)}</td>
                    <td className="px-3 py-2 text-right font-mono">{num(d.count)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt.money((d.cost_cents || 0) / 100)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{k.total_calls ? `${((d.count / k.total_calls) * 100).toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Two lists: Launched and Still going / pending */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Launched" description={`${launchedLeads.length} lead${launchedLeads.length === 1 ? '' : 's'} dialed`}>
          {launchedLeads.length === 0 ? <EmptyState text="Nothing launched yet." /> : (
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {launchedLeads.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <button className="min-w-0 truncate font-medium text-ink hover:text-brand" onClick={() => nav(`/leads/${encodeURIComponent(l.lead_id)}`)}>{l.lead_name || l.lead_id}</button>
                  {l.disposition && <span className="ml-auto whitespace-nowrap text-xs text-slate-500">{fmt.title(l.disposition)}</span>}
                  {l.cost_cents != null && <span className="whitespace-nowrap font-mono text-xs text-slate-400">{fmt.money(l.cost_cents / 100)}</span>}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Still going / pending" description={`${pendingLeads.length} queued${failedLeads.length ? ` · ${failedLeads.length} failed` : ''}`}>
          {pendingLeads.length === 0 && failedLeads.length === 0 ? <EmptyState text="No pending leads — everything has been launched." /> : (
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {pendingLeads.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <Clock className="h-4 w-4 shrink-0 text-amber-500" />
                  <button className="min-w-0 truncate font-medium text-ink hover:text-brand" onClick={() => nav(`/leads/${encodeURIComponent(l.lead_id)}`)}>{l.lead_name || l.lead_id}</button>
                  <span className={`ml-auto pill ${LEAD_PILL.pending}`}>pending</span>
                </div>
              ))}
              {failedLeads.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <button className="min-w-0 truncate font-medium text-ink hover:text-brand" onClick={() => nav(`/leads/${encodeURIComponent(l.lead_id)}`)}>{l.lead_name || l.lead_id}</button>
                  <span className="ml-auto text-xs text-red-500">{l.phone ? 'no answer path' : 'no dialable #'}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
