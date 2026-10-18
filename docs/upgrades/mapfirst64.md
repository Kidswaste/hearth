# mapfirst64 (round 64): the Paris map shows everything new, with no command

The owner: "I really don't use commands at all, also it feels like the map features haven't updated at all."
They were right. On their install, Sidequest Studio › the Paris map looked the same as before round 61:
- the Paris guide's places (36 then, 44 with Codex's 8 new ones) only appeared after `/quest paris` or the footer's "Paris guide" button
- this week's shows only appeared after `/shows` or "Load this week's shows" behind the ✦ icon
- walks only appeared after `/quest walk` or a button inside the guide dialog

Reproduced on a fresh profile and on a journal that already has Codex's pins plus the owner's own (visited, starred).
Both showed only those 6 or 8 pins. Now the map shows the new layers as soon as it opens, and every one of them works
by clicking.

## Upgrades

On the map, by default
1. **The Paris guide's places are on the map as soon as it opens.** They're added to your journal once, the same way
   `/quest paris` adds them. Your own pins, stars, visits and the selected place stay exactly as they were. This works
   for a brand-new journal and for one you already use.
2. **Guide places look different from your own pins:** smaller, with a dotted ring. At the whole-city zoom they shrink
   to small coloured dots, so the map doesn't get crowded. Zoom in, or hover a dot, to see the full pin. Once you start,
   star or visit a guide place, it looks like one of your own pins.
3. **This week's shows load when the map opens.** This is showsync61's once-a-day Shotgun / DICE read, which used to
   start only after you asked for shows once. Venue pins wear their logos, as before.
4. **A small line on the map tells you when the shows couldn't load**, for example "Couldn't load DICE — last list
   from Sat 18 Oct" or "Couldn't load Shotgun/DICE — no list yet". The last good list stays on the map. Click the
   line to retry. While the list is loading, the line says "Loading this week's shows…".
