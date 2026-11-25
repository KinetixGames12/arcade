// Kinetix Fantasy: one app for NFL (fantasy-football/) and NBA
// (fantasy-basketball/). The page's <body data-sport> picks the sport.
import { mountAccount, onAuthChange, user, openSignIn } from '../shared/account.js?v=5';
import { SPORTS, slotOk, slotName, headshot, teamLogo, rosterSize } from './sports.js?v=2';
import * as api from './api.js?v=3';
import * as data from './data.js?v=3';
import { playerPoints, CATS, teamCats, compareCats } from './scoring.js?v=2';
import { esc, $, $$, toast, modal, confirmBox, fmt, timeAgo, teamBadge, busy, pct } from './ui.js?v=2';
import { DraftRoom, runMock, fillSlots } from './draft.js?v=2';

const SPORT = document.body.dataset.sport;
const sp = SPORTS[SPORT];
const main = document.getElementById('app');
const G = { state: null, pool: null, offset: 0, cleanup: [] };

window.ArcadeTheme?.mount(document.getElementById('themeBtn'));
mountAccount(document.getElementById('acct'));
onAuthChange(() => route());
window.addEventListener('hashchange', () => route());

const pl = (id) => G.pool?.get(id) || { id, name: id, pos: '?', positions: [], team: null };
const posTag = (p) => `<i class="pos" style="--pc:${sp.colors[p.pos] || '#888'}">${esc(p.pos || '?')}</i>`;
const errBox = (e) => `<div class="fx-empty"><b>Something went wrong.</b><p class="ar-muted">${esc(e.message || e)}</p><button class="ar-btn ghost" data-reload>Reload</button></div>`;
const loading = (t = 'Loading…') => `<div class="fx-loading"><span class="fx-spin"></span>${esc(t)}</div>`;

function playerCell(p, extra = '') {
  return `<button type="button" class="fx-pc" data-player="${esc(p.id)}">
    <img src="${esc(headshot(SPORT, p))}" alt="" loading="lazy">
    <span><b>${esc(p.name)}</b><small>${posTag(p)} ${esc(p.team || 'FA')}${p.injury ? ` <em class="inj">${esc(p.injury)}</em>` : ''}${extra}</small></span></button>`;
}
// Hide broken headshots (no inline handlers: the page's CSP forbids them).
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('noimg'); }, true);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-reload]')) location.reload();
  const b = e.target.closest('[data-player]');
  if (b) { e.preventDefault(); openPlayer(b.dataset.player); }
});

async function boot() {
  [G.state, G.pool] = await Promise.all([data.sportState(SPORT), data.playerPool(SPORT)]);
  try { G.offset = await api.serverOffset(); } catch { G.offset = 0; }
}

async function route() {
  G.cleanup.splice(0).forEach((fn) => { try { fn(); } catch { /* already gone */ } });
  const h = location.hash || '#/';
  let m;
  try {
    if (!G.pool) { main.innerHTML = loading('Loading players…'); await boot(); }
    if ((m = h.match(/^#\/l\/([0-9a-f-]{36})(?:\/(\w+))?/))) return await leagueView(m[1], m[2]);
    if ((m = h.match(/^#\/join\/([A-Za-z0-9]{4,10})/))) return await joinView(m[1].toUpperCase());
    if (h.startsWith('#/create')) return await createView();
    if (h.startsWith('#/mock')) return mockView();
    if (h.startsWith('#/players')) return playersResearch();
    return await home();
  } catch (e) {
    console.error(e);
    main.innerHTML = errBox(e);
  }
}

/* ───────────── home ───────────── */
async function home() {
  const u = await user();
  const st = G.state;
  main.innerHTML = `
    <section class="fx-hero">
      <div class="fx-hero-in">
        <p class="ar-eyebrow">${sp.league} · ${esc(st.season)} season · Week ${st.week}</p>
        <h1 class="ar-display">${esc(sp.name)}</h1>
        <p class="ar-muted fx-lede">${SPORT === 'nfl'
    ? 'Start a league with friends, run a live snake draft, then set lineups, work the waiver wire and trade your way to a title.'
    : 'Points or 9-cat. Draft an NBA roster with friends and go head-to-head every week.'}</p>
        <div class="fx-cta"><a class="ar-btn lg" href="#/create">Create a league</a><a class="ar-btn lg ghost" href="#/mock">Mock draft</a></div>
      </div>
      <img class="fx-hero-art" src="../shared/art/${sp.slug}.svg?v=1" alt="">
    </section>
    <section class="fx-sec">
      <div class="fx-sechead"><h2 class="ar-display">Your leagues</h2>
        <form class="fx-join" id="joinForm"><input class="ar-input" name="code" placeholder="Invite code" maxlength="10" autocomplete="off" aria-label="Invite code"><button class="ar-btn ghost">Join</button></form></div>
      <div id="myLeagues" class="fx-grid">${u ? loading() : `<div class="fx-empty"><b>Sign in to play in leagues.</b><p class="ar-muted">Mock drafts and player research work without an account.</p><button class="ar-btn" id="signInBtn">Sign in</button></div>`}</div>
    </section>
    <section class="fx-sec">
      <div class="fx-sechead"><h2 class="ar-display">Top players</h2><a class="ar-btn sm ghost" href="#/players">All players</a></div>
      <div class="fx-top">${[...G.pool.values()].filter((p) => p.adp != null).sort((a, b) => a.adp - b.adp).slice(0, 12).map((p, i) => `<div class="fx-toprow"><span class="fx-rank">${i + 1}</span>${playerCell(p)}<span class="fx-num">${p.proj != null ? fmt(p.proj, SPORT === 'nfl' ? 0 : 1) : ''}</span></div>`).join('')}</div>
    </section>`;
  $('#signInBtn')?.addEventListener('click', openSignIn);
  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim().toUpperCase();
    if (code) location.hash = `#/join/${code}`;
  });
  if (!u) return;
  const mine = await api.myLeagues(SPORT);
  const box = $('#myLeagues');
  if (!mine.length) {
    box.innerHTML = '<div class="fx-empty"><b>No leagues yet.</b><p class="ar-muted">Create one and send the invite link to your friends, or paste a code above.</p><a class="ar-btn" href="#/create">Create a league</a></div>';
    return;
  }
  const label = { pre_draft: 'Waiting to draft', drafting: 'Draft is live', in_season: 'In season', complete: 'Season over' };
  box.innerHTML = mine.map(({ league: l, ...t }) => `
    <a class="fx-lcard" href="#/l/${l.id}">
      <span class="fx-lcard-top">${teamBadge(t, 42)}<span><b>${esc(l.name)}</b><small class="ar-muted">${esc(t.name)}</small></span></span>
      <span class="fx-lcard-foot"><span class="ar-chip${l.status === 'drafting' ? ' live' : ''}">${label[l.status]}</span>
      <span class="ar-muted small">${l.settings.teams} teams · ${esc(scoringLabel(l.settings.scoring))}</span></span>
    </a>`).join('');
}

const scoringLabel = (v) => sp.scoring.find((s) => s.v === v)?.label || v;

/* ───────────── create / settings form ───────────── */
function settingsForm(s, { name = '', team = '', full = true } = {}) {
  const counts = {};
  for (const x of s.slots) counts[x] = (counts[x] || 0) + 1;
  const sel = (n, opts, v) => `<select class="ar-select" name="${n}">${opts.map(([val, lab]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
  const weeks = Array.from({ length: sp.maxWeek - 1 }, (_, i) => [i + 2, `Week ${i + 2}`]);
  return `
  ${name !== null ? `<div class="fx-form2">
    <label class="ar-field">League name<input class="ar-input" name="name" required minlength="2" maxlength="40" value="${esc(name)}" placeholder="${SPORT === 'nfl' ? 'Sunday Funday' : 'Hoops Night'}"></label>
    ${team !== null ? `<label class="ar-field">Your team name<input class="ar-input" name="team" required minlength="2" maxlength="30" value="${esc(team)}" placeholder="Team name"></label>` : ''}
  </div>` : ''}
  ${full ? `
  <div class="fx-field"><span class="fx-lab">Scoring</span><div class="fx-seg" data-name="scoring">${sp.scoring.map((o) => `<label><input type="radio" name="scoring" value="${o.v}"${o.v === s.scoring ? ' checked' : ''}><span><b>${o.label}</b><small>${esc(o.help)}</small></span></label>`).join('')}</div></div>
  <div class="fx-form3">
    <label class="ar-field">Teams${sel('teams', Array.from({ length: 15 }, (_, i) => [i + 2, `${i + 2} teams`]), s.teams)}</label>
    <label class="ar-field">Pick timer${sel('pick_seconds', [[30, '30 seconds'], [60, '1 minute'], [90, '90 seconds'], [120, '2 minutes'], [300, '5 minutes'], [3600, '1 hour (slow draft)'], [28800, '8 hours (slow draft)']], s.pick_seconds)}</label>
    <label class="ar-field">Bench spots${sel('bench', Array.from({ length: 16 }, (_, i) => [i, String(i)]), s.bench)}</label>
  </div>
  <div class="fx-field"><span class="fx-lab">Starting lineup <span class="ar-muted">· presets: ${Object.keys(sp.presets).map((k) => `<button type="button" class="fx-link" data-preset="${esc(k)}">${esc(k)}</button>`).join(' · ')}</span></span>
    <div class="fx-slots">${sp.slotTypes.map((t) => `<div class="fx-slot"><span><b>${esc(slotName(sp, t))}</b>${sp.slotHelp[t] ? `<small>${esc(sp.slotHelp[t])}</small>` : ''}</span>
      <span class="fx-step"><button type="button" data-step="-1" data-slot="${t}" aria-label="Fewer ${t}">−</button><output data-count="${t}">${counts[t] || 0}</output><button type="button" data-step="1" data-slot="${t}" aria-label="More ${t}">+</button></span></div>`).join('')}</div></div>
  <div class="fx-form3">
    <label class="ar-field">Waivers${sel('waiver', [['rolling', 'Rolling priority'], ['faab', 'FAAB (blind bids)']], s.waiver)}</label>
    <label class="ar-field">FAAB budget${sel('faab_budget', [[100, '$100'], [200, '$200'], [1000, '$1000']], s.faab_budget)}</label>
    <label class="ar-field">Playoff teams${sel('playoff_teams', [[0, 'No playoffs'], [2, '2 teams'], [4, '4 teams'], [6, '6 teams'], [8, '8 teams']], s.playoff_teams)}</label>
    <label class="ar-field">Playoffs start${sel('playoff_start', weeks, s.playoff_start)}</label>
  </div>` : ''}
  <div class="fx-form3">
    <label class="ar-field">Trade review${sel('trade_review', [['commish', 'Commissioner approves'], ['league', 'League can veto (24h)'], ['none', 'Instant']], s.trade_review)}</label>
    <label class="ar-field">Trade deadline${sel('trade_deadline', [['', 'None'], ...Array.from({ length: sp.maxWeek }, (_, i) => [i + 1, `After week ${i + 1}`])], s.trade_deadline ?? '')}</label>
  </div>`;
}

function wireSettingsForm(form, s) {
  let slots = [...s.slots];
  const paint = () => sp.slotTypes.forEach((t) => { const o = form.querySelector(`[data-count="${t}"]`); if (o) o.textContent = slots.filter((x) => x === t).length; });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step],[data-preset]');
    if (!b) return;
    if (b.dataset.preset) slots = [...sp.presets[b.dataset.preset]];
    else {
      const t = b.dataset.slot;
      if (+b.dataset.step > 0 && slots.length < 20) slots.push(t);
      if (+b.dataset.step < 0) { const i = slots.lastIndexOf(t); if (i >= 0) slots.splice(i, 1); }
      slots = sp.slotTypes.flatMap((x) => slots.filter((y) => y === x));
    }
    paint();
  });
  return () => {
    const f = new FormData(form);
    const out = { trade_review: f.get('trade_review'), trade_deadline: f.get('trade_deadline') ? +f.get('trade_deadline') : null };
    if (f.has('teams')) Object.assign(out, {
      teams: +f.get('teams'), bench: +f.get('bench'), scoring: f.get('scoring'), pick_seconds: +f.get('pick_seconds'), slots,
      waiver: f.get('waiver'), faab_budget: +f.get('faab_budget'), playoff_teams: +f.get('playoff_teams'), playoff_start: +f.get('playoff_start'),
    });
    return out;
  };
}

async function createView() {
  if (!(await user())) {
    main.innerHTML = '<div class="fx-empty"><b>Sign in to create a league.</b><p class="ar-muted">Your league lives in your Kinetix account, on every device.</p><button class="ar-btn" id="si">Sign in</button></div>';
    $('#si').onclick = openSignIn;
    return;
  }
  const s = { ...sp.defaults, slots: [...sp.presets.Standard], trade_deadline: null };
  main.innerHTML = `<section class="fx-page"><a class="fx-back" href="#/">← ${esc(sp.name)}</a>
    <h1 class="ar-display fx-h1">New league</h1>
    <form class="fx-form ar-card" id="cf">${settingsForm(s)}
      <p class="ar-muted small">You’ll be the commissioner. You can change any of this until the draft starts.</p>
      <div class="fx-row end"><button class="ar-btn lg">Create league</button></div></form></section>`;
  const form = $('#cf');
  const read = wireSettingsForm(form, s);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button.lg');
    busy(btn, true);
    try {
      const id = await api.rpc('fantasy_create_league', { p_sport: SPORT, p_name: form.name.value, p_settings: read(), p_team_name: form.team.value });
      location.hash = `#/l/${id}`;
    } catch (err) { toast(err.message); busy(btn, false); }
  });
}

async function joinView(code) {
  main.innerHTML = loading('Finding league…');
  const info = await api.rpc('fantasy_preview', { p_code: code });
  if (!info) { main.innerHTML = `<div class="fx-empty"><b>No league has the code ${esc(code)}.</b><p class="ar-muted">Check the code with whoever sent it.</p><a class="ar-btn ghost" href="#/">Back</a></div>`; return; }
  if (info.member) { location.hash = `#/l/${info.id}`; return; }
  if (info.sport !== SPORT) { location.href = `../${SPORTS[info.sport].slug}/#/join/${code}`; return; }
  const u = await user();
  main.innerHTML = `<section class="fx-page narrow"><div class="ar-card fx-joincard">
    <img src="../shared/art/${sp.slug}.svg?v=1" alt="" class="fx-joinart">
    <p class="ar-eyebrow">You’re invited</p><h1 class="ar-display fx-h1">${esc(info.name)}</h1>
    <p class="ar-muted">${sp.league} · ${esc(scoringLabel(info.scoring))} · ${info.teams} of ${info.max} teams joined</p>
    ${info.status !== 'pre_draft' ? '<p class="fx-warn">This league has already drafted, so it can’t take new teams.</p>'
    : info.teams >= info.max ? '<p class="fx-warn">This league is full.</p>'
      : u ? `<form id="jf" class="fx-row"><input class="ar-input" name="team" required minlength="2" maxlength="30" placeholder="Your team name"><button class="ar-btn">Join league</button></form>`
        : '<button class="ar-btn lg" id="si">Sign in to join</button>'}
  </div></section>`;
  $('#si')?.addEventListener('click', openSignIn);
  $('#jf')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    busy(e.target.querySelector('button'), true);
    try { location.hash = `#/l/${await api.rpc('fantasy_join', { p_code: code, p_team_name: e.target.team.value })}`; } catch (err) { toast(err.message); busy(e.target.querySelector('button'), false); }
  });
}

