-- Arcade Fantasy (NFL + NBA): leagues, live snake drafts, rosters, lineups,
-- waivers, trades, matchups and playoffs.
--
-- Security model: league members can READ their league's rows (row level
-- security via fantasy_is_member). Every WRITE goes through the
-- security-definer functions below, which check who is calling and enforce
-- the rules (whose turn it is, roster limits, lineup locks, trade review…).
-- Sports data (players, current week, lock times) is public and written only
-- by the fantasy-sync edge function (service role) on a pg_cron schedule.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.config (key text primary key, value text not null);
insert into private.config (key, value)
values ('cron_key', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- ───────────────────────── sports data ─────────────────────────
create table public.fantasy_state (
  sport       text primary key check (sport in ('nfl', 'nba')),
  season      text not null,
  week        int  not null,
  season_type text not null default 'regular',
  locks       jsonb not null default '{}'::jsonb,   -- {TEAM: lock time} for the current week
  players_at  timestamptz,
  updated_at  timestamptz not null default now()
);

create table public.fantasy_players (
  sport      text not null check (sport in ('nfl', 'nba')),
  player_id  text not null,
  name       text not null,
  pos        text,
  positions  text[] not null default '{}',
  team       text,
  adp        numeric,
  proj       numeric,
  injury     text,
  updated_at timestamptz not null default now(),
  primary key (sport, player_id)
);
create index fantasy_players_adp on public.fantasy_players (sport, adp);

alter table public.fantasy_state enable row level security;
alter table public.fantasy_players enable row level security;
create policy fantasy_state_read on public.fantasy_state for select to anon, authenticated using (true);
create policy fantasy_players_read on public.fantasy_players for select to anon, authenticated using (true);
revoke all on public.fantasy_state, public.fantasy_players from anon, authenticated, public;
grant select on public.fantasy_state, public.fantasy_players to anon, authenticated;

-- ───────────────────────── leagues ─────────────────────────
create table public.fantasy_leagues (
  id           uuid primary key default gen_random_uuid(),
  sport        text not null check (sport in ('nfl', 'nba')),
  season       text not null,
  name         text not null check (char_length(name) between 2 and 40),
  commissioner uuid not null references auth.users (id) on delete cascade,
  invite_code  text not null unique,
  settings     jsonb not null,
  status       text not null default 'pre_draft' check (status in ('pre_draft', 'drafting', 'in_season', 'complete')),
  draft        jsonb not null default '{}'::jsonb,   -- {order:[team ids], pick, deadline, paused, remaining}
  start_week   int,
  playoffs     jsonb,                                 -- {seeds:[team ids], round, champion}
  created_at   timestamptz not null default now()
);

create table public.fantasy_teams (
  id              uuid primary key default gen_random_uuid(),
  league_id       uuid not null references public.fantasy_leagues (id) on delete cascade,
  owner           uuid references auth.users (id) on delete set null,
  is_bot          boolean not null default false,
  name            text not null check (char_length(name) between 2 and 30),
  color           text not null default '#7b5cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  roster          text[] not null default '{}',
  waiver_priority int,
  faab            int not null default 100,
  created_at      timestamptz not null default now(),
  unique (league_id, owner)
);
create index fantasy_teams_league on public.fantasy_teams (league_id);
create index fantasy_teams_owner on public.fantasy_teams (owner);

create table public.fantasy_queue (
  team_id   uuid primary key references public.fantasy_teams (id) on delete cascade,
  owner     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  players   text[] not null default '{}' check (cardinality(players) <= 300),
  autodraft boolean not null default false
);

create table public.fantasy_picks (
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  pick_no   int not null,
  round     int not null,
  team_id   uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id text not null,
  auto      boolean not null default false,
  made_at   timestamptz not null default now(),
  primary key (league_id, pick_no),
  unique (league_id, player_id)
);

create table public.fantasy_lineups (
  team_id  uuid not null references public.fantasy_teams (id) on delete cascade,
  week     int not null,
  starters text[] not null,
  primary key (team_id, week)
);

create table public.fantasy_matchups (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.fantasy_leagues (id) on delete cascade,
  week          int not null,
  home          uuid not null references public.fantasy_teams (id) on delete cascade,
  away          uuid references public.fantasy_teams (id) on delete cascade,
  home_score    numeric,
  away_score    numeric,
  home_cats     jsonb,
  away_cats     jsonb,
  winner        uuid,
  final         boolean not null default false,
  playoff_round int,
  unique (league_id, week, home)
);
create index fantasy_matchups_league on public.fantasy_matchups (league_id, week);

create table public.fantasy_waivers (
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  player_id text not null,
  until     timestamptz not null,
  primary key (league_id, player_id)
);

create table public.fantasy_claims (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.fantasy_leagues (id) on delete cascade,
  team_id     uuid not null references public.fantasy_teams (id) on delete cascade,
  add_player  text not null,
  drop_player text,
  bid         int not null default 0 check (bid >= 0),
  status      text not null default 'pending' check (status in ('pending', 'won', 'lost', 'failed', 'cancelled')),
  note        text,
  created_at  timestamptz not null default now()
);
create index fantasy_claims_league on public.fantasy_claims (league_id, status);

create table public.fantasy_trades (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.fantasy_leagues (id) on delete cascade,
  from_team    uuid not null references public.fantasy_teams (id) on delete cascade,
  to_team      uuid not null references public.fantasy_teams (id) on delete cascade,
  give         text[] not null default '{}',
  get          text[] not null default '{}',
  message      text check (message is null or char_length(message) <= 300),
  status       text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'cancelled', 'vetoed', 'completed', 'failed')),
  note         text,
  review_until timestamptz,
  vetoes       uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index fantasy_trades_league on public.fantasy_trades (league_id, status);

create table public.fantasy_transactions (
  id         bigint generated always as identity primary key,
  league_id  uuid not null references public.fantasy_leagues (id) on delete cascade,
  kind       text not null,
  team_id    uuid references public.fantasy_teams (id) on delete cascade,
  other_team uuid references public.fantasy_teams (id) on delete cascade,
  adds       text[] not null default '{}',
  drops      text[] not null default '{}',
  note       text,
  created_at timestamptz not null default now()
);
create index fantasy_tx_league on public.fantasy_transactions (league_id, created_at desc);

create table public.fantasy_chat (
  id         bigint generated always as identity primary key,
  league_id  uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index fantasy_chat_league on public.fantasy_chat (league_id, id desc);

-- ───────────────────────── access helpers ─────────────────────────
create or replace function public.fantasy_is_member(p_league uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fantasy_teams t where t.league_id = p_league and t.owner = (select auth.uid()));
$$;

create or replace function public.fantasy_owns_team(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fantasy_teams t where t.id = p_team and t.owner = (select auth.uid()));
$$;

create or replace function public.fantasy_is_commish(p_league uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fantasy_leagues l where l.id = p_league and l.commissioner = (select auth.uid()));
$$;

alter table public.fantasy_leagues enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.fantasy_queue enable row level security;
alter table public.fantasy_picks enable row level security;
alter table public.fantasy_lineups enable row level security;
alter table public.fantasy_matchups enable row level security;
alter table public.fantasy_waivers enable row level security;
alter table public.fantasy_claims enable row level security;
alter table public.fantasy_trades enable row level security;
alter table public.fantasy_transactions enable row level security;
alter table public.fantasy_chat enable row level security;

create policy fl_read on public.fantasy_leagues for select to authenticated using (public.fantasy_is_member(id));
create policy ft_read on public.fantasy_teams for select to authenticated using (public.fantasy_is_member(league_id));
create policy fp_read on public.fantasy_picks for select to authenticated using (public.fantasy_is_member(league_id));
create policy fm_read on public.fantasy_matchups for select to authenticated using (public.fantasy_is_member(league_id));
create policy fw_read on public.fantasy_waivers for select to authenticated using (public.fantasy_is_member(league_id));
create policy ftx_read on public.fantasy_transactions for select to authenticated using (public.fantasy_is_member(league_id));
create policy flu_read on public.fantasy_lineups for select to authenticated
  using (exists (select 1 from public.fantasy_teams t where t.id = team_id and public.fantasy_is_member(t.league_id)));
-- Waiver claims are private to the team that made them.
create policy fc_read on public.fantasy_claims for select to authenticated using (public.fantasy_owns_team(team_id));
-- Pending offers are visible to the two teams and the commissioner; settled trades to the whole league.
create policy ftr_read on public.fantasy_trades for select to authenticated using (
  public.fantasy_is_member(league_id) and (
    status not in ('proposed', 'cancelled', 'rejected')
    or public.fantasy_owns_team(from_team) or public.fantasy_owns_team(to_team)
    or public.fantasy_is_commish(league_id)));
-- Draft queue: owner only, read and write.
create policy fq_own on public.fantasy_queue for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()) and public.fantasy_owns_team(team_id));
-- Chat: members read and post as themselves.
create policy fch_read on public.fantasy_chat for select to authenticated using (public.fantasy_is_member(league_id));
create policy fch_post on public.fantasy_chat for insert to authenticated
  with check (user_id = (select auth.uid()) and public.fantasy_is_member(league_id));

