# ratp69 (round 69): leave reminders that are honest about the Métro

Round 68's ⏰ Remind me to leave worked out a Métro trip with no idea of the time of night or of trouble on the
lines. Now it knows both. After the last trains (about 00:40 on Sunday to Thursday nights, about 01:40 on Friday
and Saturday nights) and before about 05:30, the trip says **"about 30 min walk (Métro closed)"** or **"Noctilien /
taxi — check (about 40 min)"**, and the reminder time moves to match. About 30 minutes before a Métro reminder
rings, Hearth checks the lines on your route once. If one is in trouble you get **"⚠ Line 9: disrupted — leave 10
min earlier?"** with a **Leave earlier** button, in the notification and in the ✦ tracker. With no connection, or
without a source, the reminder says "Line status unknown" and still rings as usual.

## Upgrades

The Métro at night
1. **It knows when the Métro stops.** The last trains run at about 00:40 on Sunday to Thursday nights and about
   01:40 on Friday and Saturday nights, and the first ones at about 05:30. It always says "about". It uses Paris
   time even when the computer's clock is set to another zone.
2. **After the last train, a short trip becomes a walk** (up to 40 minutes on foot): "about 30 min walk (Métro
   closed)".
3. **A longer trip says "Noctilien / taxi — check (about N min)".** It estimates a night bus with its stops, plus 15
   minutes of waiting. That errs on the early side, never late. The hover text says the Métro is closed then, gives
   the last and first train times, and says to check the night bus times.
4. **The leave time and the reminder move to match.** The night trip takes longer, so you're told to leave
   earlier.
5. **"The last one" when it's worth it.** Sometimes leaving a few minutes earlier still catches the last Métro, and
   that beats waiting for the night bus. The trip then reads "about 25 min by Métro, the last one (about 00:40)".
6. **Close to the last train, it warns you.** When you board within 20 minutes of the last train, the hover text adds
   "last Métro about 00:40".
7. **The ✦ tracker row says it too**: "Métro closed then (last about 00:40)". The notification at leave time shows
   the night trip and why.

The route's lines
8. **A Métro trip knows its lines.** It uses the line the two stations share, plus up to two other shared lines.
   Otherwise it uses one change, at a station that serves both lines, nearest first. The hover text names the
   change: "République → Bir-Hakeim (line 8, then 6 at La Motte-Picquet–Grenelle)".

Line status (disruptions)
9. **One check, about 30 minutes before the reminder rings.** It shares the reminders' single timer, so there is no
   polling. A reminder turned on with less than 30 minutes to go is checked straight away. A check that gets no
   answer isn't retried.
10. **Opening the ✦ tracker checks the trips coming up in the next 6 hours.** So does clicking a reminder to see it on
    the map. Both use the last answer when it's under 10 minutes old.
11. **"⚠ Line 9: disrupted — leave 10 min earlier?"** arrives as a desktop notification with **Leave earlier** and
    **Show on map** (a note with Leave earlier when Hearth is in front). When a line is interrupted it says 15
    minutes instead. It warns once per reminder.
12. **Leave earlier, in one click**, from the notification without bringing Hearth up, or from the tracker row. It
    moves the leave time (and the reminder) 10 or 15 minutes earlier, once. The row then reads "⚠ Line 9: disrupted
    — leaving 10 min earlier".
13. **Another line instead.** When the two stations share two lines and only one is in trouble, the row says
    "Line 9: disrupted — take line 8 instead". There's no warning in that case.
14. **Planned works don't count as trouble.** Information notices, such as works announced for another time, don't
    raise a warning. A disruption only counts when it overlaps your trip.
15. **"Line 8: OK"** in the tracker row when all is well, with the time it was checked in the hover text.
16. **"Line status unknown"** when offline, when no source answered, or when the source doesn't cover the line. The
    reminder is never held up by it.
17. **The reminder's own words carry it.** At leave time the notification starts with "⚠ Line 9: disrupted" (or
    "⚠ line 9: leaving 10 min earlier").

The free key
18. **Settings › Housekeeping › "Paris Métro status key…"** sits next to the Meshy key. Paste a free key from IDFM's
    PRIM site (prim.iledefrance-mobilites.fr › My account › API key). A note offers **Open PRIM**. You can replace
    the key or forget it from the same box.
19. **"Add key…" on the tracker row** when the status is unknown for lack of a key (or the key was refused). It
    opens the same box. The hover text says: "add your free PRIM key in Settings".
20. **Stored like Hearth's other keys**: encrypted on this computer (appsmain's key store, the same as Meshy's). It
    is sent only to PRIM, in its `apikey` header, and never logged, shown to a page or given to a chat. Ctrl/⌘+K
    finds it ("métro key", "line status", "strike"…).

