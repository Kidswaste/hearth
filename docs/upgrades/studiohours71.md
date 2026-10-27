# studiohours71 — 🎛 Studio hours (round 71)

Your music time, kept in the ✦ quest tracker. It counts the Sound desk sessions bouncelog66 already keeps: logged ones,
unlogged ones, and the session that's running now. Everything is reached by clicking, with visible labels. It never
writes your sessions, makes no timers and sends nothing anywhere. Edits to other streams' files are small, additive
and marked `(round 71, studiohours71)`.

## What shipped
### In the ✦ tracker
1. **A "This week: 3 h 20 making music" row** sits in the tracker's panel, right under "This week" (Plan your week /
   Week in review). Click the ✦ chip in the rail to see it.
2. **A 7-day mini bar** on that row runs Monday → Sunday. Today is bright, the days still ahead are dimmed, and an
   empty day is a thin line.
3. **The row's empty states are kind:**
   - never played: "Studio hours: your music time shows here";
   - a new week with nothing yet: "This week: new week, fresh start".
4. **With a weekly goal, the 🎛 becomes a soft ring** that fills with the week's share of the goal. Its sub-line says
   "Studio hours › · 1 h 20 of 4 h", "Goal reached ✓" or "New week, fresh start".
### The Studio hours card (click the row)
5. **This week**: the total ("2 h 35 making music this week · 1 session") and a bar for each day (hover a bar for its time).
6. **Last 8 weeks**: a bar for each week, labelled with its Monday. This week is highlighted.
7. **A this-week / 8-weeks table**: Time, Sessions, Sketches saved, Loops trimmed (✂ Trim loop), Park sessions.
8. **Longest session** ("2 h · Sun 25 Oct") over the 8 weeks.
9. **Most used: Serum 2 vs Vital**, with each one's time ("Vital 3 h 05 · Serum 2 2 h 50"). A session that used both
   counts half for each.
10. **Weekly goal**, off by default. Click **Off · Set one**, then a chip: Off · 2 h · 3 h · 4 h · 6 h. Click
    **4 h · Change** to change or turn it off. A missed week is never mentioned: after a week under the goal, the card
    only says **"New week, fresh start"**.
11. **Sessions in the Sound desk ›** opens the Sound desk with its Sessions list (sketches, ▶, Trim loop).
### Sunday evening
12. **One gentle note**, at most once per Sunday, from 18:00 Paris time: **"You made music 3 times this week 🎛"**
    ("once", "twice"), with a **Studio hours** button.
    - It only shows if you had at least one session that week. It never shows when you had none.
    - It goes through the calm tip queue (Hints), so "Don't show tips" silences it.
    - It's checked only when Hearth opens or comes back to the front. No timer.
### Also (secondary)
13. `/hours`, `/hours goal 4`, `/hours goal off`; Ctrl/⌘+K "Quest: my studio hours".
14. **Fix:** opening the Sound desk from somewhere else, on a cold start, now lands on the desk. Before, the Playground's
    first mount showed its home page over it, and "Set up live audio…" was shown wrongly. This also fixes the cold-start
    path of `/sessions` and Park mode.

## How it works
- `tools/studiohours-core.js` (UMD, no DOM, node-tested):
  - Paris time on any computer clock, through `Intl` `Europe/Paris`: `dayKey`, `weekKey` (Monday), `midnight` (exact on
    the 23 h / 25 h DST Sundays), `addDays`;
  - `split(row)`: a session's active minutes, shared between its Paris days in proportion to the clock time on each side
    of midnight. So a Sunday-night session that runs past midnight counts partly in each week;
  - `summary(rows, now, { goal, loops })`:
    - sessions, park sessions, longest and the instruments count in the week the session started;
    - sketches and loops count in the week they were saved;
  - `goalOf`, `rowText`, `sundayNote`, `sundayEvening`.
- `tools/studiohours.js` (`StudioHours`) + `tools/studiohours.css`: the row (`hudRows`), the card (the tracker's
  `.qh-panel` look, beside the rail), the goal chips, `sunday()`, `/hours`.
- Data, read only:
  - kv `music-sessions` through `hub.kvGet(…, { status: true })`. A failed read keeps the last numbers and says so;
    it's never shown as "no music";
  - the live session through `BounceLog.session()`, only when the Sound desk's group is already loaded;
  - trimmed loops from `hub.parkSong.list()` (cards with `kind: 'sketch-loop'`), only when the card opens.
  - The goal is a per-computer preference (`store` `studiohours.prefs`). The Sunday note's "already shown" mark is
    `store` `studiohours.sunday`.