revoke all on public.fantasy_leagues, public.fantasy_teams, public.fantasy_queue, public.fantasy_picks,
  public.fantasy_lineups, public.fantasy_matchups, public.fantasy_waivers, public.fantasy_claims,
  public.fantasy_trades, public.fantasy_transactions, public.fantasy_chat from anon, authenticated, public;
grant select on public.fantasy_leagues, public.fantasy_teams, public.fantasy_picks, public.fantasy_lineups,
  public.fantasy_matchups, public.fantasy_waivers, public.fantasy_claims, public.fantasy_trades,
  public.fantasy_transactions, public.fantasy_chat to authenticated;
grant select, insert, update on public.fantasy_queue to authenticated;
grant insert on public.fantasy_chat to authenticated;

-- ───────────────────────── rules ─────────────────────────
create or replace function private.max_week(p_sport text) returns int language sql immutable as $$
  select case p_sport when 'nfl' then 18 else 25 end;
$$;

create or replace function private.slot_ok(p_slot text, p_pos text[]) returns boolean language sql immutable as $$
  select case p_slot
    when 'FLEX'  then p_pos && array['RB', 'WR', 'TE']
    when 'SFLEX' then p_pos && array['QB', 'RB', 'WR', 'TE']
    when 'G'     then p_pos && array['PG', 'SG']
    when 'F'     then p_pos && array['SF', 'PF']
    when 'UTIL'  then cardinality(p_pos) > 0
    else p_slot = any (p_pos) end;
$$;

create or replace function private.slots(p_settings jsonb) returns text[] language sql immutable as $$
  select array(select jsonb_array_elements_text(p_settings -> 'slots'));
$$;

create or replace function private.max_roster(p_settings jsonb) returns int language sql immutable as $$
  select jsonb_array_length(p_settings -> 'slots') + (p_settings ->> 'bench')::int;
$$;

create or replace function private.clean_settings(p_sport text, s jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  allowed text[] := case p_sport when 'nfl' then array['QB','RB','WR','TE','FLEX','SFLEX','K','DEF']
                                 else array['PG','SG','G','SF','PF','F','C','UTIL'] end;
  v_slots jsonb := coalesce(s -> 'slots', case p_sport
    when 'nfl' then '["QB","RB","RB","WR","WR","TE","FLEX","K","DEF"]'
    else '["PG","SG","G","SF","PF","F","C","C","UTIL","UTIL"]' end::jsonb);
  x text;
  v_teams int := coalesce((s ->> 'teams')::int, 10);
  v_bench int := coalesce((s ->> 'bench')::int, case p_sport when 'nfl' then 6 else 3 end);
  v_scoring text := coalesce(s ->> 'scoring', case p_sport when 'nfl' then 'ppr' else 'points' end);
  v_pick int := coalesce((s ->> 'pick_seconds')::int, 90);
  v_waiver text := coalesce(s ->> 'waiver', 'rolling');
  v_budget int := coalesce((s ->> 'faab_budget')::int, 100);
  v_review text := coalesce(s ->> 'trade_review', 'commish');
  v_pteams int := coalesce((s ->> 'playoff_teams')::int, 4);
  v_pstart int := coalesce((s ->> 'playoff_start')::int, case p_sport when 'nfl' then 15 else 22 end);
  v_deadline int := nullif(s ->> 'trade_deadline', '')::int;
begin
  if jsonb_typeof(v_slots) <> 'array' or jsonb_array_length(v_slots) not between 1 and 20 then
    raise exception 'Pick between 1 and 20 starting spots';
  end if;
  for x in select jsonb_array_elements_text(v_slots) loop
    if not x = any (allowed) then raise exception 'Unknown roster spot %', x; end if;
  end loop;
  if v_teams not between 2 and 16 then raise exception 'Leagues have 2 to 16 teams'; end if;
  if v_bench not between 0 and 15 then raise exception 'The bench holds 0 to 15 players'; end if;
  if (p_sport = 'nfl' and v_scoring not in ('ppr', 'half_ppr', 'std'))
     or (p_sport = 'nba' and v_scoring not in ('points', 'cats')) then
    raise exception 'Unknown scoring type %', v_scoring;
  end if;
  if v_pick not between 10 and 86400 then raise exception 'The pick timer must be 10 seconds to 24 hours'; end if;
  if v_waiver not in ('rolling', 'faab') then raise exception 'Waivers are rolling or FAAB'; end if;
  if v_budget not between 0 and 1000 then raise exception 'FAAB budget must be 0 to 1000'; end if;
  if v_review not in ('none', 'commish', 'league') then raise exception 'Unknown trade review'; end if;
  if v_pteams not in (0, 2, 4, 6, 8) or v_pteams > v_teams then raise exception 'Playoffs take 0, 2, 4, 6 or 8 teams (no more than the league has)'; end if;
  if v_pstart not between 2 and private.max_week(p_sport) then raise exception 'Playoffs must start between week 2 and %', private.max_week(p_sport); end if;
  if v_deadline is not null and v_deadline not between 1 and private.max_week(p_sport) then raise exception 'Bad trade deadline week'; end if;
  return jsonb_build_object('teams', v_teams, 'slots', v_slots, 'bench', v_bench, 'scoring', v_scoring,
    'pick_seconds', v_pick, 'waiver', v_waiver, 'faab_budget', v_budget, 'trade_review', v_review,
    'playoff_teams', v_pteams, 'playoff_start', v_pstart, 'trade_deadline', v_deadline);
end;
$$;

create or replace function private.cur_week(p_sport text) returns int language plpgsql stable set search_path = '' as $$
declare w int;
begin
  select week into w from public.fantasy_state where sport = p_sport;
  if w is null then raise exception 'Season data has not loaded yet. Try again in a few minutes.'; end if;
  return w;
end;
$$;

create or replace function private.is_locked(p_sport text, p_player text) returns boolean language sql stable set search_path = '' as $$
  select coalesce((
    select (s.locks ->> p.team)::timestamptz <= now()
    from public.fantasy_state s join public.fantasy_players p on p.sport = s.sport and p.player_id = p_player
    where s.sport = p_sport), false);
$$;

create or replace function private.log(p_league uuid, p_kind text, p_team uuid, p_adds text[], p_drops text[], p_other uuid default null, p_note text default null)
returns void language sql set search_path = '' as $$
  insert into public.fantasy_transactions (league_id, kind, team_id, other_team, adds, drops, note)
  values (p_league, p_kind, p_team, p_other, coalesce(p_adds, '{}'), coalesce(p_drops, '{}'), p_note);
$$;

create or replace function private.invite_code() returns text language plpgsql volatile set search_path = '' as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from public.fantasy_leagues where invite_code = c);
  end loop;
  return c;
end;
$$;

-- Best lineup by projection; specific spots first, flex spots last.
create or replace function private.best_lineup(p_team uuid) returns text[] language plpgsql stable set search_path = '' as $$
declare t public.fantasy_teams; l public.fantasy_leagues; s text[]; res text[]; used text[] := '{}'; i int; pid text;
begin
  select * into t from public.fantasy_teams where id = p_team;
  select * into l from public.fantasy_leagues where id = t.league_id;
  s := private.slots(l.settings);
  res := array_fill(null::text, array[cardinality(s)]);
  for i in select g from generate_subscripts(s, 1) g order by (s[g] in ('FLEX', 'SFLEX', 'G', 'F', 'UTIL')), g loop
    select p.player_id into pid
    from unnest(t.roster) r(x) join public.fantasy_players p on p.sport = l.sport and p.player_id = r.x
    where not (p.player_id = any (used)) and private.slot_ok(s[i], p.positions)
    order by (coalesce(p.injury, '') in ('Out', 'IR', 'PUP', 'Suspended', 'NA')), p.proj desc nulls last
    limit 1;
    res[i] := pid;
    if pid is not null then used := used || pid; end if;
  end loop;
  return res;
