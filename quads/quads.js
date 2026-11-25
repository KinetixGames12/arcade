// Quads: sixteen words hide four groups of four. Pick four that belong
// together; four mistakes and it's over. Same puzzle for everyone each day.
// Puzzles live in quads.json (built from puzzles.mjs), easiest group first.
import { $, esc, dayNumber, seeded, load, save, stats, recordResult, results, helpDialog, toast } from '../daily/daily.js?v=2';

const GAME = 'quads';
const MAX_MISTAKES = 4;
const COLORS = ['#ffd86b', '#8fe3c4', '#9cc8ff', '#c9a6ff'];
const EMOJI = ['🟨', '🟩', '🟦', '🟪'];
const day = dayNumber();
const KEY = `kx.quads.day${day}`;
const all = await fetch('quads.json?v=1').then((r) => r.json());

let mode = 'daily';
let puz, order, st, sel = new Set();

window.ArcadeTheme?.mount($('#themeBtn'));
$('#dayNo').textContent = `#${day}`;

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function setup(index, rng) {
  puz = all[index % all.length];
  order = shuffle(puz.flatMap((g) => g.words), rng);
  sel = new Set();
}
function startDaily() {
  mode = 'daily';
  setup(day - 1, seeded(day * 7177));
  st = load(KEY, { solved: [], guesses: [], mistakes: 0, done: false });
  render();
}
function startPractice() {
  mode = 'practice';
  let i;
  do i = Math.floor(Math.random() * all.length); while (all.length > 1 && i === (day - 1) % all.length);
  setup(i, Math.random);
  st = { solved: [], guesses: [], mistakes: 0, done: false };
  render();
}
const groupOf = (w) => puz.findIndex((g) => g.words.includes(w));
const persist = () => { if (mode === 'daily') save(KEY, st); };

function render(shake = false) {
  const left = order.filter((w) => !st.solved.includes(groupOf(w)));
  const lost = st.done && st.solved.length < 4;
  // When the game is lost, show the groups that were missed too.
  const shown = lost ? [...st.solved, ...[0, 1, 2, 3].filter((g) => !st.solved.includes(g))] : st.solved;
  $('#app').innerHTML = `
    <p class="dg-sub">${mode === 'daily' ? 'Make four groups of four.' : 'Practice puzzle. Make four groups of four.'}</p>
    <div class="qd-board">
      ${shown.map((g) => `<div class="qd-group${st.solved.includes(g) ? '' : ' missed'}" style="--c:${COLORS[g]}"><b>${esc(puz[g].name)}</b><span>${puz[g].words.map(esc).join(', ')}</span></div>`).join('')}
      ${lost ? '' : `<div class="qd-tiles${shake ? ' shake' : ''}">${left.map((w) => `<button class="qd-t${sel.has(w) ? ' on' : ''}${w.length > 8 ? ' long' : ''}" data-w="${esc(w)}" aria-pressed="${sel.has(w)}">${esc(w)}</button>`).join('')}</div>`}
    </div>
    ${st.done ? '' : `<div class="qd-mis">Mistakes left: ${Array.from({ length: MAX_MISTAKES }, (_, i) => `<i class="${i < MAX_MISTAKES - st.mistakes ? 'on' : ''}"></i>`).join('')}</div>`}
    <div class="qd-tools">
      ${st.done
        ? `${mode === 'daily' ? '<button class="ar-btn ghost" id="res">See results</button>' : ''}<button class="ar-btn" id="practice">${mode === 'daily' ? 'Play a practice puzzle' : 'Another practice puzzle'}</button>${mode === 'practice' ? '<button class="ar-btn ghost" id="daily">Back to daily</button>' : ''}`
        : `<button class="ar-btn ghost" id="shuffle">Shuffle</button><button class="ar-btn ghost" id="clearSel" ${sel.size ? '' : 'disabled'}>Deselect</button><button class="ar-btn" id="submit" ${sel.size === 4 ? '' : 'disabled'}>Submit</button>`}
    </div>`;
}

