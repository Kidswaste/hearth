# eatnearby71 (round 71): 🍜 Eat before

A show's card now has **🍜 Eat nearby**. It opens a short list of food stops within about 10 minutes' walk of the
venue that are open in the 2 hours before doors, closest first, with your ★ starred and ✓ stamped places at the top.
Each one has **Show on map** and **Go here first**. Go here first puts the stop on the show's ⏰ leave reminder: the trip
goes to the food stop, and the leave time moves earlier by your eat time (45 min, editable) plus the walk on to the venue.
Nothing is looked up online and no AI is asked.

## Upgrades

Where to find it
1. **🍜 Eat nearby on a show's card** (Paris map › Shows this week › a show, or a venue's next show), next to 🎒 Before
   I go and ⏰ Remind me to leave.
2. **🍜 Eat nearby on the show slot of 🗓 Plan my weekend** (✦ tracker). There, Go here first goes on that slot's own
   ⏰ reminder.
3. **🍜 Eat nearby at the bottom of 🎒 Before I go** (the show-night list), next to Edit my list….

The list
4. **The Paris guide's food stops** (the same places as the map's "Food & stops": Bouillon Pigalle, Bouillon
   République, Le Servan, Double Dragon, Mokonuts, Marché des Enfants Rouges…), each with "N min walk" from the venue,
   counted like the leave reminders count walking.
5. **Only what's within about 10 minutes' walk.** If nothing is that close, the list says so in plain words.
6. **Your places first**: ★ starred on the map, then ✓ stamped (you've been), then the rest by walk time. The ★ / ✓
   shows on the row.
7. **Open in the 2 hours before doors**: a place with known hours shows only if it's open long enough to eat in that
   window ("Open before doors", "Opens at 19:00", "Closes at 19:30"). Lunch-only places and closing days drop out. Late
   nights from the evening before count too.
8. **"Hours unknown"** when Hearth doesn't know them. The place stays in the list, marked, so you can check first.
9. **Add hours…** on a row: type its hours in plain words ("Tue–Sat 12:00–14:30, 19:00–23:00 · Sun, Mon closed"), read
   the same way as errands' hours. They're kept on this computer. Clear the box to forget them.
10. **The header says when and where**: "Doors 19:00 · La Cigale" (or "Starts" when the listing has no doors time).

Go here first
11. **Go here first** adds the stop to the show's ⏰ leave reminder. If the reminder was off, it turns on (and asks for 🏠
    Home on the map the first time, as usual).
12. **The leave time moves earlier**: the trip now goes to the food stop, then you eat, then you walk to the venue. The
    note says it: "I'll remind you at 18:20 to leave at 18:30 (about 25 min by Métro from Home; eat at Bouillon Pigalle
    first (45 min, then 4 min walk))".
13. **Hover over Go here first** to see the leave time it would give before you click.
14. **Eat time** (30 / 45 / 60 / 75 / 90 min) sits at the top of the list. It's remembered, and changing it moves a
    reminder that already has a stop.
15. **"✓ First stop"** marks the chosen place, with a plan line on top: "⏰ Leave at 18:30 · about 25 min by Métro to
    Bouillon Pigalle from Home, 45 min to eat, then 4 min walk to the venue". Click ✓ First stop again to go straight to
    the venue.
16. **The notification says it too**: "Leave in 10 min for Arlo Parks — …" with "🍜 Eat at Bouillon Pigalle first (45
    min, then 4 min walk)" underneath.
17. **The ✦ tracker's "Leaving soon" row** adds "· 🍜 Bouillon Pigalle first".
18. **Moving your 📍 pin or 🏠 Home** works the trip out again via the stop.

Show on map
19. **Show on map** closes the list, opens the Paris map on the place, turns Food & stops back on if it was off, and
    selects its pin.

