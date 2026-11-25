// Crowns: place one crown in every row, column and colour region, with no
// two crowns touching. A new 8×8 grid every day (the same for everyone),
// plus endless practice grids. Puzzles are generated in gen.js and always
// have exactly one solution.
import { $, dayNumber, seeded, load, save, stats, recordResult, results, helpDialog, toast } from '../daily/daily.js?v=2';
import { generate } from './gen.js?v=1';

const GAME = 'crowns';
const day = dayNumber();
const KEY = `kx.crowns.day${day}`;
const EMPTY = 0, X = 1, CROWN = 2;
const COLORS = ['#b9a6ff', '#ffb38a', '#8fe3c4', '#ffd86b', '#9cc8ff', '#ff9fc4', '#c9e88a', '#d6c2a8', '#a8e6ef'];
const CROWN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5 8 12l4-6.5 4 6.5 4.5-3.5-1.8 10H5.3z"/><rect x="5.3" y="19.5" width="13.4" height="2" rx="1"/></svg>';

let mode = 'daily';
let puz, st, timer = null;

window.ArcadeTheme?.mount($('#themeBtn'));
$('#dayNo').textContent = `#${day}`;

function newState(n) { return { marks: new Array(n * n).fill(EMPTY), ms: 0, done: false, undo: [] }; }
function startDaily() {
  mode = 'daily';
  puz = generate(8, seeded(day * 104729 + 8));
  st = load(KEY, null);
  if (!st || st.marks?.length !== 64) st = newState(8);
  st.undo = [];
  render();
}
function startPractice(n = 8) {
  mode = 'practice';
  puz = generate(n, Math.random);
  st = newState(n);
  render();
}
function persist() { if (mode === 'daily') save(KEY, { marks: st.marks, ms: st.ms, done: st.done }); }

// --- timer (pauses while the tab is hidden) ---
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let last = 0;
function tick() {
  const now = performance.now();
  if (!st.done && !document.hidden && last) st.ms += now - last;
  last = now;
  const el = $('#cwTime'); if (el) el.textContent = fmt(st.ms);
}
document.addEventListener('visibilitychange', () => { last = performance.now(); persist(); });

// Crowns that break a rule: same row, column or region, or touching.
function conflicts() {
  const n = puz.n, bad = new Set();
  const crowns = [];
  st.marks.forEach((m, i) => { if (m === CROWN) crowns.push(i); });
  for (let a = 0; a < crowns.length; a++) for (let b = a + 1; b < crowns.length; b++) {
    const i = crowns[a], j = crowns[b];
    const ri = Math.floor(i / n), ci = i % n, rj = Math.floor(j / n), cj = j % n;
    if (ri === rj || ci === cj || puz.regions[i] === puz.regions[j] || (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1)) { bad.add(i); bad.add(j); }
  }
  return { bad, crowns };
}

