// Every game on the Kinetix home page. To add a game: make a folder for it
// next to chess/, add card art in shared/art/<slug>.svg, then add an entry
// here. `soon: true` shows it greyed out; `daily: true` shows whether today's
// puzzle is done (from the game's kx.<slug>.stats in localStorage).
export const GAMES = [
  { slug: 'chess', name: 'Chess', blurb: 'Bots with personalities, Lichess online play, puzzles, and a full engine review of every game.', accent: '#7b5cff', tags: ['Bots', 'Online', 'Review'] },
  { slug: 'checkers', name: 'Checkers', blurb: 'Classic checkers against five bots from beginner to brutal, or pass the device to a friend.', accent: '#ff3d8b', tags: ['Bots', '2 players'] },
  { slug: 'lexo', daily: true, name: 'Lexo', blurb: 'Crack the hidden five-letter word in six tries. A new word every day.', accent: '#3fbf6b', tags: ['Daily', 'Words'] },
  { slug: 'warmer', daily: true, name: 'Warmer', blurb: 'Guess the mystery country. Every guess glows hotter the closer you get.', accent: '#ff7832', tags: ['Daily', 'Geography'] },
  { slug: 'quads', daily: true, name: 'Quads', blurb: 'Sixteen words, four hidden groups. Find what links them before you run out of mistakes.', accent: '#9cc8ff', tags: ['Daily', 'Words'] },
  { slug: 'bigger', daily: true, name: 'Bigger?', blurb: 'Two countries, one question: which is bigger? Ten rounds a day, or go for a streak.', accent: '#3ef0c8', tags: ['Daily', 'Quick'] },
  { slug: 'fantasy-football', name: 'Fantasy Football', blurb: 'Start a league with friends, run a live snake draft, then set lineups and trade through the NFL season.', accent: '#22c55e', tags: ['NFL', 'Leagues', 'Live draft'] },
  { slug: 'fantasy-basketball', name: 'Fantasy Basketball', blurb: 'Points or 9-cat. Draft an NBA roster and go head-to-head every week.', accent: '#f97316', tags: ['NBA', 'Leagues', '9-cat'] },
];
