// Run: node test.mjs  (needs network). Checks URL parsing and real PGN fetches.
import { parseUrl, lichessPgn, chesscomPgn, reviewLink, b64url } from './src/core.js';
const ua = globalThis.fetch;
globalThis.fetch = (u, o = {}) => ua(u, { ...o, headers: { 'User-Agent': 'Mozilla/5.0 KinetixReviewTest', ...(o.headers || {}) } });
const cases = {
  'https://lichess.org/h4rgD9HP': 'lichess h4rgD9HP',
  'https://lichess.org/h4rgD9HPabcd/black': 'lichess h4rgD9HP',
  'https://lichess.org/training/abc12345': 'null',
  'https://www.chess.com/game/live/186299800014': 'chesscom 186299800014',
  'https://www.chess.com/analysis/game/daily/12345': 'chesscom 12345',
  'https://www.chess.com/live/game/999': 'chesscom 999',
  'https://www.chess.com/home': 'null',
};
let fail = 0;
for (const [u, want] of Object.entries(cases)) {
  const g = parseUrl(u);
  const got = g ? `${g.site} ${g.id}` : 'null';
  if (got !== want) { fail++; console.log('FAIL', u, got); }
}
console.log('parse ok:', Object.keys(cases).length - fail, '/', Object.keys(cases).length);
const lp = await lichessPgn('h4rgD9HP');
console.log('lichess pgn:', lp.split('\n').find((l) => l.startsWith('[Result')), lp.length, 'chars');
const cp = await chesscomPgn('186299800014', ['Hikaru'], 2);
console.log('chess.com pgn:', cp.split('\n').slice(4, 6).join(' '), cp.length, 'chars');
console.log('lichess link:', await reviewLink({ site: 'lichess', id: 'h4rgD9HP' }));
const link = await reviewLink({ site: 'chesscom', id: '186299800014' }, ['Hikaru']);
console.log('chess.com link length:', link.length, link.slice(0, 80));
console.log('roundtrip utf8:', decodeURIComponent(escape(atob(b64url('é ♔ test').replace(/-/g, '+').replace(/_/g, '/')))));
process.exit(fail ? 1 : 0);