- Lazy group `studiohours` (tier `use`, after `questhud`): it loads when the tracker's panel opens, or on a Sunday
  evening that hasn't had its note. The first screen is unchanged apart from the one manifest line.

## Touches outside my files
- `questhud.js` (2 lines): it loads the group and refreshes it when the panel opens, and renders `StudioHours.hudRows()`
  after ClickFirst's week rows (only once the group is in).
- `weekquest-nudge.js`: `studioSunday()`, a Paris-time gate on the same `focus` and start moments as the plan-my-week
  offer. It loads the group only on a Sunday evening that hasn't had its note yet.
- `tools/parkjam.js` (1 line): `desk()` asks `CreativePlayground.openFeature('vst')` again every 2 s while the desk
  isn't mounted.
- `lazy-data.js` / `lazy-meta.js`: the group line, plus the regenerated manifest (`/hours` and the palette line).
- `dev/run-checks.js`: `studiohours71-test` in the `const UNIT` list, and the group `studiohours`.
- Codex's files: not touched.

## Tests
- `node dev/studiohours71-test.js` (`unit:studiohours71-test`, 84 checks). It runs again under TZ=America/Los_Angeles,
  Asia/Tokyo and UTC, and the answers must be identical. It covers:
  - Paris offsets in winter and summer;
  - Sunday 23:30 UTC being Monday in Paris;
  - weeks across New Year;
  - midnights of both DST Sundays (25 h / 23 h days);
  - a session across midnight and across Sunday → Monday;
  - the DST night and a session over a whole weekend;
  - the 8 weeks;
  - sessions counted by the week they started in;
  - sketches and loops counted by the week they were saved (a park take isn't a loop);
  - the live session replacing its stored copy;
  - damaged rows skipped;
  - Serum 2 vs Vital with the half split;
  - the goal's words, with no guilt words ever;
  - the Sunday note: "once", "twice", "3 times"; never with none, never before 18:00, never on another day.
- `dev/checks/studiohours71.js` (`node dev/smoke.js --fake-vst --script dev/checks/studiohours71.js`): an isolated
  profile with fake sessions, a real loop card and a fixed clock, driven by clicking:
  - the ✦ chip → the row "This week: 2 h 35 making music" with its mini bar, without loading the Sound desk;
  - click the row → the card's numbers;
  - the goal: 4 h (ring + "New week, fresh start") → the row's ring → 2 h ("Goal reached ✓") → Off;
  - Sessions in the Sound desk ›;
  - the Sunday note through a real `focus` event, once only, and not for a week with none;
  - Studio hours makes no timers, never writes `music-sessions`, and sends nothing.
- Results: see the final report (app checks under `flock /tmp/hearth-run.lock`).

## Risks / notes
- How a session's time is split across midnight is an estimate: by clock time, since the row keeps total minutes, not
  when inside it they were played.
- A session counts once it's in the Sessions store (10 minutes or more, saved by bouncelog66) or while it's live in
  the desk. Shorter tries aren't counted, same as the Sessions list.
- The goal is per computer (like the tracker's own options).

## For the patch notes
- **🎛 Studio hours.** Click the ✦ quest chip in the rail. Under "This week" there's a new row, "This week: 3 h 20 making
  music", with a little Monday-to-Sunday bar. It counts your Sound desk sessions (Serum 2 / Vital), logged or not.
- **Click that row** for the Studio hours card: your days this week, your last 8 weeks, your longest session, Serum 2 vs
  Vital, and how many sketches, trimmed loops and park sessions you had.
- **An optional weekly goal.** In the card, click "Off · Set one" and pick 2, 3, 4 or 6 hours. It shows as a soft ring in
  the tracker. If a week falls short, nothing is said about it: the card just says "New week, fresh start".
- **Sunday evening**, if you made music that week, a single quiet note: "You made music 3 times this week 🎛". Never on
  a week without music.
- "Sessions in the Sound desk ›" at the bottom of the card takes you straight to your sessions and sketches.
- Fixed: opening the Sound desk from another place right after starting Hearth no longer stops on the Playground's
  home page.
