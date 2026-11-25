// Kinetix Chess: bots, Lichess play, Stockfish analysis, Game Review and Learn.
import { Chess, DEFAULT_POSITION } from './vendor/chess.js?v=2';
import { Board, PIECE_SETS } from './board.js?v=5';
import * as snd from './sounds.js?v=1';
import { buildReview, coachNote } from './review.js?v=1';
import { CLASSES, ORDER, badgeSvg } from './badges.js?v=1';
import * as bots from './bots.js?v=1';
import * as book from './openings.js?v=1';
import { createLearn } from './learn.js?v=1';
import { Engine } from './engine.js?v=2';
import * as li from './lichess.js?v=3';
import * as sync from './sync.js?v=3';
import { mountAccount, onAuthChange } from '../shared/account.js?v=5';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── persistence ─────────────────────────────────────────────── */
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or private */ } };
const settings = Object.assign({ engine: 'lite', depth: '20', lines: 3, reviewDepth: 16, elo: 1200, botId: 'mara', board: 'kinetix', pieces: 'cburnett', sound: true, coords: true, anim: true, coach: true, premove: true }, load('arc.chess.settings', {}));
const saveSettings = () => save('arc.chess.settings', settings);
let history = load('arc.chess.games', []);

function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, ms);
}

/* ── sound ───────────────────────────────────────────────────── */
snd.setSound(settings.sound);
function soundFor(r) {
  if (!r) return;
  snd.play(/[+#]/.test(r.san) ? 'check' : r.uci.length > 4 ? 'promote' : r.san.startsWith('O-O') ? 'castle' : r.captured ? 'capture' : 'move');
}

/* ── game state ──────────────────────────────────────────────── */
// moves: [{ san, uci, from, to, fen, captured }] — fen is the position AFTER the move.
const G = {
  mode: 'analysis', // 'bot' | 'online' | 'analysis'
  startFen: DEFAULT_POSITION,
  moves: [],
  cursor: 0,
  orientation: 'white',
  white: { name: 'White' },
  black: { name: 'Black' },
  result: null,
  status: '',
  live: false,
  myColor: null,
  clock: null, // { w, b, inc, turn, since, running }
  review: null,
  historyId: null,
  bot: null,
  online: null, // { id, draw: {w,b}, takeback, gone, chat: [] }
};

const fenAt = (i) => (i === 0 ? G.startFen : G.moves[i - 1].fen);
const curFen = () => fenAt(G.cursor);
const turnOf = (fen) => fen.split(' ')[1];

let posCache = { fen: null, chess: null };
function chessAt(fen) {
  if (posCache.fen !== fen) posCache = { fen, chess: new Chess(fen) };
  return posCache.chess;
}

function playMove(fen, mv) {
  const c = new Chess(fen);
  let m;
  try { m = c.move(mv); } catch { return null; }
  return { san: m.san, uci: m.from + m.to + (m.promotion || ''), from: m.from, to: m.to, fen: c.fen(), captured: !!m.captured };
}

// Lichess may send castling as king-takes-rook (e1h1); chess.js wants e1g1.
function playUci(fen, uci) {
  const mv = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
  let r = playMove(fen, mv);
  if (!r) {
    const alt = { e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' }[uci.slice(0, 4)];
    if (alt) r = playMove(fen, { from: alt.slice(0, 2), to: alt.slice(2, 4) });
  }
  return r;
}

function uciToSanLine(fen, pv, max = 12) {
  const c = new Chess(fen);
  const out = [];
  for (const u of pv.slice(0, max)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(m.san);
    } catch { break; }
  }
  const startNo = Number(fen.split(' ')[5]) || 1;
  const blackFirst = turnOf(fen) === 'b';
  return out.map((san, i) => {
    const isW = blackFirst ? i % 2 === 1 : i % 2 === 0;
    const no = startNo + Math.floor((i + (blackFirst ? 1 : 0)) / 2);
    if (isW) return `${no}. ${san}`;
    return i === 0 ? `${no}… ${san}` : san;
  }).join(' ');
}

function localResult(fen) {
  const c = chessAt(fen);
  if (c.isCheckmate()) return { result: turnOf(fen) === 'w' ? '0-1' : '1-0', status: 'Checkmate' };
  if (c.isStalemate()) return { result: '1/2-1/2', status: 'Stalemate' };
  if (c.isInsufficientMaterial()) return { result: '1/2-1/2', status: 'Insufficient material' };
  if (c.isDrawByFiftyMoves()) return { result: '1/2-1/2', status: 'Fifty-move rule' };
  return null;
}
// Threefold needs the move history, which a FEN-built Chess lacks.
function repetition() {
  const key = (f) => f.split(' ').slice(0, 4).join(' ');
  const last = key(curFen());
  let n = key(G.startFen) === last ? 1 : 0;
  for (let i = 0; i < G.cursor; i++) if (key(G.moves[i].fen) === last) n++;
  return n >= 3;
}
function gameEnd(fen) {
  return localResult(fen) || (repetition() ? { result: '1/2-1/2', status: 'Threefold repetition' } : null);
}

/* ── board ───────────────────────────────────────────────────── */
const board = new Board($('#board'), {
  legal: (sq) => chessAt(boardFen()).moves({ square: sq, verbose: true }),
  onMove: (from, to, promotion) => userMove({ from, to, promotion }),
  premoveDests: (sq) => premoveDests(sq),
  onPremove: (pm) => { G.premove = pm; if (pm) snd.play('premove'); },
  pieceSet: settings.pieces,
});
const boardFen = () => (G.mode === 'learn' ? G.lp.fen : curFen());

// Where a piece could go next turn (premove): pretend it is already our move.
function premoveDests(sq) {
  const parts = lastFen().split(' ');
  parts[1] = G.myColor; parts[3] = '-';
  try {
    return new Chess(parts.join(' ')).moves({ square: sq, verbose: true }).map((m) => m.to);
  } catch {
    return 'abcdefgh'.split('').flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => f + r)).filter((x) => x !== sq);
  }
}
function canPremove() {
  return settings.premove && G.live && (G.mode === 'online' || G.mode === 'bot') && G.cursor === G.moves.length && turnOf(lastFen()) !== G.myColor;
}
// Plays a queued premove once it is our turn (dropped if it became illegal).
function firePremove() {
  const pm = G.premove;
  if (!pm || !G.live || turnOf(lastFen()) !== G.myColor) return;
  G.premove = null;
  board.setPremove(null);
  if (playMove(lastFen(), pm)) setTimeout(() => userMove(pm), 60);
}

function canMove() {
  if (G.mode === 'learn') return !!G.lp?.movable;
  if (G.retry) return true;
  if (G.mode === 'analysis') return !reviewRun;
  if (!G.live || G.cursor !== G.moves.length) return false;
  return turnOf(curFen()) === G.myColor;
}

/* ── evals ───────────────────────────────────────────────────── */
// An eval is white-relative: { cp } or { mate } (mate>0 = white mates;
// |mate| 0.5 marks a finished checkmate).
function whiteEval(line, fen) {
  const s = turnOf(fen) === 'w' ? 1 : -1;
  if (line.mate != null) return { mate: line.mate === 0 ? -s * 0.5 : line.mate * s };
  return { cp: line.cp * s };
}
function terminalEval(fen) {
  const c = chessAt(fen);
  if (c.isCheckmate()) return { mate: turnOf(fen) === 'w' ? -0.5 : 0.5 };
  if (c.isGameOver()) return { cp: 0 };
  return null;
}
function winPct(ev) {
  if (!ev) return 50;
  if (ev.mate != null) return ev.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, ev.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
function fmtEval(ev) {
  if (!ev) return '';
  if (ev.mate != null) {
    if (Math.abs(ev.mate) < 1) return ev.mate > 0 ? '1-0' : '0-1';
    return (ev.mate > 0 ? '#' : '#-') + Math.abs(ev.mate);
  }
  const v = ev.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}

/* ── rendering ───────────────────────────────────────────────── */
function render() {
  syncAnalyzeTab();
  if (G.mode === 'learn') {
    const lp = G.lp;
    board.set({ fen: lp.fen, orientation: lp.orientation, lastMove: lp.lastMove, check: checkSq(lp.fen), movable: !!lp.movable, premovable: false, color: turnOf(lp.fen), arrows: lp.arrows || [], badge: null });
    $('#pTop').innerHTML = ''; $('#pBot').innerHTML = '';
    $('#gameCard').hidden = true; $('#engineCard').hidden = true; $('#evalbar').hidden = true;
    return;
  }
  const fen = curFen();
  const c = chessAt(fen);
  const last = G.cursor > 0 ? G.moves[G.cursor - 1] : null;
  let check = null;
  if (c.inCheck()) {
    const k = c.board().flat().find((p) => p && p.type === 'k' && p.color === c.turn());
    check = k?.square || null;
  }
  const i = G.cursor - 1;
  const cls = i >= 0 ? (G.review?.cls[i] || G.coachCls?.[i]) : null;
  board.set({
    fen, orientation: G.orientation, lastMove: last ? [last.from, last.to] : null, check, movable: canMove(), premovable: canPremove(),
    color: G.live || G.retry ? (G.retry ? turnOf(fen) : G.myColor) : turnOf(fen), arrows: currentArrows(), badge: cls && last ? { square: last.to, cls } : null,
  });
  // Keep a queued premove when it just became our turn: firePremove() plays it right after this render.
  const premoveAlive = settings.premove && G.live && (G.mode === 'online' || G.mode === 'bot') && G.cursor === G.moves.length;
  if (!premoveAlive && G.premove) { G.premove = null; board.setPremove(null); }
  renderPlayers();
  renderMoves();
  renderStatus();
  renderEngineCard();
}

const lastFen = () => (G.moves.length ? G.moves[G.moves.length - 1].fen : G.startFen);
function checkSq(fen) {
  const c = chessAt(fen);
  if (!c.inCheck()) return null;
  return c.board().flat().find((p) => p && p.type === 'k' && p.color === c.turn())?.square || null;
}
// Captured pieces and material lead for one side, from the current position.
const GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
function capturedHtml(color) {
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of curFen().split(' ')[0]) { const t = ch.toLowerCase(); if (have.w[t] != null) have[ch === t ? 'b' : 'w'][t]++; }
  const opp = color === 'w' ? 'b' : 'w';
  const val = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const mat = (c) => Object.entries(have[c]).reduce((s, [t, n]) => s + n * val[t], 0);
  const lead = mat(color) - mat(opp);
  const caps = ['q', 'r', 'b', 'n', 'p'].map((t) => GLYPH[t].repeat(Math.max(0, start[t] - have[opp][t]))).join('');
  return caps || lead > 0 ? `<span class="captured">${caps}${lead > 0 ? `<b>+${lead}</b>` : ''}</span>` : '';
}

