# Arcade

A hub of browser games with one shared account. Live at https://kinetixgames12.github.io/arcade/

- `index.html` + `shared/` — the hub page, shared sign-in (`shared/account.js`) and the game list (`shared/games.js`).
- `shared/arcade.css` — the Arcade look every game uses: colours, fonts (Unbounded + Inter, self-hosted in `shared/fonts/`, SIL OFL), buttons (`ar-btn`), cards, tabs, inputs. Light/dark follows the device; `shared/theme.js` adds a toggle.
- `shared/icon.svg` — the Arcade mark (an A whose crossbar is a ball). `shared/brand/` holds the lockups, app icons, `og.png` share image and their HTML sources; `manifest.webmanifest` makes the hub installable.
- `shared/art/<slug>.svg` — card art for each game on the hub.
- `chess/` — bots, Lichess online play, Stockfish analysis and game review.
- `supabase/migrations/` — database tables (Supabase project `arcade`). Every table is owner-only via row level security.

## Adding a game

1. Make a folder next to `chess/` with its own `index.html`.
2. Add card art at `shared/art/<slug>.svg` and an entry in `shared/games.js`.
3. Link `shared/arcade.css` and `shared/theme.js` so the game matches the hub.
4. For sign-in, load supabase-js + `shared/config.js`, then `import { mountAccount, client } from '../shared/account.js'`.

## Licences

Stockfish 19 (GPLv3, `chess/vendor/stockfish/COPYING.txt`), chess.js (BSD-2), chess pieces by Colin M. L. Burnett, Unbounded and Inter fonts (SIL OFL 1.1, `shared/fonts/`).