end;
$$;

-- The lineup that counts for a week: the latest one saved for that week or
-- earlier, minus anyone no longer on the roster; else the best by projection.
create or replace function private.lineup(p_team uuid, p_week int) returns text[] language plpgsql stable set search_path = '' as $$
declare st text[]; ros text[];
begin
  select starters into st from public.fantasy_lineups where team_id = p_team and week <= p_week order by week desc limit 1;
  if st is null then return private.best_lineup(p_team); end if;
  select roster into ros from public.fantasy_teams where id = p_team;
  return array(select case when x = any (ros) then x end from unnest(st) with ordinality u(x, o) order by o);
end;
$$;

create or replace function private.week_lineups(p_league uuid, p_week int) returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(t.id, to_jsonb(private.lineup(t.id, p_week))), '{}'::jsonb)
  from public.fantasy_teams t where t.league_id = p_league;
$$;

-- ───────────────────────── draft ─────────────────────────
create or replace function private.team_at(p_order jsonb, p_pick int) returns uuid language plpgsql immutable as $$
declare n int := jsonb_array_length(p_order); r int := (p_pick - 1) / n; i int := (p_pick - 1) % n;
begin
  if r % 2 = 1 then i := n - 1 - i; end if;
  return (p_order ->> i)::uuid;
end;
$$;

create or replace function private.autopick(p_league uuid, p_team uuid) returns text language plpgsql stable set search_path = '' as $$
declare
  l public.fantasy_leagues; s text[]; q text[]; pid text; c record;
  n int; rounds int; rnd int; have jsonb; need_k boolean; need_def boolean; cap int; cnt int;
begin
  select * into l from public.fantasy_leagues where id = p_league;
  select players into q from public.fantasy_queue where team_id = p_team;
  select x into pid from unnest(coalesce(q, '{}')) with ordinality u(x, o)
  where not exists (select 1 from public.fantasy_picks k where k.league_id = p_league and k.player_id = u.x)
    and exists (select 1 from public.fantasy_players p where p.sport = l.sport and p.player_id = u.x)
  order by o limit 1;
  if pid is not null then return pid; end if;

  s := private.slots(l.settings);
  n := jsonb_array_length(l.draft -> 'order');
  rounds := private.max_roster(l.settings);
  rnd := ((l.draft ->> 'pick')::int - 1) / n + 1;
  select coalesce(jsonb_object_agg(pos, c2), '{}') into have from (
    select coalesce(p.pos, '?') pos, count(*) c2 from public.fantasy_picks k join public.fantasy_players p on p.sport = l.sport and p.player_id = k.player_id
    where k.league_id = p_league and k.team_id = p_team group by 1) z;
  need_k := 'K' = any (s) and coalesce((have ->> 'K')::int, 0) = 0;
  need_def := 'DEF' = any (s) and coalesce((have ->> 'DEF')::int, 0) = 0;

  for c in
    select p.player_id, p.pos from public.fantasy_players p
    where p.sport = l.sport and p.adp is not null
      and not exists (select 1 from public.fantasy_picks k where k.league_id = p_league and k.player_id = p.player_id)
      and (rnd < rounds - 1 or not (need_k or need_def)
           or (rnd = rounds and need_k and p.pos = 'K')
           or (rnd = rounds and not need_k and need_def and p.pos = 'DEF')
           or (rnd = rounds - 1 and need_def and p.pos = 'DEF')
           or (rnd = rounds - 1 and not need_def and need_k and p.pos = 'K'))
    order by p.adp asc, p.proj desc nulls last
    limit 400
  loop
    cnt := coalesce((have ->> c.pos)::int, 0);
    if l.sport = 'nfl' then
      if c.pos in ('K', 'DEF') then
        if cnt >= 1 or rnd < rounds - 1 then continue; end if;
      else
        cap := (select count(*) from unnest(s) x where x = c.pos)
             + case when c.pos in ('RB', 'WR', 'TE') then (select count(*) from unnest(s) x where x in ('FLEX', 'SFLEX')) else 0 end
             + case when c.pos = 'QB' then (select count(*) from unnest(s) x where x = 'SFLEX') + 1
                    when c.pos = 'TE' then 1 else 3 end;
        if cnt >= cap then continue; end if;
      end if;
    else
      if cnt >= 5 then continue; end if;
    end if;
    return c.player_id;
  end loop;

  select p.player_id into pid from public.fantasy_players p
  where p.sport = l.sport and not exists (select 1 from public.fantasy_picks k where k.league_id = p_league and k.player_id = p.player_id)
  order by p.adp asc nulls last, p.proj desc nulls last limit 1;
  return pid;
end;
$$;

create or replace function private.gen_schedule(p_league uuid) returns void language plpgsql set search_path = '' as $$
declare l public.fantasy_leagues; ids uuid[]; n int; w int; r int; k int; lst uuid[]; a uuid; b uuid;
begin
  select * into l from public.fantasy_leagues where id = p_league;
  ids := array(select id from public.fantasy_teams where league_id = p_league order by random());
  if cardinality(ids) % 2 = 1 then ids := ids || null::uuid; end if;
  n := cardinality(ids);
  for w in l.start_week .. (l.settings ->> 'playoff_start')::int - 1 loop
    r := (w - l.start_week) % (n - 1);
    lst := array[ids[1]];
    for k in 2..n loop lst := lst || ids[2 + ((k - 2 + r) % (n - 1))]; end loop;
    for k in 1..n / 2 loop
      a := lst[k]; b := lst[n + 1 - k];
      if a is null then a := b; b := null; end if;
      if w % 2 = 0 and b is not null then insert into public.fantasy_matchups (league_id, week, home, away) values (p_league, w, b, a);
      else insert into public.fantasy_matchups (league_id, week, home, away) values (p_league, w, a, b); end if;
    end loop;
  end loop;
end;
$$;

create or replace function private.finish_draft(p_league uuid) returns void language plpgsql set search_path = '' as $$
declare l public.fantasy_leagues; s jsonb; st int; maxw int; pt int; ps int; rounds int; n int; i int; tid uuid;
begin
  select * into l from public.fantasy_leagues where id = p_league for update;
  s := l.settings;
  st := private.cur_week(l.sport) + 1;
  maxw := private.max_week(l.sport);
  pt := (s ->> 'playoff_teams')::int;
  ps := greatest((s ->> 'playoff_start')::int, st + 1);
  -- Make the playoffs fit before the season ends (fewer playoff teams if needed).
  loop
    rounds := case pt when 0 then 0 when 2 then 1 when 4 then 2 else 3 end;
    exit when pt = 0 or ps + rounds - 1 <= maxw;
    if maxw - rounds + 1 > st then ps := maxw - rounds + 1; else pt := case pt when 8 then 4 when 6 then 4 when 4 then 2 else 0 end; end if;
  end loop;
  if pt = 0 then ps := least(ps, maxw + 1); end if;
  s := s || jsonb_build_object('playoff_teams', pt, 'playoff_start', ps);
  n := jsonb_array_length(l.draft -> 'order');
  update public.fantasy_leagues
     set status = 'in_season', start_week = st, settings = s,
         draft = l.draft || jsonb_build_object('deadline', null, 'done_at', now())
   where id = p_league;
  for i in 0..n - 1 loop
    tid := (l.draft -> 'order' ->> i)::uuid;
    update public.fantasy_teams set waiver_priority = n - i, faab = (s ->> 'faab_budget')::int where id = tid;
    insert into public.fantasy_lineups (team_id, week, starters) values (tid, st, private.best_lineup(tid))
    on conflict (team_id, week) do update set starters = excluded.starters;
  end loop;
  perform private.gen_schedule(p_league);
end;
$$;

create or replace function private.advance(p_league uuid) returns void language plpgsql set search_path = '' as $$
declare l public.fantasy_leagues; nxt int; total int; tid uuid; fast boolean;
begin
  select * into l from public.fantasy_leagues where id = p_league;
  nxt := coalesce((l.draft ->> 'pick')::int, 0) + 1;
  total := jsonb_array_length(l.draft -> 'order') * private.max_roster(l.settings);
  if nxt > total then
    update public.fantasy_leagues set draft = draft || jsonb_build_object('pick', nxt) where id = p_league;
    perform private.finish_draft(p_league);
    return;
  end if;
  tid := private.team_at(l.draft -> 'order', nxt);
  select t.is_bot or coalesce(q.autodraft, false) into fast
  from public.fantasy_teams t left join public.fantasy_queue q on q.team_id = t.id where t.id = tid;
  update public.fantasy_leagues
     set draft = draft || jsonb_build_object('pick', nxt,
           'deadline', now() + make_interval(secs => case when fast then 2 else (l.settings ->> 'pick_seconds')::int end))
   where id = p_league;
