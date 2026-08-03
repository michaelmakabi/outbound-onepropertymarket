# 1PropertyMarket — Outbound

Gated, multi-workspace outbound-calling analytics dashboard. Rebranded, re-platformed
replacement for the old Manus "Retell" dashboard — now running on **Vite + React + Supabase**
(no Manus, no ongoing Manus cost).

**Live target:** `outbound.1propertymarket.com`
**Stack:** Vite · React · TypeScript · Tailwind · Recharts · Supabase (Postgres + Edge Functions)

---

## What it does

- **Overview** — KPIs across all workspaces (calls, spend, bookings, cost/call, cost/booking), business-outcome tiles, time series, top dispositions, spend by category.
- **Workspaces / Workspace Detail** — per-workspace KPIs, dispositions, sentiment, agents, LLM/TTS, spend by product.
- **Dispositions** — full GHL business-outcome taxonomy (Booked / Scheduled / Interested / Not Interested / Callback / No Contact / Wrong-Spam / Talked) with cost attribution.
- **Contacts** — every phone number rolled up into one profile; repeat calls threaded together with a full timeline.
- **Call History (+ Call Detail with transcript, recording & contact-history thread), Compare, Agents & Models.**
- **AI Suggestions / Prompt Studio / Reports** — live, powered by an OpenAI key (see below).
- **Users & Access (admin)** — create logins and scope **exactly** what each person sees:
  per-user **workspace** access **and** per-user **agent** visibility (`all` / `only` / `except`).

## Login

Gated by username/password (bcrypt). Seeded super-admin:

- **Username:** `mtip@hey.com`
- **Password:** `Welcome123$`  *(change after first login via Users & Access)*

---

## Backend (already deployed)

Everything below is **live** on the Supabase project **"Retell Command Center"** (`sehrlbmatklgghrvyxes`):

- **Postgres** tables: `calls`, `users`, `sessions`, `workspaces` (holds Retell API keys),
  `agents`, `user_workspace_access`, `sync_state`, `saved_views`, `usage_sessions`, `usage_events`. All RLS-locked.
- **Edge function `retell-sync`** — pulls every workspace from the Retell API → normalizes (with enriched GHL
  dispositions: explicit custom field → job captured → spam → derived Retell reason) → Postgres.
  Runs every 15 min via `pg_cron` (incremental). Source: `supabase/functions/retell-sync/`.
- **Edge function `api`** — auth + analytics + outcomes + contacts + AI (suggestions/report/prompt) + admin,
  with access control enforced server-side. Source: `supabase/functions/api/`. Base URL:
  `https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/api`
- **Data loaded:** self-updating across all active workspaces.

Frontend talks only to the `api` function with an opaque bearer token stored in `localStorage`.

---

## Run locally

```sh
npm install
npm run dev      # http://localhost:8080
```

## Deploy

Hosted on **GitHub Pages** at `outbound.1propertymarket.com` (built by GitHub Actions on push to `main`).
No env vars required (the API base is baked in; override with `VITE_API_BASE` if the backend ever moves).

## Turning on the AI pages

`Suggestions`, `Prompt Studio`, and `Reports` use an OpenAI key. Add `OPENAI_API_KEY`
as a Supabase Edge Function secret; the AI endpoints activate — no rebuild.

## Managing keys / workspaces

Retell API keys live in the `workspaces` table (one row per workspace). Add/rotate a key there and
the next sync picks it up automatically.
