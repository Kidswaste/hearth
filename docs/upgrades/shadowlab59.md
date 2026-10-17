# ▶ Play: a Lab scene's Best-look shadows made right under the card, and no dropped draws (round 59, shadowlab59)

Two shadow issues in ▶ Play's Best look, both only on **Lab scenes** (an HTML build was fine), both with one cause.

## What was wrong
1. **The fallback shadow maps weren't made.** After getting ready, a Lab scene's shadow fallback read `fallbackReady:
   false` (seen by ctxloss58, base too). The guard then can't step the shadows down while playing without making new
   maps, so it kept them as they were.
2. **A frame drew with no shadow map.** SwiftShader logged `GL_INVALID_OPERATION: glDrawElements: Mismatch between
   texture format and sampler type (signed/unsigned/float/shadow)` 11 times per warm Lab play (20–30 a run): every
   draw that receives the shadow, in one frame under the card, was dropped. On a real card: a flicker or a black frame.

## The cause
- A Lab scene's page skips three.js's shadow pass on frames where nothing in the scene moved (round 50's shadow gate,
  `shGate` in tools/three-sandbox.html). It decides once per frame tick: a second draw in the same tick reuses that
  decision.
- playbudget's A/B under the card holds the game's frames (ctxloss58's `__gmHold`) and draws its own back to back in
  one task, so all of them share one tick, and the held scene is still. The gate said "no change" and three skipped
  the shadow pass for all of them.
- So the Best look's swapped-in sizes were timed without their shadows (a warm run "measured" 1024² at 20.7 ms and
  512² at 6.2 ms and kept 512), and the fallback size's frame never drew its maps: `fallbackReady: false`.
- That frame then drew with the light's map missing. three r186 binds an empty stand-in for a missing shadow map, but
  its `emptyShadowTexture` is never uploaded, so the stand-in is three's RGBA placeholder. A `sampler2DShadow` (PCF
  shadows) reading an RGBA texture is GL_INVALID_OPERATION, and the draw is dropped. (Each warm play: one frame × 11
  draws = the 11 log lines; it was the warm plays, where the remembered size is only checked, so the fallback's frame
  came right after the check's frames in the same task.)

## The fix
1. **tools/three-sandbox.html:** the Lab's shadow gate steps aside while the A/B holds the page (`GM.held`). Every A/B
   frame draws its shadow maps, as a moving game's frame does. Sizes are timed with their shadows, and the chosen and
   fallback maps are made under the card, as on an HTML build.
2. **gamelook-preload.js:** whenever the look swaps a size in (under the card, or the guard's one swap in play), it asks
   the renderer for one shadow pass (`renderer.shadowMap.needsUpdate = true`; three clears it after the pass). A page
   that skips passes can't sample a missing map or show a map drawn back when it was made. Pages that draw their maps
   every frame see no difference. This adds no per-frame work and makes no new texture: the maps already exist or are
   made under the card.
3. **tools/playbudget-page.js:** WebGL's error flags are read at the A/B's start and end, under the card only (a few
   `getError` calls, never while playing): `ab.glErrors = { before, during, codes }`. getting ready's result carries it.

## Measured (this container: SwiftShader, 60 Hz)
The ctxloss "Clink" Lab scene, played 3 times (cold, then warm twice), Electron's log scanned, no CPU load:

| | before (d818e36) | after |
|---|---|---|
| `fallbackReady` (cold / warm / warm) | true / **false** / **false** | true / true / true |
| A/B's GL error flags (cold / warm / warm) | 0 / **1282** / **1282** (INVALID_OPERATION) | 0 / 0 / 0 |
| "Mismatch … sampler type (shadow)" lines in Electron's log | **22** (11 per warm play; 11 in an earlier 2-play run) | **0** |
| getError after play (every context) | 0 | 0 |
| compiles / uploads in the first 5 s · maps made while playing | 0 / 0 · 0 | 0 / 0 · 0 |

shadowready's new Lab scene (a spot shadow that costs 2 frames at 2048², nothing at 1024²) before → after: the warm
run picked 512 from a frame timed without its shadow pass (fallback none) → both runs chose 1024 (fits) with 512 made
and sealed, 0 GL errors, nothing made after the first frame (2 of 2 runs).

## Checks
- `dev/checks/shadowready.js`: every play (HTML first / again, Lab cold / warm) asserts **no GL error**: `ab.glErrors.during
  === 0` under the card and `getError()` = 0 on every context of the page after the play. New **Lab scene** section,
  cold and warm: chosen + fallback made and sealed (`fallbackReady`), nothing made after the first frame, 0 compiles /
  uploads in the first 5 s.
- `dev/checks/ctxloss.js`: every Lab play's fallback sealed (when the size is above 512) and no GL error under the card.
- `dev/shadowready-test.js`: a size swapped in asks for the shadow pass (made or not made before), not when the game's
  shadows are off.

## Tests (each app check under `flock /tmp/hearth-run.lock`, ≤ 5 per hold)
- **shadowready** ×2: pass (HTML first / again and Lab cold / warm: 0 GL errors; Lab chose 1024 with 512 sealed both
  times). The same check on the base fixes failed "Lab scene, warm" (512 chosen from a frame with no shadow pass, no fallback).
- **gamelook** ×2, **gameready**, **playbudget**, **gamefps54**, **lazy**, **unit:boot-test**, **unit:shadowready-test**: pass.
- **ctxloss**: pass, with the new steps. Lab cold / warm / warm and HTML ×2: all `fallbackReady: true`,
  `glErrors.during` 0, 0 losses, 0 compiles / uploads in the first 5 s.
- **readyspeed**: 2 of 2 runs fail only "lab: warm ≤ 0.85 × cold + 300 ms" (6468 / 6479 ms vs a 6383 / 6380 limit,
  ratio 0.90). That step leaves the A/B out (`total − steps.ab`), so this change doesn't enter it. ctxloss58 saw it
  fail on its base commit too (timing on this machine). Every other readyspeed step passes.
- Electron's log for every app check above: 0 "Mismatch between texture format" / 0 GL_INVALID lines.

## Edits outside the stream's own files
`tools/three-sandbox.html` (one condition in `shGate`), `tools/playbudget-page.js` (`glErrors`), `tools/gameready-page.js`
(passes `glErrors` on), `dev/checks/ctxloss.js` (two steps), `tools/game-api.md`.

## Risks
- The Lab's shadow gate is off only while the A/B holds the page (seconds under the card). The A/B's Lab frames now
  pay their shadow pass, so the A/B can take a little longer on a Lab scene. Its timings are now right, though: before,
  a still Lab scene was mostly measured without shadows.
- Asking for a shadow pass on a swap redraws the maps once, even for a game that manages `shadowMap.autoUpdate = false`
  itself. That only happens at the look's own swaps (under the card, and at most twice in play: the guard's try and its
  way back). It is the same pass the game would run for a changed light.
- three r186's `emptyShadowTexture` problem is still there for any other missing map (a light that casts shadows
  before its first shadow pass on a page that skips passes). The look's swaps can no longer cause it; nothing else
  in Hearth's game pages swaps maps.

## For the patch notes
- **▶ Play: Lab scenes now get their shadows fully prepared while "Getting ready" shows**, like HTML builds: the size
  that fits your screen and a smaller backup are both made there. If the game gets heavy later, Hearth can switch to
  the smaller shadows instantly, without a hitch.
- **Fixed a dropped frame in Lab scenes:** one frame while getting ready could draw without its shadows (on some
  graphics cards a flicker or a black frame). It no longer happens.
- The shadow size for a Lab scene is now measured with its shadows actually drawn, so the choice is the right one for
  your screen.
