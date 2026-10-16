# ▶ Play, got ready (round 52, gameready): "load it up properly"

The owner: "I have a project that's a three.js game right now (Clink) and I want it to run buttery smooth at max
graphical fidelity when I take the time to load it up properly." Clink is a Lab scene that can also run as an HTML
build, so both are supported; the Lab scene is the main path and the best tested one.

**GameReady** is the preparation half of ▶ Play (GameMode owns the window, GamePerf the overlay). ▶ Play calls
`GameReady.prepare(source, onProgress)` (contract: `tools/game-api.md`). Nothing new on screen except the calm card
while it gets ready. Nothing goes into any prompt (0 tokens). The owner's game files are only ever read.

New files: `tools/gameready-core.js` (pure: cache keys, fresh / stale / missing, the cap, the rewrite map, findings,
the card's words), `tools/gameready.js` + `tools/gameready.css` (lazy group `gameready`: the card, preparing, play,
Optimize for play, `/game-ready`), `tools/gameready-page.js` (runs inside an HTML game's own page),
`gamereadymain.js` (main, loaded on first use: hashes, Hearth's cache, the encoder, the HTML game's window),
`gameready-preload.js`, `tools/game-api.md`, `dev/gameready-test.js` (UNIT), `dev/checks/gameready.js`,
`dev/checks/gameready-relaunch.js`.

## How it works
1. **The scan.** A Lab scene: its references (pictures, videos, models, sounds) and the files its code names. An
   HTML build: a warm run in its window lists every file the game asks for (fetch / XHR / pictures / image bitmaps /
   decoders); Hearth keeps the list, so the next launch knows the models before the game asks. 3D models are hashed
   (SHA-1) and Hearth's optimized copies looked up.
2. **Everything in, before the first played frame.** Pictures decoded, models loaded (their Draco / meshopt / KTX2
   decoders loaded once by the loader), sounds decoded (decodeAudioData waited for), videos at their first frame.
   An HTML game's frames are held (requestAnimationFrame) behind the card meanwhile; its renderer and scenes are found
   through three.js's own devtools hook (`__THREE_DEVTOOLS__`), without touching the game's code.
3. **Textures at full quality, uploaded now.** Every mipmapped picture at the graphics card's best anisotropy, then
   `initTexture` for every texture the scenes use (materials, uniforms, background, environment).
4. **Every shader compiled, then warmed.** `compileAsync` over every scene each renderer drew (parallel compile where
   the GPU has it; hidden objects too: a pickup that spawns later is compiled now), then warm frames under the card
   (shadow maps, lights, post passes as they really draw) and anything new compiled again.
5. **The shader disk cache.** Chromium keeps compiled shaders on disk (GPUCache) for persistent sessions; Hearth's
   own window and the HTML game window (`persist:hearth-game`) both are, and the cache may now hold 32 MB (was 6), so
   a big game's programs fit. A second launch skips the compiles (measured below).
6. **What it found**, in plain words on the card and in the result: "1 texture is 4K — it costs 43 MB of video
   memory", the video memory of all textures, big uncompressed textures, draw calls over 400 a frame, more than
   5 M triangles, more than 4 shadow-casting lights, how many shaders were compiled ahead.
7. **Play.** The card goes; a Lab scene holds 100 % quality while it plays (presentready's lock: no adaptive steps,
   no doze, no fps cap); the first 5 s are counted (shaders compiled, textures uploaded). Esc leaves and puts
   everything back.
8. **Optimize for play** (one click on the card, or `/game-ready optimize`): 3D models (GLB / glTF) compressed with
   gltfpack into Hearth's own cache folder (`data/game-cache`): meshopt compression with no quantization (the exact
   same vertices), named nodes / materials / extras kept (code that finds things by name still does), textures as KTX2
   UASTC (the high-quality mode) when the gltfpack build can. A copy is only used when it's smaller, and for an HTML
   game only when its loader showed it has a meshopt decoder. The game then loads the copy: a Lab scene reads it in
   place of the reference; an HTML game's window serves it for the same URL. The cache is keyed by the file's hash; a
   changed file's old copy goes to the Trash; at most 4 GB / 200 copies (least recently used go first); an unreadable
   index is never written over.
9. **No encoder?** The card says what it needs and shows the command (`npm install -g gltfpack`); it runs in a
   visible Terminal / PowerShell window only after a click on Install.

