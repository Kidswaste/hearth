# Trim (round 18): lighter, nothing you use removed

You asked that every feature earn its weight. This pass measured what Hearth actually runs (a headless drive with
JS and CSS coverage: every feature group loaded, every rail tool opened, the palette, the "/" menu, a streamed reply,
then all 1,025 command runs with no arguments from a chat, the Lab and the board), cross-checked every candidate
with a search of the code, then removed what nothing reaches and moved three rarely-opened features out of startup.
All 805 chat commands, 255 aliases, 1,079 Ctrl/⌘+K lines, 425 keys-sheet lines, 49 apps and 4 tool tabs are still
there.

## Numbers
| What | Before | After | Change |
|---|---:|---:|---:|
| JS read before the first screen (index.html) | 81 files, 2,611 KB | 70 files, 2,145 KB | **−466 KB (−18 %)** |
| Stylesheets before the first screen | 27, 460 KB | 27, 453 KB | −7.7 KB |
| JS + CSS loaded after the first screen (lazy groups) | 9 groups, 3,229 KB | 12 groups, 3,718 KB | +489 KB (moved, not added) |
| Main-process code required at launch | 33 files, 587 KB | 33 files, 582 KB | −5 KB |
| assets/swirl.svg (the Swirl look's galaxies) | 58 KB | 27 KB | −31 KB (−54 %) |
| App on disk without dev/docs (292 files) | 8,211 KB | 8,190 KB | −21 KB |
| Startup: ready / interactive | PERF_READY | | |
| JS heap after GC, first screen | PERF_HEAP | | |

(KB: `node dev/weight-report.js`; startup:
`node dev/perf-report.js --startup-only --no-stream`, two interleaved rounds of 5 reloads per build, medians, on a
machine shared with other agents: compare the ratios.) The lazy-group manifest (lazy-data.js) grew by 24 KB to list
what the three new groups register; that is inside the 2,145 KB.

## What loads later now (it all still works from the first moment)
1. **Capture loads right after the first screen** (screenshots, recording, tours, the frame reader, the captures
   viewer, annotate: 7 files, 299 KB). Its 27 commands, 17 Ctrl/⌘+K lines, 59 keys-sheet lines and the agents'
   `capture_…` tools are listed at once; using one before it's in loads it first. Rail ⋯ › Capture appears when
   it's in (≈ 1–3 s after start).
2. **The code flow view loads on first use only** (`/code-nodes`, `/code-nodes-paste`, `/code-nodes-file`,
   `/code-outline`, "Code: the clipboard as a flow of nodes": 62 KB). It's the first group of the "use" tier.
3. **Forgeheart, the Forge Debug game and the add-on commands load right after the first screen** (tools/forge.js,
   tools/forge-game.js, addons-cmds.js: 129 KB). A Forge Debug chat mounts its game when Forge arrives, and opening
   that chat loads Forge at once, so having the agent no longer pulls Forge into startup. The import button (and
   "Import past chats…") waits for it too.

## Removed (nothing reached it)
4. **The After Effects drawer's main-process half** (aemain.js): the script installer, the output-module template
   reader, the .aep project finder and the aerender queue with its progress events (`ae:templates`, `ae:install`,
   `ae:projects`, `ae:render`, `ae:cancel`, `ae:render-event` and their preload entries). Only Video Review's AE
   drawer used them. Running ExtendScript in After Effects (chat code blocks, the Adobe bridge) and AE's status stay.
5. **Dead CSS of the removed video side and old tools**: 56 rules and 34 selectors whose classes no code makes any
   more (Video Review `.vr-*`, `.rv-*`, `.vid-card`, `.note-marker`, the AE drawer's `.ae-*` / `.lib-*` /
   `.render-form` / `.calc-*` / `.palette-*`, the old Lab timeline's `.mb-overview` / `.mb-scroll` / `.mb-bpm`,
   `.tw-tools2`, `.astra-chip*`, unused `.m-glass` / `.m-forged` / `.m-molten` / `.m-bevel` / `.m-working` material
   classes, `.intro-card`, `.ver-chip`…) across features.css, look.css, polish.css, polish8.css, forge-skin.css,
   swirl-skin.css, capture.css, astra.css, progress.css. Class names built in code (`p${n}`, `ms-${id}`,
   `d${kind}`…) were kept.
6. **13 animations nothing plays** (`@keyframes` collab-flow, bd-shimmer, comp-flow, mb-blink, write-pulse,
   fh-pulse, fh-drift, fh-btn-sheen, jam-flow, m-breathe, v2-stop, mt-spin, mb-tapflash): left over from the
   240 Hz pass, which moved those effects to compositor animations.
7. **Video Review leftovers in code**: the `.vr-play` sweep target (juice.js), the Video Director's clapperboard
   icon and the `ae` / `videodirector` / `editor` icon ids, the stale `/guide` entry in the "/" help (its command
   left with Video Review), unused helpers (`idOpts`, `isRetryable`, `clockNow`, `partnerName`, `BASE_SIZES`,
   `EXTRA_SIZES`, `SEGMENTS`, `containerOf`).

## Lighter on disk and in memory
8. **swirl.svg 58 → 27 KB**: its spiral polylines are drawn with integer points (the picture is blurred 2.5 px and
   shown at most ≈ 1.8× its size, so it looks the same).
9. **The board's export image cache is capped** (the newest 48 pictures): exporting or making a contact sheet of a
   big board kept every full-size image decoded for the rest of the session.
10. **The chat things panel's frame-rate cache is capped** (200 videos).
11. **The capture region picker no longer leaks**: each pick left a keyup listener on the window holding the whole
    overlay.

## For the next streams (dev)
12. **`node dev/smoke.js --coverage out.json`**: JS function coverage (CDP precise coverage from the first byte) and
    CSS rule usage of the run, written as JSON.
13. **`dev/checks/trim-drive.js`**: the broad drive used above (every group, tool, menu, command).
14. **`node dev/coverage-report.js out.json [--file f] [--json]`**: KB never run per file, the uncalled functions
    (outermost, with line and size), the CSS rules never matched, files never loaded. A hint list: cross-check with
    a search before deleting (string-built names, data-driven code, skins that weren't active, platform paths).
15. **`dev/checks/trim-refs.js`**: "/command" mentions in tips, examples, flows and the app map that no command
    answers, and stale keys in the "/" help and Commands-page tables (now none).
16. **`dev/checks/trim-lazy.js`**: capture, the code flow view and Forge used before their groups load (with every
    group held back): a Forge Debug chat mounts its game, a capture palette line opens the capture menu, the rail
    entry comes back, `/code-outline` works.
17. **`node dev/weight-report.js [appRoot]`**: the KB table above, for this checkout or another copy of the app.
18. **dev/checks/lazy.js** accepts "use"-tier groups (they wait for their first use) and checks codeflow.

## Measured but left alone (and why)
- **JS that never ran in the drive: 2.2 MB of 5.7 MB**, almost all of it real features the drive didn't click
  through (dialogs, drags, the node editor's parsers, the Forge tabs, capture recording). Only ≈ 1 KB of it was
  provably unreachable (item 7). Coverage of CSS: ≈ 300 KB of rules never matched, mostly other looks (Swirl,
  Forge v2) and states (hover, menus); only the rules no code can produce were removed (item 5).
- **three.js and its addons are not copied into Hearth**: the Lab loads them from the CDN (and Publish fetches only
  the files a scene imports), so there's nothing to drop.
- **assets/oxanium.ttf (44 KB)** could be a 20 KB woff2, but the Lab's motion and sequence title renderers read
  the .ttf file itself (tools/three-motion.js, tools/three-seq.js: labcut's lane this round). Worth doing with them.
- **Command clips (assets/cmd-clips, 33 files, 568 KB)** are already small H.264 clips; all are used.
- **tools/cut-data.js / cut-presets.js** have ≈ 20 exported helpers nothing calls now (track / marker / caption
  edits of the old editor). The Lab sequence is being turned into a full editor this round (labcut) and will likely
  use them: kept.
- **Two menu systems**: the node editor keeps its own small menu (checkmarks + key hints) beside `showMenu`.
  Merging them changes the node editor's feel; not a trim.
- **Two Pinterest paths**: the board's Pinterest window (board-pins.js) and a one-line fallback entry in the apps
  list (apps-more.js) used only when the board's isn't registered. Kept.
- **Caches, listeners, logs**: the rest are capped already (Markdown 600, frame reader 40 / 12, bridge log, toasts
  40, director history, render history 120, lazy misses 200).

## Tests
- `node dev/lazy-manifest.js --check`: names 805, aliases 255, actions 1,079, keys 425, apps 49, tools 4, no
  duplicates.
- Checks: lazy ✓, qa-commands ✓, qa-mac ✓ (it now finds the capture menu line by name: capture's keys-sheet lines
  arrive with its group, after polish8's), chatcore ✓, smooth-app ✓, trim-lazy ✓, capture-record ✓, capture-shots ✓,
  addons-checks ✓, qa-ui ✓ (its `--eval` preamble fails in the harness on main too), trim-refs (no stale tables),
  the trim drive (1,025 command runs, no errors), `node dev/boot-test.js` ✓ (268), `node dev/test-aemain-mac.js` ✓.
- Smoke runs with no page errors.

## Risks
- For ≈ 1–3 s after the first screen, menus that check `typeof Capture` (the attach menu's Captures / Screen rows,
  a dropped video's contact sheet) don't show capture items yet, as the board and Lab rows already did.
  Commands, palette lines, keys and agent tools load capture first, then run.
- Capture's global keys from the main process (Ctrl/⌘+Alt+S/R/P/V) pressed in that first second are dropped.
- A Forge Debug chat that isn't the one on screen mounts its game ≈ 1–3 s later than before.
