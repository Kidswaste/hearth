# mapbuttons66 (round 66): the map's + / − always clickable, every map layer on by default, a Layers button

Two problems the owner hit on the Paris map (Sidequest Studio › Map):

1. **The + / − zoom buttons were hidden under the tab bar.** Sidequest Studio's tab bar (Today · Map · Progress, the row
   under it and the map filters) is sticky. When you scrolled down to see the whole map, the bar slid over the map's
   top-left corner, which is where + / − / Paris live. Clicks landed on the bar, not on the buttons. A project or
   workspace tab strip over the page caused the same problem.
2. **"The map features haven't updated."** Since Codex's quieter map (paris-familiar-venues), only the 12 food and
   record stops show from the Paris guide. The other 60 guide places, park jam spots included, were hidden even on a
   profile where round 64 had put them on the map. Turning them back on meant finding "More places", which shows the
   whole guide at once.

## Upgrades

On the map
1. **+ / − / Paris stay visible and clickable whatever bar sits over the page.** When a bar covers the map's corner,
   the buttons slide down to just under its real bottom edge. When nothing covers the corner, they go back to their usual
   place. The "Couldn't load shows" line on the right moves the same way. This was checked at 1280×720 and at
   2560×1440, under Sidequest's own tab bar and under a project tab strip.
2. **A "Layers" button**, first in the strip at the bottom left of the map. It opens a small panel with one labelled
   switch per layer: Food & stops · Nights & shows · Park jams · Paris place quests · My walks · Visited · My Paris ·
   Whole guide when zoomed out. Each row has a one-line explanation. Close the panel with Done, Esc or a click
   elsewhere. When you've switched something off, the button says so ("Layers 1 off").
3. **Park jams layer (new, on by default):** the parks picked for an outdoor music session are on the map at every
   zoom: Belleville viewpoint, Parc Montsouris, and the Buttes-Chaumont, Luxembourg and Villette pins you already had.
4. **Paris place quests layer (new, on by default):** the other guide places, each with its quest, appear as you zoom
   in (two clicks on +). The zoomed-out city view stays as quiet as Codex made it. Click one and its panel opens with
   **Start this quest**. Clicking also saves it to your journal, the same way Start this quest does.
5. **The places hidden by the quieter map come back.** If your journal already holds the whole guide (round 64 added
   it), those places show again as place quests when you zoom in, each one drawn once.
6. **New layers start on, even with older saved settings.** A computer that saved layer choices in round 64 (Places ·
   Shows · My walks · Visited) gets Park jams and Paris place quests switched on. A layer you turned off yourself stays
   off.
7. The "What's new" tour step for the strip now points to Layers.

## Audit: is every quest layer visible by default?

