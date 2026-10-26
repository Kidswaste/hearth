# leavesoon68 (round 68): ⏰ Remind me to leave

Anything with a time and a place now has a **⏰ Remind me to leave** button: a show, an errand that has to be done
before the shop closes, and a slot of 🗓 Plan my weekend. Hearth works out how long the trip takes. It starts from
your 📍 I'm here pin when one is set, and otherwise from a 🏠 Home spot you click once on the Paris map. Ten minutes
before it's time to go, your computer shows a notification: **"Leave in 10 min for Arlo Parks — about 25 min by
Métro"**. Click it and Hearth opens that place on the map. It rings even when Hearth is in the tray. The ✦ quest
tracker lists your reminders as "Leave at 20:15". Nothing is looked up online and no AI is asked.

## Upgrades

Turning it on
1. **⏰ Remind me to leave on a show's card** (Paris map › a venue or Shows this week › a show), next to Get ready.
2. **On a show quest** in Sidequest Studio: a "GETTING THERE" line with the same button.
3. **On an errand's card** (click the errand in the ✦ tracker or its pin on the map), next to Show on map. For an
   errand, the goal is to get there 20 minutes before the shop closes. It picks the next closing time you can still
   make, and handles lunch breaks, late nights and Sundays.
4. **On each slot of 🗓 Plan my weekend** that has a place (the show, the park, the place nearby). The studio session
   has no button because it's at home.
5. **Once it's on, the button shows the time**: "⏰ Leave at 20:15 ✓". Hover over it to see when the reminder rings
   and how long the trip is. Click it again to turn the reminder off.
6. **A short note confirms it**: "I'll remind you at 20:05 to leave at 20:15 (about 25 min by Métro from Home)".
7. **When it's too late, it says so plainly** instead: "It's already time to go: about 25 min by Métro, and it
   starts at 20:00". If there are less than 10 minutes before you need to leave, the reminder rings straight away.
8. **When it can't work, the button is greyed out** and the hover text says why: a show with no start time yet, a
   place with no spot on the map, or a shop that's open 24 h.

Where you leave from
9. **🏠 Home, clicked once on the map.** The first time you turn on a reminder with no Home and no 📍 pin, the map
   opens with "🏠 Click the map where Home is (kept on this computer only)" and a Cancel button (Esc also cancels).
   Click the map and your reminder is set. You don't need to start again.
