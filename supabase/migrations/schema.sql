-- One Property Market — Outbound: full schema (already applied to project sehrlbmatklgghrvyxes)
do $$ begin create type user_role as enum ('user','admin','super_admin'); exception when duplicate_object then null; end $$;

create table if not exists users (
  id bigserial primary key, open_id varchar(64) not null unique, name text, email varchar(320),
  login_method varchar(64), role user_role not null default 'user', username varchar(120) unique,
  password_hash varchar(255), disabled boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_signed_in timestamptz not null default now());

create table if not exists calls (
  call_id varchar(80) primary key, workspace varchar(64) not null, agent_id varchar(80), agent_name varchar(255),
  agent_version int, call_type varchar(32), direction varchar(16), call_status varchar(32),
  start_timestamp bigint, end_timestamp bigint, duration_seconds double precision not null default 0,
  combined_cost_cents double precision not null default 0, product_costs jsonb, disposition varchar(80),
  disposition_source varchar(16), user_sentiment varchar(32), call_successful boolean, in_voicemail boolean,
  disconnection_reason varchar(64), from_number varchar(32), to_number varchar(32), llm_product varchar(80),
  tts_product varchar(80), recording_url text, public_log_url text, transcript text, transcript_object jsonb,
  call_summary text, synced_at timestamptz not null default now());
create index if not exists calls_ws_idx on calls (workspace);
create index if not exists calls_ws_start_idx on calls (workspace, start_timestamp);
create index if not exists calls_disp_idx on calls (disposition);
create index if not exists calls_agent_idx on calls (agent_id);

create table if not exists workspaces (
  slug varchar(64) primary key, display_name varchar(255) not null, api_key text not null,
  status varchar(32) not null default 'active', sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists agents (
  workspace varchar(64) not null, agent_id varchar(80) not null, agent_name varchar(255),
  last_seen_ms bigint, primary key (workspace, agent_id));

create table if not exists user_workspace_access (
  id bigserial primary key, user_id bigint not null, workspace varchar(64) not null,
  agent_mode varchar(8) not null default 'all' check (agent_mode in ('all','only','except')),
  agent_ids jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (user_id, workspace));

create table if not exists sessions (
  token text primary key, user_id bigint not null, created_at timestamptz not null default now(),
  expires_at timestamptz not null, last_seen_at timestamptz not null default now());

create table if not exists sync_state (
  workspace varchar(64) primary key, last_synced_at bigint, newest_call_ms bigint,
  total_calls int not null default 0, last_status varchar(255), updated_at timestamptz not null default now());

alter table users enable row level security;
alter table calls enable row level security;
alter table workspaces enable row level security;
alter table agents enable row level security;
alter table user_workspace_access enable row level security;
alter table sessions enable row level security;
alter table sync_state enable row level security;
