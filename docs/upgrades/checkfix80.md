# checkfix80: four checks that cried wolf under load (round 80)

Four checks failed on this 4-CPU box when other checks ran beside them, so their red no longer meant anything. Each
one was looked into first: one real (small) app fix came out of it; the rest were the checks measuring the wrong
thing. All runs below: the four checks side by side (4 at once, one `flock /tmp/hearth-run.lock` hold each), with
other agents' runs on the box too. "Before" = the checks and app of d8a8b7b, "after" = this branch.

| check | before | after |
|---|---|---|
| gamemode | 4/8 | 8/8 (26/26 over every run of the final version) |
| labaudio77 | 0/8 | 8/8 (final version; two earlier drafts went 6/8 and 4/8, see below) |
| labscrub | 5/8 | 8/8 (26/26) |
| connections | 7/8 (on Linux) | 8/8 (24/24) |

## 1. gamemode: "the merged canvas keeps drawing" (`dev/checks/gamemode.js`)
- **Why it read 0 frames**: not a stall, not rAF throttling (the window was visible and focused; `backgroundThrottling`
  is off for ▶ Play). The check waited for 20 frames, but those come from Getting ready's warm-up under its card;
  right after, Getting ready runs the budget's A/B, which holds the game's frames on purpose (`__gmHold`, card at
  "checking it runs smooth · 99 %") for 1–10 s on this machine. The 1.5 s count landed inside that hold. Traced in one
  run: 20 frames at 11.5 s, held until 21.0 s, then the page and the merged canvas drew together (302 frames for 302
  page frames).
- **Fix (check only)**: it now waits until getting ready is over (`__gameReady.phase === 'playing'`), then counts the
  merged canvas against the page's own frame clock (a frame counter of the check's own in the page, taken off after)
  over ≥ 1.5 s and ≥ 6 page frames (≤ 20 s). Pass: ≥ 0.8 merged frames per page frame. A real stall (the page
  animating, the canvas not; or no page frames at all) still fails. After: 1.8–2.6 fps, 0.86–1.13 per page frame.

## 2. labaudio77: sync under load (`dev/checks/labaudio77.js`, `tools/three-sandbox.html`)
- **What was really going on**: under load the preview drew 5–10 fps and some frames' callbacks ran 50–375 ms after
  their own frame time (the page wasn't running: the long-task observer saw no task there, so long-task data couldn't
  explain them; the page's own record of how late each callback ran does).
- **App fix (small)**: the song clock read each frame's time at "frame time + one screen frame". A frame whose callback
  runs after that moment is shown after it, so it now reads the clock at *now* at the earliest
  (`Math.max(FR.t + dispMs, now)` in `songNow`). Before, two visible effects after a hitch: after a seek, the first
  frame drawn could still show the old spot although the sound had moved on 150+ ms ago; after the clock started over
  (back from another tool, a long hitch), one frame showed a moment up to 300 ms ahead, then the picture stepped back.
  On a calm machine nothing changes (the callback runs before the show time). The frame log (`__labAV.frames()`) gains
  a 6th field: how late the callback ran (checks only; nothing per frame when not watching).
- **Check changes**: the offsets leave out (a) frames whose callback ran > 50 ms late and the 0.5 s after (the clock
  may start over then and refits its speed), (b) frames where the audio clock itself didn't behave like a sound card
  around them: its samples within ±0.5 s off their own line by > 2 ms, or its speed > 0.2 % off. On the starved box
  the output timestamps wobbled ±3–8 ms a few in a row, stepped (underruns) or ran 0.4 % fast for a second, and the old
  reference (the newest sample alone) read that as the picture being off. Elsewhere each frame is held against that
  local line of the audio clock. A picture off a steady clock, or drifting from it, still fails. What was left out is
  counted in the report (`leftOut`, `blockedMs`, `clockUnsteady`). Every stretch watches until it has ≥ 20 judged frames
  (≤ 14 s; song A is now 48 s so it never runs out; before, at 6 fps a 1.5–2.5 s window held 5–12 frames and failed
  on the count alone). Drift is the middle offset of the first and last thirds (two 15 ms frames moved a mean by 2 ms).
  The seek's sound time is the later of "seek + output path" and "the element started playing the new spot", give or
  take one step of the element's time (one audio callback, ≈ 10 ms here: what tells both the page and the check where
  the sound is). `unit:labaudio77-test` (the clock's math, real drift / ppm / underrun cases) is unchanged and passes.
- **Final 8 runs** (each beside gamemode, labscrub, connections): preview at 5–11 fps; 48 judged stretches, p95 offset
  median 0.56 ms, worst 3.2 ms (budget 4.17); ≥ 22 judged frames each; 38 % of frames left out overall.
- Drafts on the way: excluding by long-task data alone was not possible (no long task near any bad frame); excluding
  only late frames + sound jumps detected from the raw element time went 6/8 then 4/8 (the raw time is too noisy to
  find the audio clock's wobbles); one line through a whole stretch's samples failed because the audio clock stepped.

## 3. connections (`dev/checks/connections.js`)
- On this Linux box it passed 7/8 before (the 1 fail: the row's Off / Read only / Full read before the row was drawn
  again). The Windows session's 6 failing UI steps couldn't be reproduced here; the check was older than the screen in
  how it got there (a programmatic `Options.open` and `.click()` on parts that are now folded away, so a click that
  only works from a script passed).
- **Now, through today's screen with real input** (CDP mouse and typing): the chat header's ⋯ → AI setup under it →
  a click on the "Connections" line under What it can use (a fold since simplify3) → ＋ Add a connection → the 8
  cards → the form typed into → Add → the row's Test button → a second, broken server through the same form →
  ✕ → the engines use it → `/connections` → reopen → right-click the row → Remove → the confirm's Remove, for both.
  Every click is checked to land on what it means to press (on screen, not covered). The dev folder comes from the
  harness (`SMOKE_DEV`, no Windows path parsing), pictures go to the run's own scratch folder. Everything the old check
  verified is still verified.
- **Noticed, not fixed** (options.js / connections.js): the Connections line's state ("None on") isn't updated when you
  add or switch one on while AI setup is open; it is right the next time AI setup opens.

## 4. labscrub (`dev/checks/labscrub.js`, `dev/trace-stats.js`)
- Its ms-per-move budgets (pan 20, clip 8, scrub 4…) and "late handlers" were wall time. Beside other checks a frame's
  "work" read 0.4–1.4 s. Now a stretch over a budget is measured once more under a timeline trace and judged on the Lab
  window main thread's own CPU time (`trace-stats` thread time; new `inputOver8Cpu`: tasks running an input's handlers
  over 8.3 ms of CPU). Seen after: pan 22.7 / 27 ms wall → 4.1 / 3.7 ms CPU; clip 18.4 ms → 2.3 ms. Both readings are
  in the report. Real extra work shows in CPU time too. `window.LS_WALL = 1` judges on wall time only, as before.

## Checked
- The runs in the table (logs per run under the scratch folder `checkfix80/runs`); unit: boot-test, datasafe-scan,
  winmac-test, errorcalm-scan, chatsafe-scan, commandonly-scan, storeack-scan, labaudio77-test, gamemode-test all pass.

## For the patch notes
- Lab sound sync after a hiccup: when the Lab stalls for a moment (a busy computer, coming back from another tool),
  the next picture now matches what you hear right away, instead of briefly showing the old spot after a jump, or
  leaping ahead for one frame and stepping back.
