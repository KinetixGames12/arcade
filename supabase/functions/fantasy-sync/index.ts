// fantasy-sync: runs every 10 minutes from pg_cron (see the fantasy migration).
// For NFL and NBA it pulls the current week, lineup lock times and the player
// pool (names, teams, ADP, projections, injuries) from Sleeper's public API,
// then scores every in-season matchup: live for the current week, final for
// finished weeks (which also seeds playoffs and crowns champions in SQL).
// Callers must send the x-cron-key header stored in private.config.
import { createClient } from 'npm:@supabase/supabase-js@2.110.1';
import { matchupResult, NBA_POINTS } from './scoring.js';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const API = 'https://api.sleeper.app';
const POSITIONS: Record<string, string[]> = { nfl: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'], nba: ['PG', 'SG', 'SF', 'PF', 'C'] };
// Lineups lock at the start of a team's game day (UTC): 9am ET for NFL, noon ET for NBA.
const LOCK_HOUR: Record<string, string> = { nfl: '13', nba: '16' };

async function get(url: string) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function syncPlayers(sport: string, season: string) {
  const q = POSITIONS[sport].map((p) => `position%5B%5D=${p}`).join('&');
  const rows = await get(`${API}/projections/${sport}/${season}?season_type=regular&${q}`);
  const now = new Date().toISOString();
  const out = new Map<string, Record<string, unknown>>();
  for (const e of rows) {
    const p = e.player || {};
    const s = e.stats || {};
    const team = e.team || p.team || null;
    const adpRaw = sport === 'nfl' ? s.adp_ppr : s.adp_std;
    const adp = typeof adpRaw === 'number' && adpRaw < 999 ? adpRaw : null;
    if (!team && adp == null) continue;
    let proj: number | null = null;
    if (sport === 'nfl') proj = typeof s.pts_ppr === 'number' ? s.pts_ppr : null;
    else {
      let pts = 0;
      for (const [k, w] of Object.entries(NBA_POINTS)) pts += (Number(s[k]) || 0) * (w as number);
      proj = Math.round(pts * 10) / 10;
    }
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    if (!name || !e.player_id) continue;
    out.set(e.player_id, {
      sport, player_id: String(e.player_id), name, pos: p.position ?? null,
      positions: p.fantasy_positions?.length ? p.fantasy_positions : (p.position ? [p.position] : []),
      team, adp, proj, injury: p.injury_status ?? null, updated_at: now,
    });
  }
  const list = [...out.values()];
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await sb.from('fantasy_players').upsert(list.slice(i, i + 500));
    if (error) throw error;
  }
  // Players who dropped out of the pool can't be auto-drafted any more.
  await sb.from('fantasy_players').update({ adp: null }).eq('sport', sport).lt('updated_at', now);
  return list.length;
}

const statsCache = new Map<string, Record<string, Record<string, number>>>();
async function weekStats(sport: string, season: string, week: number) {
  const k = `${sport}/${season}/${week}`;
  if (!statsCache.has(k)) statsCache.set(k, (await get(`${API}/v1/stats/${sport}/regular/${season}/${week}`)) || {});
  return statsCache.get(k)!;
}

async function syncSport(sport: string) {
  const st = await get(`${API}/v1/state/${sport}`);
  const season = String(st.season);
  const week = Number(st.week) || 0;
  const sched = await get(`${API}/schedule/${sport}/regular/${season}`);
  const locks: Record<string, string> = {};
  for (const g of sched) {
    if (g.week !== week || !g.date) continue;
    for (const side of [g.home, g.away]) {
      const team = typeof side === 'string' ? side : side?.team;
      if (!team) continue;
      const t = `${g.date}T${LOCK_HOUR[sport]}:00:00Z`;
      if (!locks[team] || t < locks[team]) locks[team] = t;
    }
  }
  const { data: prev } = await sb.from('fantasy_state').select('players_at').eq('sport', sport).maybeSingle();
  let playersAt = prev?.players_at as string | null;
  let players = 0;
  if (!playersAt || Date.now() - Date.parse(playersAt) > 6 * 3600e3) {
    players = await syncPlayers(sport, season);
    playersAt = new Date().toISOString();
  }
  const { error: se } = await sb.from('fantasy_state').upsert({
    sport, season, week, season_type: st.season_type ?? 'regular', locks, players_at: playersAt, updated_at: new Date().toISOString(),
  });
  if (se) throw se;

  // Weeks before the current one are final; after the regular season, all are.
  const doneBefore = st.season_type === 'regular' ? week : st.season_type === 'post' ? 99 : 0;
  const { data: leagues } = await sb.from('fantasy_leagues').select('id, settings').eq('sport', sport).eq('status', 'in_season');
  let scored = 0;
  for (const l of leagues ?? []) {
    const { data: ms } = await sb.from('fantasy_matchups').select('id, week, home, away')
      .eq('league_id', l.id).eq('final', false).lte('week', Math.max(week, doneBefore)).order('week');
    const weeks = [...new Set((ms ?? []).map((m) => m.week))];
    for (const w of weeks) {
      const stats = await weekStats(sport, season, w);
      const { data: lineups } = await sb.rpc('fantasy_admin_lineups', { p_league: l.id, p_week: w });
      const results = (ms ?? []).filter((m) => m.week === w).map((m) => {
        const r = matchupResult(sport, l.settings.scoring, lineups?.[m.home] ?? [], m.away ? (lineups?.[m.away] ?? []) : null, stats);
        return { id: m.id, ...r, winner: r.winner === 'home' ? m.home : r.winner === 'away' ? m.away : null };
      });
      const { error } = await sb.rpc('fantasy_record_scores', { p_league: l.id, p_results: results, p_final: w < doneBefore });
      if (error) throw error;
      scored += results.length;
    }
  }
  return `${sport}: week ${week} (${st.season_type}), ${Object.keys(locks).length} teams with games, ${players} players synced, ${scored} matchups scored`;
}

Deno.serve(async (req) => {
  const { data: ok } = await sb.rpc('fantasy_cron_key_ok', { p_key: req.headers.get('x-cron-key') ?? '' });
  if (!ok) return new Response('Forbidden', { status: 403 });
  const log: string[] = [];
  for (const sport of ['nfl', 'nba']) {
    try { log.push(await syncSport(sport)); } catch (e) { log.push(`${sport} failed: ${(e as Error).message}`); console.error(e); }
  }
  console.log(log.join(' | '));
  return Response.json({ log });
});