function submit() {
  if (sel.size !== 4) return;
  const picks = [...sel];
  const key = picks.slice().sort().join('|');
  if (st.guesses.some((g) => g.slice().sort().join('|') === key)) { toast('Already guessed!'); return; }
  st.guesses.push(picks);
  const counts = [0, 0, 0, 0];
  picks.forEach((w) => counts[groupOf(w)]++);
  const hit = counts.findIndex((c) => c === 4);
  if (hit >= 0) {
    st.solved.push(hit);
    sel.clear();
    navigator.vibrate?.(15);
    if (st.solved.length === 4) return finish(true);
    persist(); render();
    return;
  }
  st.mistakes++;
  navigator.vibrate?.([30, 40, 30]);
  if (Math.max(...counts) === 3) toast('One away…');
  if (st.mistakes >= MAX_MISTAKES) return finish(false);
  persist(); render(true);
}

function finish(won) {
  st.done = true;
  sel.clear();
  persist();
  render();
  if (mode === 'daily') { recordResult(GAME, day, won, st.mistakes); showResults(); }
  else toast(won ? 'Solved!' : 'Out of mistakes. Here are the groups.', 2500);
}

function showResults() {
  const won = st.solved.length === 4;
  const s = stats(GAME);
  const grid = st.guesses.map((g) => g.map((w) => EMOJI[groupOf(w)]).join('')).join('\n');
  const shareText = `Quads #${day} ${won ? `${st.mistakes} mistake${st.mistakes === 1 ? '' : 's'}` : 'X'}\n${grid}\nkinetixgames12.github.io/arcade/quads/`;
  const dist = [0, 1, 2, 3].map((m) => ({ label: String(m), n: s.dist[m] || 0, on: won && st.mistakes === m }));
  results({
    title: won ? (st.mistakes === 0 ? 'Perfect!' : 'Solved!') : 'Next time!',
    line: won ? `All four groups with <b>${st.mistakes}</b> mistake${st.mistakes === 1 ? '' : 's'}.` : 'You ran out of mistakes.',
    statsRow: [[s.played, 'Played'], [s.played ? Math.round((s.wins / s.played) * 100) : 0, 'Win %'], [s.streak, 'Streak'], [s.best, 'Best']],
    dist, shareText,
    extra: '<p class="ar-muted">Mistakes per solve</p>',
  });
}

$('#app').addEventListener('click', (e) => {
  const t = e.target.closest('.qd-t');
  if (t && !st.done) {
    const w = t.dataset.w;
    if (sel.has(w)) sel.delete(w);
    else if (sel.size < 4) sel.add(w);
    render();
    return;
  }
  if (e.target.closest('#submit')) submit();
  if (e.target.closest('#shuffle')) { order = shuffle(order, Math.random); render(); }
  if (e.target.closest('#clearSel')) { sel.clear(); render(); }
  if (e.target.closest('#res')) showResults();
  if (e.target.closest('#practice')) startPractice();
  if (e.target.closest('#daily')) startDaily();
});

$('#statsBtn').addEventListener('click', () => {
  const s = stats(GAME);
  results({ title: 'Your Quads stats', line: '', statsRow: [[s.played, 'Played'], [s.played ? Math.round((s.wins / s.played) * 100) : 0, 'Win %'], [s.streak, 'Streak'], [s.best, 'Best']], dist: [0, 1, 2, 3].map((m) => ({ label: String(m), n: s.dist[m] || 0 })) });
});
const help = () => helpDialog(`<div class="dg-help"><h2 class="ar-display">How to play Quads</h2>
  <p>Sixteen words hide <b>four groups of four</b>. Pick four words that share something, then press <b>Submit</b>.</p>
  <p>Groups can be anything: types of fish, words before "ball", hidden words… Watch out for words that seem to fit more than one group.</p>
  <p>You can make <b>four mistakes</b>. If three of your four are right, you'll see "One away".</p>
  <h3>Colours</h3><p>🟨 easiest · 🟩 · 🟦 · 🟪 trickiest. A new puzzle every day.</p></div>`);
$('#helpBtn').addEventListener('click', help);
if (!load('kx.quads.seenHelp', false)) { save('kx.quads.seenHelp', true); help(); }

startDaily();
if (st.done) showResults();
