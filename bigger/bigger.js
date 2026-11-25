// Bigger?: two countries, one question: which is bigger (by area) or has
// more people? Ten rounds a day for everyone, plus an endless streak mode.
// Data: Natural Earth (public domain) populations, areas from world-atlas shapes.
import { $, esc, dayNumber, seeded, load, save, stats, recordResult, results, helpDialog } from '../daily/daily.js?v=2';

const GAME = 'bigger';
const ROUNDS = 10;
const day = dayNumber();
const all = (await fetch('../daily/data/countries.json?v=2').then((r) => r.json())).filter((c) => c.pop > 50000 && c.area > 500);
const flag = (iso) => (/^[A-Z]{2}$/.test(iso || '') ? String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🏳️');
const STAT = {
  pop: { q: 'Which has more people?', unit: 'people', fmt: (n) => n.toLocaleString() },
  area: { q: 'Which is bigger by area?', unit: 'km²', fmt: (n) => `${n.toLocaleString()}` },
};

function makeRounds(rng, n) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 5000) {
    const a = all[Math.floor(rng() * all.length)], b = all[Math.floor(rng() * all.length)];
    const stat = out.length % 2 ? 'area' : 'pop';
    if (a === b || a[stat] === b[stat]) continue;
    const ratio = Math.max(a[stat], b[stat]) / Math.min(a[stat], b[stat]);
    // Close enough to make you think, far enough to be fair; gets tighter later.
    const hi = out.length < 4 ? 6 : out.length < 8 ? 3 : 1.8;
    if (ratio < 1.12 || ratio > hi) continue;
    if (out.some((r) => [r.a.id, r.b.id].includes(a.id) || [r.a.id, r.b.id].includes(b.id))) continue;
    out.push({ a, b, stat });
  }
  return out;
}

let mode = 'daily';
let rounds = makeRounds(seeded(day * 7919), ROUNDS);
let st = load(`kx.bigger.day${day}`, { picks: [], done: false });
let streak = 0;
const best = () => load('kx.bigger.best', 0);

window.ArcadeTheme?.mount($('#themeBtn'));
$('#dayNo').textContent = `#${day}`;

function current() { return mode === 'daily' ? rounds[st.picks.length] : rounds[0]; }