function playerHtml(color) {
  const p = color === 'w' ? G.white : G.black;
  const rating = p.rating ? ` <span class="muted">${esc(p.rating)}</span>` : '';
  const title = p.title ? `<span class="title">${esc(p.title)}</span> ` : '';
  const acc = G.review ? `<span class="acc">${G.review.acc[color].toFixed(1)}%</span>` : '';
  const turn = G.live && turnOf(lastFen()) === color;
  const av = p.bot ? bots.avatar(p.bot, 32) : `<span class="dot ${color}"></span>`;
  return `${av}<span class="pname">${title}${esc(p.name)}${rating}</span>${capturedHtml(color)}${acc}<span class="clock ${turn ? 'run' : ''}" data-clock="${color}">${clockText(color)}</span>`;
}
function renderPlayers() {
  const topColor = G.orientation === 'white' ? 'b' : 'w';
  $('#pTop').innerHTML = playerHtml(topColor);
  $('#pBot').innerHTML = playerHtml(topColor === 'w' ? 'b' : 'w');
}

function renderMoves() {
  const el = $('#moves');
  const startNo = Number(G.startFen.split(' ')[5]) || 1;
  const blackFirst = turnOf(G.startFen) === 'b';
  const parts = [];
  G.moves.forEach((m, i) => {
    const ply = i + 1;
    const isWhite = blackFirst ? i % 2 === 1 : i % 2 === 0;
    const no = startNo + Math.floor((i + (blackFirst ? 1 : 0)) / 2);
    if (isWhite) parts.push(`<span class="no">${no}.</span>`);
    else if (i === 0) parts.push(`<span class="no">${no}.</span><span></span>`);
    const cls = G.review?.cls[i] || G.coachCls?.[i];
    const icon = cls && cls !== 'good' ? badgeSvg(cls, 16) : '';
    parts.push(`<button class="mv ${G.cursor === ply ? 'on' : ''}" data-ply="${ply}">${icon}${esc(m.san)}</button>`);
  });
  if (G.result && !G.live) parts.push(`<span class="res">${esc(G.result === '1/2-1/2' ? '½–½' : G.result)}</span>`);
  el.innerHTML = parts.join('') || '<p class="muted small empty">No moves yet.</p>';
  const on = el.querySelector('.mv.on');
  if (on) el.scrollTop = on.offsetTop - el.offsetTop - el.clientHeight / 2;
}

function renderStatus() {
  $('#gameCard').hidden = false;
  const turn = turnOf(lastFen());
  let s = G.status;
  if (!s && G.live) s = turn === G.myColor ? 'Your move' : G.mode === 'bot' ? `${G.bot.name} is thinking…` : 'Waiting for opponent…';
  const op = book.gameOpening([G.startFen, ...G.moves.slice(0, G.cursor).map((m) => m.fen)]);
  $('#opening').textContent = op ? `${op.eco} · ${op.name}` : '';
  if (!s && G.mode === 'analysis') s = G.moves.length ? 'Analysis' : 'Analysis board — move any piece';
  $('#status').textContent = s;
  renderCoach();

  const a = [];
  if (G.mode === 'bot' && G.live) {
    a.push('<button data-act="takeback">Takeback</button>', '<button data-act="resign" class="danger">Resign</button>');
  }
  if (G.mode === 'online' && G.live && G.myColor) {
    const on = G.online;
    const oppDraw = G.myColor === 'w' ? on.draw.b : on.draw.w;
    const myDraw = G.myColor === 'w' ? on.draw.w : on.draw.b;
    if (G.moves.length < 2) a.push('<button data-act="abort">Abort</button>');
    if (oppDraw) a.push('<button data-act="drawyes" class="primary">Accept draw</button><button data-act="drawno">Decline</button>');
    else a.push(`<button data-act="draw" ${myDraw ? 'disabled' : ''}>${myDraw ? 'Draw offered' : 'Offer draw'}</button>`);
    const oppTb = G.myColor === 'w' ? on.takeback.b : on.takeback.w;
    if (oppTb) a.push('<button data-act="tbyes">Accept takeback</button><button data-act="tbno">Decline</button>');
    else if (G.moves.length) a.push('<button data-act="tb">Takeback</button>');
    a.push('<button data-act="oresign" class="danger">Resign</button>');
    if (on.gone) a.push('<button data-act="claim">Claim win</button>');
  }
  if (G.mode === 'online' && G.online) a.push(`<a class="btn" href="${li.HOST}/${esc(G.online.id)}" target="_blank" rel="noopener">Open on Lichess</a>`);
  if (!G.live && G.mode !== 'analysis' && G.moves.length) a.push('<button data-act="analyse" class="primary">Analyse this game</button>');
  if (G.mode === 'bot' && !G.live) a.push('<button data-act="rematch">Rematch</button>');
  $('#actions').innerHTML = a.join('');

  const chatOn = G.mode === 'online' && !!G.online;
  $('#chat').hidden = !chatOn;
  if (chatOn) {
    $('#chatlog').innerHTML = G.online.chat.map((m) => `<p><b>${esc(m.username)}</b> ${esc(m.text)}</p>`).join('');
    $('#chatlog').scrollTop = 1e9;
  }
}

/* ── clocks ──────────────────────────────────────────────────── */
function clockMs(color) {
  const k = G.clock;
  if (!k) return null;
  let ms = k[color];
  if (k.running && k.turn === color) ms -= performance.now() - k.since;
  return Math.max(0, ms);
}
function clockText(color) {
  const ms = clockMs(color);
  if (ms == null) return '';
  if (ms > 86400e3) return `${Math.floor(ms / 86400e3)}d`;
  const s = ms / 1000;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(sec)).padStart(2, '0')}`;
  if (s < 10) return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
  return `${m}:${String(Math.floor(sec)).padStart(2, '0')}`;
}
setInterval(() => {
  if (!G.clock || !G.clock.running) return;
  document.querySelectorAll('[data-clock]').forEach((el) => {
    const col = el.dataset.clock;
    el.textContent = clockText(col);
    el.classList.toggle('low', clockMs(col) < 20000);
  });
  if (G.mode === 'bot' && G.live) {
    const t = G.clock.turn;
    if (clockMs(t) <= 0) finishBot(t === 'w' ? '0-1' : '1-0', `${t === 'w' ? 'White' : 'Black'} ran out of time`);
  }
}, 100);

function clockSwitch(next) {
  const k = G.clock;
  if (!k) return;
  const now = performance.now();
  if (k.running) k[k.turn] = Math.max(0, k[k.turn] - (now - k.since)) + k.inc;
  k.turn = next;
  k.since = now;
  k.running = true;
}

/* ── user moves ──────────────────────────────────────────────── */
function userMove(mv) {
  const fen = boardFen();
  const r = playMove(fen, mv);
  if (!r) return render();
  soundFor(r);
  if (G.mode === 'learn') { const before = G.lp.fen; G.learn.onMove(before, r); return; }
  if (G.retry) {
    const { ply, best, second } = G.retry;
    const good = r.uci === best || (second && r.uci === second);
    if (good) {
      snd.play('correct');
      G.retry = null;
      G.status = `${r.san} is ${r.uci === best ? 'the best move' : 'a strong alternative'}! ✓`;
      G.cursor = ply + 1;
      render();
    } else {
      snd.play('illegal');
      G.status = `${r.san} isn't it. Try again (or use ← → to leave).`;
      board.set({ fen: r.fen, lastMove: [r.from, r.to], movable: false });
      setTimeout(() => { if (G.retry) render(); }, 700);
      $('#status').textContent = G.status;
    }
    return;
  }
  if (G.mode === 'analysis') {
    if (G.cursor < G.moves.length) {
      if (G.moves[G.cursor].uci === r.uci) { G.cursor++; return afterNav(); }
      G.moves = G.moves.slice(0, G.cursor);
      if (G.review) { G.review = null; G.historyId = null; }
      G.result = null;
    }
    G.moves.push(r);
    G.cursor = G.moves.length;
    const end = gameEnd(r.fen);
    G.status = end ? `${end.status} · ${end.result === '1/2-1/2' ? 'Draw' : end.result}` : '';
    return afterNav();
  }
  if (G.mode === 'bot') {
    G.moves.push(r);
    G.cursor = G.moves.length;
    clockSwitch(turnOf(r.fen));
    const end = gameEnd(r.fen);
    if (end) return finishBot(end.result, end.status);
    render();
    botReply();
    return;
  }
  if (G.mode === 'online') {
    G.moves.push(r);
    G.cursor = G.moves.length;
    render();
    const id = G.online.id;
    li.api(`/api/board/game/${id}/move/${r.uci}`, { method: 'POST' }).catch((e) => {
      toast(`Move refused: ${e.message}`);
      if (G.online?.id === id && G.moves[G.moves.length - 1] === r) { G.moves.pop(); G.cursor = G.moves.length; render(); }
    });
  }
}

/* ── bots ────────────────────────────────────────────────────── */
// The bot being played (a roster character, a custom Elo, or "match my level").
function botFor(id, elo) {
  if (id === 'match') { const r = bots.myRating(); return { id: 'match', name: 'Mirror', elo: r, color: '#d4ff3f', face: 'smile', style: 'universal', bio: `Plays at your estimated level (${r}). It adapts after every game.`, book: [], say: { start: ['Let’s see how you’ve improved.'], capture: ['Hm.'], check: ['Check.'], win: ['Close one.'], lose: ['You’re getting stronger.'], draw: ['Even match.'] } }; }
  if (id === 'custom') return { id: 'custom', name: `Stockfish ${elo}`, elo, color: '#9aa0b4', face: 'robot', style: 'universal', bio: 'Stockfish at the strength you set.', book: [], say: {} };
  return bots.byId(id) || bots.BOTS[3];
}
function botSay(kind) {
  const line = bots.pick(G.bot?.say?.[kind]);
  if (!line) return;
  G.speech = { who: G.bot, text: line };
  renderCoach();
}
function renderCoach() {
  const el = $('#coach');
  const c = G.coachMsg && G.coachMsg.ply === G.cursor ? G.coachMsg : null;
  if (c && settings.coach) {
    el.hidden = false;
    el.innerHTML = `${badgeSvg(c.cls, 24)}<p><b>Coach:</b> ${esc(c.text)}</p>`;
  } else if (G.mode === 'bot' && G.speech && G.bot) {
    el.hidden = false;
    el.innerHTML = `${bots.avatar(G.bot, 30)}<p><b>${esc(G.bot.name)}:</b> ${esc(G.speech.text)}</p>`;
  } else el.hidden = true;
}

