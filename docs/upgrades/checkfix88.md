# checkfix88: a check suite you can trust again (round 88)

Six checks were red for reasons that had nothing to do with the change being tested: one stale check, timing checks
that failed only when other checks shared the 4-CPU box, and one check whose clicks landed on a note that came up over
the panel it was testing. Each one was looked into first. Two real app fixes came out of it (chatsafe's reader and the
welcome note over the sync panel). The rest were checks measuring the wrong thing. They now measure work, not wall time.

All app runs were under `flock /tmp/hearth-run.lock`, with at most 5 checks per run. "Under load" means a run with
`node burn.js N` beside it: N worker threads, each spinning CPU and allocating, on the same 4 CPUs (load average
5–17). That is how the "4 other checks beside it" condition was reproduced.

## 1. adaptive-feedback: "Deep budget not shown before sending" (a stale check)

- **What the app shows**: `Deep: all 180 frames · 4 consecutive batches · up to 6 Astra replies…` for the clip it is
  given. The check looked for `all 60 frames` and `4 Astra replies`.
- **Cause**: the check was written (aae8bae, Oct 20) against a 2 s / 60-frame take. Since round 74, the runner has
  handed it the shared test video `/tmp/hearth-test-videos/neon_tunnel_v1.mp4` (`dev/make-test-videos.sh`:
  `testsrc2 … r=30:d=6`), which has 180 frames (ffprobe: `nb_read_frames=180`). That fixture recipe hasn't changed
  since 2a9429e (Oct 8). The app never changed either: `visual-feedback-core.js deepPlan` batches 48 frames, each
  starting 46 after the last. For 180 frames that is [0–47], [46–93], [92–139], [138–179]: 4 batches, plus an
  overview and a final synthesis, so 6 replies. **The app's answer is right**: every frame is covered with 2 frames
  of overlap, and the reply budget is batches + 2, the same rule that gives "4 replies" for 60 frames.
- **Fix (check only)**: `dev/checks/adaptive-feedback.js` reads the clip's frame count (`FrameRead.info`) and works
  out the batches on its own (48 long, every 46 frames, the last one cut short). It does not ask the app's `deepPlan`,
  so the app is still tested. It then expects that cost line, that turn count (batches + 2), those batch sizes and
  "every one of N". The cancel test intercepts the N-frame decode instead of a fixed 60. A failure message now
  includes the actual cost line.
- **Proof**: ✓ 41 s and 40 s (`deepReplies: 6, allFrames: 180, deepBatches: [48,48,48,42]`); `unit:adaptive-feedback-test`
  10/10.

## 2. Timing checks that failed only under load

### The tool: judge a long task by its own CPU time (dev/smoke.js, dev/trace-stats.js)
- `smoke({ trace: 'start', tasks: true })` starts a light trace (`toplevel,blink.user_timing`) and reads every
  process's run delay from `/proc/<pid>/schedstat` (time the thread was ready to run but waited for a CPU) plus the
  VM's steal. `smoke({ trace: 'stop', tasks: { budget, mark, observed } })` returns `longTasks()`.
