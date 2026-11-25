// Answer matching for Deep Cut: forgiving about case, accents, punctuation,
// plurals and one-letter typos in longer words.
export function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');
}
const squash = (s) => s.replace(/ /g, '');

function lev1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Builds a lookup for one prompt's answers: returns (text) => answer index or -1.
export function matcher(answers) {
  const map = new Map();
  answers.forEach((names, idx) => names.forEach((n) => { const k = squash(norm(n)); if (k && !map.has(k)) map.set(k, idx); }));
  const keys = [...map.keys()];
  return (text) => {
    const k = squash(norm(text));
    if (!k) return -1;
    if (map.has(k)) return map.get(k);
    for (const v of [k.replace(/ies$/, 'y'), k.replace(/es$/, ''), k.replace(/s$/, ''), k + 's']) if (map.has(v)) return map.get(v);
    if (k.length >= 5) { const hit = keys.find((x) => x.length >= 5 && lev1(k, x)); if (hit) return map.get(hit); }
    return -1;
  };
}
