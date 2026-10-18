# clickfirst64 (round 64): every round 61–63 feature by clicking

The owner: "I really don't use commands at all." Rounds 61–63 leaned on chat commands (/quest week, /quest review,
/quest walk, /reward, /shows prep|went|log, /jam park, /song, /sounds, /preset, /playtest notes|hitchmap). This round
audits each of those features (the Paris map itself is mapfirst64's) and puts it where the owner already looks, with
words on the buttons and no new rows of buttons. The commands still work; nothing here needs one.

## The audit: feature → where you click → screenshot

Screenshots are taken by `dev/checks/clickfirst64.js` on a fresh profile (in the run's save folder, `clickfirst64-*.png`).
"New" marks a click path this round added; the others existed and are now checked by the test.

| Feature (round) | Where you click | Screenshot |
|---|---|---|
| ✦ Quest tracker (questhud61) | The ✦ chip in the rail (it appears once Sidequest Studio has a journal) | `clickfirst64-panel.png` |
| Every quest feature in one menu (new) | ✦ panel › **⋯ More** (was an unlabelled ⋯) | `clickfirst64-more.png` |
| The same, from the Studio (new) | Sidequest Studio › **My week ▾** (top bar) | `clickfirst64-studio-menu.png` |
| Plan my week (weekquest62) | ✦ panel › This week › **Plan your week** (first time: "No plan yet" + what it proposes); later **See the plan** | `clickfirst64-week.png` |
| The one nudge (weekquest62) | Inside the week card: "Nudge me on planned days at [18:00]" | `clickfirst64-week.png` |
| Suggest more (weekquest62) | Week card foot › Suggest more (its ⋯ now says **⋯ More**) | `clickfirst64-week.png` |
| Week in review (weekquest62) | ✦ panel › This week › **Week in review ›** | `clickfirst64-review.png` |
| A walk (questwalk63) | ✦ panel › This week › **Make a walk** (or More › Make a walk…) | `clickfirst64-walk.png` |
| A saved walk (questwalk63) | ✦ panel › the walk quest's card › **See the walk** | — |
| Rewards (rewards63) | ✦ panel › Rewards › **All rewards ›**; with none yet, **Pick one** (was "Ideas", a toast to read) | `clickfirst64-rewards.png` |
| Claim / I moved it (rewards63) | ✦ panel › Rewards row (unchanged) | `clickfirst64-panel.png` |
| Shows this week (showsync61) | ✦ panel › ⋯ More › **Shows this week…** (or the Paris map's icon, as before) | `clickfirst64-shows.png` |
| Shows I went to (showprep62) | ✦ panel › ⋯ More › **Shows I went to…** | `clickfirst64-showlog.png` |
| Get ready / How was it? (showprep62) | ✦ panel › a show quest's card › **Get ready** / **How was it?** (also the show card on the map, as before) | `clickfirst64-showcard.png`, `clickfirst64-prep.png` |
| Park mode (parkjam62) | Sound desk › 🌳 Park mode (as before) · ✦ panel › the park quest's card › **🌳 Park mode** · More › 🌳 Park mode… | `clickfirst64-desk.png`, `clickfirst64-parkcard.png` |
| Record loop / ambience (parkjam62) | Sound desk › Park jam · capture the moment (as before) | — |
| Arrange park loops → a song (loopsong63) | Sound desk › **Arrange loops** (now in the top row, beside Park mode) · the park / Finish a track quest's card · More › Arrange park loops… | `clickfirst64-arrange.png` |
| Sound bank (soundbank63) | Sound desk › **Sound bank** (top row; was only Keep a patch › Sound bank…) | `clickfirst64-soundbank.png` |
| ✦ Preset window (presethover61) | Floats over the Sound desk (as before; "–" folds it to a ✦ Preset pill) | `clickfirst64-desk.png` |
| Live device picker (vstlive61) | Sound desk › Audio output / Buffer / MIDI in (as before) | `clickfirst64-desk.png` |
| Playtest log (playnotes62) | ▶ Play right-click › ✎ Playtest log (now always there) · Lab toolbar ⋯ › **Capture & playtest** › ✎ Playtest log | `clickfirst64-labmenu.png`, `clickfirst64-playlog.png` |
| A note while playing (playnotes62) | In the game: F › the chip's **✎ Note (F8)** | `clickfirst64-fchip.png` |
| Record the hitch map (hitchmap63) | ▶ Play right-click · Lab ⋯ › Capture & playtest › ● Record the hitch map · in the game: F › **● Record / ■ Stop hitch map** | `clickfirst64-playmenu.png`, `clickfirst64-fchip.png` |
| The hitch map (hitchmap63) | ▶ Play right-click › ▦ Hitch map (now always there) · Lab ⋯ › Capture & playtest › ▦ Hitch map | `clickfirst64-hitchmap.png` |

## What shipped

**The ✦ tracker panel**
1. **This week** part: "No plan yet · 3–5 quests on days: shows, Paris places, the park" with **Plan your week**; once
   planned, "2 of 4 planned done · Sat · Go see …" with **See the plan**. On Sunday it reads "Next week".
2. **Week in review ›** as the part's own link.
3. **Make a walk**: one click makes the default 2-hour walk and opens its dialog on the Paris map.
4. **⋯ More** (in words) now lists every quest feature first: Plan my week…, Week in review…, Make a walk…,
   My month in Paris… (parisjournal64's), My rewards…, Shows this week…, Shows I went to…, 🌳 Park mode…, Arrange park
   loops…, then the tracker's options.
5. The quest card gets the buttons that fit the quest: a show night → **Get ready** / **How was it?**; Make music at the
   park → **🌳 Park mode** / **Arrange loops**; Finish a track → **Arrange loops**; a walk → **See the walk**.
6. Rewards: **All rewards ›** opens Studio › Rewards; with no reward yet, **Pick one** opens the shelf where each kind
   starter is one click (it was "Ideas", a toast listing `/reward` words).
7. No journal yet: the panel says "Click Open Sidequest Studio below".

**Sidequest Studio**
8. **My week ▾** in the top bar: ✦ Quest tracker plus the same quest menu.

**The week card**
9. Its ⋯ says **⋯ More**; the empty state says "Click Suggest more below" (was "in ⋯").

**The Sound desk**
10. **Sound bank** and **Arrange loops** in the desk's top row, beside 🌳 Park mode.

**▶ Play and the Lab**
11. Lab toolbar ⋯ › **Capture & playtest** (was Capture) ends with ▶ Playtest: ✎ Playtest log · ● Record the hitch map
    (ticked when on) · ▦ Hitch map. (Inside the existing row, so the menu keeps its 11 top rows.)
12. ▶ Play's right-click always has ✎ Playtest log and ▦ Hitch map; before any game they open on the Lab scene open now,
    whose empty log / map says what to do (was a "No game yet" toast).
13. ▶ Play's tooltip mentions its right-click.
14. In the game, the F chip has **✎ Note (F8)** and **● Record / ■ Stop hitch map** under it, clickable when the game
    doesn't hold the mouse. They never take the focus (Space / Enter stay the game's) and the game never sees the
    click. Nothing new runs per frame: the hitch word follows the chip's existing 2-second read.

**Commands stay second**
15. `dev/commandonly-ways.js` lists the click paths for /quest, /reward, /shows, /jam, /sounds, /playtest, /song and
    /vst-preset (the scan had flagged /vst-preset as having no visible way).

15 upgrades.

## How it works
- `clickfirst.js` + `clickfirst.css` (new, in the `questhud` lazy group): the quest menu (`questItems`), the panel's This
  week rows (`weekRows`), the card buttons (`cardActions`), the Studio's button (`studioButton`) and the Lab row
  (`labRows`). Every action calls the feature's own function (WeekQuest.open, QuestWalk.start, ShowSync.listDialog,
  ShowPrep.openCard, ParkJam.on, LoopSong.command, SoundBank.open, PlayNotes.open, HitchMap.set / open), never a
  command. No timers, no listeners of its own.
- The F chip: `game-preload.js` adds the two words under the chip (a flex column now holds the chip, the words, the look
  line and the budget note); a click sends `game:chip` → `gamemodemain.js` takes the note like F8 (`playnotesmain.take`)
  or tells the hub (`game:chip-ev`, `hub.game.onChip`) to flip the hitch map setting through `HitchMap.set`.

## Tests
- `dev/checks/clickfirst64.js` (new; `sh dev/run-checks.sh clickfirst64` runs it with the features' own checks): on a
  fresh profile, wraps `Commands.run` / `tryRun` and ends with 0 runs and an empty chat box, while it clicks: the rail's
  Studio → My week ▾ → the ✦ chip → the panel → Plan your week (Accept all) → Week in review › → Make a walk → All
  rewards › → More › Shows this week… (Load this week's shows, from the fixtures) → Shows I went to… → the plan's show
  chip → Get ready → the Sound desk's Sound bank / Arrange loops / ✦ Preset / Audio output → the park quest's 🌳 Park
  mode → the Lab's ⋯ › Capture & playtest (log, record, map) → ▶ Play's right-click → ▶ Play → F → the chip's ✎ Note and
  ■ Stop hitch map.
- Results (under `flock /tmp/hearth-run.lock`, ≤ 5 a hold, `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package` for
  ▶ Play), after merging round 64's branch and origin/main: clickfirst64 (45 steps, 0 commands run), questhud61,
  weekquest62, rewards63, parkjam62, loopsong63, soundbank63, playnotes62, hitchmap63, questwalk63, showprep62, gamemode,
  menucalm, lazy, playbudget (passed on its second run; the first missed only a timing figure under load) and
  unit:boot-test, unit:datasafe-scan, unit:winmac-test, unit:commandonly-scan, unit:questhud-test, unit:weekquest-test,
  unit:rewards-test, unit:playnotes-test, unit:hitchmap-test all pass.
- Not from this stream: appcalm counts 13 rail controls on the empty start (budget 12) — the same rail as before these
  changes (the ✦ chip is hidden on a fresh profile); unit:errorcalm-scan lists the same 7 earlier lines in Codex's
  tools/quest-journal.js / tools/outing-desk.js.

## Changes outside my files
- `questhud.js` (questhud61): the This week rows, the card buttons and More's items come from ClickFirst; "⋯ More" in
  words; the no-journal line. `rewards.js` (rewards63): All rewards ›, Pick one. `weekquest.js` (weekquest62): ⋯ More,
  the empty line. `tools/quest-walk.js` (questwalk63): `start()`. `showsync.js` (showsync61): `listDialog` exported.
  `showprep.js` (showprep62): `openCard(which, key)`. `tools/parkjam.js` (parkjam62): two buttons in the row.
  `playnotes.js` / `hitchmap.js` (playnotes62 / hitchmap63): the Lab scene when no game yet, the menu rows always there,
  the chip's hitch click. `tools/three.js` (lab): the toolbar ⋯'s Capture row is "Capture & playtest" with three more rows, the ▶ Play tooltip. `game-preload.js`,
  `gamemodemain.js`, `preload.js` (`hub.game.onChip`): the F chip's words. `lazy-data.js`: clickfirst in `questhud`.
  `dev/run-checks.js`: the `clickfirst64` group. `dev/commandonly-ways.js`: the click paths.
- `tools/quest-journal.js` (Codex): one line, see For Codex.

## For the patch notes
- **No commands needed.** Everything from the last three rounds is now a click away, with words on the buttons.
- The ✦ quest tracker has a **This week** part: **Plan your week** (or See the plan), **Week in review ›** and
  **Make a walk**. Its **⋯ More** lists every quest feature: your week, the review, a walk, rewards, this week's shows,
  the shows you went to, Park mode and Arrange.
- Your quest's card shows what fits it: a show → **Get ready** / **How was it?**; music at the park → **🌳 Park mode**;
  finish a track → **Arrange loops**; a walk → **See the walk**.
- Sidequest Studio has **My week ▾** at the top with the same things.
- The Sound desk shows **Sound bank** and **Arrange loops** next to 🌳 Park mode.
- The Lab's ⋯ › **Capture & playtest** has the playtest log, recording the hitch map, and the map.
- While you play, press F: under the stats you can click **✎ Note** and **● Record hitch map**.
- The first time, empty views say what to click instead of naming a command.

## For Codex
- `tools/quest-journal.js` `mount()`: one additive line before the top bar's Motion / Journal options buttons:
  `if (window.ClickFirst?.studioButton) top.append(window.ClickFirst.studioButton(button));` It passes your `button`
  helper; the label "My week ▾" isn't in `actionGroups`, so it stays a plain text button (class `qj-quiet`). Remove the
  line to remove the button; nothing else depends on it.
- The menu opens dialogs through `QuestJournal.paris.ui()` (your kit), `QuestJournal.navigate('rewards'|'world')` and
  `ShowSync.listDialog(kit)`; renaming those breaks the menu rows (the clickfirst64 check says so).
