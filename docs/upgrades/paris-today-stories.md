# Today in Paris: small starts, longer stories

Map → **What feels good today?** offers three story suggestions, based on energy, a €0 / €5 / €15 outing cap, and solo or a friend from the existing notebook. Changing filters is immediate and does not save a quest. Another three rotates the eligible pool; accepted unfinished stories come first and finished stories are excluded. The cap describes planned outing spending, not live ticket prices; travel is extra. Preferences last for this app session. These are activity suggestions, not live opening-hours or weather guarantees.

Eight stories replace countdown framing with three or four resumable chapters: **The 11th has a heartbeat**, **Transmission from Truillot**, **Forgeheart: the missing Foley**, **Two ears, one secret**, **A street becomes a score**, **The colour that escaped**, **The pocket expedition**, and **The café frequency**. Six involve sound collecting or recreating. Each ends in an original short, captioned sequence or storyboard, often with reusable audio/texture assets. No public post or friend's reply is required. Existing timed quests and accepted briefs are preserved.

Rewards reflect the result: original drum kit, Foley pack, loop, texture or story seed; a themed completion badge; 60–130 XP according to the chapter work. Optional matching treat goals reuse earned sparks and existing monthly budgets. Nothing is redeemed automatically, and no reward cash is transferred. Chapters still require actual evidence and review; video reviews sample frames, so sound-led work should include its audio bounce too.

## Six additions in the 11th

There are now 66 guide places. Coordinates are from the City of Paris [green-space dataset](https://opendata.paris.fr/explore/dataset/espaces_verts/), checked on 18 October 2026; pins use park centres, not guaranteed entrance positions. Access links are attached to each place:

- [Square Maurice Gardette](https://www.paris.fr/lieux/square-maurice-gardette-2725): original beat and texture hunt.
- [Jardin Truillot](https://mairie11.paris.fr/pages/le-jardin-truillot-9985): noisy-to-quiet sound postcard.
- [Square de la Roquette](https://www.paris.fr/lieux/square-de-la-roquette-1767): three original Foley textures.
- [Square Jules Verne](https://mairie11.paris.fr/pages/le-onzieme-fete-l-ete-35735): miniature expedition and game-story seed; linked municipal page identifies the place, not a current event recommendation.
- [Jardin de la Folie-Titon](https://opendata.paris.fr/explore/dataset/espaces_verts/): leaf/architecture portal study.
- [Square Marcel Rajman](https://mairie11.paris.fr/pages/square-marcel-rajman-et-salle-olympe-de-gouges-les-photos-de-la-metamorphose-35713): quiet final-frame study.

Explore the 11th adds only missing district pins and respects the existing map capacity and user edits. Story quests also appear in matching place panels.

## Input and shows

Map wheel/trackpad scrolling pans, Shift-scroll moves sideways, and Ctrl/Command-scroll zooms around the pointer. Dragging, keyboard arrows and zoom buttons remain available. Wheel painting is coalesced to animation frames, and listeners/frames are cleaned up when the map unmounts.

Pin selection now paints only the place panel and selected symbol immediately, then persists through the journal's existing serialized queue. It no longer waits for storage or rebuilds all tiles/profile/cards. Failed saves restore the previous selection. Shared Studio buttons show busy feedback for asynchronous work, prevent duplicate activation, and report failures.

**DICE + Shotgun** is now a named map/Today action instead of only a small star icon. Load and refresh are explicit; source links remain available, and the list can show seven or 21 days.

The public DICE browse schema changed to nested `dates`, plural `venues` and integer minor-unit prices. Parsing now handles that shape, cancellation/sold-out state and canonical event URLs, while refusing to treat a city's centre as a venue coordinate. A read-only current-page probe parsed 30 listings, including ten in the next seven days. This is a snapshot, not a guarantee of future availability.

Shotgun returned a browser challenge during the probe. Hearth respects that response and retains last good data; its public listing remains directly accessible. No protection bypass, private API, automatic booking or message sending was added.

## Checks and compatibility

Rule checks cover every energy/budget/company combination, daily determinism, rotation, finished exclusions, all chapter completions, stable acceptance, proof-only XP and reward preservation. The public DICE shape has focused fixtures. An existing show-cache test now correctly excludes expired events after its simulated 42-hour advance; the old hardcoded count failed on unchanged main too.

The isolated Electron check `paris-today.js` covers immediate pin feedback during a deliberately delayed save queue, failure rollback, retained map DOM, wheel/trackpad controls, async-button feedback, three-card UI, narrow layout, chapter acceptance and actual reload. Existing show integration, icon-language, field, city, weekly, walk and boot checks provide regression coverage.

The ShowSync `listDialog` export matches Claude's clickfirst64 change. The map refactor leaves his Paris Journal layer hooks mergeable in their original positions. Publication is through the existing main-based updater; the live checkout and running app are left alone.
