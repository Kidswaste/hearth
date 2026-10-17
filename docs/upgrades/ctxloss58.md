# ▶ Play: the graphics card no longer goes away while "Getting ready" shows (round 58, ctxloss58)

Round 57 (readywalk) found that on a busy computer the GPU took WebGL contexts back while ▶ Play's "Getting ready" card
showed, mostly during playbudget's A/B (the smooth check and the Best look's shadow-size walk). readywalk made the card
wait out the rebuild (up to 30 s), but the loss itself still cost the owner that time, and a real machine with a heavy
scene could hit it too (the GPU watchdog / TDR on Windows, Metal on a Mac). This round found the cause and removed it.

## The cause
- **Not too many contexts.** A Lab scene's ▶ Play page makes 1 WebGL context (the one canvas) and has 1 alive the whole
  time (Chromium's limit is 16). Nothing else in the game window makes contexts.
- **Not memory.** At most two shadow sizes are kept (the chosen one and its fallback); the rest are let go under the card.
- **Chromium's GPU watchdog took the whole GPU process down.** Under load (3 CPU burners on this 4-CPU machine, a
  software GPU), the A/B's very first synced frame took 10–16 s. Electron's log at that moment: `GPU state invalid after
  WaitForGetOffsetInRange` (the page waiting in readPixels) then `GPU process exited unexpectedly: exit_code=512`
  (exit status 2: Chromium's "hung" code), so every context in every window was lost.
- **Why that one frame was so long:** a Lab scene's own frames keep running behind the card and queue GPU work faster
  than a slow GPU finishes it (here up to ~16 s of it). The A/B's first readPixels waited for that whole backlog in one
  GPU-process task. The A/B's yields between blocks let more of the game's frames in, so each block's first frame
  waited on a smaller backlog too. A frame with new state (a shadow size, the fallback's maps) also took 4–20 s on its own.

## The fix (tools/playbudget-page.js, tools/three-sandbox.html)
1. **The game's own frames are held while the A/B draws** (a Lab scene's one-canvas loop: `__gmHold`; an HTML build's
   frames were already held by getting ready). Layers with their own canvas wait too. They go on as soon as the A/B is done (after 2 minutes at most).
2. **Uncounted frames are waited for with a fence**, polled between tasks, never with readPixels: the first frame, each
   block's first frame, each shadow size's first frame, the fallback's frame and the frame back to the chosen size. The
   GPU process never sits in one task for them. Any backlog left from before the A/B is waited out this way too.
3. **Counted frames are unchanged** (readPixels, exact, each waiting only for its own frame now), so the A/B's verdicts
   (helpers' cost, the shadow size) are measured the same way. A block's counted frames stop after 5 s (at least 2):
   only a software GPU under load ever reaches that.
4. **A frame drawn on a lost context measures nothing.** Before, after a loss the walk read "2048: 0.01 ms, fits" and
   remembered it. Now that frame is NaN (no size is chosen on it), and a loss during the first frames ends the A/B
   (`skipped: 'the graphics card went away'`).
5. Kept: 0 compiles / 0 uploads in the first 5 s of play, shadowready's "nothing made while playing", playbudget's rules.

## Measured
`dev/checks/ctxloss.js` (new, group `ctxloss`): `node dev/smoke.js --burn 3 …` (3 busy CPU processes for the run, inside
the shared run lock). It plays the readyspeed "Clink" Lab scene 3 times (cold: the walk, then the remembered size checked)
and the HTML build twice. It counts GPU process exits (main side, with reason and exit code), page context losses,
contexts made / alive, readywalk's rebuild waits under the card, and the A/B's synced frames (count, longest, frames over
1 s by phase). It asserts 0 of each, and 0 compiles / uploads in the first 5 s of every play.

Runs of the check (each: 3 Lab plays + 2 HTML plays), base = c632c90 with only the new counters / harness:

| | before (base) | after |
|---|---|---|
| under load (`--burn 3`): runs with a GPU process exit | **2 of 3** (each in the cold Lab play's A/B: `abnormal-exit`, exit status 2; then a 7–8 s rebuild under the card, once 10 compiles in play's first 5 s) | **0 of 6** with the hold (22 plays), 0 of 2 with the final code (10 plays) |
| context losses / rebuild waits under the card | 3 counted per exit (exit, page loss, gpuBack) | 0 |
| without load | 0 of 2 | 0 of 1 |
| the A/B's longest readPixels wait (load) | 10–16 s (its first frame: the backlog) | counted frames ~1.0–1.4 s (worst seen 9.8 s, no exit); the backlog (up to 16 s) is fence-waited |
| contexts made / alive in the game page | 1 / 1 | 1 / 1 |
| A/B time, no load, Lab cold / warm / warm | 33.6 / 7.8 / 10.6 s | 26.5 / 4.2 / 6.5 s |
| A/B time, load, Lab cold / warm / warm | 55.2 / 12.6 / 8.7 s (the run without an exit) | 49.0 / 5.6 / 8.1 s and 87.4 / 28.0 / 19.7 s |

Without load the A/B never lost a context in either version. The A/B's time on this machine under load is about the same
or longer: the backlog that used to sit inside the first readPixels is now waited for explicitly (a fence before the
first frame). On a real card the backlog and the frames are a few ms.

## Tests
- `dev/checks/ctxloss.js` under `--burn 3` (see the table above): the final code passed 2 of 2 runs (10 plays, 0 losses).
  Without load: pass.
- Run under the run lock: **gameready** failed 2 of 2 with the first version, which held only the merged layers. Its
  3-layer scene (a model layer with its own canvas) lost a context under the card. Holding every layer's frames fixed it:
  2 of 2 pass. **shadowready** 2 of 2 pass. **gamelook**, **glrecover** and **lazy** pass. **playbudget** passed on its
  re-run; the first run failed one timing step ("at off speed": 0.59 vs 0.47 ms of work a frame, the look remembered off).
  **unit:** boot-test, playbudget-test, readyspeed-test, shadowready-test and glrecover-test pass.
- **readyspeed**: 1 of 4 runs pass. The other 3 fail only "lab: warm ≤ 0.85 × cold + 300 ms (the A/B aside)": the warm
  runs' warm-up passes take 6–7 s against 2.5 s cold. The base commit (c632c90), run at the same time, failed the same
  step in 2 of 2 runs, so this is timing on this machine, not this change. Every run had 0 compiles / 0 uploads in the
  first 5 s, no GPU loss, and its warm runs reused the verdict.

## Edits outside the stream's own files
`tools/playbudget-page.js` (the A/B), `tools/three-sandbox.html` (`__gmHold`; `__glRecover.state()` adds `made`, `none`),
`tools/gameready-page.js` (the A/B's new fields into `result.ab`), `glrecovermain.js` (`gone` in `glrecover:state`),
`dev/smoke.js` (`--burn N`, `SMOKE_STDERR=<file>` keeps Electron's own output, `window.SMOKE_BURN`), `dev/run-checks.js`
(the group, `--burn` passed through), `tools/game-api.md`.

## Risks
- **Held frames:** the game's own frames stop under the card while the A/B draws (seconds here, well under a second on a
  real card). Merged layers and layers with their own canvas are held (both through the page's frame scheduler); a
  sketch drawing from its own timer outside it is not.
- **Fence waits poll every few ms**, so an uncounted frame costs a little more wall time than a readPixels. It is never counted.
- **The 5 s block bound** only applies on very slow GPUs: fewer frames in a block there means a noisier median.
- The watchdog's exact limit is Chromium's own (here a 15.5 s wait was killed and a 13 s one wasn't). The fix keeps our
  waits short instead of relying on it.
- Seen, not changed: SwiftShader logs `GL_INVALID_OPERATION: Mismatch between texture format and sampler type (shadow)`
  20–30 times per run (before and after this change). It doesn't lose contexts. It probably comes from a shadow sampler
  meeting a map that isn't there yet when the look swaps sizes. Worth a look by the look's owners.
- readyspeed's "warm ≤ 0.85 × cold" timing step fails on this machine with or without this change (see Tests). Its
  warm-up passes on warm runs are worth a look next round.
- Seen, not changed: a Lab scene's shadow fallback reads `fallbackReady: false` after the A/B on this machine (base too),
  while an HTML build's is ready. shadowready's guard then keeps the size rather than making maps mid-play.

## For the patch notes
- **▶ Play no longer loses the graphics card while "Getting ready" shows.** On a busy computer, the quick smoothness check
  under the card could wait so long on the graphics card that the system restarted it, and the game was set up again. Now
  the check pauses the game behind the card while it measures, and it never makes the graphics card wait on a long frame.
- The check's results (Hearth's helpers, the shadow size) are measured exactly as before.
- If the graphics card does go away anyway, the check no longer remembers a shadow size measured on nothing.
