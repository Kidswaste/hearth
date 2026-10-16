# ▶ Play, lighter textures (round 53, gametex): "Optimize for play" also compresses textures

Clink at max fidelity, smoothly: big textures are what fill a graphics card. **Optimize for play** (the button on ▶ Play's
card, or `/game-ready optimize`) now also compresses the game's textures into **KTX2 (Basis Universal)**, which the GPU
keeps compressed: 4–8× less video memory at the same look. The copies go in Hearth's own cache; your files are only read.
Nothing goes into any prompt (0 tokens), nothing is installed, nothing is downloaded.

## What you see
1. ▶ Play Clink. The card offers **Optimize for play** while pictures or models have no copy yet.
2. Press it. Behind the card, Hearth compresses the scene's pictures and the pictures inside its 🧊 models, one by one,
   and checks each copy against its original. Then the card says what it did, e.g. *"Optimized 1 model and 2
   pictures into Hearth's cache: the next ▶ Play loads the lighter copies. Textures: 51 MB → 14 MB of video memory.
   1 picture kept as it is: compressed it looked different (13.8 dB, needs 42)."*
3. Without gltfpack, the textures are still done (no tool needed for them). The card then also shows the gltfpack
   command for lighter meshes, with **Install** / **Not now**; nothing runs unless you press Install.
4. The next ▶ Play loads the copies. Its card says **"Textures: 51 MB → 14 MB of video memory (compressed copies)"**.
5. On a graphics card that takes no compressed format, the originals load: nothing to gain there.

## How it works
- **The encoder is bundled**: Basis Universal's WebAssembly build (`tools/basisu/`, 1.7 MB wasm + 113 KB glue, from
  `ktx2-encoder@0.5.4`, Apache-2.0 / MIT, see `tools/basisu/NOTICE.md`). It works the same on Mac and Windows with
  nothing to install. It is never on the first screen: it loads only in worker threads of the main process
  (`tools/gametex-worker.js`, up to 3 at a time) while Optimize runs, and they stop after it.
  - Why not a native tool: `toktx` / `basisu` / a native gltfpack mean an extra install on each computer, with no
    package manager that has all of them on both systems. The newer 3.3 MB build refuses pictures over 12 Mpix (a 4096²
    picture); this one encodes 4096² (measured in Node: ETC1S in 54 s, UASTC in 136 s at its slow setting).
- **The format per picture** (`tools/gametex-core.js`):
  - A color picture tries **ETC1S** first: small, 0.5 bytes a pixel on ETC GPUs. It is kept only if it looks the same
    (≥ 40 dB). Otherwise **UASTC** (≈ 50 dB on photos, 1 byte a pixel).
  - Normal maps and data maps (roughness, AO…) are always UASTC; normal maps use the encoder's normal-map mode.
  - The role is read from the scene's code: `normalMap: refTexture('rock')`, through a variable too. Failing that, from
    the name (`_normal`, `_rough`…). In a GLB, the role comes from its materials.
  - A Lab picture is stored bottom row first (three.js flips pictures, a KTX2 can't be flipped at upload); a GLB's isn't.
  - UASTC uses the encoder's fastest level: 0.75 s against 9 s per Mpix for the same 52 dB.
- **The quality guard**: each copy is decoded back with three.js' own Basis transcoder (mip 0 to RGBA) and compared with
  the original's pixels, decoded by the system's own decoder. A copy under the floor (ETC1S 40 dB, UASTC 42 dB) isn't
  kept: the original stays and the card says so. That choice is remembered, so it isn't tried again for the same bytes.
- **The cache**:
  - `data/game-cache/tex/<key>.ktx2`, with the key = the picture's content hash + its role + its orientation + the
    settings' version. The same bytes are never encoded twice.
  - A changed picture's old copy goes to the Trash. The cap is 2 GB / 600 copies, least recently used first.
  - A model's copy is a GLB whose pictures are KTX2 (`KHR_texture_basisu`), made after gltfpack's meshopt step when
    gltfpack is there, or pictures-only without it (made again with meshopt once gltfpack is installed).
  - It has its own cache key (variant `ktx2`), so an HTML build without a KTX2 decoder never gets it.
  - It is kept when it's smaller **or** saves video memory.
- **▶ Play's page**:
  - GameReady arms the window with the picture → copy map.
  - `buildScene` copies each copy next to its picture (`assets/<key>.<ext>.ktx2`; the original stays as the fallback).
  - It vendors three's `KTX2Loader` + `basis_transcoder.js/.wasm` from the same three.js version into the page.
  - `refTexture()` gives the sketch the same texture object at once. It becomes a compressed texture when the copy is
    transcoded (it counts as loading, so the card waits for it) or gets the original picture if the copy can't load.
  - 🧊 models load their KTX2 pictures through lab3d's own KTX2Loader, which now finds the transcoder in the page.
- **The fallback**: the hub reads the GPU's compressed formats once (KTX2Loader's own rules, including its Linux note).
  When there are none, it arms no copies. The page checks again before using one.
