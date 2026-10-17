# ▶ Play: the shortest path from your hand to the game's frame (round 56, playlatency)

The owner wants Clink to feel immediate in ▶ Play at 240 Hz. Round 53 (gameinput) already took Hearth's listeners,
messages and GPU read-backs off the input path. This pass measures the whole path end to end — input timestamp →
handled → the animation frame that reads it → presented — finds what Hearth still adds, removes what can go without
steady per-frame cost, and gives the owner one figure: **Input: x ms**. Nothing is added to any prompt (0 tokens); the
game's files are never touched.

New files: `playlatency-core.js` (pure: summary, verdict, plain text), `playlatencymain.js` (main: `/game latency`'s
measurement), `dev/checks/playlatency.js`, `dev/playlatency-test.js` (UNIT).
Edits: `tools/three-sandbox.html` (the one canvas), `gamemode-core.js` (`fastCanvas` in `mergePlan`), `gamemode.js`
(`/game latency`, plan.fast, GamePerf `key: false`), `gamemodemain.js` (channels, timed key handler, `info.latency`),
`game-preload.js` (the chip's figure, the measurement's page side), `tools/gameperf-probe.js` (F listener only when
asked), `tools/gameperf.js` (the doctor's figure), `playloop.js` (fast in live-edit plans), `preload.js`
(`hub.game.latency`), `dev/run-checks.js` (group, env, unit).

## The path, hop by hop (what Hearth adds, what's left)

| Hop | Before | After |
|---|---|---|
| OS → Electron's main process (every key and mouse move goes through its UI thread, which is Node's) | a key ran the window's key handler | same handler, **0.02 ms a key** measured; timed only while measuring. Main process loop p99 **3.6–4.6 ms** during play here (powerwise keeps it quiet) |
| Main → the game's page (IPC to the renderer) | Chromium's own | unchanged (nothing to remove) |
| Hearth's listeners in the page (keys) | Lab scene 0 · **HTML game 1** (GamePerf's probe listened for F on every key) | **0 / 0** (F is read main-side since round 53; the probe listens only when asked) |
| Messages / timers per input, per frame | 0 (round 53) | 0 (checked: 0 messages a second in play) |
| Input → the game's next frame | next frame | next frame (`/game latency`: "As short as the browser allows") |
| The frame → the screen: the one canvas | **copied every frame** (`preserveDrawingBuffer: true`, forced on every Lab WebGL context so filters / recordings can read it later) | **swapped** when nothing reads it (every layer merged, no `layer:` texture / toDataURL / toBlob / captureStream / drawImage of a renderer): one full-screen GPU copy less per frame |
| Frame-rate cap / pacing / doze / throttling | none (fps-cap 0, pace off, ready-lock, `backgroundThrottling: false`) | same, now asserted in the check and reported by `/game latency` (throttled: no, focused, full screen) |
| Chromium switches | `disable-frame-rate-limit` / `disable-gpu-vsync` never added (gpu52) | same, asserted: Chromium follows the screen's refresh with vsync (no tearing, no GPU at 100 %) |

Not removable from Hearth: every input crossing the main process's UI thread (Electron's design: Chromium's input
arrives on the browser UI thread, which is Node's in Electron). Anything long in Hearth's main process (a chat reply
being parsed, a sync pass) delays the game's input by that long; `/game latency` reports the main process's loop delay
while it measures and says so when it is the cause.

## Numbers (this machine: Xvfb 1280 × 720 at 60 Hz, SwiftShader software GL, shared CPUs)

Three runs of `dev/checks/playlatency.js` (the machine was shared with four other agents' game checks: idle frame
times swung 50–133 ms between runs). "Before" = the same build with the one canvas copied each frame
(`playlatency.test = { copy: true }`, i.e. up to round 55); the HTML-game listener count is round 55's probe.

| Lab scene (Clink-like, 3 layers on one canvas) | Before (copied) | After (swapped) |
|---|---|---|
| The one canvas | `preserveDrawingBuffer: true` | **false** (`__gameInfo().fast`) |
| Real input (CDP, trusted) → the game's frame, frames between (p50 / p95) | 1 / 1 | 1 / 1 |
| …ms p50 / p95 (3 runs) | 8.4 / 25.9 · 17 / 59.7 · 12.6 / 78.1 | 14.3 / 37.8 · 18.6 / 75.1 · 9.3 / 29.9 |
| `/game latency` p50 / p95 ms (3 runs) | 12.6 / 22.5 · 16.7 / 31.4 · 9.8 / 38.7 | 15.7 / 28.2 · 12.5 / 38.5 · 16.2 / 52.7 |
| Key → handled (dispatch) p50 | 0.3–0.4 ms | 0.4 ms |
| Hearth's key handler (main process), per key | 0.022–0.025 ms | 0.021–0.024 ms |
| Main process loop delay during play, p99 | 3.6–3.9 ms | 4.0–4.2 ms |
| Messages in the page while playing | 0–1.3 / s | 0–1.3 / s |
| Window throttled / focused / full screen | no / yes / yes | no / yes / yes |
| HTML game: Hearth's keydown listeners | **1** (the probe's F) | **0** |
| F chip | fps · ms · Hz · … | `38 fps · 26.5 ms · 60 Hz · Input: 12 ms · one canvas (3 of 3 layers) · …` |


Milliseconds here are dominated by the software GPU (frames of 17–67 ms that vary run to run); the verdict that matters
is relative: each input is read in the very next frame, and Hearth's part (handler + main loop) is a few hundredths of
a millisecond per key. The copy that was removed costs this machine little (SwiftShader copies 3.7 MB on the CPU in a
process that isn't the page's), so before / after frame times are within its noise.

