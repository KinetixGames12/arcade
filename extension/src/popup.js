import { parseUrl } from './core.js';
const api = globalThis.browser ?? globalThis.chrome;
const $ = (s) => document.querySelector(s);

const [tab] = await api.tabs.query({ active: true, currentWindow: true });
const game = tab && parseUrl(tab.url || '');
$('#state').textContent = game ? `${game.site === 'lichess' ? 'Lichess' : 'chess.com'} game ${game.id}` : 'Open a finished chess.com or Lichess game to review it.';
$('#go').disabled = !game;
$('#go').addEventListener('click', async () => {
  $('#go').disabled = true;
  $('#state').textContent = 'Fetching the game…';
  let players;
  if (game.site === 'chesscom') { try { players = (await api.tabs.sendMessage(tab.id, { type: 'kx-players' }))?.players; } catch { players = []; } }
  const r = await api.runtime.sendMessage({ type: 'kx-review', tab, players });
  if (r?.ok) window.close();
  else { $('#state').textContent = r?.error || 'Something went wrong.'; $('#go').disabled = false; }
});
const { autoOpen } = await api.storage.local.get('autoOpen');
$('#auto').checked = !!autoOpen;
$('#auto').addEventListener('change', (e) => api.storage.local.set({ autoOpen: e.target.checked }));
document.getElementById('ver').textContent = `Version ${(globalThis.browser ?? globalThis.chrome).runtime.getManifest().version}`;
