// Game Review: turns per-position engine results into move classifications,
// accuracy, key moments and plain-English explanations.
// Evals are white-relative: {cp} or {mate} (mate>0 = white mates; ±0.5 = mated on the board).
import { Chess } from './vendor/chess.js?v=2';

export function winPct(ev) {
  if (!ev) return 50;
  if (ev.mate != null) return ev.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, ev.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
const forSide = (ev, side) => (side === 'w' ? winPct(ev) : 100 - winPct(ev));
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export function material(fen) {
  const m = { w: 0, b: 0 };
  for (const ch of fen.split(' ')[0]) {
    const t = ch.toLowerCase();
    if (VAL[t] != null) m[ch === t ? 'b' : 'w'] += VAL[t];
  }
  return m;
}
const net = (fen, side) => { const m = material(fen); return side === 'w' ? m.w - m.b : m.b - m.w; };

// Plays UCI moves from fen; returns {fens, moves} (stops at the first bad move).
export function playLine(fen, ucis, max = 99) {
  const c = new Chess(fen);
  const fens = [fen], moves = [];
  for (const u of (ucis || []).slice(0, max)) {
    let m;
    try { m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
    moves.push(m); fens.push(c.fen());
  }
  return { fens, moves };
}
const sanOf = (fen, uci) => playLine(fen, [uci], 1).moves[0]?.san || uci;

export function fmtEval(ev) {
  if (!ev) return '';
  if (ev.mate != null) {
    if (Math.abs(ev.mate) < 1) return ev.mate > 0 ? '1-0' : '0-1';
    return (ev.mate > 0 ? 'M' : '-M') + Math.abs(ev.mate);
  }
  const v = ev.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}
function evalWords(ev, side) {
  const w = forSide(ev, side);
  if (ev?.mate != null && Math.abs(ev.mate) >= 1) return (ev.mate > 0) === (side === 'w') ? `a forced mate in ${Math.abs(ev.mate)}` : `getting mated in ${Math.abs(ev.mate)}`;
  if (w > 85) return 'a winning position';
  if (w > 65) return 'a clear advantage';
  if (w > 55) return 'a small edge';
  if (w >= 45) return 'a roughly equal game';
  if (w >= 35) return 'a slightly worse position';
  if (w >= 15) return 'a clearly worse position';
  return 'a losing position';
}

// positions[p] = { eval, best, pv, second: {eval, uci} | null } for the position before move p+1.
export function buildReview({ startFen, moves, positions, depth, isBook = () => false, openingOf = () => null }) {
  const fens = [startFen, ...moves.map((m) => m.fen)];
  const turn = (f) => f.split(' ')[1];
  const cls = [], accs = { w: [], b: [] }, losses = { w: [], b: [] }, notes = [], swings = [];
  let inBook = true;
  moves.forEach((m, i) => {
    const side = turn(fens[i]);
    const P = positions[i], A = positions[i + 1];
    const before = P.eval, after = A.eval;
    const wb = forSide(before, side), wa = forSide(after, side);
    const drop = Math.max(0, wb - wa);
    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
    accs[side].push(acc);
    const cp = (ev) => (ev.mate != null ? (ev.mate > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, ev.cp)));
    losses[side].push(Math.max(0, (side === 'w' ? 1 : -1) * (cp(before) - cp(after))));
    swings.push({ ply: i + 1, swing: Math.abs(winPct(after) - winPct(before)) });

    let c;
    const isBest = m.uci === P.best;
    if (inBook && i < 30 && isBook(m.fen)) c = 'book';
    else {
      inBook = false;
      if (isBest || drop < 1) {
        c = 'best';
        // Sacrifice that the engine likes → brilliant.
        const line = playLine(m.fen, A.pv || [], 4);
        const lowest = Math.min(...line.fens.map((f) => net(f, side)));
        const sac = net(fens[i], side) - lowest >= 2 && !line.moves.some((x, k) => k % 2 === 1 && x.promotion);
        const gap = P.second ? wb - forSide(P.second.eval, side) : 0;
        if (sac && wa >= 50 && wb < 97 && isBest) c = 'brilliant';
        else if (isBest && gap >= 15 && wb > 3 && wb < 97) c = 'great';
      } else if (drop < 2) c = 'excellent';
      else if (drop < 5) c = 'good';
      else if (drop < 10) c = 'inaccuracy';
      else if (drop < 20) c = 'mistake';
      else c = 'blunder';
      // Miss: the opponent just erred and this move let the chance go.
      if (['inaccuracy', 'mistake', 'blunder'].includes(c) && i > 0) {
        const prior = forSide(positions[i - 1].eval, side);
        if (wb - prior >= 10 && wa >= prior - 5) c = 'miss';
      }
    }
    cls.push(c);
    notes.push(explain({ c, i, side, fen: fens[i], after: m.fen, move: m, P, A, wb, wa, openingOf }));
  });
  const gameAcc = (a) => {
    if (!a.length) return 100;
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    const harm = a.length / a.reduce((s, x) => s + 1 / Math.max(x, 1), 0);
    return (mean + harm) / 2;
  };
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const moments = swings.filter((s) => s.swing >= 12 || ['brilliant', 'great', 'blunder', 'miss'].includes(cls[s.ply - 1]))
    .sort((a, b) => b.swing - a.swing).slice(0, 6).map((s) => s.ply).sort((a, b) => a - b);
  return {
    v: 2, depth,
    evals: positions.map((p) => p.eval), best: positions.map((p) => p.best), pv: positions.map((p) => (p.pv || []).slice(0, 10)),
    second: positions.map((p) => p.second?.uci || null),
    cls, notes, moments,
    acc: { w: gameAcc(accs.w), b: gameAcc(accs.b) }, acpl: { w: avg(losses.w), b: avg(losses.b) },
    opening: openingOf(fens),
  };
}

// One or two plain sentences about a move.
function explain({ c, side, fen, after, move, P, A, wb, wa, openingOf }) {
  const san = move.san;
  const best = P.best ? sanOf(fen, P.best) : null;
  const reply = A.best ? playLine(after, [A.best], 1).moves[0] : null;
  if (new Chess(after).isCheckmate()) return `${san} is checkmate. Game over!`;
  if (c === 'book') { const o = openingOf([after]); return `${san} is a book move${o ? ` (${o.name})` : ''}.`; }
  if (c === 'brilliant') return `${san}!! gives up material, but the engine shows it wins: ${evalWords(A.eval, side)}.`;
  if (c === 'great') return `${san}! is the only good move here; anything else lets the advantage slip.`;
  if (c === 'best') return `${san} is the best move, keeping ${evalWords(A.eval, side)}.`;
  if (c === 'excellent' || c === 'good') return `${san} is ${c === 'excellent' ? 'excellent' : 'fine'}. ${best && best !== san ? `${best} was a little more precise.` : ''}`.trim();
  const parts = [];
  // Allows mate?
  if (A.eval?.mate != null && Math.abs(A.eval.mate) >= 1 && (A.eval.mate > 0) !== (side === 'w')) {
    parts.push(`${san} allows a forced mate in ${Math.abs(A.eval.mate)}${reply ? `, starting with ${reply.san}` : ''}.`);
  } else if (reply?.captured) {
    // Hangs material: the reply wins more than we get back over the next two moves.
    const line = playLine(after, A.pv || [], 3);
    const lost = net(after, side) - net(line.fens[Math.min(line.fens.length - 1, 2)], side);
    if (lost >= 2) parts.push(`${san} leaves your ${NAME[reply.captured]} on ${reply.to} hanging: ${reply.san} wins it.`);
  }
  // Missed tactic?
  if (P.best && !parts.length) {
    const line = playLine(fen, P.pv || [P.best], 4);
    const gain = net(line.fens[Math.min(line.fens.length - 1, 3)], side) - net(fen, side);
    if (P.eval?.mate != null && (P.eval.mate > 0) === (side === 'w') && Math.abs(P.eval.mate) >= 1) parts.push(`You had mate in ${Math.abs(P.eval.mate)} starting with ${best}.`);
    else if (gain >= 2) {
      const cap = line.moves.find((x, k) => k % 2 === 0 && x.captured);
      parts.push(`${best} would have won ${cap ? `a ${NAME[cap.captured]}` : 'material'}.`);
    }
  }
  if (!parts.length) parts.push(`${san} gives away part of your advantage.`);
  if (best && !parts.some((p) => p.includes(best))) parts.push(`Best was ${best}, keeping ${evalWords(P.eval, side)}.`);
  else parts.push(`You now have ${evalWords(A.eval, side)}.`);
  return parts.join(' ');
}

// Quick verdict on a single move for the in-game coach.
// P/A: {eval, best, pv} before and after the move (best/pv may be missing).
export function coachNote(fenBefore, move, P, A) {
  const side = fenBefore.split(' ')[1];
  const wb = forSide(P.eval, side), wa = forSide(A.eval, side);
  const drop = Math.max(0, wb - wa);
  const c = move.uci === P.best || drop < 1 ? 'best' : drop < 2 ? 'excellent' : drop < 5 ? 'good' : drop < 10 ? 'inaccuracy' : drop < 20 ? 'mistake' : 'blunder';
  return { cls: c, text: explain({ c, side, fen: fenBefore, after: move.fen, move, P, A, wb, wa, openingOf: () => null }) };
}
