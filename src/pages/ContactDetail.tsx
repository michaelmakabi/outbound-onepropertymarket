import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, OutcomeTiles } from '../components/dash';
import { usd, num, humanizeDisposition, dispositionColor } from '../lib/format';
import { fmt } from '../lib/api';
import { ArrowLeft, PhoneCall, CalendarCheck, DollarSign, Repeat, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

type Call = { call_id: string; start_timestamp: number | null; direction: string; agent_name: string | null; disposition: string; outcome: string; duration_seconds: number; combined_cost_cents: number; user_sentiment: string | null; workspace: string; recording_url: string | null };

export default function ContactDetail() {
  const { number = '' } = useParams();
  const nav = useNavigate();
  const decoded = decodeURIComponent(number);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.contact(decoded).then(setData).finally(() => setLoading(false));
  }, [decoded]);

  const calls: Call[] = data?.calls ?? [];
  const spend = calls.reduce((s, c) => s + (c.combined_cost_cents || 0), 0) / 100;
  const booked = calls.filter((c) => c.outcome === 'booked').length;

  return (
    <div>
      <button onClick={() => nav('/contacts')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> All contacts</button>
      <PageHeader title={decoded} description="Full call thread for this contact" showDate={false} />

      {loading ? <LoadingBlock /> : calls.length === 0 ? <EmptyState text="No calls found for this contact." /> : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total Calls" value={num(calls.length)} sub="in this thread" icon={Repeat} accent="blue" />
            <KpiCard label="Booked" value={num(booked)} icon={CalendarCheck} accent="green" />
            <KpiCard label="Total Spend" value={usd(spend)} icon={DollarSign} />
            <KpiCard label="Last Outcome" value={humanizeDisposition(calls[0]?.disposition || '—')} icon={PhoneCall} accent="amber" />
          </div>

          {data.outcomes && data.outcomes.length > 0 && <OutcomeTiles outcomes={data.outcomes} total={calls.length} />}

          <SectionCard title={`Call thread · ${calls.length} calls`} description="Newest first · click a call to open its detail">
            <ol className="relative ml-3 border-l-2 border-line">
              {calls.map((c) => {
                const inbound = String(c.direction || '').toLowerCase() === 'inbound';
                return (
                  <li key={c.call_id} className="mb-4 ml-5">
                    <span className="absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white" style={{ background: dispositionColor(c.disposition) }} />
                    <Link to={`/calls/${c.call_id}`} className="block rounded-xl border border-line p-3 transition hover:border-brand/40 hover:bg-surface">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {inbound ? <ArrowDownLeft className="h-4 w-4 text-blue-500" /> : <ArrowUpRight className="h-4 w-4 text-emerald-600" />}
                          <span className="text-sm font-semibold text-ink">{humanizeDisposition(c.disposition)}</span>
                          <span className="pill" style={{ background: dispositionColor(c.disposition) + '22', color: dispositionColor(c.disposition) }}>{c.outcome.replace(/_/g, ' ')}</span>
                        </div>
                        <span className="text-xs text-slate-400">{fmt.dateTime(c.start_timestamp)}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{c.agent_name || 'Agent'}</span>
                        <span>{fmt.dur(c.duration_seconds)}</span>
                        <span>{usd((c.combined_cost_cents || 0) / 100)}</span>
                        {c.user_sentiment && <span>Sentiment: {c.user_sentiment}</span>}
                        <span className="text-slate-400">{c.workspace}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
