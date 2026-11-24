// Bot roster: original characters with a strength, a playing style, an
// opening repertoire (names from the opening book) and things to say.
import * as book from './openings.js?v=1';

const L = (...a) => a;
export const BOTS = [
  { id: 'pip', name: 'Pip', elo: 400, color: '#7bd88f', face: 'smile', style: 'wild',
    bio: 'Just learned how the horsey moves. Very excited about it.', book: ['Amar Opening', 'Ware Opening', 'Grob Opening'],
    say: { start: L('Hi!! Is the horse the one that jumps?', 'I like the pointy hat pieces.'), capture: L('Gotcha!', 'Mine now :)'), lose: L('Oops. I forgot about that one.', 'Can you show me that again?'), check: L('Check! Did I do it right?'), win: L('Wait… did I win?!'), draw: L('A tie! Everybody wins.') } },
  { id: 'tilly', name: 'Tilly', elo: 650, color: '#ffb547', face: 'calm', style: 'cautious',
    bio: 'Keeps her pieces safe at home. Maybe too safe.', book: ['Scandinavian Defense', "Center Game"],
    say: { start: L('Let’s keep things tidy, shall we?'), capture: L('Just tidying up the board.'), lose: L('Hmm, that wasn’t very tidy of me.'), check: L('Excuse me, your king is in check.'), win: L('A neat little win.'), draw: L('Nice and balanced.') } },
  { id: 'rusty', name: 'Rusty', elo: 900, color: '#ff6b4a', face: 'grin', style: 'aggressive',
    bio: 'Brings the queen out on move two. Every single game.', book: ['Wayward Queen Attack', 'Danish Gambit', "King's Gambit"],
    say: { start: L('Queen goes brrr.', 'Hope you’re ready, I’m attacking from move one.'), capture: L('Boom!', 'That one’s mine!'), lose: L('Ugh, my attack ran out of gas.'), check: L('Check! Feel the pressure?'), win: L('Told you. Attack wins.'), draw: L('A draw? I wanted fireworks.') } },
  { id: 'mara', name: 'Mara', elo: 1100, color: '#4fb3ff', face: 'calm', style: 'solid',
    bio: 'Plays the same setup every game and knows it inside out.', book: ['London System', 'Caro-Kann Defense'],
    say: { start: L('Same setup as always. Let’s see if you’ve studied it.'), capture: L('Thank you.'), lose: L('Well played. I’ll review this one.'), check: L('Check.'), win: L('Structure wins games.'), draw: L('A fair result.') } },
  { id: 'dex', name: 'Dex', elo: 1300, color: '#d4ff3f', face: 'grin', style: 'aggressive',
    bio: 'Tactics junkie. Will sacrifice a pawn just to see what happens.', book: ['Evans Gambit', "Smith-Morra Gambit", "Scotch Game"],
    say: { start: L('Pawns are just tactics waiting to happen.'), capture: L('Combination complete.', 'Did you see that coming?'), lose: L('My tactic had a hole. Respect.'), check: L('Check! Tactics, baby.'), win: L('Calculated. Mostly.'), draw: L('Perpetual vibes.') } },
  { id: 'hoot', name: 'Professor Hoot', elo: 1500, color: '#b48cff', face: 'glasses', style: 'positional',
    bio: 'A wise old owl who lectures about pawn structure mid-game.', book: ["Queen's Gambit Declined", 'English Opening'],
    say: { start: L('Ah, a pupil. Mind your pawn structure.'), capture: L('A small gain, but small gains add up.'), lose: L('Splendid play. You may have taught me something.'), check: L('Check, I believe.'), win: L('Lesson concluded. Study the endgame.'), draw: L('A scholarly draw.') } },
  { id: 'viper', name: 'Viper', elo: 1700, color: '#2fd68a', face: 'sly', style: 'aggressive',
    bio: 'Loves sharp Sicilians and opposite-side castling.', book: ['Sicilian Defense: Dragon Variation', 'Sicilian Defense: Najdorf Variation', 'Sicilian Defense'],
    say: { start: L('Sharp lines only.'), capture: L('Sss… delicious.'), lose: L('You defended well. Annoyingly well.'), check: L('Check. Getting nervous?'), win: L('Venom works every time.'), draw: L('We’ll settle this another day.') } },
  { id: 'ingrid', name: 'Ingrid', elo: 1900, color: '#ff4f7e', face: 'calm', style: 'solid',
    bio: 'Trades pieces and wins the endgame. Patient as a glacier.', book: ['Caro-Kann Defense', 'French Defense'],
    say: { start: L('Let’s see how you handle an endgame.'), capture: L('Fewer pieces. Good.'), lose: L('Excellent technique.'), check: L('Check.'), win: L('Endgames decide everything.'), draw: L('Drawn. Correct result.') } },
  { id: 'atlas', name: 'Atlas', elo: 2200, color: '#9aa0b4', face: 'glasses', style: 'positional',
    bio: 'Classical master. Plays the Ruy Lopez like it’s 1890.', book: ['Ruy Lopez', 'Italian Game', "Queen's Gambit"],
    say: { start: L('Classical chess. Shall we?'), capture: L('Material is material.'), lose: L('A masterful game from you.'), check: L('Check.'), win: L('The classics never die.'), draw: L('A dignified draw.') } },
  { id: 'nova', name: 'Nova', elo: 2500, color: '#7b5cff', face: 'sly', style: 'aggressive',
    bio: 'Grandmaster-level attacker. The King’s Indian is her weapon.', book: ["King's Indian Defense", 'Grünfeld Defense', 'Sicilian Defense: Najdorf Variation'],
    say: { start: L('Bring your best.'), capture: L('Thanks for the piece.'), lose: L('Impressive. Truly.'), check: L('Check.'), win: L('Good game. Try again?'), draw: L('Well held.') } },
  { id: 'zenith', name: 'Zenith', elo: 2800, color: '#3ef0c8', face: 'robot', style: 'universal',
    bio: 'Super-grandmaster strength. Plays everything, fears nothing.', book: ['Catalan Opening', 'Ruy Lopez', "Queen's Gambit Declined"],
    say: { start: L('Initiating game.'), capture: L('Advantage registered.'), lose: L('Unexpected outcome. Well played.'), check: L('Check.'), win: L('Game complete.'), draw: L('Equilibrium.') } },
  { id: 'max', name: 'Max', elo: 3200, color: '#11140a', face: 'robot', style: 'engine',
    bio: 'Full-strength Stockfish 19. No mercy, no chat.', book: [],
    say: { start: L('…'), capture: L('…'), lose: L('…?!'), check: L('…'), win: L('…'), draw: L('…') } },
];

