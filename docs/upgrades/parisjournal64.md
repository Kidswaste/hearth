# parisjournal64 (round 64): My Paris, a map journal of what you actually did

The owner goes out in Paris (place quests, shows, walks, music in the park). This stream adds **My Paris** to the Paris
map in Sidequest Studio. It's a personal journal of what you've actually done, made only from records Hearth already
keeps:
- every place quest you finished
- every show you said "How was it?" about
- every walk you walked
- every park session you recorded

It shows on the map by default and works by clicking. It also gives you a monthly recap with an image card you can share.
It reads only existing records, adds no new store (just a tiny on/off and month preference on this computer), runs no
timers, fetches and uploads nothing, and uses no AI.

## What shipped

**On the Paris map** (✦ chip › Open Sidequest Studio › Paris after hours, or any way you open the map)
1. **My Paris pins, visible by default.** Each moment is a small round pin with a ✓, nudged up-right so the place's
   own pin stays visible. It sits where the moment happened:
   - finished Paris guide place quests, Codex's field quests, and personal quests that have a place (AirPods at Apple
     Opéra…)
   - shows from "Shows I went to" (showprep62), at the venue
   - finished walks (questwalk63), at their first stop. Each stop you've walked counts on its own while the walk is
     unfinished.
   - park sessions: parkjam62's takes, grouped per sketch per day, at the park
2. **Photo pins**: a moment with a photo (your show photo, or a proof photo) shows the photo in its pin.
3. **One pin per spot**: several moments at the same place share one pin ("Le Bataclan · 2").
4. **A labelled chip "✓ My Paris · N" in the map's filter row**: click it to hide or show your moments. Your records are
   never touched.
5. **The timeline strip under the map**:
   - month chips (All · 5, Oct 2026 · 4, Sep 2026 · 1…). Click one to show only that month on the map.
   - a line of that month's moments as coloured dots (pink places, orange shows, yellow walks, green park sessions;
     filled when there's a photo)
   - a **My month in Paris** button
   - the month you pick is remembered on this computer
6. **Empty and hidden states say what to do**:
   - with nothing yet: "finish a place quest, tap “How was it?” after a show, walk a walk or record a park loop"
   - when hidden: "Hidden from the map · N moments kept" with **Show my Paris** and My month in Paris
