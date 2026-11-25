// Kinetix review extension: shared logic (background worker, popup and tests).
// Only finished games are sent: Lichess exports say "*" while a game is
// running, and chess.com only lists games in its archive once they end.
export const KINETIX_CHESS = 'https://kinetixgames12.github.io/arcade/chess/';

export class NotFinished extends Error {}

const LICHESS_RESERVED = new Set(['training', 'analysis', 'study', 'broadcast', 'tv', 'games', 'practice', 'coach', 'learn', 'streamer', 'player', 'team', 'forum', 'blog', 'editor', 'paste', 'tournament', 'swiss', 'simul', 'video', 'variant', 'racer', 'storm', 'streak', 'account', 'login', 'signup', 'inbox', 'insights', 'opening', 'about', 'source', 'patron', 'features', 'mobile', 'lag', 'contact', 'blind', 'image', 'faq']);

// {site: 'lichess'|'chesscom', id} for a game page URL, else null.
export function parseUrl(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;
  if (host === 'lichess.org') {
    const m = path.match(/^\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:\/(?:white|black))?\/?$/);
    if (m && !LICHESS_RESERVED.has(m[1].toLowerCase())) return { site: 'lichess', id: m[1] };
    return null;
  }
  if (host === 'chess.com') {
    const m = path.match(/^\/(?:analysis\/)?game\/(live|daily)\/(\d+)/) || path.match(/^\/(live|daily)\/game\/(\d+)/) || path.match(/^\/game\/(\d+)/);
    if (!m) return null;
    return m.length === 3 ? { site: 'chesscom', kind: m[1], id: m[2] } : { site: 'chesscom', kind: 'live', id: m[1] };
  }
  return null;
}

export async function lichessPgn(id) {
  const r = await fetch(`https://lichess.org/game/export/${id}?clocks=false&evals=false&literate=false`, { headers: { Accept: 'application/x-chess-pgn' } });
  if (r.status === 404) throw new Error('Lichess has no game with that id.');
  if (!r.ok) throw new Error(`Lichess said ${r.status}.`);
  const pgn = await r.text();
  if (/\[Result "\*"\]/.test(pgn)) throw new NotFinished('This game is still being played. Kinetix only reviews finished games.');
  return pgn;
}

// chess.com's public API lists finished games by player and month.
export async function chesscomPgn(id, players = [], monthsBack = 2) {
  const names = [...new Set(players.map((p) => String(p).trim().toLowerCase()).filter((p) => /^[a-z0-9_-]{2,30}$/.test(p)))];
  if (!names.length) throw new Error('Couldn’t read the players’ names from this page. Open the finished game’s page and try again.');
  const now = new Date();
  for (const name of names) {
    for (let k = 0; k <= monthsBack; k++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
      const url = `https://api.chess.com/pub/player/${name}/games/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      let data;
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        data = await r.json();
      } catch { continue; }
      const g = (data.games || []).find((x) => String(x.url || '').replace(/\/$/, '').endsWith(`/${id}`));
      if (g?.pgn) return g.pgn;
    }
  }
  throw new NotFinished('That game isn’t in chess.com’s public archive yet. Kinetix only reviews finished games. If it just ended, wait a minute and try again.');
}

export function b64url(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The Kinetix link that opens a full Game Review.
export async function reviewLink(game, players) {
  if (game.site === 'lichess') {
    await lichessPgn(game.id); // checks the game is finished
    return `${KINETIX_CHESS}#lichess=${game.id}`;
  }
  const pgn = await chesscomPgn(game.id, players);
  return `${KINETIX_CHESS}#review=${b64url(pgn)}`;
}