end;
$$;

create or replace function private.do_pick(p_league uuid, p_team uuid, p_player text, p_auto boolean) returns void language plpgsql set search_path = '' as $$
declare l public.fantasy_leagues; n int; t int;
begin
  select * into l from public.fantasy_leagues where id = p_league for update;
  if l.status <> 'drafting' then raise exception 'The draft is not running'; end if;
  if not exists (select 1 from public.fantasy_players where sport = l.sport and player_id = p_player) then raise exception 'Unknown player'; end if;
  if exists (select 1 from public.fantasy_picks where league_id = p_league and player_id = p_player) then raise exception 'That player was already drafted'; end if;
  n := (l.draft ->> 'pick')::int;
  t := jsonb_array_length(l.draft -> 'order');
  insert into public.fantasy_picks (league_id, pick_no, round, team_id, player_id, auto)
  values (p_league, n, (n - 1) / t + 1, p_team, p_player, p_auto);
  update public.fantasy_teams set roster = array_append(roster, p_player) where id = p_team;
  update public.fantasy_queue set players = array_remove(players, p_player)
   where team_id in (select id from public.fantasy_teams where league_id = p_league);
  perform private.advance(p_league);
end;
$$;

create or replace function private.draft_tick(p_league uuid) returns void language plpgsql set search_path = '' as $$
declare l public.fantasy_leagues; tid uuid; pid text; bot boolean;
begin
  for i in 1..60 loop
    select * into l from public.fantasy_leagues where id = p_league for update;
    exit when l.status <> 'drafting' or coalesce((l.draft ->> 'paused')::boolean, false)
           or (l.draft ->> 'deadline') is null or (l.draft ->> 'deadline')::timestamptz > now();
    tid := private.team_at(l.draft -> 'order', (l.draft ->> 'pick')::int);
    pid := private.autopick(p_league, tid);
    if pid is null then raise exception 'No players left to draft'; end if;
    select is_bot into bot from public.fantasy_teams where id = tid;
    perform private.do_pick(p_league, tid, pid, true);
    -- A person who ran out of time keeps auto-drafting until they switch it off.
    if not bot then
      insert into public.fantasy_queue (team_id, owner, autodraft)
      select tid, t.owner, true from public.fantasy_teams t where t.id = tid and t.owner is not null
      on conflict (team_id) do update set autodraft = true;
    end if;
  end loop;
end;
$$;

-- ───────────────────────── waivers & trades ─────────────────────────
create or replace function private.process_waivers(p_league uuid) returns void language plpgsql set search_path = '' as $$
declare l public.fantasy_leagues; c record; t public.fantasy_teams; faab boolean; n int; maxr int; why text;
begin
  select * into l from public.fantasy_leagues where id = p_league;
  faab := l.settings ->> 'waiver' = 'faab';
  maxr := private.max_roster(l.settings);
  select count(*) into n from public.fantasy_teams where league_id = p_league;
  loop
    select cl.* into c from public.fantasy_claims cl
      join public.fantasy_teams tm on tm.id = cl.team_id
      left join public.fantasy_waivers w on w.league_id = cl.league_id and w.player_id = cl.add_player
     where cl.league_id = p_league and cl.status = 'pending' and (w.until is null or w.until <= now())
     order by case when faab then cl.bid else 0 end desc, tm.waiver_priority asc nulls last, cl.created_at
     limit 1;
    exit when not found;
    select * into t from public.fantasy_teams where id = c.team_id for update;
    why := null;
    if exists (select 1 from public.fantasy_teams x where x.league_id = p_league and c.add_player = any (x.roster)) then why := 'Already on a roster';
    elsif c.drop_player is not null and not c.drop_player = any (t.roster) then why := 'The player you meant to drop is gone';
    elsif cardinality(t.roster) - (c.drop_player is not null)::int + 1 > maxr then why := 'Roster full';
    elsif faab and c.bid > t.faab then why := 'Not enough FAAB left';
    end if;
    if why is not null then
      update public.fantasy_claims set status = case when why = 'Already on a roster' then 'lost' else 'failed' end, note = why where id = c.id;
      continue;
    end if;
    update public.fantasy_teams
       set roster = array_append(array_remove(roster, c.drop_player), c.add_player),
           faab = faab - case when faab then c.bid else 0 end
     where id = t.id;
    if not faab then
      update public.fantasy_teams set waiver_priority = waiver_priority - 1
       where league_id = p_league and waiver_priority > t.waiver_priority;
      update public.fantasy_teams set waiver_priority = n where id = t.id;
    end if;
    update public.fantasy_claims set status = 'won', note = case when faab then '$' || c.bid end where id = c.id;
    update public.fantasy_claims set status = 'lost', note = 'Another team won the claim'
     where league_id = p_league and status = 'pending' and add_player = c.add_player;
    delete from public.fantasy_waivers where league_id = p_league and player_id = c.add_player;
    if c.drop_player is not null then
      insert into public.fantasy_waivers (league_id, player_id, until) values (p_league, c.drop_player, now() + interval '1 day')
      on conflict (league_id, player_id) do update set until = excluded.until;
    end if;
    perform private.log(p_league, 'waiver', t.id, array[c.add_player], case when c.drop_player is null then '{}' else array[c.drop_player] end,
                        null, case when faab then '$' || c.bid end);
  end loop;
end;
$$;

create or replace function private.exec_trade(p_trade uuid) returns void language plpgsql set search_path = '' as $$
declare tr public.fantasy_trades; a public.fantasy_teams; b public.fantasy_teams; l public.fantasy_leagues; maxr int; why text;
begin
  select * into tr from public.fantasy_trades where id = p_trade for update;
  select * into l from public.fantasy_leagues where id = tr.league_id;
  select * into a from public.fantasy_teams where id = tr.from_team for update;
  select * into b from public.fantasy_teams where id = tr.to_team for update;
  maxr := private.max_roster(l.settings);
  if not tr.give <@ a.roster or not tr.get <@ b.roster then why := 'A player in the deal is no longer on that roster';
  elsif cardinality(a.roster) - cardinality(tr.give) + cardinality(tr.get) > maxr then why := a.name || ' would have too many players';
  elsif cardinality(b.roster) - cardinality(tr.get) + cardinality(tr.give) > maxr then why := b.name || ' would have too many players';
  end if;
  if why is not null then
    update public.fantasy_trades set status = 'failed', note = why, updated_at = now() where id = p_trade;
    return;
  end if;
  update public.fantasy_teams set roster = array(select x from unnest(roster) x where not x = any (tr.give)) || tr.get where id = a.id;
  update public.fantasy_teams set roster = array(select x from unnest(roster) x where not x = any (tr.get)) || tr.give where id = b.id;
  update public.fantasy_trades set status = 'completed', updated_at = now() where id = p_trade;
  update public.fantasy_trades set status = 'failed', note = 'A player in this offer was traded elsewhere', updated_at = now()
   where league_id = tr.league_id and id <> p_trade and status in ('proposed', 'accepted')
     and (give && (tr.give || tr.get) or get && (tr.give || tr.get));
  perform private.log(tr.league_id, 'trade', a.id, tr.get, tr.give, b.id);
end;
$$;

create or replace function private.after_accept(p_trade uuid) returns void language plpgsql set search_path = '' as $$
declare tr public.fantasy_trades; l public.fantasy_leagues;
begin
  select * into tr from public.fantasy_trades where id = p_trade;
  select * into l from public.fantasy_leagues where id = tr.league_id;
  if l.settings ->> 'trade_review' = 'none' then perform private.exec_trade(p_trade);
  elsif l.settings ->> 'trade_review' = 'league' then
    update public.fantasy_trades set review_until = now() + interval '1 day', updated_at = now() where id = p_trade;
  end if;
  -- 'commish': waits for fantasy_review_trade.
end;
$$;

