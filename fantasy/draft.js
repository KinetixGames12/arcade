// Draft room: used by live league drafts (state from Supabase Realtime) and
// by mock drafts against bots (state kept in this browser).
import { esc, $, $$, toast, teamBadge } from './ui.js?v=2';
import { SPORTS, slotOk, slotName, headshot, rosterSize } from './sports.js?v=2';

export const teamOnClock = (order, pick) => {
  const n = order.length, r = Math.floor((pick - 1) / n), i = (pick - 1) % n;
  return order[r % 2 ? n - 1 - i : i];
};

// Same idea as private.autopick in SQL: queue first, then best ADP that
// still fits the roster; kickers and defenses wait for the last two rounds.
export function bestPick(sport, settings, pool, takenSet, mine, round, { queue = [], noise = 0 } = {}) {
  for (const id of queue) if (!takenSet.has(id) && pool.has(id)) return id;
  const rounds = rosterSize(settings);
  const slots = settings.slots;
  const have = {};
  for (const id of mine) { const p = pool.get(id); if (p) have[p.pos] = (have[p.pos] || 0) + 1; }
  const needK = slots.includes('K') && !have.K, needD = slots.includes('DEF') && !have.DEF;
  // Starting spots still empty: when the picks left can only just fill them, fill them first.
  const req = {};
  for (const x of slots) if (!['FLEX', 'SFLEX', 'G', 'F', 'UTIL'].includes(x)) req[x] = (req[x] || 0) + 1;
  const needPos = Object.keys(req).filter((x) => (have[x] || 0) < req[x]);
  const deficit = needPos.reduce((n, x) => n + req[x] - (have[x] || 0), 0);
  const must = deficit >= rounds - round + 1;
  const ok = (p) => {
    if (must && !(p.positions || [p.pos]).some((x) => needPos.includes(x))) return false;
    const cnt = have[p.pos] || 0;
    if (sport === 'nfl') {
      if (round >= rounds - 1 && (needK || needD)) {
        if (round === rounds) return needK ? p.pos === 'K' : p.pos === 'DEF';
        return needD ? p.pos === 'DEF' : p.pos === 'K';
      }
      if (p.pos === 'K' || p.pos === 'DEF') return cnt < 1 && round >= rounds - 1;
      const cap = slots.filter((s) => s === p.pos).length
        + (['RB', 'WR', 'TE'].includes(p.pos) ? slots.filter((s) => s === 'FLEX' || s === 'SFLEX').length : 0)
        + (p.pos === 'QB' ? slots.filter((s) => s === 'SFLEX').length + 1 : p.pos === 'TE' ? 1 : 3);
      return cnt < cap;
    }
    return cnt < 5;
  };
  const cands = [];
  for (const p of byAdp(pool)) {
    if (takenSet.has(p.id) || !ok(p)) continue;
    cands.push(p.id);
    if (cands.length > noise) break;
  }
  if (!cands.length) return byAdp(pool).find((p) => !takenSet.has(p.id))?.id;
  return cands[Math.floor(Math.random() * cands.length * Math.random())] ?? cands[0];
}

const adpCache = new WeakMap();
const rankCache = new WeakMap();
function rankOf(pool, id) {
  if (!rankCache.has(pool)) rankCache.set(pool, new Map(byAdp(pool).map((p, i) => [p.id, i + 1])));
  return rankCache.get(pool).get(id);
}
function byAdp(pool) {
  if (!adpCache.has(pool)) adpCache.set(pool, [...pool.values()].filter((p) => p.adp != null).sort((a, b) => a.adp - b.adp || (b.proj ?? 0) - (a.proj ?? 0)));
  return adpCache.get(pool);
}

let audio;
function chime() {
  try {
    audio ||= new AudioContext();
    const t = audio.currentTime;
    for (const [i, f] of [[0, 660], [1, 880]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.25);
      o.connect(g).connect(audio.destination); o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.3);
    }
  } catch { /* no audio */ }
}

