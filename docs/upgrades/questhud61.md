# questhud61 (round 61): a quest tracker you can reach from anywhere

The owner asked: "add a quest tracker in Hearth's general HUD that I can access always." Hearth's HUD is the rail on
the left (it shows on every screen: chats, the Lab, every tool), so the tracker is **one chip in the rail**, right
above Usage, built like the Usage pill. It reads and writes Codex's quest journal (Sidequest Studio) through Codex's
own rules: there is no second store.

## What shipped

**The chip**
1. ✦ Quest chip in the rail, above Usage, on every screen (chats, the Lab, tools): the quest's path icon (◈ ♫ ⬡ ☀ in
   its colour), where you are (`2/4` = quest 2 of the campaign; `1/2` = steps of a side quest) and a thin progress bar.
2. Hover peek: the quest's name, its campaign and its next step, beside the rail (a moment after the pointer rests).
3. Tiny when nothing is active (just a dim ✦); no chip at all until you have a quest journal.
4. Live: changes in Sidequest Studio show on the chip at once, and the chip's changes show in the Studio at once.
5. Right-click the chip: Open Sidequest Studio · Hide the chip · Near you… · Follow the main quest again.

**The panel** (click the chip, or Ctrl/⌘+Shift+O from anywhere)
6. The quest you're on with its two steps to check off: **First move** (+5 XP, the Studio's small start) and
   **Finish line** (completes it when a review already confirmed your proof; otherwise it opens the quest in the
   Studio, where the proof goes — Codex's rule that a quest finishes with real work is kept).
7. Your starting note and a running focus session ("Focus until 14:35") show on the quest.
8. Also active: the main quest and your open side quests; click one to follow it in the chip, tick its next step
   from the row.
9. Today's picks: three from the Studio's own picker (sized for 15 minutes), each with **Take**.
10. Near you (opt-in, off by default): map pins within 3 km with distance and minutes on foot, and the distance to
    the quest's own pin. "Use this computer's location" (read once when you open the panel, kept 10 minutes in
    memory, never saved or sent) or "I'm at…" one of your map places. Nothing about where you are is used otherwise.
