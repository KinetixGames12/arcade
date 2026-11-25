// On chess.com and Lichess game pages: adds a "Review in Kinetix" button next
// to the site's own post-game buttons (floating by the board when there are
// none) and, only if you switch it on, opens the review when the game ends.
// It never reads or shows anything during a live game.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const site = location.hostname.includes('lichess') ? 'lichess' : 'chesscom';
  let toastEl, gameKey = location.pathname, autoDone = false;

  const isGamePage = () => site === 'lichess'
    ? /^\/[A-Za-z0-9]{8}([A-Za-z0-9]{4})?(\/(white|black))?\/?$/.test(location.pathname)
    : /\/game\/(live|daily)\/\d+|\/(live|daily)\/game\/\d+|^\/game\/\d+/.test(location.pathname);

  function players() {
    const sel = ['.user-username-component', '[data-test-element="user-tagline-username"]', '.cc-user-username-component', '.user-tagline-username'];
    const out = [];
    for (const s of sel) document.querySelectorAll(s).forEach((el) => { const t = el.textContent.trim(); if (t && !out.includes(t)) out.push(t); });
    return out.slice(0, 4);
  }

  function board() {
    return document.querySelector(site === 'lichess' ? 'cg-container, .cg-wrap' : 'wc-chess-board, chess-board, #board-layout-chessboard, .board');
  }

  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'kx-toast';
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove('show'), 4500);
  }

  // Buttons we've added, keyed by where they live: 'float' or a page container.
  const buttons = new Map();
  const LABEL = 'Review in Kinetix';

  async function review(auto = false) {
    const all = [...buttons.values()];
    all.forEach((b) => { b.disabled = true; b.querySelector('.kx-label').textContent = 'Opening review…'; });
    try {
      const r = await api.runtime.sendMessage({ type: 'kx-review', players: players() });
      if (!r?.ok && !auto) toast(r?.error || 'Something went wrong.');
    } finally {
      all.forEach((b) => { b.disabled = false; b.querySelector('.kx-label').textContent = LABEL; });
    }
  }

  // Spots next to the site's own post-game buttons, like other review extensions use.
  function slots() {
    if (site === 'chesscom') {
      // Every chess.com "Game Review" button (sidebar, game-over popup, the page
      // you land on after playing): found by its link or label, not by layout
      // classes, which differ between those screens and change over time.
      const out = new Map();
      for (const el of document.querySelectorAll('a, button')) {
        if (el.closest('.kx-side')) continue;
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
        const isReview = /[?&]tab=review/.test(el.getAttribute('href') || '') || /^game review$/i.test(label);
        if (!isReview || !el.parentElement || out.has(el.parentElement)) continue;
        out.set(el.parentElement, { c: el.parentElement, ref: el, kind: 'cc' });
      }
      return [...out.values()];
    }
    return [...document.querySelectorAll('.rcontrols .follow-up')].map((c) => ({ c, ref: c.firstElementChild, kind: 'li' }));
  }

  function make(kind, ref) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = 'Open a full Game Review of this finished game on Kinetix (Alt+Shift+K)';
    if (kind === 'cc') {
      // Borrow chess.com's own button classes (secondary look, same size as Game Review).
      b.className = `${(ref?.className || '').replace(/primary/g, 'secondary')} kx-side kx-cc`;
      ['data-size', 'data-full-width', 'data-align'].forEach((a) => ref?.hasAttribute(a) && b.setAttribute(a, ref.getAttribute(a)));
      b.setAttribute('data-variant', 'secondary');
    } else if (kind === 'li') {
      b.className = 'fbt kx-side kx-li';
    } else {
      b.className = 'kx-btn';
    }
    b.innerHTML = `<img alt="" src="${api.runtime.getURL('icons/icon-48.png')}"><span class="kx-label">${LABEL}</span>`;
    b.addEventListener('click', () => review(false));
    return b;
  }

  function placeFloat() {
    const btn = buttons.get('float');
    if (!btn) return;
    const r = board()?.getBoundingClientRect();
    if (r && r.width > 100) {
      btn.style.position = 'fixed';
      btn.style.left = `${Math.min(window.innerWidth - btn.offsetWidth - 8, r.right - btn.offsetWidth)}px`;
      btn.style.top = `${Math.min(window.innerHeight - btn.offsetHeight - 8, r.bottom + 8)}px`;
      btn.style.right = btn.style.bottom = 'auto';
    } else {
      btn.style.left = btn.style.top = 'auto';
      btn.style.right = '16px';
      btn.style.bottom = '16px';
    }
  }

  function ensure() {
    // Buttons show on game pages; the review itself refuses unfinished games.
    if (!isGamePage()) { buttons.forEach((b) => b.remove()); buttons.clear(); return; }
    const found = slots();
    for (const [key, b] of buttons) if (key !== 'float' && (!key.isConnected || !b.isConnected)) { b.remove(); buttons.delete(key); }
    for (const { c, ref, kind } of found) {
      if (buttons.has(c)) continue;
      const b = make(kind, ref);
      // Above the site's main button (Game Review on chess.com), matching its width.
      c.insertBefore(b, ref && ref.parentElement === c ? ref : c.firstChild);
      buttons.set(c, b);
    }
    // Floating pill only while the page has no post-game button row to join.
    const docked = [...buttons.keys()].some((k) => k !== 'float');
    if (docked) { buttons.get('float')?.remove(); buttons.delete('float'); }
    else if (!buttons.has('float')) { const b = make('float'); document.documentElement.appendChild(b); buttons.set('float', b); }
    placeFloat();
  }

  async function maybeAuto() {
    if (autoDone || !isGamePage()) return;
    const ended = site === 'lichess' ? !!document.querySelector('.result-wrap') : !!document.querySelector('.game-over-modal-content, .game-over-header-component');
    if (!ended) return;
    const { autoOpen } = await api.storage.local.get('autoOpen');
    if (!autoOpen) return;
    autoDone = true;
    review(true);
  }

  api.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg?.type === 'kx-players') { send({ players: players() }); return true; }
    if (msg?.type === 'kx-toast') toast(msg.text);
    return false;
  });

  const tick = () => {
    if (location.pathname !== gameKey) { gameKey = location.pathname; autoDone = false; }
    ensure();
    maybeAuto();
  };
  new MutationObserver(() => { clearTimeout(tick.t); tick.t = setTimeout(tick, 300); }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', placeFloat);
  window.addEventListener('scroll', placeFloat, { passive: true });
  tick();
})();
