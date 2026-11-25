// Kinetix chess board: renders a position with animated pieces, handles
// click/drag moves, premoves, right-click annotations and move badges.
// It knows nothing about the rules: the caller passes `legal(square)`
// (chess.js verbose moves) and `premoveDests(square)` (squares).
import { badgeSvg } from './badges.js?v=1';

const FILES = 'abcdefgh';
export const PIECE_SETS = { cburnett: 'Classic', merida: 'Merida', chessnut: 'Chessnut', fantasy: 'Fantasy', celtic: 'Celtic', spatial: 'Spatial' };
// Annotation colours: right-click, or with Shift / Ctrl(⌘) / Alt.
const SHAPE = { red: 'rgba(235,97,80,.85)', green: 'rgba(21,160,60,.85)', blue: 'rgba(56,139,253,.85)', yellow: 'rgba(230,180,0,.9)' };

export class Board {
  constructor(el, opts) {
    this.el = el;
    this.opts = opts; // { legal(sq), onMove(from,to,promo), premoveDests(sq), onPremove(pm|null), pieceSet }
    this.state = { fen: null, orientation: 'white', lastMove: null, check: null, arrows: [], movable: false, premovable: false, badge: null, color: 'w' };
    this.pieceSet = opts.pieceSet || 'cburnett';
    this.selected = null;
    this.drag = null;
    this.premoves = []; // queued premoves, played in order: [{ from, to, promotion }]
    this.shapes = { arrows: [], marks: {} };
    this.pieceEls = new Map(); // square → element
    el.classList.add('cb-board');
    el.innerHTML = '<div class="cb-squares"></div><div class="cb-pieces"></div><svg class="cb-arrows" viewBox="0 0 800 800" aria-hidden="true"></svg><div class="cb-badge" hidden></div><div class="cb-promo" hidden></div>';
    this.squaresEl = el.querySelector('.cb-squares');
    this.piecesEl = el.querySelector('.cb-pieces');
    this.arrowsEl = el.querySelector('.cb-arrows');
    this.badgeEl = el.querySelector('.cb-badge');
    this.promoEl = el.querySelector('.cb-promo');
    let html = '';
    for (let i = 0; i < 64; i++) html += '<div class="cb-sq"></div>';
    this.squaresEl.innerHTML = html;
    this.sqEls = [...this.squaresEl.children];
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', (e) => this.onDrag(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => this.cancelDrag());
  }

  setPieceSet(name) {
    if (!PIECE_SETS[name]) return;
    this.pieceSet = name;
    this.pieceEls.forEach((p, sq) => { p.style.backgroundImage = `url(${this.src(p.dataset.p)})`; });
  }
  src(code) { return `vendor/pieces/${this.pieceSet}/${code[0]}${code[1].toUpperCase()}.svg`; }

  set(patch) {
    const fenChanged = 'fen' in patch && patch.fen !== this.state.fen;
    Object.assign(this.state, patch);
    if (fenChanged) {
      this.shapes = { arrows: [], marks: {} };
      // Keep your selected piece when the opponent moves, as long as it is still yours to move or premove.
      const keep = this.selected && (this.state.movable || this.state.premovable) && this.mine(this.displayMap()[this.selected]);
      if (!keep) this.selected = null;
      if (this.drag && this.displayMap()[this.drag.sq] !== this.drag.el.dataset.p) this.cancelDrag();
    }
    if ('movable' in patch && !patch.movable && !this.state.premovable) this.selected = null;
    this.render(fenChanged);
  }

  setPremoves(list) { this.premoves = list; this.render(false); }

  // The position as you see it: the real one with your queued premoves already played.
  displayMap() {
    const map = this.pieceMap();
    for (const { from, to } of this.premoves) {
      const code = map[from];
      if (!code) continue;
      delete map[from];
      const df = FILES.indexOf(to[0]) - FILES.indexOf(from[0]);
      if (code[1] === 'k' && Math.abs(df) === 2) { // castling: bring the rook across
        const rank = from[1], rookFrom = (df > 0 ? 'h' : 'a') + rank, rookTo = (df > 0 ? 'f' : 'd') + rank;
        if (map[rookFrom]) { map[rookTo] = map[rookFrom]; delete map[rookFrom]; }
      }
      map[to] = code[1] === 'p' && (to[1] === '8' || to[1] === '1') ? `${code[0]}q` : code;
    }
    return map;
  }

