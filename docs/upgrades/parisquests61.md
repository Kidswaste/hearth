# Paris quests (round 61, parisquests61)

The owner asked for cool places to see in Paris as quests on the map, a quest to go and get AirPods at Apple Opéra,
one about making music in the park, and one about offering someone a drink, "or stuff like that". Everything is built
into Codex's Sidequest Studio (its map, journal, proof and review gate) and can be run from chat with `/quest`.

## What's new

### The Paris guide (on the Sidequest map)
1. **36 Paris places worth the trip** on the Sidequest map: famous and lesser-known places picked for someone who
   makes music and goes to shows. Venues: Philharmonie & Musée de la Musique, Le Bataclan, La Cigale, Point Éphémère,
   La Machine du Moulin Rouge, New Morning, La Maroquinerie, Petit Bain, Rex Club. Record shops: Superfly, Betino's,
   Balades Sonores (at its new address, 8 rue Pierre Picard). Nights out and food: Rue de Lappe, Rosa Bonheur, La
   Recyclerie, Le Perchoir, Marché des Enfants Rouges, Ground Control. Art: Palais de Tokyo, Atelier des Lumières,
   Sainte-Chapelle, Bourse de Commerce, Rue Dénoyez, 59 Rivoli, Shakespeare and Company. Game ideas: Musée des Arts et
   Métiers, Station F. Walks and views: Belleville viewpoint, Petite Ceinture (15e), Promenade plantée, the
   Sacré-Cœur steps, Square du Vert-Galant. The guide also adds notes to Codex's own Canal Saint-Martin,
   Buttes-Chaumont, Luxembourg and La Villette pins instead of adding a second pin for them.
2. **Each place has its arrondissement, one line on why to go and the best time to go**, shown in the map's place
   panel.
3. **A go → do → proof quest for each place**: get there (check opening times, save the first thing you notice),
   do one specific thing (count the solo bars at New Morning, take three colours from the Sainte-Chapelle glass,
   ask the counter at Superfly for a record…), then bring the result home (a loop, palette, sketch or note). Steps earn
   20, 35 and 35 XP, plus a "… regular" badge. XP is paid only after the journal's proof and review, like every other
   quest.
4. **Guide filters**: Shows & clubs, Record shops, Nights out, Food, Art, Walks, Views, Parks, Free, Sunset and Music
   outdoors, plus any arrondissement ("11e"). A filter shows as one chip in the existing filter bar; click the chip to
   clear it. Codex's category buttons, favorites, dice and search also work on guide pins, and search finds guide words
   ("records", "pigalle").
5. **One "Paris guide" button in the map's footer** opens the guide: add it to the map or take it off, the filter
   words, and the personal quests with their progress.
6. **Taking the guide off is safe**: only untouched pins go. Pins you visited, starred or have a quest on stay.

### Personal quests
7. **Get my AirPods**: check stock and book a pickup on apple.com/fr (there is an "Open apple.com/fr" button in the
   chat note), go to Apple Opéra (12 rue Halévy, 9e, with a map pin), then pair and test them (noise cancelling,
   transparency, mic, Find My).
8. **Make music at the park**: pick a park (Buttes-Chaumont, Belleville, Luxembourg or La Villette) and pack light,
   make a 2-minute sketch on a bench with headphones on, then bring it home. `/quest park belleville` opens the
   workbench's Serum 2 & Vital desk on a sketch named "Park sketch · Belleville · <date>".