let engine = null;
function getEngine() {
  if (!engine || engine.kind !== settings.engine) {
    engine?.terminate();
    const eng = new Engine(settings.engine);
    engine = eng;
    $('#engInfo').textContent = '';
    eng.onProgress = (p) => { $('#engInfo').textContent = `Downloading engine… ${Math.round(p.percent * 100)}%`; };
    eng.ready.then(
      () => { if (engine === eng) $('#engInfo').textContent = ''; },
      (e) => {
        if (engine !== eng) return;
        toast(`Engine failed to load (${e.message}).${eng.kind === 'full' ? ' Switched back to Lite.' : ''}`, 6000);
        engine = null;
        if (eng.kind === 'full') { settings.engine = 'lite'; saveSettings(); $('#engKind').value = 'lite'; analysedFen = null; analyse(); }
      },
    );
  }
  return engine;
}

function startBot(id, colorPref, clock) {
  stopAnalysis();
  leaveOnline();
  const bot = botFor(id, settings.elo);
  const myColor = colorPref === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : colorPref;
  const me = { name: account ? account.username : 'You' };
  const bp = { name: bot.name, rating: bot.elo, bot };
  Object.assign(G, {
    mode: 'bot', startFen: DEFAULT_POSITION, moves: [], cursor: 0,
    orientation: myColor === 'w' ? 'white' : 'black',
    white: myColor === 'w' ? me : bp, black: myColor === 'w' ? bp : me,
    result: null, status: '', live: true, myColor, review: null, historyId: null,
    bot: { ...bot, colorPref, clockSpec: clock }, online: null, premove: null, coachCls: [], coachMsg: null, coachPrev: null, speech: null,
  });
  if (clock && clock !== '0') {
    const [m, inc] = clock.split('+').map(Number);
    G.clock = { w: m * 60e3, b: m * 60e3, inc: inc * 1000, turn: 'w', since: performance.now(), running: false };
  } else G.clock = null;
  showTab('play', true);
  render();
  botSay('start');
  if (myColor === 'b') botReply();
}

async function botReply() {
  const gameRef = G.moves;
  const plies = G.moves.length;
  const fen = lastFen();
  const t0 = performance.now();
  const bot = G.bot;
  let uci = null;
  let res = null;
  try {
    // The bot's search also tells the coach how good your last move was.
    res = await getEngine().search(fen, { ...bots.searchOpts(bot.elo), multipv: settings.coach || bot.elo < 3150 ? 3 : 1 });
  } catch (e) {
    toast(`Bot engine error: ${e.message}`);
    return;
  }
  const stale = () => G.moves !== gameRef || G.moves.length !== plies || !G.live || G.mode !== 'bot';
  if (!res || stale()) return;
  if (res.lines?.[0] && plies > 0) coachOnLastMove(fen, res);
  uci = bots.bookMove(bot, fen) || bots.chooseLine(bot, res.lines, chessAt(fen)) || res.best;
  const wait = 450 - (performance.now() - t0);
  if (wait > 0) await sleep(wait);
  if (stale()) return;
  const r = uci && playUci(fen, uci);
  if (!r) return;
  const line = res.lines?.find((l) => l.pv[0] === uci);
  G.coachPrev = line ? { fen: r.fen, eval: whiteEval(line, fen), best: line.pv[1], pv: line.pv.slice(1) } : null;
  const atEnd = G.cursor === G.moves.length;
  G.moves.push(r);
  if (atEnd) G.cursor = G.moves.length;
  soundFor(r);
  if (r.captured && Math.random() < 0.5) botSay('capture');
  else if (/\+/.test(r.san) && Math.random() < 0.5) botSay('check');
  clockSwitch(turnOf(r.fen));
  const end = gameEnd(r.fen);
  if (end) return finishBot(end.result, end.status);
  render();
  firePremove();
}

// Grades the move you just played using the bot's two searches.
function coachOnLastMove(fen, res) {
  const i = G.moves.length - 1;
  const mv = G.moves[i];
  const prev = G.coachPrev;
  if (!mv || !prev || prev.fen !== fenAt(i) || turnOf(fenAt(i)) !== G.myColor) return;
  const A = { eval: whiteEval(res.lines[0], fen), best: res.lines[0].pv[0], pv: res.lines[0].pv };
  const note = coachNote(fenAt(i), mv, prev, A);
  G.coachCls[i] = note.cls;
  if (['inaccuracy', 'mistake', 'blunder'].includes(note.cls) || note.cls === 'best' && Math.random() < 0.35) {
    G.coachMsg = { ply: i + 1, cls: note.cls, text: note.text };
  }
  renderMoves();
  renderCoach();
}

function finishBot(result, why) {
  if (!G.live) return;
  G.live = false;
  G.premove = null;
  if (G.clock) { G.clock[G.clock.turn] = clockMs(G.clock.turn); G.clock.running = false; }
  G.result = result;
  const won = (result === '1-0' && G.myColor === 'w') || (result === '0-1' && G.myColor === 'b');
  const drawn = result === '1/2-1/2';
  G.status = `${why} · ${drawn ? 'Draw' : won ? 'You won' : `${G.bot.name} won`}`;
  const before = bots.myRating();
  const after = bots.updateRating(G.bot.elo, drawn ? 0.5 : won ? 1 : 0);
  G.status += ` · your level ${before} → ${after}`;
  snd.play(drawn ? 'end' : won ? 'win' : 'lose');
  botSay(drawn ? 'draw' : won ? 'lose' : 'win');
  engine?.stop();
  saveGame('bot');
  render();
  renderBots();
}