## Measured
`dev/checks/gameready.js` + `gameready-relaunch.js`, SwiftShader under Xvfb (the "GPU" is the shared CPUs; counts are
exact, times are relative). The fixture "Clink" Lab scene: a ground with a 4096×2048 picture and a 1024² detail map, a
🧊 ship (GLB with its own texture), physical / toon / Lambert / Phong / standard materials, sun + spot (shadows) + point
+ hemisphere lights, PCF soft shadows, fog, and a pickup that only appears 2 s into play. The HTML build: index.html +
its own three.js + GLTFLoader + meshopt decoder, the 4K picture, the ship, a pickup after 2 s.

| First 5 s of play | Before (no getting ready) | After (GameReady) |
|---|---|---|
| Lab scene: shaders compiled / programs linked | **14 / 7** | **0 / 0** |
| Lab scene: textures uploaded for the first time | **17** | **0** |
| Lab scene: quality | adaptive steps (level 1–2, layers at 70–85 %) | locked: level 0, every layer at 100 % |
| HTML build: shaders / programs / first uploads | **6 / 3 / 5** | **0 / 0 / 0** |
| HTML build: frames drawn in those 5 s (software GL) | 2–17 | 11–29 |
| Lab scene on the optimized ship | — | 0 / 0 / 0 |

- Getting ready (Lab scene): 11–27 s on SwiftShader over four runs (most of it decoding the 4K picture and loading the
  model; shaders ≈ 0.6–1.6 s, warm frames ≈ 2.5–5.5 s); the HTML build: 9–12 s. A real GPU is many times faster.
- Found: "1 texture is 4K — it costs 43 MB of video memory", "3 textures in all: 49 MB of video memory", "27 shaders
  compiled ahead". Textures at the GPU's best anisotropy (16 here; 3 of 3).
- **Second launch** (same profile, Chromium's shader disk cache from the first): the page's wait on the GPU's shader
  work for the scene's 28 programs **326 → 233 ms (29 % less)**; a third launch 352 → 177 ms (50 %). Wall time to
  "ready" swings with the machine's load (15.1 vs 15.6 s in the passing run; 29.5 → 23.2 s in an earlier one), so the
  check judges the shader wait, not the wall time. A raw probe of 40 heavy programs: 127–132 ms cold → 33 ms in the hub
  page, 74 → 18 ms in the Lab's sandboxed page (the cache works for the Lab's preview too). The cache is written a moment
  after programs are made: a normal quit keeps it; the test waits 8 s before the harness kills the app.
- **Optimize for play**: the ship 112,796 → **39,892 bytes** (meshopt, exact vertices: 2,401 drawn either way); the Lab
  read the copy (the sketch's reference is the copy's size), the model drew, play stayed at 0 / 0. npm's gltfpack can't
  make KTX2 (no BasisU in its WebAssembly build): textures stayed as they were and the copy says so. The HTML build got
  the same copy (same bytes → same key, nothing made twice), served for `models/ship.glb` by URL rewrite.
