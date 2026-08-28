// Shared helpers + tags for surfacing, on every call log, WHICH of our caller-ID numbers was on our
// side of the conversation, and whether the call was AI or human-initiated (which agent / which user).
// Used across the lead profile, Call History, the single-call view and the contacts list so the same
// information reads identically everywhere.
import { PhoneOutgoing, PhoneIncoming, Bot, UserRound, Radio } from 'lucide-react';

const digits = (p: any) => String(p ?? '').replace(/\D/g, '');
export function fmtPhone(p: any): string {
  const d = digits(p).slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (p ? String(p) : '—');
}
const isInbound = (c: any) => String(c?.direction || '').toLowerCase().startsWith('in');

// OUR number = the 1PM caller-ID on our side of the call. For an outbound call that's the from_number
// (the line we dialed FROM); for an inbound call it's the to_number (the line they called). The
// backend may also send it pre-computed as `our_number`.
export function ourCallNumber(c: any): string | null {
  if (c?.our_number) return c.our_number;
  return (isInbound(c) ? c?.to_number : c?.from_number) || null;
}
// THEIR number = the contact's number (the other side).
export function theirCallNumber(c: any): string | null {
  if (c?.their_number) return c.their_number;
  return (isInbound(c) ? c?.from_number : c?.to_number) || null;
}

export type Initiator = { mode: 'ai' | 'manual'; kind: string; label: string; agent: string; who: string };

// Who/what placed the call. Uses call metadata (source / launched_by) when present, and degrades to
// the agent name when it isn't. 'Drip' is the campaign engine; any other launched_by is a real user.
export function callInitiator(c: any): Initiator {
  const md = (c && typeof c.metadata === 'object' && c.metadata) ? c.metadata : {};
  const source = md.source || c?.source || '';
  const launchedBy = md.launched_by || c?.launched_by || '';
  const agent = c?.agent_name || '';
  const inbound = isInbound(c);
  const isTest = source === 'test-ai' || md.test === true || md.test === 'true';
  const person = launchedBy && !['drip', 'system', 'test-ai', ''].includes(String(launchedBy).toLowerCase()) ? launchedBy : '';

  if (inbound) return { mode: 'ai', kind: 'inbound', label: agent ? `AI answered · ${agent}` : 'Inbound', agent, who: agent };
  if (isTest) return { mode: 'ai', kind: 'test', label: `AI test${person ? ` · ${person}` : ''}`, agent, who: person };
  if (person) return { mode: 'ai', kind: 'user', label: `AI dial · ${person}`, agent, who: person };
  if (source === 'opm-campaign' || String(launchedBy).toLowerCase() === 'drip') return { mode: 'ai', kind: 'campaign', label: agent ? `AI campaign · ${agent}` : 'AI campaign', agent, who: 'Campaign' };
  if (agent) return { mode: 'ai', kind: 'ai', label: `AI · ${agent}`, agent, who: agent };
  return { mode: 'manual', kind: 'manual', label: launchedBy ? `Manual · ${launchedBy}` : 'Manual call', agent: '', who: launchedBy };
}

// Compact pill showing the number on OUR side of the call, clearly labelled as ours.
export function OurLineTag({ c, className = '' }: { c: any; className?: string }) {
  const n = ourCallNumber(c);
  if (!n) return null;
  const inbound = isInbound(c);
  return (
    <span
      title={inbound ? 'They called this number of yours' : 'We called from this number of yours'}
      className={`inline-flex items-center gap-1 rounded-md border border-brand/25 bg-brand-light/30 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand ${className}`}
    >
      {inbound ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}
      <span className="not-italic">{inbound ? 'on' : 'via'}</span> {fmtPhone(n)}
    </span>
  );
}

// Badge saying whether the call was AI (and which agent / campaign / user) or a manual human call.
export function InitiatorTag({ c, className = '' }: { c: any; className?: string }) {
  const info = callInitiator(c);
  const ai = info.mode === 'ai';
  const Icon = info.kind === 'campaign' ? Radio : info.kind === 'user' ? UserRound : ai ? Bot : UserRound;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${ai ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'} ${className}`}
    >
      <Icon className="h-3 w-3" /> {info.label}
    </span>
  );
}
