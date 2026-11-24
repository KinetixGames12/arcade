# Kinetix

Kinetix is the brand; this repo is still called `arcade`.

A hub of browser games with one shared account. Live at https://kinetixgames12.github.io/arcade/

- `index.html` + `shared/` — the hub page, shared sign-in (`shared/account.js`) and the game list (`shared/games.js`).
- `shared/arcade.css` — the Kinetix look every game uses: colours, fonts (Unbounded + Inter, self-hosted in `shared/fonts/`, SIL OFL), buttons (`ar-btn`), cards, tabs, inputs. Light/dark follows the device; `shared/theme.js` adds a toggle.
- `shared/icon.svg` — the Kinetix mark (a K whose arms meet at a ball). `shared/brand/` holds the lockups, app icons, `og.png` share image and their HTML sources; `manifest.webmanifest` makes the hub installable.
- `shared/art/<slug>.svg` — card art for each game on the hub.
- `chess/` — Kinetix Chess: bot roster with personalities and opening books (`bots.js`), coach comments, Lichess online play with premoves, Game Review with chess.com-style move badges, accuracy, key moments, explanations, retry and best-line playback (`review.js`, `badges.js`), Learn tab with lessons, puzzles and a spaced-repetition opening trainer (`learn.js`, `lessons.js`), board themes and piece sets (`board.js`), synthesized sounds (`sounds.js`), opening names (`openings.js`, `data/openings.json`). Licences in `chess/vendor/LICENSES.md`.
  - Import links: `chess/#review=<base64url of a UTF-8 PGN>` loads the game and starts a Game Review; `chess/#lichess=<gameId>` fetches `https://lichess.org/game/export/<gameId>` and does the same.
  - Keyboard: ← → step, ↑ ↓ / Home End jump, F flips. Touch: swipe below the board. Right-click drag draws arrows, right-click a square highlights it (Shift green, Ctrl/⌘ blue, Alt yellow); left-click clears.
- `fantasy/` — Kinetix Fantasy, shared by `fantasy-football/` (NFL) and `fantasy-basketball/` (NBA): leagues with invite codes, live snake drafts (Supabase Realtime), mock drafts vs bots, lineups with per-game locks, free agents, waivers (rolling or FAAB), trades with review, weekly head-to-head (points or NBA 9-cat), standings, playoffs and player cards. Rules live in the database (`supabase/migrations/*_fantasy*.sql`); `fantasy/scoring.js` is shared with the `fantasy-sync` edge function.
- `supabase/functions/fantasy-sync/` — runs every 10 minutes (pg_cron): pulls the week, lock times, players, ADP and projections from Sleeper's free public API and scores matchups. Deploy with the Supabase MCP tools (`verify_jwt` off; it checks its own `x-cron-key`).
- `supabase/migrations/` — database tables (Supabase project `arcade`). Every table has row level security: personal tables are owner-only, league tables are readable by league members and only changed through checked database functions.

## Adding a game

1. Make a folder next to `chess/` with its own `index.html`.
2. Add card art at `shared/art/<slug>.svg` and an entry in `shared/games.js`.
3. Link `shared/arcade.css` and `shared/theme.js` so the game matches the hub.
4. For sign-in, load supabase-js + `shared/config.js`, then `import { mountAccount, client } from '../shared/account.js'`.

## Licences

Stockfish 19 (GPLv3, `chess/vendor/stockfish/COPYING.txt`), chess.js (BSD-2), chess pieces by Colin M. L. Burnett, player data and headshots from Sleeper's public API, Unbounded and Inter fonts (SIL OFL 1.1, `shared/fonts/`).
