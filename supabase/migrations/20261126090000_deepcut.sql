-- Deep Cut: daily "name a rare answer" game. Players submit one answer per
-- prompt as an index into the game's own answer list (never free text), so
-- nothing a player types is stored or shown to others. Counts power rarity.

create table public.deepcut_counts (
  day int not null,
  prompt smallint not null check (prompt between 0 and 6),
  answer smallint not null check (answer between 0 and 999),
  n int not null default 0,
  primary key (day, prompt, answer)
);
create table public.deepcut_plays (
  day int not null,
  client uuid not null,
  created_at timestamptz not null default now(),
  primary key (day, client)
);
alter table public.deepcut_counts enable row level security;
alter table public.deepcut_plays enable row level security;
-- No policies and no grants: only the functions below touch these tables.
revoke all on public.deepcut_counts, public.deepcut_plays from anon, authenticated;

-- Day 1 = 2026-11-24 (same epoch as the other daily games).
create or replace function public.deepcut_today() returns int
language sql stable set search_path = '' as
$$ select ((now() at time zone 'utc')::date - date '2026-11-24') + 1 $$;

-- Per prompt: how many players picked each answer, plus totals. Returns
-- [{"total": n, "counts": {"<answer>": n, ...}}, ...] for prompts 0-6.
create or replace function public.deepcut_results(p_day int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('total', coalesce(t.total, 0), 'counts', coalesce(t.counts, '{}'::jsonb)) order by p.prompt), '[]'::jsonb)
  from generate_series(0, 6) as p(prompt)
  left join (
    select prompt, sum(n)::int as total, jsonb_object_agg(answer::text, n) as counts
    from public.deepcut_counts where day = p_day group by prompt
  ) t on t.prompt = p.prompt
  where p_day between public.deepcut_today() - 400 and public.deepcut_today() + 1;
$$;

-- Records one play (once per client per day) and returns deepcut_results.
-- p_answers: 7 answer indexes, -1 for no/invalid answer.
create or replace function public.deepcut_submit(p_day int, p_client uuid, p_answers int[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  today int := public.deepcut_today();
  i int;
  inserted int;
begin
  if p_day not between today - 1 and today + 1 then raise exception 'wrong day'; end if;
  if p_answers is null or array_length(p_answers, 1) <> 7 then raise exception 'need 7 answers'; end if;
  insert into public.deepcut_plays (day, client) values (p_day, p_client) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    for i in 1..7 loop
      if p_answers[i] between 0 and 999 then
        insert into public.deepcut_counts (day, prompt, answer, n) values (p_day, i - 1, p_answers[i], 1)
        on conflict (day, prompt, answer) do update set n = public.deepcut_counts.n + 1;
      end if;
    end loop;
  end if;
  return public.deepcut_results(p_day);
end $$;

revoke all on function public.deepcut_today(), public.deepcut_results(int), public.deepcut_submit(int, uuid, int[]) from public;
grant execute on function public.deepcut_results(int), public.deepcut_submit(int, uuid, int[]) to anon, authenticated;
