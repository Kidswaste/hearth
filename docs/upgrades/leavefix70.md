# leavefix70 (round 70): leave reminders right at every hour, and 🎒 Before I go

## Was the round 68 failure a real bug?

**Partly.** On base d0f39c6, the leavesoon68 check failed at "a dismissed one rings no more" and "the missed row" when
it ran after about 19:05 Paris time. ratp69 then pinned the check's fake clock to 15:30, and it passed again.

- **What the failure itself was:** a test artefact. After ~19:05 the errand's closing time moved to tomorrow. The
  check then jumped its fake clock a whole day ahead to the errand's reminder, which skipped over the show's
  reminder. Hearth correctly marked the show **missed**, the same as if the computer had been asleep. Step 5 then
  showed that missed row once, so step 6 couldn't find it. Nothing rang twice and nothing rang late.
- **What it uncovered (real, fixed):** between about **19:05 and 19:15** the errand moved to tomorrow although you
  could still go today. Hearth wrongly needed the 10-minute warning to fit before the leave time.
- **Found while sweeping the clock (real, fixed):**
  - A **dismissed reminder could ring again**. If you dismissed it in the ✦ tracker and then clicked "Snooze 10 min"
    on the old desktop notification, it came back and rang 10 minutes later.
  - The same Snooze could make a reminder ring for a show that had already started.
  - An old notification's buttons could act on a reminder you had turned on again since.
  - **Next-day words had no day:** an errand moved to tomorrow said "I'll remind you at 19:05", with nothing to say
    it meant tomorrow.
  - A reminder missed just before midnight read "Missed · leave at **Mon** 23:50" instead of "yesterday 23:50".
- **How it was tested:** a fake clock that keeps running (each timer fires at its own time) was started every 13
  minutes across 00:00–23:59. It ran on seven days, including both clock-change days (the 25-hour day of 25 Oct
  2026 and the 23-hour day of 28 Mar 2027). Errand closing times were checked at every minute of those days.
  - After the fixes: each reminder rings once, a snoozed one rings once more, a dismissed one never rings again, and
    nothing is marked missed while Hearth is running.

## Upgrades

Leave reminders (fixes)
1. **An errand stays on today while you can still make it.** Turn it on 3 minutes before you'd need to leave, and
   the reminder rings at once for today's closing. It no longer moves to tomorrow.
2. **A dismissed reminder stays dismissed.** An old notification's "Snooze 10 min" can't bring it back, and it can't
   ring for a show that has already started.
3. **A notification's buttons only act on their own reminder.** If you turned that reminder off and on again, the
   new one is left alone.
4. **The note says "tomorrow" when it means tomorrow**: "⏰ I'll remind you tomorrow at 19:00 to leave at 19:10 (…;
   it closes at 20:00)".
5. **The ✦ tracker row and its hover text say the day too**: "reminder at tomorrow 19:00".
6. **Missed after midnight reads "yesterday"**: "Missed · leave at yesterday 23:50".
7. **Snooze on a reminder that's already over says so**: "That reminder is over: nothing to snooze."

🎒 Before I go
8. **🎒 Before I go on every upcoming show's card** (Paris map › Shows this week › a show), next to ⏰ Remind me to
   leave. It opens a small list at the bottom right.
9. **The list**: 🎟 Ticket · Phone charged · Earplugs · ID · Card / cash, each with a box to tick. A counter shows
   "2 of 6 ready", then "All set ✓".
10. **The ticket row links to your ticket**: "🎟 Open my ticket" when it's in Hearth (opens the bright view for the
    door), or "🎟 Add my ticket" (the file picker). It updates as soon as a ticket is added.
11. **🧥 Jacket when the forecast says so**: "Jacket: rain likely (70 %), cold (9° at most)". It only shows if Hearth
    already has a forecast saved from 🗓 the week plan. Nothing is looked up for it.
12. **Ticks stay with the show.** Close the list and open it again and your ticks are still there. Each new show
    starts with nothing ticked.
13. **Edit my list…** changes the list for every show: one thing per line, kept on this computer. Clear the box (or
    tick "Back to Hearth's list") to go back to the original list.
14. **When a show's ⏰ reminder rings with Hearth in the tray**, clicking the notification opens Hearth on the list.
    The notification's buttons are "🎒 Before I go · Snooze 10 min · Dismiss".
15. **With Hearth in front, the list opens by itself when it rings.** It shows the reminder's words ("⏰ Leave in 10
    min for … — about 30 min by Métro") and has **Show on map · Snooze 10 min · Dismiss**.
16. **"🎒 Before I go" on the ✦ tracker's row** while a show reminder is ringing or snoozed.
17. **It works with the keyboard**: Tab through the boxes, Space ticks, Esc closes.

