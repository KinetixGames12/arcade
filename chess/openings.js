// Opening names and the book tree, from lichess-org/chess-openings (CC0).
// data/openings.json holds [eco, name, "uci uci …"] lines; positions are keyed
// by board + side to move + castling (move counters and en passant ignored).
let data = null;
let loading = null;

export const posKey = (fen) => fen.split(' ').slice(0, 3).join(' ');

// Minimal UCI applier on a FEN (no legality checks: book lines are legal).
function applyUci(fen, uci) {
  const [b, turn, castle] = fen.split(' ');
  const rows = b.split('/').map((r) => r.replace(/\d/g, (d) => '.'.repeat(+d)).split(''));
  const at = (sq) => [8 - Number(sq[1]), sq.charCodeAt(0) - 97];
  const [fr, fc] = at(uci.slice(0, 2)), [tr, tc] = at(uci.slice(2, 4));
  let p = rows[fr][fc];
  const target = rows[tr][tc];
  rows[fr][fc] = '.';
  if ((p === 'P' || p === 'p') && fc !== tc && target === '.') rows[fr][tc] = '.'; // en passant
  if ((p === 'K' || p === 'k') && Math.abs(tc - fc) === 2) { // castling
    const rr = fr, rookFrom = tc > fc ? 7 : 0, rookTo = tc > fc ? 5 : 3;
    rows[rr][rookTo] = rows[rr][rookFrom]; rows[rr][rookFrom] = '.';
  }
  if (uci[4]) p = turn === 'w' ? uci[4].toUpperCase() : uci[4];
  rows[tr][tc] = p;
  let c = castle;
  const strip = (s) => { c = c.replace(s, ''); };
  if (p === 'K') { strip('K'); strip('Q'); } if (p === 'k') { strip('k'); strip('q'); }
  for (const sq of [uci.slice(0, 2), uci.slice(2, 4)]) ({ a1: () => strip('Q'), h1: () => strip('K'), a8: () => strip('q'), h8: () => strip('k') })[sq]?.();
  if (!c) c = '-';
  const board = rows.map((r) => r.join('').replace(/\.+/g, (m) => String(m.length))).join('/');
  return `${board} ${turn === 'w' ? 'b' : 'w'} ${c} - 0 1`;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function load() {
  if (data) return Promise.resolve(data);
  loading ||= fetch('data/openings.json?v=1').then((r) => r.json()).then((lines) => {
    const names = new Map(); // key → {eco, name}
    const kids = new Map(); // key → Map(uci → childKey)
    const keyFen = new Map(); // key → a full fen (for SAN conversion)
    for (const [eco, name, ucis] of lines) {
      let fen = START;
      let key = posKey(fen);
      keyFen.set(key, fen);
      for (const u of ucis.split(' ')) {
        const next = applyUci(fen, u);
        const nk = posKey(next);
        if (!kids.has(key)) kids.set(key, new Map());
        kids.get(key).set(u, nk);
        keyFen.set(nk, next);
        fen = next; key = nk;
      }
      names.set(key, { eco, name, line: ucis });
    }
    data = { names, kids, keyFen, lines };
    return data;
  });
  return loading;
}

// Opening name for a position, if it is a named book position.
export function nameOf(fen) { return data?.names.get(posKey(fen)) || null; }
export function inBook(fen) { const k = posKey(fen); return !!data && (data.names.has(k) || data.kids.has(k)); }
// Book continuations from a position: [{uci, name}] where name is the named
// opening reached (or the nearest name further down that branch).
export function continuations(fen) {
  if (!data) return [];
  const m = data.kids.get(posKey(fen));
  if (!m) return [];
  return [...m.entries()].map(([uci, k]) => ({ uci, name: deepestName(k) }));
}
function deepestName(k, depth = 0) {
  const n = data.names.get(k);
  if (n || depth > 6) return n;
  const m = data.kids.get(k);
  if (!m) return null;
  for (const ck of m.values()) { const r = deepestName(ck, depth + 1); if (r) return r; }
  return null;
}
// Name of the deepest named position along a game (for headers / review).
export function gameOpening(fens) {
  let best = null;
  for (const f of fens) { const n = nameOf(f); if (n) best = n; else if (best && !inBook(f)) break; }
  return best;
}
export function allLines() { return data?.lines || []; }