  // board coordinates ↔ squares
  xy(sq) {
    const f = FILES.indexOf(sq[0]), r = Number(sq[1]) - 1;
    return this.state.orientation === 'white' ? [f, 7 - r] : [7 - f, r];
  }
  sqAt(x, y) { return this.state.orientation === 'white' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1); }
  squareAt(clientX, clientY) {
    const r = this.el.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * 8), y = Math.floor(((clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return this.sqAt(x, y);
  }

  pieceMap(fen = this.state.fen) {
    const map = {};
    if (!fen) return map;
    fen.split(' ')[0].split('/').forEach((row, ri) => {
      let fi = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) fi += Number(ch);
        else { map[FILES[fi] + (8 - ri)] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase(); fi++; }
      }
    });
    return map;
  }

  myColor() { return this.state.color; }
  mine(code) { return code && code[0] === this.myColor(); }

  render(animate) {
    const { lastMove, check } = this.state;
    const pieces = this.displayMap();
    const preSq = new Set(this.premoves.flatMap((p) => [p.from, p.to]));
    const premoveMode = !this.state.movable && this.state.premovable;
    const dests = new Set(this.selected
      ? (premoveMode ? (this.opts.premoveDests?.(this.selected) || []) : this.opts.legal(this.selected).map((m) => m.to))
      : []);
    // squares
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sq = this.sqAt(x, y);
      const el = this.sqEls[y * 8 + x];
      // a1 is dark: file index 0 + rank 1 is odd, so light squares have an even sum.
      const light = (FILES.indexOf(sq[0]) + Number(sq[1])) % 2 === 0;
      const cls = ['cb-sq', light ? 'l' : 'd'];
      if (lastMove && (sq === lastMove[0] || sq === lastMove[1])) cls.push('last');
      if (sq === this.selected) cls.push('sel');
      if (sq === check) cls.push('incheck');
      if (preSq.has(sq)) cls.push('pre');
      if (dests.has(sq)) cls.push(pieces[sq] ? 'cap' : 'dest');
      if (this.shapes.marks[sq]) cls.push(`mk-${this.shapes.marks[sq]}`);
      el.className = cls.join(' ');
      el.dataset.sq = sq;
      let coord = '';
      if (y === 7) coord += `<i class="cf">${sq[0]}</i>`;
      if (x === 0) coord += `<i class="cr">${sq[1]}</i>`;
      if (el.innerHTML !== coord) el.innerHTML = coord;
    }
    this.renderPieces(pieces, animate);
    this.renderArrows();
    this.renderBadge();
  }

  // Reuse piece elements so moves (and castling, captures, navigation) glide.
  renderPieces(pieces, animate) {
    const old = this.pieceEls;
    const next = new Map();
    const free = [];
    for (const [sq, el] of old) {
      if (pieces[sq] === el.dataset.p) { next.set(sq, el); } else free.push([sq, el]);
    }
    const place = (el, sq, anim) => {
      const [x, y] = this.xy(sq);
      el.classList.toggle('anim', !!anim);
      el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    };
    for (const [sq, code] of Object.entries(pieces)) {
      if (next.has(sq)) {
        // Leave a piece you are dragging under your finger.
        if (!(this.drag?.moved && this.drag.el === next.get(sq))) place(next.get(sq), sq, false);
        continue;
      }
      // nearest vacated element with the same piece → animate it here
      let bi = -1, bd = 99;
      free.forEach(([fsq, el], i) => {
        if (el.dataset.p !== code) return;
        const [ax, ay] = this.xy(fsq), [bx, by] = this.xy(sq);
        const d = Math.abs(ax - bx) + Math.abs(ay - by);
        if (d < bd) { bd = d; bi = i; }
      });
      let el;
      if (bi >= 0 && animate !== false) {
        el = free.splice(bi, 1)[0][1];
        requestAnimationFrame(() => place(el, sq, true));
      } else {
        el = document.createElement('div');
        el.className = 'cb-piece';
        el.dataset.p = code;
        el.style.backgroundImage = `url(${this.src(code)})`;
        place(el, sq, false);
        if (animate) el.classList.add('appear');
        this.piecesEl.appendChild(el);
      }
      next.set(sq, el);
    }
    for (const [, el] of free) {
      el.classList.add('gone');
      setTimeout(() => el.remove(), animate ? 180 : 0);
    }
    this.pieceEls = next;
  }

  arrowSvg(a, idx) {
    const [x1, y1] = this.xy(a.from), [x2, y2] = this.xy(a.to);
    const c = (v) => v * 100 + 50;
    const ax = c(x1), ay = c(y1), bx = c(x2), by = c(y2);
    const len = Math.hypot(bx - ax, by - ay);
    if (!len) return '';
    const w = a.width || 14;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const head = w * 2.4;
    const ex = bx - ux * head * 0.9, ey = by - uy * head * 0.9;
    const px = -uy, py = ux;
    const sx = ax + ux * 18, sy = ay + uy * 18;
    return `<g opacity="${a.opacity ?? 1}"><line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${a.color}" stroke-width="${w}" stroke-linecap="round"/>
      <polygon points="${bx},${by} ${ex + px * head * 0.6},${ey + py * head * 0.6} ${ex - px * head * 0.6},${ey - py * head * 0.6}" fill="${a.color}"/></g>`;
  }

  renderArrows() {
    const list = [...(this.state.arrows || []), ...this.shapes.arrows.map((a) => ({ ...a, color: SHAPE[a.color] }))];
    if (this.drawing && this.drawing.to && this.drawing.to !== this.drawing.from) list.push({ from: this.drawing.from, to: this.drawing.to, color: SHAPE[this.drawing.color], opacity: 0.6 });
    this.arrowsEl.innerHTML = list.map((a, i) => this.arrowSvg(a, i)).join('');
  }

  renderBadge() {
    const b = this.state.badge;
    if (!b || !b.square || !b.cls) { this.badgeEl.hidden = true; return; }
    const [x, y] = this.xy(b.square);
    this.badgeEl.hidden = false;
    this.badgeEl.style.left = `${(x + 1) * 12.5}%`;
    this.badgeEl.style.top = `${y * 12.5}%`;
    const key = `${b.square}-${b.cls}`;
    if (this.badgeEl.dataset.k !== key) { this.badgeEl.dataset.k = key; this.badgeEl.innerHTML = badgeSvg(b.cls, 26); this.badgeEl.classList.remove('pop'); void this.badgeEl.offsetWidth; this.badgeEl.classList.add('pop'); }
  }

  shapeColor(e) { return e.shiftKey ? 'green' : (e.ctrlKey || e.metaKey) ? 'blue' : e.altKey ? 'yellow' : 'red'; }

  onDown(e) {
    if (!this.promoEl.hidden) return;
    const sq = this.squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (e.button === 2) {
      e.preventDefault();
      // Right-click cancels every queued premove first; otherwise it draws.
      if (this.premoves.length) { this.clearPremoves(); return; }
      this.drawing = { from: sq, to: sq, color: this.shapeColor(e) };
      return;
    }
    if (e.button !== 0) return;
    // left click clears drawings
    const hadShapes = this.shapes.arrows.length || Object.keys(this.shapes.marks).length;
    if (hadShapes) { this.shapes = { arrows: [], marks: {} }; }
    const pieces = this.displayMap();
    const canAct = this.state.movable || this.state.premovable;
    if (!canAct) { if (hadShapes) this.render(false); this.opts.onIdleTap?.(e); return; }
    const premoveMode = !this.state.movable && this.state.premovable;
    // Clicking anywhere but one of your pieces, with nothing selected, cancels the premoves.
    if (this.premoves.length && !this.selected && !this.mine(pieces[sq])) { this.clearPremoves(); return; }
    // In premove mode a click on your own piece selects it rather than premoving onto it.
    const ownTarget = premoveMode && this.mine(pieces[sq]);
    if (this.selected && this.selected !== sq && !ownTarget && this.targetOk(sq)) { this.tryMove(this.selected, sq); return; }
    if (this.mine(pieces[sq])) {
      this.selected = sq;
      this.startDrag(e, sq);
      this.render(false);
    } else {
      this.selected = null;
      this.render(false);
      this.opts.onIdleTap?.(e);
    }
  }

  targetOk(sq) {
    const premoveMode = !this.state.movable && this.state.premovable;
    if (premoveMode) return (this.opts.premoveDests?.(this.selected) || []).includes(sq);
    return this.opts.legal(this.selected).some((m) => m.to === sq);
  }

  startDrag(e, sq) {
    const el = this.pieceEls.get(sq);
    if (!el) return;
    const r = this.el.getBoundingClientRect();
    this.drag = { sq, el, r, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
  }

  onDrag(e) {
    if (this.drawing) {
      const sq = this.squareAt(e.clientX, e.clientY);
      if (sq && sq !== this.drawing.to) { this.drawing.to = sq; this.renderArrows(); }
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    const size = d.r.width / 8;
    d.el.classList.add('dragging');
    d.el.classList.remove('anim');
    d.el.style.transform = `translate(${e.clientX - d.r.left - size / 2}px, ${e.clientY - d.r.top - size / 2}px) scale(1.12)`;
    const over = this.squareAt(e.clientX, e.clientY);
    this.sqEls.forEach((s) => s.classList.toggle('over', s.dataset.sq === over));
  }

  onUp(e) {
    if (this.drawing) {
      const { from, to, color } = this.drawing;
      this.drawing = null;
      if (from === to) {
        if (this.shapes.marks[from] === color) delete this.shapes.marks[from]; else this.shapes.marks[from] = color;
      } else {
        const i = this.shapes.arrows.findIndex((a) => a.from === from && a.to === to);
        if (i >= 0 && this.shapes.arrows[i].color === color) this.shapes.arrows.splice(i, 1);
        else if (i >= 0) this.shapes.arrows[i].color = color;
        else this.shapes.arrows.push({ from, to, color });
      }
      this.render(false);
      return;
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.sqEls.forEach((s) => s.classList.remove('over'));
    d.el.classList.remove('dragging');
    if (!d.moved) return;
    const to = this.squareAt(e.clientX, e.clientY);
    if (to && to !== d.sq && this.targetOk(to)) { this.tryMove(d.sq, to, true); return; }
    this.render(false);
  }

  cancelDrag() {
    if (this.drag) { this.drag.el.classList.remove('dragging'); this.drag = null; this.render(false); }
    this.drawing = null;
  }

  clearPremoves() {
    this.premoves = [];
    this.selected = null;
    this.opts.onPremove?.([]);
    this.render(false);
  }

  tryMove(from, to, dragged) {
    const premoveMode = !this.state.movable && this.state.premovable;
    const code = this.displayMap()[from];
    const lastRank = (code === 'wp' && to[1] === '8') || (code === 'bp' && to[1] === '1');
    this.selected = null;
    if (premoveMode) {
      this.premoves = [...this.premoves, { from, to, promotion: lastRank ? 'q' : undefined }];
      this.opts.onPremove?.(this.premoves);
      this.render(dragged ? false : undefined);
      return;
    }
    if (lastRank && this.opts.legal(from).some((m) => m.to === to && m.promotion)) { this.askPromotion(from, to, code[0]); return; }
    if (dragged) {
      // drop instantly where it was released
      const el = this.pieceEls.get(from);
      if (el) { el.classList.remove('anim'); const [x, y] = this.xy(to); el.style.transform = `translate(${x * 100}%, ${y * 100}%)`; this.pieceEls.delete(from); this.pieceEls.set(to, el); const cap = [...this.piecesEl.children].find((p) => p !== el && p.style.transform === el.style.transform); cap?.remove(); }
    }
    this.opts.onMove(from, to);
  }

  askPromotion(from, to, color) {
    const [x] = this.xy(to);
    const down = this.xy(to)[1] === 0;
    this.promoEl.hidden = false;
    this.promoEl.innerHTML = ['q', 'n', 'r', 'b'].map((t, i) => `<button type="button" data-promo="${t}" style="left:${x * 12.5}%;top:${(down ? i : 7 - i) * 12.5}%;background-image:url(${this.src(color + t)})" aria-label="Promote to ${{ q: 'queen', n: 'knight', r: 'rook', b: 'bishop' }[t]}"></button>`).join('');
    const done = (ev) => {
      const b = ev.target.closest('[data-promo]');
      this.promoEl.hidden = true;
      this.promoEl.innerHTML = '';
      this.promoEl.removeEventListener('pointerdown', done);
      if (b) this.opts.onMove(from, to, b.dataset.promo); else this.render(false);
      ev.stopPropagation();
    };
    this.promoEl.addEventListener('pointerdown', done);
  }
}
