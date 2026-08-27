import { useEffect, useMemo, useRef, useState } from 'react';
import { tokenStore } from '../lib/api';
import { Bot, Play, Pause } from 'lucide-react';

// Timed-transcript endpoint (per-utterance role/content/words[start,end]) — served by `opm-transcript`.
const TRANSCRIPT_BASE =
  (import.meta as any).env?.VITE_OPMTRANSCRIPT_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-transcript') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-transcript');

type Turn = { role: 'agent' | 'user'; text: string; start: number; end: number };

// Build an ordered turn list. Prefer Retell's transcript_object (has per-word start/end for real-time
// sync); fall back to parsing the flat "User:/Agent:" transcript (evenly spread across the duration).
function toTurns(obj: any[], flat: string, duration: number): Turn[] {
  if (Array.isArray(obj) && obj.length) {
    return obj.map((u: any) => {
      const words = Array.isArray(u.words) ? u.words : [];
      const start = words.length ? Number(words[0].start) || 0 : 0;
      const end = words.length ? Number(words[words.length - 1].end) || start : start;
      const role = String(u.role || '').toLowerCase() === 'agent' ? 'agent' : 'user';
      return { role, text: String(u.content || '').trim(), start, end } as Turn;
    }).filter((t) => t.text);
  }
  const lines = String(flat || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const turns: Turn[] = [];
  for (const ln of lines) {
    const m = ln.match(/^(agent|assistant|bot|user|customer|owner|caller)\s*:\s*(.*)$/i);
    if (m) turns.push({ role: /agent|assistant|bot/i.test(m[1]) ? 'agent' : 'user', text: m[2], start: 0, end: 0 });
    else if (turns.length) turns[turns.length - 1].text += ' ' + ln;
    else turns.push({ role: 'user', text: ln, start: 0, end: 0 });
  }
  const clean = turns.filter((t) => t.text);
  const n = clean.length;
  if (duration > 0 && n) clean.forEach((t, i) => { t.start = (duration * i) / n; t.end = (duration * (i + 1)) / n; });
  return clean;
}
const fmtTime = (s: number) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// iPhone-style, playback-synced call transcript. The AI agent is the blue "sender" (right); the
// contact is grey (left). As the recording plays — or is scrubbed — the active line highlights and the
// thread scrolls to keep it centered. Clicking a bubble seeks the audio to that line.
export default function CallConversation({ call, contactName }: { call: any; contactName?: string }) {
  const [obj, setObj] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(Number(call?.duration_seconds) || 0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const url = new URL(TRANSCRIPT_BASE); url.searchParams.set('call_id', call.call_id);
    fetch(url.toString(), { headers: { Authorization: `Bearer ${tokenStore.get() || ''}` } })
      .then((r) => r.json())
      .then((d) => { if (alive) setObj(Array.isArray(d?.transcript_object) ? d.transcript_object : []); })
      .catch(() => { if (alive) setObj([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [call.call_id]);

  const turns = useMemo(() => toTurns(obj || [], call.transcript || '', Number(call?.duration_seconds) || dur), [obj, call.transcript, call.duration_seconds, dur]);
  const hasTiming = useMemo(() => turns.some((x) => x.end > 0), [turns]);
  const activeIdx = useMemo(() => {
    if (!hasTiming) return -1;
    let idx = -1;
    for (let i = 0; i < turns.length; i++) { if (turns[i].start <= t + 0.05) idx = i; else break; }
    return idx;
  }, [t, turns, hasTiming]);

  // Keep the active line centered as playback / scrubbing moves — contained to the thread box.
  useEffect(() => {
    if (activeIdx < 0) return;
    const el = bubbleRefs.current[activeIdx];
    const c = scrollRef.current;
    if (!el || !c) return;
    const cRect = c.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const delta = (eRect.top - cRect.top) - (c.clientHeight / 2 - el.clientHeight / 2);
    c.scrollTo({ top: c.scrollTop + delta, behavior: 'smooth' });
  }, [activeIdx]);

  const agentName = call.agent_name || 'AI Agent';
  const custName = contactName || 'Contact';
  const custInit = (custName.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('') || 'C').toUpperCase();

  const seek = (sec: number) => { const a = audioRef.current; if (!a) return; a.currentTime = Math.max(0, sec); setT(a.currentTime); if (a.paused) a.play().catch(() => {}); };
  const toggle = () => { const a = audioRef.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); };

  if (loading) return <div className="py-4 text-sm text-slate-400">Loading conversation…</div>;
  if (!turns.length && !call.recording_url) return <div className="py-4 text-sm text-slate-400">No transcript for this call.</div>;

  return (
    <div className="rounded-2xl border border-line bg-surface/40 p-3 sm:p-4">
      {call.recording_url && (
        <div className="mb-3 flex items-center gap-3">
          <button onClick={toggle} title={playing ? 'Pause' : 'Play'} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-sm transition hover:brightness-110">
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
          </button>
          <div className="flex-1">
            <input type="range" min={0} max={dur || 0} step={0.1} value={Math.min(t, dur || 0)} onChange={(e) => seek(Number(e.target.value))} className="w-full cursor-pointer accent-[#1f6feb]" />
            <div className="mt-0.5 flex justify-between font-mono text-[11px] text-slate-400"><span>{fmtTime(t)}</span><span>{fmtTime(dur)}</span></div>
          </div>
        </div>
      )}
      <audio ref={audioRef} src={call.recording_url || undefined} preload="metadata"
        onLoadedMetadata={(e) => { const d = (e.target as HTMLAudioElement).duration; if (isFinite(d) && d > 0) setDur(d); }}
        onTimeUpdate={(e) => setT((e.target as HTMLAudioElement).currentTime)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} className="hidden" />

      <div ref={scrollRef} className="max-h-[460px] overflow-y-auto px-0.5 py-1">
        {turns.map((turn, i) => {
          const isAgent = turn.role === 'agent';
          const gap = i > 0 && hasTiming ? Math.max(0, turn.start - turns[i - 1].end) : 0;
          const active = i === activeIdx;
          return (
            <div key={i} ref={(el) => { bubbleRefs.current[i] = el; }}>
              {gap >= 1 && (
                <div className="my-1.5 flex justify-center">
                  <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{Math.round(gap)}s pause</span>
                </div>
              )}
              <div className={`mb-3 flex items-end gap-2 ${isAgent ? 'flex-row-reverse' : ''}`}>
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${isAgent ? 'bg-brand/15 text-brand' : 'bg-emerald-100 text-emerald-700'}`}>
                  {isAgent ? <Bot className="h-4 w-4" /> : custInit}
                </div>
                <div className="min-w-0 max-w-[80%]">
                  <div className={`mb-1 flex items-center gap-1.5 text-[11px] ${isAgent ? 'flex-row-reverse' : ''}`}>
                    <span className="font-semibold text-slate-600">{isAgent ? agentName : custName}</span>
                    {isAgent && <span className="rounded bg-brand/10 px-1 py-0.5 text-[9px] font-bold uppercase text-brand">AI</span>}
                    {hasTiming && <span className="font-mono text-[10px] text-slate-400">{fmtTime(turn.start)}</span>}
                  </div>
                  <button onClick={() => hasTiming && seek(turn.start)}
                    className={`block w-full text-left text-[15px] leading-relaxed shadow-sm transition ${isAgent
                      ? 'rounded-2xl rounded-br-md bg-brand text-white'
                      : 'rounded-2xl rounded-bl-md bg-white text-slate-800'} px-4 py-2.5 ${active ? 'scale-[1.01] ring-2 ring-amber-400 ring-offset-1' : ''} ${hasTiming ? 'cursor-pointer' : 'cursor-default'}`}>
                    {turn.text}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
