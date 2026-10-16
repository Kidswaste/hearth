# glrecover (round 43): the Lab picks up where it was when the graphics card goes away

On Windows (and now and then on a Mac) the GPU can drop every WebGL context under Hearth: a driver update or reset
(Windows' TDR), sleep / wake, a monitor plugged in, too much GPU memory, another app. Chromium restarts its GPU
process, and after a few crashes it may stop using the GPU for the rest of the session (software drawing, very slow).
Before this round the Lab preview went blank under "The preview lost its GPU context" with a ⟲ Restart button (a new
page). A render that was running failed. Nothing told you that Hearth was now drawing without the graphics card.

Now the Lab and every WebGL view in Hearth recover by themselves. Nothing new on screen and no new setting. You get one
calm note when it happened, and a Restart button only when restarting Hearth is what fixes it.

## How it works
- **In the preview page** (`tools/three-sandbox.html`, "the graphics card coming back"): every WebGL canvas gets
  loss / restore listeners on itself, so canvases that aren't in the page are covered too. A loss is
  `preventDefault`ed, so the browser may give the context back. Losses the page causes itself are told apart and
  ignored: a re-run layer's context, the pool's, `forceContextLoss()` in a sketch, the thumbnails' helper. Pooled
  contexts and the thumbnails' renderer are let go for good, since their GL objects belong to the context that was.
  A lost context that nothing on screen used (a waiting one, one the browser took back for having too many) is let
  go with nothing to rebuild. Otherwise the page says `gpu-lost`. When a context comes back, the layers that drew
  with WebGL run again in place on fresh renderers, as they are now: code, props, keyframes, camera moves. No
  `values` are sent, so the live slider values stay. Then the page says `gpu-restored`. Precomps' own layers run
  with their precomp. A context the GPU took back once is never pooled again.
- **Nothing in the scene lived on the GPU**: slider values, the song and its media element, the look-around views,
  layer props and the Lab's undo history are all outside it, so they are simply kept.
- **No restore within 4 s** (`store glrecover.wait`): `sandboxFrame` (tools/three.js) makes the page again for the same
  content. Its `ready` says `again` + `gl`, the same path as a page the browser restarted by itself. The preview runs
  the scene with `run({ again, quiet })`: the song is sent again at its place and played. Nothing is saved: no
  history snapshot, no time-machine version, no thumbnail, no LabBoot note, no "ran" event. Other owners: the
  backstage runs its scene again on the next call. The export page handles it itself (`gpuStuck: 'owner'`).
- **Nothing is saved during a recovery** (the scenesafe rule): the page never saves, and the preview's no-picture
  rule means a blank picture can't become the scene's thumbnail or cover. The song's playhead isn't noted while
  the preview waits.
- **Renders** (`tools/three-export.js`): a frame drawn while a context was gone is never sent as a picture
  (`xp-frame { lost }`). The render picks up at that frame on the same export page once its layers ran again, or on
  a new export page if no restore comes in 5 s. Every frame is the scene at its own time on the export page, so a
  resumed frame is the frame it would have been. Streamed MP4s keep their ffmpeg; frames in a folder keep their
  files. If resuming fails, or it happens more than 3 times in a row, the whole render starts again once from its
  first frame, with a new stream and a toast saying so. The result carries `gpu: { lost, newPage, restarted }`.
- **Main** (`glrecovermain.js` + `glrecover-core.js`): `app.on('child-process-gone')` for type GPU (not a clean exit,
  not while quitting), then `app.getGPUFeatureStatus()` 2.5 s and 7 s later and on every `gpu-info-update`. The GPU
  restarted and still in use → "The graphics card restarted — …" (at most once in 10 minutes). Drawing fell from the
  GPU to software during this session → "Hearth is drawing without the graphics card right now — Restart Hearth to
  get it back" with **Restart**. That note shows once, and again only after the GPU came back. A computer that never
  had the GPU this session (a VM, remote desktop, the test machine) is never told. A note made before the window
  listens waits in `glrecover:state`.
- **The window** (`glrecover.js`, a lazy "soon" group): shows the note through Hints as a *notice*. One at a time,
  never while you type or drag, and not silenced by "Don't show tips", because it's about this copy. A GPU restart
  that the Lab lived through is told once, whichever side says it first.

## Every WebGL use
| Where | What happens on a loss |
|---|---|
| Lab preview (incl. Stage window, sequence clips, precomps) | layers rebuilt in place; new page after 4 s |
| Warm page (labboot) not yet taken | let go; the Lab opens on a clean page as before labboot |
| Backstage (director chats off screen), 🎲 crew stages | rebuilt in place (same page code); made again empty → the scene runs on the next call |
| The gallery's preview pages | rebuilt in place (same page code) |
| Renders / exports, ▦ All formats, perfect-loop probes | the frame is asked again once the page is back (or a new page) |
| 🎲 variations, ◧ before / after, director screenshots | `shotSmall` / `shot` wait for the preview to draw again (≤ 8 s), never a blank picture |
| Effects picker thumbnails | its renderer is made again; a batch drawn during a loss is asked again, not kept as "no picture" |
| Shader / model viewer pages | load again by themselves (`ready` again; the shader page compiles again) |
| ◇ Shader node editor preview (nodes-shader.js) | buffers, program, picture rebuilt on restore; time and values kept |
| OBS Browser Source page (obs-page.js) | reloads itself on restore (or after 4 s) and reconnects |
| Chrome view screencast | a 2D canvas, not WebGL: nothing to do |

## Upgrades
### The Lab preview
1. **A graphics card reset no longer blanks the Lab**: the scene rebuilds itself in place the moment the GPU is back
   (≈ 0.9 s here).
2. **Your sliders, the song (still playing, same place), the look-around view, keyframes and camera moves, and undo
   all stay** as they were.
3. **If the graphics card doesn't come back within 4 seconds**, the preview page is made again with the same scene.
   The song picks up where it was.
4. **Nothing is saved while it recovers**: no history snapshot, no time-machine version, no blank thumbnail, and the
   playhead isn't noted.
5. **No banner while it works itself out.** The banner shows only if even a new page can't draw.
6. **Pictures asked for meanwhile wait for the GPU**: 🎲 variations, ◧ before / after and the director's screenshots
   are never blank.
7. **The effects picker's thumbnails draw again** after a reset (none kept as "no picture").
8. **A context the browser takes back that nothing showed** (too many contexts, a waiting one) no longer counts as a
   loss, so it causes no reload.
9. **A sketch's own `forceContextLoss()`** isn't mistaken for a GPU reset.
10. **The prepared warm page is let go on a loss**, so the Lab then opens on a clean page.
11. **The backstage** (a director chat's scene off screen) runs its scene again on the next call after a page remake.
### Renders
12. **A GPU reset mid-render picks up at the first frame not finished** (the streamed MP4 keeps going; the folder
    keeps its frames).
13. **No restore on the export page**: a new export page picks up there.
14. **If resuming fails, the render starts again once from the start** and says so. A blank frame is never put into a
    video.
15. **Perfect-loop and format probes** ask for the frame again instead of failing.
### Other WebGL views
16. **The ◇ shader node editor's preview** rebuilds itself and keeps its time, values and picture.
17. **The OBS Browser Source page** reloads itself after a reset.
### Telling you
18. **"The graphics card restarted — the Lab picked up where it was"**: one calm note per event, at most every 10 minutes.
19. **"Hearth is drawing without the graphics card right now — Restart Hearth to get it back"** with a **Restart**
    button, when Chromium falls back to software drawing.
20. **Computers without a GPU are never nagged** (only a fall from the GPU to software is told).
21. **/graphics** (also `/gpu`; Ctrl/⌘+K "Graphics card: what Hearth draws with"): with the GPU or not, how many
    restarts, how often the Lab picked up after one.

**21 upgrades.**

### For the next streams (dev, not counted)
- In the preview: `window.__glRecover.lose({ restore: ms | null })` loses every live context the way a GPU reset does
  (WEBGL_lose_context) and gives them back after `ms`, or never. `.state()` returns `{ lost, epoch, losses, restores,
  rebuilds, last, contexts, views }`. A page that can't be evaluated in (the export page) takes
  `{ target: 'three-sandbox', type: 'gl-sim', restore }`.
- Messages: `gpu-lost { epoch }`, `gpu-restored { layers, ms }` (or `{ reload }` on shader / viewer pages),
  `xp-frame { n, lost }`. In the window: `gpu-stuck` from `sandboxFrame`, then `ready { again, gl }`.
- (round 50) `gpu-restoring { epoch, layers }` when the contexts are back and the rebuild starts: the 4 s wait is
  for the GPU only; the rebuild then has 20 s (`GL_REBUILD_MS` in tools/three.js, and the export page's `glBack`).
  Before, a busy computer's rebuild could pass the 4 s and a new page was made (song back to the start, views gone)
  for a GPU that had come back: `glrecover.wait` = 1500 showed it every time on the old code.
- `ThreeLab.gl.state()` → `{ phase: null | 'lost' | 'remaking', stuck, log, box }`. `ThreeLab.gl.wait(ms)`. The window
  event `hearth:lab-gl { state, how }`. `ThreeLab.live.counts().gl` = `{ lost, restored, stuck }`.
- `ThreeLab._sandbox(parent, onMessage, params, { gpuStuck: 'owner' })`: the owner handles a page that didn't come
  back.
- Main: `hub.glr.state() / shown(id) / sim({ status, gone, info, delays })` (sim only in a test copy) and
  `onNote`. `GLRecover.labBack({ how, ms })`, `.state()`.

## Tested
- `dev/checks/glrecover.js` (new; lab group and `sh dev/run-checks.sh glrecover`), 21 steps:
  1. Lost and restored while a song plays: the same page (no reload), the slider at 1.3 in the picture and the Lab,
     the song still playing at the right place (±1.2 s), the look-around view and undo depth the same, a
     `shotSmall` asked during the loss not blank, effect thumbnails drawing again, the Lab's `three-*` files
     unchanged (the playhead aside), the note's exact words, and no banner.
  2. Never restored: a new page after the wait, with the scene, the slider, and the song playing from where it was
     when the old page went. Nothing written, no history snapshot, the same undo, no banner.
  3. A streamed MP4 render, 36 frames, the contexts lost at frame 6: picks up on the same page and completes with
     36 frames (ffprobe agrees). With no restore: a new export page and the render completes.
  4. In main (stubbed): GPU → crash → still GPU gives no second "restarted" note (the Lab told it). Crash into software
     gives the software note with its Restart button. Main reports software with 2 crashes; `/graphics` says so.
- `node dev/glrecover-test.js` (unit, in UNIT), 48 checks: the status kinds, crashes vs. clean exit / quitting /
  other processes, restarted once per 10 minutes, software once (again after the GPU came back), never on a
  never-GPU machine, info-only falls, ≤ 10 notes kept, the words matching the window's, and main with a stand-in
  app / ipc / window: notes sent, a note before the window kept, shown, sim refused outside a test copy, a throwing
  status, a destroyed window, and dispose.
- `sh dev/run-checks.sh glrecover labboot labpace labmemory renderfast multiformat labvariations abcompare scenesafe
  lazy unit:boot-test`: 18/19 pass. These include fastboot-lab, beatlink, the labpace / labadapt / scenesafe /
  store-thread / sync unit tests, and boot-test with 1,183 checks, the first screen still at 72 scripts. `labpace`
  fails timing steps under load: "draws again within a frame or two" (100 ms lag) and, on the re-run, "a still scene"
  that wasn't still yet when the shot came. The starting commit 4992f1a, run from a copy right after, fails the same
  first step. No context was lost in its log. `node dev/lazy-manifest.js`: ✓ names 904, aliases 317, actions
  1283, keys 482, dups 0.

## Caveats
- Simulated with WEBGL_lose_context and stubbed GPU events. A real driver reset (TDR on Windows, sleep / wake on a Mac)
  goes through the same events, but it couldn't be done on this machine.
- A rebuilt layer starts its own code again: anything a scene accumulated by itself (a simulation's state, trails)
  starts over. Everything you set (sliders, song, view, keyframes) is kept.
- When the page has to be made again, the song misses the second or so the new page takes to load. It goes on from
  where it was then, not from where it would have been.
- A render picking up after a reset draws the remaining frames on a fresh scene: a scene that builds up state frame by
  frame (rare in renders, which run on the scene's clock) can differ from an uninterrupted render.
- The model viewer page loads again empty after a loss; open the model again.
- The software note depends on Chromium's GPU status. If a computer had the GPU blocklisted from the start (an old
  driver), Hearth says nothing; `/graphics` tells.

## Edits outside my lane (small, additive)
- `tools/three-sandbox.html`: the recovery block, a hook in the getContext wrapper, pool / thumbnail guards, no shots
  while lost, export frames saying `lost`, `gl-sim`.
- `tools/three.js`: `sandboxFrame` (`gpuStuck`, the stuck timer, `ready.again/gl`, `box.gl`), the preview's
  `glPreview` / `glBack` / `glWait`, `run({ quiet })`, `shot` / `shotSmall` waiting, `rememberMedia` paused, the
  `ThreeLab.gl` API, and `_sandbox` options.
- `tools/three-export.js` (resume / new page / restart once; probe). `tools/three-fx.js` (thumbnails).
  `tools/three-backstage.js` (one line). `tools/three-boot.js` (one line).
- `nodes-shader.js` (the node preview's restore). `obs-page.js` (4 lines).
- `main.js` (one require line), `preload.js` (`hub.glr`), `lazy-data.js` (the group + manifest), `index.html` (the
  group name added to an existing `lazy-at.js#…` tag, needed by dev/boot-test.js), `dev/run-checks.js`.

## For the patch notes
- If your graphics card resets (a driver update, waking the computer, plugging in a monitor, another app), the
  Three.js Lab now picks up where it was by itself. Your sliders, the music (still playing, same place), the camera
  view and your undo history are all kept.
- If the graphics card doesn't come back within a few seconds, the preview reloads itself with the same scene, and
  the song carries on from where it was.
- Nothing is saved while the Lab recovers, so a reset can never overwrite a scene or leave a blank thumbnail.
- A render that's running when the graphics card resets carries on from the frame it was on. If that fails, it
  starts again once by itself and tells you. A blank frame never ends up in your video.
- One calm note tells you it happened: "The graphics card restarted — the Lab picked up where it was".
- If Windows or macOS stops letting Hearth use the graphics card (everything gets slow), Hearth says so: "Hearth is
  drawing without the graphics card right now — Restart Hearth to get it back", with a Restart button.
- The shader node editor's preview and the OBS output page recover too. Type `/graphics` to see whether Hearth is
  using your graphics card.
- Caveat: a scene that builds things up over time (trails, a simulation) starts that part again after a reset.

## Round 51: no drawing context at all
Found by the `a11y` check failing under load with "THREE.WebGLRenderer: A WebGL context could not be created. Reason:
Web page caused context loss and was blocked" and "THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false" with
every log empty. The audit itself was at 0; it opens the Lab for its controls (sliders, knobs, pickers), not its
picture. On this machine the software GPU process crashes under load, and after **two** GPU process restarts Chromium
refused WebGL to the Lab's pages for good (a per-site block meant for websites): glrecover then had nothing to come
back to, the preview stayed black with raw errors in the console and the scene's "error" in the Lab. That is a real
app bug (a Mac's GPU reset twice in a session does the same), not only test noise.
- `main.js`: `app.disableDomainBlockingFor3DAPIs()` before 'ready'. Reproduced with `Browser.crashGpuProcess`: before,
  the second crash left the page with no context; now contexts come back after each restart. Chromium's own fallback
  when the GPU keeps crashing (WebGL off for the app after the third or fourth restart) still applies.
- `tools/three-sandbox.html`: a context asked for and none given → `glrNone()`: the Lab is told once (`gpu-lost`,
  `none`), the layer whose renderer couldn't be made isn't reported as the scene's error, three.js' lines for it (and a
  program link "failing" with every log empty, which is the GPU going mid-link; a real shader mistake always has a log)
  become one calm console line per page instead of a `console.error` per renderer.
- `tools/three.js`: three pages in a row without any context → no more new pages on their own (each failed the same
  way, every 4 s, forever); the calm banner "The graphics card isn't drawing the preview right now." stays, with
  ⟲ Restart. A page that draws with a context resets it.
- Checked with the GPU crashed until WebGL is off, then a scene run: before (84431ac) 8 console errors, a black
  preview, no banner; now no console error, 3 new pages, the banner, sliders kept. `dev/checks/a11y.js` is unchanged
  (nothing filtered).
