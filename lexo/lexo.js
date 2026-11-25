// Lexo: find the hidden five-letter word in six tries. One word a day for
// everyone, plus unlimited practice. Words: ENABLE word list (public domain).
import { $, esc, dayNumber, seeded, load, save, stats, recordResult, toast, results, helpDialog, share } from '../daily/daily.js?v=2';

const GAME = 'lexo';
const ROWS = 6, LEN = 5;
const day = dayNumber();
const data = await fetch('../daily/data/words.json?v=1').then((r) => r.json());
const valid = new Set();
for (let i = 0; i < data.guesses.length; i += 5) valid.add(data.guesses.slice(i, i + 5));
for (const w of data.answers) valid.add(w);
const daily = data.answers[(day - 1 + data.answers.length * 10) % data.answers.length];

let mode = 'daily';
let answer = daily;
let st = load(`kx.lexo.day${day}`, { guesses: [], done: false, won: false });
let cur = '';
let busy = false;

window.ArcadeTheme?.mount($('#themeBtn'));
$('#dayNo').textContent = `#${day}`;
$('#app').innerHTML = `
  <p class="dg-sub" id="modeLine">Daily word · 6 tries</p>
  <div class="lx-board" id="board" aria-label="Guesses"></div>
  <div class="lx-kb" id="kb" aria-label="Keyboard"></div>
  <div class="lx-actions"><button class="ar-btn ghost sm" id="practice">Practice mode</button></div>`;

const KB = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫'];
$('#kb').innerHTML = KB.map((r) => `<div class="lx-row">${[...r].map((k) => `<button type="button" data-k="${k}" class="${k === '⏎' || k === '⌫' ? 'wide' : ''}" aria-label="${k === '⏎' ? 'Enter' : k === '⌫' ? 'Delete' : k}">${k === '⏎' ? 'Enter' : k}</button>`).join('')}</div>`).join('');

function score(guess, ans) {
  const res = Array(LEN).fill('absent');
  const left = {};
  for (let i = 0; i < LEN; i++) { if (guess[i] === ans[i]) res[i] = 'hit'; else left[ans[i]] = (left[ans[i]] || 0) + 1; }
  for (let i = 0; i < LEN; i++) if (res[i] !== 'hit' && left[guess[i]] > 0) { res[i] = 'near'; left[guess[i]]--; }
  return res;
}

function render(revealRow = -1) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const g = st.guesses[r];
    const text = g || (r === st.guesses.length ? cur : '');
    const sc = g ? score(g, answer) : null;
    rows.push(`<div class="lx-r${r === st.guesses.length && !st.done ? ' cur' : ''}">${Array.from({ length: LEN }, (_, i) => {
      const ch = text[i] || '';
      const cls = sc ? sc[i] : ch ? 'typed' : '';
      const delay = r === revealRow ? ` style="--d:${i * 0.18}s"` : '';
      return `<div class="lx-t ${cls}${r === revealRow ? ' flip' : ''}"${delay}>${esc(ch)}</div>`;
    }).join('')}</div>`);
  }
  $('#board').innerHTML = rows.join('');
  const best = {};
  const rank = { absent: 0, near: 1, hit: 2 };
  for (const g of st.guesses) score(g, answer).forEach((s, i) => { if ((rank[s] ?? -1) > (rank[best[g[i]]] ?? -1)) best[g[i]] = s; });
  document.querySelectorAll('#kb [data-k]').forEach((b) => { b.className = `${b.className.includes('wide') ? 'wide ' : ''}${best[b.dataset.k] || ''}`; });
}

function shake() {
  const row = document.querySelector('.lx-r.cur');
  row?.classList.remove('shake'); void row?.offsetWidth; row?.classList.add('shake');
}

function persist() { if (mode === 'daily') save(`kx.lexo.day${day}`, st); }

