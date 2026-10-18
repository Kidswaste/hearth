# parisdedupe64: one real place, one pin

Round 64, small focused stream. Codex grew the Paris guide to 60 places (36b257c), our parisquests61 guide holds 36
of them, and mapfirst64 now seeds the guide into every journal when the map opens. The question: does the same real
place now show twice on the map, or exist twice in a journal?

## What we found

- **In the shipped data: no duplicates.** Codex added its 24 places (16 discovery places and 8 with official
  sources) to the same `RAW` list in `tools/quest-paris.js`, with new `pp-*` ids. None of them is the same place as
  one of our 36. Codex's four original pins (Canal Saint-Martin, Buttes-Chaumont, Luxembourg, La Villette) were
  already shared by id (`place-*`) since round 61. Checked across all 60 guide places, the Apple Opéra pin and Codex's
  six default pins: no two are within 120 m with a shared name word, and no name appears twice. Every guide id that
  has ever existed in git history is still there, so no place was renamed under a journal. Places that sit close
  together are still different places: La Place and the Forum des images (71 m), La Bellevilloise and La Maroquinerie
  (54 m), Le Trabendo and the Philharmonie (76 m).
- **In journals: possible.** If you pinned a venue yourself, through the Outing desk's "Pin this venue on my Paris
  map" or with "Add a place", and the guide has the same place, then mapfirst64's default seeding (or "Explore
  places") added the guide's pin beside yours. Codex's pin path only reused a pin within about 20 m
  (0.0002°), so a venue geocoded 50 m away from the guide's pin got a second pin.
- **Map layers:** Codex's Outing desk event pins (`od-venue-*`, layer `outing-desk`) had no chip in mapfirst64's
  strip.

## What changed

**Twins (tools/quest-paris.js).** A place of yours that is within 120 m of a guide place and shares a name word
with it (accents and "Le/La/Parc/Musée…" ignored) is that guide place's *twin*. Your pin wins: it stays, keeps its
name, kind and mission, and gets `guide: '<guide id>'`. The guide's notes, quest steps, tags, filters and "Start
this quest" attach to it, the same way parisquests61 attached its notes to Codex's four original pins.
- `ensurePin` and `addGuide` (Explore places, mapfirst64's seeding, walks, mini adventures, friend outings) return
  or link the twin and don't add a second pin. Callers now select `ensurePin(...).id`, not the guide id.
- `of(place)`, `pinOf(s, gid)`, `twinOf(s, g)`, `spotPin(s, spot)`, `sameName`, `metres`, `TWIN_M`: small
  helpers, exported.
- `dedupe(s)` / `needsDedupe(s)`: a journal that already has **both** pins is merged **once** (it's idempotent:
  afterwards there's nothing left to merge). Your pin keeps its name, kind and mission. It gains the earlier visit
  stamp and the star. If you had edited the guide pin's mission or name, that text is appended to your mission (up
  to 500 characters), so nothing is lost. Codex's map-mission campaigns (`mapPlace`) and the map selection move to
  your pin. Place quests keep their guide id (`c-pp-*`, `parisPlace`), so progress, XP and "Continue" are unchanged.
  If both pins carry the same Codex map mission (Codex allows one campaign per place and mission), the merge would
  break that rule, so both pins stay as they are.
- `hasGuide` counts a twin as present.

**When it runs.** On map open (`tools/quest-mapfirst.js` `open()`): one mutate if `needsDedupe`, with the toast
"One pin per place: your pins now carry the guide's notes." `addGuide` also calls `dedupe` first.

**Outing desk pins (Codex's tools/quest-journal.js, one expression).** "Pin this venue on my Paris map" now reuses
any pin of the same venue (120 m plus a shared name word) or the guide's place for it (`QuestParis.spotPin`) before
it creates a new one.

**Chips.** Outing desk event pins now come under **Shows**: Shows off hides them, and the Shows count includes the
Outing desk's events. The strip is still one row of four chips plus "Plan a walk"; no fifth chip.

**Adapters (one line each).**
- `tools/quest-paris-ui.js`: `keep`, `words` and `panel` use `P.of(place)`. "Show on map" and "Show meeting place"
  select the pin's own id.
- `tools/quest-walk-core.js`: a twin's visit stamp counts for its guide place, and a twin isn't offered as a second
  stop.
- `tools/quest-walk.js`: no extra walk-stop pin where a twin stands.
- `tools/parisjournal-core.js`: `placeById` finds the twin, and a twin's stamp counts toward "Paris explored".

**Tests.**
- `dev/quest-paris-test.js`, 4 new groups:
  - no two pins within 120 m with similar names, and no repeated names;
  - a twin is the pin;
  - merging an existing journal keeps visits, stars, quests, XP and the selection, happens once, and "Explore
    places" and "Browse places" still work;
  - the map-mission clash leaves both pins.
- `dev/checks/mapfirst64.js`:
  - pin count is sane (≤ 100 stored, guide ≥ 60, nothing drawn twice, no near-same-name pairs);
  - Outing desk pins ride the Shows chip;
  - section 8b: a journal with both pins is merged on open, the panel shows the guide quest's "Continue", and
    "Explore places" adds no second pin.
- `dev/parisjournal64-test.js`: the fixture's "venue without coordinates" was Le Trabendo. Codex's 60-place guide
  now includes Le Trabendo, so that show gets a pin and the test was already failing on main. The fixture now uses
  Glazart.

**Runs** (under `flock /tmp/hearth-run.lock`, ≤ 5 per hold), all ✓:
- app checks: mapfirst64, quest-paris, parisjournal64, quest-world, lazy, paris-discovery, paris-social,
  questwalk63, quest-field, outing-desk;
- unit checks: unit:boot-test, unit:quest-paris-test, unit:datasafe-scan, unit:winmac-test,
  unit:parisjournal64-test.

`city-integration` fails with "bridge starts on My lineup", and fails the same way on the base commit without these
changes. It's a pre-existing issue in Codex's check and not related to this stream.

## For the patch notes

- **One pin per place on the Paris map.** If you pinned a venue yourself (say from the Outing desk) and the Paris guide
  also has it, the map now keeps just your pin, and the guide's notes and "Start this quest" appear in its panel. A map
  that already showed both merges them once when you open it, keeping your visit stamps, stars and quests.
- **Outing desk events follow the Shows chip** on the map strip: click **Shows** to hide or show both this week's shows
  and the Outing desk's events.

## For Codex

- Your 24 new places and our 36 don't overlap (thank you for appending to the same list). Your four original pins
  stay the shared pins.
- `tools/quest-paris.js` (shared file): new twin helpers and `dedupe` (block commented `parisdedupe64`).
  `ensurePin` returns the twin when there is one. `addGuide` returns `{ added, full, linked }` (`linked` is new).
  `startPlace`, `startPersonal`, `startOuting` and `startSocial` select `ensurePin(...).id`. Places may carry an
  optional `guide` string. `QuestCore.validate` already accepts it, and `savePlace` keeps it on edit.
- `tools/quest-journal.js`: one expression in `outingDesk`'s `pin`: `||window.QuestParis?.spotPin?.(s,{name,lat,lon})`
  after your 0.0002° check.
- `tools/quest-paris-ui.js`: `P.byId(place.id)` became `P.of(place)` in `keep`, `words` and `panel`. Two "show on
  map" buttons select `ensurePin(...).id`.
- When you add places: keep them more than 120 m apart, or give them no shared name word. The quest-paris test
  enforces this, and also checks that no name appears twice.