- **The report**: the bytes a pixel the GPU keeps follow the format KTX2Loader will pick on this card. On a Mac:
  ETC1S → ETC1 at 0.5, UASTC → ASTC at 1. On Windows: BC7 at 1. Without mipmaps' extra third, a 4096×2048 picture is
  43 MB as RGBA and 11 MB compressed.

## Measured (dev/checks/gametex.js on SwiftShader under Xvfb; the "GPU" is the shared CPUs)
The fixture Clink scene:
- a 4096×2048 photo-like ground (JPEG);
- a 1024² normal map;
- a 512² noise picture (built to fail);
- a 🧊 ship GLB with its own 512² picture.

| | Originals | Compressed copies |
|---|---|---|
| Video memory of the scene's textures (card and the page's own count) | **51 MB** | **14 MB** |
| Ground 4096×2048 | 43 MB | 11 MB (UASTC, 51.0 dB) |
| Normal map 1024² | 5.3 MB | 1.3 MB (UASTC, 49.7 dB) |
| Ship's picture 512² (inside the GLB) | 1.3 MB | 0.33 MB (UASTC, 49.1 dB); the GLB 561 → 380 KB |
| Noise 512² | 1.3 MB | kept as it is (13.8 dB: looked different) |
| The picture on screen, originals vs copies | | mean difference 0.34 levels, PSNR 51.7 dB, max 10 |
| First 5 s of play: shaders / uploads | 0 / 0 | 0 / 0 |

- Optimize took 45 s on the card here (two big pictures, both trying ETC1S then UASTC, on shared CPUs). In Node: a
  1024² picture takes 1 s (ETC1S) or 0.75 s (UASTC fastest).
- The ground's ETC1S try came to under 40 dB on the photo-like picture, so it became UASTC. Flat tiles go ETC1S (43 dB,
  6.5 KB for 512²; unit test).
- Fallback (no compressed formats): no copies armed, nothing compressed, the same picture as before (mean difference
  under 0.5).
- The owner's four files hashed before and after: byte for byte the same.

## Upgrades
### Optimize for play
1. **Optimize for play compresses textures** to KTX2: the scene's pictures and the pictures inside its 3D models.
2. A bundled encoder: nothing to install on Mac or Windows; it runs off Hearth's main thread and only while optimizing.
3. The format that looks the same: ETC1S where nothing changes visibly, UASTC otherwise.
4. Normal maps and data maps always UASTC (normal-map mode), their role read from the scene's code or the model's
   materials.
5. **Quality guard**: every copy checked against its original. A picture that would look different stays as it is,
   and the card says which and why.
6. Textures work without gltfpack. The gltfpack command for lighter meshes is still shown, run only on Install.
7. Copies in Hearth's cache (`data/game-cache/tex`), keyed by content hash. Nothing is encoded twice; a changed picture's
   old copy goes to the Trash; 2 GB cap.
### ▶ Play
8. ▶ Play loads the compressed copies: textures stay compressed on the graphics card.
9. **The card says what they save**: "Textures: 51 MB → 14 MB of video memory".
10. 🧊 Model layers load KTX2 textures in ▶ Play's window (the transcoder now ships with the page).
11. Graphics cards without compressed formats keep the originals.
### Chat
12. `/game-ready` adds the texture line; `/game-ready optimize` reports pictures, models, the video memory saved and
    what was kept.

12 upgrades.

