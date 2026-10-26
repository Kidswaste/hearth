# weekendplan66 (round 66): 🗓 Plan my weekend

From Thursday evening to Sunday, the ✦ quest tracker offers to plan the weekend. One click opens a card that proposes
a balanced weekend from what Hearth already has: a show you could go to, an afternoon of music at the park, a Paris
place close to it, and a studio session on your open music project. You can swap any part, leave any part out, and
accept the rest. Each accepted part becomes a quest with a day and a time.

## What shipped

**The button**
1. **🗓 Plan my weekend** in the ✦ tracker's panel (click the ✦ chip in the rail), from Thursday 17:00 through Sunday.
   It sits under "This week". It is hidden from Monday to Thursday afternoon.
2. The same entry in the tracker's **⋯ More** menu: "🗓 Plan my weekend…" (same days).

**The card** (beside the rail, the tracker's own look; Escape or a click outside closes it)
3. Four slots, each showing its day and time in words ("Fri 30 · 20:00 · Night out"):
   - ♫ **Night out**: a show from this weekend's saved Shotgun / DICE list. Friday comes first, then by start time,
     and sold-out shows go last. With no show saved, it offers a personal quest you already started (19:00).
   - ☀ **Outside**: music at the park (your "Make music at the park" quest, Park mode in the Sound desk) at 15:00, on
     the better of Saturday and Sunday by the forecast. With no forecast, Saturday comes first. If you already
     finished the park quest, it offers "Another park jam". With no park quest at all, it offers a Paris place.
   - 📍 **Nearby**: a Paris place you haven't visited, close to the park ("400 m from Buttes-Chaumont · right after",
     at 17:00). With no park afternoon, it uses a place near the show's venue instead, timed before the show.
   - 🎛 **Studio session**: your open music project. That means a project whose name or notes sound like music, or
     one set to the "Music producer" partner, and the project you have open comes first. Game and other projects
     are never offered. Next come your park loops waiting to be arranged, then "one 8-bar idea" in Serum 2 / Vital.
     It goes on a different day from the park, at 14:00 (or 11:00 / 18:00 when that clashes).
4. **Swap** on each slot gives the next best option, and wraps back to the first. Its tooltip says "2 of 3". Swap is
   greyed out when a slot has only one option. Slots never share a place, a quest or an overlapping time.
5. **Keep** on each slot (✓ by default). Click it to leave that slot out (crossed out), and click again to put it back.
6. **Accept plan (N)** turns the kept slots into real quests on your week plan. Each quest has its day and its time.
   The ✦ chip follows each day's quest, like the week plan. Your tracked main quest does not change.
7. After accepting, the slots show "✓ planned" and the card says how many went on your plan. Accepting again only
   moves them. It never adds duplicates.
8. **See my week** opens the week card. You can drag a planned quest to another day there.
9. Helpful empty lines: "No show saved for this weekend. Shows come from the Paris map's Shows layer", "Nothing
   unvisited close by", and so on. A card with nothing to plan says where to click to get started.

**No network needed**
10. Shows come only from Hearth's saved list. The card says so: "Shows from Hearth's saved Shotgun / DICE list
    (updated Thu 18:40)". When the computer is offline it says "Offline: using the shows Hearth saved. Nothing new is
    fetched."
