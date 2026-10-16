# Why isn't it buttery? Game performance (round 52, gameperf)

Clink is a Lab scene that can also run as an html build. This stream answers "why does my three.js game stutter?" with
numbers measured in the game itself, puts each stutter down to its cause, and turns a play session into a short list of
fixes in plain words, sorted by how much they cost you. On a Lab scene the safe fixes are one click with Undo; an html
build only ever gets the patch as a suggestion. Nothing changes the game's code by itself. It loads on first use (lazy
group `gameperf`) and costs nothing until then.

## Upgrades
### Stats chip (in the game)
1. **The stats chip** (F in a ▶ Play window, `/game-perf chip` or Ctrl/⌘+K "Game: stats chip"; off by default): fps,
   frame time and the worst frame, the display's refresh rate and its budget (240 Hz = 4.2 ms).
2. **A 2-second frame-time graph** with the display's refresh line: one bar per frame, red when it missed the budget.
3. **Marks on the graph** for each GC pause (violet), shader compile (orange), texture upload (blue), long JS task
   (red) and page layout (yellow).
4. **renderer.info in the chip**: draw calls, triangles, shader programs, textures, geometries.
5. **Graphics memory estimate**: textures (with mipmaps) + geometry + drawing buffers, in MB.
6. **The last stutter named** in the chip ("last: shader 120 ms") for 5 s after it happened.
7. **~0 cost while hidden**: no DOM, no drawing; measuring costs ≈ 5 µs a frame (0.1 % of a 240 Hz frame, measured).
### Why did it stutter?
8. **Every frame over budget is put down to one cause**: garbage collection, a shader compile, a texture upload, a long
   JS task, the CPU side of drawing (draw calls), page layout / paint, or the graphics card (frame ready on time, shown
   late), with a second cause when two share a frame.
9. **Shader compiles and texture uploads caught even when the GPU does them later** (a frame that linked a program or
   sent megabytes and came late is theirs).
10. **The game's own function names** for long tasks (from long-animation-frame entries, and the function handed to
    requestAnimationFrame / setAnimationLoop).
11. **Exact garbage per second and every GC** (main.js now asks for precise memory info; reading it is free until a
    page asks).
12. **Stutters judged against the game's usual frame**, so a steadily slow game isn't 300 "stutters".
### The performance doctor
13. **One click after a play session** (Ctrl/⌘+K "Game: why isn't it smooth?", `/game-perf`, GamePerf.doctor() for
    ▶ Play): a card over the game with the session in one line and the findings sorted by impact (big / medium / small).
14. **Draw calls**: "1,460 draw calls a frame: 1,440 meshes share one geometry and material — instance them (≈ −1,439
    calls)", with the InstancedMesh snippet; meshes sharing only a material → merge them.
15. **Garbage from the game's own code**: "new Vector3 every frame in update() (line 24) — ≈ 3 MB/s of garbage", found
    by reading the scene's code (the frame loop and what it calls), with every line listed.
16. **GPU objects made every frame** (new geometry / material / mesh in the loop; ones behind an if are left alone).
17. **Shaders compiled mid-play**: the freeze and when, with the fix (add everything at load, compileAsync).
18. **Textures uploaded mid-play**: size, freeze, when, with the fix (renderer.initTexture at load, KTX2).
19. **8K textures** and their graphics memory.
20. **Pixel ratio too high** for the screen (pixel ratio 3 on 4K: millions of pixels nobody sees).
21. **Shadow maps redrawn every frame although lights and casters don't move** (it watches whether they move).
22. **Shadow maps of 4096 while the graphics card is the limit.**
23. **Transparent sorting of hundreds of objects.**
24. **Long JS tasks by function name** ("rebuildNavMesh() ran 64 ms in one go").
25. **Layout / paint in a game window** (HUD text written every frame).
26. **GPU-bound**: frames ready on time and shown late, with the biggest graphics knobs this scene has.
27. **Too many shader programs** (materials that differ by small settings).
### Fixes
28. **Lab scene: one-click "Reuse them"**: per-frame `new Vector3 / Quaternion / Euler / Color…` lines become one object
    made above the function and set in place each frame; only lines where the object can't outlive the frame.
29. **Lab scene: "Cap at 2"** pixel ratio, **"Draw shadows once"** (shadowMap.autoUpdate off, needsUpdate on).
30. **Every Lab fix is one undo step** (the card's ↶, the toast's Undo, `/game-perf undo`), goes through the Lab's own
    code update (its versions keep it) and refuses if another scene came on screen.
31. **html build: the patch as a suggestion** (a small diff on the card: Copy, or ✦ Ask puts it in the director's box,
    never sent); the build's files are never touched.