## Tests
- `node dev/gametex-test.js` (UNIT, 41 checks):
  - cache keys; roles from code and names; the format chosen; bytes a pixel on Mac / Windows / Linux / no formats; the
    report; the quality guard and the comparison (with flipping);
  - fresh / stale / kept / missing; ▶ Play's map and its fallback; a GLB's pictures swapped;
  - then the **real encoder** in worker threads on a throwaway folder: tiles → ETC1S, a normal map → UASTC, a smooth
    picture → UASTC, noise → kept; nothing twice; a GLB copy; the originals unchanged.
- `sh dev/run-checks.sh gametex` → `dev/checks/gametex.js` (everything under Measured, through `GameMode.play` and the
  card's real buttons) + `unit:gametex-test` + `unit:gameready-test`.

## Edits outside the new files
- `gamereadymain.js`: Optimize takes pictures and the GPU's formats; a model copy's pictures go through gametex; a
  pictures-only copy without gltfpack; `gameready:texplan`; the armed window's `tex` map and `tx` line; `texFor`,
  `vendorKtx`.
- `tools/gameready.js` (hub): the scene's pictures and their roles, the GPU's formats, the card's words, `/game-ready`.
- `tools/gameready-core.js`: `entryKey` takes a `variant` (unchanged keys without one).
- `tools/gameready-page.js`: the card shows the textures line, and the install offer can follow a done text.
- `gamemodemain.js` (`buildScene` / `hostScript`): the copies next to the pictures, KTX2Loader + transcoder vendored,
  the `ktx2` bytes sent with the references.
- `tools/three-sandbox.html` (Lab player, small and additive): `refTexture` uses a reference's `ktx2` bytes when the
  GPU takes them, otherwise the picture as before. Only ▶ Play's page sends them.
- `preload.js` (`hub.gameReady.texplan`), `lazy-data.js` (`tools/gametex-core.js` in the gameready group),
  `dev/run-checks.js` (UNIT, the `gametex` group, HEARTH_THREE_DIR for it).

## Risks
- **Encoding time**: single-threaded WebAssembly. A 4096² picture can take ~1 min (ETC1S try + UASTC) on a slow
  machine. It runs behind the card with the window responsive, but a big game's first Optimize is slow. The numbers
  here are on shared CPUs; an Apple Silicon Mac is several times faster.
- **Bigger downloads, smaller GPU**: UASTC files are bigger than JPEGs (the 4K ground: 1.9 MB JPEG → 10 MB KTX2).
  Loading reads more from disk; video memory is what drops.
- **Pixel byte order** of the system decoder is read from a known 1×1 picture at first use. If it were wrong, every
  check would fail and the originals would stay (no wrong colors shipped).
- **Pictures with see-through parts** are encoded from the PNG itself and compared in premultiplied space (the system
  decoder premultiplies). Not covered by the check's fixtures.
- **HTML builds**: only their GLBs, and only when the game's loader showed a KTX2 decoder. Pictures an HTML game loads
  with TextureLoader stay as they are (the game's code would need KTX2Loader).
- **The transcoder**: it comes from the same three.js copy ▶ Play uses. If it isn't on disk, it's fetched once from the
  CDN the Lab already loads three.js from (like ⇪ Publish), and kept. Offline at that moment → the originals are used
  and the page's notes say why.
- **Lab player edit**: `three-sandbox.html` belongs to the fx stream; the change is a guarded path that only runs when a
  reference carries `ktx2` bytes (only ▶ Play's page).
- **Repository size**: the first binary in the repo (1.7 MB wasm).

## For the patch notes
- **Optimize for play now compresses your textures too.** The pictures in your scene and inside your 3D models are
  turned into GPU-compressed textures that use about a quarter of the video memory, with the same look. On the test
  scene: "Textures: 51 MB → 14 MB of video memory".
- Every compressed picture is checked against the original. If it would look different, Hearth keeps the original and
  tells you which one and why.
- Nothing to install for this: the encoder comes with Hearth and works the same on Mac and Windows. (Lighter 3D meshes
  still use gltfpack: the card shows its install command and runs it only when you press Install.)
- The next ▶ Play loads the compressed copies, and the card tells you what they save. Your files are never changed.
  On a graphics card without compressed formats, your originals are used.
