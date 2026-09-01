import { PlayCircle, Columns3, Bot, CalendarDays, FileSignature, ExternalLink } from 'lucide-react';
import { PageHeader } from '../components/dash';

// Video walkthrough of the outbound.1propertymarket.com system. The Loom is embedded
// responsively (16:9) so it fills the width on any screen.
const LOOM_ID = '3cf0dd880a584679b2ff2c6939660905';
const LOOM_EMBED = `https://www.loom.com/embed/${LOOM_ID}?hideEmbedTopBar=true&hide_owner=true`;
const LOOM_SHARE = `https://www.loom.com/share/${LOOM_ID}`;

const HIGHLIGHTS = [
  { icon: Columns3, title: 'Pipelines & stages', body: 'Build custom pipelines and curate each stage with its own color and icon - then drag leads through.' },
  { icon: Bot, title: 'AI voice agents', body: 'Launch live AI calls to sellers with full property, parcel and call-history context on every dial.' },
  { icon: CalendarDays, title: 'Booked appointments', body: 'Appointments the AI books land on your Calendar tab, ready for follow-up.' },
  { icon: FileSignature, title: 'Letters of Intent', body: 'Generate, format and send branded LOIs, then track negotiation terms - ours vs theirs.' },
];

export default function Tutorial() {
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        title="Video Walkthrough"
        description="A guided tour of how to use the system - start here."
        showDate={false}
        actions={
          <a href={LOOM_SHARE} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-brand hover:text-brand">
            <ExternalLink className="h-4 w-4" /> Open in Loom
          </a>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="relative w-full bg-ink" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={LOOM_EMBED}
            title="1PropertyMarket Outbound - Walkthrough Tutorial"
            allowFullScreen
            allow="fullscreen; picture-in-picture"
            className="absolute left-0 top-0 h-full w-full border-0"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {HIGHLIGHTS.map((h) => (
          <div key={h.title} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><h.icon className="h-4 w-4" /></span>
            <div>
              <div className="text-sm font-bold text-ink">{h.title}</div>
              <div className="mt-0.5 text-sm text-slate-500">{h.body}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        Have a question the video does not cover? Reach out to your account manager and we will walk you through it.
      </p>
    </div>
  );
}