/* ── history ─────────────────────────────────────────────────── */
function saveGame(source, extra = {}) {
  if (G.moves.length < 2) return;
  const id = G.historyId || `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  G.historyId = id;
  const prev = history.find((h) => h.id === id);
  const entry = {
    id, date: prev?.date || Date.now(), source,
    white: G.white, black: G.black, result: G.result || '*', myColor: G.myColor || prev?.myColor || null,
    startFen: G.startFen, ucis: G.moves.map((m) => m.uci), review: G.review,
    lichessId: G.online?.id || extra.lichessId || prev?.lichessId || null, status: G.status,
  };
  history = [entry, ...history.filter((h) => h.id !== id && (!entry.lichessId || h.lichessId !== entry.lichessId))].slice(0, 150);
  save('arc.chess.games', history);
  renderHistory();
}

function loadGameInto(entry, { review = false } = {}) {
  if (blockIfInGame()) return;
  stopAnalysis();
  leaveOnline();
  const startFen = entry.startFen || DEFAULT_POSITION;
  const moves = [];
  let fen = startFen;
  for (const u of entry.ucis) {
    const r = playUci(fen, u);
    if (!r) break;
    moves.push(r);
    fen = r.fen;
  }
  Object.assign(G, {
    mode: 'analysis', startFen, moves, cursor: moves.length,
    white: entry.white || { name: 'White' }, black: entry.black || { name: 'Black' },
    result: entry.result && entry.result !== '*' ? entry.result : null, status: entry.status || '',
    live: false, myColor: entry.myColor || null, clock: null,
    review: entry.review?.v === 2 && entry.review.evals?.length === moves.length + 1 ? entry.review : null,
    historyId: entry.id || null, bot: null, online: null, coachCls: [], coachMsg: null, speech: null, premove: null, retry: null,
  });
  G.orientation = entry.myColor === 'b' ? 'black' : 'white';
  showTab('analyze', true);
  render();
  if (review && !G.review) runReview();
}

function renderHistory() {
  const el = $('#history');
  if (!history.length) { el.innerHTML = '<p class="muted small">Games you play or review here are saved on this device.</p>'; return; }
  el.innerHTML = history.map((h) => {
    const acc = h.review ? `<span class="muted small">${h.review.acc.w.toFixed(0)}% · ${h.review.acc.b.toFixed(0)}%</span>` : '<span class="muted small">not reviewed</span>';
    const res = h.result === '1/2-1/2' ? '½–½' : h.result || '*';
    return `<div class="item" data-hid="${esc(h.id)}"><div><b>${esc(h.white?.name)}</b> vs <b>${esc(h.black?.name)}</b> <span class="res">${esc(res)}</span><br><span class="muted small">${esc(h.source)} · ${new Date(h.date).toLocaleDateString()} · ${Math.ceil(h.ucis.length / 2)} moves</span></div>${acc}<button class="x" data-del="${esc(h.id)}" aria-label="Delete">✕</button></div>`;
  }).join('');
}
$('#history').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    history = history.filter((h) => h.id !== del.dataset.del);
    save('arc.chess.games', history);
    renderHistory();
    return;
  }
  const it = e.target.closest('[data-hid]');
  if (it) loadGameInto(history.find((h) => h.id === it.dataset.hid));
});

/* ── live analysis ───────────────────────────────────────────── */
let engineOn = false;
let liveLines = null; // { fen, lines, depth, term? }
let analysedFen = null;
let cloud = null; // { fen, data }
let reviewRun = null;

// Fair play: no engine, explorer or analysis board while you have a game going
// here or on Lichess (G.live covers bot and online games on screen; lichessOngoing
// covers Lichess games you navigated away from).
let lichessOngoing = 0;
const inGame = () => (G.live && (G.mode === 'bot' || G.mode === 'online')) || lichessOngoing > 0;
const analysisAllowed = () => !G.live && G.mode !== 'learn' && !inGame();
function blockIfInGame() {
  if (!inGame()) return false;
  toast('Analysis is off while you have a game going. Finish or resign it first.', 3500);
  return true;
}

function stopAnalysis() {
  analysedFen = null;
  liveLines = null;
  if (engine && !reviewRun) engine.stop();
}

function analyse() {
  if (!engineOn || !analysisAllowed() || reviewRun) return;
  const fen = curFen();
  if (analysedFen === fen) return;
  analysedFen = fen;
  liveLines = { fen, lines: [], depth: 0 };
  const term = terminalEval(fen);
  if (term) { engine?.stop(); liveLines.term = term; renderEngineCard(); return; }
  const depth = settings.depth === 'inf' ? null : Number(settings.depth);
  getEngine().search(fen, {
    depth, infinite: !depth, multipv: Number(settings.lines), hash: 64,
    onInfo: (lines, d) => {
      if (analysedFen !== fen) return;
      liveLines = { fen, lines, depth: d };
      renderEngineCard();
      board.set({ arrows: currentArrows() });
    },
  }).catch((e) => toast(`Engine error: ${e.message}`));
  fetchCloud(fen);
}

async function fetchCloud(fen) {
  cloud = { fen, data: null };
  try {
    const q = new URLSearchParams({ fen, multiPv: String(settings.lines) });
    const res = await fetch(`${li.HOST}/api/cloud-eval?${q}`);
    if (!res.ok) return;
    const data = await res.json();
    if (cloud.fen === fen) { cloud.data = data; renderEngineCard(); }
  } catch { /* offline or not in the cloud */ }
}

function currentArrows() {
  const arrows = [];
  const fen = curFen();
  if (G.review && G.cursor > 0) {
    const i = G.cursor - 1;
    const best = G.review.best[i];
    if (best && !G.retry && ['inaccuracy', 'mistake', 'blunder', 'miss', 'good', 'excellent'].includes(G.review.cls[i])) {
      arrows.push({ from: best.slice(0, 2), to: best.slice(2, 4), color: 'rgba(129,182,76,.9)' });
    }
  }
  if (engineOn && analysisAllowed() && liveLines && liveLines.fen === fen && liveLines.lines) {
    liveLines.lines.slice(0, 3).forEach((l, i) => {
      const u = l.pv[0];
      if (u) arrows.push({ from: u.slice(0, 2), to: u.slice(2, 4), color: i === 0 ? 'rgba(21,160,60,.85)' : 'rgba(21,160,60,.45)', width: i === 0 ? 16 : 11 });
    });
  }
  return arrows;
}

function renderEngineCard() {
  const card = $('#engineCard');
  card.hidden = !analysisAllowed();
  const bar = $('#evalbar');
  bar.hidden = !(analysisAllowed() && (engineOn || G.review));
  if (card.hidden) return;
  const fen = curFen();
  let top = null;
  if (engineOn && liveLines?.fen === fen) {
    if (liveLines.term) top = liveLines.term;
    else if (liveLines.lines[0]) top = whiteEval(liveLines.lines[0], fen);
  }
  if (!top && G.review) top = G.review.evals[G.cursor];
  bar.querySelector('.fill').style.height = `${winPct(top)}%`;
  bar.querySelector('.num').textContent = fmtEval(top);
  bar.classList.toggle('flip', G.orientation === 'black');

  const linesEl = $('#lines');
  if (!engineOn) {
    linesEl.innerHTML = '<p class="muted small">Turn the engine on for live Stockfish lines.</p>';
    $('#cloud').textContent = '';
  } else if (liveLines?.fen === fen) {
    if (liveLines.term) linesEl.innerHTML = `<p class="muted small">Game over — ${esc(fmtEval(liveLines.term))}</p>`;
    else if (!liveLines.lines.length) {
      linesEl.innerHTML = `<p class="muted small">${engine?.booted ? 'Thinking…' : 'Loading engine — the full one can take a minute the first time…'}</p>`;
    }
    else {
      const nps = liveLines.lines[0]?.nps;
      $('#engInfo').textContent = `depth ${liveLines.depth}${nps ? ` · ${Math.round(nps / 1000)}k nodes/s` : ''}`;
      linesEl.innerHTML = liveLines.lines.map((l, i) => {
        const ev = whiteEval(l, fen);
        return `<button class="line" data-line="${i}"><b class="${winPct(ev) >= 50 ? 'pos' : 'neg'}">${esc(fmtEval(ev))}</b> ${esc(uciToSanLine(fen, l.pv))}</button>`;
      }).join('');
    }
    const cd = cloud?.fen === fen && cloud.data;
    if (cd && cd.pvs?.[0]) {
      const p = cd.pvs[0];
      const ev = p.mate != null ? { mate: p.mate } : { cp: p.cp };
      $('#cloud').innerHTML = `☁ Lichess cloud · depth ${esc(cd.depth)} · <b>${esc(fmtEval(ev))}</b> ${esc(uciToSanLine(fen, p.moves.split(' '), 8))}`;
    } else $('#cloud').textContent = '';
  }
  renderReviewOut();
  renderBook();
}

// Opening explorer: named book continuations from the current position.
function renderBook() {
  const el = $('#book');
  if (!el || G.mode !== 'analysis') return;
  const fen = curFen();
  const cont = book.continuations(fen);
  if (!cont.length) { el.innerHTML = `<p class="muted small">${book.nameOf(fen) ? `${esc(book.nameOf(fen).name)}: end of the named lines.` : 'Out of the opening book.'}</p>`; return; }
  el.innerHTML = cont.slice(0, 20).map((c) => `<button data-bk="${c.uci}"><b>${esc(playUci(fen, c.uci)?.san || c.uci)}</b><span>${esc(c.name ? `${c.name.eco} ${c.name.name}` : '')}</span></button>`).join('');
}
$('#book').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bk]');
  if (b) userMove({ from: b.dataset.bk.slice(0, 2), to: b.dataset.bk.slice(2, 4), promotion: b.dataset.bk[4] });
});

$('#lines').addEventListener('click', (e) => {
  const b = e.target.closest('[data-line]');
  if (!b || !liveLines?.lines) return;
  const u = liveLines.lines[+b.dataset.line]?.pv[0];
  if (u) userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
});

/* ── Game Review ─────────────────────────────────────────────── */
async function runReview() {
  if (reviewRun) { reviewRun.cancel = true; engine?.stop(); return; }
  if (!G.moves.length) return toast('Make or load some moves first.');
  const depth = Number(settings.reviewDepth);
  const run = { cancel: false, done: 0, total: G.moves.length + 1, moves: G.moves };
  reviewRun = run;
  G.retry = null;
  analysedFen = null;
  render();
  const positions = [];
  try {
    const eng = getEngine();
    book.load().catch(() => {});
    for (let p = 0; p <= run.moves.length; p++) {
      if (run.cancel || G.moves !== run.moves) { run.cancel = true; break; }
      const fen = fenAt(p);
      const term = terminalEval(fen);
      if (term) positions[p] = { eval: term, best: null, pv: [], second: null };
      else {
        const res = await eng.search(fen, { depth, multipv: 2, hash: 64 });
        if (!res || run.cancel) { run.cancel = true; break; }
        const [a, b] = res.lines;
        positions[p] = {
          eval: a ? whiteEval(a, fen) : { cp: 0 }, best: res.best, pv: a?.pv || [],
          second: b?.pv?.[0] ? { eval: whiteEval(b, fen), uci: b.pv[0] } : null,
        };
      }
      run.done = p + 1;
      renderReviewOut();
    }
  } catch (e) {
    toast(`Review failed: ${e.message}`);
    run.cancel = true;
  }
  reviewRun = null;
  if (run.cancel || G.moves !== run.moves) { render(); analyse(); return; }
  await book.load().catch(() => {});
  G.review = buildReview({ startFen: G.startFen, moves: G.moves, positions, depth, isBook: (f) => book.inBook(f), openingOf: (fens) => book.gameOpening(fens) });
  saveGame(history.find((h) => h.id === G.historyId)?.source || 'analysis');
  snd.play('notify');
  render();
  analyse();
}

function renderReviewOut() {
  const out = $('#reviewOut');
  $('#reviewBtn').textContent = reviewRun ? 'Stop review' : G.review ? 'Re-run review' : 'Game Review';
  if (reviewRun) {
    const pct = Math.round((reviewRun.done / reviewRun.total) * 100);
    out.innerHTML = `<h3>Game Review</h3><div class="progress"><div style="width:${pct}%"></div></div><p class="muted small">Checking every move with Stockfish: position ${reviewRun.done} of ${reviewRun.total}…</p>`;
    return;
  }
  const r = G.review;
  if (!r) {
    out.innerHTML = G.moves.length ? '<h3>Game Review</h3><p class="muted small">Get your accuracy, every move graded from brilliant to blunder, and plain-English explanations of what went wrong.</p>' : '';
    return;
  }
  const side = (i) => turnOf(fenAt(i));
  const count = (color, c) => r.cls.filter((x, i) => x === c && side(i) === color).length;
  const rows = ORDER.map((c) => { const w = count('w', c), b = count('b', c); return `<tr class="${w + b ? '' : 'zero'}"><td>${w}</td><th>${badgeSvg(c, 18)}${CLASSES[c].label}</th><td>${b}</td></tr>`; }).join('');
  const i = G.cursor - 1;
  const c = i >= 0 ? r.cls[i] : null;
  const note = i >= 0 && c ? `<div class="rv-note" style="--c:${CLASSES[c].color}">${badgeSvg(c, 24)}<p>${esc(r.notes?.[i] || '')}</p></div>` : '<p class="muted small">Step through the game with ← → or click any move. Each move gets a badge and an explanation.</p>';
  const canRetry = i >= 0 && ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(c) && r.best[i];
  const showBest = i >= 0 && r.best[i] && r.best[i] !== G.moves[i].uci;
  const moments = (r.moments || []).map((ply) => `<button data-ply="${ply}">${badgeSvg(r.cls[ply - 1], 16)}${Math.ceil(ply / 2)}${side(ply - 1) === 'w' ? '.' : '…'} ${esc(G.moves[ply - 1]?.san || '')}</button>`).join('');
  out.innerHTML = `
    <h3>Game Review${r.opening ? ` <span class="muted small">· ${esc(r.opening.name)}</span>` : ''}</h3>
    <div class="rv-head"><div class="rv-acc w"><b>${r.acc.w.toFixed(1)}</b><span>${esc(G.white.name)}</span></div><span class="rv-mid">Accuracy</span><div class="rv-acc b"><b>${r.acc.b.toFixed(1)}</b><span>${esc(G.black.name)}</span></div></div>
    ${graphSvg(r)}
    ${note}
    <div class="rv-btns">${canRetry ? '<button class="btn primary" data-rv="retry">Retry this move</button>' : ''}${showBest ? '<button class="btn" data-rv="line">Show best line</button>' : ''}<button class="btn" data-rv="next">Next mistake →</button></div>
    ${moments ? `<p class="muted small">Key moments</p><div class="rv-moments">${moments}</div>` : ''}
    <table class="rv-counts">${rows}</table>
    <p class="muted small">Depth ${esc(r.depth)} · average loss ${r.acpl.w.toFixed(0)} / ${r.acpl.b.toFixed(0)} centipawns.</p>`;
}

function graphSvg(r) {
  const W = 300; const H = 70; const n = r.evals.length - 1 || 1;
  const y = (ev) => (H - (winPct(ev) / 100) * H).toFixed(1);
  const pts = r.evals.map((ev, i) => `${((i / n) * W).toFixed(1)},${y(ev)}`);
  const marks = r.cls.map((c, i) => (['mistake', 'blunder', 'miss', 'brilliant', 'great'].includes(c) ? `<circle cx="${(((i + 1) / n) * W).toFixed(1)}" cy="${y(r.evals[i + 1])}" r="3" fill="${CLASSES[c].color}"/>` : '')).join('');
  const cx = ((G.cursor / n) * W).toFixed(1);
  return `<svg class="graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Evaluation graph"><rect width="${W}" height="${H}" class="bg"/><path d="M0,${H} L${pts.join(' L')} L${W},${H} Z" class="area"/><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="mid"/><line x1="${cx}" x2="${cx}" y1="0" y2="${H}" class="cur"/>${marks}</svg>`;
}
$('#reviewOut').addEventListener('click', (e) => {
  const svg = e.target.closest('svg.graph');
  if (svg && G.review) {
    const r = svg.getBoundingClientRect();
    goto(Math.round(((e.clientX - r.left) / r.width) * (G.review.evals.length - 1)));
    return;
  }
  const ply = e.target.closest('[data-ply]');
  if (ply) { goto(Number(ply.dataset.ply)); return; }
  const a = e.target.closest('[data-rv]')?.dataset.rv;
  if (!a || !G.review) return;
  const i = G.cursor - 1;
  if (a === 'retry') {
    G.retry = { ply: i, best: G.review.best[i], second: G.review.second?.[i] };
    G.cursor = i;
    G.status = `Retry: find a better move for ${turnOf(fenAt(i)) === 'w' ? 'White' : 'Black'}.`;
    render();
  } else if (a === 'line') playBestLine(i);
  else if (a === 'next') {
    const bad = ['inaccuracy', 'mistake', 'blunder', 'miss'];
    const mine = G.myColor;
    let k = G.review.cls.findIndex((c, x) => x > i && bad.includes(c) && (!mine || turnOf(fenAt(x)) === mine));
    if (k < 0) k = G.review.cls.findIndex((c, x) => bad.includes(c) && (!mine || turnOf(fenAt(x)) === mine));
    if (k < 0) toast('No mistakes to show. Clean game!'); else goto(k + 1);
  }
});

// Animates the engine's best line from the position before move i, then returns.
let lineTimer = null;
function playBestLine(i) {
  clearTimeout(lineTimer);
  const pv = (G.review.pv?.[i] || [G.review.best[i]]).slice(0, 8);
  let fen = fenAt(i);
  const steps = [];
  for (const u of pv) { const r = playUci(fen, u); if (!r) break; steps.push(r); fen = r.fen; }
  let k = 0;
  const back = G.cursor;
  const tick = () => {
    if (k >= steps.length) { lineTimer = setTimeout(() => { G.status = ''; goto(back); }, 1200); return; }
    const r = steps[k++];
    soundFor(r);
    board.set({ fen: r.fen, lastMove: [r.from, r.to], arrows: [], badge: null, movable: false });
    G.status = `Best line: ${steps.slice(0, k).map((x) => x.san).join(' ')}`;
    $('#status').textContent = G.status;
    lineTimer = setTimeout(tick, 750);
  };
  tick();
}

/* ── navigation ──────────────────────────────────────────────── */
function goto(ply) {
  if (G.retry) { G.retry = null; G.status = ''; }
  clearTimeout(lineTimer);
  G.cursor = Math.max(0, Math.min(G.moves.length, ply));
  afterNav();
}
function afterNav() {
  render();
  analyse();
}
function flip() {
  G.orientation = G.orientation === 'white' ? 'black' : 'white';
  render();
}
document.querySelector('.navbtns').addEventListener('click', (e) => {
  const b = e.target.closest('[data-nav]');
  if (!b) return;
  const n = b.dataset.nav;
  if (n === 'flip') return flip();
  goto(n === 'start' ? 0 : n === 'prev' ? G.cursor - 1 : n === 'next' ? G.cursor + 1 : G.moves.length);
});
$('#moves').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ply]');
  if (b) goto(Number(b.dataset.ply));
});
// Swipe left/right (touch) to step through moves. On the board itself only
// when it is not your move, so dragging pieces never fights the swipe.
(() => {
  let sx = 0, sy = 0, ok = false;
  const col = document.querySelector('.board-col');
  col.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    ok = e.touches.length === 1 && (!e.target.closest('#board') || !canMove()) && G.mode !== 'learn';
  }, { passive: true });
  col.addEventListener('touchend', (e) => {
    if (!ok) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 40) goto(G.cursor + (dx < 0 ? 1 : -1));
  }, { passive: true });
})();

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  if (G.mode === 'learn') return;
  if (e.key === 'ArrowLeft') goto(G.cursor - 1);
  else if (e.key === 'ArrowRight') goto(G.cursor + 1);
  else if (e.key === 'ArrowUp' || e.key === 'Home') goto(0);
  else if (e.key === 'ArrowDown' || e.key === 'End') goto(G.moves.length);
  else if (e.key === 'f' || e.key === 'F') flip();
  else return;
  e.preventDefault();
});

/* ── game-card actions ───────────────────────────────────────── */
$('#actions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const gid = G.online?.id;
  const post = (path) => li.api(`/api/board/game/${gid}/${path}`, { method: 'POST' }).catch((err) => toast(err.message));
  switch (act) {
    case 'resign':
      if (confirm('Resign this game?')) finishBot(G.myColor === 'w' ? '0-1' : '1-0', 'You resigned');
      break;
    case 'takeback': {
      engine?.stop();
      // Undo back to the last position where it was my move.
      do { G.moves.pop(); } while (G.moves.length && turnOf(lastFen()) !== G.myColor);
      if (turnOf(lastFen()) !== G.myColor) G.moves = [];
      G.cursor = G.moves.length;
      if (G.clock) { G.clock.turn = turnOf(lastFen()); G.clock.since = performance.now(); }
      render();
      if (turnOf(lastFen()) !== G.myColor) botReply();
      break;
    }
    case 'rematch': startBot(G.bot.id, G.bot.colorPref, G.bot.clockSpec); break;
    case 'analyse': {
      const entry = history.find((h) => h.id === G.historyId) || {
        startFen: G.startFen, ucis: G.moves.map((m) => m.uci), white: G.white, black: G.black, result: G.result, status: G.status, myColor: G.myColor,
      };
      engineOn = true;
      $('#engOn').checked = true;
      loadGameInto(entry, { review: true });
      break;
    }
    case 'abort': post('abort'); break;
    case 'oresign': if (confirm('Resign this game?')) post('resign'); break;
    case 'draw': case 'drawyes': post('draw/yes'); break;
    case 'drawno': post('draw/no'); break;
    case 'tb': case 'tbyes': post('takeback/yes'); break;
    case 'tbno': post('takeback/no'); break;
    case 'claim': post('claim-victory'); break;
    default: break;
  }
});

$('#chatIn').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !G.online) return;
  const text = e.target.value.trim();
  if (!text) return;
  e.target.value = '';
  li.api(`/api/board/game/${G.online.id}/chat`, { method: 'POST', form: { room: 'player', text } }).catch((err) => toast(err.message));
});

/* ── Lichess online play ─────────────────────────────────────── */
let account = null;
let eventsAbort = null;
let gameAbort = null;
let seekAbort = null;
const challenges = new Map();

const TCS = [
  { label: '3+2', t: 3, i: 2 }, { label: '5+3', t: 5, i: 3 }, { label: '10+0', t: 10, i: 0 }, { label: '10+5', t: 10, i: 5 },
  { label: '15+10', t: 15, i: 10 }, { label: '30+0', t: 30, i: 0 }, { label: '30+20', t: 30, i: 20 },
];
const speedOf = (tc) => (tc.t * 60 + tc.i * 40 < 480 ? 'Blitz' : tc.t * 60 + tc.i * 40 < 1500 ? 'Rapid' : 'Classical');

function fillTcSelect(sel, withCorr) {
  sel.innerHTML = TCS.map((tc, i) => `<option value="${i}" ${tc.label === '10+0' ? 'selected' : ''}>${tc.label}</option>`).join('')
    + (withCorr ? '<option value="d3">3 days / move</option>' : '');
}
fillTcSelect($('#chTc'), true);
fillTcSelect($('#aiTc'), false);
// Lichess only allows Rapid and Classical seeks from outside apps (Blitz works for challenges and the AI).
$('#pool').innerHTML = TCS.map((tc, i) => speedOf(tc) === 'Blitz' ? '' : `<button data-seek="${i}"><b>${tc.label}</b><span>${speedOf(tc)}</span></button>`).join('');

function tcForm(val) {
  if (val === 'd3') return { days: 3 };
  const tc = TCS[Number(val)];
  return { 'clock.limit': tc.t * 60, 'clock.increment': tc.i };
}

// The saved key (arc.chess.token) is the connection; the profile is cached in
// arc.chess.account so the page shows you connected instantly on every visit.
// Only a 401 on /api/account — Lichess saying the key itself is dead —
// disconnects. Offline, rate limits and outages keep you connected and retry.
let accountRetry = null;
let hubUser = null; // signed-in Arcade user on this device, if any
let cloudToken; // key saved in the Arcade account; undefined = not checked
let freshLogin = false; // this device just finished connecting: its key wins

// Another device connected (or switched) Lichess: adopt the key saved in the
// Arcade account. The account is the source of truth whenever it has one.
async function syncFromCloud() {
  hubUser = await sync.user().catch(() => null);
  renderSyncNote();
  if (!hubUser) return;
  let row;
  try { row = await sync.pull(); } catch (e) { console.warn('[arcade-chess] sync', e); return; }
  cloudToken = row?.lichess_token || null;
  if (cloudToken && cloudToken !== li.token && !freshLogin) {
    li.setToken(cloudToken);
    account = null;
    save('arc.chess.account', null);
  }
}

// After this device connects or confirms a key, save it to the Arcade account.
function pushToCloud() {
  if (!hubUser || !li.token || !account || cloudToken === li.token) return;
  const t = li.token;
  sync.push(t, account.username).then(() => { cloudToken = t; renderSyncNote(); }, (e) => console.warn('[arcade-chess] sync', e));
}

function renderSyncNote() {
  const el = $('#syncNote');
  if (!el) return;
  if (hubUser) {
    el.textContent = account
      ? 'Saved to your Kinetix account — connected on every device where you\'re signed in.'
      : 'Connect once and it follows your Kinetix account to your other devices.';
  } else {
    el.textContent = 'Tip: sign in to Kinetix (top right) and your Lichess connection follows you to your phone and iPad.';
  }
}

async function refreshAccount() {
  clearTimeout(accountRetry);
  await syncFromCloud();
  if (!li.token) { account = null; save('arc.chess.account', null); renderAccount(); return; }
  if (!account) account = load('arc.chess.account', null);
  renderAccount();
  if (account) startEvents();
  try {
    account = await li.api('/api/account');
    save('arc.chess.account', account);
  } catch (e) {
    if (e.status === 401) {
      const dead = li.token;
      li.forget();
      if (hubUser) sync.drop(dead).catch(() => {});
      cloudToken = undefined;
      account = null;
      save('arc.chess.account', null);
      eventsAbort?.abort();
      eventsAbort = null;
      renderAccount();
      toast('Lichess ended this connection (expired or revoked) — connect again.', 6000);
      return;
    }
    accountRetry = setTimeout(refreshAccount, 15000);
    if (!account) $('#acct').innerHTML = '<span class="muted small">Reconnecting to Lichess…</span>';
    return;
  }
  renderAccount();
  pushToCloud();
  startEvents();
  refreshPlaying();
}

function renderAccount() {
  const on = !!account;
  $('#liOut').hidden = on;
  $('#liIn').hidden = !on;
  const p = account?.perfs || {};
  $('#acct').innerHTML = on
    ? `<a href="${li.HOST}/@/${esc(account.username)}" target="_blank" rel="noopener" title="Blitz ${esc(p.blitz?.rating ?? '?')} · Rapid ${esc(p.rapid?.rating ?? '?')} · Classical ${esc(p.classical?.rating ?? '?')}">${esc(account.username)} <span class="muted">${esc(p.rapid?.rating ?? '')}</span></a><button class="link" id="liLogout">Log out</button>`
    : '<button class="link" id="liLogin2">Connect Lichess</button>';
  if (on && !$('#impUser').value) $('#impUser').value = account.username;
  renderSyncNote();
}

async function startEvents() {
  if (eventsAbort) return;
  eventsAbort = new AbortController();
  const { signal } = eventsAbort;
  while (!signal.aborted && li.token) {
    try {
      await li.stream('/api/stream/event', onEvent, { signal });
    } catch (e) {
      if (signal.aborted) break;
      console.warn('[lichess] event stream', e);
    }
    await sleep(3000);
  }
}

function onEvent(ev) {
  if (ev.type === 'gameStart') {
    stopSeek();
    const id = ev.game.gameId || ev.game.id;
    for (const [cid, c] of challenges) if (c.id === id || cid === id) challenges.delete(cid);
    renderChallenges();
    if (G.online?.id !== id && !(G.live && G.mode === 'online')) openOnline(id);
    refreshPlaying();
  } else if (ev.type === 'gameFinish') {
    refreshPlaying();
  } else if (ev.type === 'challenge') {
    challenges.set(ev.challenge.id, ev.challenge);
    renderChallenges();
  } else if (ev.type === 'challengeCanceled' || ev.type === 'challengeDeclined') {
    const c = challenges.get(ev.challenge.id);
    challenges.delete(ev.challenge.id);
    if (ev.type === 'challengeDeclined' && c && c.challenger?.id === account?.id) toast(`${c.destUser?.name || 'They'} declined your challenge.`);
    renderChallenges();
  }
}

function renderChallenges() {
  const me = account?.id;
  $('#incoming').innerHTML = [...challenges.values()].map((c) => {
    const tc = c.timeControl?.show || (c.timeControl?.daysPerTurn ? `${c.timeControl.daysPerTurn} days` : '');
    if (c.challenger?.id === me) {
      return `<div class="notice">Waiting for <b>${esc(c.destUser?.name || 'opponent')}</b> to accept (${esc(tc)})… <button data-ccancel="${esc(c.id)}">Cancel</button></div>`;
    }
    return `<div class="notice"><b>${esc(c.challenger?.name)}</b> (${esc(c.challenger?.rating ?? '?')}) challenges you · ${esc(tc)} · ${c.rated ? 'rated' : 'casual'}
      <button class="primary" data-caccept="${esc(c.id)}">Accept</button><button data-cdecline="${esc(c.id)}">Decline</button></div>`;
  }).join('');
}
$('#incoming').addEventListener('click', (e) => {
  const a = e.target.closest('[data-caccept]');
  const d = e.target.closest('[data-cdecline]');
  const c = e.target.closest('[data-ccancel]');
  const id = a?.dataset.caccept || d?.dataset.cdecline || c?.dataset.ccancel;
  if (!id) return;
  const path = a ? 'accept' : d ? 'decline' : 'cancel';
  li.api(`/api/challenge/${encodeURIComponent(id)}/${path}`, { method: 'POST' })
    .then(() => { challenges.delete(id); renderChallenges(); })
    .catch((err) => toast(err.message));
});

async function refreshPlaying() {
  try {
    const data = await li.api('/api/account/playing');
    const list = data?.nowPlaying || [];
    lichessOngoing = list.length;
    syncAnalyzeTab();
    $('#playing').innerHTML = list.length
      ? list.map((g) => `<div class="item" data-gid="${esc(g.gameId)}"><div><b>${esc(g.opponent?.username)}</b> <span class="muted">${esc(g.opponent?.rating ?? '')}</span><br><span class="muted small">${esc(g.speed)} · ${g.isMyTurn ? 'your move' : 'their move'}</span></div><button>Open</button></div>`).join('')
      : '<p class="muted small">None.</p>';
  } catch { /* ignore */ }
}
$('#playing').addEventListener('click', (e) => {
  const it = e.target.closest('[data-gid]');
  if (it) openOnline(it.dataset.gid);
});

function leaveOnline() {
  gameAbort?.abort();
  gameAbort = null;
}

function openOnline(id) {
  stopSeek();
  leaveOnline();
  stopAnalysis();
  engine?.stop();
  gameAbort = new AbortController();
  const { signal } = gameAbort;
  Object.assign(G, {
    mode: 'online', startFen: DEFAULT_POSITION, moves: [], cursor: 0, result: null, status: 'Connecting…',
    live: true, myColor: null, clock: null, review: null, historyId: null, bot: null, coachCls: [], coachMsg: null, speech: null, premove: null, retry: null,
    white: { name: 'White' }, black: { name: 'Black' },
    online: { id, draw: { w: false, b: false }, takeback: { w: false, b: false }, gone: false, chat: [] },
  });
  showTab('online', true);
  render();
  li.stream(`/api/board/game/stream/${encodeURIComponent(id)}`, (ev) => {
    if (G.online?.id !== id) return;
    if (ev.type === 'gameFull') {
      const pl = (p) => ({ name: p.name || (p.aiLevel ? `Lichess AI level ${p.aiLevel}` : 'Anonymous'), rating: p.rating, title: p.title, id: p.id });
      G.white = pl(ev.white);
      G.black = pl(ev.black);
      G.myColor = ev.white.id && ev.white.id === account?.id ? 'w' : 'b';
      G.orientation = G.myColor === 'w' ? 'white' : 'black';
      G.startFen = !ev.initialFen || ev.initialFen === 'startpos' ? DEFAULT_POSITION : ev.initialFen;
      applyOnlineState(ev.state);
    } else if (ev.type === 'gameState') {
      applyOnlineState(ev);
    } else if (ev.type === 'chatLine') {
      G.online.chat.push(ev);
      renderStatus();
    } else if (ev.type === 'opponentGone') {
      G.online.gone = !!ev.gone && ev.claimWinInSeconds === 0;
      G.status = ev.gone && ev.claimWinInSeconds > 0 ? `Opponent left — you can claim the win in ${ev.claimWinInSeconds}s` : '';
      render();
    }
  }, { signal }).catch((e) => {
    if (!signal.aborted) { G.status = `Lost connection to Lichess: ${e.message}`; render(); }
  });
}

const STATUS_TEXT = {
  mate: 'Checkmate', resign: 'Resignation', stalemate: 'Stalemate', timeout: 'Opponent left', draw: 'Draw', outoftime: 'Time out',
  cheat: 'Cheat detected', noStart: 'Game never started', aborted: 'Game aborted', variantEnd: 'Variant end', unknownFinish: 'Finished',
};

function applyOnlineState(s) {
  const ucis = (s.moves || '').split(' ').filter(Boolean);
  const same = G.moves.length <= ucis.length && G.moves.every((m, i) => m.uci === ucis[i] || playUci(fenAt(i), ucis[i])?.uci === m.uci);
  const wasAtEnd = G.cursor === G.moves.length;
  if (!same) G.moves = [];
  let fen = lastFen();
  let lastR = null;
  for (let i = G.moves.length; i < ucis.length; i++) {
    const r = playUci(fen, ucis[i]);
    if (!r) break;
    G.moves.push(r);
    fen = r.fen;
    lastR = r;
  }
  if (lastR && turnOf(fen) === G.myColor) soundFor(lastR);
  if (wasAtEnd || !same) G.cursor = G.moves.length;
  const started = s.status === 'started' || s.status === 'created';
  G.online.draw = { w: !!s.wdraw, b: !!s.bdraw };
  G.online.takeback = { w: !!s.wtakeback, b: !!s.btakeback };
  if (typeof s.wtime === 'number') {
    G.clock = { w: s.wtime, b: s.btime, inc: s.winc || 0, turn: turnOf(fen), since: performance.now(), running: started && G.moves.length >= 2 };
  }
  if (started) {
    G.live = true;
    if (!G.status.startsWith('Opponent left')) G.status = '';
  } else {
    G.live = false;
    if (G.clock) G.clock.running = false;
    G.result = s.winner === 'white' ? '1-0' : s.winner === 'black' ? '0-1' : s.status === 'aborted' || s.status === 'noStart' ? null : '1/2-1/2';
    const who = s.winner ? `${s.winner === 'white' ? 'White' : 'Black'} wins` : G.result ? 'Draw' : '';
    G.status = [STATUS_TEXT[s.status] || s.status, who].filter(Boolean).join(' · ');
    if (G.result) saveGame('lichess', { lichessId: G.online.id });
    gameAbort?.abort();
    refreshPlaying();
  }
  render();
  if (lastR && started) firePremove();
}

function stopSeek() {
  seekAbort?.abort();
  seekAbort = null;
  $('#seekStatus').hidden = true;
  document.querySelectorAll('#pool button').forEach((b) => b.classList.remove('on'));
}

$('#pool').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-seek]');
  if (!b) return;
  if (b.classList.contains('on')) return stopSeek();
  stopSeek();
  const tc = TCS[Number(b.dataset.seek)];
  b.classList.add('on');
  const ctl = new AbortController();
  seekAbort = ctl;
  const st = $('#seekStatus');
  st.hidden = false;
  st.innerHTML = `Looking for a ${esc(tc.label)} opponent on Lichess… <button id="seekCancel">Cancel</button>`;
  $('#seekCancel').onclick = stopSeek;
  try {
    await li.stream('/api/board/seek', () => {}, { method: 'POST', form: { time: tc.t, increment: tc.i, rated: $('#seekRated').checked, variant: 'standard' }, signal: ctl.signal });
    // Lichess closes the seek when someone accepts it (or it expires): stop showing "Looking for…".
    if (seekAbort === ctl) stopSeek();
    refreshPlaying();
  } catch (err) {
    if (!ctl.signal.aborted) {
      st.innerHTML = `Lichess said: ${esc(err.message)}`;
      b.classList.remove('on');
    }
  }
});

$('#chSend').addEventListener('click', async () => {
  const user = $('#chUser').value.trim();
  if (!/^[\w-]{2,30}$/.test(user)) return toast('Enter a Lichess username.');
  try {
    const c = await li.api(`/api/challenge/${encodeURIComponent(user)}`, {
      method: 'POST',
      form: { ...tcForm($('#chTc').value), rated: $('#chRated').checked, color: $('#chColor').value, variant: 'standard' },
    });
    const ch = c?.challenge || c;
    if (ch?.id) {
      challenges.set(ch.id, { ...ch, challenger: ch.challenger || { id: account.id, name: account.username }, destUser: ch.destUser || { name: user } });
      renderChallenges();
    }
    toast(`Challenge sent to ${user}.`);
  } catch (err) { toast(err.message); }
});

$('#aiLevel').addEventListener('input', (e) => { $('#aiOut').textContent = e.target.value; });
$('#aiStart').addEventListener('click', async () => {
  try {
    const g = await li.api('/api/challenge/ai', {
      method: 'POST',
      form: { level: $('#aiLevel').value, ...tcForm($('#aiTc').value), color: 'random', variant: 'standard' },
    });
    if (g?.id) openOnline(g.id);
  } catch (err) { toast(err.message); }
});

function startLogin() {
  sessionStorage.setItem('arc.chess.afterLogin', 'online');
  li.login();
}
$('#liLogin').addEventListener('click', startLogin);
$('#acct').addEventListener('click', (e) => {
  if (e.target.id === 'liLogin2') return startLogin();
  if (e.target.id !== 'liLogout') return;
  if (!confirm(hubUser ? 'Disconnect Lichess on all your devices?' : 'Disconnect your Lichess account?')) return;
  if (hubUser) sync.drop().catch(() => {});
  cloudToken = undefined;
  eventsAbort?.abort();
  eventsAbort = null;
  stopSeek();
  leaveOnline();
  clearTimeout(accountRetry);
  li.logout();
  account = null;
  save('arc.chess.account', null);
  challenges.clear();
  renderChallenges();
  renderAccount();
});

/* ── Lichess game import ─────────────────────────────────────── */
let importedGames = [];
let importedUser = '';
$('#impBtn').addEventListener('click', async () => {
  const user = $('#impUser').value.trim();
  if (!/^[\w-]{2,30}$/.test(user)) return toast('Enter a Lichess username.');
  const el = $('#liGames');
  el.innerHTML = '<p class="muted small">Loading…</p>';
  const got = [];
  try {
    await li.stream(`/api/games/user/${encodeURIComponent(user)}?max=30&moves=true&opening=true&finished=true`, (g) => got.push(g));
  } catch (err) {
    el.innerHTML = `<p class="muted small">${esc(err.message)}</p>`;
    return;
  }
  importedGames = got;
  importedUser = user.toLowerCase();
  const nm = (p) => p.user?.name || (p.aiLevel ? `AI level ${p.aiLevel}` : 'Anonymous');
  el.innerHTML = got.length ? got.map((g, i) => {
    const w = g.players.white;
    const res = g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½–½';
    const myW = w.user?.id === importedUser;
    const tag = !g.winner ? 'draw' : (g.winner === 'white') === myW ? 'win' : 'loss';
    return `<div class="item" data-imp="${i}"><div><b>${esc(nm(w))}</b> vs <b>${esc(nm(g.players.black))}</b> <span class="res ${tag}">${res}</span><br><span class="muted small">${esc(g.speed)} · ${new Date(g.createdAt).toLocaleDateString()}${g.opening ? ` · ${esc(g.opening.name)}` : ''}</span></div><button>Review</button></div>`;
  }).join('') : '<p class="muted small">No games found.</p>';
});
$('#liGames').addEventListener('click', (e) => {
  const it = e.target.closest('[data-imp]');
  if (!it) return;
  const g = importedGames[+it.dataset.imp];
  const existing = history.find((h) => h.lichessId === g.id);
  engineOn = true;
  $('#engOn').checked = true;
  if (existing) return loadGameInto(existing, { review: true });
  const startFen = g.initialFen || DEFAULT_POSITION;
  const ucis = [];
  const c = new Chess(startFen);
  for (const san of (g.moves || '').split(' ').filter(Boolean)) {
    try { const m = c.move(san); ucis.push(m.from + m.to + (m.promotion || '')); } catch { break; }
  }
  const pl = (p) => ({ name: p.user?.name || (p.aiLevel ? `Lichess AI level ${p.aiLevel}` : 'Anonymous'), rating: p.rating, title: p.user?.title });
  loadGameInto({
    startFen, ucis, white: pl(g.players.white), black: pl(g.players.black),
    result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2',
    status: [STATUS_TEXT[g.status] || g.status, g.opening?.name].filter(Boolean).join(' · '),
    myColor: g.players.black.user?.id === importedUser ? 'b' : 'w',
  });
  saveGame('lichess', { lichessId: g.id });
  runReview();
});

/* ── analysis panel ──────────────────────────────────────────── */
function newAnalysis(startFen = DEFAULT_POSITION, moves = [], meta = {}) {
  if (blockIfInGame()) return;
  stopAnalysis();
  leaveOnline();
  Object.assign(G, {
    mode: 'analysis', startFen, moves, cursor: moves.length, result: meta.result || null, status: '',
    live: false, myColor: null, clock: null, review: null, historyId: null, bot: null, online: null, coachCls: [], coachMsg: null, speech: null, premove: null, retry: null,
    white: meta.white || { name: 'White' }, black: meta.black || { name: 'Black' },
  });
  showTab('analyze', true);
  afterNav();
}
$('#newBoard').addEventListener('click', () => newAnalysis());
$('#importBtn').addEventListener('click', () => importText($('#importText').value.trim()));
// Loads a FEN or PGN into the analysis board. Returns true on success.
function importText(text, extra = {}) {
  if (!text) return false;
  if (/^[1-8pnbrqkPNBRQK/]+ [wb] /.test(text)) {
    try { new Chess(text); } catch (e) { toast(`Bad FEN: ${e.message}`); return false; }
    newAnalysis(text);
    return true;
  }
  const c = new Chess();
  try { c.loadPgn(text); } catch (e) { toast(`Couldn't read that PGN: ${e.message}`); return false; }
  const h = c.getHeaders();
  const startFen = h.FEN || DEFAULT_POSITION;
  const moves = [];
  let fen = startFen;
  for (const m of c.history({ verbose: true })) {
    const r = playMove(fen, { from: m.from, to: m.to, promotion: m.promotion });
    if (!r) break;
    moves.push(r);
    fen = r.fen;
  }
  newAnalysis(startFen, moves, {
    white: { name: h.White || 'White', rating: h.WhiteElo }, black: { name: h.Black || 'Black', rating: h.BlackElo },
    result: h.Result && h.Result !== '*' ? h.Result : null,
  });
  if (extra.myColor) { G.myColor = extra.myColor; G.orientation = extra.myColor === 'b' ? 'black' : 'white'; }
  if (h.Site || extra.source) saveGame(extra.source || 'import', { lichessId: extra.lichessId });
  render();
  return true;
}

