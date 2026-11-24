-- Fix: process_waivers had a variable named like a column (faab).
create or replace function private.process_waivers(p_league uuid) returns void language plpgsql set search_path = '' as $$
declare l public.fantasy_leagues; c record; t public.fantasy_teams; is_faab boolean; n int; maxr int; why text;
begin
  select * into l from public.fantasy_leagues where id = p_league;
  is_faab := l.settings ->> 'waiver' = 'faab';
  maxr := private.max_roster(l.settings);
  select count(*) into n from public.fantasy_teams where league_id = p_league;
  loop
    select cl.* into c from public.fantasy_claims cl
      join public.fantasy_teams tm on tm.id = cl.team_id
      left join public.fantasy_waivers w on w.league_id = cl.league_id and w.player_id = cl.add_player
     where cl.league_id = p_league and cl.status = 'pending' and (w.until is null or w.until <= now())
     order by case when is_faab then cl.bid else 0 end desc, tm.waiver_priority asc nulls last, cl.created_at
     limit 1;
    exit when not found;
    select * into t from public.fantasy_teams where id = c.team_id for update;
    why := null;
    if exists (select 1 from public.fantasy_teams x where x.league_id = p_league and c.add_player = any (x.roster)) then why := 'Already on a roster';
    elsif c.drop_player is not null and not c.drop_player = any (t.roster) then why := 'The player you meant to drop is gone';
    elsif cardinality(t.roster) - (c.drop_player is not null)::int + 1 > maxr then why := 'Roster full';
    elsif is_faab and c.bid > t.faab then why := 'Not enough FAAB left';
    end if;
    if why is not null then
      update public.fantasy_claims set status = case when why = 'Already on a roster' then 'lost' else 'failed' end, note = why where id = c.id;
      continue;
    end if;
    update public.fantasy_teams
       set roster = array_append(array_remove(roster, c.drop_player), c.add_player),
           faab = faab - case when is_faab then c.bid else 0 end
     where id = t.id;
    if not is_faab then
      update public.fantasy_teams set waiver_priority = waiver_priority - 1
       where league_id = p_league and waiver_priority > t.waiver_priority;
      update public.fantasy_teams set waiver_priority = n where id = t.id;
    end if;
    update public.fantasy_claims set status = 'won', note = case when is_faab then '$' || c.bid end where id = c.id;
    update public.fantasy_claims set status = 'lost', note = 'Another team won the claim'
     where league_id = p_league and status = 'pending' and add_player = c.add_player;
    delete from public.fantasy_waivers where league_id = p_league and player_id = c.add_player;
    if c.drop_player is not null then
      insert into public.fantasy_waivers (league_id, player_id, until) values (p_league, c.drop_player, now() + interval '1 day')
      on conflict (league_id, player_id) do update set until = excluded.until;
    end if;
    perform private.log(p_league, 'waiver', t.id, array[c.add_player], case when c.drop_player is null then '{}' else array[c.drop_player] end,
                        null, case when is_faab then '$' || c.bid end);
  end loop;
end;
$$;
revoke all on function private.process_waivers(uuid) from public, anon, authenticated;

-- Fix: auto-draft fills every starting spot (it could skip QB when RBs/WRs had better ADP).
create or replace function private.autopick(p_league uuid, p_team uuid) returns text language plpgsql stable set search_path = '' as $$
declare
  l public.fantasy_leagues; s text[]; q text[]; pid text; c record;
  n int; rounds int; rnd int; have jsonb; need_k boolean; need_def boolean; cap int; cnt int; deficit int; needpos text[]; must boolean;
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
  -- Starting spots still empty. When the picks left can only just fill them, fill them first.
  select coalesce(sum(greatest(0, req - coalesce((have ->> pos)::int, 0))), 0),
         coalesce(array_agg(pos) filter (where req > coalesce((have ->> pos)::int, 0)), '{}')
    into deficit, needpos
    from (select x pos, count(*) req from unnest(s) x where x not in ('FLEX', 'SFLEX', 'G', 'F', 'UTIL') group by x) z;
  must := deficit >= rounds - rnd + 1;

  for c in
    select p.player_id, p.pos, p.positions from public.fantasy_players p
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
    if must and not (c.positions && needpos) then continue; end if;
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
revoke all on function private.autopick(uuid, uuid) from public, anon, authenticated;

-- Pin search_path on the small helper functions (security advisor).
alter function public.fantasy_now() set search_path = '';
alter function private.max_week(text) set search_path = '';
alter function private.slots(jsonb) set search_path = '';
alter function private.max_roster(jsonb) set search_path = '';
alter function private.slot_ok(text, text[]) set search_path = '';
alter function private.team_at(jsonb, int) set search_path = '';