/* ───────────── mock draft & research ───────────── */
function mockView() {
  const s = { ...sp.defaults, slots: [...sp.presets.Standard] };
  main.innerHTML = `<section class="fx-page"><a class="fx-back" href="#/">← ${esc(sp.name)}</a>
    <h1 class="ar-display fx-h1">Mock draft</h1><p class="ar-muted">Practice against bots that draft like real people. Nothing is saved.</p>
    <form class="ar-card fx-form" id="mf"><div class="fx-form3">
      <label class="ar-field">Teams<select class="ar-select" name="teams">${[8, 10, 12, 14].map((n) => `<option${n === 10 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="ar-field">Your pick<select class="ar-select" name="slot"><option value="0">Random</option>${Array.from({ length: 14 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
      <label class="ar-field">Roster<select class="ar-select" name="preset">${Object.keys(sp.presets).map((k) => `<option>${esc(k)}</option>`).join('')}</select></label>
    </div><div class="fx-row end"><button class="ar-btn lg">Start mock draft</button></div></form></section>`;
  $('#mf').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const teams = +f.teams.value;
    const slot = +f.slot.value || 1 + Math.floor(Math.random() * teams);
    const settings = { ...s, teams, slots: [...sp.presets[f.preset.value]] };
    main.innerHTML = `<section class="fx-draftpage"><div class="fx-draftbar"><a class="fx-back" href="#/">← Leave mock draft</a><span class="ar-chip">Mock · pick ${slot} of ${teams}</span></div><div id="room"></div></section>`;
    const room = runMock($('#room'), { sport: SPORT, settings, pool: G.pool, slot, onPlayer: openPlayer });
    G.cleanup.push(() => room.destroy());
  });
}

function playersResearch() {
  main.innerHTML = `<section class="fx-page"><a class="fx-back" href="#/">← ${esc(sp.name)}</a><h1 class="ar-display fx-h1">Players</h1>
    <div class="fx-filters"><input class="ar-input" id="pq" type="search" placeholder="Search players or teams"><div class="ar-tabs" id="pp">${['ALL', ...sp.positions].map((p) => `<button type="button" data-pos="${p}" aria-selected="${p === 'ALL'}">${p === 'ALL' ? 'All' : p}</button>`).join('')}</div></div>
    <div class="fx-list" id="pl"></div></section>`;
  let pos = 'ALL';
  const draw = () => {
    const q = $('#pq').value.trim().toLowerCase();
    const rows = [...G.pool.values()].filter((p) => (pos === 'ALL' || (p.positions || []).includes(pos)) && (!q || p.name.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.adp ?? 9999) - (b.adp ?? 9999)).slice(0, 200);
    $('#pl').innerHTML = `<div class="fx-lrow head"><span>Player</span><span>ADP</span><span>Proj</span></div>` + rows.map((p) => `<div class="fx-lrow">${playerCell(p)}<span class="fx-num">${p.adp != null ? fmt(p.adp, 1) : '—'}</span><span class="fx-num">${p.proj != null ? fmt(p.proj, SPORT === 'nfl' ? 0 : 1) : '—'}</span></div>`).join('');
  };
  $('#pq').addEventListener('input', draw);
  $('#pp').addEventListener('click', (e) => { const b = e.target.closest('[data-pos]'); if (!b) return; pos = b.dataset.pos; $$('#pp button').forEach((x) => x.setAttribute('aria-selected', String(x === b))); draw(); });
  draw();
}

/* ───────────── player card ───────────── */
async function openPlayer(id) {
  const p = pl(id);
  const L = G.league;
  const scoring = L?.league.settings.scoring || sp.defaults.scoring;
  const owner = L?.teams.find((t) => t.roster.includes(id));
  const m = modal(`<div class="fx-player">
    <header class="fx-phead"><img class="fx-phs" src="${esc(headshot(SPORT, p))}" alt="">
      <div><h2 class="ar-display">${esc(p.name)}</h2><p>${posTag(p)} ${p.team ? `<img class="fx-tlogo" src="${esc(teamLogo(SPORT, p.team))}" alt=""> ${esc(p.team)}` : 'Free agent'} ${p.injury ? `<em class="inj">${esc(p.injury)}</em>` : ''}</p>
      ${L ? `<p class="ar-muted small">${owner ? `On <b>${esc(owner.name)}</b>` : 'Available in your league'}</p>` : ''}</div></header>
    <div class="fx-pstats"><div><small>ADP</small><b>${p.adp != null ? fmt(p.adp, 1) : '—'}</b></div><div><small>${SPORT === 'nfl' ? 'Season proj' : 'Proj / game'}</small><b>${p.proj != null ? fmt(p.proj, 1) : '—'}</b></div><div><small>Season pts</small><b id="psum">…</b></div><div><small>Avg</small><b id="pavg">…</b></div></div>
    <div id="pact" class="fx-row"></div>
    <h3 class="fx-h3">Game log</h3><div id="plog">${loading()}</div></div>`, { wide: true });
  if (L?.mine && L.league.status === 'in_season') {
    const act = $('#pact', m.el);
    if (!owner) {
      const onW = L.waivers.find((w) => w.player_id === id && new Date(w.until) > new Date());
      act.innerHTML = `<button class="ar-btn">${onW ? 'Claim off waivers' : 'Add to my team'}</button>`;
      act.firstChild.onclick = () => { m.close(); addPlayer(id); };
    } else if (owner.id !== L.mine.id) {
      act.innerHTML = '<button class="ar-btn ghost">Propose a trade</button>';
      act.firstChild.onclick = () => { m.close(); tradeBuilder(owner.id, [id]); };
    }
  }
  try {
    const log = await data.playerLog(SPORT, G.state.season, id);
    const weeks = Object.keys(log || {}).map(Number).sort((a, b) => b - a);
    let total = 0, games = 0;
    const rows = [];
    for (const w of weeks) {
      const lines = data.weekLines(log[w]);
      for (const g of lines) {
        const pts = playerPoints(SPORT, scoring, g.stats);
        if (!g.stats.gp && !pts) continue;
        total += pts; games++;
        rows.push(`<tr><td>Wk ${w}</td><td>${esc(g.date ? new Date(`${g.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')}</td><td>${statLine(g.stats)}</td><td class="fx-num"><b>${fmt(pts, 1)}</b></td></tr>`);
      }
    }
    $('#psum', m.el).textContent = fmt(total, 1);
    $('#pavg', m.el).textContent = games ? fmt(total / games, 1) : '—';
    $('#plog', m.el).innerHTML = rows.length ? `<div class="fx-scroll"><table class="ar-table"><thead><tr><th>Week</th><th>Date</th><th>Stats</th><th class="fx-num">Pts</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<p class="ar-muted">No games played yet this season.</p>';
  } catch (e) { $('#plog', m.el).innerHTML = `<p class="ar-muted">${esc(e.message)}</p>`; }
}

function statLine(s) {
  const n = (k) => Math.round(s[k] || 0);
  const parts = [];
  if (SPORT === 'nfl') {
    if (s.pass_att) parts.push(`${n('pass_cmp')}/${n('pass_att')}, ${n('pass_yd')} yd, ${n('pass_td')} TD${s.pass_int ? `, ${n('pass_int')} INT` : ''}`);
    if (s.rush_att) parts.push(`${n('rush_att')} car, ${n('rush_yd')} yd${s.rush_td ? `, ${n('rush_td')} TD` : ''}`);
    if (s.rec_tgt || s.rec) parts.push(`${n('rec')}/${n('rec_tgt')} rec, ${n('rec_yd')} yd${s.rec_td ? `, ${n('rec_td')} TD` : ''}`);
    if (s.fgm || s.xpm) parts.push(`${n('fgm')}/${n('fga')} FG, ${n('xpm')} XP`);
    if (s.def_td != null || s.sack != null || s.pts_allow != null) parts.push(`${n('sack')} sk, ${n('int')} INT, ${n('pts_allow')} pts allowed`);
  } else {
    parts.push(`${n('pts')} pts, ${n('reb')} reb, ${n('ast')} ast`);
    if (s.stl || s.blk) parts.push(`${n('stl')} stl, ${n('blk')} blk`);
    if (s.tpm) parts.push(`${n('tpm')} 3pm`);
  }
  return esc(parts.join(' · ') || '—');
}

/* ───────────── league ───────────── */
async function leagueView(id, tab) {
  if (!(await user())) {
    main.innerHTML = '<div class="fx-empty"><b>Sign in to see this league.</b><button class="ar-btn" id="si">Sign in</button></div>';
    $('#si').onclick = openSignIn;
    return;
  }
  main.innerHTML = loading('Loading league…');
  const L = await api.loadLeague(id);
  if (!L) { main.innerHTML = '<div class="fx-empty"><b>League not found.</b><p class="ar-muted">You might not be a member. Ask for an invite link.</p><a class="ar-btn ghost" href="#/">Back</a></div>'; return; }
  if (L.league.sport !== SPORT) { location.href = `../${SPORTS[L.league.sport].slug}/#/l/${id}`; return; }
  G.league = L;
  const status = L.league.status;
  const tabs = status === 'pre_draft' ? ['lobby', 'chat', 'settings']
    : status === 'drafting' ? ['draft', 'lobby', 'chat', 'settings']
      : ['matchup', 'team', 'players', 'league', 'trades', 'activity', 'draft', 'chat', 'settings'];
  if (!tabs.includes(tab)) tab = tabs[0];
  if (status === 'drafting' && !tab) tab = 'draft';
  const names = { lobby: 'Lobby', draft: status === 'drafting' ? 'Draft room' : 'Draft', chat: 'Chat', settings: 'Settings', matchup: 'Matchup', team: 'My team', players: 'Players', league: 'Standings', trades: 'Trades', activity: 'Activity' };
  const pendingForMe = L.trades.filter((t) => t.status === 'proposed' && t.to_team === L.mine?.id).length;
  main.innerHTML = `
    <header class="fx-lhead">
      <a class="fx-back" href="#/">← Leagues</a>
      <div class="fx-ltitle">${teamBadge(L.mine, 40)}<div><h1 class="ar-display">${esc(L.league.name)}</h1>
        <p class="ar-muted small">${sp.league} · ${esc(scoringLabel(L.league.settings.scoring))} · ${L.league.settings.teams} teams${status === 'in_season' ? ` · Week ${leagueWeek(L)}` : ''}${status === 'drafting' ? ' · <span class="ar-chip live">Draft live</span>' : ''}</p></div></div>
      <nav class="ar-tabs fx-ltabs">${tabs.map((t) => `<a href="#/l/${id}/${t}" class="${t === tab ? 'on' : ''}">${names[t]}${t === 'trades' && pendingForMe ? ` <i class="fx-dot">${pendingForMe}</i>` : ''}</a>`).join('')}</nav>
    </header>
    <div id="tab" class="fx-tab"></div>`;
  const body = $('#tab');
  const views = { lobby: lobbyTab, draft: draftTab, chat: chatTab, settings: settingsTab, matchup: matchupTab, team: teamTab, players: playersTab, league: standingsTab, trades: tradesTab, activity: activityTab };
  let current = views[tab];
  let redraw = null;
  const render = async () => { try { redraw = await current(body, L); } catch (e) { console.error(e); body.innerHTML = errBox(e); } };
  await render();

  // Live updates: reload the league and redraw (never while someone is typing).
  let t;
  const unsub = api.subscribe(id, (table, payload) => {
    if (table === 'fantasy_chat') { G.onChat?.(payload.new); return; }
    clearTimeout(t);
    t = setTimeout(async () => {
      const fresh = await api.loadLeague(id).catch(() => null);
      if (!fresh) return;
      if (fresh.league.status !== L.league.status) { route(); return; }
      Object.assign(L, fresh);
      if (typeof redraw === 'function') redraw();
      else if (!body.contains(document.activeElement) || !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) render();
    }, 350);
  });
  G.cleanup.push(unsub, () => { G.league = null; G.onChat = null; });
  if (status === 'in_season') api.rpc('fantasy_tick', { p_league: id }).catch(() => {});
}

const lastWeek = (L) => Math.max(L.league.start_week || 1, ...L.matchups.map((m) => m.week));
function leagueWeek(L) { return Math.min(Math.max(G.state.week, L.league.start_week || 1), lastWeek(L)); }
const teamById = (L, id) => L.teams.find((t) => t.id === id);
const isCommish = (L) => L.league.commissioner === L.uid;

/* lobby */
async function lobbyTab(el, L) {
  const draw = () => {
    const s = L.league.settings;
    const link = `${location.origin}${location.pathname}#/join/${L.league.invite_code}`;
    const order = L.league.draft?.order;
    const pre = L.league.status === 'pre_draft';
    el.innerHTML = `<div class="fx-cols">
      <section class="ar-card fx-card">
        <h2 class="fx-h2">Invite friends</h2>
        <p class="ar-muted">Send this link. Anyone with it can join until the league is full or the draft starts.</p>
        <div class="fx-invite"><code>${esc(L.league.invite_code)}</code><input class="ar-input" readonly value="${esc(link)}" aria-label="Invite link"><button class="ar-btn" id="copy">Copy link</button>${navigator.share ? '<button class="ar-btn ghost" id="share">Share</button>' : ''}</div>
        <h2 class="fx-h2">Teams <span class="ar-muted">${L.teams.length} / ${s.teams}</span></h2>
        <ul class="fx-teams">${L.teams.map((t) => `<li>${teamBadge(t, 32)}<span><b>${esc(t.name)}</b><small class="ar-muted">${t.is_bot ? 'Bot' : t.owner === L.league.commissioner ? 'Commissioner' : 'Manager'}${t.id === L.mine?.id ? ' · You' : ''}</small></span>
          ${pre && isCommish(L) && t.owner !== L.league.commissioner ? `<button class="ar-btn sm ghost" data-rm="${t.id}">Remove</button>` : ''}</li>`).join('')}
          ${Array.from({ length: Math.max(0, s.teams - L.teams.length) }, () => '<li class="fx-open"><span class="fx-badge empty"></span><span class="ar-muted">Open spot</span></li>').join('')}</ul>
        ${pre && isCommish(L) ? `<div class="fx-row">${L.teams.length < s.teams ? '<button class="ar-btn ghost" id="bots">Fill open spots with bots</button>' : ''}<button class="ar-btn ghost" id="order">${order ? 'Re-roll' : 'Set'} draft order</button><button class="ar-btn" id="start">Start draft</button></div>` : ''}
        ${pre && !isCommish(L) ? '<p class="ar-muted small">The commissioner starts the draft. You’ll get pulled into the draft room when it begins.</p><button class="ar-btn sm ghost" id="leave">Leave league</button>' : ''}
        ${L.league.status === 'drafting' ? `<a class="ar-btn" href="#/l/${L.league.id}/draft">Go to the draft room</a>` : ''}
      </section>
      <section class="ar-card fx-card">
        <h2 class="fx-h2">Draft order</h2>
        ${order ? `<ol class="fx-order">${order.map((id) => `<li>${teamBadge(teamById(L, id), 24)} ${esc(teamById(L, id)?.name || '?')}</li>`).join('')}</ol>` : '<p class="ar-muted">Random, set when the draft starts (or by the commissioner now).</p>'}
        <h2 class="fx-h2">Rules</h2>${rulesList(s)}
      </section></div>`;
    $('#copy', el)?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); toast('Invite link copied'); } catch { $('input[readonly]', el).select(); } });
    $('#share', el)?.addEventListener('click', () => navigator.share({ title: L.league.name, text: `Join my ${sp.name} league on Kinetix`, url: link }).catch(() => {}));
    el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Remove this team?', 'They can rejoin with the invite link.', 'Remove', true))) return;
      act(b, () => api.rpc('fantasy_remove_team', { p_team: b.dataset.rm }));
    }));
    $('#bots', el)?.addEventListener('click', (e) => act(e.target, () => api.rpc('fantasy_fill_bots', { p_league: L.league.id })));
    $('#order', el)?.addEventListener('click', (e) => {
      const ids = L.teams.map((t) => t.id).sort(() => Math.random() - 0.5);
      act(e.target, () => api.rpc('fantasy_update_league', { p_league: L.league.id, p_name: null, p_settings: null, p_order: ids }));
    });
    $('#start', el)?.addEventListener('click', async (e) => {
      if (!(await confirmBox('Start the draft now?', `Everyone gets ${s.pick_seconds >= 3600 ? `${s.pick_seconds / 3600} hours` : `${s.pick_seconds} seconds`} per pick. Bots pick instantly. Settings lock once it starts.`, 'Start draft'))) return;
      act(e.target, () => api.rpc('fantasy_start_draft', { p_league: L.league.id }));
    });
    $('#leave', el)?.addEventListener('click', async (e) => {
      if (!(await confirmBox('Leave this league?', 'You can rejoin with the invite link before the draft.', 'Leave', true))) return;
      act(e.target, () => api.rpc('fantasy_leave', { p_league: L.league.id })).then(() => { location.hash = '#/'; });
    });
  };
  draw();
  return draw;
}

