# One Property Market — Outbound

Gated, multi-workspace outbound-calling analytics dashboard. Rebranded, re-platformed
replacement for the old Manus "Retell" dashboard — now running on **Vite + React + Supabase**
(no Manus, no ongoing Manus cost).

**Live target:** `outbound.1propertymarket.com`
**Stack:** Vite · React · TypeScript · Tailwind · Recharts · Supabase (Postgres + Edge Functions)

## What it does

- **Overview** — KPIs across all workspaces (calls, spend, bookings, cost/call, cost/booking), time series, top dispositions, spend by category.
- **Workspaces / Workspace Detail** — per-workspace KPIs, dispositions, sentiment, agents, LLM/TTS, spend by product.
- **Dispositions, Call History (+ Call Detail with transcript & recording), Compare, Agents & Models.**
- **AI Suggestions / Prompt Studio / Reports** — wired, switch on by adding an Anthropic/OpenAI key.
- **Users & Access (admin)** — create logins and scope exactly what each person sees: per-user **workspace** access **and** per-user **agent** visibility (`all` / `only` / `except`).

## Login

Gated by username/password (bcrypt). Seeded super-admin: `mtip@hey.com` / `Welcome123$` (change after first login).

## Backend (already deployed)

Live on the Supabase project `sehrlbmatklgghrvyxes`: Postgres (RLS-locked) + edge functions `retell-sync` (15-min pg_cron) and `api`. API base: `https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/api`. ~9,600 calls across 9 workspaces, self-updating.

## Run locally

```sh
npm install
npm run dev
```

## Deploy via Lovable

1. Create a new Lovable project connected to this repo.
2. Publish, then Project → Settings → Domains → Connect Domain → `outbound.1propertymarket.com`.
3. Add the DNS records Lovable shows you in GoDaddy for `1propertymarket.com`.

## Turning on the AI pages

Add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) as a Supabase Edge Function secret; the AI endpoints activate with no rebuild.