| Layer | Fresh profile | Profile with round-64 settings | Switch |
|---|---|---|---|
| Food & stops (Paris guide picks, Codex) | on | your stored choice (on unless you turned it off) | chip + Layers |
| Nights & shows (clubs, Shotgun / DICE, Outing desk plans) | on | your stored choice | chip + Layers |
| Park jams (new) | on | **on** (wasn't stored before) | Layers |
| Paris place quests (new; zoom ≥ 14) | on | **on** | Layers |
| My walks | on | your stored choice | chip + Layers |
| Visited · My Paris (incl. park-jam takes, shows you went to) | on | My Paris's own setting (on by default) | chip + Layers |
| Whole guide when zoomed out (Codex's "More places") | off, by Codex's design | your stored choice | More places chip + Layers |

## Tests
- New `dev/checks/mapbuttons66.js`, clicks only, fresh isolated profile (group `mapbuttons66`). At 1280×720 and 2560×1440:
  - it scrolls the map under the sticky tab bar and proves the bug's setup: with the fix undone, `elementFromPoint` at +
    finds the tab bar
  - `elementFromPoint` at the centres of + and − returns those buttons
  - a real CDP mouse click on + / − changes the zoom
  - then a fixed 150 px project tab strip goes on top, and both checks pass again
  - scrolled back up, the buttons are back at their usual place
  - it saves screenshots of both sizes
- In the same check, Layers:
  - the button and panel have labels, and every layer is on by default
  - + / − stay clear with the panel open
  - Park jams show at the city zoom; Park jams off is remembered and on again brings them back
  - place quests appear at zoom 14 and switch off and on
  - Esc and Done close the panel
  - clicking a place quest opens Start this quest, and the place is drawn once
  - a round-64 journal (whole guide stored) has no duplicates, and the city zoom stays quiet
- New `dev/checks/mapbuttons66-old.js`: round-64 layer settings, with Shows turned off, stored before the map loads:
  - Park jams and Paris place quests come up on
  - Shows stays off, and the button reads "Layers 1 off"
  - one click turns Shows back on
- Updated: `mapfirst64` (the strip now starts with Layers; guide-pin counts leave out the new `ml-…` layer pins) and
  `quest-paris` ("only the picks" leaves out the `ml-…` layer pins).
- Passed: mapbuttons66, mapbuttons66-old, mapfirst64, paris-quiet-map (Codex's quiet-map check, unchanged),
  parisjournal64, questwalk63, showsync61, unit:boot-test, unit:commandonly-scan.
- These fail the same way on an untouched copy of this branch's base (becd52e), so they aren't caused by this stream:
  - quest-paris: "search finds guide words"
  - quest-world: a missing button
  - quest-field: "search updates selection" / "Field kit did not survive reload"
  - quest-focus: a missing element
  - questperf65: its "Outing desk" button is gone
  - lazy: "all held at start"
  - unit:datasafe-scan: quest-chat.js
  - unit:winmac-test: 1 shell-cmd hit
  - unit:errorcalm-scan: the same 11 places
- Run with `node dev/run-checks.js --exact …`, every app-launching batch under `flock /tmp/hearth-run.lock`, ≤ 5 per hold.

## Lightness
- No timers and no polling. The button-clearing runs on scroll or resize events only, at most once per frame
  (requestAnimationFrame). It does one or two hit-tests and writes only when the offset changes. Its listeners go away
  when the map leaves the page. Nothing runs while the map is hidden or the page is still.
- The panel's Esc and outside-click listeners exist only while the panel is open.
- The new layers are pins computed on each map render (72 guide entries, no network). They aren't journal places, so
  the journal doesn't grow.

## For Codex
No Codex file was edited. Everything lives in our `tools/quest-mapfirst.js` + `.css`, through your existing hooks:
- `QuestJournal.addMapLayer` registers a new layer, `mapfirst-guide`. Its pins have ids `ml-<guide id>` and use
  `tone: 'qj-pin-guide'`, so they look like the guide's other untouched places. Its `select()` calls
  `QuestParis.ensurePin` and then selects the pin.
  - It never draws a guide place the journal already draws (`pinOf`, `untouched`, selected, fullGuide), and never one of
    `QuestParis.mapPicks`.
  - Place quests carry `minZoom: 14`, which `quest-atlas.js` already supports, so your quiet city zoom
    (`dev/checks/paris-quiet-map.js`) still passes unchanged.
- Your checks that count `.qj-pin-guide` pins may want `:not([data-place^="ml-"])` if you ever count exact numbers.
  At zoom 12 the Park jams add two: Montsouris and the Belleville viewpoint.
- The controls fix moves `.qj-atlas-controls` and `.qmf-status` with an inline `transform` only. If you move the
  controls elsewhere in `quest-atlas.js`, `clearControls()` keeps working as long as they stay a direct child of the map
  element.
- Ours, touched: `trynew-core.js` (tour text), `dev/checks/mapfirst64.js`, `dev/checks/quest-paris.js`,
  `dev/run-checks.js` (group `mapbuttons66`).

## For the patch notes
- **The map's + and − buttons are always clickable now.** Before, when you scrolled Sidequest Studio's map page, the
  tab bar at the top (Today · Map · Progress) slid over them. Now they move down to just below whatever bar is in the
  way.
- **New "Layers" button on the map** (bottom left, first in the row of chips). Click it to see every layer by name,
  with a switch for each: Food & stops, Nights & shows, Park jams, Paris place quests, My walks, Visited · My Paris.
  Close it with Done.
- **Park jam spots are back on the map**, the parks picked for an outdoor music session.
- **Every Paris place quest is back.** Zoom in twice with + and the guide's places appear, each with its quest. Click
  one, then **Start this quest**. The zoomed-out view stays calm.
- **New layers start switched on.** Anything you switched off yourself stays off, and the Layers button shows how many
  are off.
