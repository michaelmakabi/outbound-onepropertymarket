# Backend (Supabase)

This app's backend is **already deployed** on the Supabase project `sehrlbmatklgghrvyxes`
("Retell Command Center"). Lovable only builds the frontend; nothing here needs to run at build time.

## Edge functions (deployed, `verify_jwt=false`)

- **`retell-sync`** — pulls all workspaces from the Retell API (v3 list-calls), normalizes calls,
  upserts into Postgres, discovers agents, updates sync state. `mode=full` re-pulls history;
  `mode=incremental` (default) only fetches new calls. Runs every 15 min via `pg_cron`.
- **`api`** — auth (opaque bearer sessions) + analytics + admin. All access control (per-user
  workspace + per-user agent scope) is enforced here. Frontend base URL:
  `https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/api`

Full TypeScript source for both functions ships in the project handoff archive and is deployed live.

## Database

`migrations/schema.sql` documents every table. All tables have RLS enabled with no public policies —
only the edge functions (service role) can read/write. Retell API keys live in the `workspaces` table.

## Secrets to set (Supabase → Edge Functions → Secrets)

- `SYNC_SECRET` *(optional)* — if set, `retell-sync` requires header `x-sync-secret`.
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — activates the AI pages (Suggestions, Prompt Studio, Reports).