async function act(btn, fn) {
  busy(btn, true);
  try { const r = await fn(); return r; } catch (e) { toast(e.message); throw e; } finally { busy(btn, false); }
}

function rulesList(s) {
  const slots = s.slots.map((x) => slotName(sp, x)).join(', ');
  return `<dl class="fx-dl">
    <dt>Scoring</dt><dd>${esc(scoringLabel(s.scoring))}</dd>
    <dt>Lineup</dt><dd>${esc(slots)} + ${s.bench} bench</dd>
    <dt>Pick timer</dt><dd>${s.pick_seconds >= 3600 ? `${s.pick_seconds / 3600} h` : `${s.pick_seconds} s`}</dd>
    <dt>Waivers</dt><dd>${s.waiver === 'faab' ? `FAAB ($${s.faab_budget})` : 'Rolling priority'} · dropped players wait 1 day</dd>
    <dt>Trades</dt><dd>${{ commish: 'Commissioner approves', league: 'League can veto within 24h', none: 'Go through instantly' }[s.trade_review]}${s.trade_deadline ? ` · deadline after week ${s.trade_deadline}` : ''}</dd>
    <dt>Playoffs</dt><dd>${s.playoff_teams ? `${s.playoff_teams} teams from week ${s.playoff_start}` : 'None'}</dd>
    <dt>Lineup lock</dt><dd>Each player locks on their game day</dd></dl>`;
}

