// Rich formatting + color helpers (ported from retell-command-center, adapted to the OPM light theme).

export function usd(n: number, opts?: { precise?: boolean }): string {
  if (!isFinite(n)) return '$0.00';
  const digits = opts?.precise ? 3 : n >= 1000 ? 0 : 2;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function num(n: number): string {
  return Math.round(n || 0).toLocaleString('en-US');
}

export function pct(n: number, digits = 1): string {
  return `${(n || 0).toFixed(digits)}%`;
}

/** rate given as 0..1 */
export function ratePct(n0to1: number, digits = 1): string {
  return `${((n0to1 || 0) * 100).toFixed(digits)}%`;
}

export function secs(s: number): string {
  s = s || 0;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

export function mins(s: number): string {
  return `${((s || 0) / 60).toFixed(1)} min`;
}

export function dateTime(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
}

export function humanizeProduct(p: string | null): string {
  if (!p) return '—';
  return p
    .replace(/_/g, ' ')
    .replace(/\bgpt\b/gi, 'GPT')
    .replace(/\btts\b/gi, 'TTS')
    .replace(/\bllm\b/gi, 'LLM')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanizeDisposition(d: string | null): string {
  if (!d) return '—';
  return d.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Stable color for a disposition by semantic meaning (hex, light theme). */
export function dispositionColor(d: string): string {
  const k = (d || '').toLowerCase();
  if (k.includes('appointment') || k.includes('booked') || k.includes('transfer') || (k.includes('interested') && !k.includes('not_interested')))
    return '#16a34a'; // green
  if (k.includes('follow') || k.includes('call_back') || k.includes('callback') || k.includes('send_more'))
    return '#d97706'; // amber
  if (k.includes('voicemail')) return '#2563eb'; // blue
  if (k.includes('no_answer') || k.includes('busy') || k.includes('inactivity') || k.includes('no_contact'))
    return '#94a3b8'; // gray
  if (k.includes('not_interested') || k.includes('do_not_call') || k.includes('declined') || k.includes('wrong') || k.includes('failed') || k.includes('hangup'))
    return '#dc2626'; // red
  return '#6366f1'; // indigo fallback
}

/** Category colors for product cost charts. */
export const CAT_COLORS: Record<string, string> = {
  LLM: '#1f6feb',
  TTS: '#7c3aed',
  Telephony: '#0891b2',
  'Voice Engine': '#059669',
  Other: '#94a3b8',
};

export const CHART_PALETTE = ['#1f6feb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

/** Shared recharts tooltip style. */
export const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid #e6eaf0',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 4px 24px rgba(11,18,32,0.10)',
  color: '#0b1220',
} as const;
