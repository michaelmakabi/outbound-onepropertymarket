import { Link } from 'react-router-dom';
import { LOGO_FULL } from '../lib/logo';
import {
  ArrowRight, Bot, Upload, BarChart3, Phone, ListChecks, FileText, Users,
  ShieldCheck, CreditCard, Sparkles, CheckCircle2, Headphones, Building2, Zap,
} from 'lucide-react';

// Public marketing + conversion page. Done-for-you outbound AI voice calling.
// No pricing figures anywhere — pay-as-you-go, free to start, card only verifies the account.
export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <a href="#top" className="flex items-center gap-2.5">
            <img src={LOGO_FULL} alt="1PropertyMarket" className="h-8 w-auto object-contain" />
            <span className="text-sm font-extrabold tracking-tight">1PropertyMarket <span className="text-brand">Outbound</span></span>
          </a>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-500 md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#who" className="hover:text-ink">Who it's for</a>
            <a href="#features" className="hover:text-ink">What you get</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost !py-1.5 text-sm">Sign in</Link>
            <Link to="/register" className="btn-primary !py-1.5 text-sm">Start free <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden bg-gradient-to-b from-white to-surface">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-14 md:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-light px-3 py-1 text-xs font-bold text-brand"><Sparkles className="h-3.5 w-3.5" /> Done-for-you AI voice calling</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl">
              Your outbound calls,<br /><span className="text-brand">handled by AI.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 md:text-xl">
              We build and run AI voice agents that call your leads, have real conversations, qualify them, and log every outcome — while you watch the results roll in.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/register" className="btn-primary w-full !px-6 !py-3 text-base sm:w-auto">Start free <ArrowRight className="h-5 w-5" /></Link>
              <a href="#how" className="btn-ghost w-full !px-6 !py-3 text-base sm:w-auto">See how it works</a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> No monthly fees</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Pay as you go</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Free to start — just verify your card</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Three steps. We do the heavy lifting.</h2>
          <p className="mt-3 text-slate-600">This is a done-for-you service — no bots to build, no software to wrangle. You bring the leads, we bring the calls.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { n: '1', icon: <Bot className="h-6 w-6" />, t: 'We set it up', d: 'Tell us who you want to reach. We build, script, and fine-tune your AI callers and dialing — configured and ready for your business.' },
            { n: '2', icon: <Upload className="h-6 w-6" />, t: 'You upload your leads', d: 'Drop in your list. Your leads land in your own private workspace, organized, de-duplicated, and ready to call.' },
            { n: '3', icon: <BarChart3 className="h-6 w-6" />, t: 'You see the results', d: 'Calls happen automatically. Recordings, transcripts, outcomes, and pipelines update in real time — all in one clean dashboard.' },
          ].map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand">{s.icon}</div>
              <div className="absolute right-5 top-5 text-4xl font-black text-surface">{s.n}</div>
              <h3 className="text-lg font-bold">{s.t}</h3>
              <p className="mt-2 text-sm text-slate-600">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section id="who" className="bg-surface py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Built for anyone who lives on the phone</h2>
            <p className="mt-3 text-slate-600">If your business grows by reaching a lot of people quickly, AI calling changes the math.</p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              'Real estate & investors', 'Home services & contractors', 'Auctions & liquidations',
              'Marketing & lead-gen agencies', 'Sales & appointment setting', 'Any high-volume outreach',
            ].map((w) => (
              <div key={w} className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold">
                <Building2 className="h-4 w-4 shrink-0 text-brand" /> {w}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Everything runs in your own workspace</h2>
          <p className="mt-3 text-slate-600">We handle the technology behind the scenes. You get a simple, powerful place to watch it all happen.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <Phone className="h-5 w-5" />, t: 'Human-sounding AI agents', d: 'Voice agents that hold natural, two-way conversations — not robocalls.' },
            { icon: <Zap className="h-5 w-5" />, t: 'Campaign & bulk dialing', d: 'Reach entire lists on your schedule, calling the right number for each lead.' },
            { icon: <Headphones className="h-5 w-5" />, t: 'Recordings & transcripts', d: 'Every conversation is captured, transcribed, and searchable in one click.' },
            { icon: <ListChecks className="h-5 w-5" />, t: 'Automatic dispositions', d: 'Interested, not interested, callback, wrong number — sorted for you.' },
            { icon: <Users className="h-5 w-5" />, t: 'Built-in CRM & pipelines', d: 'Your leads and contacts flow through pipelines as calls happen.' },
            { icon: <FileText className="h-5 w-5" />, t: 'Results you understand', d: 'A dashboard that shows what happened and what to do next — no guesswork.' },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-line bg-white p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light text-brand">{f.icon}</div>
              <h3 className="font-bold">{f.t}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Done-for-you + pay as you go band */}
      <section className="bg-gradient-to-br from-ink to-ink-soft py-16 text-white md:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">We do it for you.<br />You just watch it work.</h2>
              <p className="mt-4 text-slate-300">You don't build bots, write scripts, or learn new software. Our team sets everything up and keeps it running. Your job is simple: upload your leads and read your results.</p>
              <ul className="mt-6 space-y-3 text-sm">
                {['We build and tune your AI callers', 'We connect your phone numbers and dialing', 'You upload leads and launch campaigns', 'You watch calls, outcomes, and pipelines live'].map((x) => (
                  <li key={x} className="flex items-center gap-2.5"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> {x}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
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
        <h2 className="text-center text-3xl font-extrabold tracking-tight md:text-4xl">Questions, answered</h2>
        <div className="mt-10 space-y-3">
          {[
            { q: 'Do I need any technical skills?', a: 'None. This is fully done-for-you — we handle the setup, scripting, and technology. You upload leads and read results.' },
            { q: 'Is there a monthly fee?', a: 'No. There is no subscription and no minimum. It is pay-as-you-go — you only pay for the calls you make.' },
            { q: 'What does it cost to get started?', a: 'Nothing. You add a card so we can verify your account is real. You are not charged to sign up.' },
            { q: 'What kind of businesses is this for?', a: 'Any business that needs to reach a lot of people by phone — real estate, contractors, auctions, agencies, sales teams, and more.' },
            { q: 'Can I hear the calls?', a: 'Yes. Every call is recorded and transcribed, with the outcome logged automatically, all inside your workspace.' },
          ].map((f) => (
            <details key={f.q} className="group rounded-xl border border-line bg-white p-4 open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                {f.q}
                <span className="ml-4 text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Ready to put your outbound on autopilot?</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">Create your account in minutes. We handle the rest.</p>
          <Link to="/register" className="btn-primary mt-7 !px-7 !py-3 text-base">Start free <ArrowRight className="h-5 w-5" /></Link>
          <p className="mt-4 text-sm text-slate-500">Free to start · Pay as you go · No monthly fees</p>
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