/* draft */
async function draftTab(el, L) {
  const lg = L.league;
  if (lg.status !== 'drafting') {
    el.innerHTML = '<div id="room"></div>';
    const room = new DraftRoom($('#room', el), { sport: SPORT, settings: lg.settings, teams: L.teams, pool: G.pool, myTeamId: L.mine?.id, offset: G.offset, actions: {} });
    room.onPlayer = openPlayer;
    room.view.side = 'board'; room.view.mobile = 'board'; room.syncTabs();
    room.update({ order: lg.draft.order || [], pick: (lg.draft.order || []).length * rosterSize(lg.settings) + 1, picks: L.picks, queue: [] });
    G.cleanup.push(() => room.destroy());
    return null;
  }
  el.innerHTML = '<div id="room"></div>';
  const chat = await api.chatHistory(lg.id).catch(() => []);
  const who = (m) => { const t = L.teams.find((x) => x.owner === m.user_id); return { who: t?.name || 'Someone', color: t?.color }; };
  const room = new DraftRoom($('#room', el), {
    sport: SPORT, settings: lg.settings, teams: L.teams, pool: G.pool, myTeamId: L.mine?.id, offset: G.offset, isCommish: isCommish(L), live: true,
    actions: {
      pick: (pid) => api.rpc('fantasy_draft_pick', { p_league: lg.id, p_player: pid }),
      setQueue: (q) => api.saveQueue(L.mine.id, q, L.queue.autodraft).then(() => { L.queue.players = q; }),
      setAutodraft: (on) => api.saveQueue(L.mine.id, room.state.queue, on).then(() => { L.queue.autodraft = on; push(); }),
      tick: () => api.rpc('fantasy_draft_tick', { p_league: lg.id }),
      pause: (b) => api.rpc('fantasy_draft_pause', { p_league: lg.id, p_paused: b }),
      undo: () => api.rpc('fantasy_draft_undo', { p_league: lg.id }),
      sendChat: (body) => api.sendChat(lg.id, body),
    },
  });
  room.onPlayer = openPlayer;
  const msgs = chat.map((m) => ({ ...who(m), body: m.body }));
  const push = () => {
    const d = L.league.draft;
    room.update({ order: d.order, pick: d.pick, deadline: d.deadline, paused: !!d.paused, picks: L.picks, queue: L.queue?.players || [], autodraft: !!L.queue?.autodraft, chat: msgs });
  };
  G.onChat = (m) => { if (m) { msgs.push({ ...who(m), body: m.body }); push(); } };
  push();
  G.cleanup.push(() => room.destroy());
  return push;
}

/* chat */
async function chatTab(el, L) {
  const msgs = await api.chatHistory(L.league.id);
  el.innerHTML = `<section class="ar-card fx-card fx-chatcard"><div class="fx-chat" id="chat"></div>
    <form class="fx-row" id="cf"><input class="ar-input" maxlength="500" placeholder="Message the league" aria-label="Message"><button class="ar-btn">Send</button></form></section>`;
  const box = $('#chat', el);
  const line = (m) => { const t = L.teams.find((x) => x.owner === m.user_id); return `<div class="fx-msg${m.user_id === L.uid ? ' me' : ''}">${teamBadge(t, 28)}<div><b>${esc(t?.name || 'Someone')}</b> <small class="ar-muted">${timeAgo(m.created_at)}</small><p>${esc(m.body)}</p></div></div>`; };
  box.innerHTML = msgs.map(line).join('') || '<p class="ar-muted">No messages yet. Start the trash talk.</p>';
  box.scrollTop = box.scrollHeight;
  G.onChat = (m) => { if (!m) return; if (!box.querySelector('.fx-msg')) box.innerHTML = ''; box.insertAdjacentHTML('beforeend', line(m)); box.scrollTop = box.scrollHeight; };
  $('#cf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = e.target.querySelector('input');
    const v = inp.value.trim();
    if (!v) return;
    inp.value = '';
    try { await api.sendChat(L.league.id, v); } catch (err) { toast(err.message); }
  });
  return () => {};
}

