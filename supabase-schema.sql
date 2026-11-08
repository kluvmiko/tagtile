-- Run this once in Supabase Dashboard > SQL Editor.
create table if not exists public.tagtiles (
  id text primary key check (id ~ '^tt-[a-f0-9]{16}$'),
  data jsonb not null default '{}'::jsonb,
  edit_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tagtiles_created_at_idx on public.tagtiles (created_at desc);

-- The browser never talks directly to this table. All reads/writes go through
-- the Netlify Function, which uses the service-role key kept server-side.
alter table public.tagtiles enable row level security;
revoke all on public.tagtiles from anon, authenticated;
