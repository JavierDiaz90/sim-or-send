create extension if not exists pgcrypto;

create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  name text not null check (char_length(name) between 1 and 14),
  score integer not null check (score >= 0),
  remaining_ms integer not null default 0 check (remaining_ms >= 0),
  send_count integer not null default 0 check (send_count >= 0),
  contact text,
  client_ts bigint,
  sends integer not null default 0 check (sends >= 0),
  send_hits integer not null default 0 check (send_hits >= 0),
  dodges integer not null default 0 check (dodges >= 0),
  dodged_usd integer not null default 0 check (dodged_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_entries_day_rank_idx
  on public.leaderboard_entries (event_date, score desc, remaining_ms desc, created_at asc);

alter table public.leaderboard_entries enable row level security;

comment on table public.leaderboard_entries is
  'SIM OR SEND leaderboard entries. Access through Netlify Functions using the Supabase service role key.';