function render(reveal = null) {
  const r = reveal?.round || current();
  const app = $('#app');
  if (!r) { finish(); return; }
  const n = mode === 'daily' ? st.picks.length + (reveal ? 0 : 1) : streak + 1;
  app.innerHTML = `
    <div class="bg-head"><span class="ar-chip">${mode === 'daily' ? `Round ${Math.min(n, ROUNDS)} / ${ROUNDS}` : `Streak ${streak} · best ${best()}`}</span>
      <div class="bg-dots">${mode === 'daily' ? rounds.map((_, i) => `<i class="${st.picks[i] === true ? 'ok' : st.picks[i] === false ? 'no' : i === st.picks.length ? 'on' : ''}"></i>`).join('') : ''}</div></div>
    <h1 class="ar-display bg-q">${STAT[r.stat].q}</h1>
    <div class="bg-cards">${['a', 'b'].map((k) => {
      const c = r[k];
      const win = r.a[r.stat] > r.b[r.stat] ? 'a' : 'b';
      const cls = reveal ? (k === win ? 'win' : 'lose') + (reveal.pick === k ? ' picked' : '') : '';
      return `<button class="bg-card ${cls}" data-pick="${k}" ${reveal ? 'disabled' : ''}>
        <span class="bg-flag">${flag(c.iso2)}</span><b>${esc(c.name)}</b><small>${esc(c.cont)}</small>
        <span class="bg-val">${reveal ? `<em data-to="${c[r.stat]}">0</em> ${STAT[r.stat].unit}` : '?'}</span></button>`;
    }).join('<span class="bg-or">or</span>')}</div>
    <div class="bg-foot">${reveal ? `<p class="bg-verdict ${reveal.ok ? 'ok' : 'no'}">${reveal.ok ? 'Correct!' : 'Not quite.'}</p><button class="ar-btn lg" id="next">${mode === 'daily' && st.picks.length >= ROUNDS ? 'See results' : reveal.ok || mode === 'daily' ? 'Next' : 'Try again'}</button>` : '<p class="dg-sub">Tap a country.</p>'}
      <button class="ar-btn ghost sm" id="swap">${mode === 'daily' ? 'Endless mode' : 'Back to daily'}</button></div>`;
  if (reveal) {
    app.querySelectorAll('[data-to]').forEach((el) => {
      const to = Number(el.dataset.to); const t0 = performance.now();
      const step = (t) => { const p = Math.min(1, (t - t0) / 700); el.textContent = Math.round(to * (1 - (1 - p) ** 3)).toLocaleString(); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
}

$('#app').addEventListener('click', (e) => {
  const p = e.target.closest('[data-pick]');
  if (p) {
    const r = current();
    const win = r.a[r.stat] > r.b[r.stat] ? 'a' : 'b';
    const ok = p.dataset.pick === win;
    if (mode === 'daily') { st.picks.push(ok); if (st.picks.length >= ROUNDS) st.done = true; save(`kx.bigger.day${day}`, st); }
    else { if (ok) { streak++; if (streak > best()) save('kx.bigger.best', streak); } }
    navigator.vibrate?.(ok ? 15 : [30, 40, 30]);
    render({ round: r, pick: p.dataset.pick, ok });
    if (mode === 'endless' && !ok) streak = 0;
    return;
  }
  if (e.target.closest('#next')) {
    if (mode === 'endless') rounds = makeRounds(Math.random, 1);
    if (mode === 'daily' && st.done) finish(); else render();
  }
  if (e.target.closest('#swap')) {
    mode = mode === 'daily' ? 'endless' : 'daily';
    streak = 0;
    rounds = mode === 'daily' ? makeRounds(seeded(day * 7919), ROUNDS) : makeRounds(Math.random, 1);
    render();
  }
});

function finish() {
  const score = st.picks.filter(Boolean).length;
  recordResult(GAME, day, true, score);
  const s = stats(GAME);
  const shareText = `Bigger? #${day} ${score}/${ROUNDS}\n${st.picks.map((x) => (x ? '🟩' : '🟥')).join('')}\nkinetixgames12.github.io/arcade/bigger/`;
  $('#app').innerHTML = `<div class="bg-done"><h1 class="ar-display">${score}/${ROUNDS}</h1><p class="dg-sub">${score === 10 ? 'Perfect. Atlas-level.' : score >= 8 ? 'Great sense of scale!' : score >= 5 ? 'Not bad at all.' : 'The world is weird. Try endless mode.'}</p>
    <div class="bg-dots big">${st.picks.map((x) => `<i class="${x ? 'ok' : 'no'}"></i>`).join('')}</div>
    <button class="ar-btn lg" id="swap">Play endless mode</button></div>`;
  results({ title: `${score}/${ROUNDS}`, line: 'Today’s Bigger? is done.', statsRow: [[s.played, 'Played'], [s.played ? (Object.entries(s.dist).reduce((a, [k, v]) => a + k * v, 0) / s.played).toFixed(1) : 0, 'Average'], [s.streak, 'Day streak'], [Math.max(0, ...Object.keys(s.dist).map(Number)), 'Best']], shareText });
}

$('#statsBtn').addEventListener('click', () => { const s = stats(GAME); results({ title: 'Your Bigger? stats', line: '', statsRow: [[s.played, 'Played'], [s.streak, 'Day streak'], [best(), 'Endless best'], [s.wins, 'Finished']] }); });
const help = () => helpDialog(`<div class="dg-help"><h2 class="ar-display">How to play Bigger?</h2><p>Two countries, one question: which one has more people, or which covers more land?</p><p>Ten rounds a day, the same for everyone, and they get closer as you go. Then try <b>endless mode</b>: how long can your streak last?</p><p class="ar-muted">Populations and areas from Natural Earth (rounded estimates).</p></div>`);
$('#helpBtn').addEventListener('click', help);
if (!load('kx.bigger.seenHelp', false)) { save('kx.bigger.seenHelp', true); help(); }
if (st.done) finish(); else render();