7. **Tap a pin or a dot to see the moment**:
   - its kind, date and arrondissement
   - your photo, ★ rating and your own words (the show's moment, the proof note)
   - for a walk: its stops and km. For a stop: which walk it was on.
   - for a park session: the loop, playing right there, plus Show file
   - **Open the quest** (or **My show log** for a show)

**My month in Paris** (the button under the map, or ✦ tracker panel › 🗺 My month in Paris, or right-click ✦ › My month
in Paris…)
8. **The recap card**:
   - places, shows, walks and park sessions this month, as four tiles
   - **the 20 arrondissements as a grid that lights up**: brighter for more moments, with a pink outline for ones you
     reached for the first time
   - **Paris explored**: the % of the guide's 36 places you've been to so far (place quests, walk stops, venues, park
     spots and your own visit stamps), and how many this month added
   - the places new to you this month
9. **‹ / › to step through months.** **On the map** shows that month on the map.
10. **Save image card**: a 1080×1350 PNG drawn in the window on this computer. It has the month, the four counts, the
    arrondissement grid, Paris explored, up to three of your photos, what's new and your best-rated night.
    - It's saved to **Pictures › Hearth › My Paris** ("My Paris 2026-10.png"), with **Show file** next to it.
    - It is never uploaded. Hearth sends it nowhere.

**Also from chat** (secondary): `/paris`, `/paris month [october | last | 2026-09]`, `/paris card [month]`, `/paris off`.
Month words work in English or French, and Ctrl/⌘+K has "Quest: My Paris this month".

## How it works
- `tools/parisjournal-core.js` (UMD, no DOM, node-tested) works out:
  - `collect`: moments from the journal (`campaigns` + `records` + `submissions`), the show log, and parkList's takes
  - `arrOf`: a place's own arrondissement, else a 750NN / 75116 postcode, else the nearest arrondissement centre inside
    Paris (≤ 3 km), else none
  - `months`, `parseMonth`, `pins`
  - `recap` (counts, the 20 cells, new arrondissements and places, explored % from the guide), `recapText`, `card`
- `tools/parisjournal.js`:
  - the map layer: `pins`, `chip`, `below` (the strip), `select`
  - the moment and recap dialogs (the Studio's own dialog kit), and the canvas card
  - `/paris`
- The park takes come from `hub.parkSong.list()` (loopsong63's parkList over `<data>/creative-park/`). They are read
  once when the map first draws, and again after a new take (`hearth:quest-week` { kind: 'park-jam' }).
- The moment list is cached in memory and keyed on the journal, the show log and the takes, so redraws are cheap.
- From chat without the Studio open, the journal is read through the tracker's copy, or one status read. Nothing is
  ever written back.
- Idle cost: none. There are no timers or polling; work happens only when the map draws or you click.
- Files: `tools/parisjournal-core.js`, `tools/parisjournal.js` and `tools/parisjournal.css` are in the `questjournal`
  lazy group, so the first screen is unchanged. The ✦ tracker button loads that group on click.

## Tests
- `node dev/parisjournal64-test.js` (unit, in UNIT, 8 groups) uses fixture records: finished and half-done place
  quests, a pinned and an unpinned personal quest, a finished and a half-walked walk, three show nights (one with no
  coordinates, one removed), three park takes and a visit stamp. It checks:
  - moments by kind, the moment's photo, words, rating and loop
  - arrondissements (the guide's own, postcodes incl. 75116, the nearest centre, none for Versailles or Vincennes)
  - months and pins (one per spot, photos, pinless moments counted but not pinned)
  - the recap: counts, the 20 cells, new arrondissements and places, explored % before and after, stamps counted
  - the card's content, month words (EN/FR, short, with a year, last/this, YYYY-MM)
  - read-only: the inputs are byte-identical afterwards and the journal still validates
- `dev/checks/parisjournal64.js` (app, 27 steps, everything by clicking, offline tiles) uses fixture records written as
  the owner's features write them: real JPEGs and two real park takes through `hub.vst.parkSave`. It checks:
  - ✦ chip › Open Sidequest Studio › Paris after hours: My Paris on by default, 5 pins, 2 photo pins, the
    "✓ My Paris · 5" chip in the filter row
  - the strip under the map with All · 5 / this month · 4 / last month · 1. Clicking a month filters the pins and dots,
    and the month is remembered.
  - a show pin's moment (photo, ★★★★★, the moment, 18e), a park pin's moment (2 loops, a playable file: loop, Show
    file), the walk from its dot
  - My month in Paris: tiles 1·1·1·1, 10e 11e 18e 20e lit, the explored meter, new places. ‹ goes to last month (3e
    new).
  - Save image card: a real 1080×1350 PNG named for the month, with Show file
  - ✦ tracker › 🗺 My month in Paris → this month's recap, with its card saved too
  - nothing sent anywhere (fetch / XHR / beacon / socket watched)
  - the chip hides My Paris, and the strip's Show my Paris brings it back
  - one `/paris` command, and no timers while idle
  - Screenshots: `parisjournal-map.png`, `parisjournal-strip.png`, `parisjournal-recap.png`, plus the two cards
- Group: `sh dev/run-checks.sh parisjournal64`.
- Results (under `flock /tmp/hearth-run.lock`, ≤ 5 per hold): parisjournal64, quest-paris, questwalk63, showprep62, lazy,
  questhud61, rewards63 pass; unit:boot-test (first screen unchanged), unit:datasafe-scan, unit:winmac-test,
  unit:parisjournal64-test, unit:questhud-test, unit:quest-paris-test, unit:questwalk-test pass. `node dev/lazy-manifest.js` regenerated.

## Changes outside my files
- `tools/quest-journal.js` (Codex), two lines in `worldMap`:
  - a layer's `chip(kit)` is appended to the map's filter row
  - a layer's `below(kit)` is appended right under the map, before the footer
  - The layer comment documents both. Without such layers nothing changes.
- `questhud.js` (questhud61): one "🗺 My month in Paris" button in the tracker panel, under the rewards rows, and one
  "My month in Paris…" item in the ✦ right-click menu. Both load the `questjournal` group and open the recap.
- `lazy-data.js` (+ regenerated `lazy-meta.js`): the three files join `questjournal`, with the `ParisJournal*` globals;
  the META gains `/paris` and the palette line.
- `dev/run-checks.js`: the unit test and the `parisjournal64` group.

## Risks / notes
- Arrondissements of your own pins come from the nearest arrondissement centre: good in the middle of an
  arrondissement, approximate near a boundary. Guide places and venues with a postcode are exact.
- "Paris explored" counts guide places only (36), so your own pins and other venues light up arrondissements but don't
  change the %.
- A show without coordinates and with a venue Hearth can't match to a pin counts in the recap but has no pin.
- The card uses the system font. It's drawn the same on Mac and Windows, with slightly different letter shapes.
- mapfirst64 is adding a chip row on the map (Places · Shows · My walks · Visited). My chip uses `data-chip="visited"`
  and the layer's `chip(kit)` hook, so it can be moved into that row by changing where the hook appends it.

## For Codex
- `tools/quest-journal.js` has two new optional map-layer fields (round 64, parisjournal64):
  - `chip(kit)` → a node in `.qj-map-filters`
  - `below(kit)` → a node under the map (`content.append`, after the atlas mount, before `.qj-field-footer`)
  - Both are wrapped in try/catch like `icon` / `pins` / `lines`.
- My Paris only reads your journal:
  - `campaigns[].{id, parisPlace, mapPlace, parisPersonal, walk, quests}`
  - `records[qid].{completedAt, note}`
  - `submissions[qid][].proof.{images, excerpt}`
  - `atlas.places[].{id, name, lat, lon, kind, visitedAt}`
  - It never writes. If you rename those fields, `collect()` in tools/parisjournal-core.js is the one place to follow.
- Pins use ids `mp-*` and the atlas's existing `logo` field for photos (local `file:` URLs through `WinMac.fileUrl`).
  CSS targets `.qj-atlas-pin[data-place^="mp-"]` only.

## For the patch notes
- **My Paris**: your Paris map now shows what you've actually done: finished place quests, shows you went to, walks
  you walked and park sessions. Each is a small ✓ pin where it happened, with your photo in the pin when there is one.
  It's on by default. The pink **✓ My Paris** chip above the map hides or shows it.
- Under the map, **pick a month** to see just that month. Click a pin or a dot to see the moment again: your photo,
  your stars, what you wrote, or your park loop, playing right there.
- **My month in Paris** (under the map, or in the ✦ quest panel): places, shows, walks and park sessions this month,
  the 20 arrondissements lighting up as you reach them, what was new, and how much of the Paris guide you've explored.
- **Save image card** makes a picture of your month (1080×1350, ready for a story) in Pictures › Hearth › My Paris.
  It stays on your computer until you share it.
- Nothing new to fill in: it's all built from what you already do in Hearth.
