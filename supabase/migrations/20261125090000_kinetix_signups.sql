-- Username sign-ups (no email). The kinetix-signup edge function creates
-- confirmed accounts with the service role and logs a hashed IP here so one
-- address can't mass-create accounts. Nobody but the service role can touch it.
create table if not exists public.kx_signups (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index if not exists kx_signups_ip on public.kx_signups (ip_hash, created_at desc);
alter table public.kx_signups enable row level security;
revoke all on public.kx_signups from anon, authenticated, public;
