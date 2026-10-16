# ▶ Play, got ready (round 52, gameready): "load it up properly"

The owner: "I have a project that's a three.js game right now (Clink) and I want it to run buttery smooth at max
graphical fidelity when I take the time to load it up properly." Clink is a Lab scene that can also run as an HTML
build. Both work; the Lab scene is the main path and the best tested one.

**GameReady** is the getting-ready half of ▶ Play: GameMode owns the window, GamePerf the overlay. It is one product
with one window: ▶ Play opens the game's own full-screen window (gamemode). GameReady arms that window before it
opens and does the getting ready **inside it**, behind a calm card shown before the first frame. Nothing new appears
in Hearth itself. Nothing goes into any prompt (0 tokens). The owner's game files are only ever read. The contract is
in `tools/game-api.md`.

New files:
- `tools/gameready-core.js` (pure): cache keys, fresh / stale / missing, the cap, the rewrite map, findings.
- `tools/gameready.js` (lazy group `gameready`): the scan, arming the window, following it through `game:eval`,
  Optimize for play, `/game-ready`.
- `tools/gameready-page.js`: runs first in the game window's page; the card and the getting ready.
- `gamereadymain.js` (main, loaded on first use): hashes, Hearth's cache, the encoder, the arm.
- Tests: `dev/gameready-test.js` (UNIT), `dev/checks/gameready.js`, `dev/checks/gameready-relaunch.js`.

