# Asset library (round 24, assets): one library of everything you make with

Your textures and pictures, HDRI skies, 3D models, fonts, sounds and songs, LUTs, shaders, presets (and videos) now live
in **one library**: from the folders you tell it to watch, what you download in app windows (Meshy, Sketchfab, Suno…),
your renders and captures, and two free CC0 libraries built in (**Poly Haven** and **ambientCG**: search, previews, a
size, a download with a bar). Drag any card onto the Lab, the board, a chat or the sequence and it lands as the right
thing: a texture becomes a picture layer (or the selected shader's input), an HDRI the sky that lights your model, a
model a model layer, a font a text layer, a sound the Lab's song, a LUT the grade.

Light: files stay where they are (a copy only when you say Import), the index is a small file (about 450 bytes per
asset), nothing is scanned when Hearth starts, pictures of the cards are made only for the cards on screen, off the main
thread, and kept on disk. Nothing is added to any prompt: the directors find assets through one short `three_do asset`
line and read the details on demand.

Counted honestly: one line per thing you can see or use.

## The library (Ctrl/⌘+Shift+A, `/assets`)
1. **One asset library** for textures / pictures, HDRIs, 3D models, fonts, sounds / songs, LUTs (.cube), shaders (.glsl, .frag, ISF), presets and videos.
2. **Ctrl/⌘+Shift+A** opens and closes it (in the keys sheet, area Assets).
3. **`/assets [words]`** opens it on those words (also `/asset`).
4. **Ctrl/⌘+K: "Assets: the asset library"**.
5. **A floating panel beside what's on screen**, so its cards drag straight onto the Lab, the board, a chat or the sequence; Esc or × closes it.
6. **By reference**: a file stays where it is; the library remembers where.
7. **Deduplicated by content**: the same file in two places is one card ("Also at 1 other place"), right-click › Duplicates shows where.
8. **Two tabs**: Library (yours) and Free (Poly Haven, ambientCG), one search box for both.
9. **Kinds as small chips** (🖼 🌅 🧊 🔤 🎵 🎞 ◇ 🎚 🎬, only the kinds you have, counts in their tooltips).
10. **★ chip**: only favorites.
11. **Filters ▾**: by tag, by project, by source (your folders, app downloads, renders, captures, Poly Haven, ambientCG, imported, the Lab), and the sort (best match, recent, name, biggest); each active filter is a pill you click away.
12. **Search words and filters in one box**: `brick`, `kind:hdri` (or just `hdri sunset`), `#wall`, `src:polyhaven`, `project:Stoop`, `fav`, `ext:cube`.
13. **Ranked**: name hits first, then tags, where it came from, its folder; favorites and things you used lately come up.
14. **The info line** under the grid: the selected asset's kind, size, license, source and tags (click a tag: only that tag; ＋tag edits them).
15. **Keys in the library**: arrows move, Enter uses, F favorite, T tags, Delete removes from the library, / to the search box, ↓ from the search box into the grid, Shift+F10 the menu.
16. **Bigger / smaller cards** (⋯).
17. **3,000 assets scroll smoothly**: only the cards on screen exist (about a millisecond per screenful here), and only they ask for pictures.
18. **Drop files or folders from your computer onto the panel**: files join, folders are watched.
19. **An empty library says how to fill it**, with a button to the free assets; a search with nothing says so and offers to clear the filters.
20. **Files not on this computer** (your other computer's, an unplugged drive) show faded and aren't used, never deleted from the shared index; ⋯ › Not on this computer lists them.

## Pictures of every card (made off the main thread, kept on disk)
21. **Pictures and textures**: a small WebP of each (PNG, JPEG, WebP, GIF, BMP, AVIF, SVG), with its size in pixels under the name.
22. **HDRIs**: the .hdr decoded and tone-mapped into a picture of the sky (EXR: its card says so).
23. **3D models**: the Lab's own picture of the model once it has drawn it; before that, the GLB's own texture; its triangles and clips under the name.
24. **Fonts**: "Aa" and a line in the font, and the font's real name read from the file ("DejaVu Sans", not "dejavu_sans_v2").
25. **Sounds and songs**: a waveform (WAV read directly, MP3 / M4A / OGG / FLAC decoded by the browser) and the length.
26. **LUTs**: a color sweep, plain on top and through the LUT below: you see what it does before you use it.
27. **Videos**: a frame from the first seconds.
28. **Shaders and presets**: the shader's first comment line; a preset's slider count and the layer it came from.

## Where assets come from
29. **Watched folders**: ＋ › Watch a folder…, `/assets watch <folder>`, Ctrl/⌘+K "Assets: watch a folder…", or drop a folder on the panel.
30. **Scanned off the main thread** (a worker): a folder of thousands of files never stalls Hearth; hidden, dependency and cache folders are skipped.
31. **Nothing scanned at startup**: the first time you open the library, then when a file changes in a watched folder (a few seconds later), and on idle at most hourly.
32. **Unchanged files aren't read again** (same size and time); big files (videos, huge EXRs) are recognised by samples, so a 4 GB render costs a few MB of reading.
33. **Tags from folder and file names** ("Textures/Brick/red_brick_1k.jpg" → #brick #red).
34. **＋ › Watched folders**: each with its count and last scan, Show it, Scan it now, Stop watching; `/assets folders`, `/assets unwatch <folder>`, `/assets scan`.
35. **App downloads join by themselves** when they finish (Meshy, Sketchfab, Suno, Poly Haven's sky picker…), and the ones from before the library loaded on its first open.
36. **Renders join** when they finish.
37. **Screenshots and recordings join** (captures).
38. **Add files by hand**: ＋ › Add files…, `/assets add <path>`.
39. **The apps' downloads picker offers "🗂 In your assets"** (opens the library on that file).
40. **Presets from the Lab**: save the selected layer's sliders as a preset asset (＋ menu, the preview's right-click › 🗂 Assets, `/assets preset [name]`, Ctrl/⌘+K); it goes back on any layer with one drop.
41. **Import a copy into Hearth** (right-click, `/assets import #n`): the file is copied into Hearth's library folder and kept even if the original moves.

## Free assets built in (no account, no key, CC0)
42. **Poly Haven HDRIs** through its public API.
43. **Poly Haven textures**, the color map with its normal, roughness and AO maps kept next to it (right-click › Its other maps).
44. **Poly Haven models**: the glTF and its parts packed into one .glb, so the Lab loads it as a model layer.
45. **ambientCG PBR materials** through its public API: the zip unpacked, the color map indexed with its normal / roughness maps.
46. **ambientCG HDRIs**.
47. **The Free tab**: Poly Haven / ambientCG chips, HDRIs / Textures / Models (or Materials) chips, the search box, results by popularity.
48. **Previews** for each result, downloaded once and cached (they show offline later).
49. **Click a result to download it** into your library at its default size (2K for skies, 1K for textures and models).
50. **Right-click a result**: each size it has (1K, 2K, 4K…), "download and use it now", its page.
51. **A progress bar on the card** while it downloads; a note when it's in, with a Use button.
52. **The size you pick is remembered** per kind.
53. **Tagged and credited**: its categories and tags become tags; the license (CC0) and its page are kept on the asset.
54. **`/assets free <words> [hdris | textures | models | materials] [ambientcg]`** lists them in the chat and opens the Free tab.
55. **`/assets get <polyhaven | ambientcg> <id> [1k | 2k | 4k] [use]`**.

## Use them anywhere
56. **Drop on the Lab preview → by kind**: a picture → a 🖼 picture layer, an HDRI → the sky (it lights the model and shows behind it), a model → a 🧊 model layer, a font → a 🔤 text layer, a sound → the Lab's song, a video → the Lab's footage, a LUT → the grade, a shader file → a ◇ shader layer, a preset → the selected layer's sliders.
57. **A picture dropped while a ◇ shader layer is selected goes into its iChannel** (a texture input), not a new layer.
58. **The 🖼 picture layer**: Fit (cover, contain, stretch, tile), Scale, Left / right, Up / down, Drift, Opacity, Kick punch (0 until you want it).
59. **The 🔤 text layer in your font**: Text, Size, Position, Letter spacing, Color, Glow color, Glow, Kick punch.
60. **Shift+drop on the Lab: the other use**: replace the selected model, a shader input, a sky layer of its own, a sound in the sequence.
61. **Drop on the board**: it lands where you drop it (the board drawer takes it too).
62. **Drop in a chat**: pictures and text files are attached; a font, a model, a sound or a LUT is attached as its picture plus a line with its name, kind, tags and path (the whole file when the chat has file access).
63. **The chat's ＋ menu › From your assets**: your favorites and recent assets, one click attaches.
64. **Drop on the Lab sequence**: pictures, sounds and videos land at the drop time, on the row you drop them.
65. **Double-click or Enter**: the Lab's use for its kind.
66. **Right-click › Use in…**: every place that kind fits (picture layer, shader input iChannel0–3, sky, sky layer, model, replace the model, its animations on the model, text layer with your words, song, sound in the sequence, grade, shader layer, preset, a scene reference, the sequence, the board, any chat).
67. **The Lab preview's right-click › 🗂 Assets**: open the library, the free assets, your six latest assets (one click uses them), save this layer's sliders as a preset.
68. **`/assets use <#n | name> [in sky | picture | model | text | song | sfx | lut | shader | preset | board | chat | sequence…]`**.

## Organise
69. **Tags**: right-click › Tags…, T, the info line's ＋tag, `/assets tag #n wall red` (`+wall -red` adds / removes).
70. **Favorites**: ★ (right-click, F, `/assets fav #n`), shown on the card, first in the chat's menu.
71. **Rename** an asset (right-click) without touching the file.
72. **Projects**: right-click › Project › puts the asset in a project (it shows on the project's page); Filters › Project shows a project's assets (and the files of its folders).
73. **Remove from the library** (right-click, Delete, `/assets forget #n`): the file stays; Undo in the note.
74. **Reveal in Finder / Explorer** and **Copy path** on every card.
75. **`/assets find <words>`** lists matches with numbers for the other verbs; **`/assets dupes`**, **`/assets stats`** (counts by kind, index size, the picture cache), **`/assets thumbs clear`** (⋯ › Thumbnail cache…), **`/assets help`**.

## For the chats (Claude and Astra)
76. **`three_do asset`** for the directors: find (lean results: id, name, kind, tags), use (any of the uses above, in the asking chat's scene), free (search Poly Haven / ambientCG without downloading), get (download one into the library, and use it), help on demand. One short line in `three_do`, nothing else added per message.
77. **The app map knows it** (`help assets`, also asset, library, textures, fonts, sounds, hdris, pbr, ambientcg): what's there, the uses by kind, to prefer your own assets.

## How it was tested
- `node dev/assets-test.js` (12): kinds, names and tags, the index (dedupe by hash, a second place, gone files, favorites kept), normalize, search (words, kinds, tags, favorites, sources, ranking, tag edits), Poly Haven and ambientCG JSON (sizes, fallbacks, maps), LUTs, a real folder of fixtures walked and hashed by the worker job (the duplicate found, unchanged files not read again), sampled hashes for big files, the zip reader, the glTF → GLB packer.
- `dev/checks/assets.js` (smoke, `--fake-assets`: dev/fake-assets.js fakes Poly Haven and ambientCG and makes a fixtures folder with a PNG, an HDR, a GLB with its texture, a TTF, a WAV, a .cube, a shader, a preset, a duplicate PNG and a text file): lazy and registered, nothing written before use, Ctrl+Shift+A, the empty state, `/assets watch` (9 assets from 10 files, the duplicate), a rescan reading nothing new, thumbnails for picture / HDR / GLB / font (its real name) / sound (its length) / LUT cached on disk, search / tags / favorites by command and in the panel, the card menu, 3,000 cards (≈ 1.1 ms median per screenful, ≤ 160 cards in the page), drops on the Lab preview (a model layer, the sky lighting it, a picture layer, a text layer, no Lab errors), `three_do asset` find / help / use (a shader file → a ◇ layer), a drop on the board, drops in a chat (a LUT as its picture + a line, a picture as itself), Poly Haven HDRI / textures with maps / a glTF packed to GLB, ambientCG search and a zip unpacked with its maps, progress events, the Free tab's cards, previews and a click download, an app download indexed, the kv index (≈ 4.9 KB for 12 assets). Passed.
- `lab3d-models`, `qa-commands`, `node dev/director-mcp-test.js` (lean list 1,687 tokens ≤ 1,700), `node dev/apps-unit-test.js`, `node dev/lazy-manifest.js` (compare passed): passed.
- Not run here: the real Poly Haven / ambientCG servers (the adapters follow their documented JSON in `assets-core.js`: polyList / polyFiles / acgList / acgFile, easy to fix), very large real folders, fs.watch on a Mac / Windows (recursive watching is native there; idle rescans cover any platform that can't).

## For development (not counted)
- `assets-core.js` (`AssetsCore`, no DOM, Node-testable): kinds, the index record (short keys), `upsert` / `gone` / `forget`, tags, `parseQuery` / `search` / `counts` / `topTags`, the sources' JSON (`polyList`, `polyFiles`, `acgList`, `acgFile`, `mapRole`), `parseCube` / `lutApply`.
- `assets.js` (`Assets`): kv `assets` (`{ v, items: { hash: record }, folders }`), `add` / `watch` / `scan`, thumbnails (`thumb`, a queue of two, the worker), `use(item, target, o)` / `targets` / `labDefault`, `savePreset`, `importCopy`, `toProject`, `op` (the `three_asset` handler, registered on HubBridge), `away` / `checkHere`. `assets-sources.js` (`AssetsFree`), `assets-ui.js` (`AssetsUI`), `assets-cmds.js` (`AssetsHooks`: drops, auto-indexing, menus, `/assets`), `assets.css`, `assets-thumb-worker.js` (Web Worker), lazy group `assets` (lazy-data.js, 'soon').
- Main side: `assetsmain.js` (one line in `main.js`; `hub.assets.*` in `preload.js`) with `assets-work.js` (a worker_thread: walk + hash; runs in place when a worker can't start); thumbnails in `data/.cache/asset-thumbs/<hash>.webp`, previews in `data/.cache/asset-previews` (hidden: never synced); downloads in Downloads/Hearth/<Source>; imports in `data/assets/<kind>`. `HEARTH_POLYHAVEN_BASE` / `HEARTH_AMBIENTCG_BASE` point at the fakes.
- A LUT drop first fires `hearth:asset-use` ({ kind: 'lut', path, handled }) on window: the grade stream can take it by setting `detail.handled = true`; else `/grade lut <path>` when that command exists; else the LUT becomes a scene reference.
- Small hooks outside the lane: `main.js` (one require), `preload.js` (`hub.assets`), `tools/three.js` (one line: the preview menu's 🗂 Assets), `chat-attach.js` (one line: ＋ › From your assets), `apps.js` (route `assets`), `apps-core.js` (the `assets` target in the downloads picker), `mcp/three-mcp.js` (`asset` in three_do), `mcp/hearth-map.js` (topic `assets`), `dev/smoke.js` (`--fake-assets`), `dev/run-checks.js` (group `assets`, unit test), `lazy-data.js` (+ regenerated manifest).

Count: **77** upgrades.
