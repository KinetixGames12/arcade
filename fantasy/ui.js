// Small DOM helpers shared by the fantasy views.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastEl, toastT;
export function toast(msg, ms = 2600) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'ar-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// Opens a dialog; returns {el, close}. `html` is trusted markup built with esc().
export function modal(html, { wide = false, onClose } = {}) {
  const d = document.createElement('dialog');
  d.className = `fx-modal${wide ? ' wide' : ''}`;
  d.innerHTML = `<button type="button" class="fx-x" aria-label="Close">✕</button><div class="fx-modal-in">${html}</div>`;
  document.body.appendChild(d);
  const close = () => { if (d.open) d.close(); };
  d.addEventListener('close', () => { d.remove(); onClose?.(); });
  d.querySelector('.fx-x').onclick = close;
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  d.showModal();
  return { el: d, close };
}

export function confirmBox(title, body, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal(`<h2 class="fx-h2">${esc(title)}</h2><p class="ar-muted">${esc(body)}</p>
      <div class="fx-row end"><button class="ar-btn ghost" data-a="no">Cancel</button><button class="ar-btn${danger ? ' danger' : ''}" data-a="yes">${esc(okLabel)}</button></div>`,
    { onClose: () => { if (!answered) resolve(false); } });
    m.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      answered = true; resolve(a === 'yes'); m.close();
    });
  });
}

export const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(d));
export const pct = (n) => (n ? n.toFixed(3).replace(/^0/, '') : '.000');

export function timeAgo(t) {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function teamBadge(t, size = 34) {
  if (!t) return '';
  return `<span class="fx-badge" style="--c:${esc(t.color)};--s:${size}px" aria-hidden="true">${esc(initials(t.name))}</span>`;
}

export function busy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('busy', on);
}