// Links from the browser extension (and anywhere else):
//   chess/#review=<base64url of a UTF-8 PGN>   chess/#lichess=<game id>
function decodeB64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return new TextDecoder().decode(Uint8Array.from(b, (ch) => ch.charCodeAt(0)));
}
async function openImportLink(hash) {
  if (inGame()) return;
  let pgn = null, lichessId = null;
  try {
    if (hash.startsWith('#review=')) pgn = decodeB64url(hash.slice(8));
    else if (hash.startsWith('#lichess=')) {
      lichessId = hash.slice(9).replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
      const res = await fetch(`${li.HOST}/game/export/${lichessId}?clocks=false&evals=false`, { headers: { Accept: 'application/x-chess-pgn' } });
      if (!res.ok) throw new Error(`Lichess couldn't find game ${lichessId} (${res.status})`);
      pgn = await res.text();
    }
  } catch (e) { toast(`Couldn't open that game: ${e.message}`, 6000); return false; }
  window.history.replaceState(null, '', '#analyze');
  const existing = lichessId && historyList().find((h) => h.lichessId === lichessId);
  engineOn = true;
  $('#engOn').checked = true;
  if (existing?.review) { loadGameInto(existing); return true; }
  if (!importText(pgn, { source: lichessId ? 'lichess' : 'import', lichessId })) return false;
  // Review from the side of whoever imported it, if the PGN says.
  runReview();
  return true;
}
const historyList = () => history;
function toPgn() {
  const c = new Chess(G.startFen);
  c.setHeader('White', G.white.name || 'White');
  c.setHeader('Black', G.black.name || 'Black');
  c.setHeader('Result', G.result || '*');
  G.moves.forEach((m) => c.move({ from: m.from, to: m.to, promotion: m.uci[4] }));
  return c.pgn();
}
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast(`${label} copied.`); } catch { prompt(label, text); }
}
$('#copyPgn').addEventListener('click', () => copy(toPgn(), 'PGN'));
$('#copyFen').addEventListener('click', () => copy(curFen(), 'FEN'));

