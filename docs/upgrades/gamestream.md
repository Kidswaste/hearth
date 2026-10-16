# Loads during play without a hitch (round 54, gamestream)

Getting ready (round 52) makes everything a game loads *at the start* ready before the first frame. Clink also loads
things *while you play*: a new level, a model, a 4K picture. Each one used to freeze a frame or more: the picture
decoded on the main thread, its shaders compiled the first time it was drawn, every texture uploaded in that same
frame. This stream makes ▶ Play take those loads in the background, and makes the F chip and the doctor say which load
caused a slow frame. Nothing to switch on, nothing on screen; the game's files are never changed (Hearth only adds a
script to the pages its ▶ Play window serves, like Getting ready does).

## Upgrades
### In the ▶ Play window (tools/gamestream-page.js, in every page the window serves)
1. **Pictures decoded off the main thread.** A picture the game asks for during play (`img.src = …`: three's
   TextureLoader) is read and decoded into an ImageBitmap in the background before the `<img>` loads; when three
   uploads it, WebGL takes the decoded bitmap instead of decoding a 4K JPEG in the middle of a frame. The `<img>`
   still says what the game set (`src`, `complete`, `decode()`); a picture under 96 KB or an unusual upload (not
   flipped, premultiplied, color-converted) goes the usual way.
2. **New objects wait for their shaders, out of sight.** Something added to a scene during play (`scene.add` /
   `attach`: a model, a level piece) whose materials have no shader yet is compiled at once without waiting
   (`renderer.compile`; on Mac and Windows Chromium compiles in the background with KHR_parallel_shader_compile) and
   stays out of the picture until the graphics process says it's done (a fence) — only while drawing, so the game
   reading `visible` never sees a change. It shows a few frames later instead of the whole game freezing.
3. **The shader's first use done early.** Once linked, three's first use of the program (link status, uniforms: round
   trips to the graphics process) happens while the object is still held, not in the frame that first shows it.
4. **Textures one per frame.** A held object's textures upload one per frame (a model with five 2K textures costs five
   small frames instead of one long one), each only once the graphics process finished the last thing asked, so the
   main thread never blocks handing a big picture to a graphics process still busy compiling.
5. **Big textures in strips.** A picture of 2 million pixels or more (a 2K or 4K texture) uploads in strips of ≈ 4 MB,
   one strip a frame (WebGL 2 sub-rectangle uploads), its mipmaps once the last strip is in. A 4K picture: 16 strips.
6. **Never shown half made.** A held object shows after max(1.5 s, 45 frames) at most (longer while strips go in);
   then whatever is left finishes first, so it never draws with half a texture.
7. **Models decode in the background** (Lab scenes): a meshopt-compressed model loaded mid-game by a 🧊 model layer
   decodes in two background workers in ▶ Play instead of in a frame.