create or replace function private.process_league(p_league uuid) returns void language plpgsql set search_path = '' as $$
declare r record; l public.fantasy_leagues; w int;
begin
  select * into l from public.fantasy_leagues where id = p_league;
  if l.status = 'drafting' then perform private.draft_tick(p_league); return; end if;
  if l.status <> 'in_season' then return; end if;
  for r in select id from public.fantasy_trades where league_id = p_league and status = 'accepted'
             and l.settings ->> 'trade_review' = 'league' and review_until <= now() loop
    perform private.exec_trade(r.id);
  end loop;
  perform private.process_waivers(p_league);
  -- Bots set their best lineup once per week.
  w := private.cur_week(l.sport);
  insert into public.fantasy_lineups (team_id, week, starters)
  select t.id, w, private.best_lineup(t.id) from public.fantasy_teams t
   where t.league_id = p_league and t.is_bot
     and not exists (select 1 from public.fantasy_lineups x where x.team_id = t.id and x.week = w)
  on conflict do nothing;
end;
$$;

create or replace function private.cron_minute() returns void language plpgsql set search_path = '' as $$
declare r record;
begin
  for r in select id from public.fantasy_leagues where status in ('drafting', 'in_season') loop
    begin
      perform private.process_league(r.id);
    exception when others then
      raise warning 'fantasy league % tick failed: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- Seeds the playoffs, advances rounds and crowns a champion as weeks finish.
create or replace function private.advance_season(p_league uuid) returns void language plpgsql set search_path = '' as $$
declare
  l public.fantasy_leagues; pt int; ps int; rnd int; seeds uuid[]; alive uuid[]; nb int; m record; k int; w int; win uuid;
begin
  select * into l from public.fantasy_leagues where id = p_league for update;
  if l.status <> 'in_season' then return; end if;
  if exists (select 1 from public.fantasy_matchups where league_id = p_league and not final) then return; end if;
  pt := (l.settings ->> 'playoff_teams')::int;
  ps := (l.settings ->> 'playoff_start')::int;
  if pt = 0 then update public.fantasy_leagues set status = 'complete' where id = p_league; return; end if;

  if l.playoffs is null then
    seeds := array(
      select t.id from public.fantasy_teams t
      left join lateral (
        select count(*) filter (where m2.winner = t.id) wins,
               count(*) filter (where m2.winner is null and m2.away is not null) ties,
               sum(case when m2.home = t.id then m2.home_score else m2.away_score end) pf
        from public.fantasy_matchups m2
        where m2.league_id = p_league and m2.playoff_round is null and m2.final and (m2.home = t.id or m2.away = t.id)) s on true
      where t.league_id = p_league
      order by s.wins desc, s.ties desc, s.pf desc nulls last, t.created_at
      limit pt);
    nb := case pt when 6 then 2 else 0 end;
    for k in 1..(pt - nb) / 2 loop
      insert into public.fantasy_matchups (league_id, week, home, away, playoff_round)
      values (p_league, ps, seeds[nb + k], seeds[pt + 1 - k], 1);
    end loop;
    update public.fantasy_leagues set playoffs = jsonb_build_object('seeds', to_jsonb(seeds), 'round', 1) where id = p_league;
    return;
  end if;

  seeds := array(select jsonb_array_elements_text(l.playoffs -> 'seeds')::uuid);
  rnd := (l.playoffs ->> 'round')::int;
  alive := case when rnd = 1 and pt = 6 then seeds[1:2] else '{}'::uuid[] end;
  for m in select * from public.fantasy_matchups where league_id = p_league and playoff_round = rnd loop
    win := coalesce(m.winner, case when array_position(seeds, m.home) < array_position(seeds, m.away) then m.home else m.away end);
    alive := alive || win;
  end loop;
  alive := array(select x from unnest(alive) x order by array_position(seeds, x));
  if cardinality(alive) <= 1 then
    update public.fantasy_leagues set status = 'complete', playoffs = playoffs || jsonb_build_object('champion', alive[1]) where id = p_league;
    return;
  end if;
  w := ps + rnd;
  for k in 1..cardinality(alive) / 2 loop
    insert into public.fantasy_matchups (league_id, week, home, away, playoff_round)
    values (p_league, w, alive[k], alive[cardinality(alive) + 1 - k], rnd + 1);
  end loop;
  update public.fantasy_leagues set playoffs = playoffs || jsonb_build_object('round', rnd + 1) where id = p_league;
end;
$$;

-- ───────────────────────── RPCs for players ─────────────────────────
create or replace function public.fantasy_now() returns timestamptz language sql stable as $$ select now(); $$;

create or replace function public.fantasy_create_league(p_sport text, p_name text, p_settings jsonb, p_team_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); lid uuid; tid uuid; s jsonb; v_season text;
begin
  if uid is null then raise exception 'Sign in to create a league'; end if;
  if p_sport not in ('nfl', 'nba') then raise exception 'Unknown sport'; end if;
  if (select count(*) from public.fantasy_leagues where commissioner = uid and status <> 'complete') >= 20 then
    raise exception 'You already run 20 leagues';
  end if;
  s := private.clean_settings(p_sport, coalesce(p_settings, '{}'::jsonb));
  select fs.season into v_season from public.fantasy_state fs where fs.sport = p_sport;
  insert into public.fantasy_leagues (sport, season, name, commissioner, invite_code, settings)
  values (p_sport, coalesce(v_season, to_char(now(), 'YYYY')), trim(p_name), uid, private.invite_code(), s)
  returning id into lid;
  insert into public.fantasy_teams (league_id, owner, name) values (lid, uid, trim(p_team_name)) returning id into tid;
  insert into public.fantasy_queue (team_id, owner) values (tid, uid);
  return lid;
end;
$$;

create or replace function public.fantasy_preview(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', l.id, 'name', l.name, 'sport', l.sport, 'status', l.status,
           'teams', (select count(*) from public.fantasy_teams t where t.league_id = l.id),
           'max', (l.settings ->> 'teams')::int, 'scoring', l.settings ->> 'scoring',
           'member', exists (select 1 from public.fantasy_teams t where t.league_id = l.id and t.owner = auth.uid()))
  from public.fantasy_leagues l where l.invite_code = upper(trim(p_code));
$$;

create or replace function public.fantasy_join(p_code text, p_team_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); l public.fantasy_leagues; tid uuid;
begin
  if uid is null then raise exception 'Sign in to join a league'; end if;
  select * into l from public.fantasy_leagues where invite_code = upper(trim(p_code)) for update;
  if l.id is null then raise exception 'No league has that invite code'; end if;
  if exists (select 1 from public.fantasy_teams where league_id = l.id and owner = uid) then return l.id; end if;
  if l.status <> 'pre_draft' then raise exception 'This league has already drafted'; end if;
  if (select count(*) from public.fantasy_teams where league_id = l.id) >= (l.settings ->> 'teams')::int then
    raise exception 'This league is full';
  end if;
  insert into public.fantasy_teams (league_id, owner, name) values (l.id, uid, trim(p_team_name)) returning id into tid;
  insert into public.fantasy_queue (team_id, owner) values (tid, uid);
  update public.fantasy_leagues set draft = draft - 'order' where id = l.id;
  return l.id;
end;
$$;

create or replace function public.fantasy_leave(p_league uuid) returns void language plpgsql security definer set search_path = '' as $$
declare l public.fantasy_leagues;
begin
  select * into l from public.fantasy_leagues where id = p_league;
  if l.commissioner = auth.uid() then raise exception 'The commissioner can delete the league instead'; end if;
  if l.status <> 'pre_draft' then raise exception 'You can only leave before the draft'; end if;
  delete from public.fantasy_teams where league_id = p_league and owner = auth.uid();
  update public.fantasy_leagues set draft = draft - 'order' where id = p_league;
end;
$$;

create or replace function public.fantasy_update_league(p_league uuid, p_name text, p_settings jsonb, p_order uuid[] default null)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.fantasy_leagues; s jsonb; n int;
begin
  select * into l from public.fantasy_leagues where id = p_league for update;
  if l.commissioner is distinct from auth.uid() then raise exception 'Only the commissioner can change settings'; end if;
  if p_name is not null and char_length(trim(p_name)) between 2 and 40 then
    update public.fantasy_leagues set name = trim(p_name) where id = p_league;
  end if;
  if p_settings is not null then
    if l.status = 'pre_draft' then
      s := private.clean_settings(l.sport, p_settings);
      select count(*) into n from public.fantasy_teams where league_id = p_league;
      if (s ->> 'teams')::int < n then raise exception 'The league already has % teams', n; end if;
    else
      -- After the draft only trade rules can change.
      s := l.settings;
      if p_settings ? 'trade_review' then s := s || jsonb_build_object('trade_review', p_settings -> 'trade_review'); end if;
      if p_settings ? 'trade_deadline' then s := s || jsonb_build_object('trade_deadline', p_settings -> 'trade_deadline'); end if;
      s := private.clean_settings(l.sport, s) || jsonb_build_object('playoff_teams', l.settings -> 'playoff_teams', 'playoff_start', l.settings -> 'playoff_start');
    end if;
    update public.fantasy_leagues set settings = s where id = p_league;
  end if;
  if p_order is not null then
    if l.status <> 'pre_draft' then raise exception 'The draft order is set once the draft starts'; end if;
    if (select array_agg(x order by x) from unnest(p_order) x) is distinct from
       (select array_agg(id order by id) from public.fantasy_teams where league_id = p_league) then
      raise exception 'The draft order must list every team once';
    end if;
    update public.fantasy_leagues set draft = draft || jsonb_build_object('order', to_jsonb(p_order)) where id = p_league;
  end if;