11. 📍 a quest with a Paris map pin (field quests, outings, parisquests61's place and personal quests) shows its
    place; click it to open your Paris map in the Studio.
12. Open Sidequest Studio button, with the shortcut shown the way your computer says it.
13. The panel sits over the chats list (its width), so a chat's messages and the Lab preview stay uncovered;
    Escape or a click outside closes it.

**Chat** (one `/quest` command, shared with parisquests61)
14. `/quest` — your quest and its next step, with ✓ Check it off and Tracker buttons.
15. `/quest next` — the next step (and, before a finish line, the quest after it).
16. `/quest done` — checks off the next step.
17. `/quest track <name>` — follow a campaign (the Studio's Track) or a side quest (resumed if parked); names are
    suggested as you type; `/quest track` alone lists them; `/quest <name>` works too.
18. `/quest picks` — today's picks with Take 1 / 2 / 3.
19. `/quest near` — what's near you (asks first when "near you" is off).
20. `/quest open`, `/quest studio`, `/quest hud on|off`.
21. parisquests61's words go through the same command: `/quest paris`, `places`, `guide`, `go <place>`,
    `add <quest>`, `park`, `list`, `help`, or a place / personal quest by name.

**Keys and Ctrl/⌘+K**
22. Ctrl/⌘+Shift+O opens or closes the tracker from anywhere (also when the chip is hidden); listed in the keys sheet.
23. Ctrl/⌘+K: Quest: show my quest tracker · Quest: check off the next step · Quest: show or hide the quest chip.

## How it works
- `questhud-core.js` (no DOM, node-tested): which quest the chip follows (pinned side quest → the tracked campaign's
  next quest → the Studio's bookmark → the first open side quest), its two steps and progress, the other actives,
  names for `/quest track`, map-pin distances, the `/quest` words. All of it calls `QuestCore`.
- `questhud.js` + `questhud.css`: the chip, the peek, the panel, the commands. A lazy group (`questhud`, loaded in an
  idle moment after the first screen). With no journal on disk it stops there: `QuestCore` is not even loaded.
- Writes: when the Studio holds the journal, through `QuestJournal.mutate` (the Studio repaints and saves); otherwise
  the Studio's own steps (read with status → validate → upgrade → QuestCore change → validate → `kvSet`). A failed read
  is never treated as empty. Every save is announced with `document` event `hearth:quests` `{ state, source }`.
- Cost when idle: nothing. No timers, no polling, no animation loop; the chip compares a one-line signature before it
  writes the page. The check counts the tracker's timers and the chip's DOM writes over idle windows: 0 and 0.
- ▶ Play: the game window is its own window; the tracker never appears there. (The optional peek hotkey inside Play was
  left out: nothing is added to the game window.)
- Location: `main.js` now grants `geolocation` to Hearth's own page only (file://, a window), never to websites or the
  game window; the tracker only asks after the owner turns "near you" on.

## Tests
- `node dev/questhud-test.js` (unit, 8 checks): follow / pin / fallbacks, steps, progress, actives, signature,
  `/quest` words incl. the Paris ones, track-name matching, map-pin distances.
- `dev/checks/questhud61.js` (app): no chip and no QuestCore without a journal · zero timers / chip writes while idle
  (3 windows) · the chip shows the active quest, next step and progress inside the rail · `/quest`, `/quest next`,
  `/quest done` without the Studio (saved on disk) · the Studio then shows it · Studio skip → chip · panel expands,
  check-off saves through the Studio (it repaints), once on disk · the finish line opens the proof in the Studio · Take a
  pick · `/quest track` · Ctrl/⌘+Shift+O · Ctrl/⌘+K lines · keys sheet · one `/quest` · hud off/on · tiny when nothing
  is active · `/quest add airpods` (parisquests61) followed by the chip · the chip in the Lab, the panel off the preview
  and off the chat column. Screenshots: `questhud-panel.png`, `questhud-lab.png` in the run's save folder.
- Also run: lazy, quest-studio, quest-session, quest-paris (updated: bare `/quest` is the tracker's, its help is
  `/quest help`), a11y, unit:boot-test, unit:winmac-test, unit:datasafe-scan, unit:chatsafe-scan, unit:commandonly-scan,
  unit:quest-test.
- Not mine, found failing: `quest-journal` (it presses "Open quest journal →", a Creative Playground button that no
  longer exists); `unit:errorcalm-scan` (6 lines in tools/quest-journal.js, 1 in tools/workbench-vst.js, all Codex's,
  none from this stream); `appcalm` control budgets are 1 over with the merged round-61 branches (the chip is hidden in
  that check's fresh profile, not counted).

## Changes outside my files
- `tools/quest-journal.js` (Codex): `announce()` after every save and after load (`hearth:quests`), adopting a save
  announced by someone else (after any save in flight, validated), and `mutate` + `ready()` on the returned object.
- `tools/quest-paris-ui.js` (parisquests61): its `Commands.register('quest')` removed; the tracker's `/quest` calls its
  `run()` / `complete()` for the Paris words.
- `lazy-data.js`: Codex's `quest-catalog.js` + `quest-core.js` moved into a new `questcore` group (`questjournal` has
  `after: ['questcore']`, loads exactly as before); the `questhud` group; manifest regenerated. `index.html`: lazy-at tags.
- `main.js`: geolocation for Hearth's own page only. `dev/run-checks.js`: the unit test and the check in `quests`.
- `dev/checks/quest-paris.js`: help via `/quest help`.

## For Codex
- The journal is announced on every save: `document.addEventListener('hearth:quests', e => e.detail.state)`;
  `source` is `studio`, `studio-load` or `hud`. If you add a writer outside `mutate`, announce it the same way (the
  Studio adopts non-studio announcements after its own pending save).
- `QuestJournal.mutate(fn, message)` and `QuestJournal.ready()` are now public; the tracker writes through them when the
  Studio is mounted, so it never races the Studio's in-memory copy.
- The tracker relies on: `C.next`, `C.available`, `C.done/skipped/record`, `C.startSmall`, `C.complete`, `C.canFinish`,
  `C.latest`, `C.recommend`, `C.choose`, `C.gains`, `C.stats`, `C.sideCount`, `C.upgrade/validate/initial/clone`, and
  campaign fields `mapPlace` / `parisPlace` / `c-world-outing-<place>` ids for map pins. Renaming any of these breaks it
  (questhud-test will say so).
- `QuestCore` / `QuestCatalog` now load as their own lazy group `questcore`; `questjournal` waits for it.
- The finish line is never completed without your review rule: unreviewed proof sends the owner to `questDetail(qid)`.

## For the patch notes
- ✦ A quest tracker is now always in the rail, right above Usage: your quest's icon, where you are (2/4) and a
  progress bar — in chats, in the Lab, in every tool.
- Rest the pointer on it to see the quest and its next step; click it (or press Ctrl/⌘+Shift+O anywhere) for the
  tracker: tick off the first move, see the finish line, your other quests and today's picks.
- Ticking the finish line opens the quest in Sidequest Studio when it still needs your proof, so a quest is still
  finished with real work.
- Everything stays in sync: change a quest in the Studio and the chip follows at once, and the other way round.
- In any chat: /quest (what's next), /quest done (tick it off), /quest track <name> (follow another), /quest picks.
  The Paris words (/quest paris, /quest add airpods…) work in the same command.
- "Near you" is off until you turn it on (right-click the chip › Near you…): then it shows your map pins within 3 km
  and how far your quest's place is. Your location is read only when you open the tracker and is never saved or sent.
- No quests yet: no chip. Nothing active: a tiny ✦. Don't want it: right-click › Hide (or /quest hud off).
- It costs nothing while you work: it only redraws when a quest changes.
