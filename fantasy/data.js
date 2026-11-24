// Sports data: the player pool comes from our fantasy_players table (kept in
// sync with Sleeper by the fantasy-sync edge function, so the browser and the
// server agree on who exists). Weekly stats, projections and schedules come
// straight from Sleeper's public API, which allows browser requests.
import { client } from '../shared/account.js?v=2';

const API = 'https://api.sleeper.app';
const mem = new Map();

async function cached(key, ttlMs, load) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.p;
  const p = load().catch((e) => { mem.delete(key); throw e; });
  mem.set(key, { t: Date.now(), p });
  return p;
}

async function sleeper(path) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`Sports data is unavailable right now (${r.status}).`);
  return r.json();
}

export function sportState(sport) {
  return cached(`state/${sport}`, 60e3, async () => {
    const { data, error } = await client().from('fantasy_state').select('*').eq('sport', sport).maybeSingle();
    if (error) throw error;
    return data || { sport, season: String(new Date().getFullYear()), week: 1, locks: {} };
  });
}

// Map of player id → {id, name, pos, positions, team, adp, proj, injury}.
export function playerPool(sport) {
  return cached(`pool/${sport}`, 30 * 60e3, async () => {
    const key = `arcade-fx-pool-${sport}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved && Date.now() - saved.t < 30 * 60e3) return new Map(saved.rows.map((r) => [r.id, r]));
    } catch { /* storage unavailable: just fetch */ }
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client().from('fantasy_players')
        .select('player_id,name,pos,positions,team,adp,proj,injury').eq('sport', sport)
        .order('player_id').range(from, from + 999);
      if (error) throw error;
      rows.push(...data.map((p) => ({ id: p.player_id, name: p.name, pos: p.pos, positions: p.positions, team: p.team, adp: p.adp == null ? null : Number(p.adp), proj: p.proj == null ? null : Number(p.proj), injury: p.injury })));
      if (data.length < 1000) break;
    }
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), rows })); } catch { /* too big or private mode */ }
    return new Map(rows.map((r) => [r.id, r]));
  });
}

export const weekStats = (sport, season, week) =>
  cached(`stats/${sport}/${season}/${week}`, 60e3, async () => (await sleeper(`/v1/stats/${sport}/regular/${season}/${week}`)) || {});

export const weekProj = (sport, season, week) =>
  cached(`proj/${sport}/${season}/${week}`, 30 * 60e3, async () => (await sleeper(`/v1/projections/${sport}/regular/${season}/${week}`)) || {});

// {team: [{opp, home, date, status, score}]} for one week.
export function weekGames(sport, season, week) {
  return cached(`sched/${sport}/${season}/${week}`, 5 * 60e3, async () => {
    const all = await cached(`schedule/${sport}/${season}`, 30 * 60e3, () => sleeper(`/schedule/${sport}/regular/${season}`));
    const out = {};
    for (const g of all) {
      if (g.week !== week) continue;
      const h = typeof g.home === 'string' ? g.home : g.home?.team;
      const a = typeof g.away === 'string' ? g.away : g.away?.team;
      if (!h || !a) continue;
      (out[h] ||= []).push({ opp: a, home: true, date: g.date, status: g.status });
      (out[a] ||= []).push({ opp: h, home: false, date: g.date, status: g.status });
    }
    return out;
  });
}

// Week-by-week stats (and projections) for one player this season.
export const playerLog = (sport, season, id) =>
  cached(`log/${sport}/${season}/${id}`, 5 * 60e3, () => sleeper(`/stats/${sport}/player/${encodeURIComponent(id)}?season_type=regular&season=${season}&grouping=week`));
export const playerProjLog = (sport, season, id) =>
  cached(`plog/${sport}/${season}/${id}`, 30 * 60e3, () => sleeper(`/projections/${sport}/player/${encodeURIComponent(id)}?season_type=regular&season=${season}&grouping=week`));

// Sleeper's NBA logs hold a list of games per week; NFL holds one game.
export function weekLines(entry) {
  if (!entry) return [];
  return (Array.isArray(entry) ? entry : [entry]).filter((g) => g && g.stats);
}

export function sumStats(lines) {
  const t = {};
  for (const g of lines) for (const [k, v] of Object.entries(g.stats)) if (typeof v === 'number') t[k] = (t[k] || 0) + v;
  return t;
}
