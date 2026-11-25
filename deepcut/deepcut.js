// Deep Cut: seven prompts a day ("Name a fruit"), 20 seconds each. Any valid
// answer counts, but the rarer it is among today's players, the more it scores.
// Answers are sent as indexes into prompts.json (never free text) to the
// deepcut_submit RPC, which returns how often each answer was picked today.
import { $, esc, dayNumber, seeded, load, save, stats, recordResult, results, helpDialog, toast } from '../daily/daily.js?v=2';
import { matcher } from './match.js?v=1';

const GAME = 'deepcut';
const N = 7, SECONDS = 20;
const day = dayNumber();
const KEY = `kx.deepcut.day${day}`;
const ALL = await fetch('prompts.json?v=1').then((r) => r.json());
const TIERS = [
  { min: 0.15, name: 'Everyone said it', pts: 10, e: '⬜' },
  { min: 0.07, name: 'Popular', pts: 25, e: '🟦' },
  { min: 0.03, name: 'Uncommon', pts: 45, e: '🟩' },
  { min: 0.01, name: 'Rare', pts: 65, e: '🟨' },
  { min: 0.003, name: 'Deep cut', pts: 85, e: '🟧' },
  { min: 0, name: 'One of a kind', pts: 100, e: '🟪' },
];

// Today's seven prompts: walk a fixed shuffle of all prompts so they rarely repeat.
function todaysPrompts() {
  const rng = seeded(424242);
  const order = ALL.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const start = ((day - 1) * N) % order.length;
  return Array.from({ length: N }, (_, k) => order[(start + k) % order.length]);
}
const prompts = todaysPrompts().map((i) => ALL[i]);
const matchers = prompts.map((p) => matcher(p.a));

let st = load(KEY, { step: 0, answers: [], results: null, done: false });
let timer = null;

window.ArcadeTheme?.mount($('#themeBtn'));
$('#dayNo').textContent = `#${day}`;

function clientId() {
  let id = load('kx.deepcut.client', null);
  if (!id) { id = crypto.randomUUID(); save('kx.deepcut.client', id); }
  return id;
}
const persist = () => save(KEY, st);
// Display names: capitalise the first letter; known abbreviations in full caps.
const ACRONYMS = new Set(['blt', 'mma', 'bmx', 'nascar', 'kfc', 'pb&j', 'f1', 'gp', 'ds', 'tvr', 'vw', 'bbq', 'html', 'css', 'sql', 'php', 'vba', 'abap', 'apl', 'r', 'c', 'c++', 'c#', 'f#', 'bjj', 'gmc', 'byd', 'k2', 'usa', 'uk', 'dc', 'd.c.', 'a&w', 'mos']);
const show = (s) => String(s).split(' ').map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w)).join(' ').replace(/^./, (c) => c.toUpperCase());

/* ── rarity ─────────────────────────────────────────────────── */
// Starting guess from list order (common answers first), blended with real picks.
const prior = (rank) => 30 / (rank + 1) ** 1.1;
function share(p, idx, res) {
  const list = prompts[p].a;
  const P = list.reduce((s, _, r) => s + prior(r), 0);
  const counts = res?.[p]?.counts || {};
  const total = res?.[p]?.total || 0;
  return (prior(idx) + (counts[idx] || 0)) / (P + total);
}
const tierOf = (s) => TIERS.find((t) => s >= t.min);
function scored() {
  return prompts.map((_, p) => {
    const a = st.answers[p];
    if (!a || a.idx < 0) return { pts: 0, tier: null, pct: null };
    const t = tierOf(share(p, a.idx, st.results));
    const real = st.results?.[p];
    const pct = real?.total >= 3 ? ((real.counts[a.idx] || 0) / real.total) * 100 : null;
    return { pts: t.pts, tier: t, pct };
  });
}
function topAnswers(p) {
  const res = st.results?.[p];
  const list = prompts[p].a;
  if (res?.total >= 3) {
    return Object.entries(res.counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([i, n]) => `${show(list[i]?.[0] ?? '?')} ${Math.round((n / res.total) * 100)}%`);
  }
  return list.slice(0, 3).map((x) => show(x[0]));
}

/* ── screens ────────────────────────────────────────────────── */
function intro() {
  $('#app').innerHTML = `<div class="dc-intro">
    <h1 class="ar-display">Go deep.</h1>
    <p>Seven prompts. <b>${SECONDS} seconds</b> each. Any real answer counts, but the <b>rarer</b> it is among today's players, the more points you get.</p>
    <div class="dc-tiers">${TIERS.slice().reverse().map((t) => `<span><i>${t.e}</i>${esc(t.name)}<b>${t.pts}</b></span>`).join('')}</div>
    <button class="ar-btn lg" id="go">${st.step ? 'Continue' : 'Start'}</button></div>`;
}

function ask() {
  const p = st.step;
  $('#app').innerHTML = `<div class="dc-ask">
    <div class="dc-step">${Array.from({ length: N }, (_, i) => `<i class="${i < p ? 'done' : i === p ? 'on' : ''}"></i>`).join('')}</div>
    <h1 class="ar-display dc-q">${esc(prompts[p].q)}</h1>
    <div class="dc-bar"><i id="bar"></i></div>
    <form id="form" class="dc-form" autocomplete="off">
      <input id="ans" class="ar-input" maxlength="40" placeholder="Type an answer" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-label="Your answer">
      <button class="ar-btn" type="submit">Lock in</button>
    </form>
    <p class="dg-sub" id="hint">Think beyond the obvious.</p>
    <button class="ar-btn ghost sm" id="skip">Skip</button></div>`;
  $('#ans').focus();
  const t0 = performance.now();
  // A reload mid-prompt restarts that prompt's clock; fine for a casual game.
  clearInterval(timer);
  timer = setInterval(() => {
    const left = SECONDS - (performance.now() - t0) / 1000;
    const bar = $('#bar');
    if (bar) { bar.style.width = `${Math.max(0, (left / SECONDS) * 100)}%`; bar.classList.toggle('low', left < 5); }
    if (left <= 0) lock(null, 'Time’s up!');
  }, 100);
}

