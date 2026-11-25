// On chess.com and Lichess game pages: adds a "Review in Kinetix" button by
// the board and (only if you switch it on) opens the review when the game
// ends. It never reads or shows anything during a live game.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const site = location.hostname.includes('lichess') ? 'lichess' : 'chesscom';
  let btn, toastEl, gameKey = location.pathname, autoDone = false;

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

  async function review(auto = false) {
    if (!btn) return;
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Opening review…';
    try {
      const r = await api.runtime.sendMessage({ type: 'kx-review', players: players() });
      if (!r?.ok && !auto) toast(r?.error || 'Something went wrong.');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Review in Kinetix';
    }
  }

  function place() {
    if (!btn) return;
    const b = board();
    const r = b?.getBoundingClientRect();
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
    // The button shows on game pages; the review itself refuses unfinished games.
    const show = isGamePage();
    if (!show) { btn?.remove(); btn = null; return; }
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'kx-btn';
      btn.type = 'button';
      btn.title = 'Open a full Game Review of this finished game on Kinetix (Alt+Shift+K)';
      btn.innerHTML = `<img alt="" src="${api.runtime.getURL('icons/icon-48.png')}"><span>Review in Kinetix</span>`;
      btn.addEventListener('click', () => review(false));
      document.documentElement.appendChild(btn);
    }
    place();
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
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, { passive: true });
  tick();
})();
