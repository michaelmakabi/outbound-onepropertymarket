-- One Property Market — Outbound: leads / per-phone contacts / notes / pipelines.
-- Additive, namespaced opm_*. Applied live to project sehrlbmatklgghrvyxes.
-- Every phone number (owner + relationship) is its own dialable contact record.

create table if not exists opm_pipelines (
  id bigserial primary key,
  workspace varchar(64) not null default 'pitman',
  name varchar(160) not null,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace, name));

create table if not exists opm_stages (
  id bigserial primary key,
  pipeline_id bigint not null references opm_pipelines(id) on delete cascade,
  name varchar(160) not null,
  sort_order int not null default 0,
  color varchar(16) not null default '#64748b',
  created_at timestamptz not null default now());
create index if not exists opm_stages_pipe_idx on opm_stages(pipeline_id);

create table if not exists opm_leads (
  lead_id varchar(64) primary key,
  workspace varchar(64) not null default 'pitman',
  name text, first_name text, last_name text,
  lead_source text, assigned_to text, crm_stage text,
  pipeline_id bigint references opm_pipelines(id) on delete set null,
  stage_id bigint references opm_stages(id) on delete set null,
  listing_price numeric, deal_price numeric,
  property_ref text,
  property jsonb not null default '{}'::jsonb,
  parcel jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  disposition_flags jsonb not null default '{}'::jsonb,
  relationships jsonb not null default '[]'::jsonb,
  addresses jsonb not null default '[]'::jsonb,
  emails jsonb not null default '[]'::jsonb,
  background text,
  date_added text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create index if not exists opm_leads_ws_idx on opm_leads(workspace);
create index if not exists opm_leads_pipe_idx on opm_leads(pipeline_id, stage_id);

create table if not exists opm_contacts (
  contact_id varchar(80) primary key,
  lead_id varchar(64) not null references opm_leads(lead_id) on delete cascade,
  workspace varchar(64) not null default 'pitman',
  name text, first_name text, last_name text, email text,
  phone varchar(20) not null,
  phone_channel varchar(16) not null default 'unknown',
  phone_label text,
  phone_verified boolean not null default false,
  is_primary_number boolean not null default false,
  is_primary_contact boolean not null default false,
  do_not_call boolean not null default false,
  contact_kind varchar(16) not null default 'owner',   -- owner | relative
  related_name text,
  relation_type text,
  dialable boolean not null default true,
  created_at timestamptz not null default now(),
  unique (lead_id, phone));
create index if not exists opm_contacts_lead_idx on opm_contacts(lead_id);
create index if not exists opm_contacts_phone_idx on opm_contacts(phone);
create index if not exists opm_contacts_kind_idx on opm_contacts(contact_kind);

create table if not exists opm_notes (
  id bigserial primary key,
  lead_id varchar(64) not null references opm_leads(lead_id) on delete cascade,
  author text, note_date text, ts timestamptz,
  body_text text, body_html text,
  source varchar(16) not null default 'import',   -- import | manual | ai | call
  call_id varchar(80), recording_url text, metadata jsonb,
  created_at timestamptz not null default now());
create index if not exists opm_notes_lead_idx on opm_notes(lead_id, ts desc);

create table if not exists opm_lists (
  id bigserial primary key, workspace varchar(64) not null default 'pitman',
  name varchar(200) not null, source_filename text,
  row_count int not null default 0, contact_count int not null default 0,
  created_at timestamptz not null default now());
create table if not exists opm_list_members (
  list_id bigint not null references opm_lists(id) on delete cascade,
  contact_id varchar(80) not null references opm_contacts(contact_id) on delete cascade,
  primary key (list_id, contact_id));

alter table opm_pipelines enable row level security;
alter table opm_stages enable row level security;
alter table opm_leads enable row level security;
alter table opm_contacts enable row level security;
alter table opm_notes enable row level security;
alter table opm_lists enable row level security;
alter table opm_list_members enable row level security;
