import { useMemo, useRef, useState } from 'react';
import { Loader2, Send, AtSign, X } from 'lucide-react';
import { relTime } from '../lib/reltime';

export type Member = { user_id: number; name?: string; email?: string };
export type ThreadMsg = {
  id: string | number;
  author_name?: string;
  author_user_id?: number;
  body: string;
  mentions?: any[];
  created_at?: string | number;
};

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');
const memberLabel = (m: Member) => m.name || m.email || `User ${m.user_id}`;
const initials = (name?: string) => (name || 'SY').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// Highlight typed @mentions inside a message body.
function Body({ text }: { text: string }) {
  const parts = String(text || '').split(/(@[A-Za-z0-9_.\-]+)/g);
  return (
    <span className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
      {parts.map((p, i) =>
        p.startsWith('@') ? <span key={i} className="font-semibold text-brand">{p}</span> : <span key={i}>{p}</span>,
      )}
    </span>
  );
}

export default function MentionThread({
  members, messages, loading, onPost, emptyText, placeholder, newestFirst = false, heightClass = 'max-h-[440px]',
}: {
  members: Member[];
  messages: ThreadMsg[];
  loading: boolean;
  onPost: (body: string, mentions: number[]) => Promise<void>;
  emptyText: string;
  placeholder?: string;
  newestFirst?: boolean;
  heightClass?: string;
}) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<{ user_id: number; name: string }[]>([]);
  const [menu, setMenu] = useState<{ open: boolean; query: string; start: number }>({ open: false, query: '', start: -1 });
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const ordered = useMemo(() => {
    const ts = (m: ThreadMsg) => { const v = m.created_at; if (v == null) return 0; const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v)); return isFinite(n) ? n : 0; };
    const list = [...(messages || [])].sort((a, b) => ts(a) - ts(b));
    return newestFirst ? list.reverse() : list;
  }, [messages, newestFirst]);

  const suggestions = useMemo(() => {
    if (!menu.open) return [];
    const q = menu.query;
    return members.filter((m) => memberLabel(m).toLowerCase().includes(q) || String(m.email || '').toLowerCase().includes(q)).slice(0, 6);
  }, [menu, members]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    const caret = e.target.selectionStart ?? val.length;
    const upto = val.slice(0, caret);
    const m = upto.match(/@([A-Za-z0-9_.\-]*)$/);
    if (m) setMenu({ open: true, query: m[1].toLowerCase(), start: caret - m[0].length });
    else setMenu({ open: false, query: '', start: -1 });
  }

  function pick(member: Member) {
    const caret = taRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, menu.start);
    const after = text.slice(caret);
    const label = '@' + memberLabel(member);
    const next = `${before}${label} ${after}`;
    setText(next);
    setMenu({ open: false, query: '', start: -1 });
    setMentions((ms) => (ms.some((x) => x.user_id === member.user_id) ? ms : [...ms, { user_id: member.user_id, name: memberLabel(member) }]));
    setTimeout(() => {
      const pos = (before + label + ' ').length;
      taRef.current?.focus();
      taRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    // Only send mentions still referenced in the text (append-only; users may have edited the draft).
    const active = mentions.filter((mn) => body.includes('@' + mn.name) || body.includes('@' + (mn.name.split(' ')[0] || '')));
    setBusy(true);
    try {
      await onPost(body, active.map((m) => m.user_id));
      setText('');
      setMentions([]);
      setMenu({ open: false, query: '', start: -1 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Composer */}
      <div className="relative">
        <textarea
          ref={taRef}
          value={text}
          onChange={onChange}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}
          rows={3}
          placeholder={placeholder || 'Write an internal message… type @ to mention a teammate'}
          className="input w-full resize-y text-sm"
        />
        {menu.open && suggestions.length > 0 && (
          <div className="absolute z-30 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-white shadow-xl">
            {suggestions.map((m) => (
              <button key={m.user_id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">{initials(memberLabel(m))}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{memberLabel(m)}</span>
                {m.email && <span className="truncate text-[11px] text-slate-400">{m.email}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {mentions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {mentions.map((mn) => (
            <span key={mn.user_id} className="inline-flex items-center gap-1 rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand">
              <AtSign className="h-3 w-3" />{mn.name}
              <button type="button" onClick={() => setMentions((ms) => ms.filter((x) => x.user_id !== mn.user_id))} className="text-brand/60 hover:text-brand"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">Internal only — the customer never sees this. ⌘/Ctrl+Enter to send.</span>
        <button onClick={submit} disabled={busy || !text.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post
        </button>
      </div>

      {/* Thread */}
      <div className={cx('mt-4 space-y-3 overflow-y-auto', heightClass)}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : ordered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface/50 p-6 text-center text-sm text-slate-400">{emptyText}</div>
        ) : (
          ordered.map((m) => (
            <div key={m.id} className="flex gap-3">
              <div className="grid h-7 w-7 flex-none place-items-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">{initials(m.author_name)}</div>
              <div className="min-w-0 flex-1 rounded-xl border border-line bg-white p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{m.author_name || 'Teammate'}</span>
                  <span className="shrink-0 text-xs text-slate-400">{relTime(m.created_at)}</span>
                </div>
                <Body text={m.body} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
