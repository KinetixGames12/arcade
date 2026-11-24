-- Arcade Chess: carry a Lichess connection across a person's devices.
-- One row per Arcade account holding the Lichess OAuth key (scopes: board:play,
-- challenge:read, challenge:write — it can play games, not change the
-- Lichess account). Written by chess/sync.js.
--
-- Owner-only in every direction; anon gets nothing.
create table if not exists public.lichess_links (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  lichess_token    text not null check (char_length(lichess_token) between 10 and 200),
  lichess_username text check (lichess_username is null or lichess_username ~ '^[A-Za-z0-9_-]{2,30}$'),
  updated_at       timestamptz not null default now()
);

alter table public.lichess_links enable row level security;

create policy lichess_links_select_own on public.lichess_links
  for select to authenticated using (user_id = (select auth.uid()));
create policy lichess_links_insert_own on public.lichess_links
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy lichess_links_update_own on public.lichess_links
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy lichess_links_delete_own on public.lichess_links
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.lichess_links from anon;
revoke all on public.lichess_links from public;
grant select, insert, update, delete on public.lichess_links to authenticated;

-- Server-owned timestamp; a row can never be handed to another account.
create or replace function public.lichess_links_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lichess_links_before_write on public.lichess_links;
create trigger lichess_links_before_write
  before insert or update on public.lichess_links
  for each row execute function public.lichess_links_before_write();

revoke all on function public.lichess_links_before_write() from public;