function finish(showSoon = true) {
  const won = st.won;
  if (mode === 'daily') recordResult(GAME, day, won, st.guesses.length);
  const s = stats(GAME);
  const grid = st.guesses.map((g) => score(g, answer).map((x) => ({ hit: '🟩', near: '🟨', absent: '⬛' })[x]).join('')).join('\n');
  const shareText = `Lexo #${day} ${won ? st.guesses.length : 'X'}/6\n${grid}\nkinetixgames12.github.io/arcade/lexo/`;
  const show = () => results({
    title: won ? ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'][st.guesses.length - 1] : 'So close',
    line: `The word was <b class="lx-ans">${esc(answer.toUpperCase())}</b>`,
    statsRow: mode === 'daily' ? [[s.played, 'Played'], [s.played ? Math.round((s.wins / s.played) * 100) : 0, 'Win %'], [s.streak, 'Streak'], [s.best, 'Best']] : null,
    dist: mode === 'daily' ? [1, 2, 3, 4, 5, 6].map((n) => ({ label: n, n: s.dist[n] || 0, on: won && n === st.guesses.length })) : null,
    shareText: mode === 'daily' ? shareText : null,
    extra: mode === 'practice' ? '<p class="ar-muted">Practice game. Press Practice mode again for a new word.</p>' : '',
  });
  setTimeout(show, showSoon ? 1700 : 0);
}

function submit() {
  if (st.done || busy) return;
  if (cur.length < LEN) { shake(); toast('Not enough letters'); return; }
  if (!valid.has(cur)) { shake(); toast('Not in word list'); return; }
  st.guesses.push(cur);
  cur = '';
  st.won = st.guesses[st.guesses.length - 1] === answer;
  st.done = st.won || st.guesses.length >= ROWS;
  persist();
  busy = true;
  render(st.guesses.length - 1);
  setTimeout(() => {
    busy = false;
    if (st.won) { document.querySelectorAll('.lx-r')[st.guesses.length - 1]?.classList.add('win'); }
    if (st.done) finish();
  }, LEN * 180 + 400);
}

function key(k) {
  if (st.done || busy) return;
  if (k === '⏎' || k === 'enter') submit();
  else if (k === '⌫' || k === 'backspace') { cur = cur.slice(0, -1); render(); }
  else if (/^[a-z]$/.test(k) && cur.length < LEN) { cur += k; render(); const t = document.querySelectorAll('.lx-r.cur .lx-t')[cur.length - 1]; t?.classList.add('pop'); }
}

$('#kb').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === 'enter' || k === 'backspace' || /^[a-z]$/.test(k)) { e.preventDefault(); key(k); }
});
$('#practice').addEventListener('click', () => {
  mode = 'practice';
  answer = data.answers[Math.floor(Math.random() * data.answers.length)];
  st = { guesses: [], done: false, won: false };
  cur = '';
  $('#modeLine').textContent = 'Practice · random word, doesn’t affect your stats';
  $('#practice').textContent = 'New practice word';
  render();
});
$('#statsBtn').addEventListener('click', () => {
  if (mode === 'daily' && st.done) { finish(false); return; }
  const s = stats(GAME);
  results({ title: 'Your Lexo stats', line: st.done ? '' : 'Today’s word is still waiting.', statsRow: [[s.played, 'Played'], [s.played ? Math.round((s.wins / s.played) * 100) : 0, 'Win %'], [s.streak, 'Streak'], [s.best, 'Best']], dist: [1, 2, 3, 4, 5, 6].map((n) => ({ label: n, n: s.dist[n] || 0 })) });
});
const help = () => helpDialog(`<div class="dg-help"><h2 class="ar-display">How to play Lexo</h2>
  <p>Find the hidden five-letter word in six tries. Type a word and press Enter.</p>
  <div class="lx-demo"><div class="lx-t hit">c</div><div class="lx-t absent">l</div><div class="lx-t near">e</div><div class="lx-t absent">a</div><div class="lx-t absent">n</div></div>
  <p><b>Green</b>: right letter, right spot. <b>Yellow</b>: in the word, wrong spot. <b>Dark</b>: not in the word.</p>
  <p>A new word every day at midnight. Everyone gets the same one.</p></div>`);
$('#helpBtn').addEventListener('click', help);
if (!load('kx.lexo.seenHelp', false)) { save('kx.lexo.seenHelp', true); help(); }
render();
if (st.done) setTimeout(() => finish(false), 400);
void seeded; void share;
