import { useEffect, useRef, useState } from 'react';
import { onboarding, AUTHORIZATION_TEXT, AUTHORIZATION_VERSION } from '../lib/onboarding';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import AutoChargeBar from '../components/AutoChargeBar';
import {
  UserPlus, ShieldCheck, CreditCard, Link2, Eye, Check, X, AlertCircle, Copy,
  KeyRound, RefreshCw, FileSignature, Building2,
} from 'lucide-react';

const COMPANY = '1PropertyMarket';
const statusColor: Record<string, string> = {
  onboarding: 'bg-amber-100 text-amber-700', active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-slate-100 text-slate-600', closed: 'bg-red-100 text-red-700',
};

export default function Onboarding() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => onboarding.accounts().then((d) => setAccounts(d.accounts || [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  if (user?.role !== 'super_admin') return <div className="py-16 text-center text-slate-400">Onboarding is restricted to super admins.</div>;
  if (loading) return <Spinner />;

  return (
    <div>
      <PageHead title="Accounts & Onboarding" subtitle="Create customer accounts, capture card authorization, and hand cards to Retell"
        right={<button className="btn-primary" onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" /> New account</button>} />

      <AutoChargeBar />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Account</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Mode</th>
              <th className="px-3 py-2.5 font-semibold">Authorization</th>
              <th className="px-3 py-2.5 font-semibold">Card on file</th>
              <th className="px-3 py-2.5 text-right font-semibold">Setup</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.workspace_slug} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => setOpenSlug(a.workspace_slug)}>
                <td className="px-5 py-2.5"><div className="font-semibold text-ink">{a.display_name || a.workspace_slug}</div><div className="font-mono text-xs text-slate-400">{a.workspace_slug}</div></td>
                <td className="px-3 py-2.5"><span className={`pill ${statusColor[a.status] || 'bg-slate-100 text-slate-600'}`}>{a.status}</span></td>
                <td className="px-3 py-2.5 text-slate-600">{String(a.billing_mode || '').replace(/_/g, ' ')}</td>
                <td className="px-3 py-2.5">{a.has_authorization
                  ? <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> {a.authorization?.signer_name}</span>
                  : <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="h-3.5 w-3.5" /> Not signed</span>}</td>
                <td className="px-3 py-2.5">{a.card_on_file
                  ? <span className="inline-flex items-center gap-1 text-ink"><CreditCard className="h-3.5 w-3.5 text-slate-400" /> {a.card_on_file}</span>
                  : <span className="text-slate-400">None</span>}</td>
                <td className="px-3 py-2.5 text-right"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={(e) => { e.stopPropagation(); setOpenSlug(a.workspace_slug); }}>Open →</button></td>
              </tr>
            ))}
            {accounts.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">No accounts yet — create your first one.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {creating && <NewAccountModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
      {openSlug && <AccountDrawer slug={openSlug} onClose={() => { setOpenSlug(null); load(); }} />}
    </div>
  );
}

// ---------------- New account ----------------
function NewAccountModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ workspace_slug: '', display_name: '', billing_mode: 'full_retail', default_multiplier: '1.0' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    setErr(''); setBusy(true);
    try { await onboarding.createAccount({ ...form, default_multiplier: Number(form.default_multiplier) }); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="New account" onClose={onClose}>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      <Field label="Workspace slug (unique id)"><input className="input" value={form.workspace_slug} placeholder="acme_realty" onChange={(e) => setForm({ ...form, workspace_slug: e.target.value })} /></Field>
      <Field label="Display name"><input className="input" value={form.display_name} placeholder="Acme Realty" onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Billing mode"><select className="input" value={form.billing_mode} onChange={(e) => setForm({ ...form, billing_mode: e.target.value })}>
          <option value="full_retail">Full retail</option><option value="margin_split">Margin split</option><option value="live_metered">Live metered</option></select></Field>
        <Field label="Multiplier"><input className="input" type="number" step="0.1" min="1" max="10" value={form.default_multiplier} onChange={(e) => setForm({ ...form, default_multiplier: e.target.value })} /></Field>
      </div>
      <button className="btn-primary w-full" disabled={busy || !form.workspace_slug} onClick={submit}>{busy ? 'Creating…' : 'Create account'}</button>
    </Modal>
  );
}