/* ── engine controls ─────────────────────────────────────────── */
$('#engKind').value = settings.engine;
$('#engDepth').value = settings.depth;
$('#engLines').value = String(settings.lines);
$('#reviewDepth').value = String(settings.reviewDepth);
$('#engOn').addEventListener('change', (e) => {
  engineOn = e.target.checked;
  analysedFen = null;
  if (engineOn) analyse();
  else { if (!reviewRun) engine?.stop(); liveLines = null; }
  render();
});
function engineSettingChanged() {
  const wasKind = settings.engine;
  settings.engine = $('#engKind').value;
  settings.depth = $('#engDepth').value;
  settings.lines = Number($('#engLines').value);
  settings.reviewDepth = Number($('#reviewDepth').value);
  saveSettings();
  if (settings.engine === 'full' && wasKind !== 'full') toast('Downloading the full Stockfish network (~95 MB, once)…', 6000);
  analysedFen = null;
  if (!reviewRun) analyse();
}
['#engKind', '#engDepth', '#engLines', '#reviewDepth'].forEach((s) => $(s).addEventListener('change', engineSettingChanged));
$('#reviewBtn').addEventListener('click', runReview);

/* ── bot panel ───────────────────────────────────────────────── */
function renderBots() {
  const all = [...bots.BOTS, botFor('match')];
  $('#bots').innerHTML = all.map((b) => `<button class="bot ${settings.botId === b.id ? 'on' : ''}" data-bot="${b.id}" title="${esc(b.name)} · ${b.elo}">${bots.avatar(b, 44)}<b>${esc(b.name)}</b><small>${b.id === 'match' ? 'You' : b.elo}</small></button>`).join('');
  const b = botFor(settings.botId, settings.elo);
  const styleTag = { wild: 'Chaotic', cautious: 'Cautious', aggressive: 'Attacker', solid: 'Solid', positional: 'Positional', universal: 'All-rounder', engine: 'Engine' }[b.style];
  $('#botCard').innerHTML = `${bots.avatar(b, 56)}<div><b>${esc(b.name)}</b> <span class="muted">${b.elo}</span><p>${esc(b.bio)}</p><div class="tags">${styleTag ? `<span class="ar-chip">${styleTag}</span>` : ''}${(b.book || []).slice(0, 2).map((o) => `<span class="ar-chip">${esc(o.split(':')[0])}</span>`).join('')}</div></div>`;
  $('#elo').value = settings.elo;
  $('#eloOut').textContent = `${settings.elo}`;
  $('#coachOn').checked = settings.coach;
}
$('#bots').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bot]');
  if (!b) return;
  settings.botId = b.dataset.bot;
  saveSettings();
  renderBots();
});
$('#elo').addEventListener('input', (e) => {
  settings.elo = Number(e.target.value);
  settings.botId = 'custom';
  saveSettings();
  renderBots();
});
$('#coachOn').addEventListener('change', (e) => { settings.coach = e.target.checked; saveSettings(); renderCoach(); });
$('#botStart').addEventListener('click', () => startBot(settings.botId, $('#botColor').value, $('#botClock').value));

