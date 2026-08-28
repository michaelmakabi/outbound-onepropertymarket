import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { api, opm } from '../lib/api';
import { KpiCard, SectionCard, LoadingBlock, AudioPlayer } from '../components/dash';
import { usd, secs, dateTime, humanizeDisposition, humanizeProduct, dispositionColor } from '../lib/format';
import { downloadCallMp3, saveBlob, transcriptText } from '../lib/download';
import { OurLineTag, InitiatorTag, callInitiator, fmtPhone } from '../components/CallMeta';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Clock, DollarSign, Smile, CheckCircle2, Zap, ArrowDownToLine, FileText, Loader2, Repeat, User } from 'lucide-react';

export default function CallDetail() {
  const { callId } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const st = (loc.state || {}) as { ids?: string[]; total?: number; offset?: number };
  const ids = st.ids || [];
  const idx = ids.indexOf(callId || '');
  const position = idx >= 0 ? (st.offset || 0) + idx + 1 : null;

  const [c, setC] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dlAudio, setDlAudio] = useState(false);
  const [thread, setThread] = useState<any[]>([]);
  const [person, setPerson] = useState<any>(null);
  // Transcript ↔ recording sync: current audio time, an imperative seek handle, and refs for auto-scroll.
  const [audioTime, setAudioTime] = useState(0);
  const seekRef = useRef<((t: number) => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLoading(true); setThread([]); setPerson(null); api.call(callId!).then((d) => setC(d.call)).finally(() => setLoading(false)); }, [callId]);

  // Load sibling calls for this contact number (repeat-call thread).
  useEffect(() => {
    if (!c) return;
    const n = c.direction === 'inbound' ? c.from_number : c.to_number;
    if (!n) return;
    api.contact(String(n)).then((r) => setThread(Array.isArray(r.calls) ? r.calls : [])).catch(() => setThread([]));
  }, [c]);

  // Cross-reference the call's number to the CRM contact (name / email / lead) in the active workspace.
  useEffect(() => {
    if (!c) return;
    const n = c.direction === 'inbound' ? c.from_number : c.to_number;
    if (!n) { setPerson(null); return; }
    opm.resolveContacts([String(n)]).then((r) => { const m = r.map || {}; setPerson(m[String(n).replace(/\D/g, '').slice(-10)] || null); }).catch(() => setPerson(null));
  }, [c]);

  const goTo = (i: number) => { if (i >= 0 && i < ids.length) nav(`/calls/${ids[i]}`, { state: st }); };

  // ---- Transcript follows the recording ----
  // Each turn's start time (seconds) comes from its first word or its own `start`. The "active" turn is
  // the latest one whose start is at/behind the playhead; it's highlighted and auto-scrolled into view.
  const turnsForSync = useMemo<any[]>(() => (c && Array.isArray(c.transcript_object) ? c.transcript_object : []), [c]);
  const turnStartSec = (t: any): number | null => {
    const w = Array.isArray(t?.words) && t.words.length ? t.words[0].start : (typeof t?.start === 'number' ? t.start : null);
    return typeof w === 'number' ? w : null;
  };
  const activeIdx = useMemo(() => {
    let a = -1;
    for (let i = 0; i < turnsForSync.length; i++) {
      const s = turnStartSec(turnsForSync[i]);
      if (s == null) continue;
      if (s <= audioTime + 0.25) a = i; else break;
    }
    return a;
  }, [turnsForSync, audioTime]);
  // Keep the active line centered in the scrollable transcript panel (scrolls the panel, not the page).
  useEffect(() => {
    const cont = scrollRef.current, el = activeRef.current;
    if (cont && el) cont.scrollTo({ top: el.offsetTop - cont.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [activeIdx]);

  if (loading) return <LoadingBlock />;
  if (!c) return <div className="card p-10 text-center text-slate-400">Call not found.</div>;

  const inbound = c.direction === 'inbound';
  const contact = inbound ? c.from_number : c.to_number;
  const ourNumber = inbound ? c.to_number : c.from_number;
  const turns = Array.isArray(c.transcript_object) ? c.transcript_object : [];
  const products = Array.isArray(c.product_costs) ? [...c.product_costs].sort((a: any, b: any) => b.cost - a.cost) : [];
  const outcome = c.call_successful === true ? 'Successful' : c.call_successful === false ? 'Unsuccessful' : '—';
  const ghlUrl = `https://app.gohighlevel.com/`;
  const turnTime = (t: any): string | null => {
    const w = Array.isArray(t.words) && t.words.length ? t.words[0].start : (typeof t.start === 'number' ? t.start : null);
    return w == null ? null : `${Math.floor(w / 60)}:${String(Math.floor(w % 60)).padStart(2, '0')}`;
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Link to="/calls" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> Back to Call History</Link>
        {ids.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button className="btn-ghost !py-1.5" disabled={idx <= 0} onClick={() => goTo(idx - 1)}><ChevronLeft className="h-4 w-4" /> Prev</button>
            <span className="tabular-nums">{position} of {st.total ?? ids.length} · Call History</span>
            <button className="btn-ghost !py-1.5" disabled={idx < 0 || idx >= ids.length - 1} onClick={() => goTo(idx + 1)}>Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-ink">
            {inbound ? <ChevronRight className="h-5 w-5 rotate-180 text-emerald-600" /> : null}
            {person?.name || contact || 'Call'}
            {c.disposition && <span className="pill" style={{ background: `${dispositionColor(c.disposition)}22`, color: dispositionColor(c.disposition) }}>{humanizeDisposition(c.disposition)}</span>}
          </h1>
          <p className="text-sm text-slate-500">{c.workspace} · {dateTime(c.start_timestamp)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <InitiatorTag c={c} />
            <OurLineTag c={c} />
            {contact && <span className="font-mono text-slate-500" title={inbound ? 'Caller (contact)' : 'Number we dialed (contact)'}>{inbound ? '↙ from' : '↗ to'} {fmtPhone(contact)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.recording_url && (
            <button className="btn-ghost" disabled={dlAudio} onClick={async () => { setDlAudio(true); try { await downloadCallMp3(c); } catch (e) { alert('Download failed: ' + String((e as any)?.message || e)); } finally { setDlAudio(false); } }}>
              {dlAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />} MP3
            </button>
          )}
          <button className="btn-ghost" onClick={() => saveBlob(new Blob([transcriptText(c)], { type: 'text/plain' }), `transcript-${c.call_id.slice(-6)}.txt`)}><FileText className="h-4 w-4" /> Transcript</button>
          <a href={ghlUrl} target="_blank" rel="noreferrer" className="btn-primary"><ExternalLink className="h-4 w-4" /> Take Action in GoHighLevel</a>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Duration" value={secs(Number(c.duration_seconds || 0))} icon={Clock} accent="blue" />
        <KpiCard label="Cost" value={usd(Number(c.combined_cost_cents || 0) / 100, { precise: true })} icon={DollarSign} accent="green" />
        <KpiCard label="Sentiment" value={c.user_sentiment || 'Unknown'} icon={Smile} accent={c.user_sentiment === 'Positive' ? 'green' : c.user_sentiment === 'Negative' ? 'red' : 'default'} />
        <KpiCard label="Outcome" value={outcome} icon={CheckCircle2} accent={c.call_successful ? 'green' : 'default'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <SectionCard title="Recording" description={contact ? `${inbound ? 'From' : 'To'} ${contact}` : undefined}>
            {c.recording_url ? <AudioPlayer src={c.recording_url} onTime={setAudioTime} seekRef={seekRef} /> : <p className="text-sm text-slate-400">No recording available for this call.</p>}
            {c.recording_url && turns.length > 0 && <p className="mt-2 text-xs text-slate-400">Tip: the transcript below follows the recording as it plays — click any line to jump the audio there.</p>}
          </SectionCard>

          <SectionCard title="Transcript" description={`${turns.length} turns`}>
            {turns.length ? (
              <div ref={scrollRef} className="relative max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {turns.map((t: any, i: number) => {
                  const agent = t.role === 'agent';
                  const time = turnTime(t);
                  const startSec = turnStartSec(t);
                  const isActive = i === activeIdx;
                  const canSeek = startSec != null && !!c.recording_url;
                  return (
                    <div key={i} ref={isActive ? activeRef : undefined} className={`flex flex-col ${agent ? 'items-start' : 'items-end'}`}>
                      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${agent ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                        {agent ? 'Agent' : 'Caller'} {time && <span className="font-mono text-slate-400">{time}</span>}
                      </div>
                      <button
                        type="button"
                        disabled={!canSeek}
                        onClick={() => { if (startSec != null) seekRef.current?.(startSec); }}
                        title={canSeek ? 'Jump the recording to this line' : undefined}
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-left text-[15px] leading-relaxed transition ${canSeek ? 'cursor-pointer' : 'cursor-default'} ${
                          agent ? 'bg-surface text-ink' : 'bg-brand text-white'
                        } ${isActive ? 'ring-2 ring-amber-400 ring-offset-1' : canSeek ? 'hover:brightness-95' : ''}`}
                      >
                        {t.content}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : c.transcript ? (
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-slate-700">{c.transcript}</pre>
            ) : <p className="text-sm text-slate-400">No transcript available for this call.</p>}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-5">
          <SectionCard title="Contact">
            {person?.name || person?.email ? (
              <div className="space-y-2 text-base">
                <div className="flex items-center gap-2 text-lg font-bold text-ink"><User className="h-5 w-5 text-brand" /> {person.name || 'Contact'}</div>
                {contact && <a href={`tel:${contact}`} className="block font-mono text-base font-semibold text-brand hover:underline">{contact}</a>}
                {person.email && <div className="text-base text-slate-600">{person.email}</div>}
                {person.property_ref && <div className="text-sm text-slate-500">{person.property_ref}</div>}
                {person.lead_id && <Link to={`/leads/${encodeURIComponent(person.lead_id)}`} className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"><ExternalLink className="h-4 w-4" /> Open contact record (calls + notes)</Link>}
              </div>
            ) : (
              <div className="text-base text-slate-500">No matched CRM contact for {contact ? <a href={`tel:${contact}`} className="font-mono font-semibold text-brand hover:underline">{contact}</a> : 'this number'} — <span className="font-semibold">Unknown</span>.</div>
            )}
          </SectionCard>

          {c.call_summary && (
            <SectionCard title="AI Summary">
              <p className="text-base leading-relaxed text-slate-700">{c.call_summary}</p>
            </SectionCard>
          )}

          {products.length > 0 && (
            <SectionCard title="Cost Breakdown" description={usd(Number(c.combined_cost_cents || 0) / 100, { precise: true })}>
              <div className="space-y-2">
                {products.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-slate-700"><Zap className="h-3.5 w-3.5 text-slate-400" /> {humanizeProduct(p.product)}</span>
                    <span className="font-mono text-slate-600">{usd(Number(p.cost || 0) / 100, { precise: true })}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {thread.length > 1 && (
            <SectionCard title="Contact history" description={`${thread.length} calls to ${contact}`}
              action={contact ? <Link to={`/contacts/${encodeURIComponent(String(contact))}`} className="text-xs font-semibold text-brand hover:underline">View profile →</Link> : undefined}>
              <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                <Repeat className="h-3.5 w-3.5" /> This number was called {thread.length} times
              </div>
              <div className="space-y-1">
                {thread.map((t: any) => {
                  const active = t.call_id === c.call_id;
                  return (
                    <Link key={t.call_id} to={`/calls/${t.call_id}`} className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm ${active ? 'bg-brand-light font-semibold' : 'hover:bg-surface'}`}>
                      <span className="flex items-center gap-2 truncate">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dispositionColor(t.disposition) }} />
                        <span className="truncate text-ink">{humanizeDisposition(t.disposition)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{dateTime(t.start_timestamp)}</span>
                    </Link>
                  );
                })}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Details">
            <dl className="space-y-2 text-sm">
              {[
                ['Workspace', c.workspace],
                ['Type', callInitiator(c).mode === 'ai' ? 'AI call' : 'Manual call'],
                ['Agent', c.agent_name || '—'],
                ['Initiated by', callInitiator(c).who || '—'],
                ['LLM model', humanizeProduct(c.llm_product)],
                ['TTS voice', humanizeProduct(c.tts_product)],
                ['Our number (line used)', fmtPhone(ourNumber)],
                ['Contact number', fmtPhone(contact)],
                ['Status', c.call_status || '—'],
                ['Disconnect', c.disconnection_reason || '—'],
                ['Call ID', c.call_id],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="max-w-[60%] truncate text-right font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
