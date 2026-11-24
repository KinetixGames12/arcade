import { GAMES } from './games.js?v=3';
import { mountAccount } from './account.js?v=3';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const grid = document.getElementById('games');
grid.innerHTML = GAMES.map((g, i) => {
  const tags = (g.tags || []).map((t) => `<span class="ar-chip">${esc(t)}</span>`).join('');
  const inner = `
    <span class="g-art"><img src="shared/art/${esc(g.slug)}.svg?v=1" alt="" loading="${i < 3 ? 'eager' : 'lazy'}" width="400" height="250"></span>
    <span class="g-body">
      <span class="g-name">${esc(g.name)}</span>
      <span class="g-blurb">${esc(g.blurb)}</span>
      <span class="g-foot"><span class="g-tags">${tags}</span>${g.soon ? '<span class="g-soon">Coming soon</span>' : '<span class="g-play" aria-hidden="true">Play<svg viewBox="0 0 16 16"><path d="M3 8h9M8 3.5 12.5 8 8 12.5"/></svg></span>'}</span>
    </span>
    <span class="g-glare" aria-hidden="true"></span>`;
  const style = `--accent:${esc(g.accent)};--i:${i}`;
  return g.soon
    ? `<div class="g-card soon" style="${style}" aria-disabled="true">${inner}</div>`
    : `<a class="g-card" href="${esc(g.slug)}/" style="${style}" aria-label="Play ${esc(g.name)}">${inner}</a>`;
}).join('');

const live = GAMES.filter((g) => !g.soon).length, soon = GAMES.length - live;
document.getElementById('gameCount').textContent = `${live} ${live === 1 ? 'game' : 'games'} live${soon ? ` · ${soon} landing soon` : ''}`;

// Cards tilt toward the pointer (mouse/pen only; touch just scrolls).
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!still) {
  grid.querySelectorAll('.g-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--rx', `${(0.5 - y) * 7}deg`);
      card.style.setProperty('--ry', `${(x - 0.5) * 9}deg`);
      card.style.setProperty('--gx', `${x * 100}%`);
      card.style.setProperty('--gy', `${y * 100}%`);
    });
    card.addEventListener('pointerleave', () => { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); });
  });
}

window.ArcadeTheme?.mount(document.getElementById('themeBtn'));
mountAccount(document.getElementById('hubAcct'));
