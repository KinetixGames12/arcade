// Arcade Fantasy ↔ Supabase. Every change goes through a database function
// (see supabase/migrations/*_fantasy.sql) that checks the rules server-side.
import { client, user } from '../shared/account.js?v=5';

const sb = () => client({ detectSessionInUrl: true });

export async function rpc(fn, args) {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, ''));
  return data;
}

export async function me() { return user(); }

export async function serverOffset() {
  const t0 = Date.now();
  const now = await rpc('fantasy_now');
  const t1 = Date.now();
  return new Date(now).getTime() - (t0 + t1) / 2;
}

export async function myLeagues(sport) {
  const u = await user();
  if (!u) return [];
  const { data, error } = await sb().from('fantasy_teams')
    .select('id,name,color,league:fantasy_leagues!inner(id,name,sport,status,settings,season,start_week,invite_code,playoffs,commissioner)')
    .eq('owner', u.id).eq('league.sport', sport);
  if (error) throw error;
  return data;
}

// Everything a league page needs, in one round of parallel requests.
export async function loadLeague(id) {
  const c = sb();
  const u = await user();
  const q = (t, sel = '*') => c.from(t).select(sel).eq('league_id', id);
  const [lg, teams, picks, matchups, trades, tx, waivers, claims] = await Promise.all([
    c.from('fantasy_leagues').select('*').eq('id', id).maybeSingle(),
    q('fantasy_teams').order('created_at'),
    q('fantasy_picks').order('pick_no'),
    q('fantasy_matchups').order('week'),
    q('fantasy_trades').order('created_at', { ascending: false }).limit(100),
    q('fantasy_transactions').order('created_at', { ascending: false }).limit(100),
    q('fantasy_waivers'),
    q('fantasy_claims').order('created_at', { ascending: false }).limit(50),
  ]);
  for (const r of [lg, teams, picks, matchups, trades, tx, waivers, claims]) if (r.error) throw r.error;
  if (!lg.data) return null;
  const mine = teams.data.find((t) => t.owner === u?.id) || null;
  let queue = null;
  if (mine) {
    const { data } = await c.from('fantasy_queue').select('*').eq('team_id', mine.id).maybeSingle();
    queue = data || { team_id: mine.id, players: [], autodraft: false };
  }
  return {
    league: lg.data, teams: teams.data, picks: picks.data, matchups: matchups.data, trades: trades.data,
    tx: tx.data, waivers: waivers.data, claims: claims.data, mine, queue, uid: u?.id,
  };
}

export async function saveQueue(teamId, players, autodraft) {
  const u = await user();
  const { error } = await sb().from('fantasy_queue').upsert({ team_id: teamId, owner: u.id, players, autodraft });
  if (error) throw error;
}

export async function chatHistory(leagueId) {
  const { data, error } = await sb().from('fantasy_chat').select('*').eq('league_id', leagueId).order('id', { ascending: false }).limit(80);
  if (error) throw error;
  return data.reverse();
}
export async function sendChat(leagueId, body) {
  const { error } = await sb().from('fantasy_chat').insert({ league_id: leagueId, body });
  if (error) throw error;
}

// Calls onChange(table, payload) for any change in this league.
export function subscribe(leagueId, onChange) {
  const ch = sb().channel(`fx-${leagueId}`);
  const tables = ['fantasy_picks', 'fantasy_teams', 'fantasy_chat', 'fantasy_trades', 'fantasy_matchups'];
  for (const t of tables) ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `league_id=eq.${leagueId}` }, (p) => onChange(t, p));
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'fantasy_leagues', filter: `id=eq.${leagueId}` }, (p) => onChange('fantasy_leagues', p));
  ch.subscribe();
  return () => sb().removeChannel(ch);
}
