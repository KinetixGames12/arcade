// Kinetix Checkers: American rules vs five bot levels (AI runs in worker.js)
// or two players on one device. A game in progress survives a reload.
import { START, moves as legalMoves, play, side, crowned } from './engine.js?v=1';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

const OPPONENTS = [
  { id: 1, name: 'Pip', note: 'Just learning' },
  { id: 2, name: 'Juno', note: 'Casual' },
  { id: 3, name: 'Rook', note: 'Club player' },
  { id: 4, name: 'Vega', note: 'Sharp' },
  { id: 5, name: 'Titan', note: 'Thinks deep' },
  { id: 0, name: 'Friend', note: 'Same device' },
];
const DRAW_PLIES = 80; // 40 moves each with no capture and no man moved → draw
const NAME = { d: 'Dark', l: 'Light' };

let G = load('kx.checkers.game', null);
let opp = load('kx.checkers.opp', 3);
let sel = null, thinking = false, flipped = false, reqId = 0;
const worker = new Worker('worker.js?v=1', { type: 'module' });

window.ArcadeTheme?.mount($('#themeBtn'));

/* ── setup panel ─────────────────────────────────────────────── */
function renderSetup() {
  $('#opp').innerHTML = OPPONENTS.map((o) => `<button role="radio" aria-checked="${o.id === opp}" data-opp="${o.id}"><b>${esc(o.name)}</b><span>${esc(o.note)}</span></button>`).join('');
  const rec = load('kx.checkers.record', {});
  const r = rec[opp];
  $('#record').textContent = opp && r ? `Your record vs ${OPPONENTS.find((o) => o.id === opp).name}: ${r.w} won · ${r.l} lost · ${r.d} drawn` : '';
}
$('#opp').addEventListener('click', (e) => {
  const b = e.target.closest('[data-opp]');
  if (!b) return;
  opp = Number(b.dataset.opp); save('kx.checkers.opp', opp); renderSetup();
});
$('#start').addEventListener('click', () => {
  let me = $('#color').value;
  if (me === 'r') me = Math.random() < 0.5 ? 'd' : 'l';
  G = { board: START.slice(), turn: 'd', me: opp ? me : null, opp, hist: [], quiet: 0, over: null, last: null };
  flipped = opp ? me === 'l' : false;
  showGame();
});

/* ── game ───────────────────────────────────────────────────── */
function showGame() {
  $('#setup').hidden = !!G;
  $('#game').hidden = !G;
  if (!G) { renderSetup(); renderBoard(START, null); renderPlayers(); return; }
  if (G.me) flipped = G.me === 'l';
  render();
  maybeBot();
}

const botTurn = () => G && !G.over && G.opp && G.turn !== G.me;
const current = () => (G ? legalMoves(G.board, G.turn) : []);

function render() {
  renderBoard(G.board, G.last);
  renderPlayers();
  $('#status').innerHTML = statusText();
  $('#undo').disabled = !G.hist.length || thinking || (!!G.opp && !G.hist.some((h) => h.turn === G.me));
  $('#resign').hidden = !!G.over;
  $('#moves').innerHTML = G.hist.map((h, i) => `<li class="${side(h.piece)}">${i % 2 === 0 ? `<span>${Math.floor(i / 2) + 1}.</span>` : ''}${esc(h.note)}</li>`).join('');
  $('#moves').scrollTop = 1e6;
  save('kx.checkers.game', G.over ? null : G);
}

function statusText() {
  if (G.over) return `<b>${esc(G.over.text)}</b>`;
  const ms = current();
  const must = ms[0]?.caps.length ? ' A capture is available, so you must take it.' : '';
  if (G.opp) return G.turn === G.me ? `Your move (${NAME[G.me]}).${must}` : `<span class="ck-think">${esc(OPPONENTS.find((o) => o.id === G.opp).name)} is thinking</span>`;
  return `${NAME[G.turn]} to move.${must}`;
}