// ---------------- Account drawer (the onboarding checklist) ----------------
function AccountDrawer({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  const [modal, setModal] = useState<null | 'consent' | 'manual' | 'link'>(null);
  const [reveal, setReveal] = useState<any>(null);
  const load = () => onboarding.account(slug).then(setD);
  useEffect(() => { load(); }, [slug]);

  const doReveal = async (vaultId: string) => {
    try { const r = await onboarding.revealCard(vaultId); setReveal({ ...r, vault_id: vaultId }); } catch (e: any) { alert(e.message); }
  };
  const syncCard = async () => { try { const r = await onboarding.syncStripeCard(slug); alert(r.found ? `Pulled ${r.brand} ····${r.last4} from Stripe.` : 'No saved card found yet.'); load(); } catch (e: any) { alert(e.message); } };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {!d ? <Spinner /> : (
          <>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-brand" /><h2 className="text-xl font-extrabold text-ink">{d.workspace?.display_name || slug}</h2></div>
                <div className="font-mono text-xs text-slate-400">{slug} · {String(d.workspace?.billing_mode || '').replace(/_/g, ' ')} · {Number(d.workspace?.default_multiplier || 1).toFixed(2)}×</div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>
            </div>

            {/* Step 1 — Authorization */}
            <Step n={1} title="Card authorization" done={!!d.authorization} icon={<FileSignature className="h-4 w-4" />}>
              {d.authorization
                ? <div className="text-sm text-slate-600">Signed by <b className="text-ink">{d.authorization.signer_name}</b> on {new Date(d.authorization.signed_at).toLocaleString()} · IP {d.authorization.signed_ip || '—'}.
                    <button className="btn-ghost ml-2 !py-1 text-xs" onClick={() => window.print()}>Print authorization</button></div>
                : <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-500">No signed authorization on file yet.</span>
                    <button className="btn-primary" onClick={() => setModal('consent')}><FileSignature className="h-4 w-4" /> Capture consent</button></div>}
            </Step>

            {/* Step 2 — Card capture */}
            <Step n={2} title="Card on file" done={(d.payment_methods || []).length > 0} icon={<CreditCard className="h-4 w-4" />}>
              <div className="mb-3 flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => setModal('link')}><Link2 className="h-4 w-4" /> Stripe setup link</button>
                <button className="btn-ghost" onClick={syncCard}><RefreshCw className="h-4 w-4" /> Sync saved card</button>
                <button className="btn-ghost" onClick={() => setModal('manual')}><CreditCard className="h-4 w-4" /> Enter card manually</button>
              </div>
              {(d.payment_methods || []).length === 0 ? <div className="text-sm text-slate-400">No card yet.</div> : (
                <div className="space-y-2">
                  {d.payment_methods.map((pm: any) => (
                    <div key={pm.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-2"><CreditCard className="h-4 w-4 text-slate-400" /> <b className="text-ink">{pm.brand}</b> ····{pm.last4} · exp {String(pm.exp_month).padStart(2, '0')}/{pm.exp_year}</span>
                      <span className="pill bg-slate-100 text-slate-500">{pm.added_via === 'self_serve' ? 'customer' : 'admin'}</span>
                    </div>
                  ))}
                </div>
              )}
            </Step>

            {/* Step 3 — Key into Retell */}
            <Step n={3} title="Key card into Retell" done={(d.vault || []).some((v: any) => v.keyed_into_retell_at)} icon={<KeyRound className="h-4 w-4" />}>
              {(d.vault || []).length === 0 ? <div className="text-sm text-slate-400">Enter a card manually (Step 2) to make it available for keying into Retell.</div> : (
                <div className="space-y-2">
                  {d.vault.map((v: any) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                      <span>card · exp {String(v.exp_month).padStart(2, '0')}/{v.exp_year} · {v.has_cvv ? <span className="text-emerald-700">CVV on file</span> : <span className="text-slate-400">no CVV</span>}{v.keyed_into_retell_at && <span className="ml-1 text-emerald-700">· keyed ✓</span>}</span>
                      <button className="btn-ghost !py-1 text-xs" onClick={() => doReveal(v.id)}><Eye className="h-3.5 w-3.5" /> Reveal to key</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 text-xs text-slate-400">Retell has no API to add a card, so the full card is revealed for your team to key in. It stays on file under the customer's signed authorization.</div>
            </Step>
          </>
        )}
      </div>

      {modal === 'consent' && <ConsentModal slug={slug} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'manual' && <ManualCardModal slug={slug} authId={d?.authorization?.id} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'link' && <SetupLinkModal slug={slug} email={d?.authorization?.account_email} onClose={() => setModal(null)} />}
      {reveal && <RevealModal data={reveal} onClose={() => setReveal(null)} onKeyed={async () => { await onboarding.markKeyed(reveal.vault_id); setReveal(null); load(); }} />}
    </div>
  );
}

function Step({ n, title, done, icon, children }: any) {
  return (
    <div className="mb-4 rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{done ? <Check className="h-3.5 w-3.5" /> : n}</span>
        <span className="inline-flex items-center gap-1.5 font-bold text-ink">{icon} {title}</span>
      </div>
      {children}
    </div>
  );
}

// ---------------- Consent capture ----------------
function ConsentModal({ slug, onClose, onDone }: any) {
  const text = AUTHORIZATION_TEXT(COMPANY);
  const [signer, setSigner] = useState(''); const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const sigRef = useRef<any>(null);
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await onboarding.saveAuthorization({
        workspace_slug: slug, account_email: email || null, signer_name: signer,
        authorization_text_version: AUTHORIZATION_VERSION, authorization_text_snapshot: text,
        signature_image: sigRef.current?.toDataURL() || null,
      });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Card authorization" onClose={onClose} wide>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-line bg-surface p-3 text-sm text-slate-700">{text}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Signer legal name"><input className="input" value={signer} onChange={(e) => setSigner(e.target.value)} /></Field>
        <Field label="Account email (optional)"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      </div>
      <div className="mb-2"><label className="label mb-1 block">Signature</label><SignaturePad ref={sigRef} /></div>
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 accent-[#1f6feb]" /> The signer agrees to the authorization above.</label>
      <button className="btn-primary w-full" disabled={busy || !signer || !agree} onClick={submit}>{busy ? 'Saving…' : 'Save authorization'}</button>
    </Modal>
  );
}

// ---------------- Manual card entry ----------------
function ManualCardModal({ slug, authId, onClose, onDone }: any) {
  const [f, setF] = useState({ cardholder_name: '', card_number: '', exp_month: '', exp_year: '', cvv: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    setErr(''); setBusy(true);
    try { await onboarding.saveCardManual({ workspace_slug: slug, authorization_id: authId, ...f, exp_month: Number(f.exp_month), exp_year: Number(f.exp_year) }); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Enter card" onClose={onClose}>
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Stored encrypted and kept on file under the customer's signed authorization — used to key the card into Retell and for recurring billing.</div>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      <Field label="Cardholder name"><input className="input" value={f.cardholder_name} onChange={(e) => setF({ ...f, cardholder_name: e.target.value })} /></Field>
      <Field label="Card number"><input className="input font-mono" inputMode="numeric" value={f.card_number} onChange={(e) => setF({ ...f, card_number: e.target.value })} /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Exp month"><input className="input" inputMode="numeric" placeholder="MM" value={f.exp_month} onChange={(e) => setF({ ...f, exp_month: e.target.value })} /></Field>
        <Field label="Exp year"><input className="input" inputMode="numeric" placeholder="YYYY" value={f.exp_year} onChange={(e) => setF({ ...f, exp_year: e.target.value })} /></Field>
        <Field label="CVV"><input className="input font-mono" inputMode="numeric" value={f.cvv} onChange={(e) => setF({ ...f, cvv: e.target.value })} /></Field>
      </div>
      <button className="btn-primary w-full" disabled={busy || f.card_number.replace(/\s/g, '').length < 12} onClick={submit}>{busy ? 'Saving…' : 'Save card securely'}</button>
    </Modal>
  );
}

// ---------------- Stripe setup link ----------------
function SetupLinkModal({ slug, email, onClose }: any) {
  const [url, setUrl] = useState(''); const [busy, setBusy] = useState(true); const [err, setErr] = useState(''); const [copied, setCopied] = useState(false);
  useEffect(() => { onboarding.setupLink({ workspace_slug: slug, email }).then((r) => setUrl(r.url)).catch((e) => setErr(e.message)).finally(() => setBusy(false)); }, [slug]);
  return (
    <Modal title="Stripe card link" onClose={onClose} wide>
      {busy ? <Spinner /> : err ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div> : (
        <>
          <p className="mb-3 text-sm text-slate-600">Share this secure Stripe link with the customer, or open it to enter the card on their behalf. The card is stored in Stripe — 1PropertyMarket never sees the number.</p>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
            <input readOnly value={url} className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none" />
            <button className="rounded p-1.5 text-slate-400 hover:text-brand" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
          </div>
          <a href={url} target="_blank" rel="noreferrer" className="btn-primary mt-4 w-full justify-center"><Link2 className="h-4 w-4" /> Open Stripe link</a>
        </>
      )}
    </Modal>
  );
}

// ---------------- Full-card reveal ----------------
function RevealModal({ data, onClose, onKeyed }: any) {
  const [copied, setCopied] = useState('');
  const copy = (k: string, v: string) => { navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1200); };
  const grouped = String(data.card_number || '').replace(/(.{4})/g, '$1 ').trim();
  return (
    <Modal title="Key this card into Retell" onClose={onClose} wide>
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Eye className="mt-0.5 h-4 w-4 shrink-0" /> Full card shown for keying into Retell. This reveal is audited.</div>
      <RevealRow label="Card number" value={grouped} copyVal={String(data.card_number)} copied={copied === 'n'} onCopy={() => copy('n', String(data.card_number))} />
      <div className="grid grid-cols-2 gap-2">
        <RevealRow label="Expiry" value={`${String(data.exp_month).padStart(2, '0')}/${data.exp_year}`} copyVal={`${String(data.exp_month).padStart(2, '0')}/${data.exp_year}`} copied={copied === 'e'} onCopy={() => copy('e', `${data.exp_month}/${data.exp_year}`)} />
        <RevealRow label="CVV" value={data.cvv_available ? data.cvv : 'none'} copyVal={data.cvv || ''} copied={copied === 'c'} onCopy={() => data.cvv && copy('c', data.cvv)} />
      </div>
      <button className="btn-primary mt-4 w-full" onClick={onKeyed}><Check className="h-4 w-4" /> I've keyed it into Retell</button>
    </Modal>
  );
}
function RevealRow({ label, value, copyVal, copied, onCopy }: any) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2">
      <div className="min-w-0 flex-1"><div className="label">{label}</div><div className="truncate font-mono text-base text-ink">{value}</div></div>
      {copyVal ? <button className="rounded p-1.5 text-slate-400 hover:text-brand" onClick={onCopy}>{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button> : null}
    </div>
  );
}

// ---------------- Signature pad ----------------
import { forwardRef, useImperativeHandle } from 'react';
const SignaturePad = forwardRef((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  useImperativeHandle(ref, () => ({
    toDataURL: () => canvasRef.current?.toDataURL('image/png') || '',
    clear: () => { const c = canvasRef.current; if (c) { const ctx = c.getContext('2d'); ctx?.clearRect(0, 0, c.width, c.height); } },
  }));
  const pos = (e: any) => { const c = canvasRef.current!; const r = c.getBoundingClientRect(); const t = e.touches?.[0]; return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top }; };
  const start = (e: any) => { drawing.current = true; const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: any) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke(); };
  const end = () => { drawing.current = false; };
  return (
    <div>
      <canvas ref={canvasRef} width={460} height={120} className="w-full rounded-lg border border-line bg-white touch-none"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <button type="button" className="mt-1 text-xs text-slate-400 hover:text-brand" onClick={() => { const c = canvasRef.current; if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height); }}>Clear signature</button>
    </div>
  );
});

// ---------------- shared modal bits ----------------
function Modal({ title, children, onClose, wide }: { title: string; children: any; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-4" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-lg' : 'max-w-sm'} max-h-[90vh] overflow-y-auto p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-ink">{title}</h3><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: any }) {
  return <div className="mb-3"><label className="label mb-1 block">{label}</label>{children}</div>;
}