## How it works
- **`ratp-core.js`** is new (UMD, no DOM / fs / Electron). It is shared by the window, the main process and the
  tests, and covers:
  - `metroAt`: Paris wall clock through `Intl`, with clock changes handled by `wallAt`
  - `night`: walk / Noctilien / taxi / the last one
  - `routeLines` and `routeWords`, which use showprep62's bundled `STATIONS`
  - `lineName`, `parsePrim` and `parseCommunity`: the feeds turned into one shape `{ state, lines: { '9': [{ level,
    title, from, to }] }, known }`
  - `verdict`: picks the best option, ignores information notices and disruptions outside the trip, and returns
    the words
  - `nextCheck` and `covered`
  - `whyText`
- **`ratpmain.js`** is new, on the main side. It fetches the status only when asked, using Electron's `net.fetch`
  with an 8 s timeout. Answers are cached for 10 minutes, or 2 minutes when unknown. Two requests at the same time
  share one fetch. Providers:
  - **`prim`**: `https://prim.iledefrance-mobilites.fr/marketplace/disruptions_bulk/disruptions/v2`, when a key is
    set
  - **`community`**: `https://api-ratp.pierre-grimaud.fr/v4/traffic/metros`, with no key, best effort
  - A refused key falls back to the community source.
  - Both feeds are fetched **whole**: no query string, no place, no Home, no route and no line list are sent.
  - In any smoke run without `HEARTH_RATP_BASE`, nothing is fetched at all ("status unknown").
- **`leavesoonmain.js`**:
  - **The same one timer** now goes to the sooner of the next ring and the next status check. Nothing on means no
    timer.
  - The check marks the reminders in its window as checked, whatever the answer. It saves a verdict on each
    reminder (`status`) and emits `leave:warn` once (`warnedAt`).
  - New ops: `status` (opening the tracker or a reminder) and `earlier` (Leave earlier).
  - `test` can set the fake server's answer and read both request logs.
- **`leavesoon-core.js`**:
  - A trip keeps `walkIn`, `walkOut`, `m`, `lines` and `night`, and the mode `night` is allowed.
  - A reminder keeps `status`, `checkedAt`, `earlierBy` and `warnedAt`. A new plan (turned on again, or Home moved)
    clears them.
  - `earlier()` moves the leave time once. `notice()` adds the line status.
- **`leavesoon.js`**:
  - `honest()`: the route's lines plus the night check, used when a reminder is made and when Home or your pin
    moves
  - the status line and Leave earlier / Add key… on the tracker row
  - `statusSoon()`: asks at most once a minute, and only for Métro trips in the next 6 h with an old status
  - `keyDialog()`