## How it works
- `eatnearby-core.js` (new, UMD, no DOM): `foodPlaces` (the guide's `food` places + the journal pin's `favorite` /
  `visitedAt`, hours from `eatnearby.hours` or a guide entry's `hours`, parsed by `ErrandsCore.parse`), `openBefore`
  (overlap of the open hours with [doors − 2 h, doors] ≥ the eat time, capped at 2 h; yesterday's late night counts),
  `nearby` (walk ≤ 10 min with `LeaveSoonCore.walkMin`, closed out, ★ / ✓ / walk / name order, at most 8), `stopOf`.
- `leavesoon-core.js`: a reminder may carry one `stop` ({ id, name, lat, lon, eatMin, walkMin }). `check()` keeps it
  (checked: in Paris, eat 5–180, walk 0–60; else dropped). `plan()` takes `eatMin + walkMin` off as well. `notice` /
  `hud` / `confirmText` say it. Without a stop, nothing changes (same words, same times).
- `leavesoon.js`: `build()` sends the trip to `spec.stop` when there is one, and `recompute()` does the same. The show
  card hook adds `eatButton` (it loads the group on click).
- `eatnearby.js` + `eatnearby.css` (new, lazy group `eatnearby`, `use` tier, after `leavesoon`): the list is a
  `<dialog>`, modal over a show's card and non-modal otherwise, like 🎒 Before I go. Go here first calls
  `LeaveSoon.turnOn({ ...spec, stop })`, so it uses the same store, the same main-side timer and the same Home picking.
- Storage: `eatnearby.eat` and `eatnearby.hours` in localStorage (this computer). The stop lives in the reminder
  (`data/leavesoon/reminders.json`, already this computer only).
- First screen: unchanged. `boot-test` shows 73 scripts, 2333 KB, the same as before.

## Changes outside my new files (small, additive)
- `leavesoon-core.js`: `stopOf` / `stopMin`, the stop in `check` / `plan` / `notice` / `hud` / `confirmText`.
- `leavesoon.js`: the stop in `build` / `recompute`, plus `eatButton` on the show card hook.
- `beforego.js`: the 🍜 button in the footer. `plain()` also keeps `doors` and the venue's lat / lon.
- `weekendplan.js`: the 🍜 button on a show slot.
- `lazy-data.js`: the group and META `"eatnearby":{}` (re-recorded with `dev/lazy-manifest.js`). `index.html`: the
  name added to the existing lazy-at tag.
- `dev/run-checks.js`: `eatnearby71-test` in UNIT, and the `eatnearby71` group.

## For Codex
- **No Codex file was edited.** The food stops are read from `QuestParis.guide` (tag `food`) and `QuestParis.pinOf`.
  Stars and stamps come from the journal's `favorite` / `visitedAt`. Show on map uses `QuestJournal.paris.mutate`
  (`atlas.selected`, only for a pin that already exists) and `qjHere.go`.
- If a guide entry ever gets an `hours` string (errands format, e.g. "Mon–Sat 12:00–23:00"), the list uses it
  automatically.

## Tests
- `node dev/eatnearby71-test.js` (unit, in UNIT, Paris time, 75 checks):
  - food places from the real guide, with stars, stamps and twins
  - typed hours beating the guide's; unreadable ones → unknown
  - open before doors: whole window, opens later, too short, the eat time edited down, lunch only, closed that day,
    yesterday's late night, the 25-hour day
  - nearby: the 10 min cut, the ★ / ✓ / walk order, the limit, the real guide around La Cigale and the Bataclan
  - the leave-time shift, summed independently, and eat time 60
  - too late with a stop, said in words; the eat time bounds
  - the stop through the store round trip, refused stops, the words, ratp69's Leave earlier with a stop
  - the files and the lazy group
- `dev/checks/eatnearby71.js` (app, clicks only, throwaway profile, offline, a fake clock in both processes, the
  notification recorder). All 20 steps pass, including:
  - the card button, and the list with ★ Bouillon Pigalle, "7 min walk", "Hours unknown"
  - Add hours… open → "Open before doors"; lunch-only → it drops out with the empty state
  - Go here first: the exact leave time, the note, ✓ First stop, the plan line, the card toggle's time
  - Eat time 60 → the reminder follows
  - the tracker row and the ring's words
  - 🎒 Before I go → 🍜, and ✓ First stop off → the plain leave time
  - Show on map (Food & stops back on, the pin selected)
  - the weekend show slot's 🍜
  - no command, nothing sent
- All run under `flock /tmp/hearth-run.lock`. These passed: eatnearby71, unit:eatnearby71-test, leavesoon68,
  leavefix70, showsync61, lazy, unit:boot-test, unit:leavesoon68-test, unit:leavefix70-test, unit:datasafe-scan,
  unit:winmac-test, unit:errorcalm-scan, unit:weekendplan-test.

## Risks
- None of the guide's food stops has hours yet, so today every row says "Hours unknown" until you add them. Hearth
  doesn't make hours up.
- "Open before doors" checks the 2 hours before doors, as asked. The leave reminder still aims to get you to the venue
  for the start, so on a night with early doors you may eat a little after the doors open.
- Only the guide's places count as food stops. Food places you add to the map yourself aren't tagged as food, so they
  don't show.
- The ⏰ pin on the map stays at the venue. The stop isn't drawn as a second pin.

## For the patch notes
- **New: 🍜 Eat nearby.** Open a show (Paris map › Shows this week › the show) and click **🍜 Eat nearby**. You get food
  stops within about 10 minutes' walk of the venue that are open before doors, closest first. Your ★ starred and ✓
  visited places come first.
- **Also in 🗓 Plan my weekend** (on the show night) and at the bottom of **🎒 Before I go**.
- **Go here first** puts the stop on your ⏰ leave reminder. Hearth works out the trip to the food stop, gives you 45
  minutes to eat, adds the walk to the venue, and tells you when to leave. Change **Eat time** at the top of the list
  if you need longer or shorter.
- **Show on map** takes you to the place on the Paris map.
- **"Hours unknown"** means Hearth doesn't know when it's open. Click **Add hours…** on the row and type them once (for
  example "Tue–Sat 19:00–23:00"). They're kept on this computer, and places closed before doors then drop out of the
  list.
- The reminder's notification and the ✦ tracker say where you're eating first. Click **✓ First stop** to go straight
  to the venue again.
