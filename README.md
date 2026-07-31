# One Property Market — Outbound

Gated, multi-workspace outbound-calling analytics dashboard. Rebranded, re-platformed
replacement for the old Manus "Retell" dashboard — now running on **Vite + React + Supabase**
(no Manus, no ongoing Manus cost). Deployed free via GitHub Pages.

**Live:** `outbound.1propertymarket.com`
**Stack:** Vite · React · TypeScript · Tailwind · Recharts · Supabase (Postgres + Edge Functions)

## What it does

- **Overview** — KPIs across all workspaces (calls, spend, bookings, cost/call, cost/booking), time series, top dispositions, spend by category.
- **Workspaces / Workspace Detail** — per-workspace KPIs, dispositions, sentiment, agents, LLM/TTS, spend by product.
- **Dispositions, Call History (+ Call Detail with transcript & recording), Compare, Agents & Models.**
- **AI Suggestions / Prompt Studio / Reports** — wired, switch on by adding an Anthropic/OpenAI key.
- **Users & Access (admin)** — create logins and scope exactly what each person sees: per-user **workspace** access **and** per-user **agent** visibility (`all` / `only` / `except`).

## Login

Gated by username/password (bcrypt). A super-admin account was seeded during setup and its
credentials were shared privately. Create more logins and scope their access from the in-app
**Users & Access** screen.

## Backend

Live on the Supabase project `sehrlbmatklgghrvyxes`: Postgres (RLS-locked) + edge functions
`retell-sync` (15-min pg_cron) and `api`. API base: `https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/api`.
~9,600 calls across 9 workspaces, self-updating. No API keys live in this repo — the backend reads
them from the database / Supabase secrets.

## Run locally

```sh
npm install
npm run dev
```

## Hosting

Deployed via GitHub Pages (`.github/workflows/deploy.yml`) on every push to `main`, served at the
custom domain in `public/CNAME`. Turning on the AI pages: add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`)
as a Supabase Edge Function secret — no rebuild needed.
