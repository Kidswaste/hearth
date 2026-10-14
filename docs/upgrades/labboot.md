# labboot (round 37): the Lab opens and switches scenes fast, without a hitch

Goal: clicking the Three.js Lab shows your last scene at once, and switching scenes (recent scenes, the gallery,
templates, a variation applied) is quick, with no black frame and no stall. Nothing works differently; it's only
faster and smoother. Nothing new on screen, no new setting.

Where it lives: new `tools/three-boot.js` (the warm page, in the lab lazy group right after three-data.js); small hooks
in `tools/three.js` (sandboxFrame: take the warm page, `retune()`; run(): swap over the warm run, in-place pixel ratio;
the six kv reads at once; `_lib` export); `tools/three-sandbox.html` (the resolution share from a renderer's first
setPixelRatio, a pooled canvas keeps its pixels, `dpr` message, createImageBitmap for reference pictures);
`tools/three-media.js` (stage layout with the next frame); `tools/three-nodes.js` (no filter scan for plain code).

## What I found (measured first)
- **Opening the Lab** (a press on its rail button, the lab group already in): the preview page was ready after
  ≈ 0.4–0.7 s, then **≈ 2.2 s went by inside the page before the scene's first frame**: the first WebGL context of a
  new page process and the scene's shaders (on a real computer, three.js also comes from the network here). The hub's
  share was small (≈ 0.2 s: the Lab's UI, six kv reads one after the other, two forced layouts).
- **A scene switch spent most of its time resizing canvases.** A CPU profile of one switch inside the preview:
  `WebGLRenderer.setSize` 1,353 ms of 1,543. Each new renderer (a pooled context, already the right size) was resized
  3–4 times: three.js's `setPixelRatio` re-sizes the canvas from its pixel size before the sketch's own setSize, then
  the sketch sized it at full resolution, then its first frame sized it again at the adaptive resolution. Every resize
  of a drawing buffer is a GPU round trip (≈ 0.25 s each on this software GL).
- **A scene with its own frame size** (9:16, 1080×1350…) next to a fit one loaded **a whole new page** on every switch
  between them (the page's pixel ratio was fixed by its URL): three.js, contexts, every shader, and the song attached
  again.
- **Black frames**: none, before or after (the old picture covers the switch until the new one drew: round 21).
- Compile stalls: on a real GPU, shaders already compile in the background behind the old picture
  (KHR_parallel_shader_compile + compileAsync, round 21) and compiled programs are kept per pooled context. This
  machine's software GL has no parallel compile, so a heavy new shader (the PBR template: ≈ 3–10 s here) still holds
  the preview's thread: that part is the GPU's and stays.
- Repeated imports: three.js and its addons are loaded once per page (the module map), the motion / lab3d kits once
  per page; scene switches run in the same page, so nothing library-side is evaluated again.

## Measured (before → after)
`dev/checks/labboot.js` (new), interleaved before (this branch's starting commit, 7d8cb4e) / after, 3 rounds each,
SwiftShader under Xvfb on a shared machine (load 9–17 on 4 CPUs: compare ratios). Four scenes with their own heavy
shader on bright backgrounds; the last one has a 9:16 frame. The Lab had been used once before the measured start,
as every day. Medians.

| What | Before | After |
|---|---:|---:|
| **Press on the Lab → the last scene on screen** | 3,163 ms (3,030–3,577) | **131 ms** (127–264) |
| Press → the Lab's own run drawn (sliders, song, exact values) | 3,163 ms | **925 ms** (841–1,185) |
| Window long tasks while the Lab opens (total) | 79–272 ms | 0–199 ms |
| **Switch to a scene (first visit)** → drawn | 2,731 ms | **1,221 ms** |
| **Switch back to a scene seen before** → drawn | 2,078 ms | **721 ms** |
| **Switch fit ⇄ 9:16 scene** → drawn | 2,930 ms | **1,057 ms** |
| Whole new preview pages in those 7 switches | 3 | **0** (the song keeps playing) |
| One switch inside the preview (CPU profile): setSize | 1,353 ms of 1,543 | **≈ 0** (the canvas isn't resized) |
| Black frames during switches (darkest frame, 0–1) | 0 (0.71–0.83) | 0 (0.70–0.82) |
| New scene from the PBR template (shader compile bound) | 6.5–10.6 s | 8.3–10.5 s, 2.7 s for a second visit (same within this machine's noise: a direct A/B gave 4.2 vs 6.4 s first, 4.1 vs 2.7 s again) |
| Warm page: loaded → its scene drawn (after the start's idle moment) | – | 0.3–0.6 s, then it sleeps (parked) |

## Upgrades

### Opening the Lab
1. **The Lab opens with your scene already on screen.** In an idle moment after the start, Hearth quietly loads the
   Lab's preview page and runs the scene the Lab will open with (no music, no references), draws it once and lets it
   sleep. Clicking the Lab takes that page over as it is (moved, not reloaded): the scene shows at once (≈ 3.2 s → ≈ 0.13 s
   here) instead of waiting for three.js, the GPU and its shaders.
2. **The Lab's own run takes over in under a second**, cross-fading from that picture on the contexts and compiled
   shaders it left (with the song, sliders and exact values). If the chat on screen owns another scene, that one comes
   in without a cross-fade from the wrong picture, as before.
3. **Only for people who use the Lab** (opened in the last 14 days), once per start, and it's let go after 15 minutes
   unused (its process and GPU memory go). Never while the Lab is already up.
4. **A lighter first open for the window**: the Lab's six saved-data reads happen at once instead of one after the
   other; plain code layers no longer make the node editor scan its ≈ 170 filter types (≈ 0.15 s); the preview's
   frame size is laid out with the next frame instead of in the middle of building the Lab.

### Switching scenes
5. **Scene switches about 2.5× faster** (recent scenes, the gallery, templates, variations, the director's new scenes):
   a new scene's canvas keeps the size it already has; it isn't resized three or four times any more (each a GPU round
   trip).
6. **A scene with its own frame size (9:16, 4:5…) next to a fit one switches in the same page**: no new page, no
   reload of three.js and every shader, and the song keeps playing (≈ 2.9 s → ≈ 1.1 s here).
7. **The frame-size buttons (Fit ⇄ 1080×1920…, Shift+1…5) switch in place too**, for the same reason.

### Media
8. **Reference pictures decode off the preview's thread** (`refTexture('name')`: createImageBitmap): a big photo no
   longer freezes the first frame that shows it.

### For the next streams (dev)
- `LabBoot.state()` (warmed / taken / skipped and why / its timings); localStorage `labboot.warm` = '1' warms whatever
  was used, '0' never; `hub.labboot.used` / `.size` / `.last` are what it remembers.
- `box.retune()` (tools/three.js sandboxFrame): only `?dpr=` differs → `{ type: 'dpr', value }` to the page, no reload;
  `ThreeLab.live.counts().retunes`. The sandbox's `ready` says `dprLive`.
- In the sandbox, a layer renderer's `setPixelRatio(v)` keeps `v` as `__basePR` and sets `v × prQ()`; internal calls
  go through with `__inQ` (render(), the screen-scale watcher).
- `dev/checks/labboot.js` (lab group, and `sh dev/run-checks.sh labboot`): open timeline, switches (first / again /
  fit ⇄ 9:16 / template), the preview's longest task, the darkest frame per switch (a probe on `scheduler.postTask`,
  since the page wraps rAF and timers), page reloads. Fails on a black frame, a switch that never draws, a reload in a
  fit ⇄ 9:16 switch, an unused warm page, or a warm open over 1.5 s. `--eval "localStorage.setItem('labboot.warm','0')"`
  runs it cold.

## Tested
`node --check` on every touched JS file and the sandbox's two module scripts; `node dev/lazy-manifest.js` (unchanged
apart from the new file; ✓ names 883, aliases 302, actions 1243, keys 466, apps 51, tools 6, dups 0 — a first run
under load reported extra actions in the lazy build, the re-run matched).
`sh dev/run-checks.sh labboot labpace labframes perfectloop smooth32 fastboot lightweight lazy unit:boot-test`:
14/15, labpace failed two timing steps under load (a 67 ms lag vs 40, "still" not yet reached); it failed the same way
on the starting commit at that moment, and passed on re-run (`labpace nativefeel labboot`: 11/11; nativefeel because
the screen-scale watcher now bypasses the new setPixelRatio wrapper).

## Caveats
- The warm page costs a page process and some GPU memory (≈ 125 MB, the same the Lab takes when open) from the start
  until you open the Lab, at most 15 minutes. People who haven't opened the Lab for 14 days don't get it.
- The warm picture is the scene as its code saved it: keyframes and the song's position come with the Lab's own run a
  moment later (cross-fade).
- It needs `moveBefore` (Chromium 133+; Electron 44 has it). Without it the Lab opens as before.
- A brand-new heavy shader still compiles on the preview's thread on software GL; on a Mac / PC GPU it already compiles
  in the background behind the old picture.
- Videos as references still come as a whole file in memory (the sandbox can't read files).

## Edits outside the lab lane
- `tools/three-nodes.js` (nodes): `fromCode` scans the filter types only for code that has a node graph (one line).
- `lazy-data.js`: `tools/three-boot.js` / `LabBoot` in the lab group. `dev/run-checks.js`: the check in `lab`, a `labboot` group.

## For the patch notes
- The Three.js Lab now opens with your last scene already on screen: Hearth quietly prepares it after the start, so
  the click shows it at once (about 3 s → 0.1 s in our test), and the full scene with its music follows in under a second.
- Switching scenes is about 2.5× faster: recent scenes, the gallery, templates and variations come in without the
  preview resizing itself several times.
- Going between a scene with a fixed frame size (9:16, 4:5…) and a fit one, or pressing the frame-size buttons, no
  longer reloads the whole preview: the song keeps playing and it's about three times quicker.
- Big reference pictures no longer make the preview stutter the first time they show.
- Still no black flash between scenes: the old picture stays until the new one is drawn.
- Caveat: the prepared preview only happens if you used the Lab in the last two weeks, and it's let go after 15 minutes
  if you don't open the Lab. A very heavy new shader can still take a moment the first time on a slow GPU.
