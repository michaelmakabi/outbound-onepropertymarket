import { PageHeader, SectionCard } from '../components/dash';
import { Sparkles, PenLine, FileBarChart, Check, Wand2, LucideIcon } from 'lucide-react';

type AIConfig = {
  title: string;
  blurb: string;
  icon: LucideIcon;
  features: string[];
  sampleTitle: string;
  sample: string[];
};

const CONFIGS: Record<string, AIConfig> = {
  suggestions: {
    title: 'AI Suggestions',
    blurb: 'LLM-generated campaign optimization suggestions across your workspaces.',
    icon: Sparkles,
    features: [
      'Spots underperforming agents, scripts, and time-of-day windows',
      'Flags dispositions with high spend and low booking conversion',
      'Recommends budget shifts between workspaces based on cost-per-booking',
    ],
    sampleTitle: 'Example suggestions',
    sample: [
      'Workspace “Loren — Locksmith” books at 2.4× the cost of your best workspace — review the opener script.',
      '38% of spend is going to no-answer calls after 6pm; consider tightening the dial window.',
      'Agent “Ava” has the highest booking rate — clone her prompt to the two lowest performers.',
    ],
  },
  'prompt-studio': {
    title: 'Prompt Studio',
    blurb: 'Generate and refine outbound agent prompts, scripts, and follow-up flows.',
    icon: PenLine,
    features: [
      'Drafts opener, objection-handling, and closing scripts from your best-converting calls',
      'Rewrites prompts for tone, brevity, or a specific offer',
      'Produces follow-up SMS/voicemail copy tied to each disposition',
    ],
    sampleTitle: 'What you can generate',
    sample: [
      'A cold-open script tuned to your highest-booking agent’s transcripts.',
      'Three A/B opener variants with different value propositions.',
      'A voicemail-drop script for the “no_answer” disposition.',
    ],
  },
  reports: {
    title: 'Reports',
    blurb: 'Executive-summary reports with AI-written insights.',
    icon: FileBarChart,
    features: [
      'One-click weekly and monthly performance summaries in plain English',
      'Narrates trends, wins, and risks across every workspace',
      'Exportable recap you can send to clients or stakeholders',
    ],
    sampleTitle: 'Inside a generated report',
    sample: [
      'Headline KPIs with week-over-week movement and a written interpretation.',
      'Top 3 wins and top 3 risks, each with a recommended action.',
      'Per-workspace spotlight paragraphs ready to paste into an email.',
    ],
  },
};

export default function AIPlaceholder({ configKey }: { configKey: keyof typeof CONFIGS }) {
  const c = CONFIGS[configKey];
  const Icon = c.icon;
  return (
    <div>
      <PageHeader title={c.title} description={c.blurb} showDate={false} />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="What this does" description="Wired to your live call data">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-light text-brand"><Icon className="h-6 w-6" /></div>
          <ul className="space-y-2.5">
            {c.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {f}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title={c.sampleTitle} description="Representative output">
          <div className="space-y-3">
            {c.sample.map((s, i) => (
              <div key={i} className="rounded-xl border border-line bg-surface/60 p-3 text-sm text-slate-700">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">{i + 1}</span>
                {s}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="card mt-5 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white"><Wand2 className="h-5 w-5" /></div>
          <div>
            <div className="font-bold text-ink">Ready to switch on</div>
            <div className="text-sm text-slate-500">This assistant is connected to your data. Add an Anthropic or OpenAI key in the backend to activate — no rebuild required.</div>
          </div>
        </div>
        <span className="pill bg-amber-100 text-amber-700">Awaiting AI key</span>
      </div>
    </div>
  );
}
