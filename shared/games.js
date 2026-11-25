// Every game on the Kinetix home page. To add a game: make a folder for it
// next to chess/, add card art in shared/art/<slug>.svg, then add an entry
// here. `soon: true` shows it greyed out.
export const GAMES = [
  { slug: 'chess', name: 'Chess', blurb: 'Bots with personalities, Lichess online play, puzzles, and a full engine review of every game.', accent: '#7b5cff', tags: ['Bots', 'Online', 'Review'] },
  { slug: 'lexo', name: 'Lexo', blurb: 'Crack the hidden five-letter word in six tries. A new word every day.', accent: '#3fbf6b', tags: ['Daily', 'Words'] },
  { slug: 'warmer', name: 'Warmer', blurb: 'Guess the mystery country. Every guess glows hotter the closer you get.', accent: '#ff7832', tags: ['Daily', 'Geography'] },
  { slug: 'bigger', name: 'Bigger?', blurb: 'Two countries, one question: which is bigger? Ten rounds a day, or go for a streak.', accent: '#3ef0c8', tags: ['Daily', 'Quick'] },
  { slug: 'fantasy-football', name: 'Fantasy Football', blurb: 'Start a league with friends, run a live snake draft, then set lineups and trade through the NFL season.', accent: '#22c55e', tags: ['NFL', 'Leagues', 'Live draft'] },
  { slug: 'fantasy-basketball', name: 'Fantasy Basketball', blurb: 'Points or 9-cat. Draft an NBA roster and go head-to-head every week.', accent: '#f97316', tags: ['NBA', 'Leagues', '9-cat'] },
];
