// Warmer: guess the mystery country. Every guess lights up on the globe,
// glowing warmer the closer it is (border to border). One country a day.
// Shapes: world-atlas (ISC) / Natural Earth (public domain). Globe: d3-geo.
import { $, esc, dayNumber, seeded, load, save, stats, recordResult, results, helpDialog, toast } from '../daily/daily.js?v=2';

const GAME = 'warmer';
const day = dayNumber();
const { geoOrthographic, geoPath, geoGraticule10, geoCentroid, geoDistance } = window.d3;
const [topo, facts] = await Promise.all([
  fetch('../daily/data/world-110m.json?v=1').then((r) => r.json()),
  fetch('../daily/data/countries.json?v=2').then((r) => r.json()),
]);
const features = window.topojson.feature(topo, topo.objects.countries).features;
const factById = new Map(facts.map((f) => [f.id, f]));
const countries = features.map((f) => {
  const fact = factById.get(String(f.id ?? f.properties.name)) || { name: f.properties.name, iso2: '', area: 0 };
  return { f, ...fact, name: fact.name || f.properties.name, key: String(f.id ?? f.properties.name), centroid: geoCentroid(f) };
}).filter((c) => c.name);
const norm = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const byName = new Map();
for (const c of countries) for (const n of [c.name, ...(c.alt || [])]) if (!byName.has(norm(n))) byName.set(norm(n), c);
const ALIAS = { usa: 'united states', us: 'united states', america: 'united states', uk: 'united kingdom', britain: 'united kingdom', 'great britain': 'united kingdom', england: 'united kingdom', scotland: 'united kingdom', wales: 'united kingdom', uae: 'united arab emirates', drc: 'democratic republic of the congo', holland: 'netherlands', burma: 'myanmar', 'south korea': 'south korea', korea: 'south korea' };
const flag = (iso) => (/^[A-Z]{2}$/.test(iso || '') ? String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🏳️');

// Border points (sampled) for border-to-border distances.
const pts = new Map();
function points(c) {
  if (pts.has(c.key)) return pts.get(c.key);
  const all = [];
  const g = c.f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) for (const ring of p) for (const pt of ring) all.push(pt);
  const step = Math.max(1, Math.floor(all.length / 350));
  const out = all.filter((_, i) => i % step === 0);
  pts.set(c.key, out);
  return out;
}
function distanceKm(a, b) {
  if (a === b) return 0;
  let best = Infinity;
  const pa = points(a), pb = points(b);
  for (const p of pa) for (const q of pb) { const d = geoDistance(p, q); if (d < best) best = d; }
  const km = best * 6371;
  return km < 40 ? 0 : Math.round(km / 10) * 10;
}

const pool = countries.filter((c) => c.area > 40000).sort((a, b) => a.key.localeCompare(b.key));
const target = pool[Math.floor(seeded(day * 104729)() * pool.length)];
let st = load(`kx.warmer.day${day}`, { guesses: [], done: false, gaveUp: false });
const guessed = () => st.guesses.map((k) => countries.find((c) => c.key === k)).filter(Boolean);

window.ArcadeTheme?.mount($('#themeBtn'));
$('#dayNo').textContent = `#${day}`;
$('#app').innerHTML = `
  <p class="dg-sub" id="hint">Guess any country. Closer countries glow hotter.</p>
  <div class="wm-globe"><canvas id="globe" aria-label="Globe showing your guesses"></canvas></div>
  <form class="wm-form" id="form" autocomplete="off"><input class="ar-input" id="guess" list="names" placeholder="Type a country…" aria-label="Country" enterkeyhint="go"><button class="ar-btn">Guess</button></form>
  <datalist id="names">${countries.map((c) => `<option value="${esc(c.name)}">`).sort().join('')}</datalist>
  <div class="wm-list" id="list"></div>
  <button class="ar-btn ghost sm" id="giveup">Give up</button>`;

const canvas = $('#globe');
const ctx = canvas.getContext('2d');
const proj = geoOrthographic().clipAngle(90);
const path = geoPath(proj, ctx);
let rot = [-target.centroid[0] + 120, -20];
let spin = true, dragging = null, anim = null;

