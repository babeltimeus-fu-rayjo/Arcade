# Arcade

A small collection of browser games, served as plain static files from GitHub Pages.
No build step, no framework, no dependencies: HTML, CSS and ES modules.

**Live site:** `https://<your-github-user>.github.io/Arcade/` (once Pages is enabled, see below).

## Games

| Game | Folder | What it is |
| --- | --- | --- |
| 🎯 Target Rush | `games/target-rush/` | Timed round. Targets pop up around the arena, each with a ring that drains over its lifetime. Tap them before the ring empties. Default round: 15 seconds, 25 targets. Ends with hits, misses and accuracy. Optional bursts pacing and stackable modules (moving targets, double tap, keyboard, shrinking). |
| 🔨 Whack-a-Mole | `games/whack-a-mole/` | Keyboard only. The board is a QWERTY keyboard; moles pop up on keys and you press the matching key to whack them. Same round settings as Target Rush (length, count, lifetime, bursts) plus a choice of key groups or a custom key pool, and modules for tough (two-whack) and sinking moles. |

## Project layout

```
index.html                 Landing page: lists every game from assets/js/games.js
assets/css/site.css        Shared theme (colours, buttons, cards)
assets/js/games.js         Game registry shown on the landing page
shared/rng.js              Seeded PRNG so a round can be reproduced from a seed
shared/net/peer.js         WebRTC data-channel wrapper (STUN + manual signaling), for multiplayer
shared/keyboard.js         US QWERTY layout data (rows, positions, shifted symbols, key pools)
shared/engine/engine.js    Round engine: clock, spawning, hits/misses, stats, events, module hooks
shared/engine/schedule.js  Deterministic round plan (steady or bursts timing, non-overlapping placement)
shared/engine/options.js   Shared settings helpers: limits, bursts, module options, persistence
shared/ui/settings-dialog.js  Settings dialog (round, bursts, modules + nested options, game extras)
games/target-rush/
  index.html               Screens: menu, game (HUD + arena), results, settings dialog shell
  style.css                Arena, targets and path outlines
  main.js                  Wires settings, engine and UI together
  settings.js              Defaults and normalisation (on top of shared/engine/options.js)
  ui.js                    All DOM work: HUD, targets, path outlines, results, dialog wiring
  modules/index.js         Module registry (each entry becomes a checkbox in Settings)
  modules/move.js          Moving targets (circle, lines, square, diamond, triangle, figure eight)
  modules/double.js        Some targets need two hits
  modules/keys.js          Hit targets with keyboard keys mapped to screen position
  modules/shrink.js        Smallest example module + documentation of the module API
games/whack-a-mole/
  index.html               Screens: menu, game (HUD + keyboard board), results, settings dialog shell
  style.css                Keycaps, holes, moles, lifetime bars
  main.js                  Wires settings, engine, planner and UI together
  settings.js              Defaults and normalisation, including the key groups / custom pool
  planner.js               Gives every mole a free key while the round is planned
  ui.js                    Keyboard board rendering, HUD, results, dialog wiring
  modules/double.js        Tough moles (two whacks)
  modules/sink.js          Sinking moles
scripts/serve.mjs          Zero-dependency local dev server
```

Every link and import is relative, so the site works at the domain root, under
`/Arcade/`, or from any local server.

## Run locally