export class DraftRoom {
  // opts: {sport, settings, teams:[{id,name,color}], pool:Map, myTeamId, offset, live, isCommish,
  //        actions:{pick, setQueue, setAutodraft, tick, pause, undo, sendChat}}
  constructor(el, opts) {
    Object.assign(this, opts);
    this.el = el;
    this.sp = SPORTS[this.sport];
    this.view = { q: '', pos: 'ALL', side: 'queue', mobile: 'players', showTaken: false };
    this.state = { order: [], pick: 1, deadline: null, paused: false, picks: [], queue: [], autodraft: false, chat: [] };
    this.lastTurnPick = 0;
    this.build();
    this.timer = setInterval(() => this.tickClock(), 250);
  }

  destroy() { clearInterval(this.timer); document.title = this.baseTitle || document.title; }

  get total() { return this.state.order.length * rosterSize(this.settings); }
  get onClock() { return this.state.pick > this.total ? null : teamOnClock(this.state.order, this.state.pick); }
  get done() { return this.state.order.length > 0 && this.state.pick > this.total; }
  team(id) { return this.teams.find((t) => t.id === id); }

  build() {
    this.baseTitle = document.title;
    const posTabs = ['ALL', ...this.sp.positions].map((p) => `<button type="button" data-pos="${p}">${p === 'ALL' ? 'All' : p}</button>`).join('');
    this.el.innerHTML = `
      <div class="dr">
        <header class="dr-clock"></header>
        <div class="dr-strip" aria-label="Upcoming picks"></div>
        <nav class="dr-mtabs ar-tabs" aria-label="Draft sections">
          <button type="button" data-m="players">Players</button><button type="button" data-m="queue">Queue</button>
          <button type="button" data-m="team">My team</button><button type="button" data-m="board">Board</button>${this.actions.sendChat ? '<button type="button" data-m="chat">Chat</button>' : ''}
        </nav>
        <div class="dr-main">
          <section class="dr-players" data-pane="players">
            <div class="dr-tools">
              <input class="ar-input dr-search" type="search" placeholder="Search players" aria-label="Search players">
              <div class="ar-tabs dr-pos">${posTabs}</div>
              <label class="dr-check"><input type="checkbox" class="dr-taken"> Show drafted</label>
            </div>
            <div class="dr-list" role="list"></div>
          </section>
          <aside class="dr-side">
            <nav class="ar-tabs dr-stabs">
              <button type="button" data-s="queue">Queue</button><button type="button" data-s="team">My team</button><button type="button" data-s="board">Board</button>${this.actions.sendChat ? '<button type="button" data-s="chat">Chat</button>' : ''}
            </nav>
            <div class="dr-pane" data-pane="queue"></div>
            <div class="dr-pane" data-pane="team"></div>
            <div class="dr-pane" data-pane="board"></div>
            <div class="dr-pane" data-pane="chat">
              <div class="dr-chat"></div>
              <form class="dr-chatform"><input class="ar-input" maxlength="500" placeholder="Say something…" aria-label="Chat message"><button class="ar-btn sm">Send</button></form>
            </div>
          </aside>
        </div>
      </div>`;
    const root = this.el;
    $('.dr-search', root).addEventListener('input', (e) => { this.view.q = e.target.value; this.renderList(); });
    $('.dr-taken', root).addEventListener('change', (e) => { this.view.showTaken = e.target.checked; this.renderList(); });
    $('.dr-pos', root).addEventListener('click', (e) => { const b = e.target.closest('[data-pos]'); if (!b) return; this.view.pos = b.dataset.pos; this.renderList(); this.syncTabs(); });
    $('.dr-stabs', root).addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; this.view.side = b.dataset.s; this.syncTabs(); });
    $('.dr-mtabs', root).addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; this.view.mobile = b.dataset.m; if (b.dataset.m !== 'players') this.view.side = b.dataset.m; this.syncTabs(); });
    $('.dr-chatform', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const v = inp.value.trim();
      if (!v) return;
      inp.value = '';
      try { await this.actions.sendChat(v); } catch (err) { toast(err.message); }
    });
    root.addEventListener('click', (e) => this.onClick(e));
    this.syncTabs();
  }

  syncTabs() {
    const r = this.el;
    $$('.dr-pos [data-pos]', r).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pos === this.view.pos)));
    $$('.dr-stabs [data-s]', r).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.s === this.view.side)));
    $$('.dr-mtabs [data-m]', r).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === this.view.mobile)));
    $$('.dr-pane', r).forEach((p) => p.classList.toggle('on', p.dataset.pane === this.view.side));
    r.querySelector('.dr').dataset.mobile = this.view.mobile;
  }

  async onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    const a = b.dataset.act;
    try {
      if (a === 'draft') { b.disabled = true; await this.actions.pick(id); }
      else if (a === 'queue') {
        const q = this.state.queue.includes(id) ? this.state.queue.filter((x) => x !== id) : [...this.state.queue, id];
        this.state.queue = q; this.renderList(); this.renderQueue();
        await this.actions.setQueue(q);
      } else if (a === 'up' || a === 'down') {
        const q = [...this.state.queue]; const i = q.indexOf(id); const j = a === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= q.length) return;
        [q[i], q[j]] = [q[j], q[i]];
        this.state.queue = q; this.renderQueue(); await this.actions.setQueue(q);
      } else if (a === 'auto') { await this.actions.setAutodraft(!this.state.autodraft); }
      else if (a === 'pause') { await this.actions.pause(!this.state.paused); }
      else if (a === 'undo') { await this.actions.undo(); }
      else if (a === 'player') { this.onPlayer?.(id); }
    } catch (err) { toast(err.message); b.disabled = false; }
  }

  update(s) {
    const prevPick = this.state.pick;
    Object.assign(this.state, s);
    this.taken = new Set(this.state.picks.map((k) => k.player_id));
    this.state.queue = (this.state.queue || []).filter((id) => !this.taken.has(id));
    const myTurn = this.onClock === this.myTeamId && !this.done;
    if (myTurn && this.lastTurnPick !== this.state.pick) {
      this.lastTurnPick = this.state.pick;
      if (prevPick !== this.state.pick || !this.seenFirst) { chime(); if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([60, 40, 60]); }
    }
    this.seenFirst = true;
    this.renderClock(); this.renderStrip(); this.renderList(); this.renderQueue(); this.renderTeam(); this.renderBoard(); this.renderChat();
  }

  secondsLeft() {
    if (!this.state.deadline || this.state.paused) return null;
    return Math.max(0, (new Date(this.state.deadline).getTime() - (Date.now() + (this.offset || 0))) / 1000);
  }

  tickClock() {
    const left = this.secondsLeft();
    const t = this.el.querySelector('.dr-time');
    if (t) {
      t.textContent = left == null ? (this.state.paused ? 'Paused' : this.onClock === this.myTeamId ? 'GO' : '…') : left >= 3600 ? `${Math.floor(left / 3600)}h ${Math.floor(left % 3600 / 60)}m` : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      const ring = this.el.querySelector('.dr-ring');
      const full = this.isFast() ? 2 : this.settings.pick_seconds;
      if (ring && left != null) ring.style.setProperty('--p', String(Math.min(1, left / full)));
      t.classList.toggle('hot', left != null && left < 10);
    }
    const mine = this.onClock === this.myTeamId && !this.done;
    document.title = mine && Math.floor(Date.now() / 800) % 2 ? '⏰ Your pick!' : this.baseTitle;
    if (left === 0 && this.actions.tick && !this.done && !this.state.paused) {
      const now = Date.now();
      if (!this.lastTick || now - this.lastTick > 1500) { this.lastTick = now; this.actions.tick().catch(() => {}); }
    }
  }

  isFast() { return this.onClock && this.team(this.onClock)?.is_bot; }

  renderClock() {
    const c = this.el.querySelector('.dr-clock');
    if (this.done) {
      c.innerHTML = `<div class="dr-done"><b>The draft is complete!</b><span class="ar-muted">${this.doneNote || 'Rosters are set. Good luck this season.'}</span></div>`;
      return;
    }
    const n = this.state.order.length;
    const t = this.team(this.onClock);
    const mine = this.onClock === this.myTeamId;
    const round = Math.ceil(this.state.pick / n);
    c.className = `dr-clock${mine ? ' mine' : ''}`;
    c.innerHTML = `
      <div class="dr-ring" style="--c:${esc(t?.color || '#888')}"><span class="dr-time">—</span></div>
      <div class="dr-who">
        <span class="ar-eyebrow">${mine ? 'You’re on the clock' : 'On the clock'}</span>
        <b>${teamBadge(t, 26)} ${esc(t?.name || '')}</b>
        <span class="ar-muted">Round ${round} · Pick ${((this.state.pick - 1) % n) + 1} · ${this.state.pick} of ${this.total}</span>
      </div>
      <div class="dr-ctrl">
        ${this.myTeamId ? `<button type="button" class="ar-btn sm ${this.state.autodraft ? '' : 'ghost'}" data-act="auto" title="Pick automatically from your queue, then best available">Autodraft ${this.state.autodraft ? 'on' : 'off'}</button>` : ''}
        ${this.isCommish ? `<button type="button" class="ar-btn sm ghost" data-act="pause">${this.state.paused ? 'Resume' : 'Pause'}</button><button type="button" class="ar-btn sm ghost" data-act="undo">Undo pick</button>` : ''}
      </div>`;
    this.tickClock();
  }

  renderStrip() {
    const s = this.el.querySelector('.dr-strip');
    if (!this.state.order.length) { s.innerHTML = ''; return; }
    const out = [];
    const from = Math.max(1, this.state.pick - 3), to = Math.min(this.total, this.state.pick + 12);
    const byPick = new Map(this.state.picks.map((k) => [k.pick_no, k]));
    for (let p = from; p <= to; p++) {
      const tid = teamOnClock(this.state.order, p);
      const t = this.team(tid);
      const k = byPick.get(p);
      const pl = k && this.pool.get(k.player_id);
      out.push(`<div class="dr-chip${p === this.state.pick ? ' now' : ''}${tid === this.myTeamId ? ' me' : ''}" style="--c:${esc(t?.color)}">
        <span class="dr-chip-n">${Math.ceil(p / this.state.order.length)}.${String(((p - 1) % this.state.order.length) + 1).padStart(2, '0')}</span>
        <span class="dr-chip-t">${esc(t?.name || '')}</span>
        ${pl ? `<span class="dr-chip-p"><i class="pos" style="--pc:${this.sp.colors[pl.pos] || '#888'}">${esc(pl.pos)}</i>${esc(short(pl.name))}</span>` : ''}
      </div>`);
    }
    s.innerHTML = out.join('');
    s.querySelector('.now')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  renderList() {
    const list = this.el.querySelector('.dr-list');
    if (!list || !this.taken) return;
    const q = this.view.q.trim().toLowerCase();
    const mineTurn = this.onClock === this.myTeamId && !this.done && !this.state.paused;
    const rows = [];
    for (const p of byAdp(this.pool)) {
      if (this.view.pos !== 'ALL' && !(p.positions || [p.pos]).includes(this.view.pos)) continue;
      if (q && !p.name.toLowerCase().includes(q) && !(p.team || '').toLowerCase().includes(q)) continue;
      const taken = this.taken.has(p.id);
      if (taken && !this.view.showTaken) continue;
      rows.push(p);
      if (rows.length >= 150) break;
    }
    list.innerHTML = rows.map((p) => {
      const taken = this.taken.has(p.id);
      const queued = this.state.queue.includes(p.id);
      return `<div class="dr-row${taken ? ' taken' : ''}" role="listitem">
        <span class="dr-rank" title="ADP ${p.adp != null ? p.adp.toFixed(1) : '—'}">${rankOf(this.pool, p.id) ?? '—'}</span>
        <button type="button" class="dr-pl" data-act="player" data-id="${esc(p.id)}">
          <img src="${esc(headshot(this.sport, p))}" alt="" loading="lazy">
          <span><b>${esc(p.name)}</b><small><i class="pos" style="--pc:${this.sp.colors[p.pos] || '#888'}">${esc(p.pos)}</i> ${esc(p.team || 'FA')}${p.injury ? ` <em class="inj">${esc(p.injury)}</em>` : ''}</small></span>
        </button>
        <span class="dr-proj" title="Projected ${this.sport === 'nfl' ? 'season points' : 'points per game'}">${p.proj != null ? p.proj.toFixed(this.sport === 'nfl' ? 0 : 1) : '—'}</span>
        <span class="dr-acts">${taken ? '<span class="ar-muted small">Drafted</span>' : `
          ${this.myTeamId ? `<button type="button" class="dr-star${queued ? ' on' : ''}" data-act="queue" data-id="${esc(p.id)}" aria-label="${queued ? 'Remove from' : 'Add to'} queue" title="Queue">★</button>` : ''}
          ${mineTurn ? `<button type="button" class="ar-btn sm" data-act="draft" data-id="${esc(p.id)}">Draft</button>` : ''}`}
        </span>
      </div>`;
    }).join('') || '<p class="ar-muted dr-empty">No players match.</p>';
  }

  renderQueue() {
    const el = this.el.querySelector('[data-pane="queue"]');
    if (!this.myTeamId) { el.innerHTML = '<p class="ar-muted dr-empty">Watching this draft.</p>'; return; }
    const q = this.state.queue;
    const mineTurn = this.onClock === this.myTeamId && !this.done && !this.state.paused;
    el.innerHTML = q.length ? `<ol class="dr-q">${q.map((id, i) => {
      const p = this.pool.get(id);
      return `<li><span class="dr-qn">${i + 1}</span><button type="button" class="dr-pl" data-act="player" data-id="${esc(id)}"><span><b>${esc(p?.name || id)}</b><small><i class="pos" style="--pc:${this.sp.colors[p?.pos] || '#888'}">${esc(p?.pos || '')}</i> ${esc(p?.team || '')}</small></span></button>
        <span class="dr-acts"><button type="button" class="dr-mini" data-act="up" data-id="${esc(id)}" aria-label="Move up">↑</button><button type="button" class="dr-mini" data-act="down" data-id="${esc(id)}" aria-label="Move down">↓</button><button type="button" class="dr-mini" data-act="queue" data-id="${esc(id)}" aria-label="Remove">✕</button>
        ${mineTurn ? `<button type="button" class="ar-btn sm" data-act="draft" data-id="${esc(id)}">Draft</button>` : ''}</span></li>`;
    }).join('')}</ol>` : '<p class="ar-muted dr-empty">Tap ★ next to a player to line them up. If the clock runs out (or autodraft is on), your queue picks first.</p>';
  }

  myRoster(teamId = this.myTeamId) { return this.state.picks.filter((k) => k.team_id === teamId).map((k) => k.player_id); }

  renderTeam() {
    const el = this.el.querySelector('[data-pane="team"]');
    if (!this.myTeamId) { el.innerHTML = ''; return; }
    const ids = this.myRoster();
    const { starters, bench } = fillSlots(this.settings.slots, ids, this.pool);
    el.innerHTML = `<div class="dr-team">${this.settings.slots.map((s, i) => {
      const p = this.pool.get(starters[i]);
      return `<div class="dr-slot"><span class="slot">${esc(slotName(this.sp, s))}</span>${p ? `<span><b>${esc(p.name)}</b> <small class="ar-muted">${esc(p.team || '')}</small></span>` : '<span class="ar-muted">Empty</span>'}</div>`;
    }).join('')}
    ${bench.length || this.settings.bench ? `<div class="dr-benchh">Bench (${bench.length}/${this.settings.bench})</div>` : ''}
    ${bench.map((id) => { const p = this.pool.get(id); return `<div class="dr-slot"><span class="slot">BN</span><span><b>${esc(p?.name)}</b> <small class="ar-muted">${esc(p?.pos)} · ${esc(p?.team || '')}</small></span></div>`; }).join('')}</div>`;
  }

  renderBoard() {
    const el = this.el.querySelector('[data-pane="board"]');
    const n = this.state.order.length;
    if (!n) { el.innerHTML = ''; return; }
    const byPick = new Map(this.state.picks.map((k) => [k.pick_no, k]));
    const rounds = rosterSize(this.settings);
    let html = `<div class="dr-board" style="--n:${n}"><div class="dr-bh">${this.state.order.map((id) => { const t = this.team(id); return `<span class="${id === this.myTeamId ? 'me' : ''}" style="--c:${esc(t?.color)}">${esc(t?.name)}</span>`; }).join('')}</div>`;
    for (let r = 1; r <= rounds; r++) {
      html += '<div class="dr-br">';
      for (let c = 0; c < n; c++) {
        const pickNo = (r - 1) * n + (r % 2 ? c + 1 : n - c);
        const k = byPick.get(pickNo);
        const p = k && this.pool.get(k.player_id);
        html += `<span class="dr-cell${pickNo === this.state.pick ? ' now' : ''}" style="--pc:${p ? this.sp.colors[p.pos] || '#888' : 'transparent'}">${p ? `<b>${esc(short(p.name))}</b><small>${esc(p.pos)} ${esc(p.team || '')}</small>` : `<small class="ar-muted">${r}.${String(((pickNo - 1) % n) + 1).padStart(2, '0')}</small>`}</span>`;
      }
      html += '</div>';
    }
    el.innerHTML = `${html}</div>`;
  }

  renderChat() {
    const el = this.el.querySelector('.dr-chat');
    if (!el || !this.actions.sendChat) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    el.innerHTML = (this.state.chat || []).map((m) => `<p><b style="color:${esc(m.color || 'inherit')}">${esc(m.who)}</b> ${esc(m.body)}</p>`).join('') || '<p class="ar-muted">Trash talk goes here.</p>';
    if (atBottom) el.scrollTop = el.scrollHeight;
  }
}

