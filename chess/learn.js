// Learn tab: coach lessons, puzzles (Lichess API, bundled fallback) and an
// opening trainer with spaced repetition. The host app owns the board; this
// module tells it which position to show and judges the moves played.
import { Chess } from './vendor/chess.js?v=2';
import { LESSONS } from './lessons.js?v=1';
import * as book from './openings.js?v=1';
import { badgeSvg } from './badges.js?v=1';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TRAINER = [
  { name: 'Italian Game', side: 'w', blurb: 'Classic attacking start for White: Bc4 at the f7 square.' },
  { name: 'Ruy Lopez', side: 'w', blurb: 'The Spanish: the most respected 1.e4 e5 opening.' },
  { name: "Queen's Gambit", side: 'w', blurb: 'Offer a pawn for central control after 1.d4 d5.' },
  { name: 'London System', side: 'w', blurb: 'One solid setup you can play against almost anything.' },
  { name: 'English Opening', side: 'w', blurb: 'Flexible 1.c4 play on the flank.' },
  { name: 'Sicilian Defense', side: 'b', blurb: 'The fighting answer to 1.e4.' },
  { name: 'French Defense', side: 'b', blurb: 'Solid and counter-punching: 1.e4 e6.' },
  { name: 'Caro-Kann Defense', side: 'b', blurb: 'Rock-solid structure with 1.e4 c6.' },
  { name: 'Scandinavian Defense', side: 'b', blurb: 'Hit the e4 pawn straight away with 1…d5.' },
  { name: "King's Indian Defense", side: 'b', blurb: 'Let White build a centre, then attack it.' },
];
const BOX_DAYS = [0, 1, 3, 7, 16, 35];

