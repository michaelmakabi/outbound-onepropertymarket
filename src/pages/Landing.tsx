import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LOGO_FULL } from '../lib/logo';
import { demo } from '../lib/api';
import {
  ArrowRight, Bot, Upload, BarChart3, Phone, ListChecks, FileText, Users,
  ShieldCheck, CreditCard, Sparkles, CheckCircle2, Headphones, Building2, Zap,
  Play, Pause, PhoneCall, TrendingUp, ChevronRight, Loader2, PhoneOutgoing,
  Volume2, VolumeX, Maximize, Gauge,
} from 'lucide-react';

// Wide, near-full-bleed container used across the marketing site (minimal side gutters).
const WRAP = 'mx-auto w-full max-w-[1900px] px-6 sm:px-10';

// Narrated product walkthrough (hosted on Supabase Storage). Locked player — no download.
const MEDIA_BASE = (import.meta as any).env?.VITE_MEDIA_BASE || 'https://sehrlbmatklgghrvyxes.supabase.co/storage/v1/object/public/media';
const WALKTHROUGH_SRC = `${MEDIA_BASE}/walkthrough.mp4`;
const WALKTHROUGH_POSTER = `${MEDIA_BASE}/walkthrough-poster.jpg`;
const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

/* ============================ little hooks ============================ */
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.reveal'));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } }),
      { threshold: 0.1 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Counter({ to, suffix = '', prefix = '', dur = 1400 }: { to: number; suffix?: string; prefix?: string; dur?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let raf = 0; let started = false;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !started) {
        started = true;
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.round(to * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, dur]);
  return <span ref={ref}>{prefix}{n.toLocaleString()}{suffix}</span>;
}

/* ============================ shared mini-UI atoms ============================ */
const dispoColor: Record<string, string> = {
  Interested: 'bg-emerald-100 text-emerald-700', Booked: 'bg-brand-light text-brand',
  Callback: 'bg-amber-100 text-amber-700', 'Not interested': 'bg-slate-100 text-slate-500',
  'No answer': 'bg-slate-100 text-slate-400', 'Wrong number': 'bg-red-100 text-red-600',
};

function WindowChrome({ title, children, rec }: { title: string; children: React.ReactNode; rec?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-5 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400/80" />
        <span className="h-3 w-3 rounded-full bg-amber-400/80" />
        <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
        <div className="ml-2 flex items-center gap-1.5 text-sm font-medium text-slate-400">{title}</div>
        {rec && <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC</span>}
      </div>
      {children}
    </div>
  );
}

function DashboardPreview() {
  const bars = [42, 61, 38, 74, 55, 88, 69, 92, 64, 80, 58, 96];
  const rows = [
    { n: 'Marcus Reyes', ph: '(214) 555-0182', d: 'Booked' },
    { n: 'Priya Nair', ph: '(469) 555-0147', d: 'Interested' },
    { n: 'Dana Whitfield', ph: '(972) 555-0110', d: 'Callback' },
    { n: 'Owner · (817) 555-0139', ph: '(817) 555-0139', d: 'No answer' },
  ];
  return (
    <WindowChrome title="1PropertyMarket Outbound — live" rec>
      <div className="bg-surface p-5">
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[{ l: 'Calls today', v: 1284, i: <PhoneCall className="h-4 w-4" /> }, { l: 'Connected', v: 63, s: '%', i: <TrendingUp className="h-4 w-4" /> }, { l: 'Booked', v: 47, i: <CheckCircle2 className="h-4 w-4" /> }].map((s) => (
            <div key={s.l} className="flex flex-col rounded-xl border border-line bg-white p-3 sm:p-4">
              <div className="flex items-start gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-400 sm:text-xs">
                <span className="mt-px shrink-0">{s.i}</span><span className="min-w-0">{s.l}</span>
              </div>
              <div className="mt-auto pt-2 text-2xl font-extrabold leading-none tracking-tight text-ink tabular-nums sm:text-3xl"><Counter to={s.v} suffix={s.s || ''} /></div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="rounded-xl border border-line bg-white p-4 lg:col-span-2">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Calls / hour</div>
            <div className="flex h-32 items-end gap-2">
              {bars.map((b, i) => <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-brand/50 to-brand" style={{ height: `${b}%` }} />)}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-white p-4 lg:col-span-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400"><span>Live calls</span><span className="text-brand">auto-dispositioned</span></div>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.n} className="flex items-center gap-2.5 rounded-lg border border-line/70 px-3 py-2">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-light text-xs font-bold text-brand">{r.n.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{r.n}</div>
                    <div className="truncate text-xs text-slate-400">{r.ph}</div>
                  </div>
                  <span className={`pill ${dispoColor[r.d]}`}>{r.d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

/* ============================ Loom-style product tour ============================ */
type Scene = { tag: string; caption: string; render: () => React.ReactNode };

function TourRecords() {
  const rows = ['Marcus Reyes', 'Priya Nair', 'Dana Whitfield', 'Alicia Gomez', 'Owner · (817) 555-0139'];
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {[{ l: 'Records', v: '2,367' }, { l: 'Dialable numbers', v: '4,102' }, { l: 'In a pipeline', v: '2,367' }, { l: 'Verified', v: '1,880' }].map((s) => (
        <div key={s.l} className="rounded-xl border border-line bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{s.l}</div>
          <div className="mt-1 text-3xl font-extrabold text-brand">{s.v}</div>
        </div>
      ))}
      <div className="md:col-span-4 rounded-xl border border-line bg-white p-2">
        {rows.map((r, i) => (
          <div key={r} className={`flex items-center gap-3 rounded-lg px-4 py-3 ${i % 2 ? 'bg-surface/60' : ''}`}>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-light text-sm font-bold text-brand">{r.slice(0, 1)}</div>
            <div className="flex-1 text-base font-semibold text-ink">{r}</div>
            <span className="pill bg-brand-light text-brand">Call Outcomes</span>
            <ChevronRight className="h-5 w-5 text-slate-300" />
          </div>
        ))}
      </div>
    </div>
  );
}
function TourCall() {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="rounded-xl border border-line bg-white p-4 md:col-span-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Disposition</div>
        <span className="mt-1 inline-flex pill bg-emerald-100 text-emerald-700">Interested</span>
        <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Summary</div>
        <p className="mt-1 text-sm text-slate-600">Seller open to a cash offer, wants a callback Thursday after 4pm. Property vacant, motivated.</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
          <Play className="h-4 w-4 text-brand" />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full w-2/3 bg-brand" /></div>
          <span className="text-xs text-slate-400">2:14</span>
        </div>
      </div>
      <div className="rounded-xl border border-line bg-white p-4 md:col-span-3">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Transcript</div>
        <div className="space-y-2 text-sm">
          {[['AI', 'Hi, is this the owner at 214 Elm? I had a quick question about the property.'], ['Seller', 'Yeah, who is this?'], ['AI', 'I help buyers make cash offers — would you take a fair one if the timing worked?'], ['Seller', 'Maybe. Call me Thursday afternoon.']].map(([who, t], i) => (
            <div key={i} className={`rounded-lg px-3 py-2 ${who === 'AI' ? 'bg-brand-light/60 text-ink' : 'bg-surface text-slate-600'}`}><span className="font-bold">{who}: </span>{t}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
function TourDispositions() {
  const items = ['Interested', 'Booked', 'Callback', 'Not interested', 'No answer', 'Wrong number'];
  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {items.map((d) => <span key={d} className={`pill !text-sm !px-3 !py-1 ${dispoColor[d]}`}>{d}</span>)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[['Interested', 34], ['Callback', 21], ['Booked', 12]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-center justify-between text-sm font-semibold text-ink"><span>{l}</span><span className="text-brand">{v}</span></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${(v as number) * 2.4}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
function TourPipeline() {
  const cols = [['New', ['Marcus R.', 'Priya N.', 'Alicia G.']], ['Contacted', ['Dana W.', 'Owner ·0139']], ['Interested', ['Jorge M.']], ['Booked', ['Sara L.']]] as const;
  return (
    <div className="grid grid-cols-4 gap-3">
      {cols.map(([name, cards]) => (
        <div key={name} className="rounded-xl border border-line bg-white p-3">
          <div className="mb-2 flex items-center justify-between px-1 text-sm font-bold text-ink">{name}<span className="text-slate-400">{cards.length}</span></div>
          <div className="space-y-2">
            {cards.map((c) => <div key={c} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-slate-600">{c}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
}
function TourResults() {
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      {[{ l: 'Dials', v: 1284 }, { l: 'Conversations', v: 372 }, { l: 'Interested', v: 118 }, { l: 'Booked', v: 47 }].map((s) => (
        <div key={s.l} className="rounded-xl border border-line bg-white p-5 text-center">
          <div className="text-4xl font-extrabold text-brand"><Counter to={s.v} /></div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

const SCENES: Scene[] = [
  { tag: 'Your leads', caption: 'Every lead lands in your own workspace — organized, de-duplicated, ready to call.', render: () => <TourRecords /> },
  { tag: 'Real conversations', caption: 'AI agents hold natural two-way calls — recorded, transcribed, and summarized.', render: () => <TourCall /> },
  { tag: 'Auto-dispositions', caption: 'Every call is sorted for you: interested, callback, booked, wrong number — automatically.', render: () => <TourDispositions /> },
  { tag: 'Pipelines', caption: 'Leads move through your pipeline as outcomes happen. Drag, or let dispositions move them.', render: () => <TourPipeline /> },
  { tag: 'Results', caption: 'One clean dashboard shows exactly what happened — and what to do next.', render: () => <TourResults /> },
];

function ProductTour() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [prog, setProg] = useState(0);
  const DURATION = 6000;
  useEffect(() => {
    if (!playing) return;
    setProg(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / DURATION);
      setProg(p);
      if (p >= 1) setI((v) => (v + 1) % SCENES.length);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, playing]);
  const s = SCENES[i];
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-ink shadow-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-5 py-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC</span>
        <img src={LOGO_FULL} alt="" className="h-7 w-7 rounded-md object-contain" />
        <div className="text-sm font-medium text-slate-300">Product walkthrough · <span className="text-slate-500">{s.tag}</span></div>
        <button onClick={() => setPlaying((p) => !p)} className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>
      <div className="relative bg-surface p-5 sm:p-8">
        <div key={i} className="animate-rise">{s.render()}</div>
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-white/90 p-4 text-base text-slate-700 shadow-sm backdrop-blur">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand" /> {s.caption}
        </div>
        <div className="pointer-events-none absolute bottom-4 right-6 text-sm font-bold text-slate-400/70">outbound.1propertymarket.com</div>
      </div>
      <div className="flex items-center gap-2 border-t border-white/10 bg-white/5 px-5 py-2.5">
        {SCENES.map((_, k) => (
          <button key={k} onClick={() => { setI(k); setPlaying(true); }} className="group flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-brand transition-[width] duration-75" style={{ width: k < i ? '100%' : k === i ? `${prog * 100}%` : '0%' }} />
            </div>
          </button>
        ))}
        <span className="ml-1 tabular-nums text-xs text-slate-500">{i + 1}/{SCENES.length}</span>
      </div>
    </div>
  );
}

/* ============================ live "talk to our AI" demo ============================ */
const DEMO_AGENTS = [
  { key: 'real_estate_cold', label: 'Real estate cold caller', blurb: 'Prospects sellers & buyers, qualifies motivation.' },
  { key: 'negotiator', label: 'Deal negotiator', blurb: 'Works price & terms using a proven framework.' },
  { key: 'dispatch', label: 'Dispatch AI', blurb: 'Handles service calls — intake, triage, scheduling.' },
  { key: 'b2b_seller', label: 'B2B outbound seller', blurb: 'Pitches your offer to businesses and books meetings.' },
  { key: 'concierge', label: 'Concierge — sell me on this', blurb: 'Walks you through the service, pricing & books your follow-up.' },
];

function TalkToAI() {
  const [useCase, setUseCase] = useState('real_estate_cold');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const active = DEMO_AGENTS.find((a) => a.key === useCase)!;
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const canCall = name.trim().length >= 2 && emailOk && phoneOk && consent && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (name.trim().length < 2) { setErr('Please enter your name.'); return; }
    if (!emailOk) { setErr('Please enter a valid email address.'); return; }
    if (!phoneOk) { setErr('Please enter a valid mobile number.'); return; }
    if (!consent) { setErr('Please check the box so we can call you.'); return; }
    setBusy(true);
    try {
      const r: any = await demo.call({ use_case: useCase, name: name.trim(), phone, email: email.trim(), consent });
      setMsg(r.message || 'Calling you now — your phone should ring within a few seconds.');
    } catch (e: any) { setErr(e?.message || 'Could not start the call. Please try again.'); } finally { setBusy(false); }
  };

  return (
    <section id="talk" className="relative overflow-hidden bg-ink text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-aurora absolute -left-24 top-0 h-[32rem] w-[32rem] rounded-full bg-brand/35 blur-[130px]" />
        <div className="animate-aurora-2 absolute -right-24 bottom-0 h-[32rem] w-[32rem] rounded-full bg-[#8f6bff]/30 blur-[130px]" />
      </div>
      <div className={`${WRAP} relative py-20 md:py-28`}>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="reveal">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-bold text-white/90 backdrop-blur"><PhoneOutgoing className="h-4 w-4 text-brand" /> Live demo — no signup</span>
            <h2 className="mt-5 text-4xl font-extrabold tracking-tight md:text-6xl">Talk to our AI <span className="text-gradient">right now.</span></h2>
            <p className="mt-5 max-w-[560px] text-lg text-slate-300 md:text-xl">Pick a sample agent, enter your number, and our AI will call <span className="font-semibold text-white">you</span> in seconds. Have a real two-way conversation — the same voice tech we run for our customers.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {DEMO_AGENTS.map((a) => (
                <button key={a.key} type="button" onClick={() => setUseCase(a.key)}
                  className={`rounded-2xl border p-4 text-left transition ${useCase === a.key ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                  <div className="flex items-center gap-2 font-bold">{useCase === a.key ? <CheckCircle2 className="h-4 w-4 text-brand" /> : <Bot className="h-4 w-4 text-slate-400" />} {a.label}</div>
                  <div className="mt-1 text-sm text-slate-400">{a.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="reveal reveal-2 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
            {msg ? (
              <div className="py-8 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-emerald-400"><PhoneCall className="h-8 w-8" /></div>
                <h3 className="mt-5 text-2xl font-bold">Your phone is ringing</h3>
                <p className="mt-2 text-slate-300">{msg}</p>
                <p className="mt-4 text-sm text-slate-400">Talking to <span className="font-semibold text-white">{active.label}</span>. Didn't get it? Check for calls from an unknown number.</p>
                <button className="btn-ghost mt-6 border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => { setMsg(''); setConsent(false); }}>Try another agent</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h3 className="text-2xl font-bold">Get a call from <span className="text-brand">{active.label}</span></h3>
                <p className="mt-1 text-sm text-slate-400">We'll call the number you enter. It's free.</p>
                {err && <div className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm font-medium text-red-300">{err}</div>}
                <label className="mt-5 block text-sm font-semibold text-slate-200">Which AI?
                  <select className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink/60 px-3 py-2.5 text-white outline-none focus:border-brand" value={useCase} onChange={(e) => setUseCase(e.target.value)}>
                    {DEMO_AGENTS.map((a) => <option key={a.key} value={a.key} className="bg-ink">{a.label}</option>)}
                  </select>
                </label>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-200">Your name
                    <input className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink/60 px-3 py-2.5 text-white placeholder:text-slate-500 outline-none focus:border-brand" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" required />
                  </label>
                  <label className="block text-sm font-semibold text-slate-200">Your mobile
                    <input className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink/60 px-3 py-2.5 text-white placeholder:text-slate-500 outline-none focus:border-brand" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" inputMode="tel" required />
                  </label>
                </div>
                <label className="mt-4 block text-sm font-semibold text-slate-200">Work email
                  <input className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink/60 px-3 py-2.5 text-white placeholder:text-slate-500 outline-none focus:border-brand" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
                </label>
                <label className="mt-4 flex items-start gap-2.5 text-sm text-slate-300">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1f6feb]" />
                  <span>I agree to receive a one-time automated demo call at the number I entered. This is my own number.</span>
                </label>
                <button className="btn-primary btn-glow mt-6 w-full !py-3.5 text-lg disabled:cursor-not-allowed disabled:opacity-50" disabled={!canCall}>
                  {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Starting your call…</> : <><PhoneOutgoing className="h-5 w-5" /> Call me now</>}
                </button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> One demo call per number. We never share your info.</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================ locked walkthrough video player ============================ */
function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function WalkthroughVideo() {
  const vref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [started, setStarted] = useState(false);

  const toggle = () => {
    const v = vref.current; if (!v) return;
    if (v.paused) { v.play(); setStarted(true); } else v.pause();
  };
  const onTime = () => { const v = vref.current; if (v) setCur(v.currentTime); };
  const onLoaded = () => { const v = vref.current; if (v) setDur(v.duration || 0); };
  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = vref.current; if (!v) return;
    v.currentTime = (Number(e.target.value) / 1000) * (v.duration || 0);
    setCur(v.currentTime);
  };
  const setSpeed = (r: number) => { const v = vref.current; if (v) v.playbackRate = r; setRate(r); setSpeedOpen(false); };
  const toggleMute = () => { const v = vref.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); };
  const fullscreen = () => { const v = vref.current as any; if (!v) return; (v.requestFullscreen || v.webkitEnterFullscreen)?.call(v); };
  const pct = dur ? (cur / dur) * 1000 : 0;

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-ink shadow-2xl">
      {/* top chrome */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-5 py-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC</span>
        <img src={LOGO_FULL} alt="" className="h-7 w-7 rounded-md object-contain" />
        <div className="text-sm font-medium text-slate-300">Product walkthrough · <span className="text-slate-500">90-second tour</span></div>
      </div>

      <div className="relative bg-black">
        <video
          ref={vref}
          src={WALKTHROUGH_SRC}
          poster={WALKTHROUGH_POSTER}
          className="block w-full cursor-pointer select-none"
          playsInline
          preload="metadata"
          controlsList="nodownload noremoteplayback noplaybackrate"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={onTime}
          onLoadedMetadata={onLoaded}
          onEnded={() => setPlaying(false)}
        />

        {/* big center play button (before start / when paused) */}
        {!playing && (
          <button type="button" onClick={toggle} aria-label="Play walkthrough"
            className="absolute inset-0 grid place-items-center bg-black/25 transition hover:bg-black/15">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-white/95 text-ink shadow-2xl transition group-hover:scale-105">
              <Play className="ml-1 h-9 w-9" />
            </span>
            {!started && <span className="absolute bottom-6 rounded-full bg-black/50 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur">Watch the 90-second walkthrough</span>}
          </button>
        )}

        {/* control bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8 text-white">
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="shrink-0 rounded-full p-1.5 hover:bg-white/15">
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <span className="shrink-0 tabular-nums text-xs text-slate-200">{fmtTime(cur)} / {fmtTime(dur)}</span>
          <input type="range" min={0} max={1000} value={pct} onChange={seek} aria-label="Seek"
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/25 accent-[#1f6feb]" />
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="shrink-0 rounded-full p-1.5 hover:bg-white/15">
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          {/* speed */}
          <div className="relative shrink-0">
            <button type="button" onClick={() => setSpeedOpen((o) => !o)} aria-label="Playback speed"
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-bold hover:bg-white/15">
              <Gauge className="h-4 w-4" /> {rate}×
            </button>
            {speedOpen && (
              <div className="absolute bottom-10 right-0 overflow-hidden rounded-xl border border-white/10 bg-ink/95 shadow-2xl backdrop-blur">
                {SPEEDS.map((r) => (
                  <button key={r} type="button" onClick={() => setSpeed(r)}
                    className={`block w-full px-4 py-2 text-left text-sm hover:bg-white/10 ${r === rate ? 'font-bold text-brand' : 'text-slate-200'}`}>
                    {r}×{r === 1 ? ' (normal)' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={fullscreen} aria-label="Fullscreen" className="shrink-0 rounded-full p-1.5 hover:bg-white/15">
            <Maximize className="h-5 w-5" />
          </button>
        </div>
        <div className="pointer-events-none absolute right-4 top-3 text-xs font-bold text-white/70">outbound.1propertymarket.com</div>
      </div>
    </div>
  );
}

/* ============================ page ============================ */
export default function Landing() {
  useReveal();
  const tiltRef = useRef<HTMLDivElement>(null);
  const onTilt = (e: React.MouseEvent) => {
    const el = tiltRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateZ(0)`;
  };
  const resetTilt = () => { if (tiltRef.current) tiltRef.current.style.transform = 'rotateX(0) rotateY(0)'; };

  return (
    <div className="min-h-screen overflow-x-clip bg-white text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/80 backdrop-blur-xl">
        <div className={`${WRAP} flex items-center justify-between gap-2 py-4`}>
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src={LOGO_FULL} alt="1PropertyMarket" className="h-8 w-auto shrink-0 object-contain sm:h-10" />
            <span className="truncate text-base font-extrabold tracking-tight sm:text-xl"><span className="hidden sm:inline">1PropertyMarket </span><span className="text-brand">Outbound</span></span>
          </Link>
          <nav className="hidden items-center gap-9 text-base font-semibold text-slate-500 lg:flex">
            <a href="#talk" className="text-brand hover:text-brand-dark">Talk to our AI</a>
            <a href="#tour" className="hover:text-ink">See it work</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#who" className="hover:text-ink">Who it's for</a>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link to="/login" className="btn-ghost hidden !py-2 !px-4 text-base sm:inline-flex">Sign in</Link>
            <Link to="/register" className="btn-primary btn-glow !py-2 !px-3 text-sm sm:!px-5 sm:text-base">Start free <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" /></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden bg-ink text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-aurora absolute -left-20 -top-24 h-[34rem] w-[34rem] rounded-full bg-brand/40 blur-[120px]" />
          <div className="animate-aurora-2 absolute right-0 top-10 h-[34rem] w-[34rem] rounded-full bg-[#8f6bff]/30 blur-[130px]" />
          <div className="animate-aurora absolute bottom-0 left-1/3 h-[30rem] w-[30rem] rounded-full bg-brand/25 blur-[130px]" />
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        </div>
        <div className={`${WRAP} relative pb-24 pt-16 md:pt-24`}>
          <div className="mx-auto max-w-[1200px] text-center">
            <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-bold text-white/90 backdrop-blur"><Sparkles className="h-4 w-4 text-brand" /> Done-for-you outbound AI voice calling</span>
            <h1 className="animate-rise mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl sm:leading-[1.02] md:text-8xl">
              Your outbound calls,<br /><span className="text-gradient">handled by AI.</span>
            </h1>
            <p className="animate-rise mx-auto mt-7 max-w-[900px] text-xl text-slate-300 md:text-2xl">
              We build and run AI voice agents that call your leads, hold real conversations, qualify them, and log every outcome — recordings, transcripts, dispositions, and pipelines — while you watch the results roll in.
            </p>
            <div className="animate-rise mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/register" className="btn-primary btn-glow w-full !px-8 !py-4 text-lg sm:w-auto">Start free <ArrowRight className="h-5 w-5" /></Link>
              <a href="#tour" className="btn w-full border border-white/20 bg-white/5 text-white hover:bg-white/10 !px-8 !py-4 text-lg sm:w-auto"><Play className="h-5 w-5" /> Watch the 90-sec walkthrough</a>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-base font-medium text-slate-400">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-5 w-5 text-emerald-400" /> No monthly fees</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-5 w-5 text-emerald-400" /> Pay as you go</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-5 w-5 text-emerald-400" /> Free to start — just verify your card</span>
            </div>
          </div>

          <div className="perspective mx-auto mt-16 max-w-[1400px]">
            <div ref={tiltRef} onMouseMove={onTilt} onMouseLeave={resetTilt} className="animate-float-slow preserve-3d transition-transform duration-300 ease-out will-change-transform">
              <DashboardPreview />
            </div>
          </div>
        </div>
        <div className="relative h-16 bg-gradient-to-b from-transparent to-white" />
      </section>

      {/* Industries marquee */}
      <section className="border-y border-line bg-white py-6">
        <div className={`${WRAP} flex items-center gap-8`}>
          <span className="hidden shrink-0 text-sm font-bold uppercase tracking-wider text-slate-400 md:block">Built for teams in</span>
          <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
            <div className="flex w-max animate-marquee gap-4">
              {[...Array(2)].flatMap((_, r) => ['Real estate & investors', 'Home services', 'Contractors', 'Auctions', 'Lead-gen agencies', 'Sales teams', 'Appointment setting', 'Solar & roofing'].map((w) => (
                <span key={`${r}-${w}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-lg font-semibold text-slate-600"><Building2 className="h-4 w-4 text-brand" /> {w}</span>
              )))}
            </div>
          </div>
        </div>
      </section>

      {/* Live "talk to our AI" demo */}
      <TalkToAI />

      {/* Product tour */}
      <section id="tour" className={`${WRAP} py-20 md:py-28`}>
        <div className="reveal mx-auto max-w-[900px] text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-light px-4 py-1.5 text-sm font-bold text-brand"><Play className="h-4 w-4" /> 90-second walkthrough</span>
          <h2 className="mt-5 text-4xl font-extrabold tracking-tight md:text-6xl">See exactly what you get</h2>
          <p className="mt-4 text-lg text-slate-600 md:text-xl">A guided tour of your workspace — leads, live AI calls, dispositions, pipelines, and results. This is the whole product, done for you.</p>
        </div>
        <div className="reveal reveal-2 mx-auto mt-12 max-w-[1200px]"><WalkthroughVideo /></div>
        <div className="mt-8 text-center">
          <Link to="/register" className="btn-primary btn-glow !px-8 !py-4 text-lg">Get this for your business <ArrowRight className="h-5 w-5" /></Link>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-surface py-20 md:py-28">
        <div className={WRAP}>
          <div className="reveal mx-auto max-w-[900px] text-center">
            <h2 className="text-4xl font-extrabold tracking-tight md:text-6xl">Three steps. We do the heavy lifting.</h2>
            <p className="mt-4 text-lg text-slate-600 md:text-xl">No bots to build, no software to wrangle. You bring the leads — we bring the calls.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              { n: '1', icon: <Bot className="h-7 w-7" />, t: 'We set it up', d: 'Tell us who you want to reach. We build, script, and fine-tune your AI callers and dialing — ready for your business.' },
              { n: '2', icon: <Upload className="h-7 w-7" />, t: 'You upload your leads', d: 'Drop in your list. Your leads land in your own private workspace, organized and ready to call.' },
              { n: '3', icon: <BarChart3 className="h-7 w-7" />, t: 'You see the results', d: 'Calls happen automatically. Recordings, transcripts, outcomes, and pipelines update in real time.' },
            ].map((s, k) => (
              <div key={s.n} className={`reveal reveal-${k + 1} relative rounded-3xl border border-line bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-xl`}>
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand">{s.icon}</div>
                <div className="absolute right-6 top-6 text-6xl font-black text-surface">{s.n}</div>
                <h3 className="text-2xl font-bold">{s.t}</h3>
                <p className="mt-2.5 text-lg text-slate-600">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className={`${WRAP} py-20`}>
        <div className="reveal grid grid-cols-2 gap-6 rounded-3xl border border-line bg-gradient-to-br from-white to-surface p-10 md:grid-cols-4">
          {[{ v: 24, s: '/7', l: 'Calling, on your schedule' }, { v: 100, s: '%', l: 'Calls recorded & transcribed' }, { v: 6, s: '+', l: 'Outcomes tracked automatically' }, { v: 0, s: '', l: 'Monthly fees', pre: '$' }].map((m) => (
            <div key={m.l} className="text-center">
              <div className="text-5xl font-extrabold text-brand md:text-6xl"><Counter to={m.v} prefix={m.pre || ''} suffix={m.s} /></div>
              <div className="mt-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">{m.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className={`${WRAP} py-20 md:py-28`}>
        <div className="reveal mx-auto max-w-[900px] text-center">
          <h2 className="text-4xl font-extrabold tracking-tight md:text-6xl">Everything runs in your own workspace</h2>
          <p className="mt-4 text-lg text-slate-600 md:text-xl">We handle the technology. You get a simple, powerful place to watch it all happen.</p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <Phone className="h-6 w-6" />, t: 'Human-sounding AI agents', d: 'Voice agents that hold natural, two-way conversations — not robocalls.' },
            { icon: <Zap className="h-6 w-6" />, t: 'Campaign & bulk dialing', d: 'Reach entire lists on your schedule, calling the right number for each lead.' },
            { icon: <Headphones className="h-6 w-6" />, t: 'Recordings & transcripts', d: 'Every conversation captured, transcribed, and searchable in one click.' },
            { icon: <ListChecks className="h-6 w-6" />, t: 'Automatic dispositions', d: 'Interested, callback, booked, wrong number — sorted for you, every call.' },
            { icon: <Users className="h-6 w-6" />, t: 'Built-in CRM & pipelines', d: 'Your leads and contacts flow through pipelines as calls happen.' },
            { icon: <FileText className="h-6 w-6" />, t: 'Results you understand', d: 'A dashboard that shows what happened and what to do next — no guesswork.' },
          ].map((f, k) => (
            <div key={f.t} className={`reveal reveal-${(k % 3) + 1} group rounded-3xl border border-line bg-white p-7 transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-xl`}>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand transition group-hover:scale-110">{f.icon}</div>
              <h3 className="text-xl font-bold">{f.t}</h3>
              <p className="mt-2 text-lg text-slate-600">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section id="who" className="bg-surface py-20 md:py-28">
        <div className={WRAP}>
          <div className="reveal mx-auto max-w-[900px] text-center">
            <h2 className="text-4xl font-extrabold tracking-tight md:text-6xl">Built for anyone who lives on the phone</h2>
            <p className="mt-4 text-lg text-slate-600 md:text-xl">If your business grows by reaching a lot of people quickly, AI calling changes the math.</p>
          </div>
          <div className="reveal mt-12 grid grid-cols-2 gap-4 md:grid-cols-3">
            {['Real estate & investors', 'Home services & contractors', 'Auctions & liquidations', 'Marketing & lead-gen agencies', 'Sales & appointment setting', 'Any high-volume outreach'].map((w) => (
              <div key={w} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-6 py-5 text-lg font-semibold transition hover:border-brand/40 hover:shadow-sm">
                <Building2 className="h-5 w-5 shrink-0 text-brand" /> {w}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Done-for-you + pay as you go band */}
      <section className="relative overflow-hidden bg-ink py-20 text-white md:py-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-aurora absolute -right-16 top-0 h-96 w-96 rounded-full bg-brand/30 blur-[120px]" />
          <div className="animate-aurora-2 absolute -left-16 bottom-0 h-96 w-96 rounded-full bg-[#8f6bff]/25 blur-[130px]" />
        </div>
        <div className={`${WRAP} relative`}>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="reveal">
              <h2 className="text-4xl font-extrabold tracking-tight md:text-6xl">We do it for you.<br />You just watch it work.</h2>
              <p className="mt-5 text-lg text-slate-300 md:text-xl">You don't build bots, write scripts, or learn new software. Our team sets everything up and keeps it running. Your job: upload your leads and read your results.</p>
              <ul className="mt-7 space-y-4 text-lg">
                {['We build and tune your AI callers', 'We connect your phone numbers and dialing', 'You upload leads and launch campaigns', 'You watch calls, outcomes, and pipelines live'].map((x) => (
                  <li key={x} className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" /> {x}</li>
                ))}
              </ul>
            </div>
            <div className="reveal reveal-2 rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur-xl">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white"><CreditCard className="h-7 w-7" /></div>
              <h3 className="mt-5 text-3xl font-bold">It costs nothing to get started</h3>
              <p className="mt-4 text-lg text-slate-300">Add a card so we can verify your account is real — that's it. From there you only pay for the calls you actually make.</p>
              <ul className="mt-6 space-y-3 text-lg text-slate-200">
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-400" /> No monthly subscription</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-400" /> No minimums, no lock-in</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-400" /> Pay only for what you use</li>
                <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-400" /> Your card is secured by Stripe</li>
              </ul>
              <Link to="/register" className="btn-primary mt-7 w-full !py-4 text-lg">Create your account <ArrowRight className="h-5 w-5" /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`${WRAP} py-20 md:py-28`}>
        <div className="mx-auto max-w-[1000px]">
          <h2 className="reveal text-center text-4xl font-extrabold tracking-tight md:text-6xl">Questions, answered</h2>
          <div className="reveal mt-12 space-y-3">
            {[
              { q: 'Do I need any technical skills?', a: 'None. This is fully done-for-you — we handle setup, scripting, and technology. You upload leads and read results.' },
              { q: 'Is there a monthly fee?', a: 'No. There is no subscription and no minimum. It is pay-as-you-go — you only pay for the calls you make.' },
              { q: 'What does it cost to get started?', a: 'Nothing. You add a card so we can verify your account is real. You are not charged to sign up.' },
              { q: 'What kind of businesses is this for?', a: 'Any business that needs to reach a lot of people by phone — real estate, contractors, auctions, agencies, sales teams, and more.' },
              { q: 'Can I hear the calls?', a: 'Yes. Every call is recorded and transcribed, with the outcome logged automatically, all inside your workspace.' },
            ].map((f) => (
              <details key={f.q} className="group rounded-2xl border border-line bg-white p-5 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold">{f.q}<span className="ml-4 text-2xl text-brand transition group-open:rotate-45">+</span></summary>
                <p className="mt-3 text-lg text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-line bg-ink text-white">
        <div className="pointer-events-none absolute inset-0"><div className="animate-aurora absolute left-1/2 top-1/2 h-96 w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/25 blur-[130px]" /></div>
        <div className={`${WRAP} relative py-24 text-center`}>
          <h2 className="mx-auto max-w-[1100px] text-5xl font-extrabold tracking-tight md:text-7xl">Ready to put your outbound <span className="text-gradient">on autopilot?</span></h2>
          <p className="mx-auto mt-5 max-w-[700px] text-xl text-slate-300">Create your account in minutes. We handle the rest.</p>
          <Link to="/register" className="btn-primary btn-glow mt-9 !px-10 !py-4 text-lg">Start free <ArrowRight className="h-5 w-5" /></Link>
          <p className="mt-5 text-base text-slate-400">Free to start · Pay as you go · No monthly fees</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-white">
        <div className={`${WRAP} flex flex-col items-center justify-between gap-4 py-8 text-base text-slate-500 sm:flex-row`}>
          <Link to="/" className="flex items-center gap-2.5">
            <img src={LOGO_FULL} alt="1PropertyMarket" className="h-8 w-auto object-contain" />
            <span className="font-semibold text-ink">1PropertyMarket Outbound</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/login" className="hover:text-ink">Sign in</Link>
            <Link to="/register" className="font-semibold text-brand hover:underline">Start free</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
