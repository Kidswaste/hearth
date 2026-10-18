# questfix65: Sidequest checks after Codex's new Studio (round 65 triage)

## Verdict: is the owner's app broken?
**No, the map and the tracker work.** On a fresh profile at this branch's HEAD, clicking Sidequest Studio › **Map** shows:
- Codex's six pins, plus 12 guide picks (food stops, record shops, a few outdoor stops), drawn lighter.
- The seven familiar clubs on the Nights layer. La Machine has its logo and opens its nights.
- The strip at the bottom of the map, all chips on: Food & stops · Nights · My walks · Visited · More places · Plan a walk.
- My Paris under the map.
- The ✦ chip. Starting a pin's quest by clicking moves it to the new quest.

Screenshots: `/tmp/claude-0/-home-user-hearth/9f35b161-4cfe-5e1b-a7ea-29894dc20921/scratchpad/questfix65/shots/`.

Our layers and hooks all still run. Codex's new navigation (24e888c) still mounts the map on the world page, and `addMapLayer`, `QuestMapFirst.open/keep/tone/overlay` and the layers' `pins/below/chip` hooks are all called. questperf65's pin diffing keeps the layer pins: mapfirst64 checks each layer chip on and off, show and walk pins, and that no pin is drawn twice.

Two places did break for the owner, and both are fixed here:
1. **✦ Try what's new pointed at a button that no longer exists.** Four tour paths (Quest tracker, Paris map, This week's shows, Show night) rang the Studio's "Paris after hours" key, which Codex's rail removed. The tour could not ring anything or move on. It now rings the rail's **Map** tab, with the old key kept as a fallback, and its words say "click Map".
2. **The Studio could take focus back after a dialog closed.** questperf65 delays the "focus back to the button that opened the dialog" by a frame. That delayed refocus could pull focus away from a control that had just been focused, including one inside the next dialog. It now only refocuses when nothing has focus.

Everything else was **stale checks**. Bisect over 534dab0 → HEAD, with the same checks at each commit:
| commit | quest-paris | showsync61 | quest-world | questhud61 | mapfirst64 | quest-field / quest-studio / outing-desk / parisjournal64 / clickfirst64 |
|---|---|---|---|---|---|---|
| 534dab0 (round 64) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 65b428c Codex "Focus Paris map on familiar venues" | ✖ | ✖ | ✖ | ✓ | ✓ | — |
| 144ff27 (merge of 24e888c, guided companion) | — | — | — | ✖ | ✖ | ✖ |
| 15335fd/00791a9 questperf65 | no new failures (questperf65 ✓) |

- **65b428c** made the map quieter by design. By default it shows the guide's picks (`QuestParis.mapPicks`), and the whole guide comes back with the strip's More places. Shotgun/DICE venues other than the seven clubs appear from zoom 15. Codex updated mapfirst64 for this, but not quest-paris, showsync61 or quest-world.
- **24e888c** replaced the Studio's bench, its console bar ("Paris after hours", "Outing desk") and the top bar's "My week ▾" with a Quests / Map / Progress / Desk rail. Each tab opens a row of labelled choices, and clickfirst's quest items moved into those rows. The map's category icons became a select, and "Favorites only" became a labelled toggle. With the guided companion loaded, the hero's button reads "Continue with helper →".

## What changed
App (small, documented):
- `trynew-core.js`: `MAPKEY` = Codex's Map tab (`.qj-command-tab[data-nav-group="map"]`), with `.qj-map-key` as a fallback. The step texts now say "click Map", "Food & stops · Nights · …, More places" and "the Nights layer".
- `tools/quest-journal.js` (questperf65's own lines in Codex's file): `back()` after a dialog closes skips if another dialog is open or if something already has focus.
- `tools/quest-paris-ui.js`: `/quest paris` with no argument also calls `QuestMapFirst.explore(true)`. Its reply ("Paris guide on your map: N places") is true again, because the default map now shows only the picks. The default quiet view is unchanged.
- `showsync.js`: the `/shows` help line says "Sidequest Studio › Map".

