// Per-sport rules for Arcade Fantasy. Server-side twins live in the fantasy
// migration (private.slot_ok, private.clean_settings).

export const SPORTS = {
  nfl: {
    key: 'nfl', name: 'Fantasy Football', league: 'NFL', slug: 'fantasy-football', accent: '#22c55e', maxWeek: 18,
    positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
    slotTypes: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SFLEX', 'K', 'DEF'],
    slotLabel: { FLEX: 'W/R/T', SFLEX: 'SFLX' },
    slotHelp: { FLEX: 'RB, WR or TE', SFLEX: 'QB, RB, WR or TE' },
    presets: {
      Standard: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'],
      Superflex: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SFLEX', 'K', 'DEF'],
      '3 WR': ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'],
      'No kickers': ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'DEF'],
    },
    defaults: { teams: 10, bench: 6, scoring: 'ppr', pick_seconds: 90, waiver: 'rolling', faab_budget: 100, trade_review: 'commish', playoff_teams: 4, playoff_start: 15 },
    scoring: [
      { v: 'ppr', label: 'PPR', help: 'A point for every catch' },
      { v: 'half_ppr', label: 'Half PPR', help: 'Half a point per catch' },
      { v: 'std', label: 'Standard', help: 'No points for catches' },
    ],
    colors: { QB: '#ff4f7e', RB: '#2fd68a', WR: '#4fb3ff', TE: '#ffb547', K: '#b48cff', DEF: '#9aa0b4' },
    unit: 'pts',
  },
  nba: {
    key: 'nba', name: 'Fantasy Basketball', league: 'NBA', slug: 'fantasy-basketball', accent: '#f97316', maxWeek: 25,
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    slotTypes: ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'UTIL'],
    slotLabel: {},
    slotHelp: { G: 'PG or SG', F: 'SF or PF', UTIL: 'Anyone' },
    presets: {
      Standard: ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'C', 'UTIL', 'UTIL'],
      Compact: ['PG', 'SG', 'SF', 'PF', 'C', 'UTIL', 'UTIL', 'UTIL'],
      'All UTIL': ['UTIL', 'UTIL', 'UTIL', 'UTIL', 'UTIL', 'UTIL', 'UTIL', 'UTIL', 'UTIL', 'UTIL'],
    },
    defaults: { teams: 10, bench: 3, scoring: 'points', pick_seconds: 90, waiver: 'rolling', faab_budget: 100, trade_review: 'commish', playoff_teams: 4, playoff_start: 22 },
    scoring: [
      { v: 'points', label: 'Points', help: 'PTS 1 · REB 1.2 · AST 1.5 · STL 3 · BLK 3 · TO −1 · 3PM 0.5 · DD 1.5 · TD 3' },
      { v: 'cats', label: '9-Cat', help: 'Win the week category by category: FG% FT% 3PM PTS REB AST STL BLK TO' },
    ],
    colors: { PG: '#4fb3ff', SG: '#2fd68a', SF: '#ffb547', PF: '#ff4f7e', C: '#b48cff' },
    unit: 'fpts',
  },
};

const FLEX = { FLEX: ['RB', 'WR', 'TE'], SFLEX: ['QB', 'RB', 'WR', 'TE'], G: ['PG', 'SG'], F: ['SF', 'PF'] };

export function slotOk(slot, positions = []) {
  if (slot === 'UTIL') return positions.length > 0;
  const allowed = FLEX[slot] || [slot];
  return positions.some((p) => allowed.includes(p));
}

export const slotName = (sp, slot) => sp.slotLabel[slot] || slot;

export function headshot(sport, p) {
  if (!p) return '';
  if (sport === 'nfl' && p.pos === 'DEF') return teamLogo(sport, p.id);
  return `https://sleepercdn.com/content/${sport}/players/thumb/${p.id}.jpg`;
}
export const teamLogo = (sport, team) => (team ? `https://sleepercdn.com/images/team_logos/${sport}/${String(team).toLowerCase()}.png` : '');

export function rosterSize(settings) { return settings.slots.length + Number(settings.bench); }
