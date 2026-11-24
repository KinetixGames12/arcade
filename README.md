# Arcade

A hub of browser games with one shared account. Live at https://kinetixgames12.github.io/arcade/

- `index.html` + `shared/` — the hub page, shared sign-in (`shared/account.js`) and the game list (`shared/games.js`).
- `chess/` — bots, Lichess online play, Stockfish analysis and game review.
- `supabase/migrations/` — database tables (Supabase project `arcade`). Every table is owner-only via row level security.

## Adding a game

1. Make a folder next to `chess/` with its own `index.html`.
2. Add an entry to `shared/games.js`.
3. For sign-in, load supabase-js + `shared/config.js`, then `import { mountAccount, client } from '../shared/account.js'`.

## Licences

Stockfish 19 (GPLv3, `chess/vendor/stockfish/COPYING.txt`), chess.js (BSD-2), chess pieces by Colin M. L. Burnett.