Checks, updated to the new navigation. Each still guards the same thing:
- quest-paris: by default the picks are pinned and stored once, and only the picks are drawn. The category filter is the select. `/quest paris` still brings ≥ 30 guide pins.
- showsync61: at the city zoom, at least one club shows its logo. A second QuestAtlas at zoom 15, fed the layer's own pins, draws at least 3 file: logos. The list icon is found in the Map row, and the venue pin used is a club with nights this week.
- questhud61: the Studio has "repainted" when its header XP matches the saved journal. With QuestGuide loaded, the hero always says "Continue with helper →".
- mapfirst64: "Explore places" became the strip's More places → My spots. It adds no second Bataclan and nothing new to a journal that already holds the whole guide.
- clickfirst64: the rail's tabs are in words, and their rows list every quest feature (Plan my week, Week in review, Make a walk, My month in Paris, Rewards, Shows this week, Shows I went to, Park mode, Arrange park loops).
- parisjournal64, newtour64: the owner clicks Map, where they used to click Paris after hours.
- Codex's quest-world, quest-field, quest-studio and outing-desk:
  - Map tab, Saved plans and Outing desk replace the old map icons.
  - The category select and the Favorites toggle replace the old filter icons.
  - The journal's own pins are counted, since the clubs and the picks ride beside them.
  - The ambient-motion probe is the hero's floating quest object.
  - The keyboard tooltip is checked on the place panel's icon, once the page is back from under a dialog.

## Tests (all under `flock /tmp/hearth-run.lock`, ≤ 5 per hold; logs in scratchpad/questfix65/final*)
quest-paris, showsync61, questhud61, mapfirst64, quest-world, quest-field, quest-studio, outing-desk, parisjournal64, questperf65, questwalk63, clickfirst64 (HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package), lazy, newtour64 all ✓. unit:boot-test, unit:trynew-test, unit:quest-paris-test, unit:showsync-test and unit:questhud-test also pass.

## For Codex
- Your files touched: `tools/quest-journal.js` (one guard in questperf65's `back()`, commented `(questfix65)`), `tools/quest-paris-ui.js` (one line in `/quest paris`), and your checks `dev/checks/quest-world.js`, `quest-field.js`, `quest-studio.js` and `outing-desk.js`. The check edits only follow your new rail and Map row, and each one is commented `(questfix65)`.
- Still failing after your rail change (not touched here, yours to update): `city-integration` ("Explore places" in `.qj-city-actions`, `[data-focus=map-filter-*]`), `quest-journal` (`.qj-bench-caption` and the bench objects), `quest-icons` ("adventure shares icon controls"), `quest-session` ("Begin quest →" is "Continue with helper →" when QuestGuide is in), and `quest-life` ("illustrated desk navigation retained").
- The rail sticks to the top while scrolling. When the map is scrolled to its top, the rail covers the map's own controls (Retry street map, +, −, Paris); see shots/2-map.png. You may want a little `scroll-margin-top` or a shorter sticky rail on the Map page.
- When showsync isn't loaded, `QuestMapFirst.count()` returns 0 for places and shows, so the chips show no numbers. That looks intentional; it's only noted here.
- In `QuestAtlas`, pins are diffed by id (questperf65): two places with the same id would draw one button. mapfirst64's "no pin drawn twice" check guards this today.

## For the patch notes
- ✦ Try what's new works with the new Sidequest Studio. Its Paris map, shows and show-night tours now point at the **Map** tab (Sidequest Studio › Map) and move on when you click it.
- Closing a Sidequest dialog no longer pulls focus away from what you just clicked or typed into.
- Asking for the Paris guide from the chat shows the whole guide on the map (the same as **More places** on the map). Opening the map yourself still starts on the quieter view: food stops, record shops and your clubs.