function heat(km) {
  if (km === 0) return '#a3001b';
  const t = Math.max(0, Math.min(1, 1 - km / 9000));
  const stops = [[255, 244, 214], [255, 196, 102], [255, 120, 50], [214, 40, 40]];
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c.join(',')})`;
}

function draw() {
  const size = canvas.clientWidth;
  const dpr = devicePixelRatio || 1;
  if (canvas.width !== size * dpr) { canvas.width = canvas.height = size * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  proj.translate([size / 2, size / 2]).scale(size / 2 - 4).rotate(rot);
  const css = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = css.getPropertyValue('--wm-sea'); ctx.fill();
  ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = css.getPropertyValue('--wm-grid'); ctx.lineWidth = 0.6; ctx.stroke();
  const g = new Map(guessed().map((c) => [c.key, c]));
  for (const c of countries) {
    ctx.beginPath(); path(c.f);
    const isT = (st.done) && c === target;
    ctx.fillStyle = isT ? '#3fbf6b' : g.has(c.key) ? heat(c.km ?? distanceKm(c, target)) : css.getPropertyValue('--wm-land');
    ctx.fill();
    ctx.strokeStyle = css.getPropertyValue('--wm-edge'); ctx.lineWidth = 0.5; ctx.stroke();
  }
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = css.getPropertyValue('--wm-edge'); ctx.lineWidth = 1.2; ctx.stroke();
}

function loop() {
  if (spin && !dragging && !anim) rot = [rot[0] + 0.12, rot[1]];
  draw();
  requestAnimationFrame(loop);
}
function flyTo(c) {
  const [lon, lat] = c.centroid;
  const from = [...rot], to = [-lon, Math.max(-60, Math.min(60, -lat))];
  let d0 = to[0] - from[0]; d0 = ((d0 + 540) % 360) - 180;
  const t0 = performance.now();
  anim = true;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 900), e = 1 - (1 - p) ** 3;
    rot = [from[0] + d0 * e, from[1] + (to[1] - from[1]) * e];
    if (p < 1) requestAnimationFrame(step); else { anim = null; }
  };
  requestAnimationFrame(step);
  spin = false;
}
canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, r: [...rot] }; spin = false; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const k = 180 / canvas.clientWidth;
  rot = [dragging.r[0] + (e.clientX - dragging.x) * k, Math.max(-80, Math.min(80, dragging.r[1] - (e.clientY - dragging.y) * k))];
});
canvas.addEventListener('pointerup', () => { dragging = null; });

function renderList() {
  const list = guessed().map((c) => ({ c, km: c.km ?? (c.km = distanceKm(c, target)) })).sort((a, b) => a.km - b.km);
  $('#list').innerHTML = list.length ? `<p class="wm-count">${st.guesses.length} guess${st.guesses.length === 1 ? '' : 'es'}${list[0] && !st.done ? ` · closest ${list[0].km.toLocaleString()} km` : ''}</p>` + list.map(({ c, km }) => `
    <div class="wm-row${c === target ? ' win' : ''}"><span class="wm-sw" style="background:${c === target ? '#3fbf6b' : heat(km)}"></span><span class="wm-f">${flag(c.iso2)}</span><b>${esc(c.name)}</b><span class="wm-km">${c === target ? 'Found!' : km === 0 ? 'Touching' : `${km.toLocaleString()} km`}</span></div>`).join('') : '';
  $('#giveup').hidden = st.done || !st.guesses.length;
  $('#form').hidden = st.done;
  $('#hint').textContent = st.done ? (st.gaveUp ? `It was ${target.name}.` : `You found ${target.name} in ${st.guesses.length}!`) : 'Guess any country. Closer countries glow hotter.';
}

function finish(soon) {
  if (!st.gaveUp) recordResult(GAME, day, true, Math.min(st.guesses.length, 99)); else recordResult(GAME, day, false, 0);
  const s = stats(GAME);
  const sq = guessed().map((c) => (c === target ? '🟩' : (c.km ?? distanceKm(c, target)) === 0 ? '🟥' : c.km < 1500 ? '🟧' : c.km < 4000 ? '🟨' : '⬜')).join('');
  const shareText = `Warmer #${day} 🌍 ${st.gaveUp ? 'gave up' : `found in ${st.guesses.length}`}\n${sq}\nkinetixgames12.github.io/arcade/warmer/`;
  setTimeout(() => results({
    title: st.gaveUp ? 'Next time!' : st.guesses.length <= 3 ? 'Incredible!' : st.guesses.length <= 8 ? 'Nice find!' : 'Got there!',
    line: `${flag(target.iso2)} <b>${esc(target.name)}</b>`,
    sub: st.gaveUp ? 'The mystery country is shown in green.' : `${st.guesses.length} guesses`,
    statsRow: [[s.played, 'Played'], [s.wins, 'Found'], [s.streak, 'Streak'], [Object.keys(s.dist).length ? Math.min(...Object.keys(s.dist).map(Number)) : '–', 'Best']],
    shareText,
  }), soon ? 900 : 0);
}

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = norm($('#guess').value);
  if (!v) return;
  const c = byName.get(v) || byName.get(ALIAS[v] || '') || (v.length >= 4 ? countries.find((x) => norm(x.name).startsWith(v)) : null);
  if (!c) { toast('Not a country on the map. Pick one from the list.'); return; }
  if (st.guesses.includes(c.key)) { toast('Already guessed'); flyTo(c); return; }
  st.guesses.push(c.key);
  if (c === target) st.done = true;
  save(`kx.warmer.day${day}`, st);
  $('#guess').value = '';
  flyTo(c);
  renderList();
  if (st.done) finish(true);
});
$('#giveup').addEventListener('click', () => {
  if (!confirm('Give up and see today’s country?')) return;
  st.done = true; st.gaveUp = true; save(`kx.warmer.day${day}`, st);
  flyTo(target); renderList(); finish(true);
});
$('#statsBtn').addEventListener('click', () => { if (st.done) finish(false); else { const s = stats(GAME); results({ title: 'Your Warmer stats', line: '', statsRow: [[s.played, 'Played'], [s.wins, 'Found'], [s.streak, 'Streak'], [s.best, 'Best streak']] }); } });
const help = () => helpDialog(`<div class="dg-help"><h2 class="ar-display">How to play Warmer</h2><p>There’s a mystery country. Type any country to guess.</p><p>Each guess lights up on the globe. The <b>hotter</b> its colour, the closer it is to the mystery country (measured border to border). Countries that touch it glow deep red.</p><p>Drag the globe to spin it. Unlimited guesses; fewer is better. A new country every day.</p></div>`);
$('#helpBtn').addEventListener('click', help);
if (!load('kx.warmer.seenHelp', false)) { save('kx.warmer.seenHelp', true); help(); }
renderList();
if (st.done) { flyTo(target); finish(false); }
loop();