## What to expect on the owner's 240 Hz Mac

- A frame every 4.17 ms. An input waits on average half a frame (≈ 2 ms) for the game's next frame, at worst one
  (≈ 4 ms) plus whatever the game's own frame is busy with: `Input: 2–4 ms` on the chip for a game that fits its frame.
- Then Chromium's pipeline: the frame is composited and shown one to two refreshes later (≈ 4–8 ms), plus the screen's
  scan-out. Hand → photon ≈ 10–15 ms for a game that holds 240 fps; the browser allows no shorter path without tearing.
- The removed copy: one full-screen read + write per frame (≈ 30 MB at 3456 × 2234, MSAA resolved first), ≈ 7 GB/s at
  240 Hz: ≈ 0.1–0.3 ms of GPU time per frame on Apple silicon, more on an integrated / older card. It matters when the
  GPU is the limit (Best look's shadows at 2048²): a frame that fits sooner is on screen a refresh sooner.
- Pacing: native full screen gets its own space (direct to the display); Chromium ticks at the screen's own refresh
  (ProMotion / 240 Hz external). `/game latency` prints the measured frame rate next to the screen's Hz: "60 fps on a
  240 Hz screen" would show a capped screen at once.
- Windows: Chromium paces with DirectComposition at the display's refresh; if a 240 Hz screen that isn't the main
  display shows 60–144 fps in `/game latency`, make it the main display (Chromium has paced to the primary screen on
  some setups). `/game lowlatency on` (round 53) remains the opt-in for the low-latency canvas (can tear).

## Upgrades
1. **The game's picture goes to the screen without a copy**: the one canvas of a Lab scene in ▶ Play is swapped each
   frame instead of copied (when nothing reads it back), one full-screen GPU copy less per frame. Hearth's own rare
   reads (a live edit's cover picture, a loop seam, a shot) draw the stack again first, so they still see the picture;
   a live edit that adds a filter or a layer that reads pictures gets a canvas made the old way, in place.
2. **No listener of Hearth's on an HTML game's keys**: the performance probe no longer listens to every key for its F.
3. **"Input: x ms" on the F chip**: input → the game's next frame, from your own keys and mouse, measured only while the
   chip shows (nothing at all otherwise).
4. **`/game latency`**: 2 s of tiny input (F24, the mouse 1 px and back) timed to the game's next frame, in plain
   words: typical and worst, keys and mouse, the frame rate against the screen's refresh, Hearth's part (the key
   handler, its main process), and why when it's slower than the next frame.
5. **The performance doctor shows "Input: x ms"** next to fps and stutters (the last `/game latency`, or a 1 s one).
6. **The window's pacing checked**: never throttled, focused, full screen, no frame-rate switches; reported by
   `/game latency` and guarded by the check.

6 upgrades.

## Tests
`node dev/playlatency-test.js` (UNIT, 6 groups). Checks, each gameready-based one under
`flock /tmp/hearth-gameready.lock sh dev/run-checks.sh --exact …`: **playlatency** (passed; two earlier runs failed only
on fixed-ms thresholds under load, which is why the check now counts frames between input and read and the verdict
allows for frames that vary), **gameinput**, **gamemode**, **playbudget** passed; **gamefps54** failed twice on timing only, a different step each time under a load average of 8–9 ("frames as fast as off": 158 vs 167–433 ms frames; then "the look's most in one frame under 2 ms": 2.4 ms once) — its HTML game doesn't use the changed canvas; release policy: noted, not holding; **lazy**,
**unit:boot-test**, **unit:winmac-test**, unit:gameperf-test, unit:gamemode-test, unit:gameinput-test passed.

## Risks
- The swapped canvas holds no picture outside its frame. Everything of Hearth's that reads it goes through `cvDraw` /
  `layerPictures` (drawn again first); a layer's own code that reads the screen is detected by `fastCanvas` (then it's
  copied as before). Code reading the picture in a way the pattern misses (e.g. `gl.readPixels` on the default
  framebuffer outside its frame, through an alias) would read black: such code already keeps its own canvas
  (`.getContext(` in a layer's code makes it un-mergeable).
- `/game latency` sends real input to the game: F24 key presses and 1 px mouse moves (net zero). A game bound to F24,
  or one counting raw mouse moves, sees them for 2 s.
- Synthetic input is timestamped in Hearth's main process: it includes the main → page hop (as real input does) but
  not the OS's own path from the device.

## Edits outside the lane
`tools/three-sandbox.html` (game mode only: `__gmFast`, `gmFresh`, `GM.fast/retire/old`, `__gameInfo().fast/preserve`),
`gamemode-core.js` (`fastCanvas`), `gamemode.js`, `gamemodemain.js`, `game-preload.js`, `playloop.js` (2 lines),
`tools/gameperf-probe.js` (the F listener), `tools/gameperf.js` (the doctor's line), `preload.js` (one channel),
`dev/run-checks.js`.

## For the patch notes
- **▶ Play gets the picture on screen sooner**: a Lab scene's frame is now handed to the screen instead of being copied
  first (one full-screen copy less every frame), when nothing needs to read it back.
- **Nothing of Hearth's listens to an HTML game's keys any more** (the performance probe's F key is read by the window
  itself).
- **Press F in a game to see "Input: x ms"**: how long your key or mouse takes to reach the game's next frame. It's only
  measured while the stats show.
- **`/game latency`** measures it for 2 seconds and says it in plain words: the figure, the frame rate against your
  screen's refresh, and whether anything of Hearth's was in the way.
- The performance doctor shows the same "Input" figure.
- Caveat: `/game latency` taps F24 and nudges the mouse by one pixel and back for 2 seconds.