ES modules need an HTTP server (opening `index.html` directly from disk won't work).
Either of these serves the repo root on http://localhost:8080:

```bash
node scripts/serve.mjs 8080
```

```bash
python3 -m http.server 8080
```

## Deploy to GitHub Pages

1. Push to `main`.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. After a minute the site is live at `https://<user>.github.io/Arcade/`.

`.nojekyll` is included so GitHub serves the files exactly as committed.

## Adding a game

1. Create `games/<id>/` with its own `index.html` (link the shared theme with
   `../../assets/css/site.css`, and link back to the landing page with `../../`).
2. Add an entry to `assets/js/games.js`. The landing page renders the card automatically.

## Target Rush

### Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Round length | 0:15 | 5 s to 60 min |
| Number of targets | 25 | Spread over the round so the last one expires before time is up. Targets never overlap: each reserves a footprint (its radius, plus the reach of its path if it moves) and is only placed where that clears everything on screen at the same time. In a crowded arena a mover stands still instead, and a target with no room at all waits for a neighbour to expire |
| Target lifetime | 2.0 s | How long a target stays up before it counts as a miss |
| Target size | 14% | Diameter as a share of the arena's shorter side (clamped to 36–110 px) |
| Bursts | off | Targets arrive in random groups with random breaks in between |

**Bursts.** When enabled, the round is split into groups whose sizes are drawn from
"targets per burst" (default 3–6). Targets inside a group appear in quick succession;
between groups there is a break drawn from "break after a burst" (default 1–3 s).
Because the round length and target count are fixed, the breaks are stretched or
compressed so the plan fills the round exactly (bursts themselves stay tight). The
dialog shows a live hint with the expected number of bursts and how much the breaks
are scaled.

Settings persist in localStorage. During a round, Esc pauses and resumes; switching
tabs pauses automatically.

### Modules

Modules are optional twists that stack. Each shows up as a checkbox in Settings, with
its own nested options underneath when it declares any.

| Module | What it does | Options |
| --- | --- | --- |
| Moving targets | A share of targets drift slowly along a small closed path: circle, left-right, up-down, diagonal, anti-diagonal, square, diamond, triangle, figure eight. Each path is drawn as a faint dashed outline. Moving targets get their own lifetime range, and speed is set in target widths per second so it feels the same on every screen. The whole path is reserved when the target is placed, so it never overlaps other targets or leaves the arena; if there is no room for a path, the target stands still. | Share (50%), path size (100%), lifetime 3.0–4.5 s, speed 0.5–1.0 widths/s |
| Double tap | A share of targets show a badge and need two hits. The badge counts down and the target pulses on the first hit. | Share of double targets (40%) |
| Keyboard | Targets are hit by pressing the key printed on them; taps are ignored. The key's spot on a US QWERTY board roughly matches the target's spot on screen (top-left targets get keys like 1, Q, A; bottom-right ones get M, /, '). Keys already on screen aren't reused. Wrong keys count as stray presses. Needs a physical keyboard. | Letters (on), numbers, punctuation, any mix; or a custom pool of characters that overrides the groups (shifted symbols like ! or ? work too) |
| Shrinking targets | Targets get smaller as their timer runs out. | — |

### Writing a module

A module is a plain object in `games/target-rush/modules/`, registered in
`modules/index.js`. Fields:

| Field / hook | Purpose |
| --- | --- |
| `id`, `name`, `description` | Checkbox text in Settings |
| `options` | Nested settings read with `engine.options(id)`. Types: `checkbox`, `number` (`min`, `max`, `step`, `unit`), `range` (a `[lo, hi]` pair) and `text` (`placeholder`, `maxLength`) |
| `usesKeyboard` | `true` if targets are hit with keys; the UI then routes key presses to `engine.hitKey()` |
| `modifySettings(settings)` | Return adjusted settings before the round is scheduled |
| `onPlanStart(engine)` | Before the round is scheduled; reset per-round planning state |
| `onPlan(planned, engine)` | While the round is scheduled, before the target is placed: change `lifetimeMs`, widen `footprint` (the radius reserved around it), attach `motion`, or set `key`/`label`/`hitsRequired` |
| `onRoundStart(engine)` | After scheduling, before the countdown |
| `onSpawn(target, engine)` | A target appeared; set `hitsRequired`, `key`/`label`, `motion`, ... |
| `onUpdate(dtMs, engine)` | Every frame while running; `engine.active` holds live targets |
| `onPartialHit(target, engine)` | A multi-hit target took a hit but isn't done |
| `onHit` / `onMiss(target, engine)` | A target was resolved |
| `onRoundEnd(summary, engine)` | The round finished |

Useful engine fields: `rng` (seeded per round, so peers sharing a seed get the same
variance), `geometry` (`{ width, height, radius }` in shorter-side units), `schedule`,
`elapsed`, `active`. Live targets carry presentation fields the UI applies every frame:
`scale` (1 = normal) and `dx`/`dy` (offset from the scheduled spot as a fraction of the
arena; keep it inside the footprint reserved in `onPlan` so targets never overlap), plus
`hitsRequired`, `key`/`label`, and `path` (a list of arena-fraction points drawn as a dashed
outline). See `modules/shrink.js` for the smallest complete example and `modules/move.js` for a
richer one. The engine and scheduler live in `shared/engine/` and are used by every game.

## Whack-a-Mole

Keyboard only. The board is a US QWERTY keyboard drawn on screen; moles pop up on keys and
you press the matching key to whack them. Wrong keys count as stray presses.

Settings mirror Target Rush: round length (0:15), number of moles (25), mole lifetime (2.0 s)
and Bursts, plus a **Keys** group choosing which keys moles use: letters (on), numbers and
punctuation, mixable, or a custom pool of characters that overrides the groups (shifted
symbols such as ! or ? work and light up their physical key). Keys outside the chosen set are hidden,
but every remaining key keeps its real position on the board (the empty spots stay blank), so
you can find keys without looking down at the physical keyboard.

Every mole gets a key no other mole holds at the same time; if every key is busy the mole
waits for one to free up. Modules: **Tough moles** (a share need two whacks, with a badge) and
**Sinking moles** (a mole slides back down as its time runs out).

## End-of-round titles

Both games end with at least three playful titles picked from the round's stats by
`shared/ui/titles.js`. Well-earned ones reward accuracy, speed, streaks and volume (for
example a perfect round, a fast average reaction, or a long streak); silly ones celebrate
enthusiastic play (many stray presses, watching most targets go by, stopping for a snack).
Only the best title of each group is shown, a round with both kinds shows two earned and one
silly, and a special round earns a bonus fourth. The wording is always encouraging, since the
games are aimed at young typists. Add or tweak titles in that one file.

## Multiplayer groundwork

The pieces are in place; the mode itself is not built yet.

- **Deterministic rounds.** `engine.start({ settings, arena, seed })` builds the whole
  round (spawn times and positions) from the seed with `shared/rng.js`, and modules draw
  their randomness from a second seeded stream. Two devices given the same seed, settings
  and arena aspect ratio play the identical round, so peers only need to exchange the
  seed and their hit/miss events.
- **Engine events.** `hit`, `partial`, `miss`, `tick` and `end` are `CustomEvent`s on the
  engine. A network layer can forward them to the opponent and render their score next to yours.
- **Transport.** `shared/net/peer.js` wraps an `RTCPeerConnection` data channel with free
  public STUN servers (Google, Cloudflare). Because GitHub Pages is static there is no
  signaling server: `createOffer()` / `acceptOffer()` / `acceptAnswer()` return compact
  strings meant to be swapped out of band (copy/paste, QR code, chat), or through any
  free signaling relay added later. Peers behind strict NATs would also need a TURN
  server, which no free public service guarantees.
- The page exposes `window.__targetRush` (engine, modules, settings) for the console.