function render() {
  const n = puz.n;
  const reg = puz.regions;
  const { bad } = conflicts();
  const cells = st.marks.map((m, i) => {
    const r = Math.floor(i / n), c = i % n, g = reg[i];
    const edge = [r === 0 || reg[i - n] !== g ? 't' : '', c === n - 1 || reg[i + 1] !== g ? 'r' : '', r === n - 1 || reg[i + n] !== g ? 'b' : '', c === 0 || reg[i - 1] !== g ? 'l' : ''].filter(Boolean).map((e) => `e${e}`).join(' ');
    const label = `Row ${r + 1}, column ${c + 1}${m === CROWN ? ', crown' : m === X ? ', crossed out' : ''}`;
    return `<button class="cw-c ${edge}${bad.has(i) ? ' bad' : ''}${m === CROWN ? ' crown' : ''}" data-i="${i}" style="--g:${COLORS[g]}" aria-label="${label}">${m === CROWN ? CROWN_SVG : m === X ? '<i class="cw-x"></i>' : ''}</button>`;
  }).join('');
  $('#app').innerHTML = `
    <div class="cw-bar"><span class="ar-chip">${mode === 'daily' ? `Daily #${day}` : `Practice ${n}×${n}`}</span><b class="cw-time" id="cwTime">${fmt(st.ms)}</b></div>
    <div class="cw-grid${st.done ? ' won' : ''}" id="grid" style="--n:${n}" role="grid" aria-label="Crowns puzzle">${cells}</div>
    <p class="dg-sub">Tap once for ✕, twice for a crown. Drag to cross out several squares.</p>
    <div class="cw-tools">
      <button class="ar-btn ghost sm" id="undo" ${st.undo.length && !st.done ? '' : 'disabled'}>Undo</button>
      <button class="ar-btn ghost sm" id="clear" ${st.done ? 'disabled' : ''}>Clear</button>
      ${mode === 'daily' ? '<button class="ar-btn ghost sm" data-practice="8">Practice</button>' : '<button class="ar-btn ghost sm" data-practice="6">New 6×6</button><button class="ar-btn ghost sm" data-practice="7">New 7×7</button><button class="ar-btn ghost sm" data-practice="8">New 8×8</button><button class="ar-btn ghost sm" id="daily">Back to daily</button>'}
    </div>`;
  clearInterval(timer);
  last = performance.now();
  if (!st.done) timer = setInterval(tick, 250);
}

function afterChange() {
  const { bad, crowns } = conflicts();
  if (crowns.length === puz.n && !bad.size) { win(); return; }
  persist();
  render();
}
const cycle = (m) => (m === EMPTY ? X : m === X ? CROWN : EMPTY);

// --- input: tap cycles empty → ✕ → crown → empty; drag paints ✕ ---
let drag = null;
$('#app').addEventListener('pointerdown', (e) => {
  const c = e.target.closest('.cw-c');
  if (!c || st.done || e.button > 0) return;
  e.preventDefault();
  drag = { start: Number(c.dataset.i), moved: false, snapshot: st.marks.slice(), id: e.pointerId };
});
document.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cw-c');
  if (!el) return;
  const i = Number(el.dataset.i);
  if (i === drag.start && !drag.moved) return;
  if (!drag.moved) { drag.moved = true; if (st.marks[drag.start] === EMPTY) paint(drag.start); }
  if (st.marks[i] === EMPTY) paint(i);
});
function paint(i) {
  st.marks[i] = X;
  const el = $(`.cw-c[data-i="${i}"]`);
  if (el) el.innerHTML = '<i class="cw-x"></i>';
}
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  if (!d.moved) {
    st.marks[d.start] = cycle(st.marks[d.start]);
    navigator.vibrate?.(st.marks[d.start] === CROWN ? 12 : 5);
  }
  if (st.marks.some((m, i) => m !== d.snapshot[i])) { st.undo.push(d.snapshot); if (st.undo.length > 200) st.undo.shift(); }
  afterChange();
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

// keyboard: Enter/Space on a focused square cycles it
$('#app').addEventListener('keydown', (e) => {
  const c = e.target.closest('.cw-c');
  if (!c || st.done || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  const i = Number(c.dataset.i);
  st.undo.push(st.marks.slice());
  st.marks[i] = cycle(st.marks[i]);
  afterChange();
  $(`.cw-c[data-i="${i}"]`)?.focus();
});

$('#app').addEventListener('click', (e) => {
  if (e.target.closest('#undo') && st.undo.length) { st.marks = st.undo.pop(); afterChange(); }
  if (e.target.closest('#clear')) { st.undo.push(st.marks.slice()); st.marks.fill(EMPTY); afterChange(); }
  const p = e.target.closest('[data-practice]');
  if (p) startPractice(Number(p.dataset.practice));
  if (e.target.closest('#daily')) startDaily();
});

const times = () => load('kx.crowns.times', []);
function win() {
  tick();
  st.done = true;
  clearInterval(timer);
  persist();
  render();
  navigator.vibrate?.([20, 40, 20]);
  if (mode === 'daily') {
    const fresh = stats(GAME).last !== day;
    recordResult(GAME, day, true, 1);
    if (fresh) save('kx.crowns.times', [...times(), Math.round(st.ms)].slice(-365));
    showResults();
  } else {
    toast(`Solved in ${fmt(st.ms)}!`, 2500);
  }
}

function showResults() {
  const s = stats(GAME), t = times();
  const best = t.length ? Math.min(...t) : st.ms;
  const avg = t.length ? t.reduce((a, b) => a + b, 0) / t.length : st.ms;
  const shareText = `Crowns #${day} 👑 ${fmt(st.ms)}\nkinetixgames12.github.io/arcade/crowns/`;
  results({ title: 'All crowns placed!', line: `Solved in <b>${fmt(st.ms)}</b>`, statsRow: [[s.played, 'Solved'], [s.streak, 'Day streak'], [fmt(best), 'Best'], [fmt(avg), 'Average']], shareText, extra: '<p class="ar-muted">Want more? Try a practice grid.</p>' });
}

$('#statsBtn').addEventListener('click', () => {
  const s = stats(GAME), t = times();
  results({ title: 'Your Crowns stats', line: '', statsRow: [[s.played, 'Solved'], [s.streak, 'Day streak'], [t.length ? fmt(Math.min(...t)) : '–', 'Best'], [s.best, 'Best streak']] });
});
const help = () => helpDialog(`<div class="dg-help"><h2 class="ar-display">How to play Crowns</h2>
  <p>Place one crown in every <b>row</b>, every <b>column</b> and every <b>colour region</b>.</p>
  <p>Crowns can't touch each other, not even corner to corner.</p>
  <h3>Controls</h3><p>Tap a square once to cross it out (✕), twice for a crown, three times to clear it. Drag across squares to cross out many at once.</p>
  <p>Every grid has exactly one answer, so you never need to guess. A new grid every day.</p></div>`);
$('#helpBtn').addEventListener('click', help);
if (!load('kx.crowns.seenHelp', false)) { save('kx.crowns.seenHelp', true); help(); }

startDaily();
if (st.done) showResults();