## How it works
- `leavesoon-core.js`:
  - `errandTarget` keeps today's closing while `floor5(goal − trip)` is still ahead (the same rule as `plan()`)
  - `when()` adds "yesterday"
  - `confirmText(it, at)` and `hud()` say the day
  - `snooze(s, key, at, made)` only acts on a fired or snoozed reminder before its time
  - `dismiss(s, key, at, made)`: `made` (the reminder's `createdAt`) makes an old notification's buttons do nothing
- `leavesoonmain.js`: passes `made` through for snooze and dismiss.
- `beforego-core.js` (new, UMD): `list` / `parseEdit` / `jacket` / `rows` / `tick` / `ticked` / `progress`.
- `beforego.js` + `beforego.css` (new, lazy group `beforego`, `use` tier): the list is a `<dialog>`. It opens modal
  over a show's card (which is itself modal) and non-modal otherwise.
- Storage: `beforego.list` and `beforego.ticks` in localStorage. Ticks for old shows are dropped after 2 weeks, and
  at most 40 shows are kept.
- The forecast is the main side's existing cache only: `weekquest:weather` with `{ cached: true }` never fetches.
- First screen: no new scripts. boot-test passes at the budget, with notify.js comments trimmed to fit (2345 KB).

## Changes outside my new files (small, additive)
- `notify.js`:
  - the show reminder's actions (🎒 Before I go first)
  - `made` on Snooze / Dismiss
  - the `before` route
  - the list opens itself when Hearth is in front
- `leavesoon.js`:
  - the show card's 🎒 button (the same `ShowSync.extend` card hook)
  - the tracker row's 🎒 button
  - the snooze toast
- `weekquestmain.js`: `cachedOnly`, and the IPC accepts `{ cached: true }`.
- `lazy-data.js` (the group + META `"beforego":{}`, checked with `lazy-manifest --check`) and `index.html` (the
  existing lazy-at tag).
- `dev/run-checks.js`: `leavefix70-test` in UNIT and the `leavefix70` group.
- `dev/leavesoon68-test.js`: `confirmText(it, now)` (its words now depend on the day).

No Codex file was touched. No chat command was added: everything is reached by clicking.

## Tests
- `dev/leavefix70-test.js` (unit, 11 tests, Paris time):
  - errand closing times at every minute of 7 days (both clock-change days, lunch breaks, a late night, Sunday)
  - the words
  - snooze / dismiss guards
  - the running-clock sweep through the main side (770+ start times)
  - the jumped-clock case that broke the round 68 check
  - Before I go's rows, the edit box, the jacket, ticks per show
  - the forecast cache with no fetch
  - notify-core actions
  - the files and the lazy group
- `dev/checks/leavefix70.js` (app, clicks only, throwaway profile, fake clock in both processes, the notification
  recorder). All 24 steps pass, including:
  - an errand at leave time −3 min stays today
  - Dismiss in the tracker, then the old Snooze does nothing
  - 19:30 says tomorrow
  - the 🎒 list from a show card: ticks, Edit my list…, the ticket row opens the bright view, another show starts clear
  - the ring "away" (click → list) and "in front" (list opens itself), Snooze and Dismiss in the list
  - after midnight: "yesterday"
  - nothing sent, no command
- All run under `flock /tmp/hearth-run.lock`. These passed: leavefix70, unit:leavefix70-test, leavesoon68,
  unit:leavesoon68-test, ratp69, unit:ratp69-test, tickets68, unit:tickets68-test, unit:notify-test, lazy,
  unit:boot-test, unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan, and `lazy-manifest --check`.

## Risks
- The first-screen JS budget now has no room left (2345 KB of 2345). The next stream to add to a first-screen
  file will need to trim.
- The jacket depends on the week plan having fetched a forecast in the last 3 hours (it's kept in memory, main side).
  Often there won't be one, and then there's no jacket row. That was the request ("only if a forecast is already
  cached").
- Shows: clicking the notification now opens 🎒 Before I go instead of going straight to the map. The list has Show
  on map. Errands and weekend slots keep Show on map.

## For the patch notes
- **New: 🎒 Before I go.** Open a show (Paris map › Shows this week › the show) and click **🎒 Before I go**. You get
  a short list to tick: your ticket, phone charged, earplugs, ID, card / cash, and a jacket when Hearth already has
  a forecast saying rain or cold. The ticket line opens your ticket (or lets you add it).
- **It comes up when it's time to leave for a show.** Click the "Leave in 10 min…" notification, or just look at
  Hearth if it's open, and the list is there with Snooze and Dismiss.
- **Make it yours**: click **Edit my list…** in the list. It's used for every show and kept on this computer. Your
  ticks are kept per show.
- **Fixed: an errand no longer jumps to tomorrow** while you still have time to make it today.
- **Fixed: a dismissed leave reminder stays quiet**, even if you click Snooze on an old notification.
- **Clearer times**: reminders say "tomorrow" when they mean tomorrow, and a reminder missed just before midnight
  says "yesterday".