/* settings */
async function settingsTab(el, L) {
  const lg = L.league;
  const commish = isCommish(L);
  const pre = lg.status === 'pre_draft';
  const palette = ['#d4ff3f', '#3ef0c8', '#7b5cff', '#ff3d8b', '#22c55e', '#f97316', '#3b82f6', '#ef4444', '#eab308', '#14b8a6', '#a855f7', '#ec4899'];
  el.innerHTML = `<div class="fx-cols">
    ${L.mine ? `<section class="ar-card fx-card"><h2 class="fx-h2">Your team</h2>
      <form id="tf" class="fx-form"><label class="ar-field">Team name<input class="ar-input" name="name" minlength="2" maxlength="30" value="${esc(L.mine.name)}"></label>
      <div class="fx-swatches">${palette.map((c) => `<label><input type="radio" name="color" value="${c}"${c === L.mine.color ? ' checked' : ''}><span style="--c:${c}"></span></label>`).join('')}</div>
      <div class="fx-row end"><button class="ar-btn">Save</button></div></form></section>` : ''}
    <section class="ar-card fx-card"><h2 class="fx-h2">League rules</h2>
      ${commish && (pre || lg.status === 'in_season') ? `<form id="lf" class="fx-form">${settingsForm(lg.settings, { name: lg.name, team: null, full: pre })}<div class="fx-row end"><button class="ar-btn">Save settings</button></div></form>` : rulesList(lg.settings)}
    </section>
    ${commish && lg.status === 'in_season' ? `<section class="ar-card fx-card"><h2 class="fx-h2">Commissioner roster move</h2>
      <p class="ar-muted small">Add or drop for any team. Skips waivers. Everyone sees it in Activity.</p>
      <form id="cm" class="fx-form"><label class="ar-field">Team<select class="ar-select" name="team">${L.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
      <label class="ar-field">Add player (search)<input class="ar-input" name="add" list="fxAll" placeholder="Name"></label>
      <label class="ar-field">Drop player<select class="ar-select" name="drop"><option value="">Nobody</option></select></label>
      <datalist id="fxAll">${[...G.pool.values()].filter((p) => p.adp != null).sort((a, b) => a.adp - b.adp).slice(0, 600).map((p) => `<option value="${esc(p.name)} · ${esc(p.pos)} ${esc(p.team || '')}">`).join('')}</datalist>
      <div class="fx-row end"><button class="ar-btn">Apply</button></div></form></section>` : ''}
    ${commish ? `<section class="ar-card fx-card danger"><h2 class="fx-h2">Danger zone</h2><p class="ar-muted small">Deleting removes every team, pick and message. It can’t be undone.</p><button class="ar-btn danger" id="del">Delete league</button></section>` : ''}
  </div>`;
  $('#tf', el)?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    act(e.target.querySelector('button'), () => api.rpc('fantasy_update_team', { p_team: L.mine.id, p_name: f.get('name'), p_color: f.get('color') })).then(() => toast('Saved'));
  });
  const lf = $('#lf', el);
  if (lf) {
    const read = wireSettingsForm(lf, lg.settings);
    lf.addEventListener('submit', (e) => {
      e.preventDefault();
      act(lf.querySelector('.fx-row button'), () => api.rpc('fantasy_update_league', { p_league: lg.id, p_name: lf.name?.value ?? null, p_settings: read(), p_order: null })).then(() => toast('Settings saved'));
    });
  }
  const cm = $('#cm', el);
  if (cm) {
    const fillDrop = () => { const t = teamById(L, cm.team.value); cm.drop.innerHTML = '<option value="">Nobody</option>' + t.roster.map((id) => `<option value="${esc(id)}">${esc(pl(id).name)} (${esc(pl(id).pos)})</option>`).join(''); };
    cm.team.addEventListener('change', fillDrop); fillDrop();
    cm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = cm.add.value.split(' · ')[0].trim().toLowerCase();
      const add = name ? [...G.pool.values()].find((p) => p.name.toLowerCase() === name)?.id : null;
      if (name && !add) { toast('Pick a player from the list'); return; }
      act(cm.querySelector('.fx-row button'), () => api.rpc('fantasy_commish_move', { p_team: cm.team.value, p_add: add, p_drop: cm.drop.value || null })).then(() => toast('Done'));
    });
  }
  $('#del', el)?.addEventListener('click', async (e) => {
    if (!(await confirmBox(`Delete ${lg.name}?`, 'Every team, pick, trade and message in this league is permanently deleted.', 'Delete forever', true))) return;
    act(e.target, () => api.rpc('fantasy_delete_league', { p_league: lg.id })).then(() => { location.hash = '#/'; });
  });
  return null;
}

/* ───────────── in-season ───────────── */
// Points per player for a week: live/final stats, or the projection if the game hasn't happened.
async function weekContext(L, week) {
  const season = G.state.season;
  const [lineups, games, stats, proj] = await Promise.all([
    api.rpc('fantasy_lineups_for', { p_league: L.league.id, p_week: week }),
    data.weekGames(SPORT, season, week).catch(() => ({})),
    week <= G.state.week ? data.weekStats(SPORT, season, week).catch(() => ({})) : Promise.resolve({}),
    data.weekProj(SPORT, season, week).catch(() => ({})),
  ]);
  const scoring = L.league.settings.scoring;
  const gamesOf = (p) => games[p.team] || [];
  const projOf = (id) => {
    const p = pl(id); const s = proj[id];
    if (!s) return null;
    const per = playerPoints(SPORT, scoring === 'cats' ? 'points' : scoring, s);
    return SPORT === 'nba' ? per * gamesOf(p).length : per;
  };
  const ptsOf = (id) => (stats[id] ? playerPoints(SPORT, scoring === 'cats' ? 'points' : scoring, stats[id]) : week <= G.state.week ? 0 : null);
  const locked = (id) => {
    if (week !== G.state.week) return week < G.state.week;
    const lk = G.state.locks?.[pl(id).team];
    return !!lk && new Date(lk).getTime() <= Date.now() + G.offset;
  };
  return { lineups: lineups || {}, games, stats, proj, gamesOf, projOf, ptsOf, locked, week };
}