5. **Visited places wear a ✓** on their pin (venues you went to keep showprep62's own ✓).

One strip on the map (one row, in the map's own button style, bottom left)
6. **Places · Shows · My walks · Visited**: layer chips with counts, for example "Places 44", "Shows 4" and
   "Visited 2". Click a chip to hide that layer and click again to show it. Hiding never deletes anything: guide
   places you've started, starred or visited stay visible, and so does the selected pin.
   **Visited is My Paris** (parisjournal64): the one chip shows or hides your visit ✓ and My Paris's moments together. Its
   count is My Paris's moments, or your visit stamps when there are none yet. There's no second My Paris chip in the
   filter row.
7. **The chips are remembered on this computer.** A layer you hide stays hidden the next time you open the map.
8. **Plan a walk** button: it makes the default walk (2 h, 3–5 places you haven't visited, Métro to Métro), draws it
   on the map and opens the walk dialog (Open walking route · Save as a walk quest · 3 h instead · Another area). It
   turns My walks back on if it was off.

Panels
9. **A guide place's panel shows its quest**: the three steps (get there → the one specific thing → bring it home),
   the XP, and a **Start this quest** button. Once started, the button reads "Continue: <next step>" and done steps
   get a ✓.
10. **A show pin opens the venue with the next show's buttons right there**: Make it a quest · Get ready · Keep in my
    lineup · Tickets. Later shows at the venue are listed below it.

Checked by clicking only (dev/checks/mapfirst64.js uses no chat command): the footer's Paris guide (its personal
quests and Make a walk), the ✦ Shows this week list, a show card's Make it a quest / Get ready, a place's Start this
quest, the walk dialog's Save as a walk quest, Stamp my visit, and every chip.

## Tests
- New `dev/checks/mapfirst64.js` (group `mapfirst64`), 32 steps, no chat command (it fails if one is used). It uses
  the saved Shotgun / DICE responses and offline tiles. It checks:
  - **Fresh profile:** guide pins drawn and stored once (6 + the 40 new `pp-` places), Codex's pins keep their style, guide pins are dots at
    zoom 12, shows with logos load on map open, the strip has one row in the right order and starts with every chip on
  - **A guide place:** the quest card leads to Start this quest, which saves and tracks the quest and opens it
  - **A show pin:** Make it a quest and Get ready both work
  - **The chips:** Places off (yours stay, nothing deleted), Shows off, remembered in storage and when the map opens
    again, Stamp my visit → ✓, Visited off, Plan a walk → dialog + line, Save as a walk quest, My walks off and on
  - **A failed read:** DICE is cut, and the map shows "Couldn't load DICE — last list from …" with the last list kept
  - **An existing journal** (Codex's pins + a starred, visited café, no guide): the guide migrates in once, the owner's
    pin and selection don't change, and opening again adds nothing
  - **A narrow window:** the strip stays one row, with no sideways scroll
- Updated to assert the no-command default:
  - `quest-paris`: guide pins are there before any `/quest`, and the panel's Start this quest / Continue
  - `showsync61`: venue pins appear on map open with no `/shows`, and there's no failure line
  - `questwalk63`: Plan a walk and the My walks chip are on the map
- Codex's map checks now count their own pins (`:not(.qj-pin-guide)`), because the guide is on the map by default:
  `quest-world`, `quest-field`, `quest-focus`.
- Results after merging origin/main (Codex c0ad4a7) and claude/intelligent-galileo-yaiqem (parisjournal64,
  liveset64), all under `flock /tmp/hearth-run.lock`, ≤ 5 per hold:
  - Passed: mapfirst64, quest-paris, showsync61, questwalk63, showprep62, parisjournal64, quest-world,
    quest-map-tiles, quest-field, quest-focus, outing-desk, questhud61, weekquest62, lazy, unit:boot-test,
    unit:datasafe-scan, unit:winmac-test, unit:quest-paris-test, unit:questwalk-test, unit:parisjournal64-test,
    unit:showprep-test, unit:notify-test
  - city-integration (Codex's new check) fails with "bridge starts on My lineup". It fails the same way on a clean
    origin/main export, so it isn't from this stream.
  - unit:showsync-test: one date-dependent step fails ("breaking: changed page", it expects 7 shows; Sunday's week
    holds fewer). That test drives `showsyncmain.create()` directly, which this round didn't change.
- Screenshots (before / after, fresh and existing journal) are listed in the stream's final report.

## Risks
- The guide is now added to a journal without being asked. It's the same idempotent add as `/quest paris`, done once
  per computer (`hub.questmap.guideSeeded`). It never touches your own pins, and `/quest guide off` still takes the
  untouched guide pins off (they don't come back on their own). A map close to Codex's 100-place cap gets as many as
  fit.
- The once-a-day Shotgun / DICE read now starts when the map opens, even if you never asked for shows. It's the same
  polite read as before (robots.txt, at most once a day per page, it stops when a site asks). Turning the Shows chip
  off stops it.
- Test runs (dev/smoke.js) now start with the show sync offline in the main process until a check installs the saved
  responses (`shows:test`), so no check can reach the real sites by opening the map.

## For Codex
Touches of your files, all small, additive and commented `mapfirst64`. Without `tools/quest-mapfirst.js` every hook is
a no-op.
- `tools/quest-journal.js`:
  - `worldMap()` first line: `window.QuestMapFirst?.open()`. It adds the guide once and starts the shows' read.
  - `mapPlaces()`: `&&(!window.QuestMapFirst||QuestMapFirst.keep(p,state))`. These are the Places / Visited chips;
    the selected pin is always kept.
  - The layer loop: a layer's icon still joins the head row, but its pins / lines are skipped when its chip is off
    (`QuestMapFirst.off(layer.id)`: showsync → Shows, questwalk → My walks).
  - Pins passed to `QuestAtlas.mount` carry `tone: QuestMapFirst.tone(p,state)` (`'qj-pin-guide'` for an untouched
    guide place).
  - After the mount: `window.QuestMapFirst?.overlay(map,layerKit)`. It puts one strip inside the map element, plus the
    shows' status line.
- `tools/quest-atlas.js`:
  - a place's optional `tone` (`/^[\w-]+$/` only) becomes an extra class on its pin
  - `draw()` sets `host.dataset.zoom` so CSS can follow the zoom
- parisjournal64 (ours): `QuestMapFirst.ownsChip('parisjournal')` makes the journal's filter-row chip hook skip My
  Paris. The strip's Visited chip reads and sets `ParisJournal.prefs.on` / `toggle()`. `dev/checks/parisjournal64.js`
  finds the chip in `.qmf-strip` and checks that there is only one.
- `dev/checks/quest-world.js`, `quest-field.js`, `quest-focus.js`: pin counts use `:not(.qj-pin-guide)`, and
  quest-focus finds the new place by name instead of counting places. Nothing else changed.
- Merged with your c0ad4a7 (city actions row: Explore places · events · My lineup; outing-event venue pins; 8 more
  guide places). Explore places still works: it adds any missing guide pins and clears the filters, but the map now
  adds the guide on its own, so you may want to repurpose that button. Your outing-event pins aren't on a chip. To put
  them under one, add your layer id to `LAYER_OF` in tools/quest-mapfirst.js (e.g. `outingdesk: 'shows'`).
- Ours: `tools/quest-mapfirst.js` + `.css` (in the `questjournal` lazy group, after quest-walk). Other changes:
  - `tools/quest-paris-ui.js`: the panel's quest card and Start this quest
  - `showsync.js`: `showActions()`, used on the show card and on the venue dialog's next show
  - `showsyncmain.js`: offline by default in test runs
  - `tools/quest-walk.js`: `QuestWalk.plan()`
  - `dev/run-checks.js`: the `mapfirst64` group

## For the patch notes
- **Your Paris map finally shows what's new, with no commands.** Open Sidequest Studio's map and you'll see:
  - the Paris guide's places, drawn lighter than your own pins and shown as small dots when zoomed out
  - this week's shows with venue logos (loaded once a day when the map opens; if Shotgun or DICE can't be reached, a
    small line says so and keeps the last list)
  - a ✓ on every place you visited
- **One strip on the map: Places · Shows · My walks · Visited.** Click a chip to show or hide that layer. Hiding never
  deletes anything, and Hearth remembers your choice. Next to the chips, **Plan a walk** draws an afternoon walk on
  the map.
- **Click a guide place** to see its three-step quest and **Start this quest**. **Click a show's venue** to get
  **Make it a quest** and **Get ready** for its next show.
