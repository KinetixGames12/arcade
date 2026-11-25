// Crowns puzzle generator: an N×N grid split into N coloured regions with
// exactly one solution where every row, column and region holds one crown
// and no two crowns touch (not even diagonally).

// Counts solutions (stops at `limit`). regions: flat array of region ids.
export function solve(n, regions, limit = 2) {
  const col = new Array(n).fill(false), reg = new Array(n).fill(false);
  const pos = [];
  let count = 0, first = null;
  (function row(r) {
    if (count >= limit) return;
    if (r === n) { count++; if (!first) first = pos.slice(); return; }
    for (let c = 0; c < n; c++) {
      const g = regions[r * n + c];
      if (col[c] || reg[g]) continue;
      if (r > 0 && Math.abs(pos[r - 1] - c) <= 1) continue;
      col[c] = reg[g] = true; pos[r] = c;
      row(r + 1);
      col[c] = reg[g] = false;
    }
  })(0);
  return { count, solution: first };
}

function crownsPlacement(n, rng) {
  for (let t = 0; t < 1000; t++) {
    const pos = [];
    const used = new Set();
    let ok = true;
    for (let r = 0; r < n && ok; r++) {
      const opts = [];
      for (let c = 0; c < n; c++) if (!used.has(c) && (r === 0 || Math.abs(pos[r - 1] - c) > 1)) opts.push(c);
      if (!opts.length) { ok = false; break; }
      const c = opts[Math.floor(rng() * opts.length)];
      pos.push(c); used.add(c);
    }
    if (ok) return pos;
  }
  return null;
}

// Grows regions outward from each crown at random until the grid is full.
function growRegions(n, pos, rng, bias) {
  const regions = new Array(n * n).fill(-1);
  const frontier = [];
  pos.forEach((c, r) => { regions[r * n + c] = r; frontier.push(r * n + c); });
  let left = n * n - n;
  const size = new Array(n).fill(1);
  while (left > 0) {
    // Favour smaller regions so sizes stay mixed instead of one giant blob.
    let i = frontier[Math.floor(rng() * frontier.length)];
    const j = frontier[Math.floor(rng() * frontier.length)];
    if (rng() < bias && size[regions[j]] < size[regions[i]]) i = j;
    const r = Math.floor(i / n), c = i % n;
    const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < n && x >= 0 && x < n && regions[y * n + x] < 0);
    if (!nb.length) { frontier.splice(frontier.indexOf(i), 1); continue; }
    const [y, x] = nb[Math.floor(rng() * nb.length)];
    regions[y * n + x] = regions[i];
    size[regions[i]]++;
    frontier.push(y * n + x);
    left--;
  }
  return regions;
}

// Tries mixed-size regions first, then falls back to free growth (which finds
// a unique grid far more easily). Deterministic for a seeded rng.
export function generate(n, rng) {
  for (let t = 0; t < 6000; t++) {
    const pos = crownsPlacement(n, rng);
    const regions = growRegions(n, pos, rng, t < 1500 ? 0.2 : 0);
    const { count } = solve(n, regions);
    if (count === 1) return { n, regions, solution: pos };
  }
  return null;
}
