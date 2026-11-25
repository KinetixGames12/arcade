# Kinetix Game Review (browser extension)

Sends any **finished** chess.com or Lichess game to Kinetix Chess for a full Game Review: accuracy, every move graded, and plain-English explanations.

- A **Review in Kinetix** button appears next to the board on chess.com and lichess.org game pages.
- Or click the Kinetix icon in your toolbar, or press **Alt+Shift+K**.
- Optional: open the review automatically when a game ends (switch it on in the toolbar popup).
- **Finished games only.** It never shows anything during a live game. Lichess and chess.com only hand out a game after it ends, and the extension refuses games still in progress.
- **No tracking.** It talks only to Lichess or chess.com (to fetch the finished game) and opens the Kinetix page. No analytics, no accounts, nothing stored except your auto-open setting.

## Install

The ready-made files are in `extension/dist/`:
`kinetix-review-chrome.zip` (Chrome, Edge, Brave, Opera) and `kinetix-review-firefox.zip` (Firefox).

### Chrome, Edge or Brave
1. Download `kinetix-review-chrome.zip` and double-click it to unzip. You get a folder.
2. In the address bar, open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder.
5. Optional: click the puzzle-piece icon in the toolbar and pin **Kinetix Game Review**.

### Firefox
1. Download `kinetix-review-firefox.zip` (don't unzip it).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick the zip.
Firefox removes temporary add-ons when it restarts. To keep it, it would have to be signed through addons.mozilla.org (not done here).

### Safari (Mac, needs Xcode)
1. Unzip `kinetix-review-chrome.zip`.
2. In Terminal run: `xcrun safari-web-extension-converter <path to the unzipped folder> --app-name "Kinetix Review"`
3. Xcode opens. Press **Run** (▶). Then in Safari: **Settings → Advanced → Show features for web developers**, then **Develop → Allow Unsigned Extensions**, and tick **Kinetix Review** under **Settings → Extensions**.

## How it works
- Lichess: checks `https://lichess.org/game/export/<id>` says the game is over, then opens `https://kinetixgames12.github.io/arcade/chess/#lichess=<id>`.
- chess.com: reads the players' names from the page, finds the game in `https://api.chess.com/pub/player/<user>/games/<YYYY>/<MM>`, then opens `…/chess/#review=<base64url PGN>`.

## For developers
- Source: `src/` (`core.js` has all the logic). Manifests are built from `manifest.base.json`.
- `sh build.sh` rebuilds `dist/` and the zips. `node test.mjs` tests URL parsing and real game fetches.