- No encoder: the card showed `npm install -g gltfpack` with Install; nothing ran.
- Every original file (pictures, GLB, the HTML build's files) hashed before and after: byte for byte the same.

## Upgrades
### Getting ready
1. **▶ Play gets the game ready first** (`GameReady.prepare`): a calm card, "Getting Clink ready… textures 40/120 · 80 %", Play now, Esc.
2. Lab scenes: references and the files the code names scanned; the scene waited for until every layer draws.
3. HTML builds: a warm run lists every file the game loads; kept for the next launch.
4. Everything loaded before the first played frame: pictures, models (decoders once), sounds decoded, videos at their first frame.
5. An HTML game's frames wait behind the card while it gets ready (its code untouched).
6. Every texture at the graphics card's best anisotropy, with mipmaps.
7. Every texture uploaded before play.
8. Every shader compiled before play, hidden objects included.
9. Warm frames (shadows, lights, materials as they draw), then anything new compiled.
10. 100 % quality held while a Lab scene plays (no lighter steps, no doze, no fps cap).
11. The first 5 s of play counted: shaders compiled and textures uploaded (0 / 0 when it worked).
12. **What it found**, in plain words: big textures and what they cost in video memory, total video memory, uncompressed textures, draw calls, triangles, shadow lights, shaders compiled ahead.
### Launching again
13. Chromium's shader disk cache allowed 32 MB (was 6 MB): a big game's shaders fit.
14. The HTML game's window uses a persistent session, so its compiled shaders survive a restart.
### Optimize for play
15. **Optimize for play** (one click on the card): 3D models compressed into Hearth's own cache.
16. Exact geometry, names, materials and extras kept; textures as KTX2 UASTC when the encoder can.
17. The game loads the optimized copy by path / URL rewrite: your files are never changed.
18. Copies keyed by the file's hash; a changed file's old copy goes to the Trash.
19. A 4 GB / 200-copy cap, least recently used first; an unreadable index is never written over.
20. No encoder: the install command shown, run in a visible window only after a click.
### Chat
21. `/game-ready [optimize | stop]`.

21 upgrades.

## Tests
- `node dev/gameready-test.js` (UNIT, 44 checks): cache keys, fresh / stale / missing, the cap and least recently
  used, the rewrite map (file:// URLs, escapes, Windows slashes and letter case), findings, the card's words, what may
  be optimized, the gltfpack flags, the install plan; the main process' plan on a throwaway folder (hash memo, a copy
  whose file went, an unreadable index left alone).
- `sh dev/run-checks.sh gameready`: `dev/checks/gameready.js` then `dev/checks/gameready-relaunch.js` on the same
  Chromium profile (smoke.js `--profile` / `--profile-fresh`, new), plus presentready, lab3d-models, renderfast,
  lazy, unit:boot-test.

## Edits outside the new files
- `tools/three-sandbox.html`: `ready-scan` (everything in, best anisotropy, what the scene costs), `compileMs` in
  `ready-prepped`, `renderers` in `ready-count`, sounds still decoding count as loading, `__rdyLive` for checks.
- `tools/three.js`: `ready-*` answers also to `window.__gameReadyHook` (a plain hook: reading the lazy global would
  load the group), a reference read through `__gameReadyHook.pathFor` (the optimized copy while playing),
  `api.game` / `ThreeLab.game` (refs, code, scene, open, reread, send, host).
- `main.js`: the `hearth-game` scheme named before ready, `gpu-program-cache-size-kb` 32768, `lazyIpc('gamereadymain.js')`.
- `preload.js`: `hub.gameReady`. `lazy-data.js` + `index.html` (the group and its lazy-at tag).
- `dev/smoke.js` (`--profile`, `--profile-fresh`), `dev/run-checks.js` (UNIT, the group, `--profile` passed on, a
  throwaway gltfpack fixture in /tmp).

## Risks
- **▶ Play's window is GameMode's.** On this base there was no GameMode yet: a Lab scene is prepared where the Lab draws
  it (the preview or the Stage window, through `ThreeLab.game`); a GameMode window that runs the sandbox page passes
  its own `port` (tools/game-api.md). An HTML build opens GameReady's own window when GameMode has none.
- While getting ready, a Lab scene keeps drawing behind the card (its game logic runs); an HTML game's frames are held
  until the warm frames (a few frames of its logic run under the card).
- Objects a game *creates* later in play (not just hidden) can't be compiled ahead; hidden ones are.
- KHR_parallel_shader_compile isn't on SwiftShader: compileAsync falls back to compile there (real GPUs have it).
- Texture compression needs a native gltfpack (meshoptimizer's releases); npm's build only compresses meshes. Pictures
  used directly by a scene are never recompressed (full quality, and their loader couldn't read KTX2).
- HTML games: only GLB / glTF swap, and only when the warm run saw a meshopt decoder; scan and copies are kept per
  game folder in data/game-cache/index.json.
- `gpu-program-cache-size-kb` 32768 lets the GPU process keep up to 32 MB of compiled programs in memory as well.
- On SwiftShader the second-launch gain is modest (29–50 % of the shader wait, a few hundred ms); on a real GPU with a
  big game (D3D / Metal compiles of hundreds of programs) it's where most of a cold start goes.

## For the patch notes
- **▶ Play now gets your game ready first.** A calm card ("Getting Clink ready… textures 40/120 · 80 %") loads every
  picture, model and sound, uploads every texture at full quality and compiles every effect before the first frame,
  so the game starts with nothing left to load or compile.
- Works for Lab scenes and for built HTML games (like a game folder with an index.html).
- While it plays, the Lab holds **100 % quality**: no lighter steps, no frame cap.
- The card tells you what your game costs: "1 texture is 4K — it costs 43 MB of video memory", draw calls, shadow lights.
- The second time you play, it's ready sooner: compiled effects are kept on disk.
- **Optimize for play** (on the card) compresses your 3D models into Hearth's own cache. Your files are never changed;
  a changed model is optimized again and the old copy goes to the Trash.
- It needs a free tool (gltfpack); Hearth shows the install command and runs it only when you press Install.
- Play now skips the rest of getting ready; Esc leaves.