function gameLabel(ctx, p) {
  const g = ctx.gamesOf(p);
  if (!p.team) return 'Free agent';
  if (!g.length) return SPORT === 'nfl' ? 'BYE' : 'No games';
  if (SPORT === 'nba') return `${g.length} game${g.length > 1 ? 's' : ''}`;
  const x = g[0];
  const d = x.date ? new Date(`${x.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }) : '';
  return `${x.home ? 'vs' : '@'} ${x.opp} · ${d}`;
}

function weekPicker(L, week, min = L.league.start_week) {
  const max = lastWeek(L);
  const opts = [];
  for (let w = min; w <= max; w++) {
    const po = L.matchups.find((m) => m.week === w && m.playoff_round);
    opts.push(`<option value="${w}"${w === week ? ' selected' : ''}>Week ${w}${w === G.state.week ? ' (now)' : ''}${po ? ' · Playoffs' : ''}</option>`);
  }
  return `<select class="ar-select fx-week" aria-label="Week">${opts.join('')}</select>`;
}

async function matchupTab(el, L) {
  let week = leagueWeek(L);
  let focus = null;
  const scoring = L.league.settings.scoring;
  const cats = scoring === 'cats';
  const draw = async () => {
    el.innerHTML = loading();
    const ctx = await weekContext(L, week);
    const ms = L.matchups.filter((m) => m.week === week);
    const live = week === G.state.week;
    const score = (m, side) => {
      const tid = m[side];
      if (!tid) return null;
      if (m.final || !live) return m[`${side}_score`] != null ? Number(m[`${side}_score`]) : null;
      return null;
    };
    const liveTotals = (tid) => (ctx.lineups[tid] || []).reduce((s, id) => s + (id ? ctx.ptsOf(id) || 0 : 0), 0);
    const projTotals = (tid) => (ctx.lineups[tid] || []).reduce((s, id) => s + (id ? (ctx.stats[id] ? ctx.ptsOf(id) : ctx.projOf(id)) || 0 : 0), 0);
    const catsOf = (tid) => teamCats(ctx.lineups[tid] || [], ctx.stats);
    const show = (m) => {
      if (cats) {
        if (!m.away) return ['—', '—'];
        const c = compareCats(catsOf(m.home), catsOf(m.away));
        return m.final ? [m.home_score, m.away_score] : [c.a, c.b];
      }
      const h = score(m, 'home') ?? (week <= G.state.week ? liveTotals(m.home) : null);
      const a = m.away ? (score(m, 'away') ?? (week <= G.state.week ? liveTotals(m.away) : null)) : null;
      return [h, a];
    };
    focus = focus && ms.find((m) => m.id === focus.id) ? ms.find((m) => m.id === focus.id) : ms.find((m) => m.home === L.mine?.id || m.away === L.mine?.id) || ms[0];
    const board = ms.map((m) => {
      const [h, a] = show(m);
      const H = teamById(L, m.home), A = teamById(L, m.away);
      const f = (n) => (n == null ? '—' : cats ? n : fmt(n, 1));
      return `<button type="button" class="fx-sb${m.id === focus?.id ? ' on' : ''}" data-m="${m.id}">
        ${m.playoff_round ? `<span class="fx-po">${playoffName(L, m.playoff_round)}</span>` : ''}
        <span class="fx-sbr${m.final && m.winner === m.home ? ' win' : ''}">${teamBadge(H, 22)}<b>${esc(H?.name)}</b><span>${f(h)}</span></span>
        <span class="fx-sbr${m.final && m.winner === m.away ? ' win' : ''}">${A ? `${teamBadge(A, 22)}<b>${esc(A.name)}</b><span>${f(a)}</span>` : '<span class="ar-muted">Bye week</span>'}</span>
      </button>`;
    }).join('');
    let detail = '';
    if (focus) {
      const H = teamById(L, focus.home), A = teamById(L, focus.away);
      const [h, a] = show(focus);
      const state = focus.final ? 'Final' : live ? '<span class="ar-chip live">Live</span>' : week > G.state.week ? 'Upcoming' : 'Awaiting final scores';
      const slots = L.league.settings.slots;
      const side = (tid) => ctx.lineups[tid] || [];
      const cell = (id) => {
        if (!id) return '<span class="ar-muted">Empty</span>';
        const p = pl(id);
        const pts = ctx.stats[id] ? ctx.ptsOf(id) : null;
        const pj = ctx.projOf(id);
        return `${playerCell(p, ` · ${esc(gameLabel(ctx, p))}`)}<span class="fx-pts">${pts != null ? `<b>${fmt(pts, 1)}</b>` : `<small class="ar-muted">${pj != null ? `proj ${fmt(pj, 1)}` : ''}</small>`}</span>`;
      };
      const catTable = cats && A ? (() => {
        const hc = catsOf(H.id), ac = catsOf(A.id), c = compareCats(hc, ac);
        const v = (t, k) => (k.endsWith('pct') ? pct(t[k]) : Math.round(t[k]));
        return `<table class="ar-table fx-cats"><thead><tr><th>${esc(H.name)}</th><th></th><th>${esc(A.name)}</th></tr></thead><tbody>${CATS.map((k) => `<tr><td class="${c.won[k.key] === 'a' ? 'win' : ''}">${v(hc, k.key)}</td><th>${k.label}</th><td class="${c.won[k.key] === 'b' ? 'win' : ''}">${v(ac, k.key)}</td></tr>`).join('')}</tbody></table>`;
      })() : '';
      detail = `<section class="ar-card fx-card fx-mu">
        <div class="fx-muhead">
          <div class="fx-muteam">${teamBadge(H, 48)}<b>${esc(H?.name)}</b><span class="fx-big">${h == null ? '—' : cats ? h : fmt(h, 1)}</span>${!cats && !focus.final && week >= G.state.week ? `<small class="ar-muted">proj ${fmt(projTotals(focus.home), 1)}</small>` : ''}</div>
          <div class="fx-muvs">${state}</div>
          <div class="fx-muteam">${A ? `${teamBadge(A, 48)}<b>${esc(A.name)}</b><span class="fx-big">${a == null ? '—' : cats ? a : fmt(a, 1)}</span>${!cats && !focus.final && week >= G.state.week ? `<small class="ar-muted">proj ${fmt(projTotals(focus.away), 1)}</small>` : ''}` : '<b class="ar-muted">Bye</b>'}</div>
        </div>
        ${catTable}
        <div class="fx-mugrid">${slots.map((s, i) => `<div class="fx-murow"><div>${cell(side(focus.home)[i])}</div><span class="slot">${esc(slotName(sp, s))}</span><div>${A ? cell(side(focus.away)[i]) : ''}</div></div>`).join('')}</div>
      </section>`;
    }
    const champ = L.league.playoffs?.champion && teamById(L, L.league.playoffs.champion);
    el.innerHTML = `${champ ? `<div class="fx-champ">🏆 <b>${esc(champ.name)}</b> won the ${esc(L.league.season)} title!</div>` : ''}
      <div class="fx-bar">${weekPicker(L, week)}<span class="ar-muted small">${live ? 'Scores update as games are played.' : ''}</span></div>
      <div class="fx-mulayout"><div class="fx-board">${board || '<p class="ar-muted">No matchups this week.</p>'}</div>${detail}</div>`;
    $('.fx-week', el).addEventListener('change', (e) => { week = +e.target.value; focus = null; draw(); });
    el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { focus = ms.find((m) => m.id === b.dataset.m); draw(); }));
  };
  await draw();
  if (week === G.state.week) {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') draw(); }, 90e3);
    G.cleanup.push(() => clearInterval(iv));
  }
  return draw;
}

function playoffName(L, r) {
  const rounds = { 2: 1, 4: 2, 6: 3, 8: 3 }[L.league.settings.playoff_teams] || 1;
  return r === rounds ? 'Championship' : r === rounds - 1 ? 'Semifinal' : 'Quarterfinal';
}

async function teamTab(el, L) {
  let tid = L.mine?.id || L.teams[0].id;
  let week = Math.max(leagueWeek(L), G.state.week);
  if (week > lastWeek(L)) week = lastWeek(L);
  let moving = null;
  const draw = async () => {
    const team = teamById(L, tid);
    const own = team.id === L.mine?.id;
    el.innerHTML = loading();
    const ctx = await weekContext(L, week);
    const slots = L.league.settings.slots;
    const starters = [...(ctx.lineups[tid] || Array(slots.length).fill(null))];
    while (starters.length < slots.length) starters.push(null);
    const bench = team.roster.filter((id) => !starters.includes(id));
    const editable = own && L.league.status === 'in_season' && week >= G.state.week;
    const canMove = (id) => editable && !ctx.locked(id);
    const rec = standings(L).find((r) => r.t.id === tid);
    const targets = new Set();
    if (moving) {
      const mp = moving.id && pl(moving.id);
      slots.forEach((s, j) => {
        if (moving.slot === j) return;
        const occ = starters[j];
        if (occ && !canMove(occ)) return;
        if (mp && !slotOk(s, mp.positions)) return;
        if (!mp && !occ) return;
        targets.add(`s${j}`);
      });
      if (moving.slot != null && moving.id) targets.add('bench');
    }
    const row = (id, label, key) => {
      const p = id ? pl(id) : null;
      const pts = id && ctx.stats[id] ? ctx.ptsOf(id) : null;
      const pj = id ? ctx.projOf(id) : null;
      const lk = id && ctx.locked(id);
      const isSrc = moving && ((key === `s${moving.slot}`) || (moving.slot == null && moving.id === id));
      return `<div class="fx-trow${isSrc ? ' src' : ''}${targets.has(key) ? ' tgt' : ''}">
        <span class="slot">${esc(label)}</span>
        <div class="fx-tp">${p ? playerCell(p, ` · ${esc(gameLabel(ctx, p))}`) : '<span class="ar-muted">Empty</span>'}</div>
        <span class="fx-num">${pj != null ? fmt(pj, 1) : ''}</span>
        <span class="fx-num"><b>${pts != null ? fmt(pts, 1) : ''}</b></span>
        <span class="fx-tact">${lk ? '<span class="fx-lock" title="Game started: locked">🔒</span>' : ''}
          ${targets.has(key) ? `<button class="ar-btn sm" data-here="${key}">Here</button>`
    : editable && id && canMove(id) ? `<button class="ar-btn sm ghost" data-mv="${key}" data-id="${esc(id)}">${isSrc ? 'Cancel' : 'Move'}</button>` : ''}</span>
      </div>`;
    };
    el.innerHTML = `<div class="fx-bar">
        ${own ? '' : ''}<select class="ar-select fx-teamsel" aria-label="Team">${L.teams.map((t) => `<option value="${t.id}"${t.id === tid ? ' selected' : ''}>${esc(t.name)}${t.id === L.mine?.id ? ' (you)' : ''}</option>`).join('')}</select>
        ${weekPicker(L, week)}
        ${editable ? '<button class="ar-btn sm ghost" id="auto">Auto-set best lineup</button>' : ''}
      </div>
      <section class="ar-card fx-card">
        <div class="fx-thead">${teamBadge(team, 52)}<div><h2 class="ar-display">${esc(team.name)}</h2><p class="ar-muted small">${rec ? `${rec.w}-${rec.l}${rec.tie ? `-${rec.tie}` : ''} · ${fmt(rec.pf, cats(L) ? 0 : 1)} ${cats(L) ? 'cats won' : 'PF'}` : ''}${own ? ` · Waiver #${team.waiver_priority ?? '—'}${L.league.settings.waiver === 'faab' ? ` · $${team.faab} FAAB` : ''}` : ''}</p></div></div>
        ${moving ? `<p class="fx-hint">Pick where ${esc(pl(moving.id).name)} should go.</p>` : ''}
        <div class="fx-trow head"><span>Slot</span><span>Player</span><span class="fx-num">Proj</span><span class="fx-num">Pts</span><span></span></div>
        ${slots.map((s, i) => row(starters[i], slotName(sp, s), `s${i}`)).join('')}
        <div class="fx-benchhead${targets.has('bench') ? ' tgt' : ''}"><span>Bench</span>${targets.has('bench') ? '<button class="ar-btn sm" data-here="bench">Move to bench</button>' : ''}</div>
        ${bench.map((id) => row(id, 'BN', `b${id}`)).join('') || '<p class="ar-muted small">Nobody on the bench.</p>'}
        ${own && L.league.status === 'in_season' ? `<p class="ar-muted small fx-rsize">${team.roster.length} / ${rosterSize(L.league.settings)} roster spots · <a href="#/l/${L.league.id}/players">Find free agents</a></p>` : ''}
        ${own && L.league.status === 'in_season' ? `<details class="fx-drops"><summary>Drop a player</summary>${team.roster.map((id) => `<div class="fx-droprow">${playerCell(pl(id))}<button class="ar-btn sm danger" data-drop="${esc(id)}">Drop</button></div>`).join('')}</details>` : ''}
      </section>`;
    $('.fx-teamsel', el).addEventListener('change', (e) => { tid = e.target.value; moving = null; draw(); });
    $('.fx-week', el).addEventListener('change', (e) => { week = +e.target.value; moving = null; draw(); });
    el.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.mv;
      if (moving && ((key === `s${moving.slot}`) || moving.id === b.dataset.id)) moving = null;
      else moving = { id: b.dataset.id, slot: key.startsWith('s') ? +key.slice(1) : null };
      draw();
    }));
    const save = async (next) => {
      try { await api.rpc('fantasy_set_lineup', { p_team: tid, p_week: week, p_starters: next }); moving = null; toast('Lineup saved'); draw(); } catch (e) { toast(e.message); }
    };
    el.querySelectorAll('[data-here]').forEach((b) => b.addEventListener('click', () => {
      const next = [...starters];
      const k = b.dataset.here;
      if (k === 'bench') next[moving.slot] = null;
      else {
        const j = +k.slice(1);
        const occ = next[j];
        next[j] = moving.id;
        // The player who was there swaps into the old spot if they fit; otherwise they go to the bench.
        if (moving.slot != null) next[moving.slot] = occ && slotOk(slots[moving.slot], pl(occ).positions) ? occ : null;
      }
      save(next);
    }));
    $('#auto', el)?.addEventListener('click', () => {
      const keep = starters.map((id) => (id && ctx.locked(id) ? id : null));
      const free = team.roster.filter((id) => !keep.includes(id) && !ctx.locked(id));
      const score = (p) => { const v = ctx.projOf(p.id); return (v ?? -1) - (p.injury === 'Out' || p.injury === 'IR' ? 1000 : 0); };
      const openSlots = slots.map((s, i) => (keep[i] ? null : s));
      const fill = fillSlots(openSlots.map((s) => s || '__'), free, G.pool, score);
      save(keep.map((id, i) => id || fill.starters[i]));
    });
    el.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', async () => {
      const p = pl(b.dataset.drop);
      if (!(await confirmBox(`Drop ${p.name}?`, 'They go on waivers for a day, then anyone can add them.', 'Drop', true))) return;
      act(b, () => api.rpc('fantasy_add_drop', { p_team: tid, p_add: null, p_drop: p.id })).then(() => toast(`${p.name} dropped`));
    }));
  };
  await draw();
  return () => { if (!moving) draw(); };
}
const cats = (L) => L.league.settings.scoring === 'cats';

function standings(L) {
  const rows = new Map(L.teams.map((t) => [t.id, { t, w: 0, l: 0, tie: 0, pf: 0, pa: 0, res: [] }]));
  for (const m of L.matchups) {
    if (!m.final || m.playoff_round || !m.away) continue;
    const h = rows.get(m.home), a = rows.get(m.away);
    if (!h || !a) continue;
    h.pf += +m.home_score; h.pa += +m.away_score; a.pf += +m.away_score; a.pa += +m.home_score;
    if (m.winner === m.home) { h.w++; a.l++; h.res.push('W'); a.res.push('L'); } else if (m.winner === m.away) { a.w++; h.l++; a.res.push('W'); h.res.push('L'); } else { h.tie++; a.tie++; h.res.push('T'); a.res.push('T'); }
  }
  return [...rows.values()].sort((x, y) => y.w - x.w || y.tie - x.tie || y.pf - x.pf);
}
const streak = (res) => { if (!res.length) return '—'; const last = res[res.length - 1]; let n = 0; for (let i = res.length - 1; i >= 0 && res[i] === last; i--) n++; return `${last}${n}`; };

async function standingsTab(el, L) {
  const draw = () => {
    const rows = standings(L);
    const pt = L.league.settings.playoff_teams;
    const c = cats(L);
    const seeds = L.league.playoffs?.seeds;
    const po = L.matchups.filter((m) => m.playoff_round).sort((a, b) => a.playoff_round - b.playoff_round);
    const rounds = [...new Set(po.map((m) => m.playoff_round))];
    const champ = L.league.playoffs?.champion;
    el.innerHTML = `<div class="fx-cols wide">
      <section class="ar-card fx-card"><h2 class="fx-h2">Standings</h2><div class="fx-scroll"><table class="ar-table fx-stand">
        <thead><tr><th>#</th><th>Team</th><th>W-L${rows.some((r) => r.tie) ? '-T' : ''}</th><th class="fx-num">${c ? 'Cats' : 'PF'}</th><th class="fx-num">${c ? 'Cats vs' : 'PA'}</th><th>Streak</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${i < pt ? 'in' : ''}${r.t.id === L.mine?.id ? ' me' : ''}"><td>${i + 1}</td><td><span class="fx-tn">${teamBadge(r.t, 26)}${esc(r.t.name)}</span></td><td>${r.w}-${r.l}${rows.some((x) => x.tie) ? `-${r.tie}` : ''}</td><td class="fx-num">${fmt(r.pf, c ? 0 : 1)}</td><td class="fx-num">${fmt(r.pa, c ? 0 : 1)}</td><td>${streak(r.res)}</td></tr>`).join('')}</tbody></table></div>
        ${pt ? `<p class="ar-muted small">Top ${pt} make the playoffs (week ${L.league.settings.playoff_start}${pt === 6 ? '; seeds 1–2 get a bye' : ''}). Ties break on ${c ? 'categories' : 'points'} won.</p>` : ''}
      </section>
      <section class="ar-card fx-card"><h2 class="fx-h2">Playoffs</h2>
        ${champ ? `<div class="fx-champ">🏆 <b>${esc(teamById(L, champ)?.name)}</b> are champions</div>` : ''}
        ${rounds.length ? `<div class="fx-bracket">${rounds.map((r) => `<div class="fx-round"><h3 class="ar-eyebrow">${playoffName(L, r)}</h3>${po.filter((m) => m.playoff_round === r).map((m) => `<div class="fx-bm">${[m.home, m.away].map((tid) => { const t = teamById(L, tid); const sc = tid === m.home ? m.home_score : m.away_score; return `<span class="${m.final && m.winner === tid ? 'win' : ''}">${teamBadge(t, 20)}<i>${seeds ? seeds.indexOf(tid) + 1 : ''}</i>${esc(t?.name)}<b>${sc != null ? fmt(sc, c ? 0 : 1) : ''}</b></span>`; }).join('')}</div>`).join('')}</div>`).join('')}</div>`
    : `<p class="ar-muted">${pt ? `The bracket appears after week ${L.league.settings.playoff_start - 1}.` : 'This league has no playoffs; best record wins.'}</p>`}
      </section></div>`;
  };
  draw();
  return draw;
}

/* free agents */
async function playersTab(el, L) {
  let pos = 'ALL', q = '', avail = 'fa', sort = 'proj';
  const owners = () => new Map(L.teams.flatMap((t) => t.roster.map((id) => [id, t])));
  const waiv = () => new Map(L.waivers.filter((w) => new Date(w.until) > new Date()).map((w) => [w.player_id, w.until]));
  el.innerHTML = `<div class="fx-bar fx-filters"><input class="ar-input" type="search" id="fq" placeholder="Search players or teams" aria-label="Search">
    <div class="ar-tabs" id="fp">${['ALL', ...sp.positions].map((p) => `<button type="button" data-pos="${p}" aria-selected="${p === pos}">${p === 'ALL' ? 'All' : p}</button>`).join('')}</div>
    <select class="ar-select" id="fa" aria-label="Show"><option value="fa">Available</option><option value="all">All players</option><option value="taken">On rosters</option></select>
    <select class="ar-select" id="fs" aria-label="Sort"><option value="proj">Projection</option><option value="adp">ADP</option></select></div>
    <div id="claims"></div><div class="fx-list" id="flist"></div>`;
  const draw = () => {
    const own = owners(), w = waiv();
    const mine = L.claims.filter((c) => c.status === 'pending');
    $('#claims', el).innerHTML = mine.length ? `<section class="ar-card fx-card"><h2 class="fx-h2">Your waiver claims</h2>${mine.map((c) => `<div class="fx-claim"><span>Add <b>${esc(pl(c.add_player).name)}</b>${c.drop_player ? `, drop <b>${esc(pl(c.drop_player).name)}</b>` : ''}${L.league.settings.waiver === 'faab' ? ` · $${c.bid}` : ''}</span><small class="ar-muted">Runs ${w.get(c.add_player) ? new Date(w.get(c.add_player)).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'soon'}</small><button class="ar-btn sm ghost" data-cancel="${c.id}">Cancel</button></div>`).join('')}</section>` : '';
    const ql = q.toLowerCase();
    const rows = [...G.pool.values()].filter((p) => {
      if (pos !== 'ALL' && !(p.positions || []).includes(pos)) return false;
      if (ql && !p.name.toLowerCase().includes(ql) && !(p.team || '').toLowerCase().includes(ql)) return false;
      const o = own.has(p.id);
      return avail === 'all' || (avail === 'fa' ? !o : o);
    }).sort((a, b) => (sort === 'adp' ? (a.adp ?? 9999) - (b.adp ?? 9999) : (b.proj ?? -1) - (a.proj ?? -1))).slice(0, 150);
    $('#flist', el).innerHTML = `<div class="fx-lrow head four"><span>Player</span><span>Status</span><span class="fx-num">${SPORT === 'nfl' ? 'Proj' : 'Proj/g'}</span><span></span></div>` + rows.map((p) => {
      const o = own.get(p.id), wu = w.get(p.id);
      const status = o ? `<span class="ar-muted">${esc(o.name)}</span>` : wu ? '<span class="fx-wv">Waivers</span>' : '<span class="fx-fa">Free agent</span>';
      const btn = !L.mine ? '' : o ? (o.id === L.mine.id ? '' : `<button class="ar-btn sm ghost" data-trade="${esc(p.id)}">Trade</button>`)
        : `<button class="ar-btn sm" data-add="${esc(p.id)}">${wu ? 'Claim' : 'Add'}</button>`;
      return `<div class="fx-lrow four">${playerCell(p)}${status}<span class="fx-num">${p.proj != null ? fmt(p.proj, SPORT === 'nfl' ? 0 : 1) : '—'}</span><span>${btn}</span></div>`;
    }).join('');
  };
  $('#fq', el).addEventListener('input', (e) => { q = e.target.value; draw(); });
  $('#fp', el).addEventListener('click', (e) => { const b = e.target.closest('[data-pos]'); if (!b) return; pos = b.dataset.pos; $$('#fp button', el).forEach((x) => x.setAttribute('aria-selected', String(x === b))); draw(); });
  $('#fa', el).addEventListener('change', (e) => { avail = e.target.value; draw(); });
  $('#fs', el).addEventListener('change', (e) => { sort = e.target.value; draw(); });
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-add]'); if (a) addPlayer(a.dataset.add);
    const t = e.target.closest('[data-trade]'); if (t) { const o = owners().get(t.dataset.trade); tradeBuilder(o.id, [t.dataset.trade]); }
    const c = e.target.closest('[data-cancel]'); if (c) act(c, () => api.rpc('fantasy_cancel_claim', { p_claim: c.dataset.cancel })).then(() => reloadLeague());
  });
  draw();
  return draw;
}

async function reloadLeague() {
  const L = G.league;
  if (!L) return;
  const fresh = await api.loadLeague(L.league.id);
  if (fresh) Object.assign(L, fresh);
  route();
}

async function addPlayer(id) {
  const L = G.league;
  const p = pl(id);
  const team = L.mine;
  const full = team.roster.length >= rosterSize(L.league.settings);
  const onW = L.waivers.find((w) => w.player_id === id && new Date(w.until) > new Date());
  const faab = L.league.settings.waiver === 'faab';
  const m = modal(`<h2 class="fx-h2">${onW ? 'Claim' : 'Add'} ${esc(p.name)}</h2>
    ${onW ? `<p class="ar-muted">${esc(p.name)} is on waivers until ${new Date(onW.until).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. Claims are processed then, by ${faab ? 'highest bid' : 'waiver priority'}.</p>` : ''}
    <form id="af" class="fx-form">
      <label class="ar-field">${full ? 'Drop (your roster is full)' : 'Drop someone? (optional)'}<select class="ar-select" name="drop"${full ? ' required' : ''}><option value="">${full ? 'Choose a player' : 'Nobody'}</option>${team.roster.map((x) => `<option value="${esc(x)}">${esc(pl(x).name)} · ${esc(pl(x).pos)}</option>`).join('')}</select></label>
      ${onW && faab ? `<label class="ar-field">Your bid (you have $${team.faab})<input class="ar-input" type="number" name="bid" min="0" max="${team.faab}" value="1"></label>` : ''}
      <div class="fx-row end"><button class="ar-btn">${onW ? 'Place claim' : 'Add player'}</button></div></form>`);
  $('#af', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const drop = f.drop.value || null;
    try {
      busy(f.querySelector('button'), true);
      if (onW) await api.rpc('fantasy_claim', { p_team: team.id, p_add: id, p_drop: drop, p_bid: f.bid ? +f.bid.value : 0 });
      else await api.rpc('fantasy_add_drop', { p_team: team.id, p_add: id, p_drop: drop });
      m.close();
      toast(onW ? 'Claim placed' : `${p.name} added`);
      reloadLeague();
    } catch (err) { toast(err.message); busy(f.querySelector('button'), false); }
  });
}

/* trades */
function tradeBuilder(toTeam, want = []) {
  const L = G.league;
  const others = L.teams.filter((t) => t.id !== L.mine.id);
  const m = modal(`<h2 class="fx-h2">Propose a trade</h2>
    <form id="tb" class="fx-form">
      <label class="ar-field">Trade with<select class="ar-select" name="to">${others.map((t) => `<option value="${t.id}"${t.id === toTeam ? ' selected' : ''}>${esc(t.name)}${t.is_bot ? ' (bot)' : ''}</option>`).join('')}</select></label>
      <div class="fx-tcols"><div><h3 class="ar-eyebrow">You give</h3><div id="give"></div></div><div><h3 class="ar-eyebrow">You get</h3><div id="get"></div></div></div>
      <label class="ar-field">Message (optional)<input class="ar-input" name="msg" maxlength="300"></label>
      <p class="ar-muted small" id="tsum"></p>
      <div class="fx-row end"><button class="ar-btn">Send offer</button></div></form>`, { wide: true });
  const f = $('#tb', m.el);
  const box = (ids, name, checked = []) => ids.map((id) => `<label class="fx-tpick"><input type="checkbox" name="${name}" value="${esc(id)}"${checked.includes(id) ? ' checked' : ''}><span>${posTag(pl(id))} ${esc(pl(id).name)} <small class="ar-muted">${esc(pl(id).team || '')}</small></span></label>`).join('');
  const sum = () => {
    const g = $$('input[name=give]:checked', f).reduce((s, x) => s + (pl(x.value).proj || 0), 0);
    const r = $$('input[name=get]:checked', f).reduce((s, x) => s + (pl(x.value).proj || 0), 0);
    $('#tsum', f).textContent = g || r ? `Projected value: you give ${fmt(g, 0)}, you get ${fmt(r, 0)}.` : '';
  };
  const fill = (keep = []) => {
    $('#give', f).innerHTML = box(L.mine.roster, 'give');
    $('#get', f).innerHTML = box(teamById(L, f.to.value).roster, 'get', keep);
    sum();
  };
  fill(want);
  f.to.addEventListener('change', () => fill());
  f.addEventListener('change', sum);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const give = $$('input[name=give]:checked', f).map((x) => x.value);
    const get = $$('input[name=get]:checked', f).map((x) => x.value);
    try {
      busy(f.querySelector('.fx-row button'), true);
      await api.rpc('fantasy_propose_trade', { p_from: L.mine.id, p_to: f.to.value, p_give: give, p_get: get, p_message: f.msg.value });
      m.close();
      toast(teamById(L, f.to.value).is_bot ? 'The bot has answered. Check Trades.' : 'Offer sent');
      location.hash = `#/l/${L.league.id}/trades`;
      reloadLeague();
    } catch (err) { toast(err.message); busy(f.querySelector('.fx-row button'), false); }
  });
}

