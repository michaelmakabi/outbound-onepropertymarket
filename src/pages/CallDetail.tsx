import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { KpiCard, SectionCard, LoadingBlock, AudioPlayer } from '../components/dash';
import { usd, secs, dateTime, humanizeDisposition, humanizeProduct, dispositionColor } from '../lib/format';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Clock, DollarSign, Smile, CheckCircle2, Zap } from 'lucide-react';

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

  useEffect(() => { setLoading(true); api.call(callId!).then((d) => setC(d.call)).finally(() => setLoading(false)); }, [callId]);

  const goTo = (i: number) => { if (i >= 0 && i < ids.length) nav(`/calls/${ids[i]}`, { state: st }); };

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
            {contact || 'Call'}
            {c.disposition && <span className="pill" style={{ background: `${dispositionColor(c.disposition)}22`, color: dispositionColor(c.disposition) }}>{humanizeDisposition(c.disposition)}</span>}
          </h1>
          <p className="text-sm text-slate-500">{c.workspace} · {c.agent_name || '—'} · {dateTime(c.start_timestamp)}</p>
        </div>
        <a href={ghlUrl} target="_blank" rel="noreferrer" className="btn-primary"><ExternalLink className="h-4 w-4" /> Take Action in GoHighLevel</a>
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
            {c.recording_url ? <AudioPlayer src={c.recording_url} /> : <p className="text-sm text-slate-400">No recording available for this call.</p>}
          </SectionCard>

          <SectionCard title="Transcript" description={`${turns.length} turns`}>
            {turns.length ? (
              <div className="space-y-3">
                {turns.map((t: any, i: number) => {
                  const agent = t.role === 'agent';
                  const time = turnTime(t);
                  return (
                    <div key={i} className={`flex flex-col ${agent ? 'items-start' : 'items-end'}`}>
                      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${agent ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                        {agent ? 'Agent' : 'Caller'} {time && <span className="font-mono text-slate-400">{time}</span>}
                      </div>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${agent ? 'bg-surface text-ink' : 'bg-brand text-white'}`}>{t.content}</div>
                    </div>
                  );
                })}
              </div>
            ) : c.transcript ? (
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{c.transcript}</pre>
            ) : <p className="text-sm text-slate-400">No transcript available for this call.</p>}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-5">
          {c.call_summary && (
            <SectionCard title="AI Summary">
              <p className="text-sm leading-relaxed text-slate-700">{c.call_summary}</p>
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

          <SectionCard title="Details">
            <dl className="space-y-2 text-sm">
              {[
                ['Workspace', c.workspace],
                ['Agent', c.agent_name || '—'],
                ['LLM model', humanizeProduct(c.llm_product)],
                ['TTS voice', humanizeProduct(c.tts_product)],
                ['Our number', ourNumber || '—'],
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
