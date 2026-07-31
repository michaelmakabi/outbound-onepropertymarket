import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { Spinner, Kpi } from '../components/ui';
import { ArrowLeft } from 'lucide-react';

export default function CallDetail() {
  const { callId } = useParams();
  const [c, setC] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.call(callId!).then((d) => setC(d.call)).finally(() => setLoading(false)); }, [callId]);
  if (loading) return <Spinner />;
  if (!c) return <div className="card p-10 text-center text-slate-400">Call not found.</div>;

  const turns = Array.isArray(c.transcript_object) ? c.transcript_object : [];

  return (
    <div>
      <Link to="/calls" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> Call History</Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink">{c.agent_name || 'Call'} · {fmt.title(c.disposition)}</h1>
          <p className="text-sm text-slate-500">{fmt.dateTime(c.start_timestamp)} · {c.from_number || '—'} → {c.to_number || '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Duration" value={fmt.dur(c.duration_seconds)} />
        <Kpi label="Cost" value={fmt.money((c.combined_cost_cents || 0) / 100)} />
        <Kpi label="Sentiment" value={c.user_sentiment || 'Unknown'} />
        <Kpi label="Successful" value={c.call_successful === true ? 'Yes' : c.call_successful === false ? 'No' : '—'} tone={c.call_successful ? 'good' : undefined} />
      </div>

      {c.recording_url && (
        <div className="card mt-6 p-4">
          <div className="mb-2 label">Recording</div>
          <audio controls src={c.recording_url} className="w-full" />
        </div>
      )}

      {c.call_summary && (
        <div className="card mt-6 p-5">
          <div className="mb-2 label">Summary</div>
          <p className="text-sm leading-relaxed text-slate-700">{c.call_summary}</p>
        </div>
      )}

      <div className="card mt-6 p-5">
        <div className="mb-3 label">Transcript</div>
        {turns.length ? (
          <div className="space-y-3">
            {turns.map((t: any, i: number) => (
              <div key={i} className={`flex ${t.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${t.role === 'agent' ? 'bg-surface text-ink' : 'bg-brand text-white'}`}>
                  <div className={`mb-0.5 text-[10px] font-bold uppercase tracking-wide ${t.role === 'agent' ? 'text-slate-400' : 'text-white/70'}`}>{t.role}</div>
                  {t.content}
                </div>
              </div>
            ))}
          </div>
        ) : c.transcript ? (
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{c.transcript}</pre>
        ) : (
          <p className="text-sm text-slate-400">No transcript available for this call.</p>
        )}
      </div>
    </div>
  );
}