## What the owner sees pressing ▶ Play on a Lab scene
1. ▶ Play (the Lab's toolbar, or `/play Clink`). Hearth shows "Getting Clink ready…" for a moment while it scans and
   hashes the scene's models and looks up their optimized copies.
2. The game's own full-screen window opens. Its first paint is the card: "Getting Clink ready… looking at its files
   · 2 %" on a dark screen, with **Play now**, **Optimize for play** (when a 3D model has no optimized copy yet) and
   "Esc to leave". The scene starts behind it, unseen.
3. The card counts up: "loading 1/1 · 45 %", "textures 2/3 · 60 %", "effects 3/3 · 90 %", "warming up", "ready · 100 %".
   This takes 7–12 s on the test machine's software GPU; a real GPU is much faster.
4. The card fades and the game plays at full quality, with nothing left to compile or upload. In the tests, the first
   5 s of play have 0 shaders compiled and 0 textures uploaded.
5. `/game-ready` in a chat says what it found: "1 texture is 4K — it costs 43 MB of video memory", "3 textures in all:
   49 MB of video memory", "27 shaders compiled ahead". Big alarms (draw calls, triangles, shadow lights) show when they
   apply.
6. **Optimize for play** on the card compresses the scene's 3D models into Hearth's own cache. The next ▶ Play loads
   the lighter copies. With no encoder installed, the card shows the install command with an **Install** button, and
   nothing runs until it's pressed.
7. The second launch of Hearth is faster: compiled shaders survive in Chromium's disk cache.

## How it works
1. **Before the window (hub).** The scan covers a Lab scene's model references, or an HTML build's files from its
   last launch. The models are hashed (SHA-1), Hearth's fresh optimized copies are looked up, and
   `gameready:arm { kind, title, map, opt }` arms the next ▶ Play window.
2. **In the window (gamemodemain's `hearth-game:` handler).** The handler serves `tools/gameready-page.js` on the
   game's own address and puts its tag first in every HTML page. An optimized copy is served for its original's
   address. For a Lab scene, the copy goes into the page's `assets/` instead of the reference. The handler also notes
   what it served: that is the next launch's scan.
3. **A Lab scene** (the page is the Lab's player).
   - The card shows first. Once the scene first drew, the page counts drawing renderers until the number is steady.
   - Then it uses the Lab player's own messages: `ready-scan` gets everything in (models, pictures, sounds decoded,
     videos at their first frame), sets every mipmapped texture to the GPU's best anisotropy, and reports what the
     scene costs.
   - `ready-prep` compiles every shader over every scene each renderer drew (hidden objects too: a pickup that spawns
     later is compiled now) and uploads every texture.
   - `ready-warm` repeats until two passes find nothing new to compile or upload.
   - The page already holds 100 % quality (gamemode).
4. **An HTML build.**
   - The game's frames are held (`requestAnimationFrame`) behind the card.
   - Its three.js renderers and scenes are found through three's own devtools hook (`__THREE_DEVTOOLS__`), without
     touching its code.
   - The page waits for fetch / XHR / pictures / image bitmaps / sound decoding / videos.
   - Then: textures at the best anisotropy with `initTexture`, `compileAsync`, warm frames under the card, and
     compile again.
5. **Following it (hub).** `GameMode.on('start')` starts reading `window.__gameReady.pub()` through `game:eval`: the
   progress, the result, what it found, and the first 5 s of play. The hub answers the card's Optimize / Install with
   `__gameReady.answer(…)`.
6. **The shader disk cache.** ▶ Play's window session is now `persist:hearth-game` (it was in-memory, which keeps no
   shader cache). Everything a game stores itself is still wiped when it ends: cookies, local storage, IndexedDB,
   service workers, cache storage. Chromium's program cache is allowed 32 MB instead of 6.
7. **Optimize for play.**
   - gltfpack compresses models into `data/game-cache`: meshopt with no quantization (the exact same vertices), and
     named nodes / materials / extras kept.
   - Textures become KTX2 UASTC when the gltfpack build can; npm's WebAssembly build can't.
   - A copy is only kept when it's smaller. An HTML game gets one only when its loader showed a meshopt decoder.
   - Copies are keyed by the file's hash, so the same bytes are never optimized twice. A changed file's old copy goes
     to the Trash. The cap is 4 GB / 200 copies, least recently used first. An unreadable index is never written over.
8. **A 🧊 model layer in ▶ Play's window (a fix).** The model runtime's on-demand loaders (GLTFLoader, meshopt, KTX2,
   Draco…) weren't vendored into the scene's page, so a model never loaded in the game window ("Failed to fetch
   dynamically imported module …/GLTFLoader.js"). They're vendored now when a layer uses `lab3d.model`.

## Measured
Both checks run on SwiftShader under Xvfb (the "GPU" is the shared CPUs): counts are exact, times are relative.

**The fixture "Clink" Lab scene.**
- A ground with a 4096×2048 picture and a 1024² detail map.
- A 🧊 ship: a GLB with its own texture.
- Physical, toon, Lambert, Phong and standard materials.
- Sun and spot lights (with shadows), point and hemisphere lights; PCF soft shadows and fog.
- A pickup that only appears 2 s into play.

**The HTML build.** index.html with its own three.js, GLTFLoader and meshopt decoder; the 4K picture; the ship; a
pickup after 2 s.

| ▶ Play, first 5 s of play | Before (no getting ready) | After (GameReady in the window) |
|---|---|---|
| Lab scene: shaders compiled / programs linked | **28 / 14** | **0 / 0** |
| Lab scene: textures uploaded for the first time | **7** | **0** |
| HTML build: shaders / programs / first uploads | **6 / 3 / 5** | **0 / 0 / 0** |
| Lab scene on the optimized ship | — | 0 / 0 / 0 |

- **The card comes first.** It is in the window at 67–125 ms of the page's life; the scene's first frame comes at
  0.6–1.7 s, behind the card. For the HTML build: card at 73–115 ms, first frame at 0.96–1.4 s.
- **Getting ready, inside the window:** Lab scene 7–12 s (assets 0.1–2.6 s, shaders 1.1–1.8 s, warm frames
  1.5–3 s); 17 s with the optimized model (its warm passes run until quiet). HTML build ≈ 1.5–2 s.
- **Found:** "1 texture is 4K — it costs 43 MB of video memory", "3 textures in all: 49 MB of video memory", "27 shaders
  compiled ahead". All 3 textures are at the GPU's best anisotropy (16 here).
- **Second launch** (the same profile; a scene played before the Lab opens, so nothing compiled it in that run yet):
  the window's first frame plus its compile-ahead step went **2,394 → 1,735 ms (28 % less)**. The first frame went
  636 → 597 ms and the effects step 1,758 → 1,138 ms. The wall time to "ready" swings with the machine's load and is
  reported, not judged. A raw probe of 40 heavy programs went 74 → 18 ms in a Lab page.
- **Optimize for play:** the ship went 112,796 → **39,892 bytes** (meshopt). The window's page had the copy and the
  model drew with the same vertex count (2,401). The HTML build got the same copy (same bytes → same key, nothing made
  twice), served for `models/ship.glb` by URL rewrite. Play stayed at 0 / 0.
- **No encoder:** the card showed `npm install -g gltfpack` with Install; nothing ran.
- **The owner's files:** every original file (pictures, GLB, the HTML build's files) hashed before and after is byte
  for byte the same.

## Upgrades
### Getting ready
1. **▶ Play gets the game ready inside its own window**: a calm card before the first frame, "Getting Clink ready… textures 40/120 · 80 %", Play now, Esc.
2. Lab scenes: the scene's model references scanned, everything it loads waited for, every layer drawing first.
3. HTML builds: what the game loaded is kept, so the next launch knows its models.
4. Everything loaded before play: pictures, models (decoders once), sounds decoded, videos at their first frame.
5. An HTML game's frames wait behind the card while it gets ready (its code untouched).
6. Every texture at the graphics card's best anisotropy, with mipmaps.
7. Every texture uploaded before play.
8. Every shader compiled before play, hidden objects included.
9. Warm frames until nothing new compiles or uploads.
10. The first 5 s of play counted: shaders compiled and textures uploaded (0 / 0 when it worked).
11. **What it found**, in plain words: big textures and what they cost in video memory, the total, uncompressed textures, draw calls, triangles, shadow lights, shaders compiled ahead.
12. 🧊 Model layers now load in ▶ Play's window (their loaders and decoders go with the page).
### Launching again
13. ▶ Play's window keeps its compiled shaders on disk (`persist:hearth-game`); what a game stores itself is still wiped when it ends.
14. Chromium's shader cache allowed 32 MB (was 6 MB): a big game's shaders fit.
### Optimize for play
15. **Optimize for play** (one click on the card): 3D models compressed into Hearth's own cache.
16. Exact geometry, names, materials and extras kept; textures as KTX2 UASTC when the encoder can.
17. ▶ Play loads the optimized copy by path / URL rewrite: your files are never changed.
18. Copies keyed by the file's hash; a changed file's old copy goes to the Trash.
19. A 4 GB / 200-copy cap, least recently used first; an unreadable index is never written over.
20. No encoder: the install command shown on the card, run in a visible window only after a click on Install.
### Chat
21. `/game-ready [optimize]`: what ▶ Play found last time; optimize the last game's models.

21 upgrades.

## Tests
- **`node dev/gameready-test.js`** (UNIT, 44 checks):
  - cache keys; fresh / stale / missing; the cap and least recently used;
  - the rewrite map (file:// URLs, escapes, Windows slashes and letter case);
  - findings, the card's words, what may be optimized, the gltfpack flags, the install plan;
  - the main process' plan on a throwaway folder: the hash memo, a copy whose file went, an unreadable index left
    alone.
- **`sh dev/run-checks.sh gameready`** runs `dev/checks/gameready.js` (everything above, through `GameMode.play`), then
  `dev/checks/gameready-relaunch.js` on the same Chromium profile (smoke.js `--profile` / `--profile-fresh`), plus
  gamemode, gameperf, presentready, lazy, unit:boot-test, unit:gamemode-test.

## Edits outside the new files
- `gamemodemain.js`:
  - the session is `persist:hearth-game`, with the game's own storage wiped when it ends;
  - the handler asks gamereadymain for the optimized copy and the page tag, and notes what it served;
  - `buildScene` copies a reference's optimized copy and vendors the model runtime's loaders.
- `gamemode.js`: `Lazy.load('gameready')` before `GameReady.prepare` (a lazy global reads as undefined until loaded).
- `tools/three-sandbox.html`:
  - `ready-scan`, `compileMs` in `ready-prepped`, `renderers` in `ready-count`;
  - sounds decoding and 🧊 models loading count as loading;
  - a shader-wait counter; `__rdyLive` / `__rdyGl` for checks.
- `main.js`: `gpu-program-cache-size-kb` 32768; `lazyIpc('gamereadymain.js')`. The `hearth-game` scheme is
  gamemode's, registered once.
- `preload.js`: `hub.gameReady`.
- `lazy-data.js` / `lazy-meta.js` (the group, the manifest), `index.html` (its lazy-at tag), `tools/game-api.md`
  (the GameReady section).
- `dev/smoke.js` (`--profile`, `--profile-fresh`).
- `dev/run-checks.js`: UNIT, the group, `--profile` passed on, HEARTH_THREE_DIR for `gameready*`, a throwaway
  gltfpack fixture in /tmp.

## Risks
- **The scene runs behind the card.** While getting ready, a Lab scene already runs behind the card, so its game logic
  starts. An HTML game runs only its warm frames under the card.
- **Late objects.** Objects a game *creates* later in play (not just hidden ones) can't be compiled ahead.
- **Disk cache vs a fresh session.** ▶ Play's session is persistent now, for the shader cache. Game storage is wiped
  at the end of each game, but the HTTP cache is kept (Hearth serves the files with no-cache anyway).
- **Texture compression** needs a native gltfpack (meshoptimizer's releases); npm's build only compresses meshes.
  Pictures a scene uses directly are never recompressed.
- **What Optimize does now.** It makes copies for the *next* ▶ Play; the game already playing keeps its originals.
- **KTX2 in the window.** The KTX2 transcoder files (basis `.wasm`) aren't vendored into the Lab page, so a KTX2
  texture from a native gltfpack would need them. The current npm encoder makes none.
- **The second-launch gain is modest here.** On SwiftShader it's about 28 % of the first frame + compile step, a
  few hundred ms. On a real GPU with a big game, cold compiles are most of a cold start.

## For the patch notes
- **▶ Play now gets your game ready first, in its own window.** A calm card ("Getting Clink ready… textures 40/120 ·
  80 %") shows before anything draws while every picture, model and sound loads, every texture is uploaded at full
  quality and every effect is compiled. Then the game starts with nothing left to load or compile.
- Works for Lab scenes and for built HTML games (a game folder with an index.html).
- 🧊 3D models in a Lab scene now load in ▶ Play's window too.
- Ask `/game-ready` what it found: "1 texture is 4K — it costs 43 MB of video memory", draw calls, shadow lights.
- The next time you start Hearth, games are ready sooner: compiled effects are kept on disk. What a game saves itself
  is still wiped when you leave it.
- **Optimize for play** (on the card) compresses your 3D models into Hearth's own cache for the next ▶ Play. Your files
  are never changed; a changed model is optimized again and the old copy goes to the Trash.
- It needs a free tool (gltfpack): the card shows the install command and runs it only when you press Install.
- Play now skips the rest of getting ready; Esc leaves.
