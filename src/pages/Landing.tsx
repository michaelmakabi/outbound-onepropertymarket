import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LOGO_FULL } from '../lib/logo';
import {
  ArrowRight, Bot, Upload, BarChart3, Phone, ListChecks, FileText, Users,
  ShieldCheck, CreditCard, Sparkles, CheckCircle2, Headphones, Building2, Zap,
  Play, Pause, PhoneCall, TrendingUp, ChevronRight,
} from 'lucide-react';

/* ============================ little hooks ============================ */
// Reveal-on-scroll for any element with the `reveal` class.
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.reveal'));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } }),
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Count-up number that animates the first time it scrolls into view.
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
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <div className="ml-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">{title}</div>
        {rec && <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> REC</span>}
      </div>
      {children}
    </div>
  );
}

// The glossy dashboard preview used in the hero (light UI inside a dark window).
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
      <div className="bg-surface p-4">
        <div className="grid grid-cols-3 gap-3">
          {[{ l: 'Calls today', v: 1284, i: <PhoneCall className="h-3.5 w-3.5" /> }, { l: 'Connected', v: 63, s: '%', i: <TrendingUp className="h-3.5 w-3.5" /> }, { l: 'Booked', v: 47, i: <CheckCircle2 className="h-3.5 w-3.5" /> }].map((s) => (
            <div key={s.l} className="rounded-xl border border-line bg-white p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{s.i}{s.l}</div>
              <div className="mt-1 text-xl font-extrabold text-ink"><Counter to={s.v} suffix={s.s || ''} /></div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-5">
          <div className="rounded-xl border border-line bg-white p-3 lg:col-span-2">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Calls / hour</div>
            <div className="flex h-24 items-end gap-1.5">
              {bars.map((b, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-brand/50 to-brand" style={{ height: `${b}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 lg:col-span-3">
            <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400"><span>Live calls</span><span className="text-brand">auto-dispositioned</span></div>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <div key={r.n} className="flex items-center gap-2 rounded-lg border border-line/70 px-2.5 py-1.5">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-brand-light text-[10px] font-bold text-brand">{r.n.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-ink">{r.n}</div>
                    <div className="truncate text-[10px] text-slate-400">{r.ph}</div>
                  </div>
                  <span className={`pill !text-[9px] ${dispoColor[r.d]}`}>{r.d}</span>
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
    <div className="grid gap-3 md:grid-cols-4">
      {[{ l: 'Records', v: '2,367' }, { l: 'Dialable numbers', v: '4,102' }, { l: 'In a pipeline', v: '2,367' }, { l: 'Verified', v: '1,880' }].map((s) => (
        <div key={s.l} className="rounded-xl border border-line bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{s.l}</div>
          <div className="mt-1 text-2xl font-extrabold text-brand">{s.v}</div>
        </div>
      ))}
      <div className="md:col-span-4 rounded-xl border border-line bg-white p-2">
        {rows.map((r, i) => (
          <div key={r} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${i % 2 ? 'bg-surface/60' : ''}`}>
            <div className="grid h-7 w-7 place-items-center rounded-full bg-brand-light text-[11px] font-bold text-brand">{r.slice(0, 1)}</div>
            <div className="flex-1 text-sm font-semibold text-ink">{r}</div>
            <span className="pill bg-brand-light text-brand !text-[10px]">Call Outcomes</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </div>
        ))}
      </div>
    </div>
  );
}
function TourCall() {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <div className="rounded-xl border border-line bg-white p-3 md:col-span-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Disposition</div>
        <span className="mt-1 inline-flex pill bg-emerald-100 text-emerald-700">Interested</span>
        <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Summary</div>
        <p className="mt-1 text-xs text-slate-600">Seller open to a cash offer, wants a callback Thursday after 4pm. Property vacant, motivated.</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
          <Play className="h-3.5 w-3.5 text-brand" />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full w-2/3 bg-brand" /></div>
          <span className="text-[10px] text-slate-400">2:14</span>
        </div>
      </div>
      <div className="rounded-xl border border-line bg-white p-3 md:col-span-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Transcript</div>
        <div className="space-y-1.5 text-xs">
          {[['AI', 'Hi, is this the owner at 214 Elm? I had a quick question about the property.'], ['Seller', 'Yeah, who is this?'], ['AI', 'I help buyers make cash offers — would you take a fair one if the timing worked?'], ['Seller', 'Maybe. Call me Thursday afternoon.']].map(([who, t], i) => (
            <div key={i} className={`rounded-lg px-2.5 py-1.5 ${who === 'AI' ? 'bg-brand-light/60 text-ink' : 'bg-surface text-slate-600'}`}><span className="font-bold">{who}: </span>{t}</div>
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
      <div className="flex flex-wrap gap-2">
        {items.map((d) => <span key={d} className={`pill ${dispoColor[d]}`}>{d}</span>)}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[['Interested', 34], ['Callback', 21], ['Booked', 12]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-line bg-white p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-ink"><span>{l}</span><span className="text-brand">{v}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${(v as number) * 2.4}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
function TourPipeline() {
  const cols = [['New', ['Marcus R.', 'Priya N.', 'Alicia G.']], ['Contacted', ['Dana W.', 'Owner ·0139']], ['Interested', ['Jorge M.']], ['Booked', ['Sara L.']]] as const;
  return (
    <div className="grid grid-cols-4 gap-2">
      {cols.map(([name, cards]) => (
        <div key={name} className="rounded-xl border border-line bg-white p-2">
          <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-bold text-ink">{name}<span className="text-slate-400">{cards.length}</span></div>
          <div className="space-y-1.5">
            {cards.map((c) => <div key={c} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-medium text-slate-600">{c}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
}
function TourResults() {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {[{ l: 'Dials', v: 1284 }, { l: 'Conversations', v: 372 }, { l: 'Interested', v: 118 }, { l: 'Booked', v: 47 }].map((s) => (
        <div key={s.l} className="rounded-xl border border-line bg-white p-4 text-center">
          <div className="text-3xl font-extrabold text-brand"><Counter to={s.v} /></div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.l}</div>
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
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink shadow-2xl">
      {/* Loom-style top bar */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> REC</span>
        <div className="grid h-6 w-6 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">1P</div>
        <div className="text-[11px] font-medium text-slate-300">Product walkthrough · <span className="text-slate-500">{s.tag}</span></div>
        <button onClick={() => setPlaying((p) => !p)} className="ml-auto grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      </div>
      {/* Scene */}
      <div className="relative bg-surface p-4 sm:p-6">
        <div key={i} className="animate-rise">{s.render()}</div>
        {/* caption bubble */}
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-white/90 p-3 text-sm text-slate-700 shadow-sm backdrop-blur">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> {s.caption}
        </div>
        {/* watermark */}
        <div className="pointer-events-none absolute bottom-3 right-4 text-[11px] font-bold text-slate-400/70">outbound.1propertymarket.com</div>
      </div>
      {/* scrubber */}
      <div className="flex items-center gap-2 border-t border-white/10 bg-white/5 px-4 py-2">
        {SCENES.map((_, k) => (
          <button key={k} onClick={() => { setI(k); setPlaying(true); }} className="group flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-brand transition-[width] duration-75" style={{ width: k < i ? '100%' : k === i ? `${prog * 100}%` : '0%' }} />
            </div>
          </button>
        ))}
        <span className="ml-1 tabular-nums text-[10px] text-slate-500">{i + 1}/{SCENES.length}</span>
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
    el.style.transform = `rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 10).toFixed(2)}deg) translateZ(0)`;
  };
  const resetTilt = () => { if (tiltRef.current) tiltRef.current.style.transform = 'rotateX(0) rotateY(0)'; };

  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <a href="#top" className="flex items-center gap-2.5">
            <img src={LOGO_FULL} alt="1PropertyMarket" className="h-8 w-auto object-contain" />
            <span className="text-sm font-extrabold tracking-tight">1PropertyMarket <span className="text-brand">Outbound</span></span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-500 lg:flex">
            <a href="#tour" className="hover:text-ink">See it work</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#who" className="hover:text-ink">Who it's for</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost !py-1.5 text-sm">Sign in</Link>
            <Link to="/register" className="btn-primary btn-glow !py-1.5 text-sm">Start free <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden bg-ink text-white">
        {/* aurora blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-aurora absolute -left-20 -top-24 h-96 w-96 rounded-full bg-brand/40 blur-[110px]" />
          <div className="animate-aurora-2 absolute right-0 top-10 h-96 w-96 rounded-full bg-[#8f6bff]/30 blur-[120px]" />
          <div className="animate-aurora absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-brand/25 blur-[120px]" />
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
        </div>
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-14 md:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="animate-rise inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-white/90 backdrop-blur"><Sparkles className="h-3.5 w-3.5 text-brand" /> Done-for-you outbound AI voice calling</span>
            <h1 className="animate-rise mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Your outbound calls,<br /><span className="text-gradient">handled by AI.</span>
            </h1>
            <p className="animate-rise mx-auto mt-5 max-w-2xl text-lg text-slate-300 md:text-xl">
              We build and run AI voice agents that call your leads, hold real conversations, qualify them, and log every outcome — recordings, transcripts, dispositions, and pipelines — while you watch the results roll in.
            </p>
            <div className="animate-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/register" className="btn-primary btn-glow w-full !px-6 !py-3 text-base sm:w-auto">Start free <ArrowRight className="h-5 w-5" /></Link>
              <a href="#tour" className="btn w-full border border-white/20 bg-white/5 text-white hover:bg-white/10 !px-6 !py-3 text-base sm:w-auto"><Play className="h-4 w-4" /> Watch the 90-sec walkthrough</a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-400">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> No monthly fees</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Pay as you go</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Free to start — just verify your card</span>
            </div>
          </div>

          {/* floating 3D dashboard */}
          <div className="perspective mx-auto mt-14 max-w-4xl">
            <div ref={tiltRef} onMouseMove={onTilt} onMouseLeave={resetTilt} className="animate-float-slow preserve-3d transition-transform duration-300 ease-out will-change-transform">
              <DashboardPreview />
            </div>
          </div>
        </div>
        <div className="relative h-16 bg-gradient-to-b from-transparent to-white" />
      </section>

      {/* Industries marquee */}
      <section className="border-y border-line bg-white py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5">
          <span className="hidden shrink-0 text-xs font-bold uppercase tracking-wider text-slate-400 md:block">Built for teams in</span>
          <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            <div className="flex w-max animate-marquee gap-3">
              {[...Array(2)].flatMap((_, r) => ['Real estate & investors', 'Home services', 'Contractors', 'Auctions', 'Lead-gen agencies', 'Sales teams', 'Appointment setting', 'Solar & roofing'].map((w) => (
                <span key={`${r}-${w}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-slate-600"><Building2 className="h-3.5 w-3.5 text-brand" /> {w}</span>
              )))}
            </div>
          </div>
        </div>
      </section>

      {/* Product tour */}
      <section id="tour" className="mx-auto max-w-5xl px-5 py-16 md:py-24">
        <div className="reveal mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1 text-xs font-bold text-brand"><Play className="h-3.5 w-3.5" /> 90-second walkthrough</span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">See exactly what you get</h2>
          <p className="mt-3 text-slate-600">A guided tour of your workspace — leads, live AI calls, dispositions, pipelines, and results. This is the whole product, done for you.</p>
        </div>
        <div className="reveal reveal-2 mt-10"><ProductTour /></div>
        <div className="mt-6 text-center">
          <Link to="/register" className="btn-primary btn-glow !px-6 !py-3 text-base">Get this for your business <ArrowRight className="h-5 w-5" /></Link>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-surface py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="reveal mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Three steps. We do the heavy lifting.</h2>
            <p className="mt-3 text-slate-600">No bots to build, no software to wrangle. You bring the leads — we bring the calls.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { n: '1', icon: <Bot className="h-6 w-6" />, t: 'We set it up', d: 'Tell us who you want to reach. We build, script, and fine-tune your AI callers and dialing — ready for your business.' },
              { n: '2', icon: <Upload className="h-6 w-6" />, t: 'You upload your leads', d: 'Drop in your list. Your leads land in your own private workspace, organized and ready to call.' },
              { n: '3', icon: <BarChart3 className="h-6 w-6" />, t: 'You see the results', d: 'Calls happen automatically. Recordings, transcripts, outcomes, and pipelines update in real time.' },
            ].map((s, k) => (
              <div key={s.n} className={`reveal reveal-${k + 1} relative rounded-2xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg`}>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand">{s.icon}</div>
                <div className="absolute right-5 top-5 text-5xl font-black text-surface">{s.n}</div>
                <h3 className="text-lg font-bold">{s.t}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="reveal grid grid-cols-2 gap-4 rounded-3xl border border-line bg-gradient-to-br from-white to-surface p-8 md:grid-cols-4">
          {[{ v: 24, s: '/7', l: 'Calling, on your schedule' }, { v: 100, s: '%', l: 'Calls recorded & transcribed' }, { v: 6, s: '+', l: 'Outcomes tracked automatically' }, { v: 0, s: '', l: 'Monthly fees', pre: '$' }].map((m) => (
            <div key={m.l} className="text-center">
              <div className="text-4xl font-extrabold text-brand md:text-5xl"><Counter to={m.v} prefix={m.pre || ''} suffix={m.s} /></div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{m.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="reveal mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Everything runs in your own workspace</h2>
          <p className="mt-3 text-slate-600">We handle the technology. You get a simple, powerful place to watch it all happen.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <Phone className="h-5 w-5" />, t: 'Human-sounding AI agents', d: 'Voice agents that hold natural, two-way conversations — not robocalls.' },
            { icon: <Zap className="h-5 w-5" />, t: 'Campaign & bulk dialing', d: 'Reach entire lists on your schedule, calling the right number for each lead.' },
            { icon: <Headphones className="h-5 w-5" />, t: 'Recordings & transcripts', d: 'Every conversation captured, transcribed, and searchable in one click.' },
            { icon: <ListChecks className="h-5 w-5" />, t: 'Automatic dispositions', d: 'Interested, callback, booked, wrong number — sorted for you, every call.' },
            { icon: <Users className="h-5 w-5" />, t: 'Built-in CRM & pipelines', d: 'Your leads and contacts flow through pipelines as calls happen.' },
            { icon: <FileText className="h-5 w-5" />, t: 'Results you understand', d: 'A dashboard that shows what happened and what to do next — no guesswork.' },
          ].map((f, k) => (
            <div key={f.t} className={`reveal reveal-${(k % 3) + 1} group rounded-2xl border border-line bg-white p-5 transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-xl`}>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand transition group-hover:scale-110">{f.icon}</div>
              <h3 className="font-bold">{f.t}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section id="who" className="bg-surface py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="reveal mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Built for anyone who lives on the phone</h2>
            <p className="mt-3 text-slate-600">If your business grows by reaching a lot of people quickly, AI calling changes the math.</p>
          </div>
          <div className="reveal mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
            {['Real estate & investors', 'Home services & contractors', 'Auctions & liquidations', 'Marketing & lead-gen agencies', 'Sales & appointment setting', 'Any high-volume outreach'].map((w) => (
              <div key={w} className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold transition hover:border-brand/40 hover:shadow-sm">
                <Building2 className="h-4 w-4 shrink-0 text-brand" /> {w}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Done-for-you + pay as you go band */}
      <section className="relative overflow-hidden bg-ink py-16 text-white md:py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-aurora absolute -right-16 top-0 h-80 w-80 rounded-full bg-brand/30 blur-[110px]" />
          <div className="animate-aurora-2 absolute -left-16 bottom-0 h-80 w-80 rounded-full bg-[#8f6bff]/25 blur-[120px]" />
        </div>
        <div className="relative mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="reveal">
              <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">We do it for you.<br />You just watch it work.</h2>
              <p className="mt-4 text-slate-300">You don't build bots, write scripts, or learn new software. Our team sets everything up and keeps it running. Your job: upload your leads and read your results.</p>
              <ul className="mt-6 space-y-3 text-sm">
                {['We build and tune your AI callers', 'We connect your phone numbers and dialing', 'You upload leads and launch campaigns', 'You watch calls, outcomes, and pipelines live'].map((x) => (
                  <li key={x} className="flex items-center gap-2.5"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> {x}</li>
                ))}
              </ul>
            </div>
            <div className="reveal reveal-2 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white"><CreditCard className="h-6 w-6" /></div>
              <h3 className="mt-4 text-2xl font-bold">It costs nothing to get started</h3>
              <p className="mt-3 text-slate-300">Add a card so we can verify your account is real — that's it. From there you only pay for the calls you actually make.</p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-200">
                <li className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> No monthly subscription</li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> No minimums, no lock-in</li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Pay only for what you use</li>
                <li className="flex items-center gap-2.5"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Your card is secured by Stripe</li>
              </ul>
              <Link to="/register" className="btn-primary mt-6 w-full !py-3 text-base">Create your account <ArrowRight className="h-5 w-5" /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <h2 className="reveal text-center text-3xl font-extrabold tracking-tight md:text-4xl">Questions, answered</h2>
        <div className="reveal mt-10 space-y-3">
          {[
            { q: 'Do I need any technical skills?', a: 'None. This is fully done-for-you — we handle setup, scripting, and technology. You upload leads and read results.' },
            { q: 'Is there a monthly fee?', a: 'No. There is no subscription and no minimum. It is pay-as-you-go — you only pay for the calls you make.' },
            { q: 'What does it cost to get started?', a: 'Nothing. You add a card so we can verify your account is real. You are not charged to sign up.' },
            { q: 'What kind of businesses is this for?', a: 'Any business that needs to reach a lot of people by phone — real estate, contractors, auctions, agencies, sales teams, and more.' },
            { q: 'Can I hear the calls?', a: 'Yes. Every call is recorded and transcribed, with the outcome logged automatically, all inside your workspace.' },
          ].map((f) => (
            <details key={f.q} className="group rounded-xl border border-line bg-white p-4 open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">{f.q}<span className="ml-4 text-brand transition group-open:rotate-45">+</span></summary>
              <p className="mt-3 text-sm text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-line bg-ink text-white">
        <div className="pointer-events-none absolute inset-0"><div className="animate-aurora absolute left-1/2 top-1/2 h-80 w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/25 blur-[120px]" /></div>
        <div className="relative mx-auto max-w-4xl px-5 py-20 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-5xl">Ready to put your outbound <span className="text-gradient">on autopilot?</span></h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">Create your account in minutes. We handle the rest.</p>
          <Link to="/register" className="btn-primary btn-glow mt-8 !px-8 !py-3.5 text-base">Start free <ArrowRight className="h-5 w-5" /></Link>
          <p className="mt-4 text-sm text-slate-400">Free to start · Pay as you go · No monthly fees</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src={LOGO_FULL} alt="1PropertyMarket" className="h-6 w-auto object-contain" />
            <span className="font-semibold text-ink">1PropertyMarket Outbound</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/login" className="hover:text-ink">Sign in</Link>
            <Link to="/register" className="font-semibold text-brand hover:underline">Start free</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