32. **✦ Ask** for the bigger ones (instancing, compile at load): a short request in the Three Director's box, not sent.
### Max fidelity (only on your click)
33. **Sharp on this screen**: pixel ratio up to the display's (Lab: "Use the screen's"; anywhere: Try it, live).
34. **MSAA** (antialias: true in the renderer's options, Lab one click).
35. **ACES tone mapping** and **sRGB output** (Lab one click; Try it live).
36. **Soft shadows** (PCFSoftShadowMap) and **2048 shadow maps** (Try it live).
37. **Anisotropic filtering** at the GPU's maximum on the scene's textures (Try it live).
38. **Each suggestion says when it costs graphics time you don't have** (little headroom now).
### For the directors and chat
39. **`three_do perf`**: the Three Director reads the measured findings in ≈ 150–300 tokens ("make Clink smoother"),
    measuring 4 s itself when there is no fresh session; `{op: "fix", id}` applies a [fix] (the owner can undo),
    `undo`, `fidelity`. The director's fixed prompt didn't grow (the word lives in `help perf`; "help games" points to it;
    help smooth / fps / stutter / lag find it too).
40. **`/game-perf`** `[check | chip | fix <id> | try <id> | undo | status]`, and two Ctrl/⌘+K lines.
### For ▶ Play (gamemode)
41. **GamePerf.attach(win, { label, hz, key, kind, source, host })**: a webview, an iframe, a Window, anything with
    executeJavaScript, or `{ exec(expr) }`. **GamePerf.probeSource(opts)** is the probe as one expression for a preload at
    document start (it then sees every renderer through three's `__THREE_DEVTOOLS__` hook and every shader).
42. **The game's opt-in**: `hearthPerf.use({ renderer, scene, camera })` for a game whose three.js lives in a module.

## Tests
- `node dev/gameperf-test.js` (unit, 10 groups): each cause from a frame's numbers (and rebuilt from its source text, as
  the page gets it), the report (display rate, stutters vs the usual frame, GPU-bound), the source scan (function, line,
  what can be reused, pushed objects left alone, one-off code ignored), every Lab patch and its "already done" null, the
  doctor's titles for a fixture session with all the problems, a smooth game getting nothing, fidelity suggestions, the
  director's text, the probe standing alone.
- `dev/checks/gameperf.js` (smoke, group `gameperf`): a game-like Lab scene with 400 un-instanced crates, new Vector3s
  per crate per frame in update(), a ShaderMaterial added mid-play and a 4096×4096 texture shown mid-play. Passes: the
  group loads lazily; hidden chip not in the page and ≈ 5 µs a frame (budget 20); the chip draws when shown and leaves;
  the shader's and the texture's frames are put down to them; 9 MB/s and 4 GCs seen; the doctor's draw calls / garbage
  (update(), line 24) / late shader / late texture findings with fixes, sorted; the card; the director's text ≈ 250
  tokens with the [fix] ids; "Reuse them" changes exactly the two lines (+2 declarations) and Undo puts the code back;
  the same game as an html build gets the diff and the fix is refused.
- Also passed: lazy, unit:boot-test, jankwatch, unit:directorfrugal-test, unit:promptdiet-test, unit:director-mcp-test.

## Not done / risks
- The test computer's GPU is software and was heavily loaded (load ≈ 20 on 4 CPUs): fps there is single digits, so the
  check judges the frames where each event happened rather than exact millisecond budgets.
- A game whose three.js is private to a module and that the probe joins late (not at document start) shows no scene
  numbers until it calls `hearthPerf.use(...)`; gamemode's preload should inject `GamePerf.probeSource()`.
- Lab one-click fixes cover the safe code shapes only (a `const v = new THREE.Vector3(…)` line, the renderer's
  options / settings); instancing is a suggestion with a snippet and ✦ Ask, not an automatic rewrite.

## For the patch notes
- ▶ **Why isn't my game smooth?** Play a three.js game (or your Lab scene) and Hearth tells you why it stutters, in plain
  words: too many draw calls ("instance these 1,400 crates"), garbage made every frame in update() (with the line),
  a shader compiled mid-play, a big texture uploaded mid-play, a pixel ratio too high, shadows redrawn for nothing…,
  sorted by what costs you most. Ctrl/⌘+K "Game: why isn't it smooth?" or `/game-perf`.
- On a Lab scene the safe fixes are one click, with Undo; for an html build you get the patch to copy or send to a
  director, and your files are never changed.
- **Stats chip**: press F in the ▶ Play window for fps, a 2-second frame graph with your screen's refresh line, draw calls,
  triangles and graphics memory; GC pauses, shader compiles and texture uploads are marked on the graph. Hidden, it
  costs nothing.
- **Max fidelity** suggestions (sharp on your screen, MSAA, filmic tone mapping, soft shadows, crisp textures), only
  applied when you click.
- Say "make Clink smoother" to the Three Director: it reads the same findings for a few hundred tokens and can apply the
  safe fixes.
