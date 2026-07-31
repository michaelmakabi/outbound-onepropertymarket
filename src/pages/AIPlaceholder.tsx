import { PageHead } from '../components/ui';
import { Sparkles } from 'lucide-react';

export default function AIPlaceholder({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <PageHead title={title} subtitle={blurb} />
      <div className="card mx-auto max-w-lg p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand"><Sparkles className="h-7 w-7" /></div>
        <h3 className="text-lg font-bold text-ink">Almost ready</h3>
        <p className="mt-2 text-sm text-slate-500">
          This assistant is wired to your call data and ready to switch on. It just needs an AI provider key
          (Anthropic or OpenAI) set in the backend. Add the key and this page goes live — no rebuild required.
        </p>
      </div>
    </div>
  );
}
