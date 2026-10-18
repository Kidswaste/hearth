# questperf65: Sidequest Studio clicks and dialogs

The owner's profile (Windows, RTX 4080): every click or dialog in Sidequest Studio took 87–131 ms. The time went to
`quest-journal.js dialog()` (71–107 ms, called from the Outing desk and the journal's buttons), the dialog's × close
(59–75 ms) and `quest-atlas.js fit()` (called from a rail click, `renderer.js:104` → `activate()`).

## What was going on
- **Every save rebuilt the whole map.** Clicks like ★ favorite, the visit stamp, a layer chip, the Map tab and a show
  list arriving all call `render()`. That tore down the Paris map and rebuilt it from scratch: about 130 pins at about
  5 elements each, the layer strip and the side panel, then a full page layout (35–50 ms of layout here).
- **Dialogs restyled the whole page twice.** A modal dialog makes the rest of the page inert, so Chromium restyles
  every element drawn behind it: once on open and once on close. With the map page behind, that was about 1,150
  elements, and because focusing the dialog needs styles, the restyle ran inside the click (20–35 ms here).
- **`fit()` read the map's size on every draw**, even with no walk line to frame. When the page had just been shown by
  a rail click, that read forced a layout of the whole Studio inside the click.
- **Our layers redid their work on every render:** `QuestParis.byId` scanned the 66-place guide for each pin, the
  dedupe check paired every guide place with every pin, and `QuestMapFirst.untouched` scanned every campaign for each
  place.

## Fixed
1. **The map stays mounted while you click on the map page.** A re-render of the map page keeps the mounted map. The
   heading, filters, footer and layer rows are rebuilt around it, and the side panel is redrawn in place. The pins go
   through `QuestAtlas.update()`, which diffs them: an unchanged pin keeps its button (only its position is updated),
   and only new or changed pins are created.
2. **No page restyle when a dialog opens.** Behind the near-opaque backdrop (86 % dark plus blur), the Studio's own
   page is not drawn while a Studio dialog is up (`content-visibility: hidden`). Each part keeps its last size, so the
   scroll doesn't move. Opening a dialog now restyles only the dialog and the app chrome. When the dialog closes, the
   page comes back in the next frame and focus returns right after, so the click itself doesn't wait for a restyle.
3. **`fit()` only measures when a new walk line needs framing.** The map's size now comes from its ResizeObserver
   (read after layout), so a click never forces a layout of the page.
4. **The Map tab, or a filter change while you're already on the map, keeps your scroll.** It no longer scrolls to
   the top, which forced a layout after every re-render.
5. **A clicked pin isn't focused a second time.** The click already focuses it; the extra focus forced a style pass.
6. **Our layer computations are remembered per journal version:** the guide's id index, the dedupe check (keyed by
   the journal state plus its `updatedAt`, pin count and campaign count) and the map-first quest references (keyed by
   the journal state plus `updatedAt` and campaign count).

## Numbers
Measured with the new `dev/checks/questperf65.js` on this machine (Xvfb, software GL, a shared 4-CPU box). Script time
is the main-thread time spent in handlers, timers, microtasks and frame callbacks, including any style or layout they
force. Each value is the best of 3 runs in one trace; "before" is main at ffcbe3d. The fixture is 100 map places (40 of
the owner's own pins plus 60 guide places, the journal's limit), 30 visited, 20 Paris place quests in progress,
3 walks, 40 shows this week, a show log, and an Outing desk with 160 events and 40 saved.

| interaction | script before → after (ms) | other changes |
|---|---|---|
| ★ favorite (save → re-render) | 5.6 → 2.0 | CPU 109 → 43 ms, layout 34 → 21 ms |
| visit stamp | 6.7 → 1.4 | CPU 110 → 37 ms, layout 34 → 12 ms |
| pin click | 7.8 → 7.4 | |
| place details dialog open | 23 (runs 45 / 48 / 23) → 14.5 | restyle 1,181 → 307 elements, wall time 70 → 19 ms |
| dialog × close | 1.6 → 1.9 | the page's restyle (≈ 1,260 elements) now runs in the next frame, not in the click |
| Outing desk open | ≈ 0 → 2.7 | forced style 29 → 23 ms, restyle 1,595 → 713 elements |
| Shows chip off / on | 17.5 / 21.5 → 7.3 / 7.3 | layout 22–26 → 8–10 ms, wall time 43–50 → 17–23 ms |
| Map tab while on the map | 41 → 10 | forced 16 → 0 ms |
| rail back to the Studio | 5.5 → ≈ 0 | forced 8.5 → 0 ms, layout 26 → 2 ms (no `fit()` layout read) |
| one re-render of the map page (CPU profile) | ≈ 13 ms of JS, then a full map rebuild and layout → the same JS, with the map kept | |