end;
$$;

create or replace function public.fantasy_fill_bots(p_league uuid) returns int language plpgsql security definer set search_path = '' as $$
declare
  l public.fantasy_leagues; have int; added int := 0; nm text;
  nfl text[] := array['Blitz Bots','Gridiron Gremlins','Hail Mary Machines','Turf Tacticians','End Zone Engines','Pigskin Protocol','Red Zone Robots','Two-Minute Drill','Fourth & Long','Play-Action Pros','Pocket Passers','Goal Line Ghosts','Sideline Circuits','Huddle Hackers','Snap Count','Audible AI'];
  nba text[] := array['Pick & Rollers','Fast Break Bots','Splash Circuit','Glass Cleaners','Triple-Double Trouble','Full Court Press','Bucket Getters','Alley-Oop Engine','Paint Protectors','Corner Three Club','Euro Steppers','Shot Clock','Box Score Bots','Dime Droppers','And-One AI','Swish Protocol'];
  colors text[] := array['#22c55e','#f97316','#3b82f6','#ef4444','#eab308','#14b8a6','#a855f7','#ec4899','#84cc16','#06b6d4','#f43f5e','#8b5cf6','#10b981','#f59e0b','#6366f1','#d946ef'];
begin
  select * into l from public.fantasy_leagues where id = p_league for update;
  if l.commissioner is distinct from auth.uid() then raise exception 'Only the commissioner can add bots'; end if;
  if l.status <> 'pre_draft' then raise exception 'Bots can only join before the draft'; end if;
  select count(*) into have from public.fantasy_teams where league_id = p_league;
  for i in 1..16 loop
    exit when have + added >= (l.settings ->> 'teams')::int;
    nm := (case l.sport when 'nfl' then nfl else nba end)[i];
    continue when exists (select 1 from public.fantasy_teams where league_id = p_league and name = nm);
    insert into public.fantasy_teams (league_id, owner, is_bot, name, color) values (p_league, null, true, nm, colors[i]);
    added := added + 1;
  end loop;
  update public.fantasy_leagues set draft = draft - 'order' where id = p_league;
  return added;
end;
$$;

create or replace function public.fantasy_remove_team(p_team uuid) returns void language plpgsql security definer set search_path = '' as $$
declare t public.fantasy_teams; l public.fantasy_leagues;
begin
  select * into t from public.fantasy_teams where id = p_team;
  select * into l from public.fantasy_leagues where id = t.league_id;
  if l.commissioner is distinct from auth.uid() then raise exception 'Only the commissioner can remove teams'; end if;
  if l.status <> 'pre_draft' then raise exception 'Teams can only be removed before the draft'; end if;
  if t.owner = l.commissioner then raise exception 'You can''t remove your own team'; end if;
  delete from public.fantasy_teams where id = p_team;
  update public.fantasy_leagues set draft = draft - 'order' where id = l.id;
end;
$$;

create or replace function public.fantasy_update_team(p_team uuid, p_name text, p_color text) returns void language plpgsql security definer set search_path = '' as $$
declare t public.fantasy_teams;
begin
  select * into t from public.fantasy_teams where id = p_team;
  if t.owner is distinct from auth.uid() and not public.fantasy_is_commish(t.league_id) then raise exception 'Not your team'; end if;
  update public.fantasy_teams set name = coalesce(nullif(trim(p_name), ''), name), color = coalesce(p_color, color) where id = p_team;
end;
$$;

create or replace function public.fantasy_start_draft(p_league uuid) returns void language plpgsql security definer set search_path = '' as $$
declare l public.fantasy_leagues; n int; ord jsonb;
begin
  select * into l from public.fantasy_leagues where id = p_league for update;
  if l.commissioner is distinct from auth.uid() then raise exception 'Only the commissioner can start the draft'; end if;
  if l.status <> 'pre_draft' then raise exception 'The draft already started'; end if;
  select count(*) into n from public.fantasy_teams where league_id = p_league;
  if n <> (l.settings ->> 'teams')::int then raise exception 'The league needs % teams (it has %). Invite friends or fill with bots.', l.settings ->> 'teams', n; end if;
  if private.cur_week(l.sport) >= private.max_week(l.sport) then raise exception 'The regular season is over. Leagues can draft again next season.'; end if;
  if not exists (select 1 from public.fantasy_players where sport = l.sport limit 1) then raise exception 'Player data is still loading. Try again in a few minutes.'; end if;
  ord := l.draft -> 'order';
  if ord is null or jsonb_array_length(ord) <> n then
    ord := (select jsonb_agg(id order by random()) from public.fantasy_teams where league_id = p_league);
  end if;
  update public.fantasy_leagues set status = 'drafting', draft = jsonb_build_object('order', ord, 'pick', 0, 'started_at', now()) where id = p_league;
  perform private.advance(p_league);
end;
$$;

create or replace function public.fantasy_draft_pick(p_league uuid, p_player text) returns void language plpgsql security definer set search_path = '' as $$
declare l public.fantasy_leagues; tid uuid;
begin
  select * into l from public.fantasy_leagues where id = p_league for update;
  if l.status <> 'drafting' then raise exception 'The draft is not running'; end if;
  if coalesce((l.draft ->> 'paused')::boolean, false) then raise exception 'The draft is paused'; end if;
  tid := private.team_at(l.draft -> 'order', (l.draft ->> 'pick')::int);
  if not public.fantasy_owns_team(tid) and l.commissioner is distinct from auth.uid() then raise exception 'It''s not your pick'; end if;
  perform private.do_pick(p_league, tid, p_player, false);
end;
$$;

