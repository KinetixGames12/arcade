// Opens a Kinetix Game Review for the game in a tab. Triggered by the
// on-page button, the popup, the keyboard shortcut or (if switched on) the
// end of a game. Nothing is collected or sent anywhere except the public
// Lichess / chess.com APIs and the Kinetix page you open.
import { parseUrl, reviewLink } from './core.js';

const api = globalThis.browser ?? globalThis.chrome;

async function playersIn(tabId) {
  try { return (await api.tabs.sendMessage(tabId, { type: 'kx-players' }))?.players || []; } catch { return []; }
}

export async function reviewTab(tab, players) {
  const game = parseUrl(tab.url || '');
  if (!game) return { ok: false, error: 'Open a chess.com or Lichess game page first.' };
  try {
    const link = await reviewLink(game, players ?? (game.site === 'chesscom' ? await playersIn(tab.id) : []));
    await api.tabs.create({ url: link, index: tab.index + 1 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

api.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg?.type === 'kx-review') {
    const tab = msg.tab || sender.tab;
    reviewTab(tab, msg.players).then(send);
    return true;
  }
  return false;
});

api.commands?.onCommand.addListener(async (cmd) => {
  if (cmd !== 'review-game') return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const r = await reviewTab(tab);
  if (!r.ok) api.tabs.sendMessage(tab.id, { type: 'kx-toast', text: r.error }).catch(() => {});
});
