import { useEffect, useState } from 'react';
import { adminOps } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { Webhook, Radio, Plus, Trash2, Send, Check, AlertCircle, X, Loader2, Pencil } from 'lucide-react';

const EVENTS = ['call.completed'];
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export default function Integrations() {
  const { user } = useAuth();
  const [wh, setWh] = useState<any>({ webhooks: [], deliveries: [], stats: {}, tenants: [] });
  const [dl, setDl] = useState<any>({ dialers: [], config: [], tenants: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null); // webhook being edited/created
  const [testing, setTesting] = useState<number | null>(null);
  const [testMsg, setTestMsg] = useState<Record<number, { ok: boolean; text: string }>>({});

  const load = () => Promise.all([adminOps.webhooksList(), adminOps.dialerList()])
    .then(([w, d]) => { setWh(w); setDl(d); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  if (user?.role !== 'super_admin') return <div className="py-16 text-center text-slate-400">Integrations are restricted to super admins.</div>;
  if (loading) return <Spinner />;

  const test = async (id: number) => {
    setTesting(id); setTestMsg((m) => ({ ...m, [id]: undefined as any }));
    try {
      const r = await adminOps.webhooksTest(id);
      setTestMsg((m) => ({ ...m, [id]: { ok: r.ok, text: r.ok ? `Delivered (HTTP ${r.http_status})` : `Failed: ${r.error || r.http_status}` } }));
      load();
    } catch (e: any) { setTestMsg((m) => ({ ...m, [id]: { ok: false, text: e?.message || 'Test failed' } })); } finally { setTesting(null); }
  };
  const del = async (id: number) => { if (!confirm('Delete this webhook?')) return; await adminOps.webhooksDelete(id); load(); };

  return (
    <div>
      <PageHead title="Integrations" subtitle="Outbound webhooks and per-tenant dialer routing" />

      {/* ---------------- Webhooks ---------------- */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink"><Webhook className="h-4 w-4 text-brand" /> Webhooks</h2>
          <button className="btn-primary" onClick={() => setEditing({ workspace: wh.tenants[0] || '', url: '', secret: '', events: ['call.completed'], active: true, description: '' })}><Plus className="h-4 w-4" /> Add webhook</button>
        </div>
        <p className="mb-3 text-xs text-slate-500">When an AI call completes, we POST a signed JSON payload (HMAC-SHA256 in <code>X-OPM-Signature</code>) to each active webhook for that lead's tenant. Point one at a GHL inbound webhook to push results into MTIP 2.0.</p>

        {wh.webhooks.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-400">No webhooks yet. Add one to start pushing call results out.</div>
        ) : (
          <div className="space-y-2">
            {wh.webhooks.map((h: any) => {
              const st = wh.stats[h.id] || {};
              return (
                <div key={h.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`pill ${h.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{h.active ? 'active' : 'off'}</span>
                      <span className="pill bg-brand/10 text-brand">{h.workspace}</span>
                      <span className="truncate font-mono text-xs text-slate-600">{h.url}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>{(h.events || []).join(', ')}</span>
                      {h.secret && <span>· signed</span>}
                      {(st.success || st.failed) && <span>· {st.success || 0} ok / {st.failed || 0} failed (recent)</span>}
                      {h.description && <span>· {h.description}</span>}
                    </div>
                    {testMsg[h.id] && <div className={`mt-1 flex items-center gap-1 text-xs ${testMsg[h.id].ok ? 'text-emerald-600' : 'text-red-600'}`}>{testMsg[h.id].ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {testMsg[h.id].text}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="btn-ghost !px-2 !py-1 text-xs" disabled={testing === h.id} onClick={() => test(h.id)} title="Send test event">{testing === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}</button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing({ ...h, secret: h.secret || '' })} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={() => del(h.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* recent deliveries */}
        {wh.deliveries.length > 0 && (
          <div className="card mt-4 overflow-hidden">
            <div className="border-b border-line px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">Recent deliveries</div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <tbody>
                  {wh.deliveries.map((d: any) => (
                    <tr key={d.id} className="border-t border-line">
                      <td className="px-4 py-1.5 text-slate-400">{dt(d.created_at)}</td>
                      <td className="px-2 py-1.5"><span className={`pill ${d.status === 'success' ? 'bg-emerald-100 text-emerald-700' : d.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{d.status}</span></td>
                      <td className="px-2 py-1.5 text-slate-500">{d.workspace}</td>
                      <td className="px-2 py-1.5 text-slate-500">{d.event}</td>
                      <td className="px-2 py-1.5 text-slate-400">{d.http_status || '—'}</td>
                      <td className="max-w-[200px] truncate px-2 py-1.5 text-red-500">{d.last_error || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- Dialer routing ---------------- */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink"><Radio className="h-4 w-4 text-brand" /> Dialer routing</h2>
        <p className="mb-3 text-xs text-slate-500">Which Retell dialer key + agent each CRM tenant uses when placing AI calls. Tenants without a mapping fall back to the 1PropertyMarket dialer.</p>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2.5">CRM tenant</th><th className="px-3 py-2.5">Dialer key</th><th className="px-3 py-2.5">Agent ID</th><th className="px-3 py-2.5">Caller IDs</th><th className="px-3 py-2.5"></th></tr>
            </thead>
            <tbody>
              {dl.tenants.map((t: string) => {
                const cfg = dl.config.find((c: any) => c.crm_workspace === t);
                return <DialerRow key={t} tenant={t} cfg={cfg} dialers={dl.dialers} onSaved={load} />;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <WebhookModal wh={editing} tenants={wh.tenants} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function DialerRow({ tenant, cfg, dialers, onSaved }: any) {
  const [edit, setEdit] = useState(false);
  const [slug, setSlug] = useState(cfg?.dialer_slug || '1propertymarket');
  const [agent, setAgent] = useState(cfg?.agent_id || '');
  const [numbers, setNumbers] = useState((cfg?.from_numbers || []).join(', '));
  const [busy, setBusy] = useState(false);
  const withKey = dialers.filter((d: any) => d.has_key);

  const save = async () => {
    setBusy(true);
    try {
      await adminOps.dialerSet({ crm_workspace: tenant, dialer_slug: slug, agent_id: agent || null, from_numbers: numbers.split(',').map((s: string) => s.trim()).filter(Boolean) });
      setEdit(false); onSaved();
    } finally { setBusy(false); }
  };

  if (!edit) return (
    <tr className="border-t border-line">
      <td className="px-4 py-2.5 font-semibold text-ink">{tenant}</td>
      <td className="px-3 py-2.5 font-mono text-xs">{cfg?.dialer_slug || <span className="text-slate-400">— (fallback 1propertymarket)</span>}</td>
      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{cfg?.agent_id || '—'}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500">{(cfg?.from_numbers || []).length || 0} number(s)</td>
      <td className="px-3 py-2.5 text-right"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" /></button></td>
    </tr>
  );
  return (
    <tr className="border-t border-line bg-surface/40">
      <td className="px-4 py-2.5 font-semibold text-ink">{tenant}</td>
      <td className="px-3 py-2.5"><select className="input !py-1 text-xs" value={slug} onChange={(e) => setSlug(e.target.value)}>{withKey.map((d: any) => <option key={d.slug} value={d.slug}>{d.display_name} ({d.slug})</option>)}</select></td>
      <td className="px-3 py-2.5"><input className="input !py-1 font-mono text-[11px]" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="agent_…" /></td>
      <td className="px-3 py-2.5"><input className="input !py-1 text-xs" value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="+1..., +1..." /></td>
      <td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-1"><button className="btn-primary !px-2 !py-1 text-xs" disabled={busy} onClick={save}>{busy ? '…' : 'Save'}</button><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEdit(false)}>Cancel</button></div></td>
    </tr>
  );
}

function WebhookModal({ wh, tenants, onClose, onSaved }: any) {
  const [form, setForm] = useState({ id: wh.id, workspace: wh.workspace, url: wh.url, secret: wh.secret || '', events: wh.events || ['call.completed'], active: wh.active !== false, description: wh.description || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toggleEvent = (e: string) => setForm((f) => ({ ...f, events: f.events.includes(e) ? f.events.filter((x: string) => x !== e) : [...f.events, e] }));
  const save = async () => {
    setErr(''); setBusy(true);
    try { await adminOps.webhooksSave(form); onSaved(); }
    catch (e: any) { setErr(e?.message || 'Save failed'); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-ink">{wh.id ? 'Edit webhook' : 'Add webhook'}</h3><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button></div>
        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="space-y-3">
          <label className="block"><span className="label mb-1 block">Tenant</span>
            <select className="input w-full" value={form.workspace} onChange={(e) => setForm({ ...form, workspace: e.target.value })}>
              {tenants.map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          <label className="block"><span className="label mb-1 block">Endpoint URL</span><input className="input w-full font-mono text-xs" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
          <label className="block"><span className="label mb-1 block">Signing secret (optional)</span><input className="input w-full font-mono text-xs" placeholder="used for X-OPM-Signature" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} /></label>
          <div><span className="label mb-1 block">Events</span>
            <div className="flex flex-wrap gap-2">{EVENTS.map((e) => <label key={e} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs"><input type="checkbox" checked={form.events.includes(e)} onChange={() => toggleEvent(e)} className="h-3.5 w-3.5 accent-[#1f6feb]" /> {e}</label>)}</div>
          </div>
          <label className="block"><span className="label mb-1 block">Description (optional)</span><input className="input w-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[#1f6feb]" /> Active</label>
        </div>
        <button className="btn-primary mt-4 w-full" disabled={busy || !form.url || !form.workspace} onClick={save}>{busy ? 'Saving…' : wh.id ? 'Save changes' : 'Create webhook'}</button>
      </div>
    </div>
  );
}