- **Nothing on the first screen.** `ratp-core.js` joins the existing lazy group `leavesoon` (loaded with the Paris
  map's code or when the ✦ tracker opens). `ratpmain.js` is required only when a check runs. The always-on part is
  a few lines in `notify.js` (the `leave:warn` listener and the `earlier` route) and one button in Settings.

## Changes outside my new files (all small and additive)
- `appsmain.js`: `getKey` exported, for the main process only.
- `appui.js`: Settings › Housekeeping gets one button, "Paris Métro status key…", next to the Meshy key. It loads
  the `leavesoon` group on click.
- `appsearch-data.js`: the `prim-key` row.
- `preload.js`: `hub.leave.onWarn`.
- `notify.js`: the `leave:warn` listener (Leave earlier · Show on map), and `earlier` as a quiet route.
- `lazy-data.js`: `ratp-core.js` and `RatpCore` added to the `leavesoon` group, and META regenerated with `node
  dev/lazy-manifest.js`.
- `dev/smoke.js`: `--fake-ratp` (starts `dev/fake-ratp.js` and sets `HEARTH_RATP_BASE`).
- `dev/run-checks.js`: `ratp69-test` in UNIT, and the `ratp69` group.
- `dev/checks/leavesoon68.js`: the fake clock starts at a fixed time of day (tomorrow 15:30). From about 19:15 in
  Paris the check failed on the base commit as well: the errand's closing time moved to the next day while the
  show 5 hours later rang first.

## For Codex
- No Codex file was edited.

## Tests
- **`node dev/ratp69-test.js`** (unit, in UNIT, 10 tests, Paris time). It covers:
  - the hours: weeknights, Friday and Saturday nights, Sunday night, 05:29 / 05:30, the October night that's an hour
    longer, the March night that's an hour shorter
  - the same answers from a process running in Tokyo, New York or UTC
  - route lines: shared lines with the chosen one first, and one change checked against an independent brute force
  - the two-change fallback and unknown stations
  - the night: walk, Noctilien, the last one, before 05:30, Friday 01:40, the "last Métro" hint, walks untouched,
    the reminder time moving
  - line names and both feed shapes, PRIM's local times included
  - the verdict: OK, disrupted (10), interrupted (15), out-of-window, take the other line, works ignored, unknown
  - when the check is due
  - what a reminder keeps, Leave earlier happening once, inside the last 10 minutes, and a new plan clearing it
  - **the fetch against `dev/fake-ratp.js`**:
    - providers, the cache, a refused key falling back, all down → `nokey` / `offline` / `badkey`
    - unknown answers cached too
    - only GETs with no query, and the key never in a log
    - a smoke run fetches nothing
    - an unreachable host
  - **the main side**:
    - the check on the ONE timer, nothing fetched on turning a reminder on
    - one warning, the tracker's ask not warning twice
    - Leave earlier moving the timer
    - the ring's words
    - offline: unknown, no warning, no retry, rings anyway
    - a night trip: no check
- **`dev/checks/ratp69.js`** (app check, group `ratp69`, `--fake-ratp`). It uses clicks only, on the throwaway
  profile, with the fake clock and the notification recorder. The steps:
  - a 01:30 show on a Monday night → "Noctilien / taxi — check", its leave time, hover text, tracker row and
    notification
  - a 20:00 show → line 2 kept, no fetch, the one timer set to the check
  - tracker → "Line status unknown" + Add key… → typing a key → Save → "Line 2: OK" from PRIM, and the key not in
    the window's storage
  - the Settings button
  - line 2 disrupted, the clock moved to 30 minutes before the reminder → ONE "⚠ Line 2: disrupted — leave 10 min
    earlier?" with Leave earlier · Show on map
  - the check marked done
  - the row's Leave earlier → 10 minutes earlier, the notification's Leave earlier doesn't move it twice
  - it rings at the new time saying why
  - everything down → "Line status unknown" and the reminder unharmed
  - only whole-feed GETs, the key only in PRIM's header, at most 5 asks, no command, nothing from the window
- **Results**, all run under `flock /tmp/hearth-run.lock`:
  - ✓ ratp69, unit:ratp69-test, leavesoon68 (with the time-of-day fix), unit:leavesoon68-test, lazy,
    unit:boot-test, unit:notify-test, unit:appsearch-test, unit:datasafe-scan, unit:winmac-test,
    unit:errorcalm-scan
  - The `appsearch` app check fails on "permissions → Files it can use in the first 4". It fails the same way on the
    base commit; my row is found.

## Risks
- **No real line-status source could be tried from here.** The build machine's network blocks both hosts. Neither
  PRIM nor the community API could be reached, so the parsers follow their published shapes as I know them:
  - PRIM disruptions_bulk v2: `disruptions[]` with `applicationPeriods`, `severity` (BLOQUANTE / PERTURBEE /
    INFORMATION) and `cause`, plus `lines[].impactedObjects[].disruptionIds`
  - the community v4: `result.metros[]` with `slug` normal / alerte / critique
  - A shape that doesn't match reads as "Line status unknown", never as a wrong "OK".
  - The community API is unofficial and may be down. **Plan on the free PRIM key for real status.**
- The night hours are the usual ones, labelled "about". Holiday eves (with late Métro), strikes and line-by-line
  last-train times aren't known.
- Night bus and taxi times are a rough estimate ("check").
- The tracker row redraws in the next frame. A window in the background may only show a new status the next time
  the tracker opens. That is the round 68 behaviour.

## For the patch notes
- **Leave reminders know the Métro closes at night.** After the last train (about 00:40, or 01:40 on Friday and
  Saturday nights) and before about 05:30, the trip says "walk (Métro closed)" or "Noctilien / taxi — check", and
  your reminder comes earlier to match.
- **Sometimes it says "the last one".** When leaving a few minutes earlier still catches the last Métro, it tells
  you that instead of the night bus.
- **Trouble on your line? You'll hear about it.** About 30 minutes before a Métro reminder, Hearth checks the lines
  on your way once. If one is disrupted you get "⚠ Line 9: disrupted — leave 10 min earlier?". Click **Leave
  earlier** in the notification, or in the ✦ quest tracker, and the reminder moves.
- **The ✦ quest tracker shows the line status** under each Métro reminder ("Line 8: OK", "⚠ Line 9: disrupted…",
  or "Line status unknown"). Opening the tracker checks the trips coming up.
- **For live line status, add a free key**: Settings › Housekeeping › **Paris Métro status key…** (from IDFM's
  PRIM site). You can also click **Add key…** on a tracker row. The key is stored encrypted on this computer and
  only goes to PRIM.
- **Nothing about you is sent.** Hearth downloads the whole public status list. Your Home, your pin and your route
  never leave the computer.
- **Offline is fine.** The status shows as unknown and the reminder still rings on time.
