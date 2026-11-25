// Checkers rules and AI (American / English draughts): 8×8, dark moves first,
// men move diagonally forward, captures are compulsory and chain, a man that
// reaches the far row becomes a king (and its move ends there), kings move
// one square diagonally in any direction. You lose when you have no move.
// Board: array of 64; '' empty, 'd'/'D' dark man/king, 'l'/'L' light man/king.
// Dark starts on rows 5-7 (bottom) and moves up (row - 1).

export const START = (() => {
  const b = new Array(64).fill('');
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if ((r + c) % 2 === 0) continue;
    if (r < 3) b[r * 8 + c] = 'l';
    else if (r > 4) b[r * 8 + c] = 'd';
  }
  return b;
})();

export const side = (p) => (p ? (p.toLowerCase() === 'd' ? 'd' : 'l') : null);
const isKing = (p) => p === 'D' || p === 'L';
const dirs = (p) => (isKing(p) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : side(p) === 'd' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const crownRow = (s) => (s === 'd' ? 0 : 7);

// Every legal move for `turn`. A move: { from, to, path: [squares visited], caps: [captured squares] }.
export function moves(b, turn) {
  const jumps = [], steps = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (side(p) !== turn) continue;
    const r = i >> 3, c = i & 7;
    jumpsFrom(b, i, p, r, c, [i], [], jumps);
    if (jumps.length) continue;
    for (const [dr, dc] of dirs(p)) {
      const nr = r + dr, nc = c + dc;
      if (on(nr, nc) && !b[nr * 8 + nc]) steps.push({ from: i, to: nr * 8 + nc, path: [i, nr * 8 + nc], caps: [] });
    }
  }
  return jumps.length ? jumps : steps;
}

function jumpsFrom(b, origin, p, r, c, path, caps, out) {
  let extended = false;
  for (const [dr, dc] of dirs(p)) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (!on(tr, tc)) continue;
    const mid = mr * 8 + mc, to = tr * 8 + tc;
    const q = b[mid];
    if (!q || side(q) === side(p) || caps.includes(mid) || (b[to] && to !== origin)) continue;
    extended = true;
    const np = path.concat(to), ncaps = caps.concat(mid);
    // A man that reaches the crown row stops there (American rules).
    if (!isKing(p) && tr === crownRow(side(p))) out.push({ from: origin, to, path: np, caps: ncaps });
    else jumpsFrom(b, origin, p, tr, tc, np, ncaps, out);
  }
  if (!extended && caps.length) out.push({ from: origin, to: path[path.length - 1], path, caps });
}

export function play(b, m) {
  const nb = b.slice();
  let p = nb[m.from];
  nb[m.from] = '';
  for (const c of m.caps) nb[c] = '';
  if ((m.to >> 3) === crownRow(side(p))) p = p.toUpperCase();
  nb[m.to] = p;
  return nb;
}
export const crowned = (b, m) => !isKing(b[m.from]) && (m.to >> 3) === crownRow(side(b[m.from]));

// Score from dark's point of view.
function evaluate(b) {
  let s = 0, dark = 0, light = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const r = i >> 3, c = i & 7;
    const centre = (c >= 2 && c <= 5 && r >= 2 && r <= 5) ? 6 : 0;
    let v;
    if (p === 'd') { v = 100 + (7 - r) * 4 + centre + (r === 7 ? 8 : 0); dark++; }
    else if (p === 'l') { v = -(100 + r * 4 + centre + (r === 0 ? 8 : 0)); light++; }
    else if (p === 'D') { v = 170 + centre; dark++; }
    else { v = -(170 + centre); light++; }
    s += v;
  }
  // When ahead, trade down.
  if (dark > light) s += (24 - light) * 3; else if (light > dark) s -= (24 - dark) * 3;
  return s;
}

const WIN = 100000;
// Best move for `turn` using alpha-beta with iterative deepening.
// level: 1 (random-ish) … 5 (strong). Returns a move.
export function bestMove(b, turn, level = 3, timeMs = 900) {
  const list = moves(b, turn);
  if (list.length <= 1) return list[0] || null;
  const maxDepth = [0, 1, 2, 4, 7, 14][level] || 4;
  const deadline = performance.now() + (level >= 5 ? timeMs * 1.5 : timeMs);
  let best = list[0], nodes = 0, stop = false;

  function search(bd, t, depth, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) stop = true;
    const ms = moves(bd, t);
    if (!ms.length) return -WIN + ply;
    // Keep searching captures past the horizon so we don't stop mid-exchange.
    if (depth <= 0 && !ms[0].caps.length) return (t === 'd' ? 1 : -1) * evaluate(bd);
    if (depth <= -6) return (t === 'd' ? 1 : -1) * evaluate(bd);
    const o = t === 'd' ? 'l' : 'd';
    let bestV = -Infinity;
    for (const m of ms) {
      const v = -search(play(bd, m), o, depth - 1, -beta, -alpha, ply + 1);
      if (stop) return 0;
      if (v > bestV) bestV = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return bestV;
  }

  for (let d = 1; d <= maxDepth; d++) {
    let alpha = -Infinity, cand = null, candV = -Infinity;
    // Try last iteration's best first for better pruning.
    const ordered = [best, ...list.filter((m) => m !== best)];
    for (const m of ordered) {
      const v = -search(play(b, m), turn === 'd' ? 'l' : 'd', d - 1, -Infinity, -alpha, 1);
      if (stop) break;
      // Low levels: a little noise so the bot makes human-ish mistakes.
      const noisy = level <= 2 ? v + (Math.random() - 0.5) * (level === 1 ? 260 : 90) : v;
      if (noisy > candV) { candV = noisy; cand = m; }
      if (v > alpha) alpha = v;
    }
    if (stop) break;
    best = cand || best;
    if (candV > WIN / 2) break;
  }
  return best;
}