/* ── learn ───────────────────────────────────────────────────── */
const learn = createLearn({
  panel: $('#learnPanel'),
  setPos(patch) {
    if ('fen' in patch && !('arrows' in patch)) patch.arrows = [];
    Object.assign(G.lp, patch);
    render();
    if (patch.marks) { board.shapes.marks = { ...patch.marks }; board.render(false); }
  },
  sound: (k) => snd.play(k),
  toast,
});
G.learn = learn;
book.load().then(() => { if (G.mode !== 'learn') render(); }).catch(() => {});

/* ── settings dialog ─────────────────────────────────────────── */
const THEMES = { kinetix: ['#ece7ff', '#8c76db'], meadow: ['#e8edd0', '#6f9a55'], wood: ['#f0d9b5', '#b58863'], ice: ['#dee3e6', '#8ca2ad'], coral: ['#f6e4d7', '#d47f6b'], midnight: ['#6b738c', '#343a4f'], mono: ['#dcdcdc', '#929292'] };
function applyLook() {
  document.body.dataset.board = settings.board;
  document.body.classList.toggle('nocoords', !settings.coords);
  document.body.classList.toggle('noanim', !settings.anim);
  board.setPieceSet(settings.pieces);
  snd.setSound(settings.sound);
}
function renderSettings() {
  $('#themeList').innerHTML = Object.entries(THEMES).map(([k, [a, b]]) => `<button type="button" data-theme-k="${k}" class="${settings.board === k ? 'on' : ''}" style="--a:${a};--b:${b}" aria-label="${k} board" title="${k[0].toUpperCase() + k.slice(1)}"></button>`).join('');
  $('#pieceList').innerHTML = Object.entries(PIECE_SETS).map(([k, label]) => `<button type="button" data-piece-k="${k}" class="${settings.pieces === k ? 'on' : ''}" style="background-image:url(vendor/pieces/${k}/wN.svg)" aria-label="${label} pieces" title="${label}"></button>`).join('');
  $('#soundOn').checked = settings.sound;
  $('#coordsOn').checked = settings.coords;
  $('#animOn').checked = settings.anim;
  $('#premoveOn').checked = settings.premove;
}
$('#setBtn').addEventListener('click', () => { renderSettings(); $('#setDialog').showModal(); });
// Browser extension: where to get it and how to install.
function showExt(browser) {
  document.querySelectorAll('[data-ext-b]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.extB === browser)));
  document.querySelectorAll('[data-ext-p]').forEach((p) => { p.hidden = p.dataset.extP !== browser; });
}
function openExt() {
  showExt(/firefox/i.test(navigator.userAgent) ? 'firefox' : 'chrome');
  $('#extDialog').showModal();
}
$('#extBtn').addEventListener('click', openExt);
document.addEventListener('click', (e) => { if (e.target.closest('[data-ext]')) openExt(); });
$('#extDialog').addEventListener('click', (e) => { const b = e.target.closest('[data-ext-b]'); if (b) showExt(b.dataset.extB); });
$('#setDialog').addEventListener('click', (e) => {
  const t = e.target.closest('[data-theme-k]'); const pc = e.target.closest('[data-piece-k]');
  if (t) settings.board = t.dataset.themeK;
  else if (pc) settings.pieces = pc.dataset.pieceK;
  else return;
  saveSettings(); applyLook(); renderSettings();
});
for (const [id, key] of [['#soundOn', 'sound'], ['#coordsOn', 'coords'], ['#animOn', 'anim'], ['#premoveOn', 'premove']]) {
  $(id).addEventListener('change', (e) => { settings[key] = e.target.checked; saveSettings(); applyLook(); if (key === 'sound' && e.target.checked) snd.play('move'); });
}
applyLook();
$('#premoveOn').checked = settings.premove;
window.ArcadeTheme?.mount($('#themeBtn'));

/* ── tabs ────────────────────────────────────────────────────── */
function syncAnalyzeTab() {
  const t = document.querySelector('.tabs [data-tab="analyze"]');
  if (t) { t.classList.toggle('locked', inGame()); t.title = inGame() ? 'Analysis is off during a game' : ''; }
}
function showTab(name, keepGame) {
  if (name === 'analyze' && blockIfInGame()) name = G.mode === 'online' || (!G.live && lichessOngoing) ? 'online' : 'play';
  if (name === 'learn' && G.live) { toast('Finish or resign your game first.'); name = G.mode === 'online' ? 'online' : 'play'; }
  if (name === 'learn' && G.mode !== 'learn') {
    stopAnalysis(); leaveOnline();
    G.mode = 'learn'; G.review = null; G.retry = null;
    G.lp = { fen: DEFAULT_POSITION, orientation: 'white', lastMove: null, movable: false, arrows: [] };
    learn.home();
  } else if (name !== 'learn' && G.mode === 'learn') {
    learn.stop();
    Object.assign(G, { mode: 'analysis', startFen: DEFAULT_POSITION, moves: [], cursor: 0, result: null, status: '', live: false, myColor: null, clock: null, review: null, historyId: null, bot: null, online: null, white: { name: 'White' }, black: { name: 'Black' } });
    render();
  }
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (location.hash !== `#${name}`) window.history.replaceState(null, '', `#${name}`);
  if (!keepGame && name === 'analyze' && G.live) newAnalysis();
}
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});

/* ── boot ────────────────────────────────────────────────────── */
(async function boot() {
  mountAccount($('#hubAcct'), { detectSessionInUrl: false });
  onAuthChange(() => { cloudToken = undefined; refreshAccount(); });
  renderBots();
  renderHistory();
  const before = li.token;
  const err = await li.handleRedirect().catch((e) => e.message);
  freshLogin = !!li.token && li.token !== before;
  if (err) toast(`Lichess login failed: ${err}`, 6000);
  const after = sessionStorage.getItem('arc.chess.afterLogin');
  window.addEventListener('hashchange', () => { const h = location.hash; if (h.startsWith('#review=') || h.startsWith('#lichess=')) { showTab('analyze', true); openImportLink(h); } });
  sessionStorage.removeItem('arc.chess.afterLogin');
  const hash = location.hash;
  if (hash.startsWith('#review=') || hash.startsWith('#lichess=')) {
    showTab('analyze', true);
    await openImportLink(hash);
  } else {
    const tab = after || hash.slice(1);
    showTab(['play', 'online', 'learn', 'analyze', 'games'].includes(tab) ? tab : 'play');
  }
  render();
  refreshAccount();
})();