function renderPlayers() {
  const count = (s) => (G ? G.board : START).filter((p) => side(p) === s).length;
  const lbl = (s) => {
    if (!G || !G.opp) return NAME[s];
    return s === G.me ? `You · ${NAME[s]}` : `${OPPONENTS.find((o) => o.id === G.opp).name} · ${NAME[s]}`;
  };
  const row = (s) => `<span class="ck-chip ${s}"></span><b>${esc(lbl(s))}</b><span class="ar-muted">${count(s)} left</span>${G && !G.over && G.turn === s ? '<i class="ck-turn">to move</i>' : ''}`;
  $('#pTop').innerHTML = row(flipped ? 'd' : 'l');
  $('#pBot').innerHTML = row(flipped ? 'l' : 'd');
}

const sqNum = (i) => (i >> 3) * 4 + ((i & 7) >> 1) + 1; // playable squares 1-32
function renderBoard(board, last) {
  const ms = G && !G.over && !botTurn() ? current() : [];
  const movable = new Set(ms.map((m) => m.from));
  const targets = sel != null ? ms.filter((m) => m.from === sel) : [];
  let html = '';
  for (let v = 0; v < 64; v++) {
    const i = flipped ? 63 - v : v;
    const r = i >> 3, c = i & 7, dark = (r + c) % 2 === 1;
    const p = board[i];
    const t = targets.find((m) => m.to === i);
    const cls = ['ck-sq', dark ? 'dk' : 'lt', last && (last.from === i || last.to === i) ? 'last' : '', sel === i ? 'sel' : '', t ? 'tgt' : '', last?.caps?.includes(i) ? 'gone' : ''].filter(Boolean).join(' ');
    html += `<div class="${cls}" data-i="${i}" ${dark ? `aria-label="Square ${sqNum(i)}${p ? `, ${NAME[side(p)]} ${p === p.toUpperCase() ? 'king' : 'piece'}` : ''}"` : ''}>`;
    if (p) html += `<button class="ck-pc ${side(p)}${p === p.toUpperCase() ? ' king' : ''}${movable.has(i) ? ' can' : ''}" data-i="${i}" tabindex="${movable.has(i) ? 0 : -1}" aria-label="${NAME[side(p)]} ${p === p.toUpperCase() ? 'king' : 'piece'} on ${sqNum(i)}"></button>`;
    if (t) html += `<button class="ck-dot" data-to="${i}" aria-label="Move to ${sqNum(i)}"></button>`;
    html += '</div>';
  }
  $('#board').innerHTML = html;
}

$('#board').addEventListener('click', (e) => {
  if (!G || G.over || botTurn()) return;
  const to = e.target.closest('[data-to]');
  if (to && sel != null) {
    const m = current().find((x) => x.from === sel && x.to === Number(to.dataset.to));
    if (m) { sel = null; doMove(m); }
    return;
  }
  const pc = e.target.closest('.ck-pc');
  const ms = current();
  if (pc) {
    const i = Number(pc.dataset.i);
    if (ms.some((m) => m.from === i)) { sel = sel === i ? null : i; render(); return; }
    if (side(G.board[i]) === G.turn && ms[0]?.caps.length) flash('You must capture: pick a piece that can jump.');
  }
  if (sel != null) { sel = null; render(); }
});