With a single run instead of the best of 3 (round 64's single-run baseline), the dialog open went from 33–36 ms to
14–16 ms, and the × close from 26–35 ms to 2–8 ms of script.

## The check
- `dev/checks/questperf65.js` (new) builds the big journal fixture, opens the Paris map and traces 12 interactions
  3 times each.
- Budget: ≤ 16 ms of script per click or dialog, best of 3. Main fails it on the dialog open, the Shows chip and the
  Map tab.
- Options: `window.QP_REPORT = 1` reports without failing, `QP_BUDGET` overrides the budget, `QP_DUMP` writes the raw
  trace, and `QP_PROFILE = 1` returns a CPU profile of 20 map-page re-renders.
- `node dev/run-checks.js questperf65` runs it together with the checks it touches.

Test results (each batch of at most 5 checks run under `flock /tmp/hearth-run.lock`):
- **Pass:** questperf65, lazy, unit:boot-test, unit:quest-paris-test, unit:datasafe-scan, unit:winmac-test.
- **Fail on main as well, identical with and without this change** (checked by running main's files): mapfirst64
  (68 ✓, then the same error at its line 171), quest-paris ("guide pins by default"), quest-world ("Paris after
  hours"), quest-field ("six categorized pins"), quest-studio, outing-desk, parisjournal64 ("the Studio"), questhud61
  ("Studio repainted") and showsync61 ("logo pins"). These checks predate Codex's latest Studio UI ("guided quest
  companion", "familiar venues") and need updating by their owners.

## For Codex
Every change in your files is small and commented with `(round 65, questperf65)`:
- `tools/quest-atlas.js`
  - `mount()` keeps the host size from its ResizeObserver (`size()`).
  - `fit()` returns before measuring when no new line needs framing.
  - `draw()` diffs the pins (`pinNodes`, a per-pin look signature; `selected`, `off-route` and `data-details` are
    toggled in place) instead of `pins.replaceChildren()`.
  - The mount's handle has a new `update({ places, selected, lines, onSelect, onAdd })` and exposes `host`.
- `tools/quest-journal.js`
  - `render()` keeps the mounted map page (`worldKeep`) when the map page re-renders itself.
  - `worldMap(keep)` inserts its rows above the kept layout, redraws only the side panel and calls `atlasView.update`.
  - `dialog()` adds `.qj-under-dialog` to the root while dialogs are open. The last close removes it and returns
    focus one frame later.
  - `navigate()` scrolls to the top only when the page changes.
  - `mapPick()` doesn't refocus a pin that already has focus.
- `tools/quest-journal.css`: two rules at the end (`contain-intrinsic-size: auto none` on the root's children, and
  `content-visibility: hidden` under `.qj-under-dialog`).
- Ours: `tools/quest-paris.js` (the `byId` index, `needsDedupe` remembered per journal version) and
  `tools/quest-mapfirst.js` (`untouched()` reads the journal's quest references once per journal version).

Not changed, possible next steps:
- Opening the Outing desk still forces about 23 ms of style for its own large dialog.
- The page's restyle after a dialog closes now runs in the next frame instead of in the click.
- The map's pins are about 5 elements each; drawing the icons with CSS masks would roughly halve that.

## For the patch notes
- **Sidequest Studio feels instant again:**
  - Starring a place, stamping a visit, clicking a pin, or switching the Food & stops / Nights / My walks / Visited
    chips no longer rebuilds the Paris map. Only the pin or panel that changed is redrawn.
  - Dialogs (place details, the Outing desk, every Studio pop-up) open without making the whole page behind them
    restyle.
  - Coming back to the Studio from the rail no longer stalls on measuring the map.
- **The map keeps your scroll** when you click the Map tab or change a filter while you're already on the map.