async function tradesTab(el, L) {
  const draw = () => {
    const me = L.mine?.id;
    const review = L.league.settings.trade_review;
    const card = (t) => {
      const A = teamById(L, t.from_team), B = teamById(L, t.to_team);
      const list = (ids) => ids.map((id) => `<li>${playerCell(pl(id))}</li>`).join('') || '<li class="ar-muted">Nothing</li>';
      const btns = [];
      if (t.status === 'proposed' && t.to_team === me) btns.push(`<button class="ar-btn sm" data-tr="accept" data-id="${t.id}">Accept</button><button class="ar-btn sm ghost" data-tr="reject" data-id="${t.id}">Reject</button>`);
      if (t.status === 'proposed' && t.from_team === me) btns.push(`<button class="ar-btn sm ghost" data-tr="cancel" data-id="${t.id}">Withdraw</button>`);
      if (t.status === 'accepted' && review === 'commish' && isCommish(L)) btns.push(`<button class="ar-btn sm" data-tr="approve" data-id="${t.id}">Approve</button><button class="ar-btn sm danger" data-tr="veto" data-id="${t.id}">Veto</button>`);
      if (t.status === 'accepted' && review === 'league' && me && ![t.from_team, t.to_team].includes(me) && !t.vetoes.includes(me)) btns.push(`<button class="ar-btn sm danger" data-tr="vote" data-id="${t.id}">Vote to veto</button>`);
      const label = { proposed: 'Waiting for reply', accepted: review === 'league' ? `In review · ${t.vetoes.length} veto vote${t.vetoes.length === 1 ? '' : 's'}` : 'Waiting for commissioner', rejected: 'Rejected', cancelled: 'Withdrawn', vetoed: 'Vetoed', completed: 'Completed', failed: 'Didn’t go through' }[t.status];
      return `<article class="ar-card fx-trade"><header><span class="ar-chip">${label}</span><small class="ar-muted">${timeAgo(t.updated_at)}</small></header>
        <div class="fx-tcols"><div><h3 class="fx-tside">${teamBadge(A, 22)} ${esc(A?.name)} gets</h3><ul>${list(t.get)}</ul></div><div><h3 class="fx-tside">${teamBadge(B, 22)} ${esc(B?.name)} gets</h3><ul>${list(t.give)}</ul></div></div>
        ${t.message ? `<p class="fx-quote">“${esc(t.message)}”</p>` : ''}${t.note ? `<p class="ar-muted small">${esc(t.note)}</p>` : ''}
        ${btns.length ? `<div class="fx-row">${btns.join('')}</div>` : ''}</article>`;
    };
    const open = L.trades.filter((t) => ['proposed', 'accepted'].includes(t.status));
    const done = L.trades.filter((t) => !['proposed', 'accepted'].includes(t.status));
    el.innerHTML = `<div class="fx-bar">${L.mine && L.league.status === 'in_season' ? '<button class="ar-btn" id="nt">Propose a trade</button>' : ''}<span class="ar-muted small">${{ commish: 'The commissioner approves accepted trades.', league: 'Accepted trades go through after 24h unless the league vetoes.', none: 'Accepted trades go through instantly.' }[review]}</span></div>
      <h2 class="fx-h2">Open</h2>${open.map(card).join('') || '<p class="ar-muted">No open offers.</p>'}
      <h2 class="fx-h2">History</h2>${done.map(card).join('') || '<p class="ar-muted">No trades yet.</p>'}`;
    $('#nt', el)?.addEventListener('click', () => tradeBuilder(L.teams.find((t) => t.id !== L.mine.id)?.id));
    el.querySelectorAll('[data-tr]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.id;
      const call = {
        accept: () => api.rpc('fantasy_respond_trade', { p_trade: id, p_accept: true }),
        reject: () => api.rpc('fantasy_respond_trade', { p_trade: id, p_accept: false }),
        cancel: () => api.rpc('fantasy_cancel_trade', { p_trade: id }),
        approve: () => api.rpc('fantasy_review_trade', { p_trade: id, p_approve: true }),
        veto: () => api.rpc('fantasy_review_trade', { p_trade: id, p_approve: false }),
        vote: () => api.rpc('fantasy_vote_veto', { p_trade: id }),
      }[b.dataset.tr];
      act(b, call).then(() => reloadLeague());
    }));
  };
  draw();
  return draw;
}

async function activityTab(el, L) {
  const draw = () => {
    const verb = { add: 'added', drop: 'dropped', add_drop: 'added', waiver: 'claimed', trade: 'traded with', commish: 'commissioner move for' };
    el.innerHTML = `<section class="ar-card fx-card"><h2 class="fx-h2">League activity</h2>${L.tx.map((x) => {
      const t = teamById(L, x.team_id), o = teamById(L, x.other_team);
      const adds = x.adds.map((id) => `<span class="fx-add">+ ${esc(pl(id).name)}</span>`).join(' ');
      const drops = x.drops.map((id) => `<span class="fx-drop">− ${esc(pl(id).name)}</span>`).join(' ');
      return `<div class="fx-tx">${teamBadge(t, 30)}<div><b>${esc(t?.name)}</b> ${verb[x.kind] || x.kind}${o ? ` <b>${esc(o.name)}</b>` : ''} ${x.note ? `<span class="ar-muted">(${esc(x.note)})</span>` : ''}<p>${adds} ${drops}</p></div><small class="ar-muted">${timeAgo(x.created_at)}</small></div>`;
    }).join('') || '<p class="ar-muted">Nothing yet.</p>'}</section>`;
  };
  draw();
  return draw;
}

route();
