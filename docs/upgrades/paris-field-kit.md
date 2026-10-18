# Paris field kit

The map now presents a place and one next action. Friends, birthdays, trip plans, the place list and reward ideas open in small notebooks instead of filling the main page with sections of text.

- Six original SVG symbols identify sound, visuals, friends, game ideas, small escapes and travel. Charcoal glass uses Forgeheart pink, violet, gold and ember accents. Pin selection has a short arrival animation; reduced-motion settings are respected.
- Category filters, saved-place search and favorites help narrow the map. The dice picks another matching place, preferring unvisited ones. A target button centers the selected pin. These use the owner's saved places, not location tracking or a venue search service.
- Pin categories can be edited. Favorites and visit stamps persist. Existing pins retain their coordinates, notes and history; older pins get a display category without rewriting their data.
- Hover/focus hints label icon buttons. Escape dismisses hints. Keyboard names and pressed states remain available to assistive technology; the Add button provides an alternative to double-clicking the map.
- Twelve optional field quests connect outings to loops, pads, demos, seamless textures, moving postcards, storyboards, demo swaps, catch-ups, co-op experiments, Forgeheart props, small walks and Toulouse trip comparisons. A quick filter shows quests estimated at fifteen minutes or less. The full brief appears before acceptance, with a tiny first move.
- Each place/quest pair creates one campaign only. Its accepted brief stays fixed after place edits. Evidence and review still gate completion XP. Opening cards, stars and visit stamps award nothing. No GPS verification is claimed.
- Eight optional reward blueprints include a demo café stop, an artist release, a print, co-op with Valentin, a mini premiere, a sample pack allowance, a Toulouse pot and an exhibition allowance. Amounts are editable personal budgets, not quoted prices. Existing monthly reservation/refund rules apply; nothing is purchased or transferred. The reward bay hides longer notes behind “The idea” and uses star/edit controls.

## Validation and release

`dev/quest-field-test.js` covers migration preservation, all twelve mission briefs, idempotency, proof/review completion, fixed scope, categories/favorites, eight reward blueprints, budget/refund enforcement, import corruption and long imported place IDs.

`dev/checks/quest-field.js` exercises the new controls, search/empty state, quick filter, mission acceptance/reopening, reward allowance, friend plans, keyboard hints, narrow bounds and real reload. The existing focus and world smoke scripts follow the new drawers and still cover media playback, birthday/trip planning, fares, preserved Astra drafts, proof, pause/resume and reload. Map tests use offline fixtures, never automated OSM crawling. Screenshots are visual checks of that offline fallback, not claims of live tile acceptance.

Run the existing quest, review, deck, workstation, world, focus, map-session and boot checks. All changes remain in the lazy quest files; no new dependency, first-screen script or stylesheet is added.

Claude retains main and updater ownership. Merge the checked branch through the normal update path, preserving concurrent work. No live journal, running Hearth process, messages to friends, payment or booking is changed during development.
