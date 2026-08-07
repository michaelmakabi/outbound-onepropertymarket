// Canonical 20-status catalog — the standard pipeline stages AND the standard
// disposition set share this single source of truth (color + icon). `statusMeta`
// normalizes any free-form stage/disposition string onto one of the 20; unmatched
// strings return null so callers can fall back to their legacy heuristic.
export type StatusMeta = { label: string; color: string; icon: string };

export const STANDARD_STATUSES: StatusMeta[] = [
  { label: 'New lead',                 color: '#3b82f6', icon: 'UserPlus' },
  { label: 'No answer attempt 1',      color: '#fbbf24', icon: 'PhoneMissed' },
  { label: 'No answer attempt 2',      color: '#f59e0b', icon: 'PhoneMissed' },
  { label: 'No answer attempt 3',      color: '#f97316', icon: 'PhoneMissed' },
  { label: 'Voicemail left',           color: '#8b5cf6', icon: 'Voicemail' },
  { label: 'Call back',                color: '#06b6d4', icon: 'PhoneForwarded' },
  { label: 'Scheduled',                color: '#6366f1', icon: 'CalendarClock' },
  { label: 'Wrong number',             color: '#94a3b8', icon: 'PhoneOff' },
  { label: 'Do not call',              color: '#dc2626', icon: 'Ban' },
  { label: 'Not interested',           color: '#ef4444', icon: 'ThumbsDown' },
  { label: 'Tire kicker',              color: '#a8a29e', icon: 'Footprints' },
  { label: 'Possibly interested',      color: '#14b8a6', icon: 'Meh' },
  { label: 'Very interested',          color: '#22c55e', icon: 'Flame' },
  { label: 'Appointment booked',       color: '#10b981', icon: 'CalendarCheck' },
  { label: 'Offer sent',               color: '#0ea5e9', icon: 'Send' },
  { label: 'Pending negotiation',      color: '#eab308', icon: 'Handshake' },
  { label: 'Offer accepted',           color: '#16a34a', icon: 'BadgeCheck' },
  { label: 'Rejected',                 color: '#b91c1c', icon: 'XCircle' },
  { label: 'Deal closed successfully', color: '#15803d', icon: 'Trophy' },
  { label: 'Deal canceled',            color: '#6b7280', icon: 'Archive' },
];

const byLabel = (l: string) => STANDARD_STATUSES.find((s) => s.label === l) || null;
const norm = (s: string) => (s || '').toLowerCase().replace(/[_\-&/]+/g, ' ').replace(/\s+/g, ' ').trim();

export function statusMeta(raw: string | null | undefined): StatusMeta | null {
  if (!raw) return null;
  const k = norm(raw);
  const exact = STANDARD_STATUSES.find((s) => norm(s.label) === k);
  if (exact) return exact;
  const any = (...w: string[]) => w.some((x) => k.includes(x));
  const both = (a: string, b: string) => k.includes(a) && k.includes(b);

  if (any('no answer', 'noanswer', 'no pick', 'no contact', 'busy', 'unreachable')) {
    if (k.includes('3') || k.includes('third')) return byLabel('No answer attempt 3');
    if (k.includes('2') || k.includes('second')) return byLabel('No answer attempt 2');
    return byLabel('No answer attempt 1');
  }
  if (any('voicemail', 'left message', ' vm')) return byLabel('Voicemail left');
  if (k.includes('do not call') || k.includes('dnc')) return byLabel('Do not call');
  if (k.includes('wrong')) return byLabel('Wrong number');
  if (any('appointment', 'appt') || (k.includes('booked') && !k.includes('offer'))) return byLabel('Appointment booked');
  if (any('call back', 'callback', 'follow up', 'reschedule')) return byLabel('Call back');
  if (k.includes('schedul')) return byLabel('Scheduled');
  if (both('offer', 'accept') || k.includes('accepted')) return byLabel('Offer accepted');
  if (any('offer sent', 'offer drafted', 'offer made', 'sent offer', 'proposal', 'offer out')) return byLabel('Offer sent');
  if (any('negotiat', 'pending', 'counter')) return byLabel('Pending negotiation');
  if (any('deal closed', 'closed successfully', 'closed won', 'sold', 'won')) return byLabel('Deal closed successfully');
  if (any('cancel', 'closed lost', 'dead', 'lost')) return byLabel('Deal canceled');
  if (any('reject', 'declin')) return byLabel('Rejected');
  if (any('not interested', 'uninterested')) return byLabel('Not interested');
  if (any('tire kicker', 'kicker')) return byLabel('Tire kicker');
  if (any('very interested', 'hot lead', 'strong interest')) return byLabel('Very interested');
  if (any('possibly', 'maybe', 'lukewarm', 'warm', 'somewhat')) return byLabel('Possibly interested');
  if (k.includes('interested')) return byLabel('Possibly interested');
  if (any('new lead', 'new seller', 'fresh lead', 'brand new') || k === 'new') return byLabel('New lead');
  return null;
}

export function statusColor(raw?: string | null): string | null { return statusMeta(raw)?.color ?? null; }
export function statusIconName(raw?: string | null): string | null { return statusMeta(raw)?.icon ?? null; }
