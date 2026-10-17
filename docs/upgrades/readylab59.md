# ▶ Play: a second start of a Lab game never warms up longer than the first (round 59, readylab59)

Since round 56, readyspeed's check step "lab: warm ≤ 0.85 × cold + 300 ms (the smooth check's shadow walk aside)" kept
failing on this machine, on the base commit too. The warm runs' warm-up took 6–7 s against 2.5 s cold. A second ▶ Play
of a Lab game (the owner's Clink is one) should never do more warm-up work than the first. This round found why it did
and fixed it.

## The cause
- **It wasn't the remembered skips, the A/B's hold or the shadow size.** The warm-up runs before the smooth check, so
  ctxloss58's hold (`__gmHold`) never delayed it. The remembered shadow size (2048 here) is the size the cold run
  started at as well. The "clean" rule (nothing compiled or uploaded in a pass) was right. The pass really did make things.
- **The warm-up's first pass was never clean on a warm run.** In the base run every warm run's first pass compiled
  10 shaders, linked 5 programs and uploaded 1 texture (`[16, 0, 0]`). The cold run's passes were `[0, 0]`.
- **Why:** the test game (like a real game) shows a pickup 2 s into its own clock: a transmissive, iridescent,
  shadow-casting knot. three's `compile()` makes the pickup's own program, because it walks every mesh, visible or
  not. What showing it adds is only made by a drawn frame: its shadow-depth programs, the transmission target, and the
  scene's programs drawn into that target (no tone mapping, a different variant). A cold ▶ Play is slow to reach the
  warm-up (pictures decoded, the steady wait for the layers), so the pickup was already showing. A warm ▶ Play is fast
  there (files read at once, `rn` reached in 0.1–1 s), so the warm-up started before the game's 2 s mark. The pickup
  then appeared inside the first pass.
- **Knock-on:** that dirty pass meant 3 passes instead of 2. It also reset readyspeed's "first pass clean" count
  (`clean`) to 0 every warm run, so the one short pass (`wq`) was never earned. Every warm run did more warm-up than cold.

## The fix (tools/three-sandbox.html, Lab player)
1. **The prep's first frame draws what the game hides for now.** `ready-prep` already draws 2 frames after compiling
   (readywalk kept them so a first frame's extras land in prep). The first of them now shows every object the game has
   hidden for one draw (`RDY.reveal` → `rdyReveal(scene)`), then puts its visibility back. That draw happens inside the
   draw call, after the game's own update, so the game's state is untouched. Its shadow-depth programs, transmission
   target and the rest are made under the card, as in a cold run.
2. **Bounds:** lights, cameras and any group holding a light stay hidden (a hidden light would change every program's
   light count and compile everything twice). It never applies to a render target or a Hearth helper. At most 500
   objects. Only the draws of that one task: every merged layer drawn in it, then off by itself. A frame labpace skips
   puts the visibility straight back.
3. **Records:** `ready-prepped.revealed` / `result.prep.revealed` (how many were shown). Each warm-up pass in
   `result.warm[i]` now carries its `ms` and its longest frame's `work`, so the next look at warm-up times has them.
4. **Unchanged:** the warm-up rules (two quiet passes; one short pass after two runs whose first pass was clean and
   whose first 5 s were clean; back to the full loop on any dirty pass), the check's threshold, and 0 compiles /
   0 uploads in the first 5 s of play.

## Measured (dev/checks/readyspeed.js, this machine: SwiftShader, 4 CPUs, under `flock /tmp/hearth-run.lock`, load ≈ 3)
Lab scene "Clink", from ▶ Play to the first frame of play. "no A/B" leaves out the smooth check's shadow step, as the
threshold does.

| | base d818e36 (1 run) | readylab59 (4 runs) |
|---|---|---|
| total cold / warm / warm2 | 37.0 / 16.6 / 16.6 s | 31.8–34.0 / 13.1–15.9 / **8.1–9.6 s** |
| no A/B cold / warm / warm2 | 15.8 / 8.8 / 10.8 s | 6.8–9.0 / 5.8–9.6 / **3.3–4.6 s** |
| warm-up passes (compiles + links + uploads per pass) cold / warm / warm2 | [0,0] / **[16,0,0] / [16,0,0]** | [0,0] / [0,0] / **[0]** (one short pass) |
| warm-up time cold / warm / warm2 | 8.6 / 6.7 / 8.3 s | 2.8–5.7 / 2.9–6.9 / **0.9–1.2 s** |
| shaders + textures (prep) cold / warm / warm2 | 1.1 / 0.6 / 0.8 s | 0.9–1.2 / 1.4–1.8 / 1.6–1.8 s (the pickup's 12 compiles moved here) |
| first 5 s of play: compiles / links / uploads | 0 / 0 / 0 | 0 / 0 / 0 (every run) |
| step "lab: warm ≤ 0.85 × cold + 300 ms" | passed here (the best warm 8.8 ≤ 13.7); 3 of 4 runs failed in ctxloss58 | **4 of 4 pass** (best warm 3.3–4.6 s against limits 6.1–7.9 s) |

The first warm run now does exactly the cold run's warm-up work (2 clean passes of 5 frames). From the second warm run
on it does one 3-frame pass. Each pass's time still varies 0.9–3.5 s **for the same pass of the same scene** (cold pass 2:
0.96 s in one run, 3.35 s in another; frame CPU work 1.4–3 ms throughout). That is this machine's software GPU under
other agents' load, not a difference in work. It is also why the first warm run's 2 passes sometimes take longer than the
cold run's 2. The threshold was not loosened: the step passes on the warm2 run, which does less than half the cold run's
warm-up. HTML builds: unchanged path, 4 of 4 pass (warm 1.2–1.5 s against limits 1.8–2.3 s).

## Tests
- Under the run lock (≤ 5 per hold): readyspeed ×4 pass (fix1, rs1–rs3 above), gameready ×2 pass, shadowready pass,
  ctxloss pass (`--burn 3`: 0 GPU exits / losses, 0 / 0 in every first 5 s), playbudget pass, lazy pass,
  unit:boot-test pass.
- unit:readyspeed-test (10 groups) pass. `node --check` on tools/gameready-page.js, the check (wrapped) and the
  sandbox's inline scripts.

## Edits outside the stream's own files
- `tools/three-sandbox.html` (small, additive): `RDY.reveal` / `RDY.revealed`, `rdyReveal()`, one line in the render
  wrapper before `paceSkip` (+ the restore in its `finally` and in the skip path), `ready-prep` arms it for its first
  frame and reports `revealed`.
- `tools/gameready-page.js`: `result.prep.revealed`; each warm-up pass's `ms` / `work`.
- `dev/checks/readyspeed.js`: reports `prep` (revealed, gl) per run. `tools/game-api.md`: one paragraph.
- **Not touched:** `gamelook-preload.js` and `tools/playbudget-page.js` (shadowlab59's files this round).

## Risks
- **A game that hides something on purpose and checks its visibility in a callback that runs inside its draw** (an
  `onBeforeRender` that reads `visible`) would see it shown for one frame under the card. Visibility is restored
  right after that draw. Nothing of it is on screen: the card covers the page.
- **More compiled under the card on a first ▶ Play** when a game keeps many hidden meshes (e.g. alternative models):
  their shadow / transmission variants are made in prep. Capped at 500 objects; their main programs were already compiled
  before (three's compile walks every mesh).
- **Not covered:** objects a game *creates* later (not just hides). Those still show up as a dirty warm-up pass, and the
  full loop handles them as before. HTML builds don't get the reveal (their warm-up already passes; their frames are
  the game's own, held by getting ready).

## For the patch notes
- **▶ Play: the second start of a Lab game no longer warms up longer than the first.** Things your game shows a moment
  after it starts (a pickup, an effect) are now prepared while "Getting ready" shows, also on a quick second start.
- From the third start on, the warm-up is one short pass: on the test game it went from 6.7–8.3 s to about 1 s on this
  slow test machine (a few frames on a real graphics card).
- Still true every time: nothing left to compile or upload in the first seconds of play, and your game's files are
  only read.
