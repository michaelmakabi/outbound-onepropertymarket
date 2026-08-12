import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { testai } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { useAuth } from '../lib/auth';
import { Spinner } from '../components/ui';
import {
  Bot, ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle, X, Mic, Play, Pause,
  User2, Volume2, PhoneCall, BookOpen, MessageSquareText, ChevronRight,
} from 'lucide-react';

// ---- Curated option lists (current value is always merged in so nothing is ever lost) ----
const MODEL_CHOICES = [
  'gpt-5.1', 'gpt-5.6-terra', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini',
  'claude-3.7-sonnet', 'claude-3.5-haiku',
];
const LANGUAGE_CHOICES: [string, string][] = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-IN', 'English (India)'],
  ['en-AU', 'English (Australia)'], ['es-ES', 'Spanish (Spain)'], ['es-419', 'Spanish (Latin America)'],
  ['de-DE', 'German'], ['fr-FR', 'French'], ['fr-CA', 'French (Canada)'], ['hi-IN', 'Hindi'],
  ['it-IT', 'Italian'], ['pt-PT', 'Portuguese'], ['pt-BR', 'Portuguese (Brazil)'],
  ['nl-NL', 'Dutch'], ['ja-JP', 'Japanese'], ['zh-CN', 'Chinese (Mandarin)'],
  ['ko-KR', 'Korean'], ['ru-RU', 'Russian'], ['pl-PL', 'Polish'], ['multi', 'Multilingual'],
];
const AMBIENT_CHOICES: [string, string][] = [
  ['', 'None (silent)'], ['coffee-shop', 'Coffee shop'], ['convention-hall', 'Convention hall'],
  ['summer-outdoor', 'Summer outdoors'], ['mountain-outdoor', 'Mountain outdoors'],
  ['static-noise', 'Static noise'], ['call-center', 'Call center'],
];
const DENOISE_CHOICES: [string, string][] = [
  ['', 'Default'], ['noise-cancellation', 'Cancel background noise'],
  ['noise-and-background-speech-cancellation', 'Cancel noise + background speech'],
];
const STT_CHOICES: [string, string][] = [['', 'Default'], ['fast', 'Fast (lower latency)'], ['accurate', 'Accurate']];

type Section = 'profile' | 'model' | 'voice' | 'call' | 'knowledge' | 'test';
const SECTIONS: { id: Section; label: string; icon: any; hint: string }[] = [
  { id: 'profile', label: 'Profile', icon: User2, hint: 'Name, language & voice' },
  { id: 'model', label: 'Model & Instructions', icon: MessageSquareText, hint: 'Brain & script' },
  { id: 'voice', label: 'Voice & Speech', icon: Volume2, hint: 'How it sounds' },
  { id: 'call', label: 'Call Settings', icon: PhoneCall, hint: 'Timing & limits' },
  { id: 'knowledge', label: 'Knowledge & Post-call', icon: BookOpen, hint: 'KBs, webhook' },
  { id: 'test', label: 'Test', icon: Play, hint: 'Call it live' },
];

const num = (v: any): number | undefined => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v));

