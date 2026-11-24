// Every game on the Arcade home page. To add a game: make a folder for it
// next to chess/, add card art in shared/art/<slug>.svg, then add an entry
// here. `soon: true` shows it greyed out.
export const GAMES = [
  { slug: 'chess', name: 'Chess', blurb: 'Bots with personalities, Lichess online play, puzzles, and a full engine review of every game.', accent: '#7b5cff', tags: ['Bots', 'Online', 'Review'] },
  { slug: 'fantasy-football', name: 'Fantasy Football', blurb: 'Start a league with friends, run a live snake draft, then set lineups and trade through the NFL season.', accent: '#22c55e', tags: ['NFL', 'Leagues', 'Live draft'], soon: true },
  { slug: 'fantasy-basketball', name: 'Fantasy Basketball', blurb: 'Points or 9-cat. Draft an NBA roster and go head-to-head every week.', accent: '#f97316', tags: ['NBA', 'Leagues', '9-cat'], soon: true },
];