export function createLearn(host) {
  // host: { panel, setPos({fen, orientation, lastMove, movable, arrows}), sound(kind), toast(msg), done() }
  let cur = null; // {kind:'lesson'|'puzzle'|'trainer', …}
  const progress = () => load('arc.chess.lessons', {});
  const P = host.panel;

  function home() {
    cur = null;
    const done = progress();
    const groups = [...new Set(LESSONS.map((l) => l.group))];
    const rating = load('arc.chess.puzzleRating', 1200);
    P.innerHTML = `
      <section class="lr-hero"><div><p class="ar-eyebrow">Coach</p><h2 class="ar-display">Get better every day</h2><p class="muted">Short lessons, a puzzle streak and opening drills that remember what you forget.</p></div></section>
      <section class="lr-cards">
        <button class="lr-card puzzle" data-go="puzzle"><b>Puzzles</b><span>Your puzzle rating: <strong>${rating}</strong></span><small>Find the best move. Fresh puzzles from Lichess.</small></button>
        <button class="lr-card daily" data-go="daily"><b>Daily puzzle</b><span>One new puzzle every day</span><small>Same puzzle for everyone.</small></button>
      </section>
      <h3 class="lr-h">Lessons</h3>
      ${groups.map((g) => `<div class="lr-group"><h4>${esc(g)}</h4><div class="lr-list">${LESSONS.filter((l) => l.group === g).map((l) => `<button class="lr-lesson${done[l.id] ? ' done' : ''}" data-lesson="${l.id}"><span class="lr-ic">${l.icon}</span><span>${esc(l.title)}<small>${l.steps.length} steps</small></span>${done[l.id] ? '<i class="lr-tick">✓</i>' : ''}</button>`).join('')}</div></div>`).join('')}
      <h3 class="lr-h">Opening trainer</h3>
      <p class="muted small">Pick an opening. The trainer plays your opponent’s moves; you play yours. Moves you miss come back sooner.</p>
      <div class="lr-list">${TRAINER.map((t) => { const s = srsStats(t); return `<button class="lr-lesson" data-train="${esc(t.name)}"><span class="lr-ic">${t.side === 'w' ? '♔' : '♚'}</span><span>${esc(t.name)}<small>${s.total ? `${s.learned}/${s.total} learned · ${s.due} due` : esc(t.blurb)}</small></span></button>`; }).join('')}</div>`;
    P.onclick = (e) => {
      const b = e.target.closest('[data-lesson],[data-go],[data-train]');
      if (!b) return;
      if (b.dataset.lesson) startLesson(b.dataset.lesson);
      else if (b.dataset.train) startTrainer(b.dataset.train);
      else if (b.dataset.go === 'puzzle') startPuzzle();
      else if (b.dataset.go === 'daily') startPuzzle(true);
    };
    host.setPos({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', orientation: 'white', movable: false });
  }

  /* ── lessons ── */
  function startLesson(id, step = 0) {
    const lesson = LESSONS.find((l) => l.id === id);
    cur = { kind: 'lesson', lesson, step, solved: false };
    showStep();
  }
  function showStep(msg) {
    const { lesson, step } = cur;
    const s = lesson.steps[step];
    const task = !!(s.moves || s.mate);
    const side = s.fen.split(' ')[1];
    cur.solved = !task;
    P.innerHTML = `<div class="lr-run">
      <button class="link lr-back" data-a="home">← All lessons</button>
      <p class="ar-eyebrow">${esc(lesson.group)}</p><h2 class="ar-display">${lesson.icon} ${esc(lesson.title)}</h2>
      <div class="lr-dots">${lesson.steps.map((_, i) => `<i class="${i < step ? 'done' : i === step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="coach-bubble"><span class="coach-av">K</span><p>${esc(s.text)}</p></div>
      <p class="lr-msg" role="status">${msg || (task ? (s.mate ? 'Your move: deliver checkmate.' : 'Your move.') : '')}</p>
      <div class="lr-btns">${task ? '<button class="btn" data-a="hint">Hint</button>' : ''}<button class="btn primary" data-a="next" ${task ? 'disabled' : ''}>${step === lesson.steps.length - 1 ? 'Finish' : 'Next'}</button></div></div>`;
    host.setPos({ fen: s.fen, orientation: side === 'w' ? 'white' : 'black', movable: task });
    P.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'home') home();
      else if (a === 'hint') { P.querySelector('.lr-msg').textContent = s.hint || 'Look for the forcing move.'; }
      else if (a === 'next') {
        if (cur.step < lesson.steps.length - 1) { cur.step++; showStep(); } else {
          const d = progress(); d[lesson.id] = true; save('arc.chess.lessons', d);
          host.sound('win'); host.toast(`Lesson complete: ${lesson.title}`); home();
        }
      }
    };
  }
  function lessonMove(fenBefore, r) {
    const s = cur.lesson.steps[cur.step];
    const ok = (s.moves && s.moves.some((u) => r.uci.startsWith(u))) || (s.mate && new Chess(r.fen).isCheckmate());
    if (ok) {
      host.sound('correct');
      host.setPos({ fen: r.fen, lastMove: [r.from, r.to], movable: false });
      P.querySelector('.lr-msg').innerHTML = `${badgeSvg('best', 20)} <b>Correct!</b>`;
      P.querySelector('[data-a="next"]').disabled = false;
    } else {
      host.sound('illegal');
      host.setPos({ fen: r.fen, lastMove: [r.from, r.to], movable: false });
      P.querySelector('.lr-msg').textContent = 'Not quite. Try again.';
      setTimeout(() => { if (cur?.kind === 'lesson') host.setPos({ fen: fenBefore, lastMove: null, movable: true }); }, 700);
    }
  }

  /* ── puzzles ── */
  async function fetchPuzzle(daily) {
    const r = load('arc.chess.puzzleRating', 1200);
    const diff = r < 900 ? 'easiest' : r < 1200 ? 'easier' : r < 1700 ? 'normal' : r < 2100 ? 'harder' : 'hardest';
    try {
      const res = await fetch(daily ? 'https://lichess.org/api/puzzle/daily' : `https://lichess.org/api/puzzle/next?difficulty=${diff}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(res.status);
      const j = await res.json();
      return { id: j.puzzle.id, fen: j.puzzle.fen, last: j.puzzle.lastMove, sol: j.puzzle.solution, rating: j.puzzle.rating, themes: j.puzzle.themes || [] };
    } catch {
      const list = await fetch('data/puzzles.json?v=1').then((x) => x.json());
      const seen = load('arc.chess.puzzlesSeen', []);
      const pool = list.filter((p) => !seen.includes(p[0]));
      const p = (pool.length ? pool : list).sort((a, b) => Math.abs(a[4] - r) - Math.abs(b[4] - r))[Math.floor(Math.random() * 5)] || list[0];
      return { id: p[0], fen: p[1], last: p[2], sol: p[3].split(' '), rating: p[4], themes: p[5].split(' ') };
    }
  }
  async function startPuzzle(daily = false) {
    P.innerHTML = '<p class="muted">Loading a puzzle…</p>';
    const p = await fetchPuzzle(daily);
    const side = p.fen.split(' ')[1];
    cur = { kind: 'puzzle', p, idx: 0, fen: p.fen, failed: false, daily };
    const theme = p.themes.filter((t) => !['short', 'long', 'veryLong', 'oneMove', 'middlegame', 'endgame', 'opening', 'advantage', 'crushing', 'master', 'masterVsMaster', 'superGM'].includes(t))[0];
    P.innerHTML = `<div class="lr-run">
      <button class="link lr-back" data-a="home">← Learn</button>
      <p class="ar-eyebrow">${daily ? 'Daily puzzle' : 'Puzzle'} · rated ${p.rating}</p>
      <h2 class="ar-display">${side === 'w' ? 'White' : 'Black'} to move</h2>
      <p class="muted small">Your rating: <b class="pz-r">${load('arc.chess.puzzleRating', 1200)}</b>${theme ? ` · hint theme hidden until you ask` : ''}</p>
      <p class="lr-msg" role="status">Find the best move.</p>
      <div class="lr-btns"><button class="btn" data-a="hint">Hint</button><button class="btn" data-a="show">Show solution</button><button class="btn primary" data-a="next">Next puzzle</button></div>
      <p class="muted small"><a href="https://lichess.org/training/${esc(p.id)}" target="_blank" rel="noopener">Puzzle ${esc(p.id)} on Lichess</a> (CC0)</p></div>`;
    const lm = p.last ? [p.last.slice(0, 2), p.last.slice(2, 4)] : null;
    host.setPos({ fen: p.fen, orientation: side === 'w' ? 'white' : 'black', lastMove: lm, movable: true });
    P.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'home') home();
      else if (a === 'next') startPuzzle();
      else if (a === 'hint') {
        cur.failed = true;
        const u = p.sol[cur.idx];
        P.querySelector('.lr-msg').textContent = `${theme ? `Theme: ${theme.replace(/([A-Z])/g, ' $1').toLowerCase()}. ` : ''}Move the highlighted piece.`;
        host.setPos({ arrows: [{ from: u.slice(0, 2), to: u.slice(0, 2), color: 'rgba(56,139,253,.8)' }], marks: { [u.slice(0, 2)]: 'blue' } });
      } else if (a === 'show') {
        cur.failed = true;
        await playOut(cur.idx);
      }
    };
  }
  async function playOut(from) {
    const p = cur.p;
    let fen = cur.fen;
    for (let i = from; i < p.sol.length; i++) {
      const c = new Chess(fen);
      const u = p.sol[i];
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      fen = c.fen();
      host.sound(m.captured ? 'capture' : 'move');
      host.setPos({ fen, lastMove: [m.from, m.to], movable: false });
      await sleep(650);
    }
    cur.idx = p.sol.length;
    finishPuzzle(false);
  }
  function finishPuzzle(solved) {
    const p = cur.p;
    if (!cur.daily) {
      const r = load('arc.chess.puzzleRating', 1200);
      const exp = 1 / (1 + 10 ** ((p.rating - r) / 400));
      const next = Math.round(r + 32 * ((solved && !cur.failed ? 1 : 0) - exp));
      save('arc.chess.puzzleRating', next);
      const seen = load('arc.chess.puzzlesSeen', []);
      save('arc.chess.puzzlesSeen', [...seen.slice(-200), p.id]);
      const rr = P.querySelector('.pz-r'); if (rr) rr.textContent = `${next} (${next >= r ? '+' : ''}${next - r})`;
    }
    P.querySelector('.lr-msg').innerHTML = solved ? `${badgeSvg(cur.failed ? 'good' : 'best', 20)} <b>${cur.failed ? 'Solved with help.' : 'Solved!'}</b>` : 'Here’s the solution. Try the next one.';
    if (solved) host.sound('win');
  }
  async function puzzleMove(fenBefore, r) {
    const p = cur.p;
    const want = p.sol[cur.idx];
    const mates = new Chess(r.fen).isCheckmate();
    if (r.uci === want || (mates && cur.idx === p.sol.length - 1)) {
      cur.fen = r.fen; cur.idx++;
      host.setPos({ fen: r.fen, lastMove: [r.from, r.to], movable: false });
      if (cur.idx >= p.sol.length) { finishPuzzle(true); return; }
      P.querySelector('.lr-msg').innerHTML = `${badgeSvg('best', 18)} Best move! Keep going.`;
      await sleep(450);
      const c = new Chess(cur.fen);
      const u = p.sol[cur.idx];
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      cur.fen = c.fen(); cur.idx++;
      host.sound(m.captured ? 'capture' : m.san.includes('+') ? 'check' : 'move');
      host.setPos({ fen: cur.fen, lastMove: [m.from, m.to], movable: cur.idx < p.sol.length });
      if (cur.idx >= p.sol.length) finishPuzzle(true);
    } else {
      cur.failed = true;
      host.sound('illegal');
      host.setPos({ fen: r.fen, lastMove: [r.from, r.to], movable: false });
      P.querySelector('.lr-msg').innerHTML = `${badgeSvg('mistake', 18)} That’s not it. Try again.`;
      setTimeout(() => { if (cur?.kind === 'puzzle') host.setPos({ fen: fenBefore, lastMove: null, movable: true }); }, 700);
    }
  }

  /* ── opening trainer (spaced repetition) ── */
  function trainerLines(t) {
    return book.allLines().filter(([, n]) => n === t.name || n.startsWith(`${t.name}:`)).filter(([, , u]) => u.split(' ').length >= 4)
      .sort((a, b) => a[2].length - b[2].length).slice(0, 14);
  }
  function cards(t) {
    const out = new Map(); // posKey → Set(uci)
    for (const [, , ucis] of trainerLines(t)) {
      const c = new Chess();
      for (const u of ucis.split(' ')) {
        if (c.turn() === t.side) { const k = book.posKey(c.fen()); if (!out.has(k)) out.set(k, new Set()); out.get(k).add(u); }
        try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
      }
    }
    return out;
  }
  function srsStats(t) {
    if (!book.allLines().length) return { total: 0, learned: 0, due: 0 };
    const s = load(`arc.chess.srs.${t.name}`, {});
    const c = cards(t);
    let learned = 0, due = 0;
    for (const k of c.keys()) { const e = s[k]; if (e?.box >= 2) learned++; if (!e || e.due <= Date.now()) due++; }
    return { total: c.size, learned, due };
  }
  function startTrainer(name) {
    const t = TRAINER.find((x) => x.name === name);
    const lines = trainerLines(t);
    if (!lines.length) { host.toast('Opening book is still loading. Try again in a second.'); return; }
    const srs = load(`arc.chess.srs.${t.name}`, {});
    // Choose the line with the most due cards.
    const dueCount = ([, , u]) => {
      const c = new Chess(); let n = 0;
      for (const m of u.split(' ')) { if (c.turn() === t.side) { const e = srs[book.posKey(c.fen())]; if (!e || e.due <= Date.now()) n++; } try { c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }); } catch { break; } }
      return n + Math.random();
    };
    const line = [...lines].sort((a, b) => dueCount(b) - dueCount(a))[0];
    cur = { kind: 'trainer', t, line, ucis: line[2].split(' '), ply: 0, fen: new Chess().fen(), srs, all: cards(t), right: 0, wrong: 0 };
    P.innerHTML = `<div class="lr-run">
      <button class="link lr-back" data-a="home">← Learn</button>
      <p class="ar-eyebrow">Opening trainer · you play ${t.side === 'w' ? 'White' : 'Black'}</p>
      <h2 class="ar-display">${esc(t.name)}</h2>
      <p class="muted small lr-line">${esc(line[1])}</p>
      <p class="lr-msg" role="status"></p>
      <div class="lr-btns"><button class="btn" data-a="hint">Show move</button><button class="btn primary" data-a="again">Next line</button></div></div>`;
    P.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'home') home();
      else if (a === 'again') startTrainer(name);
      else if (a === 'hint') {
        const u = cur.ucis[cur.ply];
        if (u) { grade(false); host.setPos({ arrows: [{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'rgba(56,139,253,.85)' }] }); }
      }
    };
    host.setPos({ fen: cur.fen, orientation: t.side === 'w' ? 'white' : 'black', lastMove: null, movable: false });
    advance();
  }
  function grade(ok) {
    const k = book.posKey(cur.fen);
    const e = cur.srs[k] || { box: 0, due: 0 };
    if (cur.graded === k) return;
    cur.graded = k;
    e.box = ok ? Math.min(BOX_DAYS.length - 1, e.box + 1) : 0;
    e.due = Date.now() + BOX_DAYS[e.box] * 86400e3;
    cur.srs[k] = e;
    save(`arc.chess.srs.${cur.t.name}`, cur.srs);
    ok ? cur.right++ : cur.wrong++;
  }
  async function advance() {
    while (cur?.kind === 'trainer' && cur.ply < cur.ucis.length) {
      const c = new Chess(cur.fen);
      if (c.turn() === cur.t.side) {
        cur.graded = null;
        P.querySelector('.lr-msg').textContent = 'Your move.';
        host.setPos({ fen: cur.fen, movable: true, arrows: [] });
        return;
      }
      await sleep(500);
      if (cur?.kind !== 'trainer') return;
      const u = cur.ucis[cur.ply];
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      cur.fen = c.fen(); cur.ply++;
      host.sound(m.captured ? 'capture' : 'move');
      host.setPos({ fen: cur.fen, lastMove: [m.from, m.to], movable: false });
    }
    if (cur?.kind === 'trainer') {
      const name = book.nameOf(cur.fen)?.name || cur.line[1];
      P.querySelector('.lr-msg').innerHTML = `<b>Line complete.</b> ${cur.right} right, ${cur.wrong} to review. You reached: ${esc(name)}.`;
      host.sound('win');
    }
  }
  function trainerMove(fenBefore, r) {
    const ok = cur.all.get(book.posKey(fenBefore))?.has(r.uci) || r.uci === cur.ucis[cur.ply];
    grade(ok);
    if (ok) {
      host.sound('correct');
      if (r.uci !== cur.ucis[cur.ply]) {
        // Another book move: follow a line that contains it.
        const alt = trainerLines(cur.t).find(([, , u]) => u.split(' ').slice(0, cur.ply + 1).join(' ') === [...cur.ucis.slice(0, cur.ply), r.uci].join(' '));
        if (alt) { cur.line = alt; cur.ucis = alt[2].split(' '); }
      }
      cur.fen = r.fen; cur.ply++;
      host.setPos({ fen: r.fen, lastMove: [r.from, r.to], movable: false });
      P.querySelector('.lr-msg').innerHTML = `${badgeSvg('book', 18)} Book move.`;
      advance();
    } else {
      host.sound('illegal');
      const u = cur.ucis[cur.ply];
      P.querySelector('.lr-msg').innerHTML = `${badgeSvg('mistake', 18)} Not in this repertoire. The book move is shown. Play it.`;
      host.setPos({ fen: fenBefore, lastMove: null, movable: true, arrows: [{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'rgba(56,139,253,.85)' }] });
    }
  }

  return {
    home,
    get active() { return cur?.kind || null; },
    onMove(fenBefore, r) {
      if (cur?.kind === 'lesson') lessonMove(fenBefore, r);
      else if (cur?.kind === 'puzzle') puzzleMove(fenBefore, r);
      else if (cur?.kind === 'trainer') trainerMove(fenBefore, r);
    },
    stop() { cur = null; },
  };
}
