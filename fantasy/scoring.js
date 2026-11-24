// Fantasy scoring, shared by the browser (fantasy/) and the fantasy-sync
// edge function (supabase/functions/fantasy-sync/scoring.js links here).
// Stats come from Sleeper's public API, keyed by Sleeper player id.

// NBA points leagues (per stat).
export const NBA_POINTS = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, to: -1, tpm: 0.5, dd: 1.5, td: 3 };

// NBA 9-category leagues. `low` = fewer is better.
export const CATS = [
  { key: 'fg_pct', label: 'FG%', pct: ['fgm', 'fga'] },
  { key: 'ft_pct', label: 'FT%', pct: ['ftm', 'fta'] },
  { key: 'tpm', label: '3PM' },
  { key: 'pts', label: 'PTS' },
  { key: 'reb', label: 'REB' },
  { key: 'ast', label: 'AST' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'to', label: 'TO', low: true },
];
const CAT_SUMS = ['fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];

const r2 = (n) => Math.round(n * 100) / 100;

// Fantasy points for one player's stat line.
export function playerPoints(sport, scoring, s) {
  if (!s) return 0;
  if (sport === 'nfl') return r2(Number(s[`pts_${scoring}`] ?? s.pts_ppr ?? 0) || 0);
  let p = 0;
  for (const [k, w] of Object.entries(NBA_POINTS)) p += (Number(s[k]) || 0) * w;
  return r2(p);
}

// Category totals for a set of starters.
export function teamCats(starters, stats) {
  const t = Object.fromEntries(CAT_SUMS.map((k) => [k, 0]));
  for (const pid of starters || []) {
    const s = pid && stats[pid];
    if (!s) continue;
    for (const k of CAT_SUMS) t[k] += Number(s[k]) || 0;
  }
  t.fg_pct = t.fga ? t.fgm / t.fga : 0;
  t.ft_pct = t.fta ? t.ftm / t.fta : 0;
  return t;
}

// Category wins: {a, b, ties, won: {key: 'a'|'b'|null}}
export function compareCats(a, b) {
  const out = { a: 0, b: 0, ties: 0, won: {} };
  for (const c of CATS) {
    const x = a[c.key], y = b[c.key];
    const pctEmpty = c.pct && !a[c.pct[1]] && !b[c.pct[1]];
    if (pctEmpty || Math.abs(x - y) < 1e-9) { out.ties++; out.won[c.key] = null; continue; }
    const aWins = c.low ? x < y : x > y;
    out[aWins ? 'a' : 'b']++;
    out.won[c.key] = aWins ? 'a' : 'b';
  }
  return out;
}

export function teamPoints(sport, scoring, starters, stats) {
  let p = 0;
  for (const pid of starters || []) if (pid) p += playerPoints(sport, scoring, stats[pid]);
  return r2(p);
}

// Result of one matchup. away may be null (a bye week).
export function matchupResult(sport, scoring, home, away, stats) {
  if (sport === 'nba' && scoring === 'cats') {
    const hc = teamCats(home, stats);
    if (!away) return { home_score: 0, away_score: null, home_cats: hc, away_cats: null, winner: null };
    const ac = teamCats(away, stats);
    const cmp = compareCats(hc, ac);
    return { home_score: cmp.a, away_score: cmp.b, home_cats: hc, away_cats: ac, winner: cmp.a > cmp.b ? 'home' : cmp.b > cmp.a ? 'away' : null };
  }
  const hs = teamPoints(sport, scoring, home, stats);
  if (!away) return { home_score: hs, away_score: null, home_cats: null, away_cats: null, winner: null };
  const as = teamPoints(sport, scoring, away, stats);
  return { home_score: hs, away_score: as, home_cats: null, away_cats: null, winner: hs > as ? 'home' : as > hs ? 'away' : null };
}