### Naming the load behind a slow frame
8. **The F chip names it**: "last: texture 84 ms · big.jpg" — the file, picture or object loaded just before the slow
   frame (a picture of the uploaded texture's size first, then a model, then any file, then the new object).
9. **The doctor names it**: "A 4096×4096 texture was uploaded mid-play: a 120 ms freeze at 5.6 s — from “big.jpg”",
   "2 shaders compiled mid-play … — from “crate.glb”", and for the other kinds of freeze a new finding:
   "“crate.glb” loaded mid-game at 5.2 s: a 283 ms freeze (a long JS task)" with the fix in plain words (load it
   behind the loading screen with `loadAsync`, add it hidden; meshopt models: `MeshoptDecoder.useWorkers(2)`).
10. **A new object without a name gets a useful one**: "the mesh with big.jpg", "a new physical mesh".
11. **The doctor finds module games' renderers** through ▶ Play's page (`__gameStream.renderers()`), not only globals.
### For the directors / checks
12. `window.__gameStream.report()` in the game window: what loaded during play, when, and how it was smoothed
    ("decoded off the main thread", "shown after 130 ms (shaders compiled, 2 textures one per frame, big ones in
    strips)"); the gameperf probe's report carries it (`stream`), so `three_do perf` reads the same.
13. **`dev/checks/gamestream.js`** (group `gamestream`): a throwaway HTML game that loads a 4096² picture, a GLB with
    2048² + 1024² pictures and a new physical material 5 s into play, three times with Hearth's smoothing off and
    three times on (every run gets fresh shaders: a random define, so the shader disk cache can't help).

## Numbers (dev/checks/gamestream.js, Linux, SwiftShader = the graphics card emulated on a shared CPU, median of 3)
| From the load to 4 s after | before (off) | after (on) |
|---|---|---|
| Longest main-thread block (long animation frames) | 956 ms | **138 ms** |
| Main thread inside WebGL uploads / shader calls | 1,925 ms | **480 ms** |
| Frame time lost (over 2× the usual frame) | 2,715 ms | **1,220 ms** |
| Worst frame | 1,373 ms | **849 ms** (runs: 219 / 903 / 849) |
| The picture, 64×64 read back | | identical (mean difference 0) |

Other runs of the same check: worst frame 1,591 → 329 ms (longest block 1,156 → 163 ms), 1,567 → 245 ms,
1,390 → 364 ms. What's left in the worst frame
here is SwiftShader itself: it links a physical material's shader for ≈ 0.9 s on the graphics process's only thread
(there is no KHR_parallel_shader_compile in the emulator), and no frame can be shown meanwhile, held object or not. On
a Mac (Metal) or Windows (D3D11) Chromium has the extension and links in the background: the held object simply shows
when it's ready. The main-thread numbers are the ones Hearth controls, and they hold on any machine: a 4K JPEG no
longer decodes in a frame (≈ 100–200 ms here), a 4K upload is 16 strips of ≈ 3–40 ms instead of one 400 ms call.
Bench (same machine): uploading a 4K JPEG from an `<img>` 295–607 ms on the main thread, from the decoded bitmap
94–410 ms, in 16 strips 2–13 ms each.

## Tests
- `sh dev/run-checks.sh gamestream` → gamestream, unit:gameperf-test, gamemode, lazy, unit:boot-test: all pass.
- `dev/checks/gamestream.js` steps: the before froze and the doctor names the file; pictures decoded off the main
  thread and used (0 fallbacks), objects held; the longest main-thread block shorter; the worst frame shorter; the same
  picture, the 4K picture the right way up; the game's files unchanged.
- Also run: gameperf and gamemode pass. gameready: every play step passes (a Lab scene and an HTML build with Getting
  ready: still 0 compiles / uploads in the first 5 s, the card, the optimized copies); one step failed on timing: the
  card's "Install" line wasn't seen within its 20 s wait though the card did switch to Install (the answer came later on
  a loaded machine; nothing of this stream touches the card).

## Files
New: `tools/gamestream-page.js`, `dev/checks/gamestream.js`. Small additive edits: `gamemodemain.js` (serve + tag,
`stream` in the game), `gamemode.js` (the test switch), `tools/gameperf-probe.js` (load names on slow frames, the
report's `stream`, renderers from the page), `tools/gameperf-core.js` (findings name the load), `tools/sandbox-lab3d.js`
(meshopt workers in ▶ Play), `dev/run-checks.js` (group), `tools/game-api.md`.

## Risks
- **A held object shows a little later** (on a fast machine a few frames; on a slow one up to ≈ 1.5–4 s) instead of
  freezing the game. A game that adds something and needs it on screen in that very frame (a muzzle flash with a new
  material the first time) sees it a few frames late, once per new material. Objects the game adds hidden are left
  alone; so are objects whose shaders already exist (every bullet after the first).
- **A picture's load event comes later** (after its background decode), so `TextureLoader` resolves a little later
  than before; the game's frames keep going meanwhile.
- **Pictures from another site without CORS** can't be read by the page: they load the usual way.
- **Textures that load after their object is on screen** (`TextureLoader.load` returning at once, used right away)
  still upload in one go when they arrive (decoded off the main thread, though); `loadAsync` then `add` gets the
  strips. The doctor names those loads.
- **HTML builds' own meshopt decoder** stays on the main thread (it's inside the game's modules): the doctor says
  `MeshoptDecoder.useWorkers(2)`.
- **Naming is a best guess** from timing (and the texture's size): when several things load at once the chip / doctor
  may name the model instead of the picture that came with it.
- **Measured on SwiftShader only**: there's no Mac / Windows GPU here. The code paths are Chromium's (ImageBitmap,
  fences, sub-rectangle uploads, the parallel compile extension), the same on both.

## For the patch notes
- **Loading during play no longer freezes your game.** When Clink loads a new level, a model or a big picture while
  you play in ▶ Play, Hearth decodes the picture in the background, gets the new object's shaders ready out of sight,
  and sends big textures to the graphics card a slice per frame. The new things appear a moment later instead of the
  whole game stopping.
- On the test game (a 4K picture and a model loaded 5 s into play), the longest freeze of the main thread went from
  about 1 second to about 0.14 s, and the picture looks exactly the same.
- Nothing to set up and your game files are never changed: it works for Lab scenes and HTML games, on Mac and Windows.
- **The stats chip (F) and "Why isn't it smooth?" now say which load caused a slow frame**, by its file name — for
  example "a 120 ms freeze at 5.6 s — from big.jpg" — with how to load it without one.
- To make a mid-game load fully seamless in your own code: load it with `loadAsync` before you add it to the scene.
