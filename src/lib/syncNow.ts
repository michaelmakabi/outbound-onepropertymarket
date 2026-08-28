// On-demand Retell sync client — talks to the standalone `opm-sync-now` edge function so the live
// campaign view can pull fresh call outcomes (dispositions, recordings, cost) within seconds instead
// of waiting for the periodic cron. Kept in its own module so the huge api.ts stays untouched.
// The backend is throttled per-workspace, so it's safe to call this on every UI refresh — it no-ops
// when the workspace was synced very recently.
import { tokenStore } from './api';

const SYNC_BASE =
  (import.meta as any).env?.VITE_OPMSYNC_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-sync-now') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-sync-now');

// Fire-and-forget: trigger an incremental sync for one workspace. Never rejects — a failed sync must
// not disturb the live view (the periodic cron is the safety net).
export function syncWorkspaceNow(workspace: string): Promise<{ ok: boolean; skipped?: boolean; fetched?: number }> {
  if (!workspace) return Promise.resolve({ ok: false });
  const url = new URL(SYNC_BASE);
  url.searchParams.set('workspace', workspace);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url.toString(), { method: 'POST', headers })
    .then((r) => r.json().catch(() => ({ ok: false })))
    .catch(() => ({ ok: false }));
}
