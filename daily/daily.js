// Shared helpers for the Kinetix daily games (Lexo, Warmer, Bigger?):
// a day number everyone shares, local stats, a results card and sharing.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);

const EPOCH = Date.UTC(2026, 10, 24); // day 1 (launch day)
// Puzzle number for the player's local calendar date.
export function dayNumber(d = new Date()) {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400e3) + 1;
}
// Deterministic pick so everyone gets the same daily puzzle.
export function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function msToMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n;
}
export function countdown(el) {
  const tick = () => {
    const ms = msToMidnight();
    const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3), s = Math.floor((ms % 60e3) / 1000);
    el.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  tick();
  return setInterval(tick, 1000);
}

export const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

// Stats: {played, wins, streak, best, dist: {score: count}, last}
export function stats(game) { return load(`kx.${game}.stats`, { played: 0, wins: 0, streak: 0, best: 0, dist: {}, last: 0 }); }
export function recordResult(game, day, won, score) {
  const s = stats(game);
  if (s.last === day) return s;
  s.played++;
  if (won) { s.wins++; s.streak = s.last === day - 1 ? s.streak + 1 : 1; s.best = Math.max(s.best, s.streak); s.dist[score] = (s.dist[score] || 0) + 1; } else s.streak = 0;
  s.last = day;
  save(`kx.${game}.stats`, s);
  return s;
}

let toastEl;
export function toast(msg, ms = 1800) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'ar-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

export async function share(text) {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('Result copied. Paste it anywhere!');
  } catch { toast('Couldn’t share. Try again.'); }
}

// Results dialog: title, big line, stats row, optional distribution, share text.
export function results({ title, line, sub = '', statsRow, dist, shareText, extra = '' }) {
  document.querySelector('.dg-modal')?.remove();
  const d = document.createElement('dialog');
  d.className = 'dg-modal';
  const max = dist ? Math.max(1, ...dist.map((x) => x.n)) : 1;
  d.innerHTML = `<button class="dg-x" aria-label="Close">✕</button>
    <h2 class="ar-display">${esc(title)}</h2>
    <p class="dg-line">${line}</p>${sub ? `<p class="ar-muted">${sub}</p>` : ''}
    ${statsRow ? `<div class="dg-stats">${statsRow.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>` : ''}
    ${dist ? `<div class="dg-dist">${dist.map((x) => `<div class="dg-bar${x.on ? ' on' : ''}"><span>${esc(x.label)}</span><i style="width:${Math.max(8, (x.n / max) * 100)}%">${x.n}</i></div>`).join('')}</div>` : ''}
    ${extra}
    <div class="dg-foot"><div><span class="ar-muted">Next puzzle in</span><b class="dg-cd"></b></div>${shareText ? '<button class="ar-btn lg dg-share">Share</button>' : ''}</div>`;
  document.body.appendChild(d);
  const iv = countdown(d.querySelector('.dg-cd'));
  d.addEventListener('close', () => { clearInterval(iv); d.remove(); });
  d.querySelector('.dg-x').onclick = () => d.close();
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.querySelector('.dg-share')?.addEventListener('click', () => share(shareText));
  d.showModal();
  return d;
}

export function helpDialog(html) {
  const d = document.createElement('dialog');
  d.className = 'dg-modal';
  d.innerHTML = `<button class="dg-x" aria-label="Close">✕</button>${html}<div class="dg-foot"><span></span><button class="ar-btn">Got it</button></div>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.querySelector('.dg-x').onclick = () => d.close();
  d.querySelector('.dg-foot .ar-btn').onclick = () => d.close();
  d.showModal();
}