export default function AgentEdit() {
  const nav = useNavigate();
  const { agentId = '' } = useParams();
  const { active, activeName, loading: wsLoading } = useWorkspace();
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [section, setSection] = useState<Section>('profile');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  // Editable state: agent-level + llm-level, plus the initial snapshots for diffing.
  const [agent, setAgent] = useState<Record<string, any>>({});
  const [llm, setLlm] = useState<Record<string, any>>({});
  const [initAgent, setInitAgent] = useState<Record<string, any>>({});
  const [initLlm, setInitLlm] = useState<Record<string, any>>({});
  const [hasLlm, setHasLlm] = useState(false);
  const [engineType, setEngineType] = useState<string | null>(null);

  const [voices, setVoices] = useState<any[]>([]);
  const [kbs, setKbs] = useState<any[]>([]);

  // Voice preview audio (single element, shared).
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string>('');

  const setA = (k: string, v: any) => setAgent((p) => ({ ...p, [k]: v }));
  const setL = (k: string, v: any) => setLlm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!wsLoading && !isAdmin) nav('/ai-agents', { replace: true });
  }, [wsLoading, isAdmin, nav]);

  useEffect(() => {
    if (!active || !agentId) return;
    setLoading(true); setErr('');
    testai.agentFull(active, agentId)
      .then((d) => {
        const a = d.agent || {};
        const l = d.llm || {};
        setAgent(a); setInitAgent(a);
        setLlm(l); setInitLlm(l);
        setHasLlm(!!d.has_llm);
        setEngineType(d.engine_type || null);
      })
      .catch((e) => setErr(e?.message || 'Failed to load agent'))
      .finally(() => setLoading(false));
    // Voices + KBs are best-effort — the editor still works without them.
    testai.listVoices(active).then((d) => setVoices(d.voices || [])).catch(() => {});
    testai.listKbs(active).then((d) => setKbs(d.kbs || [])).catch(() => {});
  }, [active, agentId]);

  function flash(ok: boolean, msg: string) { setToast({ ok, msg }); setTimeout(() => setToast(null), 6000); }

  // Diff helpers — send only what changed. agent_name is routed via body.name.
  const agentChanges = useMemo(() => {
    const out: Record<string, any> = {};
    for (const k of Object.keys(agent)) {
      if (k === 'agent_id' || k === 'agent_name') continue;
      if (JSON.stringify(agent[k]) !== JSON.stringify(initAgent[k])) out[k] = agent[k];
    }
    return out;
  }, [agent, initAgent]);
  const llmChanges = useMemo(() => {
    const out: Record<string, any> = {};
    for (const k of Object.keys(llm)) {
      if (k === 'llm_id') continue;
      if (JSON.stringify(llm[k]) !== JSON.stringify(initLlm[k])) out[k] = llm[k];
    }
    return out;
  }, [llm, initLlm]);
  const nameChanged = (agent.agent_name || '') !== (initAgent.agent_name || '');
  const dirty = nameChanged || Object.keys(agentChanges).length > 0 || Object.keys(llmChanges).length > 0;

  async function save() {
    if (!dirty || saving || !active) return;
    setSaving(true);
    const payload: any = { workspace: active, agent_id: agentId };
    if (nameChanged) payload.name = (agent.agent_name || '').trim();
    if (Object.keys(agentChanges).length) payload.agent = agentChanges;
    if (Object.keys(llmChanges).length) payload.llm = llmChanges;
    try {
      const r = await testai.updateAgent(payload);
      // Reflect saved state: the current values become the new baseline.
      setInitAgent(agent); setInitLlm(llm);
      flash(true, `Saved — updated ${(r.applied || []).join(', ') || 'agent'} in Retell.`);
    } catch (e: any) { flash(false, e?.message || 'Update failed'); }
    finally { setSaving(false); }
  }

  function previewVoice(v: any) {
    const el = audioRef.current;
    if (!el || !v?.preview_audio_url) return;
    if (playing === v.voice_id) { el.pause(); setPlaying(''); return; }
    el.src = v.preview_audio_url;
    el.play().then(() => setPlaying(v.voice_id)).catch(() => setPlaying(''));
  }

  function goTest() { nav(`/test-ai?workspace=${encodeURIComponent(active || '')}&agent=${encodeURIComponent(agentId)}`); }

  if (wsLoading || loading) return <Spinner label="Loading agent…" />;

  const selectedVoice = voices.find((v) => v.voice_id === agent.voice_id);
  const voiceLabel = selectedVoice?.voice_name || agent.voice_id || 'Default voice';

  return (
    <div className="w-full">
      <audio ref={audioRef} onEnded={() => setPlaying('')} className="hidden" />

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/ai-agents')} className="btn-ghost !px-2.5" title="Back to AI Agents"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">Edit Agent</h1>
            <p className="mt-0.5 text-sm text-slate-500">{activeName || active} · design how your AI agent speaks and behaves</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="hidden text-xs font-semibold text-amber-600 sm:inline">Unsaved changes</span>}
          <button onClick={save} disabled={!dirty || saving} className="btn-primary">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save / Update Agent</>}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`mb-5 flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${toast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="font-medium">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-auto text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
      )}
      {err && <div className="mb-5 flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700"><AlertCircle className="h-4 w-4" /> {err}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: section nav */}
        <nav className="lg:col-span-3 xl:col-span-2">
          <div className="flex gap-2 overflow-x-auto lg:sticky lg:top-4 lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => {
              const Icon = s.icon; const on = section === s.id;
              return (
                <button key={s.id} onClick={() => setSection(s.id)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition lg:w-full ${on ? 'border-brand bg-brand/5 text-brand' : 'border-line bg-white text-slate-600 hover:bg-surface'}`}>
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${on ? 'bg-brand text-white' : 'bg-surface text-slate-500'}`}><Icon className="h-4 w-4" /></span>
                  <span className="hidden lg:block">
                    <span className="block font-semibold leading-tight">{s.label}</span>
                    <span className="block text-[11px] font-normal text-slate-400">{s.hint}</span>
                  </span>
                  <span className="lg:hidden font-semibold">{s.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Center: active section */}
        <div className="lg:col-span-6 xl:col-span-7">
          <div className="card p-5 sm:p-6">
            {section === 'profile' && (
              <ProfileSection agent={agent} setA={setA} voices={voices} playing={playing} previewVoice={previewVoice} />
            )}
            {section === 'model' && (
              <ModelSection llm={llm} setL={setL} hasLlm={hasLlm} engineType={engineType} />
            )}
            {section === 'voice' && (
              <VoiceSection agent={agent} setA={setA} />
            )}
            {section === 'call' && (
              <CallSection agent={agent} setA={setA} />
            )}
            {section === 'knowledge' && (
              <KnowledgeSection agent={agent} setA={setA} llm={llm} setL={setL} kbs={kbs} hasLlm={hasLlm} />
            )}
            {section === 'test' && (
              <TestSection goTest={goTest} voiceLabel={voiceLabel} name={agent.agent_name} dirty={dirty} />
            )}
          </div>
        </div>

        {/* Right: live preview */}
        <aside className="lg:col-span-3">
          <div className="card p-5 lg:sticky lg:top-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Live preview</div>
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-brand/10 text-brand">
                {selectedVoice?.avatar_url ? <img src={selectedVoice.avatar_url} alt="" className="h-full w-full object-cover" /> : <Bot className="h-7 w-7" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink">{agent.agent_name || 'Untitled agent'}</div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Mic className="h-3 w-3" /> <span className="truncate">{voiceLabel}</span></div>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-xs">
              <Row label="Language" value={(LANGUAGE_CHOICES.find((l) => l[0] === agent.language)?.[1]) || agent.language || 'Default'} />
              <Row label="Model" value={llm.model || (hasLlm ? 'Default' : 'Conversation flow')} />
              {selectedVoice?.preview_audio_url && (
                <button onClick={() => previewVoice(selectedVoice)} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-surface">
                  {playing === selectedVoice.voice_id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Preview voice
                </button>
              )}
            </dl>
            <button onClick={goTest} className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand/90"><PhoneCall className="h-4 w-4" /> Test call</button>
            <button onClick={save} disabled={!dirty || saving} className="btn-primary mt-2 w-full">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save / Update Agent</>}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ================= Section components =================

function ProfileSection({ agent, setA, voices, playing, previewVoice }: any) {
  const langChoices = mergeChoices(LANGUAGE_CHOICES, agent.language);
  return (
    <div>
      <SectionTitle icon={User2} title="Profile" hint="Give your agent an identity and a voice." />
      <FieldLabel>Agent name</FieldLabel>
      <input className="input mt-1" value={agent.agent_name || ''} onChange={(e) => setA('agent_name', e.target.value)} placeholder="e.g. Front Desk Concierge" />

      <FieldLabel className="mt-5">Primary language</FieldLabel>
      <select className="input mt-1" value={agent.language ?? ''} onChange={(e) => setA('language', e.target.value || undefined)}>
        {langChoices.map(([v, l]) => <option key={v || 'default'} value={v}>{l}</option>)}
      </select>
      <p className="mt-1 text-xs text-slate-400">Choose “Multilingual” to let the agent detect and switch languages mid-call.</p>

      <FieldLabel className="mt-6">Voice</FieldLabel>
      {voices.length === 0 ? (
        <div className="mt-1">
          <input className="input font-mono text-xs" value={agent.voice_id || ''} onChange={(e) => setA('voice_id', e.target.value)} placeholder="e.g. 11labs-Adrian" />
          <p className="mt-1 text-xs text-slate-400">Voice catalog unavailable — enter a Retell voice_id directly.</p>
        </div>
      ) : (
        <div className="mt-2 grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {voices.map((v: any) => {
            const on = agent.voice_id === v.voice_id;
            return (
              <div key={v.voice_id} onClick={() => setA('voice_id', v.voice_id)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition ${on ? 'border-brand bg-brand/5' : 'border-line bg-white hover:bg-surface'}`}>
                <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand/10 text-brand">
                  {v.avatar_url ? <img src={v.avatar_url} alt="" className="h-full w-full object-cover" /> : <Mic className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{v.voice_name}</div>
                  <div className="truncate text-[11px] text-slate-400">{[v.gender, v.accent, v.provider].filter(Boolean).join(' · ') || v.voice_id}</div>
                </div>
                {v.preview_audio_url && (
                  <button onClick={(e) => { e.stopPropagation(); previewVoice(v); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-white text-slate-500 hover:text-brand" title="Preview voice">
                    {playing === v.voice_id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModelSection({ llm, setL, hasLlm, engineType }: any) {
  if (!hasLlm) {
    return (
      <div>
        <SectionTitle icon={MessageSquareText} title="Model & Instructions" hint="The agent's brain and its script." />
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This is a {engineType || 'conversation-flow'} agent, so its model and prompt aren't editable here. You can still adjust voice, speech and call settings, then test it.
        </div>
      </div>
    );
  }
  const modelChoices = mergeChoices(MODEL_CHOICES.map((m) => [m, m] as [string, string]), llm.model);
  return (
    <div>
      <SectionTitle icon={MessageSquareText} title="Model & Instructions" hint="The agent's brain and its script." />
      <FieldLabel>Language model</FieldLabel>
      <select className="input mt-1" value={llm.model ?? ''} onChange={(e) => setL('model', e.target.value || undefined)}>
        {modelChoices.map(([v, l]) => <option key={v || 'default'} value={v}>{l || 'Default'}</option>)}
      </select>
      <p className="mt-1 text-xs text-slate-400">The current model is always kept in this list so it's never lost.</p>

      <Slider label="Creativity (temperature)" hint="Lower = focused and consistent · Higher = more varied"
        value={valOr(llm.model_temperature, 0)} min={0} max={1} step={0.05}
        onChange={(v) => setL('model_temperature', v)} />

      <FieldLabel className="mt-6">Instructions (main prompt)</FieldLabel>
      <textarea className="input mt-1 min-h-[280px] font-mono text-xs leading-relaxed" value={llm.general_prompt || ''} onChange={(e) => setL('general_prompt', e.target.value)} placeholder="Describe who the agent is, its goals, tone, and what it should do on the call…" />

      <FieldLabel className="mt-5">First message <span className="font-normal text-slate-400">(what the agent says first)</span></FieldLabel>
      <textarea className="input mt-1 min-h-[80px] text-sm" value={llm.begin_message ?? ''} onChange={(e) => setL('begin_message', e.target.value)} placeholder="e.g. Hi, thanks for calling — how can I help today?" />
      <p className="mt-1 text-xs text-slate-400">Leave blank to let the agent open the conversation on its own.</p>
    </div>
  );
}

function VoiceSection({ agent, setA }: any) {
  return (
    <div>
      <SectionTitle icon={Volume2} title="Voice & Speech" hint="Fine-tune how the agent sounds and reacts." />
      <Slider label="Speaking speed" hint="Lower = slower · Higher = faster" value={valOr(agent.voice_speed, 1)} min={0.5} max={2} step={0.05} onChange={(v) => setA('voice_speed', v)} />
      <Slider label="Voice expressiveness" hint="How much the voice varies its delivery" value={valOr(agent.voice_temperature, 1)} min={0} max={2} step={0.05} onChange={(v) => setA('voice_temperature', v)} />
      <Slider label="Volume" hint="Loudness of the agent's voice" value={valOr(agent.volume, 1)} min={0} max={2} step={0.05} onChange={(v) => setA('volume', v)} />
      <Slider label="Interruption sensitivity" hint="How easily the caller can interrupt the agent" value={valOr(agent.interruption_sensitivity, 1)} min={0} max={1} step={0.05} onChange={(v) => setA('interruption_sensitivity', v)} />
      <Slider label="How quickly the agent responds" hint="Higher = replies faster after you stop talking" value={valOr(agent.responsiveness, 1)} min={0} max={1} step={0.05} onChange={(v) => setA('responsiveness', v)} />

      <Toggle label="Backchannel" hint="Agent says “mm-hmm”, “right” etc. while listening" checked={!!agent.enable_backchannel} onChange={(v) => setA('enable_backchannel', v)} />
      {agent.enable_backchannel && (
        <Slider label="Backchannel frequency" hint="How often the agent acknowledges while listening" value={valOr(agent.backchannel_frequency, 0.8)} min={0} max={1} step={0.05} onChange={(v) => setA('backchannel_frequency', v)} />
      )}

      <FieldLabel className="mt-6">Ambient background sound</FieldLabel>
      <select className="input mt-1" value={agent.ambient_sound ?? ''} onChange={(e) => setA('ambient_sound', e.target.value || undefined)}>
        {AMBIENT_CHOICES.map(([v, l]) => <option key={v || 'none'} value={v}>{l}</option>)}
      </select>
      {agent.ambient_sound && (
        <Slider label="Ambient volume" hint="Loudness of the background sound" value={valOr(agent.ambient_sound_volume, 1)} min={0} max={2} step={0.05} onChange={(v) => setA('ambient_sound_volume', v)} />
      )}

      <FieldLabel className="mt-6">Background noise handling</FieldLabel>
      <select className="input mt-1" value={agent.denoising_mode ?? ''} onChange={(e) => setA('denoising_mode', e.target.value || undefined)}>
        {DENOISE_CHOICES.map(([v, l]) => <option key={v || 'default'} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function CallSection({ agent, setA }: any) {
  return (
    <div>
      <SectionTitle icon={PhoneCall} title="Call Settings" hint="Timing, limits and transcription." />
      <NumberField label="Max call duration (minutes)" hint="Hang up automatically after this long" value={msToMin(agent.max_call_duration_ms)} min={1} step={1} onChange={(v) => setA('max_call_duration_ms', minToMs(v))} />
      <NumberField label="End call after silence (seconds)" hint="Hang up if the line goes quiet this long" value={msToSec(agent.end_call_after_silence_ms)} min={0} step={1} onChange={(v) => setA('end_call_after_silence_ms', secToMs(v))} />
      <NumberField label="Reminder after silence (seconds)" hint="Agent nudges the caller after this much silence" value={msToSec(agent.reminder_trigger_ms)} min={0} step={1} onChange={(v) => setA('reminder_trigger_ms', secToMs(v))} />
      <NumberField label="Max reminders" hint="How many times the agent will nudge before giving up" value={agent.reminder_max_count} min={0} step={1} onChange={(v) => setA('reminder_max_count', num(v))} />
      <NumberField label="Delay before first message (seconds)" hint="Pause before the agent starts talking" value={msToSec(agent.begin_message_delay_ms)} min={0} step={0.1} onChange={(v) => setA('begin_message_delay_ms', secToMs(v))} />

      <FieldLabel className="mt-6">Transcription mode</FieldLabel>
      <select className="input mt-1" value={agent.stt_mode ?? ''} onChange={(e) => setA('stt_mode', e.target.value || undefined)}>
        {STT_CHOICES.map(([v, l]) => <option key={v || 'default'} value={v}>{l}</option>)}
      </select>

      <Toggle label="Normalize text for speech" hint="Reads numbers, dates and currency more naturally" checked={!!agent.normalize_for_speech} onChange={(v) => setA('normalize_for_speech', v)} />

      <FieldLabel className="mt-6">Boosted keywords <span className="font-normal text-slate-400">(comma-separated)</span></FieldLabel>
      <input className="input mt-1" value={arrToStr(agent.boosted_keywords)} onChange={(e) => setA('boosted_keywords', strToArr(e.target.value))} placeholder="e.g. escrow, appraisal, listing agent" />
      <p className="mt-1 text-xs text-slate-400">Names or terms the agent should recognise more reliably.</p>
    </div>
  );
}

function KnowledgeSection({ agent, setA, llm, setL, kbs, hasLlm }: any) {
  const selected: string[] = Array.isArray(llm.knowledge_base_ids) ? llm.knowledge_base_ids : [];
  const toggleKb = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setL('knowledge_base_ids', next);
  };
  const pca: any[] = Array.isArray(agent.post_call_analysis_data) ? agent.post_call_analysis_data : [];
  const setPca = (next: any[]) => setA('post_call_analysis_data', next);
  return (
    <div>
      <SectionTitle icon={BookOpen} title="Knowledge & Post-call" hint="What the agent knows and what happens after the call." />

      <FieldLabel>Knowledge bases</FieldLabel>
      {!hasLlm ? (
        <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Knowledge bases attach to the agent's LLM, which isn't editable for this agent type.</div>
      ) : kbs.length === 0 ? (
        <p className="mt-1 text-sm text-slate-400">No knowledge bases found in this workspace.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {kbs.map((k: any) => (
            <label key={k.kb_id} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition ${selected.includes(k.kb_id) ? 'border-brand bg-brand/5' : 'border-line bg-white hover:bg-surface'}`}>
              <input type="checkbox" checked={selected.includes(k.kb_id)} onChange={() => toggleKb(k.kb_id)} className="h-4 w-4 accent-[color:var(--brand,#1f6feb)]" />
              <div className="min-w-0"><div className="truncate text-sm font-semibold text-ink">{k.name}</div><div className="truncate text-[11px] text-slate-400">{k.kb_id}</div></div>
            </label>
          ))}
        </div>
      )}

      <FieldLabel className="mt-6">Webhook URL <span className="font-normal text-slate-400">(optional)</span></FieldLabel>
      <input className="input mt-1 font-mono text-xs" value={agent.webhook_url ?? ''} onChange={(e) => setA('webhook_url', e.target.value || undefined)} placeholder="https://…" />
      <p className="mt-1 text-xs text-slate-400">Where call events and results are sent after each call.</p>

      <div className="mt-6 flex items-center justify-between">
        <FieldLabel>Post-call analysis fields</FieldLabel>
        <button onClick={() => setPca([...pca, { type: 'string', name: '', description: '' }])} className="btn-ghost !py-1 text-xs">+ Add field</button>
      </div>
      <p className="mb-2 mt-1 text-xs text-slate-400">Data points the agent extracts from each call (e.g. “interested”, “callback_time”).</p>
      {pca.length === 0 ? (
        <p className="text-sm text-slate-400">None yet. Add a field to capture structured info from calls.</p>
      ) : (
        <div className="space-y-3">
          {pca.map((item: any, i: number) => (
            <div key={i} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <input className="input text-sm" value={item.name || ''} onChange={(e) => { const n = [...pca]; n[i] = { ...item, name: e.target.value }; setPca(n); }} placeholder="Field name" />
                <select className="input w-40 text-sm" value={item.type || 'string'} onChange={(e) => { const n = [...pca]; n[i] = { ...item, type: e.target.value }; setPca(n); }}>
                  {['string', 'boolean', 'number', 'enum'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => setPca(pca.filter((_, j) => j !== i))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-slate-400 hover:text-rose-600" title="Remove"><X className="h-4 w-4" /></button>
              </div>
              <input className="input mt-2 text-sm" value={item.description || ''} onChange={(e) => { const n = [...pca]; n[i] = { ...item, description: e.target.value }; setPca(n); }} placeholder="What should the agent capture here?" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestSection({ goTest, voiceLabel, name, dirty }: any) {
  return (
    <div>
      <SectionTitle icon={Play} title="Test" hint="Call the agent live and hear your changes." />
      {dirty && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">You have unsaved changes — save first so the test call uses your latest settings.</div>}
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="text-sm text-slate-600"><span className="font-semibold text-ink">{name || 'This agent'}</span> speaks with <span className="font-semibold text-ink">{voiceLabel}</span>.</div>
        <p className="mt-1 text-xs text-slate-500">Opens the Test AI console with this workspace and agent pre-selected, where you can enter a number and mock contact details.</p>
        <button onClick={goTest} className="btn-primary mt-4"><PhoneCall className="h-4 w-4" /> Open Test AI console <ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// ================= Small building blocks =================

function SectionTitle({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <div className="mb-5 flex items-start gap-3 border-b border-line pb-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand"><Icon className="h-5 w-5" /></span>
      <div><div className="text-lg font-bold text-ink">{title}</div><div className="text-sm text-slate-500">{hint}</div></div>
    </div>
  );
}
function FieldLabel({ children, className = '' }: { children: any; className?: string }) {
  return <label className={`label block ${className}`}>{children}</label>;
}
function Row({ label, value }: { label: string; value: any }) {
  return <div className="flex items-center justify-between gap-2"><dt className="text-slate-400">{label}</dt><dd className="truncate font-semibold text-ink">{String(value)}</dd></div>;
}
function Slider({ label, hint, value, min, max, step, onChange }: { label: string; hint?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between"><FieldLabel>{label}</FieldLabel><span className="text-xs font-semibold text-brand">{Number(value).toFixed(2)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[color:var(--brand,#1f6feb)]" />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      <div><FieldLabel>{label}</FieldLabel>{hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}</div>
      <button type="button" onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brand' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
function NumberField({ label, hint, value, min, step, onChange }: { label: string; hint?: string; value: any; min?: number; step?: number; onChange: (v: string) => void }) {
  return (
    <div className="mt-5">
      <FieldLabel>{label}</FieldLabel>
      <input type="number" min={min} step={step} className="input mt-1" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ---- value helpers ----
function valOr(v: any, d: number) { const n = Number(v); return isNaN(n) ? d : n; }
function mergeChoices(list: [string, string][], current?: string): [string, string][] {
  if (current == null || current === '' || list.some((x) => x[0] === current)) return list;
  return [[current, `${current} (current)`], ...list];
}
function arrToStr(a: any) { return Array.isArray(a) ? a.join(', ') : ''; }
function strToArr(s: string) { const a = s.split(',').map((x) => x.trim()).filter(Boolean); return a.length ? a : undefined; }
function msToMin(ms: any) { const n = Number(ms); return isNaN(n) ? '' : Math.round(n / 60000); }
function minToMs(v: string) { const n = Number(v); return isNaN(n) || v === '' ? undefined : Math.round(n * 60000); }
function msToSec(ms: any) { const n = Number(ms); return isNaN(n) ? '' : Math.round((n / 1000) * 10) / 10; }
function secToMs(v: string) { const n = Number(v); return isNaN(n) || v === '' ? undefined : Math.round(n * 1000); }
