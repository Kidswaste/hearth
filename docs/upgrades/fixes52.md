# Small fixes (round 52, fixes52)

Three fixes; nothing new on screen, nothing added to any prompt (0 tokens).

## 1. presentready's "before" (the old Present) read nothing
- **Cause:** the show's first-5-s count asks the preview for its GPU counters twice (`ready-count`, at the start and
  at 5 s) and gave up after 4 s. The old Present (nothing got ready) is exactly the show that stalls on compiles:
  SwiftShader drew 6 frames in those 5 s, so the preview answered one of the two asks after the 4 s and the count
  was dropped (`first5: null`). The frame-pacing answer, sent after it, still came back, which is why the show
  "started" but wasn't counted. Nothing was missing on the old path; the timing just got heavier after rounds 51/52
  (the measured counts are now 22 compiles / 11 links / 22 uploads before vs the doc's 14 / 7 / 9).
- **Fix:** `tools/three-ready.js` waits up to 20 s for those two answers (the other `ready-count` asks keep 4 s);
  `dev/checks/presentready.js` waits up to 60 s for the count instead of 15 s. The comparison is unchanged
  (before must be more than after; after must be 0 / 0 / 0).
- **Runs:** presentready alone 4 times: 3 passes (before 22/11/22, 20/10/10, 22/11/22 compiles/links/uploads → after
  0/0/0 each time). A 4th run at load 24 counted the baseline fine (4/2/18 → 0/0/0) but failed only "frame pacing
  measured" (9 frames in 5 s on SwiftShader, needs 10): timing under load, not this change. lazy + unit:boot-test pass.

## 2. The director's Ctrl/⌘+K rows came and went
- **Cause:** `director-cmds.js` registered its commands on the page's `load` (+ a 0 ms timer). Ctrl/⌘+K's command rows
  are the commands there when the first screen is up (`Lazy.namesAtReady`), and the first screen (`hearth:ready`)
  sometimes came before the page's load and sometimes after: 22 rows (/director-*, /dock-*, /undo-edit, /redo-edit)
  were "added" or "lost" in `dev/lazy-manifest.js` depending on the start.
- **Fix:** they register as the file runs (a deferred script, always before `start.js` puts up the first screen).
  No other module has a /director today; one registered before this file would still be reachable through it.
  `dev/commandonly-list.json` re-recorded: the director's commands are no longer "late" (Ctrl/⌘+K runs them).
- **Runs:** `LAZY_WAIT=30000 node dev/lazy-manifest.js` clean 3 times in a row (actions 1344 every time; only
  /fullscreen and /ui-size register after the first screen, as before, with their own rows); commandonly and
  unit:commandonly-scan pass.

## 3. chatcalm under load
- **Cause:** it read states at fixed waits: pointing at a reply 350 ms after the mouse moved (the list could still be
  scrolling, the controls still fading in: "pointing at a reply doesn't show Copy, ⋯": 1 run of 3, load 11),
  menus at 200 ms, a stopped / failed reply's line, the folded notes, Find anything's rows at 500 ms.
- **Fix:** it points again where the message is now until Copy and ⋯ show (up to 6 s), and reads each menu, line and
  search once it's there. Every budget and every expectation is the same.
- **Runs:** 3 passes in a row with a presentready run going alongside (load 12–14).

## For the patch notes
- Fixed: Ctrl/⌘+K sometimes had no rows for the Lab director's commands (/director-cost, /undo-edit, /dock-width…),
  depending on how fast Hearth started. They're always there now.