const short = (name) => { const parts = String(name).split(' '); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name; };

// Greedy lineup fill (specific slots first, then flex) for display.
export function fillSlots(slots, ids, pool, scoreOf = (p) => p?.proj ?? 0) {
  const order = slots.map((s, i) => i).sort((a, b) => isFlex(slots[a]) - isFlex(slots[b]) || a - b);
  const left = [...ids].sort((a, b) => scoreOf(pool.get(b)) - scoreOf(pool.get(a)));
  const starters = Array(slots.length).fill(null);
  for (const i of order) {
    const j = left.findIndex((id) => slotOk(slots[i], pool.get(id)?.positions || []));
    if (j >= 0) starters[i] = left.splice(j, 1)[0];
  }
  return { starters, bench: left };
}
const isFlex = (s) => ['FLEX', 'SFLEX', 'G', 'F', 'UTIL'].includes(s);

// Mock draft vs bots, entirely in this browser.
export function runMock(el, { sport, settings, pool, slot, onPlayer, onDone }) {
  const sp = SPORTS[sport];
  const names = sport === 'nfl'
    ? ['Blitz Bots', 'Gridiron Gremlins', 'Hail Mary Machines', 'Turf Tacticians', 'End Zone Engines', 'Pigskin Protocol', 'Red Zone Robots', 'Two-Minute Drill', 'Fourth & Long', 'Play-Action Pros', 'Pocket Passers', 'Goal Line Ghosts', 'Sideline Circuits', 'Huddle Hackers', 'Snap Count']
    : ['Pick & Rollers', 'Fast Break Bots', 'Splash Circuit', 'Glass Cleaners', 'Triple-Double Trouble', 'Full Court Press', 'Bucket Getters', 'Alley-Oop Engine', 'Paint Protectors', 'Corner Three Club', 'Euro Steppers', 'Shot Clock', 'Box Score Bots', 'Dime Droppers', 'And-One AI'];
  const colors = ['#22c55e', '#f97316', '#3b82f6', '#ef4444', '#eab308', '#14b8a6', '#a855f7', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e', '#8b5cf6', '#10b981', '#f59e0b', '#6366f1', '#d946ef'];
  const teams = [];
  let bi = 0;
  for (let i = 0; i < settings.teams; i++) {
    teams.push(i === slot - 1 ? { id: 'me', name: 'You', color: '#d4ff3f' } : { id: `b${i}`, name: names[bi], color: colors[bi++], is_bot: true });
  }
  const st = { order: teams.map((t) => t.id), pick: 1, deadline: null, paused: false, picks: [], queue: [], autodraft: false };
  let timer;
  const room = new DraftRoom(el, {
    sport, settings, teams, pool, myTeamId: 'me', offset: 0, live: false,
    actions: {
      pick: async (id) => { if (room.onClock !== 'me') return; commit(id); },
      setQueue: async (q) => { st.queue = q; },
      setAutodraft: async (on) => { st.autodraft = on; step(); },
    },
  });
  room.onPlayer = onPlayer;
  function commit(id) {
    const tid = teamOnClock(st.order, st.pick);
    st.picks.push({ pick_no: st.pick, team_id: tid, player_id: id });
    st.queue = st.queue.filter((x) => x !== id);
    st.pick++;
    step();
  }
  function step() {
    clearTimeout(timer);
    const total = st.order.length * rosterSize(settings);
    if (st.pick > total) {
      room.doneNote = grade(); room.update({ ...st }); onDone?.(); return;
    }
    const tid = teamOnClock(st.order, st.pick);
    room.update({ ...st, deadline: null });
    if (tid !== 'me' || st.autodraft) {
      const taken = new Set(st.picks.map((k) => k.player_id));
      const mine = st.picks.filter((k) => k.team_id === tid).map((k) => k.player_id);
      const round = Math.ceil(st.pick / st.order.length);
      timer = setTimeout(() => commit(bestPick(sport, settings, pool, taken, mine, round, { queue: tid === 'me' ? st.queue : [], noise: tid === 'me' ? 0 : 3 })), tid === 'me' ? 300 : 450 + Math.random() * 500);
    }
  }
  function grade() {
    const totals = teams.map((t) => {
      const ids = st.picks.filter((k) => k.team_id === t.id).map((k) => k.player_id);
      const { starters } = fillSlots(settings.slots, ids, pool);
      return { t, pts: starters.reduce((s, id) => s + (pool.get(id)?.proj || 0), 0) };
    }).sort((a, b) => b.pts - a.pts);
    const rank = totals.findIndex((x) => x.t.id === 'me') + 1;
    const g = rank === 1 ? 'A+' : rank <= Math.ceil(teams.length * 0.2) ? 'A' : rank <= Math.ceil(teams.length * 0.4) ? 'B' : rank <= Math.ceil(teams.length * 0.7) ? 'C' : 'D';
    return `Draft grade <b class="dr-grade">${g}</b> · your starters project #${rank} of ${teams.length}.`;
  }
  step();
  return room;
}