10. **Your 📍 I'm here pin wins while it's set** (it lasts 3 hours). The reminder says which one it used ("from
    Home" / "from your 📍 pin").
11. **Move your pin or Home and the reminders follow.** Reminders that haven't rung yet are worked out again from
    the new spot.
12. **To set or move Home later**: ✦ tracker › ⋯ More › Near you… › "🏠 Home for leave reminders: click it on the Paris
    map…". You can also click the 🏠 pin on the map and choose Move Home.

The trip ("about", Paris-simple)
13. **Walking when it's 20 minutes or less**: the straight line, plus 20% because streets aren't straight, at an easy
    4.5 km/h. It reads "about 12 min walk".
14. **Otherwise the Métro**: walk to the station nearest to you, about 3 minutes waiting, about 2 minutes per stop
    (stops counted along the straight line, one every ~600 m), 5 more minutes when the two stations share no line,
    then the walk from the station. It reads "about 25 min by Métro", and the hover text names the stations ("Opéra →
    Bastille (line 8)" or "(one change)"). The station list is Hearth's own (about 90 central stations), never
    fetched.
15. **Never slower than walking**: if the Métro estimate isn't quicker, it says walking. If no station is close to
    either end, it says walking too.
16. **Times you can read at a glance**: the leave time is rounded down to 5 minutes, and trip times above 10 minutes
    are rounded to 5 ("about 25", never "about 23").

The notification
17. **"Leave in 10 min for <name> — about N min by Métro"**, with "Leave at 20:15 from Home · starts at 20:00 · the
    venue · the stations" underneath. It uses Windows' and the Mac's own notifications, with Hearth's name.
18. **Click it: the place opens on the Paris map**, with its ⏰ pin marked, even when Hearth was in the tray.
19. **Snooze 10 min** and **Dismiss** are its two buttons. Both work without bringing Hearth to the front.
20. **With Hearth in front**, a note shows instead, with a **Show on map** button.
21. **It rings with Hearth in the tray.** The timing runs in Hearth's main process, so a hidden window doesn't delay
    it. When the computer wakes from sleep, Hearth checks again.
22. **Missed ones are never rung late.** If Hearth was closed, or the computer was asleep, when a reminder was due (more
    than 2 minutes ago), Hearth doesn't ring it. When Hearth starts, a note says "⏰ Missed while Hearth was closed:
    leave at 20:15 for …". It's said once.
23. **Focus / Do Not Disturb is still yours**, and so is the "Desktop notifications" switch (Settings › Advanced ›
    Tell me when…). With that switch off, the reminder shows as a note inside Hearth instead.

In the ✦ tracker and on the map
24. **"Leaving soon" in the ✦ tracker**: one row per reminder, such as "Leave at 20:15 · Arlo Parks · about 25 min by
    Métro from Home · reminder at 20:05". Click the row to see the place on the map. **×** turns that reminder off.
25. **After it rang**: the row says "Time to leave" (or the minutes left) and has **Snooze 10 min** and **Dismiss**.
26. **A missed one** shows once as "Missed · leave at 20:15", with OK.
27. **On the map**: a ⏰ pin per reminder ("⏰ Leave 20:15 · Arlo Parks") and your 🏠 Home. Click a ⏰ pin for its
    details and Turn off.
28. **Map › Layers › "Leave reminders"** is on by default. Switch it off to hide those pins.

## How it works
- `leavesoon-core.js` (new, UMD, no DOM / fs / Electron). It is shared by the window, the main process and the tests,
  and covers:
  - `travel` (walk or Métro, from showprep62's `STATIONS`)
  - `showTarget` / `errandTarget` (errands67's week format) / `slotTarget` (a day + "HH:MM" on this computer's clock,
    like the week plan)
  - `plan` (leave / notify times, or a plain-words refusal)
  - the life of a reminder: `put`, `next`, `fire`, `snooze`, `dismiss`, `settle` (missed / old ones leave), `missed`
  - the words: `notice`, `hud`, `confirmText`
- `leavesoonmain.js` (new, main process, registered from `main.js` with one line):
  - **one `setTimeout` to the next reminder** that is on or snoozed. It is armed at start, after every change and on
    `powerMonitor` 'resume'. No reminder on means no timer at all.
  - Store: `data/leavesoon/reminders.json`, read with DataSafe. A file that can't be read rings nothing and is never
    saved over. Writes are atomic (crashsafe).
  - IPC `leave:op` (`list`, `put`, `remove`, `snooze`, `dismiss`, `missed`, `seen`, and `test` for checks only) and
    the events `leave:due` and `leave:changed`.
- `leavesoon.js` + `leavesoon.css` (new, lazy group `leavesoon`, `use` tier). They load with the Paris map's code (one
  line in errands.js) or when the ✦ tracker opens. They hold:
  - the toggle
  - the specs (show, errand, weekend slot)
  - Home picking
  - the tracker rows
  - the map layer `leave`
  - `QuestJournal.addDetailHook` (show / errand quests)
  - `ShowSync.extend({ card })` (show cards)
- Nothing on the first screen: the first-screen budget is unchanged (72 scripts / 2334 KB). The always-on part is a few
  lines in `notify.js` (already loaded after the first screen):
  - the `leave:due` listener
  - the routes for the notification's buttons
  - one deferred check for missed reminders at start
- Home lives in this computer's localStorage only (`leavesoon.home`). The reminders folder belongs to this computer
  only (`sync-merge.js` LOCAL_DIRS), so the other computer never rings them too. No GPS, no network, no tokens.

## Changes outside my new files (all small and additive)
- `main.js`: the one `leavesoonmain` register line. `preload.js`: `hub.leave` (`op`, `onDue`, `onChanged`).
- `notify-core.js`: a reminder may carry its own buttons (Show on map / Snooze 10 min / Dismiss). Show reminders
  (showprep62) keep their old single button.
- `notifymain.js`: a button with `go.quiet` runs without bringing Hearth up (Snooze / Dismiss).
- `notify.js`:
  - the `leave:due` listener (notification, or a note when Hearth is in front)
  - `route` for `go.leave`
  - the missed reminders said once at start
- `questhud.js`:
  - the "Leaving soon" rows
  - loading the group when the tracker opens
  - ⋯ More › Near you… › 🏠 Home for leave reminders
- `tools/errands.js`: the toggle on the errand card, and the group loaded with the map code.
- `weekendplan.js`: the toggle on each slot that has a place.
- `tools/quest-mapfirst.js`: Layers › "Leave reminders" (`leave` in DEFAULTS / LAYER_OF / ROWS).
- `sync-merge.js`: `leavesoon` in LOCAL_DIRS.
- `lazy-data.js` (the group, plus `"leavesoon":{}` in META, no commands) and `index.html` (`leavesoon` added to the
  existing lazy-at tag).
- `dev/run-checks.js`: `leavesoon68-test` added to UNIT, and the `leavesoon68` group.

## For Codex
- **No Codex file was edited.** The show quest's button uses the existing `QuestJournal.addDetailHook`, and the show
  card uses `ShowSync.extend({ card })`. The map uses `QuestJournal.addMapLayer` (layer `leave`, pins `ls-home` and
  `ls-<key>`, tones `ls-home` / `ls-pin` / `ls-look`, kinds `bookmark` / `clock`) and the `host.qjHere` hook from
  round 66.
- `tools/quest-mapfirst.js` (mapfirst64, ours) got one Layers row.

## Tests
- `node dev/leavesoon68-test.js`: a unit test in UNIT with 15 checks. It runs in Paris time (TZ=Europe/Paris). It
  covers:
  - walking up to 20 min, and the edge case of exactly 20
  - the Métro sum against an independent sum (Opéra → Bastille on line 8, one change, never slower than walking)
  - no station nearby, and a place outside Paris
  - targets (a show, a slot, a show with only a date)
  - **DST**: a Sunday-evening slot across the 25 Oct 2026 change is 25 real hours away, and the timer waits exactly
    that long. The doubled 02:30. A skipped 02:30 on 28 Mar 2027 reads as 03:30, and that day has 23 hours.
  - **past times**: already started, already time to go, under 10 minutes left
  - errand closing times: today, too late so tomorrow, Sunday closed so Monday, a late night closing at 02:00, 24 h,
    no hours, a stretch too short, a lunch break
  - the life of a reminder (soonest first, a rung reminder never rings again, snooze, dismiss)
  - **missed**: a wake 90 s late still rings, 5 min late is missed and never rung, it's said once, and it leaves the
    list after 2 days
  - the words
  - notify-core's buttons
  - the main side:
    - one timer only (none when nothing is on), always to the soonest reminder
    - it rings once with the words and re-arms
    - snooze and dismiss move the timer
    - a restart after the time went by: missed, never rung
    - `seen` survives a restart
    - a file that can't be read rings nothing and is never saved over
- `dev/checks/leavesoon68.js` (app check, group `leavesoon68`). It uses real clicks only (no chat command), runs on
  smoke's throwaway profile, offline, with a **fake clock shared by both processes**, and the notification recorder
  with Hearth "away". Its steps:
  - the errand card's toggle, then "Click the map where Home is", then a real map click that saves Home exactly there
    (no GPS, not in the journal)
  - the trip and times match the core, and the main side holds exactly one timer
  - the tracker's "Leaving soon" row, the ⏰ and 🏠 pins, and Layers › Leave reminders
  - a show quest's toggle
  - the clock jumps to just before the reminder: one notification "Leave in 10 min for AirPods — about 25 min by
    Métro" with its three buttons. Clicking it opens the item on the map, with its pin marked.
  - Snooze 10 min in the tracker, then it rings again 10 minutes later. Dismiss from the notification doesn't bring
    Hearth up, and the pin leaves the map.
  - Hearth "closed" past the show's reminder: no notification, "Missed" in the tracker once, then not again
  - the weekend card's slot toggle
  - nothing sent and nothing opened
- Results, all run under `flock /tmp/hearth-run.lock`. These passed: leavesoon68, unit:leavesoon68-test, errands67,
  weekendplan66, herepin66, lazy, unit:boot-test, unit:notify-test, unit:errands67-test, unit:datasafe-scan,
  unit:winmac-test and errorcalm-scan.

## Risks
- Not tried on a real Windows PC or Mac: whether the toast's Snooze / Dismiss buttons show depends on the Electron
  version (notify's known limit). A click on the toast always opens the map.
- The trip is an estimate, labelled "about". It knows no real routes, no strikes and no night buses. After about
  00:40, when the Métro has stopped, it still says "by Métro".
- Weekend slots and errands use this computer's clock, like the rest of Hearth's week plan. Shows are fixed points in
  time.

## For the patch notes
- **New: ⏰ Remind me to leave.** Click it on a show (its card or its quest), on an errand's card, or on a slot of 🗓
  Plan my weekend. Hearth tells you 10 minutes before it's time to go: "Leave in 10 min for Arlo Parks — about 25
  min by Métro".
- **It knows the trip.** It counts from your 📍 I'm here pin, or from your 🏠 Home. Walks of up to 20 minutes are
  walking, and anything longer is a Métro estimate. It always says "about", and nothing is looked up online.
- **Set Home once**: the first time, the Paris map opens and you click where Home is. It stays on this computer. To
  move it: ✦ quest tracker › ⋯ More › Near you… › 🏠 Home.
- **Errands beat the closing time**: Hearth gets you to the shop 20 minutes before it closes.
- **The notification works with Hearth in the tray.** Click it to see the place on the map. **Snooze 10 min** or
  **Dismiss** without opening Hearth.
- **The ✦ quest tracker lists them** under "Leaving soon" ("Leave at 20:15"). Click × to turn one off.
- **If Hearth was closed when a reminder was due, it doesn't ring late.** You see "Missed" once instead.
- On the map, ⏰ pins show where you're going, and your 🏠 Home shows too. To hide them, switch off Layers › Leave
  reminders.