let flashT;
function flash(msg) {
  let t = $('.ar-toast');
  if (!t) { t = document.createElement('div'); t.className = 'ar-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(flashT); flashT = setTimeout(() => t.classList.remove('show'), 2200);
}

function noteOf(m, b) { return m.path.map(sqNum).join(m.caps.length ? 'x' : '-') + (crowned(b, m) ? ' ♛' : ''); }

function doMove(m) {
  const piece = G.board[m.from];
  G.hist.push({ board: G.board, turn: G.turn, quiet: G.quiet, last: G.last, piece, note: noteOf(m, G.board) });
  const wasMan = piece === piece.toLowerCase();
  G.board = play(G.board, m);
  G.quiet = m.caps.length || wasMan ? 0 : G.quiet + 1;
  G.last = { from: m.from, to: m.to, caps: m.caps };
  G.turn = G.turn === 'd' ? 'l' : 'd';
  navigator.vibrate?.(m.caps.length ? [10, 30, 10] : 8);
  checkEnd();
  render();
  maybeBot();
}

function checkEnd() {
  if (!legalMoves(G.board, G.turn).length) {
    const winner = G.turn === 'd' ? 'l' : 'd';
    end(winner, G.board.some((p) => side(p) === G.turn) ? 'no moves left' : 'all pieces captured');
  } else if (G.quiet >= DRAW_PLIES) end(null, '40 moves each with no capture');
}

function end(winner, why) {
  const result = !winner ? 'd' : !G.opp ? null : winner === G.me ? 'w' : 'l';
  const who = !winner ? 'Draw' : G.opp ? (winner === G.me ? 'You win!' : `${OPPONENTS.find((o) => o.id === G.opp).name} wins`) : `${NAME[winner]} wins`;
  G.over = { winner, text: `${who} (${why})` };
  if (G.opp && result) {
    const rec = load('kx.checkers.record', {});
    const r = rec[G.opp] || { w: 0, l: 0, d: 0 };
    r[result]++; rec[G.opp] = r; save('kx.checkers.record', rec);
  }
}

function maybeBot() {
  if (!botTurn() || thinking) return;
  thinking = true;
  const id = ++reqId;
  const t0 = performance.now();
  render();
  worker.onmessage = (e) => {
    if (e.data.id !== reqId || !G || G.over) return;
    // Keep a short pause so instant replies don't feel robotic.
    setTimeout(() => {
      if (id !== reqId) return;
      thinking = false;
      if (e.data.move) doMove(e.data.move);
    }, Math.max(0, 450 - (performance.now() - t0)));
  };
  worker.postMessage({ id, board: G.board, turn: G.turn, level: G.opp });
}

$('#undo').addEventListener('click', () => {
  if (!G || !G.hist.length || thinking) return;
  // Against a bot, step back to your own last turn.
  do {
    const h = G.hist.pop();
    Object.assign(G, { board: h.board, turn: h.turn, quiet: h.quiet, last: h.last, over: null });
  } while (G.opp && G.turn !== G.me && G.hist.length);
  sel = null;
  render();
  maybeBot();
});
$('#flip').addEventListener('click', () => { flipped = !flipped; render(); });
$('#resign').addEventListener('click', () => {
  if (!G || G.over || !confirm(G.opp ? 'Resign this game?' : `Resign for ${NAME[G.turn]}?`)) return;
  reqId++; thinking = false;
  const loser = G.opp ? G.me : G.turn;
  end(loser === 'd' ? 'l' : 'd', 'resigned');
  render();
});
$('#newGame').addEventListener('click', () => {
  if (G && !G.over && G.hist.length && !confirm('Leave this game and start a new one?')) return;
  reqId++; thinking = false; sel = null;
  G = null; save('kx.checkers.game', null);
  showGame();
});

function help() {
  const d = document.createElement('dialog');
  d.className = 'dg-modal';
  d.innerHTML = `<button class="dg-x" aria-label="Close">✕</button><div class="dg-help"><h2 class="ar-display">How to play</h2>
    <p>Move one piece diagonally forward onto an empty dark square. Dark moves first.</p>
    <p><b>Capture</b> by jumping over an enemy piece into the empty square behind it. If you can capture, you <b>must</b>. Keep jumping if another capture follows.</p>
    <p>Reach the far row and your piece becomes a <b>king</b>, which can move and capture backwards too.</p>
    <p>You win when your opponent has no pieces or no legal move. 40 moves each with no capture is a draw.</p>
    <p class="ar-muted">Tap a glowing piece, then tap a dot to move it.</p></div><div class="dg-foot"><span></span><button class="ar-btn">Got it</button></div>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.querySelector('.dg-x').onclick = () => d.close();
  d.querySelector('.dg-foot .ar-btn').onclick = () => d.close();
  d.showModal();
}
$('#helpBtn').addEventListener('click', help);
if (!load('kx.checkers.seenHelp', false)) { save('kx.checkers.seenHelp', true); help(); }

showGame();