- `longTasks` takes **the long tasks the page's own PerformanceObserver saw** (so a check keeps its own idea of what a
  long task is). For each one, it finds the outermost trace events on the window's main thread within that span:
  the task and the microtask checkpoint after it, which this Electron traces separately. Their `tdur` is the thread's
  own CPU time. A task over budget is then judged:
  - **over**: its CPU time (less the host's steal) is over the budget. That is real work: script, layout or GC.
  - **over**: it spent longer off the CPU than the thread waited for a CPU in the whole stretch. That is a sync read
    or a lock, so real slowness too.
  - **load ("can't tell")**: its CPU time fits, and the rest is no more than the wait for a CPU. The box was busy,
    not the app. It goes into the check's `cantTell` list, which does not fail the check.
  - Without a trace (off Linux, or tracing failed), the check judges wall time as before.
- `dev/run-checks.js` prints a passing check's first can't-tell on its line: `✓ chatwindow86 … (can't tell under load:
  …)`. A Node test's `CAN'T TELL …` line shows the same way. So a pass that wasn't measured says so.
- A synthetic check of the rules (budget 60, 90 ms task):
  - 80 ms CPU on a busy box → over;
  - 30 ms CPU with a 300 ms wait for a CPU → load;
  - 30 ms CPU with a 5 ms wait for a CPU → over ("a sync read / lock?");
  - a 50 ms task → ok.
- No budget was raised.

### chatwindow86 "panels" (117 ms vs 100): real slowness, fixed in the app (chatsafe.js)
- **Cause**: the trace of the panels step showed three back-to-back tasks of 72 ms wall and 72–78 ms CPU, each about
  63 ms of `Layout` (full-document layout, 53 dirty objects). They came from chatsafe's reader opening on the giant
  chat. Its first page (90 messages) goes in 10 rows per frame, newest first, just under the "Show earlier" button. The
  view is only scrolled to the end after the last batch, so each batch went in at the visible top. There,
  `content-visibility: auto` must lay out those rows' long replies (up to 40,000 characters each), which then end up
  off screen anyway. On a calm box these tasks are 70–100 ms; with a busy box beside them, 117.
- **Fix (app)**: `chatsafe.js bigEl`. The first page keeps the end in view from its first batch on (`toEnd()` after
  each batch; the "Opening…" note goes before the first batch). Older batches then go in above what is on screen,
  where content-visibility leaves them unlaid-out. "Show earlier" is unchanged: it was already fine, with no long
  task in 3 of 4 tries.
- **Proof** (the reader opened 4 times on the giant chat, the chat itself open, calm box): long tasks while the first
  page goes in, before → after:
  - before: [81, 69, 69, 68, 64, 60], [97, 90, 71], [103, 93, 68, 60], [100, 93, 79, 61, 52];
  - after: none in 3 of 4 tries, one 91 ms task in the fourth, which ran at load average 5.9.
  
  Each try still ends at the end of the chat.
- **Check bug fixed too**: the step read the row count as soon as the first row showed, then clicked "Show earlier"
  while the first page was still going in. The button is disabled then, so the click did nothing. "afterEarlier" only
  counted the first page still arriving. The step now waits for the first page, so it really tests "Show earlier".
- **Check made load-aware** (step(), see above), with `CW86_TRACECATS` / `CW86_DUMP` added to see what a long task was.
  - Under load: ✓ 5 of 5 runs.
  - A typical can't-tell: "send: a 66 ms task … 24.2 ms CPU; the other 41.8 ms ≤ the 567.5 ms the thread waited for
    a CPU".
  - panels under load: 75 ms (31.6 ms CPU), no problem.
- Also seen once, in the very first run after the container booted: "send held the main process 1,577 ms in
  three-mcp.js:1". `mcp/cost.js` requires the MCP server definitions on the first send. That require takes 4 ms in
  Node (`node -e "require('./mcp/three-mcp.js')"`), and the stall never came back in 8 more runs. It was the cold disk
  right after boot, not the app. Main-process blocks are still judged by wall time (the lag probe has no CPU split).

### bigchat84 open (68 ms vs 60): load noise
- **Cause**: under load, the open step's longest tasks cost 18–28 ms of CPU (trace `tdur`) for 29–36 ms of wall time.
  On a calm box there was no long task at all, and opening the whole chat cost 630–670 ms of CPU spread over many
  short tasks. A 68 ms task is the same work waiting for a CPU. Nothing to fix in the app.
- **Fix (check)**: the same load-aware step() as chatwindow86 (`BC_TRACECATS` / `BC_DUMP`).
- **Proof**: ✓ 4 of 4 runs (2 calm, 2 under an 8-thread burn), every step "ok" on CPU.

### unit:synclatency77-test "first" (4.0 s vs 2 s): load-aware, cause of the 4.0 s not reproduced
- **Measured**: delivered → window told ("engineDown") is 316–328 ms alone. Of that, 29 ms is the process's own CPU.
  The rest is the designed waits (the arrival's settle time, the debounce).
  - Under a 16-thread burn (load 17): 446–1,316 ms.
  - Under a 24-thread burn: 442–608 ms. In each case the extra wall time matched the main thread's measured wait for a
    CPU, for example 564 ms with a 287 ms wait.
  - The 4.0 s itself did not come back in 13 runs under load, so its exact cause is not proven. Nothing in the
    numbers points at the app.
- **Fix (test)**:
  - New `dev/loadwait.js`. `snap()` / `waited()` give the main thread's run delay plus the largest of the process's
    other threads (libuv's pool), the box's IO pressure "full" (every task stalled on IO at once) and the CPU spent.
    `judge()` returns over / load / ok.
  - `dev/synclatency77.js` takes a snapshot at the save, when it reaches the sender's cloud folder, when it lands in
    the receiver's cloud folder (inside the simulator's log callback) and when the window is told. Each result
    carries `upWait` / `downWait`.
  - `dev/synclatency77-test.js` judges "first", and the live part's "under 2 s" (and 3 s for pictures), with
    `within()`. Over budget only by what the process waited for is `CAN'T TELL …`; over by more fails. The summary
    counts the can't-tells. Off Linux: wall time as before.
- **Proof**: `unit:synclatency77-test` ✓ 38/38 under a 6-thread burn. "first" under load: engineDown 442–608 ms,
  cpuWait 139–287 ms. If a 4 s delivery recurs and the waits don't explain it, the test fails with the waits in its
  detail. That would be a real lead, not noise.

### sync72: the AI setup drawer over the sync panel (a real interaction bug, fixed in the app)
- **Cause, shown step by step**:
  1. Turning sync on with "the other computer" in the cloud folder queues the one-time **"Welcome to this computer"**
     note (`twocomputers.js welcome`, through the hints queue). It sits at `left: 64px; bottom: 16px; z-index: 900`.
  2. The check waited a fixed 1.5 s for it. On a busy box the note came later, after the sync panel had opened.
  3. The hints queue holds notes while a dialog, menu or AI setup is open (`hints.js OPEN`). The sync panel is a
     `role=dialog` div, not a `<dialog>`, so it didn't count. The note came up over the open panel.
  4. Probe: with the note up, the element at the centre of the panel's **Sync now** button is the note's **"Check
     Claude"** button (panel 79–499 × 648–889, note 64–444 × 696–924).
  5. A click on Sync now ran `AiCheck.openAndRun`. That opened ⋯ AI setup ("Claude Code isn't installed": no engine
     on the test box) over the panel, and every later click failed. That is the 3-in-a-row failure.
- **For a real user**: the same thing happens the first time a second computer syncs if the sync panel is open when
  the note comes. **The note should never cover an open panel**: a click meant for "Sync now" opened AI setup.
- **Fix (app)**: `hints.js` adds `.sync-panel` to what holds the queue. Notes that come by themselves (the welcome,
  update notes, tips) wait until the panel closes, as they already do for dialogs and AI setup. Essential notes
  (errors and the like) don't go through this queue and are unaffected. hints.js is on the first screen: about 250 bytes more (mostly the comment),
  first screen 1741 KB of 1751.
- **Fix (check, deterministic)**:
  - It waits for the welcome note itself (store `two.welcomed` set and `.two-welcome` on screen, ≤ 10 s), not a
    fixed 1.5 s, and closes it with its own Got it.
  - New step: with the panel open, `Hints.busy()` must be "dialog". The box's own long tasks (`Jank.busy`) are set
    aside, so only the panel can hold the queue.
  - New last step: no click was covered (J.click's `misses`).
  - The temp cloud folder goes into the run's own scratch folder (`SMOKE_TMP`, removed after the run). Before, each run
    left a `/tmp/hearth-sync72-<time>` folder: 171 were there.
- **Proof**:
  - ✓ 5 of 5 under an 8-thread burn.
  - With the old `hints.js` put back, the new step fails ("while the panel is open, notes … wait · ''").
  - hintcalm ✓, twocomputers ✓.

### labstartfast "songOpen" (from the coordinator; fails on base eaa49bc): a stale check
- **What fails**: "songOpen: the preview changed size 1× after it was laid out". With `lsf.log`, base shows the
  preview frame going 688 px (173 ms) → 473 (243 ms) → 485 (319 ms), while the scene's first layer run comes at 913 ms.
  The media bar grows from 78 px (empty) to 281 px (the song's timeline and overview).
- **Cause**: round 86 (projopen86, 6530a90) made the Lab's first start paint a frame before it opens the scene. The
  check's ResizeObserver now sees the frame from that empty painted frame on. Every size change it counts happens
  **before the scene has run**, so there is no canvas to resize. Round 48's rule was "a song coming in mustn't resize
  the scene's canvases": a song decoded half a second into the first run.
- **Tried in the app and dropped**: making the media bar take its full height before that painted frame
  (`player.reserve()`). The bar's loading states then went 303 → 293 → 281 px (the "analyzing %" name wraps the main
  row; the timeline grows with the scene's tracks; the overview row flips during the load's kvGet gap): 2 changes
  instead of 1, still all before the scene ran. Reverted. The real cost is nil.
- **Fix (check only)**: `lateResizes()` counts only the size changes after the scene's first layer run. A song arriving
  after the scene runs, round 48's regression, still fails. With no layer run, it counts from the first size, as before.
- **Proof**: ✓ 2 of 2 (285 / 288 s), every part's other budgets met (songOpen cpuAtReady 83–87 ms of 150).
- Note: tools/three*.js were free (labsync88 finished). The reverted attempt touched them; the final change doesn't.

## 3. The default check list (`node dev/run-checks.js`, no args = the `qa` group, 6 checks, 2 runs under the lock)

| check | result |
|---|---|
| qa-commands | ✓ 14 s |
| qa-keys | ✓ 177 s (skipped: Board · Arrows (Shift = ×10): the check's own "skipped" part, as before) |
| qa-mac | ✓ 12 s |
| polish | ✓ 18 s |
| lazy | ✓ 22 s |
| fastboot | ✓ 15 s |

6/6. Unit scans: datasafe-scan, winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan, chatwin-scan, boot-test
(first screen 1741 / 1751 KB, 68 scripts) and lazymanifest-test: 8/8 ✓. Also run: adaptive-feedback ✓, chatsafe55 ✓,
hintcalm ✓, twocomputers ✓, chatwindow86 ✓ ×5, bigchat84 ✓ ×4, sync72 ✓ ×5, labstartfast ✓ ×2,
unit:synclatency77-test ✓.

## What's left

- **appcalm** (not in the default list; seen in a side batch) fails "Ctrl/⌘+K finds 'playground'". It expects
  /Creative Playground/. The tool was renamed **Creative board** in Codex's 1b0e907 (`tools/creative-playground.js`,
  `offRail`), and searching "playground" no longer finds it. That is the creative area (stay-off for this stream), so
  it is reported, not changed. The fix is either a "playground" keyword on the tool, or the check expecting the new
  name.
- synclatency77's 4.0 s: the cause was not reproduced (see above). The test now tells load from a slow app, so a recurrence
  will say which.
- Main-process blocks (the lag probe's ≥ 100 ms) are still judged by wall time. The probe has no CPU split per block.
  Adding one is a lag-probe change for another round.
- Other streams' `/tmp/hearth-sync72-*` folders from before this round were left alone. They can't be told apart from
  mine, and they're tiny. New runs leave none.

## For Codex
No Codex-owned file was changed.

## For the patch notes
- **Behind the scenes**: the timing checks now tell a slow app from a busy computer. When the computer is too busy to
  judge, they say so instead of failing. One check was brought up to date with the test video it is given.
- **Fixed**: the "Welcome to this computer" note no longer pops up over the open sync panel, where a click meant for
  "Sync now" could open AI setup instead. Notes now wait until the panel closes.
- **Smoother**: a very long chat opened read-only (its AI missing or turned off) opens at its end without stutter. It
  no longer lays out the messages that end up off screen.