function lock(answer, msg) {
  clearInterval(timer);
  st.answers[st.step] = answer;
  st.step++;
  persist();
  if (msg) toast(msg, 1200);
  if (st.step >= N) finish(); else ask();
}

$('#app').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#ans').value.trim();
  if (!text) return;
  const idx = matchers[st.step](text);
  if (idx < 0) {
    $('#hint').textContent = `“${text}” isn’t on our list. Try another!`;
    const f = $('#form'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    $('#ans').select();
    return;
  }
  navigator.vibrate?.(12);
  lock({ text, idx, name: prompts[st.step].a[idx][0] });
});
$('#app').addEventListener('click', (e) => {
  if (e.target.closest('#go')) { if (st.step >= N) finish(); else ask(); }
  if (e.target.closest('#skip')) lock(null);
  if (e.target.closest('#res')) showResults();
});

async function finish() {
  st.done = true;
  persist();
  $('#app').innerHTML = '<p class="dg-sub dc-wait">Counting everyone’s answers…</p>';
  if (!st.results) {
    try {
      const res = await fetch(`${window.ARCADE.url}/rest/v1/rpc/deepcut_submit`, {
        method: 'POST',
        headers: { apikey: window.ARCADE.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_day: day, p_client: clientId(), p_answers: Array.from({ length: N }, (_, i) => (st.answers[i] ? st.answers[i].idx : -1)) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      st.results = await res.json();
      persist();
    } catch {
      toast('Couldn’t reach the server, so rarity is estimated for now.', 3000);
    }
  }
  const sc = scored();
  const total = sc.reduce((s, x) => s + x.pts, 0);
  if (stats(GAME).last !== day) save('kx.deepcut.best', Math.max(load('kx.deepcut.best', 0), total));
  recordResult(GAME, day, true, total);
  renderDone(sc, total);
  showResults();
}

function renderDone(sc = scored(), total = sc.reduce((s, x) => s + x.pts, 0)) {
  $('#app').innerHTML = `<div class="dc-done">
    <div class="dc-total"><b>${total}</b><span>of ${N * 100} points</span></div>
    <ol class="dc-list">${prompts.map((q, p) => {
      const a = st.answers[p], s = sc[p];
      return `<li><div class="dc-row"><span class="dc-pq">${esc(q.q)}</span><b class="dc-pts">${s.pts}</b></div>
        <div class="dc-row"><span class="dc-you">${a ? esc(show(a.name)) : '<em>no answer</em>'}</span>${s.tier ? `<span class="dc-tier">${s.tier.e} ${esc(s.tier.name)}${s.pct != null ? ` · ${s.pct < 1 ? '<1' : Math.round(s.pct)}%` : ''}</span>` : ''}</div>
        <div class="dc-top">${st.results?.[p]?.total >= 3 ? 'Top today' : 'Most common'}: ${topAnswers(p).map(esc).join(', ')}</div></li>`;
    }).join('')}</ol>
    <button class="ar-btn" id="res">Share result</button></div>`;
}

function showResults() {
  const sc = scored();
  const total = sc.reduce((s, x) => s + x.pts, 0);
  const s = stats(GAME);
  const avg = s.played ? Math.round(Object.entries(s.dist).reduce((a, [k, v]) => a + k * v, 0) / s.played) : total;
  const shareText = `Deep Cut #${day} · ${total}/${N * 100}\n${sc.map((x) => (x.tier ? x.tier.e : '⬛')).join('')}\nkinetixgames12.github.io/arcade/deepcut/`;
  results({
    title: total >= 500 ? 'Deep diver!' : total >= 300 ? 'Nice digging!' : 'Done for today',
    line: `<b>${total}</b> points`,
    statsRow: [[s.played, 'Played'], [s.streak, 'Streak'], [load('kx.deepcut.best', total), 'Best'], [avg, 'Average']],
    shareText,
  });
}

$('#statsBtn').addEventListener('click', () => {
  const s = stats(GAME);
  results({ title: 'Your Deep Cut stats', line: '', statsRow: [[s.played, 'Played'], [s.streak, 'Streak'], [load('kx.deepcut.best', 0), 'Best'], [s.best, 'Best streak']] });
});
const help = () => helpDialog(`<div class="dg-help"><h2 class="ar-display">How to play Deep Cut</h2>
  <p>Seven prompts like “Name a fruit”. You get <b>${SECONDS} seconds</b> for each.</p>
  <p>Any real answer counts, but obvious ones score little. The <b>fewer players</b> who gave the same answer today, the more points: up to 100 for one of a kind.</p>
  <p>Not on our list? Try again until time runs out.</p>
  <h3>Tiers</h3><p>${TIERS.map((t) => `${t.e} ${esc(t.name)} ${t.pts}`).join(' · ')}</p>
  <p class="ar-muted">We only store which listed answer you picked, never what you typed.</p></div>`);
$('#helpBtn').addEventListener('click', help);
if (!load('kx.deepcut.seenHelp', false)) { save('kx.deepcut.seenHelp', true); help(); }

if (st.done) { if (st.results) renderDone(); else finish(); } else intro();