create or replace function public.fantasy_draft_tick(p_league uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fantasy_is_member(p_league) then raise exception 'Not in this league'; end if;
  perform private.draft_tick(p_league);
end;
$$;

create or replace function public.fantasy_draft_pause(p_league uuid, p_paused boolean) returns void language plpgsql security definer set search_path = '' as $$
declare l public.fantasy_leagues; left_s numeric;
begin
  select * into l from public.fantasy_leagues where id = p_league for update;
  if l.commissioner is distinct from auth.uid() then raise exception 'Only the commissioner can pause the draft'; end if;
  if l.status <> 'drafting' then raise exception 'The draft is not running'; end if;
  if p_paused then
    left_s := greatest(5, coalesce(extract(epoch from ((l.draft ->> 'deadline')::timestamptz - now())), 5));
    update public.fantasy_leagues set draft = draft || jsonb_build_object('paused', true, 'remaining', left_s, 'deadline', null) where id = p_league;
  else
    left_s := coalesce((l.draft ->> 'remaining')::numeric, (l.settings ->> 'pick_seconds')::numeric);
    update public.fantasy_leagues set draft = (draft - 'remaining') || jsonb_build_object('paused', false, 'deadline', now() + make_interval(secs => left_s)) where id = p_league;
  end if;
end;
$$;

create or replace function public.fantasy_draft_undo(p_league uuid) returns void language plpgsql security definer set search_path = '' as $$
declare l public.fantasy_leagues; k public.fantasy_picks;
begin
  select * into l from public.fantasy_leagues where id = p_league for update;
  if l.commissioner is distinct from auth.uid() then raise exception 'Only the commissioner can undo picks'; end if;
  if l.status <> 'drafting' then raise exception 'The draft is not running'; end if;
  select * into k from public.fantasy_picks where league_id = p_league order by pick_no desc limit 1;
  if k.pick_no is null then raise exception 'No picks to undo'; end if;
  delete from public.fantasy_picks where league_id = p_league and pick_no = k.pick_no;
  update public.fantasy_teams set roster = array_remove(roster, k.player_id) where id = k.team_id;
  update public.fantasy_leagues set draft = draft || jsonb_build_object('pick', k.pick_no, 'paused', true,
         'remaining', (l.settings ->> 'pick_seconds')::int, 'deadline', null) where id = p_league;
end;
$$;

create or replace function public.fantasy_set_lineup(p_team uuid, p_week int, p_starters text[]) returns void language plpgsql security definer set search_path = '' as $$
declare t public.fantasy_teams; l public.fantasy_leagues; s text[]; cur int; old text[]; i int; p text; pos text[]; nm text;
begin
  select * into t from public.fantasy_teams where id = p_team;
  if t.owner is distinct from auth.uid() then raise exception 'Not your team'; end if;
  select * into l from public.fantasy_leagues where id = t.league_id;
  if l.status <> 'in_season' then raise exception 'Lineups open after the draft'; end if;
  cur := private.cur_week(l.sport);
  if p_week < cur then raise exception 'That week is already over'; end if;
  s := private.slots(l.settings);
  if cardinality(p_starters) <> cardinality(s) then raise exception 'Wrong number of lineup spots'; end if;
  for i in 1..cardinality(s) loop
    p := p_starters[i];
    continue when p is null;
    if not p = any (t.roster) then raise exception 'That player is not on your roster'; end if;
    select positions, name into pos, nm from public.fantasy_players where sport = l.sport and player_id = p;
    if not private.slot_ok(s[i], coalesce(pos, '{}')) then raise exception '% can''t play %', nm, s[i]; end if;
  end loop;
  if (select count(x) from unnest(p_starters) x) <> (select count(distinct x) from unnest(p_starters) x) then
    raise exception 'A player can only start once';
  end if;
  if p_week = cur then
    old := private.lineup(p_team, cur);
    for i in 1..cardinality(s) loop
      if old[i] is distinct from p_starters[i] then
        foreach p in array array_remove(array[old[i], p_starters[i]], null) loop
          if private.is_locked(l.sport, p) then
            select name into nm from public.fantasy_players where sport = l.sport and player_id = p;
            raise exception '% is locked: their game has started', nm;
          end if;
        end loop;
      end if;
    end loop;
  end if;
  insert into public.fantasy_lineups (team_id, week, starters) values (p_team, p_week, p_starters)
  on conflict (team_id, week) do update set starters = excluded.starters;
end;
$$;

create or replace function public.fantasy_add_drop(p_team uuid, p_add text, p_drop text) returns void language plpgsql security definer set search_path = '' as $$
declare t public.fantasy_teams; l public.fantasy_leagues;
begin
  select * into t from public.fantasy_teams where id = p_team for update;
  if t.owner is distinct from auth.uid() then raise exception 'Not your team'; end if;
  select * into l from public.fantasy_leagues where id = t.league_id;
  if l.status <> 'in_season' then raise exception 'Free agency opens after the draft'; end if;
  if p_add is null and p_drop is null then return; end if;
  if p_add is not null then
    if not exists (select 1 from public.fantasy_players where sport = l.sport and player_id = p_add) then raise exception 'Unknown player'; end if;
    if exists (select 1 from public.fantasy_teams x where x.league_id = l.id and p_add = any (x.roster)) then raise exception 'That player is already on a team'; end if;
    if exists (select 1 from public.fantasy_waivers w where w.league_id = l.id and w.player_id = p_add and w.until > now()) then
      raise exception 'That player is on waivers. Put in a claim instead.';
    end if;
  end if;
  if p_drop is not null then
    if not p_drop = any (t.roster) then raise exception 'That player is not on your roster'; end if;
    if private.is_locked(l.sport, p_drop) and p_drop = any (private.lineup(p_team, private.cur_week(l.sport))) then
      raise exception 'You can''t drop a starter whose game has started';
    end if;
  end if;
  if cardinality(t.roster) - (p_drop is not null)::int + (p_add is not null)::int > private.max_roster(l.settings) then
    raise exception 'Your roster is full. Pick someone to drop.';
  end if;
  update public.fantasy_teams set roster = array_remove(roster, p_drop) || case when p_add is null then '{}'::text[] else array[p_add] end where id = p_team;
  if p_drop is not null then
    insert into public.fantasy_waivers (league_id, player_id, until) values (l.id, p_drop, now() + interval '1 day')
    on conflict (league_id, player_id) do update set until = excluded.until;
    update public.fantasy_claims set status = 'failed', note = 'You dropped this player'
     where team_id = p_team and status = 'pending' and drop_player = p_drop;
  end if;
  perform private.log(l.id, case when p_add is null then 'drop' when p_drop is null then 'add' else 'add_drop' end, p_team,
    case when p_add is null then '{}' else array[p_add] end, case when p_drop is null then '{}' else array[p_drop] end);
end;
$$;

create or replace function public.fantasy_claim(p_team uuid, p_add text, p_drop text, p_bid int) returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.fantasy_teams; l public.fantasy_leagues; cid uuid;
begin
  select * into t from public.fantasy_teams where id = p_team;
  if t.owner is distinct from auth.uid() then raise exception 'Not your team'; end if;
  select * into l from public.fantasy_leagues where id = t.league_id;
  if l.status <> 'in_season' then raise exception 'Waivers open after the draft'; end if;
  if not exists (select 1 from public.fantasy_waivers w where w.league_id = l.id and w.player_id = p_add and w.until > now()) then
    raise exception 'That player is a free agent. Add them directly.';
  end if;
  if p_drop is not null and not p_drop = any (t.roster) then raise exception 'That player is not on your roster'; end if;
  if l.settings ->> 'waiver' = 'faab' and coalesce(p_bid, 0) > t.faab then raise exception 'You only have $% left', t.faab; end if;
  if (select count(*) from public.fantasy_claims where team_id = p_team and status = 'pending') >= 25 then raise exception 'Too many pending claims'; end if;
  insert into public.fantasy_claims (league_id, team_id, add_player, drop_player, bid)
  values (l.id, p_team, p_add, p_drop, case when l.settings ->> 'waiver' = 'faab' then greatest(0, coalesce(p_bid, 0)) else 0 end)
  returning id into cid;
  return cid;
end;
$$;

create or replace function public.fantasy_cancel_claim(p_claim uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fantasy_claims set status = 'cancelled'
   where id = p_claim and status = 'pending' and public.fantasy_owns_team(team_id);
  if not found then raise exception 'Claim not found'; end if;
end;
$$;

create or replace function public.fantasy_propose_trade(p_from uuid, p_to uuid, p_give text[], p_get text[], p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.fantasy_teams; b public.fantasy_teams; l public.fantasy_leagues; tid uuid; vg numeric; vr numeric;
begin
  select * into a from public.fantasy_teams where id = p_from;
  select * into b from public.fantasy_teams where id = p_to;
  if a.owner is distinct from auth.uid() then raise exception 'Not your team'; end if;
  if b.league_id is distinct from a.league_id or a.id = b.id then raise exception 'Pick another team in your league'; end if;
  select * into l from public.fantasy_leagues where id = a.league_id;
  if l.status <> 'in_season' then raise exception 'Trades open after the draft'; end if;
  if (l.settings ->> 'trade_deadline') is not null and private.cur_week(l.sport) > (l.settings ->> 'trade_deadline')::int then
    raise exception 'The trade deadline has passed';
  end if;
  p_give := coalesce(p_give, '{}'); p_get := coalesce(p_get, '{}');
  if cardinality(p_give) + cardinality(p_get) = 0 then raise exception 'Add at least one player'; end if;
  if not p_give <@ a.roster then raise exception 'You can only offer your own players'; end if;
  if not p_get <@ b.roster then raise exception 'You can only ask for their players'; end if;
  insert into public.fantasy_trades (league_id, from_team, to_team, give, get, message)
  values (l.id, a.id, b.id, p_give, p_get, nullif(trim(p_message), '')) returning id into tid;
  if b.is_bot then
    -- Bots accept when what they get projects at least 5% better than what they give.
    select coalesce(sum(proj), 0) into vr from public.fantasy_players where sport = l.sport and player_id = any (p_give);
    select coalesce(sum(proj), 0) into vg from public.fantasy_players where sport = l.sport and player_id = any (p_get);
    if vr >= vg * 1.05 and vr > 0 then
      update public.fantasy_trades set status = 'accepted', note = 'Bot accepted', updated_at = now() where id = tid;
      perform private.after_accept(tid);
    else
      update public.fantasy_trades set status = 'rejected', note = 'Bot says no thanks', updated_at = now() where id = tid;
    end if;
  end if;
  return tid;
end;
$$;

create or replace function public.fantasy_respond_trade(p_trade uuid, p_accept boolean) returns void language plpgsql security definer set search_path = '' as $$
declare tr public.fantasy_trades;
begin
  select * into tr from public.fantasy_trades where id = p_trade for update;
  if not public.fantasy_owns_team(tr.to_team) then raise exception 'This offer is not for you'; end if;
  if tr.status <> 'proposed' then raise exception 'This offer is no longer open'; end if;
  if not p_accept then
    update public.fantasy_trades set status = 'rejected', updated_at = now() where id = p_trade;
    return;
  end if;
  update public.fantasy_trades set status = 'accepted', updated_at = now() where id = p_trade;
  perform private.after_accept(p_trade);
end;
$$;

create or replace function public.fantasy_cancel_trade(p_trade uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fantasy_trades set status = 'cancelled', updated_at = now()
   where id = p_trade and status = 'proposed' and public.fantasy_owns_team(from_team);
  if not found then raise exception 'That offer can''t be withdrawn'; end if;
end;
$$;

create or replace function public.fantasy_review_trade(p_trade uuid, p_approve boolean) returns void language plpgsql security definer set search_path = '' as $$
declare tr public.fantasy_trades;
begin
  select * into tr from public.fantasy_trades where id = p_trade for update;
  if not public.fantasy_is_commish(tr.league_id) then raise exception 'Only the commissioner can review trades'; end if;
  if tr.status <> 'accepted' then raise exception 'This trade is not waiting for review'; end if;
  if p_approve then perform private.exec_trade(p_trade);
  else update public.fantasy_trades set status = 'vetoed', note = 'Vetoed by the commissioner', updated_at = now() where id = p_trade; end if;
end;
$$;

create or replace function public.fantasy_vote_veto(p_trade uuid) returns void language plpgsql security definer set search_path = '' as $$
declare tr public.fantasy_trades; l public.fantasy_leagues; me uuid; n int; need int;
begin
  select * into tr from public.fantasy_trades where id = p_trade for update;
  select * into l from public.fantasy_leagues where id = tr.league_id;
  if l.settings ->> 'trade_review' <> 'league' or tr.status <> 'accepted' then raise exception 'This trade is not up for a vote'; end if;
  select id into me from public.fantasy_teams where league_id = l.id and owner = auth.uid();
  if me is null then raise exception 'Not in this league'; end if;
  if me in (tr.from_team, tr.to_team) then raise exception 'You''re in this trade'; end if;
  if me = any (tr.vetoes) then return; end if;
  update public.fantasy_trades set vetoes = vetoes || me where id = p_trade;
  select count(*) into n from public.fantasy_teams where league_id = l.id and not is_bot;
  need := greatest(1, ceil(n / 3.0)::int);
  if cardinality(tr.vetoes) + 1 >= need then
    update public.fantasy_trades set status = 'vetoed', note = 'Vetoed by league vote', updated_at = now() where id = p_trade;
  end if;
end;
$$;

create or replace function public.fantasy_commish_move(p_team uuid, p_add text, p_drop text) returns void language plpgsql security definer set search_path = '' as $$
declare t public.fantasy_teams; l public.fantasy_leagues;
begin
  select * into t from public.fantasy_teams where id = p_team for update;
  select * into l from public.fantasy_leagues where id = t.league_id;
  if l.commissioner is distinct from auth.uid() then raise exception 'Only the commissioner can do that'; end if;
  if l.status not in ('in_season', 'complete') then raise exception 'Rosters open after the draft'; end if;
  if p_add is not null and exists (select 1 from public.fantasy_teams x where x.league_id = l.id and p_add = any (x.roster)) then
    raise exception 'That player is already on a team';
  end if;
  if p_drop is not null and not p_drop = any (t.roster) then raise exception 'That player is not on this roster'; end if;
  update public.fantasy_teams set roster = array_remove(roster, p_drop) || case when p_add is null then '{}'::text[] else array[p_add] end where id = p_team;
  delete from public.fantasy_waivers where league_id = l.id and player_id = p_add;
  perform private.log(l.id, 'commish', p_team, case when p_add is null then '{}' else array[p_add] end, case when p_drop is null then '{}' else array[p_drop] end, null, 'Commissioner move');
end;
$$;

create or replace function public.fantasy_delete_league(p_league uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.fantasy_leagues where id = p_league and commissioner = auth.uid();
  if not found then raise exception 'Only the commissioner can delete the league'; end if;
end;
$$;

create or replace function public.fantasy_tick(p_league uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fantasy_is_member(p_league) then raise exception 'Not in this league'; end if;
  perform private.process_league(p_league);
end;
$$;

create or replace function public.fantasy_lineups_for(p_league uuid, p_week int) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.fantasy_is_member(p_league) then raise exception 'Not in this league'; end if;
  return private.week_lineups(p_league, p_week);
end;
$$;

-- ───────────────────────── service-only (fantasy-sync edge function) ─────────────────────────
create or replace function public.fantasy_cron_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.config where key = 'cron_key' and value = p_key);
$$;

create or replace function public.fantasy_admin_lineups(p_league uuid, p_week int) returns jsonb language sql stable security definer set search_path = '' as $$
  select private.week_lineups(p_league, p_week);
$$;

-- p_results: [{id, home_score, away_score, home_cats, away_cats, winner}]
create or replace function public.fantasy_record_scores(p_league uuid, p_results jsonb, p_final boolean) returns void language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(p_results) loop
    update public.fantasy_matchups set
      home_score = (r ->> 'home_score')::numeric, away_score = (r ->> 'away_score')::numeric,
      home_cats = r -> 'home_cats', away_cats = r -> 'away_cats',
      winner = case when p_final then nullif(r ->> 'winner', '')::uuid end,
      final = p_final
    where id = (r ->> 'id')::uuid and league_id = p_league and not final;
  end loop;
  if p_final then perform private.advance_season(p_league); end if;
end;
$$;

-- Lock every function down, then open the player-facing ones.
revoke all on all functions in schema private from public, anon, authenticated;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'fantasy\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
grant execute on function
  public.fantasy_is_member(uuid), public.fantasy_owns_team(uuid), public.fantasy_is_commish(uuid), public.fantasy_now(),
  public.fantasy_create_league(text, text, jsonb, text), public.fantasy_preview(text), public.fantasy_join(text, text),
  public.fantasy_leave(uuid), public.fantasy_update_league(uuid, text, jsonb, uuid[]), public.fantasy_fill_bots(uuid),
  public.fantasy_remove_team(uuid), public.fantasy_update_team(uuid, text, text), public.fantasy_start_draft(uuid),
  public.fantasy_draft_pick(uuid, text), public.fantasy_draft_tick(uuid), public.fantasy_draft_pause(uuid, boolean),
  public.fantasy_draft_undo(uuid), public.fantasy_set_lineup(uuid, int, text[]), public.fantasy_add_drop(uuid, text, text),
  public.fantasy_claim(uuid, text, text, int), public.fantasy_cancel_claim(uuid),
  public.fantasy_propose_trade(uuid, uuid, text[], text[], text), public.fantasy_respond_trade(uuid, boolean),
  public.fantasy_cancel_trade(uuid), public.fantasy_review_trade(uuid, boolean), public.fantasy_vote_veto(uuid),
  public.fantasy_commish_move(uuid, text, text), public.fantasy_delete_league(uuid), public.fantasy_tick(uuid),
  public.fantasy_lineups_for(uuid, int)
to authenticated;
grant execute on function public.fantasy_preview(text), public.fantasy_now() to anon;
grant execute on function public.fantasy_cron_key_ok(text), public.fantasy_admin_lineups(uuid, int),
  public.fantasy_record_scores(uuid, jsonb, boolean) to service_role;

-- Live updates for the draft room, chat, trades and scores.
alter publication supabase_realtime add table public.fantasy_leagues, public.fantasy_teams, public.fantasy_picks,
  public.fantasy_chat, public.fantasy_trades, public.fantasy_matchups;

-- Schedules: draft clocks, waivers and trade reviews every minute; sports
-- data, lock times and scores every 10 minutes via the edge function.
select cron.schedule('fantasy-minute', '* * * * *', 'select private.cron_minute()');
select cron.schedule('fantasy-sync', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://ajnzimwmykqgflymjoun.supabase.co/functions/v1/fantasy-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-key', (select value from private.config where key = 'cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
$cron$);
