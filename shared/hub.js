import { GAMES } from './games.js?v=1';
import { mountAccount } from './account.js?v=1';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.getElementById('games').innerHTML = GAMES.map((g) => {
  const inner = `<span class="g-emoji" aria-hidden="true">${esc(g.emoji)}</span><span class="g-name">${esc(g.name)}</span><span class="g-blurb">${esc(g.blurb)}</span>${g.soon ? '<span class="g-soon">Coming soon</span>' : '<span class="g-play">Play →</span>'}`;
  return g.soon
    ? `<div class="g-card soon" style="--accent:${esc(g.accent)}">${inner}</div>`
    : `<a class="g-card" href="${esc(g.slug)}/" style="--accent:${esc(g.accent)}">${inner}</a>`;
}).join('');

mountAccount(document.getElementById('hubAcct'));