9. **Offer someone a drink**, a kind confidence quest in small steps: go somewhere relaxed, start a real
   conversation and pick up the cues (if they're busy, wish them a good evening), make a simple offer and take any
   answer warmly without insisting, then reflect in three lines. No names; no pickup scripts.
10. **Talk to a musician after a gig**: pick a small show, tell the artist one specific thing you liked (if they're
    free), then follow up.
11. **Go to an open mic**: find one, watch the whole evening, decide your own next step.
12. **Trade a record recommendation** at Superfly, Betino's or Balades Sonores, then flip it into a sketch.
13. **Sunrise walk**: Belleville, the canal or the Sacré-Cœur steps; record the city waking up and make a pad from it.
14. **Go to a show alone**: pick this week's show from Shotgun/DICE and stay to the end.

### From chat (`/quest`)
15. `/quest paris [filter]`: puts the guide on the map the first time and opens it, filtered (`/quest paris shows`,
    `/quest paris records`, `/quest paris 11e`).
16. `/quest places [filter]`: lists the places in the chat (name, arrondissement, why go).
17. `/quest go <place>`: starts that place's quest (`/quest go canal`, `/quest go bataclan`); `/quest bataclan` also
    works.
18. `/quest add <airpods|park|drink|gig|openmic|records|sunrise|solo>`: starts a personal quest and opens its first
    step.
19. `/quest park <park>`: the park quest plus a workbench sketch named after the park.
20. `/quest list`: your Paris quests with step progress and the next step.
21. `/quest guide off|on`: takes untouched guide pins off the map, or puts them back.
22. Suggestions while typing: subcommands, personal quest names, place names, park names and filter words.

## How it fits Codex's journal
- Pins are ordinary atlas places with stable ids (`pp-*`). Quests are ordinary campaigns with stable ids (`c-pp-*` for
  places, `c-pq-*` for personal quests) and three or four steps each, in Codex's quest fields with a `proofHint`.
  Starting a quest twice reopens the same campaign. Opening, pinning or stamping a place awards nothing.
- Writes from chat go through the journal's own transactional `mutate`, so the open journal never overwrites them.
  The guide is added only when you ask (`/quest paris` or the footer button), never silently.
- Addresses were checked against public listings (Paris je t'aime, Time Out, paris.fr, The Vinyl Factory and others)
  in October 2026. Coordinates are placed from those addresses and are accurate to about a block, not surveyed. Every
  "go" step says to check today's opening times. The data lives in `tools/quest-paris.js`.

## Tests
- `node dev/quest-paris-test.js` (new, 7 groups) checks every required field, ids, Codex kinds and the tags. It checks
  that coordinates sit inside Paris and inside the atlas bounds, within 2.9 km of their arrondissement's centre, and
  that no two pins are stacked. It also checks: the guide added once, reusing Codex's pins; the 100-place cap; the
  filters; stable go → do → proof quests whose XP comes only after proof + review, in order; every personal quest, the
  Apple Opéra pin and the park's choice of pin; consent-aware wording in the drink quest; and removal keeping
  visited, starred and quest pins.
- `dev/checks/quest-paris.js` (new smoke check, 45 checks, offline map tiles): `/quest paris` adds 32 new pins once,
  and 38 render. The shows and 11e filters work, and the chip clears them. Codex's category filter and search find
  guide places. `/quest places` works. A pin's panel shows the guide note and starts the place quest. Step one pays
  XP only after a fixture review, and `/quest list` shows 1/3 and names the next step. Also checked: `/quest add`
  airpods/drink, `/quest go canal`, completion, the guide dialog's personal cards and filter, `/quest park belleville`
  naming the workbench sketch, guide off/on keeping quest pins, no sideways scroll at a narrow width, and nothing
  opened in the browser on its own.
- Also run: the quest unit tests (quest, field, world, life, deck, review, workstation), `unit:boot-test` (first
  screen unchanged: 72 scripts / 29 stylesheets), `lazy`, and the existing quest-* smoke checks (results in the final
  report).

## For Codex
Codex files touched (all small, additive and commented `parisquests61`):
- `tools/quest-journal.js`:
  - `mapPlaces()` also filters by `mapFilter.guide` and searches guide words.
  - `worldMap()` appends the guide filter chip to the filter bar, calls `QuestParisUI.panel(selected, panel)` for the
    guide note and place-quest button, and adds `QuestParisUI.footer()` (the "Paris guide" button) to the map footer.
  - The returned object gains `paris`: `{ mutate, ready, mapFilter(f), ui() }`, where `ui()` gives the journal's own
    helpers to the guide.
  - All hooks are optional: without the Paris files the journal behaves exactly as before.
- `tools/quest-journal.css`: four rules at the end (`.qj-paris-*`).
- `tools/workbench-ui.js`: a new `startSketch(title)` export. It sets the worktable's project name, persists it and
  returns the old name. Nothing else changes.
- `lazy-data.js` (+ the generated `lazy-meta.js`): `tools/quest-paris.js` (before quest-journal.js) and
  `tools/quest-paris-ui.js` (after it) join the `questjournal` group. Globals: `QuestParis`, `QuestParisUI`. The META
  gains the `/quest` command.
- New files (ours): `tools/quest-paris.js` (UMD like quest-core; data + pure rules), `tools/quest-paris-ui.js` (map
  hooks + `/quest`), `dev/quest-paris-test.js`, `dev/checks/quest-paris.js`. `dev/run-checks.js` lists them in
  `quests`.
- Not touched: quest-core, quest-catalog, quest-atlas, quest-shelf, quest-review. Campaign fields `parisPlace` /
  `parisPersonal` are extra fields that `validate()` already allows.

## Risks
- `/quest` is a new command name. If another round-61 stream also registers `quest`, the later one replaces it
  (Commands warns about duplicates). Merge by delegating to `QuestParisUI.run(args, ctx)` for the subcommands above.
- `/quest park` renames the workbench's project label (the work itself is untouched). The reply says what it was
  called before.
- Opening hours and venues change. The data says to check before going and never claims a place is open.

## For the patch notes
- **Paris on your quest map**: 36 hand-picked places (venues, record shops, parks, views, art, food), each with its
  arrondissement, why it's worth going, the best time, and a small go → do → proof quest that earns XP. Filter by
  shows, records, parks, views, nights out, an arrondissement and more.
- **Personal quests**: get your AirPods at Apple Opéra, make a two-minute track in the park (the workbench opens on a
  sketch named after the park), offer someone a drink (kind and low-pressure, any answer welcome), talk to a musician
  after a gig, go to an open mic, trade record recommendations, a sunrise walk, a show on your own.
- **All from chat**: `/quest paris`, `/quest paris shows`, `/quest go canal`, `/quest add airpods`,
  `/quest park buttes`, `/quest list`.
