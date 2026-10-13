# bugbash (round 29): the known failing and flaky checks, fixed at the root

Each known failure was reproduced first, then traced to its cause. Where the app was wrong, the app is fixed (and a
check now covers it). Where the check was stale or racy, the check is fixed to wait for a condition or to assert what
the app does today, with the reason in the commit and in a `(bugbash)` comment next to the change. Nothing was skipped,
disabled or loosened without a written reason.

## App fixes
1. **The Lab no longer opens twice.** Opening the Lab through a command, a director call or the palette before its tab
   had ever been shown mounted it twice: two Labs in one window, two preview pages (twice the GPU work), and keys pressed
   on the visible preview went to the hidden one, so Ctrl+Z, `.` (nudge by ear) and the "✦ Make it react" offer didn't
   work. Cause: the lazy stub's mount and `ThreeLab.cmd()`'s `Tools.shown()` both mounted the real tool. Fix: `lazy.js`
   skips the stub's mount when the surface got mounted meanwhile. Covered by the new `dev/checks/bugbash.js` (2 panes /
   2 preview pages before the fix, 1 / 1 after). This was behind music's "Ctrl+Z takes the marked kicks back".
2. **Switching chats always cross-fades, even while the preview is busy.** The picture a switch fades from was a
   full-size PNG that waits for the preview's next frame; with a heavy scene it took over the 700 ms budget, so the
   switch showed no picture (scenes: "switching cross-fades… got false, 701 ms"). Now two quick sources race: the
   preview's own instant JPEG (the shot the Lab's reloads already used, `box.cover()` / `director.coverShot()`) and the
   window's compositor (the preview's spot of the window). 212 / 427 ms measured here under load, faded both times.
   (`tools/three.js`, `chat-scenes.js`)
3. **Sync: a file written "this very millisecond" no longer flakes the late-journal rule.** The cloud side compared
   `now()` (whole milliseconds) with the file's sub-millisecond modified time, so a file written in the same millisecond
   looked 0.4 ms in the future, was "still being written" on the first pass and started its one-minute "the journal is
   late" clock a pass late. `node dev/sync-test.js` failed 4 cases about one run in four. Now compared in whole
   milliseconds; the test pins such a time every run (fails 3/3 without the fix, passed 18/18 with it). (`sync-engine.js`)

## Check fixes (the check was stale or racy)
4. **qa-keys · Ctrl+1 "dead"**: Ctrl+1 opens rail item 1, which is the Claude chat the test had just opened. It now
   starts from another rail item.
5. **qa-keys · the lyrics tap-along's Enter "dead"**: that line is only live while a tap-along runs (its keys-sheet
   `when` is false otherwise). A key whose line the sheet hides right now is noted, not dead; more than 3 in one area
   fails as "the surface wasn't ready".
6. **qa-keys · W, `, | and Shift+3 dead on some runs / "the key still running after 15 s"**: keys reach the Lab through
   the preview page, and a key pressed while an earlier key (a frame size, a re-run) rebuilds that page lands nowhere;
   the input acknowledgement can also be lost. The press is raced at 3 s (still judged by the app's state), and a Lab
   key seen dead gets one retry after 1.5 s. Dead twice still fails.
7. **polish · die**: the Shuffle die rolls in the next frame since round 17 (hz240, no forced layout); read at once it
   was always false. Now waits for it.
8. **polish · fullTip**: the tooltip was triggered by a synthetic hover, and the parked test cursor's real hover over the
   chat's empty state, ~0.8 s later, rightly took it away. Now hovers with a real mouse move and waits.
9. **commands-page · "> 900 commands"**: the count fell when the video side's ≈ 180 commands were removed (round 17);
   ≈ 860 now. What the check needs is that the whole registry was checked, so it now asserts that every command the lazy
   groups register (the lazy manifest) is listed, plus the same floor as `lazy.js` (> 750). Commands left the chat box in
   round 26 but stay the app's API and this page's content. The page's rail button is gone since round 26 (asserted
   absent); it opens with Ctrl/⌘+Shift+F. Same threshold in `commands-page-previews`.
10. **music · Ctrl+Z / the ghost note**: besides app fix 1, the beat map is saved 400 ms after a change plus the store's
    round trip (490–700 ms measured); the check read it after a fixed 600 / 500 ms. Now waits for the saved state.
11. **sequence-mcp · "help sequence answered by the server"**: since round 25 `help <cmd>` answers the command's own text
    first, then the guide topic; the reply line shows 160 characters, so "THE LAB SEQUENCE" never appeared. Now checks the
    command's text and a length that carries the topic.
12. **sequence-mcp · "Astra: render 1:1"**: rendered the whole 23.5 s sequence (705 frames at 1080×1080 in software GL),
    longer than the engine's 120 s per tool call. The step is "a short 1:1": it now sets the range to the 1-bar clip and
    renders that (also covers range rendering).
13. **run-checks**: the `chat` group was defined twice and the second dropped round 27's `simplify2`; new `bugbash` group
    (`sh dev/run-checks.sh bugbash`: the new check + the sync test).

## The broader groups (run once: lab, chat, smooth, qa, unit, astra)
14. **chatcore-lab · "the frame card shows the saved picture"** (failed every run): a frame with its saved picture shows
    big in the reply since round 15 (chat-media.js `.cm-hero`, taken out of the small card strip); the check only looked
    for the small card. It now accepts the big picture (and the card, for `/media off`) and waits for it to load.

`sh dev/run-checks.sh lab chat smooth qa unit astra` (109 checks, 54 min): 107 passed after the fixes above.
- **chatcore-lab**: fixed (item 14), passes since.
- **remote · "fader → the Lab slider"**: failed once in the group run (the slider ended at 0.835 instead of 0.2 while
  other checks loaded the machine), passed 2 of 2 alone. Not fixed: no stable reproduction yet; the first suspect is
  something else moving the slider during the drag (the hub's soft takeover then waits, by design) rather than a lost
  message (the run's stats show 16 applied, 0 skipped).
- The known checks: `node dev/sync-test.js` 18/18 after the fix; scenes 3/3 since its fix; qa-keys, polish,
  commands-page, commands-page-previews, sequence-mcp, music and bugbash pass.
- Seen once and not reproduced in 3 later runs: scenes · "backstage screenshot · No image" (the first run of the day).
- Noticed, not changed: a sequence range render is named "Director seq range 1x1 mp4 1080x1080.mp4" (format words
  twice in the file name).

## For the patch notes
- Opening the Lab from a chat command or the director before ever clicking its tab no longer starts two Labs at once
  (twice the GPU work, and keys like Ctrl+Z or `.` doing nothing). Nothing to do: it just works now.
- Switching between director chats now always fades from the old scene's picture, even while a heavy scene is drawing.
- Cloud sync: a rare hiccup where a file that changed at the exact same millisecond waited one extra sync is gone.
- Behind the scenes, the app's self-checks that failed now and then were fixed (keys, tooltips, the Commands page, the
  music timeline, the sequence's director tools); each reason is written down in docs/upgrades/bugbash.md.
- The Commands page has no rail button since round 26: Ctrl/⌘+Shift+F or Ctrl/⌘+K still open it.
- Caveat: these were checked on a headless test machine with software graphics; on your Mac and PC things only get
  faster.
