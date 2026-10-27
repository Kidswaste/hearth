# labdraw74 (round 74): the Lab preview's own cost per frame

Round 72 (labfps72) made ▶ Play's Quality auto and the GPU-reset recovery, but left the Lab preview's per-frame code as
it was. Its stress scene showed the cost is content (an instanced crowd was 730 of 1033 ms of GPU), and labpace's
"a still scene draws ≈ once a second" step was failing (2.7 draws a second against 2.5). This stream makes the
preview itself cheaper per frame. Scenes look the same: every saving here is exact (pixels compared in the check).

Nothing is added to any prompt (0 tokens). No new button, setting or menu. Mac and Windows run the same code.

## What was found
| Suspect | Found | Done |
|---|---|---|
| A still scene draws 2.7 times a second | Two causes. **(a)** The still check hashes every number that changes the picture. A missing one (a field another material kind has, a BufferGeometry's `instanceCount`: `undefined` → NaN) was hashed by its bits. V8 hands back NaNs with other bits once it compiles the code differently, so a still scene "changed" every few seconds and drew 3 frames each time. **(b)** Every message, click or pointer move drew 3 frames (the frame plus 2 confirming ones), even when nothing changed. That includes the Lab's own clocks and the checks' evals | fixed (1, 2) |
| The safety redraw (a change the signature can't see) | once a second, forever | 1 s while a change settles (3 s), then every 4 s (3) |
| Shadow maps | lab240gpu already kept the maps when nothing moved. But "nothing moved" meant the whole scene: a camera added to the scene, moving particles or a non-casting crowd redrew every map every frame | only casters and lights count (4) |
| Big instanced crowds | three.js culls an InstancedMesh as one sphere around every copy. Copies behind the camera, and copies outside the sun's shadow box, ran their vertices in the main pass and again in each shadow pass | per-copy culling while frames miss (5) |
| Hidden layers | already free: a hidden layer runs no frames and draws nothing (labcanvas56) | held by the new check |
| Quality auto while a slider moves | a slider drag's slow frames (a rebuilt shape, a new look) counted as "the preview is too slow" | ignored while a slider moves (6) |
| LOD | the Lab can't simplify a shape without changing the look | a hint in the frame bar's Why? (7) |

## The changes (all in `tools/three-sandbox.html` unless named)
1. **NaN-stable signature.** A missing number is hashed as one fixed value (`NAN_AS`). On base 660fb71 the same scene
   gave 3 different signatures for 3 NaN bit patterns (`dev/labpace-test.js` shows it).
2. **Pokes that change nothing draw nothing.**
   - *Soft* pokes only look at the picture at once, and draw only if it changed (an orbit, a hover effect). These are
     the pointer moving, and these messages: `eval`, `live-frame`, `live-gain`, `media-clock`, `loop-clock`,
     `framebar`, `pace`, `fps-cap`, `audio-probe`, `trig-watch`, `look-info`. They count on `PACE.soft`, a second
     counter.
   - *Hard* pokes (any other message, a click, a key, a resize, a setting) still draw. On a settled picture they now
     draw one frame instead of three.
   - The renderer's clear color is now part of the signature, so `renderer.setClearColor` from an eval or a slider
     shows at once.
3. **Safety redraw backs off.** `still()` uses a 1 s refresh for 3 s after the last change (`SETTLE`), then 4 s
   (`REFRESH_LONG`). Dozing keeps its own 4 s.
4. **Shadow maps follow casters and lights.** `signature(…, castOnly)` leaves out objects that cast nothing (their
   transform is kept when they have children), the background, the environment and fog. VSM maps keep the full
   signature, because they draw receivers too. A LOD that casts nothing itself counts as moving.
5. **Big crowds draw the copies a view can see.** This runs on frames where the sketch writes `instanceMatrix` (the
   buffer goes to the GPU that frame anyway) and while frames miss the screen's refresh (plus 2 s after).
   - Each copy's sphere (the shape's sphere, computed once, times the copy's scale) is tested against the camera's
     frustum and every directional / spot shadow box, in the mesh's own space.
   - The copies that can show go first; `count` draws only them. The rest follow, so the GPU's list is still the
     whole crowd: a frame drawn again for a still or a merge shows every copy.
   - The sketch's order and `count` are back right after `render()`, so its code, raycasts and `getMatrixAt` see what
     it wrote. Colours (`instanceColor`) move with their matrices.
   - A render that doesn't sort (a still, a recording, culling off, frames fitting again) first uploads a changed
     crowd whole, in the sketch's order. Matrices never land on another copy's colour.
   - Only plain cases: ≥ 256 copies, `frustumCulled` on, one opaque built-in material (no custom shader,
     `onBeforeCompile`, displacement, morphs, skinning, custom depth material or `onBeforeRender`), no point-light
     shadows.
   - Never in ▶ Play (round 55 rule: no added per-frame work there), exports, stills or recordings.
   - `window.__labDraw.info()` / `.set({ cull, casters })` / `.reset()` for checks.
6. **Quality auto holds while a slider moves.** A `tweak` message holds Quality auto for 1.2 s: no step down from those
   frames. It judges the frames once you let go. `__labAdapt.state()` reports `editing` and `editSkips`.
7. **Frame bar › Why?** (`tools/framebar-core.js`): a crowd of ≥ 1,000 copies × ≥ 100 triangles gets a
   level-of-detail suggestion: fewer segments, or a simpler second InstancedMesh for far copies with no shadow. The
   suggestion can be drafted for the Three Director.
8. **Why it drew**: `__labPace.state().why` counts draws by cause (refresh / poke / change / settle / live / early), and
   `soft` counts soft pokes. This is for checks and the jank report.

## Before → after (this machine: 4 shared CPUs, SwiftShader, load 4–8; base 660fb71 copied aside vs this branch)
| | before | after |
|---|---:|---:|
| labpace: a still scene, pacing on, draws a second | **2.7** (fails ≤ 2.5) | **0.3** (step now ≤ 1) |
| labpace: draw calls a second, the same still scene | 109 | 14 |
| labpace: why it drew, per 3 s window | — | 1 refresh, 0 pokes, 0 changes |
| labdraw74: still scene settled, 6 s with 2 evals | (not run on base) | 2 draws (0.33 / s) |
| a pointer moving over a still scene that changes nothing | a frame per move | 0 frames |
| labdraw74 crowd (2,000 copies, shadowed sun, 480×270): triangles a render | 576,002 | **415,874 (−28 %)**, same pixels (0 bytes differ) |
| labdraw74 crowd: copies drawn | 100 % | 72 % |
| an orbiting camera + moving non-casting particles: shadow-map redraws in 3 s | 43 (every frame) | **2** (the safety refresh) |
| labfps72 stress, steady: GPU ms a frame (timer query) | 960 | 864 ¹ |
| labfps72 stress, steady: GPU-process ms a frame | 1961 | 1638 ¹ |
| labfps72 stress, steady: crowd copies drawn | 100 % | 72 % (16,304 of 22,500 over 15 frames) |
| labfps72 stress, steady: draw calls a frame / renders a frame | 145 / 25 | 146 / 23 |
| labfps72 stress, steady: render work p50 (CPU in render()) | 8.7 ms | 10.2 ms ¹ |
| crowd culling's own CPU (1,500 copies, this loaded machine) | — | ≈ 1 ms a frame, and only while frames miss |
| Quality auto while a slider moves (frames forced slow) | stepped down | held (51 slow frames ignored); stepped down after letting go |
| hidden layer: renders / frames run | 0 / 0 | 0 / 0 (held) |

¹ One before/after pair on a machine at load 4–8. labfps72's own doc measured the same numbers swinging 935–1127 ms
between runs, so the GPU gain on the stress scene is within noise here. The crowd's triangle count (−28 %) and the
copy count (72 %) are the exact measures. The stress scene's World and Crowd layers move every caster every frame,
so their shadow maps have to be redrawn (0 skipped, correctly).

## What only the owner's RTX 4080 / 240 Hz can tell
- **Idle GPU with a still scene on screen**: Task Manager's GPU graph with the Lab showing a still scene should sit
  near idle. Before, it drew ~3 frames a second plus 3 per Lab message. Now it draws about one frame every 4 s.
- **Crowd scenes**: run labfps72 on the PC (`LABFPS72=1 node dev/run-checks.js --exact labfps72`).
  `numbers.labDraw.cull` gives the share of copies drawn, and `gpuTimerMsPerFrame` the GPU's own time. The saving is
  the share of copies off screen (behind the camera, outside the sun's box) times their vertex cost, in both passes.
- **Whether the culling ever turns on at 240 Hz**: it runs only while frames miss the refresh. If his crowd scenes
  already fit 4.2 ms, nothing changes (by design). If they miss, the sorting's CPU cost (≈ 0.2–0.7 µs a copy here,
  much less on his CPU) is paid only then.
- **Shadowed scenes with an orbiting camera** (🎥 camera moves, labgestures orbit): the maps should stop being redrawn
  while only the camera moves. That is a GPU saving of one scene pass per shadow light.
- **Slider drags with Quality auto**: the preview should no longer drop resolution in the middle of a drag.

## Tests
- `dev/checks/labdraw74.js` (new; group `labdraw74`): still scene ≤ 1 draw a second and a slider draws at once; Quality
  auto holds during a slider drag and steps after; a 2,000-copy crowd draws only the copies a view can see (triangles
  on vs off), the sketch's crowd as written after render, and **the culled frame's pixels equal the unculled frame's**
  (the real frame, read in the same task); a hidden layer runs and draws nothing; shown again, it draws; shadow maps
  kept for an orbiting camera with moving non-casters (and redrawn every frame with the old whole-scene signature).
  **Passes.** It failed twice on the way, and both were real bugs: colours mixed up in a frame drawn again (the
  invisible copies weren't put back after the visible ones), then matrices uploaded without their colours on a
  render that didn't sort.
- `dev/checks/labpace.js`: the still step tightened to ≤ 1 a second (was ≤ 2.5). The pointer step now has a hover
  effect, plus a new step: a pointer that changes nothing draws ≤ 1 frame. It reports why it drew. **Passes**
  (failed on base 660fb71: 2.7 a second).
- `dev/checks/labfps72.js` (opt-in): reports `numbers.labDraw` for the steady stretch. **Passes** after; before
  passed too. One run in between failed its context-loss step: no context came back at all, then a new page, under
  load. The next full run rebuilt in place in 9.7 s.
- `dev/labpace-test.js` (unit): soft pokes look without drawing; a hard poke on a settled picture draws once; the
  refresh backs off to 4 s; a NaN with other bits hashes the same (this fails on base); the casters-only signature.
  `dev/framebar-test.js`: the crowd LOD hint. **All pass.**
- Also run on the final code, under the run lock: framebar64, glrecover, lab240edit, labcanvas56, shadowready and
  ctxloss (shadowlab59's checks), labdraw74 and labpace again, lazy, unit:boot-test, unit:labfps72-test: **all
  pass**. labfps72's last full pass ran just before the last change, which only turns crowd culling off while frames
  fit. Here frames never fit, so that run's numbers stand.
- `node --check` / the preview page's four inline scripts extracted and checked; tools/framebar-core.js.

## Edits outside the lane (small, additive)
- `tools/framebar-core.js`: one suggestion (`crowdlod`).
- `dev/run-checks.js`: the `labdraw74` group.
- `dev/checks/labpace.js`, `dev/checks/labfps72.js`: as above.

## Upgrades
1. A still Lab scene draws only when something changes (about once every 4 s instead of ~3 times a second).
2. Pointing at, or moving the mouse over, a still scene no longer redraws it unless something moves.
3. The Lab's own messages and clocks no longer redraw a still scene. A real change still shows on the next frame.
4. A still scene that "changed" every few seconds for no reason (a hashing bug) stays still.
5. `renderer.setClearColor` from the director or a slider shows at once on a still scene.
6. Shadow maps are redrawn only when something that casts a shadow, or a light, moves. An orbiting camera or moving
   particles no longer redraw them.
7. Big instanced crowds draw only the copies the camera or a shadow can see while the preview is struggling. The
   picture is identical.
8. Quality auto doesn't lower the preview's resolution in the middle of a slider drag.
9. The frame bar's Why? suggests a simpler far shape for big detailed crowds (level of detail).
10. A new check (`labdraw74`) that holds all of the above, including a pixel comparison of the culled crowd.

## For the patch notes
- The Lab preview now rests when nothing moves. A still scene used to redraw about three times a second, and three
  more times whenever anything happened in the Lab. Now it redraws about once every four seconds, so your graphics
  card can rest while you think.
- Moving your mouse over a still scene no longer makes it redraw, unless the mouse actually moves something (an
  orbit, a hover effect).
- Fixed a small bug that made still scenes think they had changed every few seconds.
- Shadows are redrawn only when something that casts them, or a light, moves. Turning the camera around a shadowed
  scene costs less.
- Big crowds made of copies (instanced meshes) draw only the copies you can see, or whose shadow you can see, while
  the preview is struggling. The picture stays exactly the same.
- With Quality: auto on, the preview no longer drops its resolution in the middle of a slider drag. It decides once
  you let go.
- In the frame bar, Why? now suggests a lighter far shape for big, detailed crowds.