11. The forecast (weekquest62's free Open-Meteo forecast, cached for 3 hours) is only asked when the card opens and the
    computer is online. Without it, the card says "No forecast reached Hearth: check the sky before the park."
12. Nothing is uploaded and no AI is asked. The plan costs no tokens.
13. A store that can't be read is never treated as empty. If your projects can't be read, the card says so and
    suggests a small idea. If the journal can't be read, nothing is changed.

**The quests it makes**
14. A show becomes showsync61's "Go see X at Y" quest. The park becomes parisquests61's park quest, and a place becomes
    the place quest. A studio session becomes a small three-step music quest of your own ("Open 'Night bus EP' and play
    the last version once" → "Change one thing you can hear" → "Bounce a rough and write one line"). A park jam
    becomes "Park mode → record one loop outside → keep the take". XP still comes only after proof and review.
15. Social quests stay yours: the night slot only offers personal quests you already started yourself.

**Chat (secondary)**
16. `/quest weekend` shows the plan in the chat with an Accept plan button. `/quest weekend accept` accepts it.
    Typing `/quest w…` suggests it.

## How it works
- `weekendplan-core.js` (no DOM, node-tested, in the `questhud` lazy group next to `weekquest-core.js`):
  `inWindow(now)` (Thu 17:00 → Sun), `weekend(now)` (Fri/Sat/Sun of this week, the days still ahead),
  `build(inputs)` (ranked options per slot), `choose(built, swaps, now)` (the plan: the slot's Nth valid option,
  with no clashes and no shared place or quest), and `accept(C, s, week, picks, makers)` (it runs inside
  `QuestHud.write`). `setClock` / `now` exist so checks can set a Thursday-evening clock. There is no randomness and
  no clock inside `build` / `choose`, so the same inputs always give the same plan.
- `weekendplan.js` + `weekendplan.css`: the card, in a new `use` lazy group, `weekendplan`. It loads on the first click
  and also pulls in `questjournal` (QuestParis, ShowSyncCore), the same way the week card does.
- Data: no new store. Accepted slots are ordinary `s.weekly.plans[].items` (weekquest62's shape), with three extra
  fields: `time` ("HH:MM"), `weekend: true`, and a `why` that starts with the time. Item ids are `wk-wp-<option id>`.
  Studio and jam sessions are `QuestCore.addCampaign` campaigns (path `music`). A studio campaign also gets
  `projectId`.
- Reads: `hub.shows.get()` (the saved list only), `hub.weekquest.weather()` (online only), `hub.kvGet('projects', null,
  { status: true })` (read-only), `hub.parkSong.list()` (park takes, read-only).

## Tests
- `node dev/weekendplan-test.js`: a unit test in UNIT with 10 checks, using weekquest62's fixtures:
  - the window
  - the balanced plan (Fri show 20:00, Sat park 15:00 on the dry day, a place within 3 km at 17:00, a Sunday studio
    on the music project, not the game)
  - the same inputs give the same plan
  - Swap and wrap-around, with no clashes
  - no forecast
  - no shows (a personal quest, or an empty slot with a reason)
  - studio sources (the open project first; archived and non-music projects never)
  - Saturday evening (the past dropped, everything on Sunday with no clash)
  - a finished park quest gives a park jam
  - Accept (times, the main quest kept, `QuestCore.validate` + `checkWeekly`, twice = no duplicates, the chip follows
    the day)
- `dev/checks/weekendplan66.js` (app check, 25 steps, on smoke.js's throwaway profile, with fixture shows and projects,
  `navigator.onLine` forced off):
  - the button on Monday / Thu 16:00 / Thu 18:00 / Sunday
  - the card's code not loaded before the click
  - the offline line
  - the four slots and their days and times
  - Swap, wrap-around, Keep off
  - Accept plan → three quests on disk with times, the left-out place not planned, the main quest kept, the journal
    valid
  - ✓ planned
  - Accept again adds nothing
  - See my week
  - `/quest weekend` in the chat
- Group: `node dev/run-checks.js weekendplan66`.
- Results (under `flock /tmp/hearth-run.lock`):
  - These pass: weekendplan66, unit:weekendplan-test, unit:boot-test (after adding the `weekendplan` group to the
    manifest), unit:weekquest-test, unit:questhud-test.
  - These fail on this branch exactly as they fail on an untouched copy of becd52e (I ran both side by side), so the
    failures come from code before this stream:
    - lazy: "all held at start", the projects-at-boot problem that lazyfix66 is fixing
    - weekquest62: 3 steps, because the app now starts on Projects, not a chat, and today is a Monday
    - questhud61: "Studio repainted"
    - unit:datasafe-scan: Codex's tools/quest-chat.js
    - unit:winmac-test: Codex's cloud-files.js and sync-engine.js
- `node dev/lazy-manifest.js` was run. Its output re-ordered Codex's `visualfeedback` entry, so I kept the old manifest
  and added only `"weekendplan":{}` to it, to keep merges small.

## Changes outside my files
- `questhud.js` (questhud61): one row in the panel (🗓 Plan my weekend, inside the window), one ⋯ More entry, a
  `/quest weekend` dispatch, a `weekend()` helper and a typing hint.
- `questhud-core.js`: `'weekend'` added to `SUBS`.
- `lazy-data.js`: `weekendplan-core.js` / `WeekendPlanCore` in the `questhud` group, the new `weekendplan` group, and
  `"weekendplan":{}` in META. `index.html`: `weekendplan` added to the lazy-at tag after `weekquest`.
- `dev/run-checks.js`: `UNIT.push('weekendplan-test')` and the `weekendplan66` group.

## For Codex
- No Codex file was edited.
- Week-plan items made by the weekend card carry `time: "HH:MM"` and `weekend: true` (extra fields, which
  `WeekQuestCore.checkWeekly` allows). Their ids are `wk-wp-*`.
- Studio and park-jam sessions are `QuestCore.addCampaign` campaigns with path `music` (custom, three milestones).
  A studio session for a project also carries `projectId` (the kv `projects` id). `validate` keeps it as it does other
  extra fields. If you make `validate` strict, keep `projectId` or drop it: nothing else depends on it yet.
- Accepting restores `s.active` afterwards, so the main quest is never changed.

## Risks
- Shows come only from the saved list. If the Shows layer hasn't refreshed this week, the night slot falls back or
  stays empty, and the card says why.
- "Music project" is a guess from the project's name, notes or "Music producer" partner. A music project with a plain
  name and another partner won't be offered, and the card then suggests park loops or an 8-bar idea.
- The week plan holds up to seven quests. A week already full shows the calm error "A week holds up to seven planned
  quests".

## For the patch notes
- **Plan my weekend**: from Thursday evening to Sunday, click the ✦ quest chip in the left rail, then **🗓 Plan my
  weekend** (it's also in the tracker's ⋯ More menu). Hearth suggests a balanced weekend:
  - a show you could go to on Friday night
  - music at the park on the better afternoon
  - a Paris place you haven't been to, close to the park
  - a studio session on your open music project
- Each line has **Swap** (show me the next best option) and **Keep** (click to leave it out). Click **Accept plan** and
  the kept ones become quests on their days, each with a time. The ✦ chip then shows each day's quest. Click
  **See my week** to move one to another day.
- It works with no internet. It uses the shows Hearth already saved and tells you so. Without a weather forecast, it
  reminds you to check the sky before the park. Nothing is uploaded, and it uses no AI tokens.
