// Compact "time ago" formatter for feeds, comment threads and the notification center.
// Accepts an ISO string, epoch-ms, or epoch-seconds; returns e.g. "just now", "5m", "3h", "2d", or a date.
export function relTime(v: string | number | null | undefined): string {
  if (v == null) return '';
  let ms: number;
  if (typeof v === 'number') ms = v < 1e12 ? v * 1000 : v;
  else ms = Date.parse(v);
  if (!isFinite(ms)) return String(v);
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
