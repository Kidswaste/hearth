# questwalk63 (round 63): quest walks

The owner wants the Paris quests to get them out of the house. This stream turns the places on the Sidequest map
into an afternoon out. It chains 3–5 nearby places you haven't visited into a walking route, from a Métro station to
a Métro station (or to tonight's show), puts the route on the Paris map, and gives you a walking link for your phone.
Saving the route makes a walk quest that the ✦ tracker follows stop by stop. It builds on parisquests61's guide,
Codex's map pins and journal, showprep62's Métro list, showsync61's cached shows, questhud61's tracker and
weekquest62's week plan. It uses no AI, fetches nothing and runs no timers.

## What shipped

**Make a walk**
1. `/quest walk` builds a walk of 3–5 places you haven't visited from the Paris guide and your own pins. A place
   whose place quest is finished is left out, and so are stations (Codex's Montparnasse pin).
2. **Area or tag**: `/quest walk 11e`, `/quest walk records`, `/quest walk park` or `/quest walk view` use the guide's
   own filter words (arrondissements, Shows & clubs, Record shops, Parks, Views, Free…). Words that aren't filter
   words search the names and missions of your own pins.
3. **From a place**: `/quest walk from superfly` starts the walk at the Métro nearest that place, with the place as
   the first stop.
4. **Time**: 2 h by default, or `3h`, `2h30` or `90min`. The whole walk (walking plus time at each stop) always fits
   inside the time asked. When fewer than 3 stops fit, the answer says so and suggests 3h.
5. **Time at each stop comes from that place's own quest**: the "do" step of a guide place quest (20 min), or the
   field mission of your own pin's kind.
6. **The order is a good walking order**: nearest neighbour, then 2-opt and single-stop moves on straight-line
   distance. Walking time uses ×1.3 for the streets at 80 m a minute (showprep62's rule).
7. **Métro to Métro**: the walk starts at the station nearest where it begins and ends at the station nearest the last
   stop, from showprep62's bundled list of about 90 stations. Station names come with their lines.
8. **Tonight's show**: if you have a quest for a show tonight (showsync61's cached list), the walk ends at its venue,
   starts near it, and says when to leave ("Leave Métro Pigalle by 18:10 to be there for 20:00"). `/quest walk show`
   uses tonight's first show, and `noshow` leaves the show out. The venue itself is never a stop.
9. **Where it starts when you don't say**: your "near you" place from the ✦ tracker, else the corner of Paris with the
   most unvisited places. **Another area** moves on to the next corner (at least 1.5 km away).
10. **The answer in the chat**: stops, km and total time ("4 stops · 2.3 km · about 1 h 48 of your 2 h (28 min
    walking)"), then Start: Métro … (lines), each stop with its minutes and the walk to it, and End: Métro …. Buttons:
    Open walking route · Save as a walk quest · 3 h instead (or 2 h instead) · Another area.

**On the Paris map**
11. **The route is drawn on the map** as a dotted line from the start Métro through numbered stops (1, 2, 3…) to the
    end. It works on the offline map too (no tiles needed).
12. **The map frames a new walk once** (its centre and the closest zoom that holds it), then leaves panning and
    zooming to you. Pins that aren't on the walk fade, so the route stands out.
13. **The two Métro ends are pins** (the station icon). Stops that aren't on your map yet (guide not added) show as
    pins too. Clicking any of them opens the walk.
14. **One icon in the map's own icon row** ("Walk preview · 4 stops · 2.3 km", or "Your walk" once saved) opens the
    walk. It appears only while there's a walk.
15. **"Make a walk" in the Paris guide dialog** (the map footer's Paris guide button) sits beside the dialog's first
    button, on the same line. It makes the default walk and opens it.
16. **The walk dialog** shows the stops in order with times, a "leave by" line when it ends at a show, and a note that
    distances are estimates. Buttons: Open walking route · Save as a walk quest · 3 h instead · Another area · See it
    on the map. For a saved walk it has Open walking route and Open the next stop instead.

**Open walking route**
17. **Open walking route** opens Google Maps walking directions from the start Métro to the end, with every stop as a
    waypoint. It's a plain public link, with no key and no account. `/quest walk open` opens it from chat.
18. The walk also has a Citymapper link to the first stop. Citymapper takes no waypoints, so Google Maps carries the
    whole walk.

**The walk as a quest**
19. **Save as a walk quest** (or `/quest walk save`) makes a campaign in Codex's journal ("Walk: Betino's → Le
    Bataclan → …", path Everyday Adventurer, badge "Paris walker"):
    - one step per stop, each saying which way to walk and for how long, and the place's own "do" task
    - the last step also says where the walk ends
    - each step has its proof hint, and XP comes after proof + review, like every quest
20. **The ✦ tracker follows it stop by stop** (☀ 1/4, then 2/4…). Each step carries its place, so the tracker's 📍
    and "near you" know where you are going. The saved walk's line stays on the map until the walk is finished.
21. **Saving the same walk again reopens it** (it has a stable id) instead of making a copy. A guide stop that wasn't on
    your map yet is pinned when you save.

**The week plan**
22. **Plan my week proposes a walk on a free afternoon** (`/quest week`, or right-click ✦ › Plan my week…). It picks a
    day with no show or planned quest, the weekend first, and skips rainy days when a forecast reached Hearth. It shows
    with the ⇢ icon ("Sun afternoon is free · 4 stops · 2.3 km · about 1 h 48…"). Accept or drag it like any proposal:
    it becomes the walk quest, planned on that day, and your main quest stays as it was.

**Chat**
23. `/quest walk [area|tag|from <place>] [2h|3h] [show|noshow]`, `/quest walk save`, `/quest walk open`,
    `/quest walk another`, `/quest walk map`, `/quest walk help`. Suggestions while typing cover the times, from, show,
    save, open, another and the guide's tags, plus place names after `from`. The walk words also appear in the Paris
    guide's chat line and in `/quest`'s own help and examples.

## How it works
- `tools/quest-walk-core.js` (UMD, no DOM, node-tested) does the thinking:
  - `poolFrom`: the places a walk can use
  - `anchor`: the densest corner, with a variant for "another area"
  - `order`: nearest neighbour, then 2-opt + or-opt, tried from the start and from each first stop, keeping the
    shortest (≤ 5 stops)
  - `route` and `plan`: stops taken nearest-first while the whole re-ordered walk fits the budget
  - `parse`, `links`, `lines` and `summary`
  - `campaign`, `save`, `stored` and `activeWalk`
  - `weekCandidate`
- `tools/quest-walk.js` handles the window side:
  - the Studio map layer (`lines()` for the route, Métro and stop pins, the head icon), the walk dialog and the guide
    button
  - `/quest walk` (called by the tracker's one `/quest`) and the week plan's candidate
  - writes go through `QuestJournal.mutate` (validated, atomic `kvSet`, announced with `hearth:quests`); the week plan
    writes through `QuestHud.write`
- Both files and `tools/quest-walk.css` ride in the `questjournal` lazy group, so nothing changed on the first screen.
- Idle cost: none. There are no timers, no polling and no network, and the map draws the line only when it draws.

## Tests
- `node dev/questwalk-test.js` (unit, in UNIT, 8 checks):
  - **Order quality**: on 300 seeded random walks of 2–6 stops (free and fixed ends), 297/300 come out exactly optimal
    against brute force. The mean is 1.0001× and the worst is 1.011×. A real six-place guide fixture is exactly
    optimal.
  - **Time budget and ends**: 90 / 120 / 180 min across four areas, always 3–5 stops at 2 h and over, Métro at both
    ends, and legs + stop times adding up. A budget nothing fits in says so.
  - Ending at a show venue
  - The places: visited and finished place quests left out, the records and 11e filters, Codex's own pins, `from`
  - The command words; the links (walking, waypoints, no key)
  - The campaign: passes `QuestCore.validate`, has one step per stop with its place and proof hint, and keeps a stable
    id. The tracker's `next` follows it, completing needs proof, and it counts as real life for the streak.
  - The week candidate: weekend first, busy and wet days skipped, accepted into a valid `s.weekly`, the main quest
    kept, not proposed twice
- `dev/checks/questwalk63.js` (app, 19 steps, offline tiles):
  - `/quest walk 11e`: 3–5 unvisited 11e stops inside 2 h, Métro to Métro; the chat answer with its four buttons
  - The dotted line with numbered stops, the Métro pins and the head icon on the map
  - Open walking route records a Google walking link with every waypoint (nothing opened for real)
  - `/quest walk save`: a valid walk campaign on disk, made active. The ✦ chip shows 1/4, then 2/4 after stop 1. The
    saved line stays.
  - The guide dialog's "Make a walk" sits beside its first button, opens the walk dialog, and 3 h instead works
  - `/quest week` proposes the walk, and Accept plans it as a real walk quest
  - Idle: no timers; nothing opened by itself
  - Screenshots: `questwalk-map.png`, `questwalk-dialog.png`
- Run (under `flock /tmp/hearth-run.lock`, after merging claude/intelligent-galileo-yaiqem = rewards63; origin/main
  had nothing new):
  - Pass: questwalk63, quest-paris, questhud61, weekquest62, lazy, unit:boot-test, unit:winmac-test,
    unit:questwalk-test, unit:quest-paris-test, unit:datasafe-scan
  - Node tests that pass: questhud-test, weekquest-test, rewards-test
  - `node dev/lazy-manifest.js` was regenerated
  - `unit:errorcalm-scan` still lists the same 7 earlier lines in Codex's tools/quest-journal.js and
    tools/outing-desk.js. None of them are from this stream.
- Group: `sh dev/run-checks.sh questwalk63`.

## Changes outside my files
- `questhud-core.js` / `questhud.js` (questhud61):
  - `walk` added to SUBS, dispatched to `QuestWalk.run` (after `Lazy.load('questjournal')`)
  - completions and the hint for `walk`
  - `/quest`'s args, examples and keywords
- `weekquest-core.js` (weekquest62): `accept` handles `kind: 'walk'` through `makers.walk` (one line).
- `weekquest.js` (weekquest62):
  - the ⇢ icon
  - `propose()` adds `QuestWalk.weekCandidate(...)` when the Studio's group is loaded (it always is there)
  - `makers().walk`
- `tools/quest-paris.js` (parisquests61): `placeSteps` exported.
- `tools/quest-paris-ui.js` (parisquests61):
  - the guide dialog's first button now sits in a `qj-actions` line with `QuestWalk.guideButton(d)` (unchanged when
    QuestWalk is missing)
  - the chat line mentions `/quest walk`
- `lazy-data.js` (+ regenerated `lazy-meta.js`): the three quest-walk files join `questjournal`.
- `dev/run-checks.js`: the unit test and the `questwalk63` group.

## Risks
- Distances are straight lines × 1.3, so a walk crossing the Seine or the railway lands can take longer than shown.
  The dialog says the distances are estimates. Live routing stays in Google Maps.
- The Métro list is showprep62's (about 90 central stations), so the "nearest Métro" at the edges of Paris can be a
  little far. A Métro end over 1.5 km away still shows, with its walking time.
- Tonight's show comes from showsync61's cache only (nothing fetched). If the list is old, no show end is used.
- Google Maps takes up to 9 waypoints; walks have at most 5 stops.

## For Codex
Touches of your files, all small, additive and commented `questwalk63`:
- `tools/quest-atlas.js` — `mount(host, { …, lines })`:
  - `lines` is optional: `[{ id, color, fit, points: [{ id?, lat, lon, label? }] }]`
  - each line is drawn as one SVG (a polyline plus numbered circles; labels are text nodes, never markup) at the end of
    the pins layer, so it pans with the pins
  - when lines exist, pins whose id isn't on a line get the class `off-route` (styled in quest-walk.css)
  - `fit: true` frames a new line once per id (a module-level `fitted`), so re-renders never undo the owner's pan or
    zoom
  - without `lines`, nothing changes
- `tools/quest-journal.js`:
  - map layers may have `lines()`. `worldMap` collects them into `layerLines` and passes them to `QuestAtlas.mount`.
  - the layer comment documents the new field
- Walk campaigns are ordinary campaigns:
  - id `c-walk-<hash of the stop ids>`, path `life`, extra field `walk: { v: 1, budget, m, km, total, start, end,
    stops[], link }`
  - each quest has the extra field `place` (the atlas / guide place id)
  - `validate` already passes both through; the tracker's `placeOf` reads `q.place`
- No change to quest-core, quest-review or your proof rules: walk steps finish with proof + review like any quest.

## For the patch notes
- **Quest walks**: ask `/quest walk` in any chat, or press **Make a walk** in the Paris guide on your quest map.
  Hearth chains 3–5 places you haven't visited into an afternoon walk, from a Métro to a Métro, in a good walking
  order, and fits it in 2 hours (or `3h`).
- Pick an area or a mood: `/quest walk 11e`, `/quest walk records`, `/quest walk park 3h`,
  `/quest walk from superfly`.
- The walk is drawn on your Paris map as a dotted line with numbered stops, and **Open walking route** sends it to
  Google Maps walking directions with every stop.
- Got a show tonight? The walk ends at the venue and tells you when to leave.
- **Save as a walk quest**: one step per stop, and the ✦ tracker follows you stop by stop. XP still comes from your
  proof at each stop.
- **Plan my week** now proposes a walk on a free afternoon (weekend first, not on rainy days).
- Times are estimates from straight-line distances; check opening times before you go.