export const pick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : '');
export const byId = (id) => BOTS.find((b) => b.id === id);

// Original avatar art: a rounded tile with a simple face.
export function avatar(bot, size = 44) {
  const eyes = {
    smile: '<circle cx="15" cy="19" r="2.6"/><circle cx="29" cy="19" r="2.6"/>',
    calm: '<path d="M12 19q3-3 6 0M26 19q3-3 6 0" stroke="#11140a" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
    grin: '<circle cx="15" cy="18" r="2.8"/><circle cx="29" cy="18" r="2.8"/><path d="M11 14l6 2M33 14l-6 2" stroke="#11140a" stroke-width="2" stroke-linecap="round"/>',
    glasses: '<circle cx="15" cy="19" r="5" fill="none" stroke="#11140a" stroke-width="2"/><circle cx="29" cy="19" r="5" fill="none" stroke="#11140a" stroke-width="2"/><path d="M20 19h4" stroke="#11140a" stroke-width="2"/><circle cx="15" cy="19" r="1.8"/><circle cx="29" cy="19" r="1.8"/>',
    sly: '<path d="M11 19l8-2M25 17l8 2" stroke="#11140a" stroke-width="2.6" stroke-linecap="round"/>',
    robot: '<rect x="11" y="16" width="8" height="5" rx="1.5"/><rect x="25" y="16" width="8" height="5" rx="1.5"/>',
  }[bot.face || 'smile'];
  const mouth = { smile: 'M15 28q7 6 14 0', calm: 'M16 29h12', grin: 'M13 27q9 9 18 0z', glasses: 'M16 29q6 3 12 0', sly: 'M15 29q8 2 14-3', robot: 'M15 29h14' }[bot.face || 'smile'];
  const dark = bot.id === 'max';
  return `<svg class="bot-av" width="${size}" height="${size}" viewBox="0 0 44 44" aria-hidden="true">
    <defs><linearGradient id="bg-${bot.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bot.color}"/><stop offset="1" stop-color="${bot.color}" stop-opacity=".65"/></linearGradient></defs>
    <rect width="44" height="44" rx="13" fill="url(#bg-${bot.id})"/>${dark ? '<rect x="2" y="2" width="40" height="40" rx="11" fill="none" stroke="#d4ff3f" stroke-width="2"/>' : ''}
    <g fill="${dark ? '#d4ff3f' : '#11140a'}">${dark ? eyes.replace(/#11140a/g, '#d4ff3f') : eyes}</g>
    <path d="${mouth}" stroke="${dark ? '#d4ff3f' : '#11140a'}" stroke-width="2.4" fill="${bot.face === 'grin' ? '#fff' : 'none'}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Next move from the bot's repertoire, if the game is still in one of its lines.
export function bookMove(bot, fen) {
  if (!bot.book?.length) return null;
  const lines = book.allLines().filter(([, name]) => bot.book.some((b) => name === b || name.startsWith(`${b}:`) || name.startsWith(`${b},`)));
  if (!lines.length) return null;
  const opts = book.continuations(fen).filter((c) => c.name && bot.book.some((b) => c.name.name === b || c.name.name.startsWith(b)));
  if (!opts.length) return null;
  return pick(opts).uci;
}

// Engine settings for a strength (Stockfish limits itself from 1320 Elo up).
export function searchOpts(elo) {
  if (elo >= 3150) return { movetime: 1500, multipv: 1 };
  if (elo >= 1320) return { elo, movetime: Math.round(350 + (elo - 1320) / 3), multipv: 3 };
  const t = (elo - 400) / 920;
  return { skill: Math.round(t * 6), depth: 1 + Math.round(t * 5), movetime: 400, multipv: 3 };
}

// Style: among engine lines close to the best, prefer ones that fit.
export function chooseLine(bot, lines, chess) {
  if (!lines?.length) return null;
  const best = lines[0];
  const margin = bot.elo < 1000 ? 120 : bot.elo < 1600 ? 60 : bot.elo < 2200 ? 30 : 15;
  const score = (l) => (l.mate != null ? (l.mate > 0 ? 9999 - l.mate : -9999 - l.mate) : l.cp);
  const close = lines.filter((l) => l.pv?.[0] && score(best) - score(l) <= margin);
  if (close.length < 2 || bot.style === 'engine' || bot.style === 'universal') return best.pv[0];
  const flavour = (l) => {
    let m;
    try { m = chess.moves({ verbose: true }).find((x) => x.from + x.to + (x.promotion || '') === l.pv[0]); } catch { m = null; }
    if (!m) return 0;
    const sharp = (m.captured ? 2 : 0) + (m.san.includes('+') ? 2 : 0) + (['q', 'r'].includes(m.piece) ? 0.5 : 0);
    if (bot.style === 'aggressive' || bot.style === 'wild') return sharp;
    if (bot.style === 'cautious' || bot.style === 'solid') return -sharp + (m.piece === 'p' ? 0.5 : 0);
    if (bot.style === 'positional') return (m.captured ? -0.5 : 0) + (['n', 'b'].includes(m.piece) ? 0.6 : 0);
    return 0;
  };
  close.sort((a, b) => flavour(b) - flavour(a) || score(b) - score(a));
  return (Math.random() < 0.75 ? close[0] : pick(close)).pv[0];
}

// "Match my level": a running estimate of your strength from games vs bots.
const KEY = 'arc.chess.myrating';
export function myRating() { try { return Number(localStorage.getItem(KEY)) || 800; } catch { return 800; } }
export function updateRating(botElo, score) {
  const r = myRating();
  const exp = 1 / (1 + 10 ** ((botElo - r) / 400));
  const next = Math.round(Math.max(100, Math.min(3000, r + 48 * (score - exp))));
  try { localStorage.setItem(KEY, String(next)); } catch { /* private mode */ }
  return next;
}
