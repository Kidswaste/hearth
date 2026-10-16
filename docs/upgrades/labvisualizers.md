# 🎵 Music visualizer (round 50, labvisualizers): visualizer layers in one click, renders exact, 0 tokens

kinetictype did this for text. This stream does it for music visualizers. Right-click the Lab preview › ＋ Add ›
**🎵 Music visualizer…** opens one picker with **17 live previews**. A click adds the look as a layer. One row of
controls sets what it listens to and how it looks.

The Lab already had visualizer *templates* (the FX pack's Spectrum bars, Radial spectrum, Spectrogram…). They read the
live analyser (`audio.spectrum`), so an export never matched the preview: the offline spectrum is smoothed from frame
to frame. The new looks never read the analyser in a render. Each one is an ordinary layer whose code is a `tweak()`
block plus `visualizer(P, { preset })`. That means it is saved with the scene, its 📐 templates, 📜 recipes and packs
with no extra code. Save, Shuffle, keyframes and ♪ Move with the music work on its sliders. The ✥ handles on the
picture move and scale it.

Files:
- `tools/three-vis-core.js` (`VisCore`, new): the math and the shaders, with no DOM. It covers the song → track
  analysis, the per-frame data, the 17 GLSL looks on one shared header, and the demo song. It runs in the Lab (the
  previews), in the preview / export page (sent as source on first use: `globalThis.viscore`, `LIB_FILES.viscore`)
  and in Node (`dev/labvisualizers-test.js`).
- `tools/three-vis.js` (`LabVis`, new) and `tools/three-vis.css` (new), in a new lazy group `labvis` (tier 'use').
  They hold the picker, apply / change / place / undo, `/visualizer` and the Ctrl/⌘+K action.
- `tools/three-vis-hook.js` (`LabVisHook`, new, in the `lab` group): the ways in (＋ Add row, a 🎵 layer's
  right-click). It loads the rest on first use.
- `tools/three-sandbox.html`: a new "music visualizers" block (`visualizer()`, the song's track, `__labVisReady`,
  `__labVis` for checks), plus one line in `sqFrame` (an export frame waits for it).

## How it stays exact (renders, 240 Hz, idle)
- **The song's own track, worked out once per song in each page.** That means 64 log bands (40 Hz–10 kHz) 60 times
  a second, each levelled against its own loud moments, plus loudness, "travel" (the loudness summed: starfield /
  tunnel speed) and the waveform at 11 kHz. The page decodes the song's bytes and analyses them in a Worker (sliced
  on the page if a Worker can't start). The preview, the sequence and the hidden export page all get the same numbers
  from the same bytes. A 3-minute song takes ≈ 1.1 s (Node). An export frame waits for it.
- **A frame is a function of the song's time alone.** Smoothing is "the highest of the last frames, each a little
  lower the older it is", read back from the track. No state is carried from frame to frame, so any order gives the
  same bytes (unit-tested). Hits come from ♪ Move with the music's sources (your Kick / Snare markers or the hits the
  analysis found, the grid). The last 8 hits are walked back from the playhead.
- **One full-screen shader pass per layer** (a RawShaderMaterial on a 512 × 3 (or 99 for the spectrogram) byte
  texture). No per-frame allocations in the math, which writes into reused arrays. It costs ≈ 0.1–0.2 ms of script a
  frame (Node: bars 0.15, spectrogram 0.19 ms).
- **A paused song uploads nothing.** The same time gives the same signature and no texture upload, so the still check
  skips the frame and the page dozes (idlecpu). The check confirms no upload while paused.
- **Live sound** reads the analyser (real time, as expected). **No song**: a 4 s demo song drawn straight as a track
  (≈ 30 ms once) on the 120 BPM demo beat.

## Upgrades

### The picker (＋ Add › 🎵 Music visualizer…)
1. **🎵 Music visualizer…**: a row in the preview's right-click › ＋ Add.
2. **17 looks as live previews** drawn by the page's own shaders (one WebGL2 canvas for all cards, only the cards in view), playing a demo song; one searchable grid.
3. **Click a look** (or Enter) adds a layer; with a 🎵 layer selected (or opened from one) it **changes that layer**, keeping what it listens to, its colors and picture.
4. **Listens to**: Whole song · Bass · Mids · Highs · Kick · Snare · Beat, plus Voice and Drums (the song's parts) once a song is loaded.
5. **Sensitivity**.
6. **Smoothing** (snappy … slow to fall).
7. **Glow**.
8. **Size** (the layer's own Scale: the ✥ corner handles do the same).
9. **Place**: Middle, Bottom, Top, Left, Right (the layer's Move X / Y; drag it on the picture to fine-tune).
10. **Colors from the scene's palette** (three in a row from the swatch you click), or "Its own".
11. **Picture** for the logo bounce: any picture reference of the scene, or **drop a picture on the picker** (it becomes a reference and the logo bounce uses it).
12. The controls change the selected / just-added layer live, one undo step each; **↶** in the header and Ctrl/⌘+Z while it's open.
13. The controls you used last are remembered (this computer only); arrows move through the grid, Esc closes.

### The looks (17)
14. Spectrum bars (`bars`, with falling peak caps).
15. Circular spectrum (`circle`).
16. Mirrored bars (`mirror`, bass in the middle).
17. Waveform line (`wave`).
18. Waveform ring (`wavering`).
19. Oscilloscope (`scope`, a steady trace on a rising zero crossing, grid and phosphor glow).
20. Radial burst on kick (`burst`).
21. Pulsing rings (`rings`, one per hit).
22. Particle fountain on bass (`fountain`).
23. Starfield that speeds up with the loudness (`stars`).
24. Tunnel lit by the spectrum (`tunnel`).
25. Audio terrain: retro grid floor + spectrum mountains (`terrain`).
26. Breathing blob (`blob`).
27. VU meters with peak hold (`vu`).
28. Spectrogram strip (`spectrogram`, the last ≈ 3 s as a heatmap).
29. Beat flash (`flash`, the color moving through the palette).
30. Logo bounce (`logo`, your picture on the kick, with a glow ring).

### On any 🎵 layer
31. Sliders in Music / Look / Colors groups: Listens to, Sensitivity, Smoothing, Bars, Glow, Size, Color 1–3 (Save, Shuffle, keyframes, ♪ Move with the music work on them).
32. Right-click a 🎵 layer › **🎵 Visualizer › Another look…** / **Listens to ›**.
33. **Renders and exports match the preview**, frame for frame (the song's own track and hits; two renders give the same bytes).
34. Works inside the Lab sequence and the hidden export page (they work the track out from the same song).
35. Live sound drives them too (the analyser), and with no song they move on the demo beat.

### Reach
36. **Lab search** finds it for "music visualizer", "visualizer", "spectrum", "equalizer", "waveform", "oscilloscope", "vu meter", "spectrogram", plus a help answer.
37. **Find anything** (Ctrl/⌘+K): "Lab: 🎵 Music visualizer…" and a help answer.
38. **`/visualizer`** (aliases `/music-visualizer`, `/visualiser`): the picker; `<look>`, `listen <…>`, `sens`, `smooth`, `glow`, `bars`, `place <…>`, `size <x>`, `picture <reference>`, `undo`, `list`.
39. **Directors**: `three_do { cmd: "run", command: "/visualizer rings" }`, explained on demand in the app map's `visualizer` topic (aliases spectrum, equalizer, waveform, oscilloscope, vu, spectrogram). Nothing is added to the per-message prompt or the tool list.

Count: 39 upgrades.

## How it was tested
- `node dev/labvisualizers-test.js` (new, in UNIT, 11 checks). The track's shape; bass bands up on each kick of a
  fixture song and down just before; a frame is a function of time alone (three orders, the same bytes); a paused
  song uploads nothing; the last hits walked back and the pulse; what it listens to (bass vs highs bars, kick drive,
  a part's level); the oscilloscope's trigger; the demo song loops; the 17 shaders (no stray uniforms, balanced);
  the layer code and its in-place edits; the page's copy of the factory gives the same bytes. Passed.
- `dev/checks/labvisualizers.js` (new, in the `lab:` line and its own `labvisualizers` group, 17 steps), on a 13 s
  fixture song whose kicks are **off any grid**:
  - the ways in;
  - all 17 previews draw (all 17 together ≈ 2.5 ms a frame lower quartile, SwiftShader on a loaded machine);
  - three looks added three ways, drawing from the song's track;
  - **every look compiles and draws**;
  - **renders: Beat flash on the kick is dark before each of 4 kicks and lit just after (9→169, 9→169, 10→126, 9→127)**;
  - **two renders at the same 8 times give identical bytes**;
  - **Spectrum bars' bass end jumps on a kick in a render (18 → 114)**;
  - **the preview paused at a time vs the render at that time: mean difference 10/255** (JPEG, scaling);
  - nothing uploaded while paused;
  - one undo per change, `/visualizer place bottom`;
  - saved with the scene on disk.

  Passed (17/17).
- Also run: see the final report (beatlink, kinetictype, music, particles, labpace, idlecpu, lazy, unit:boot-test).
- `node dev/lazy-manifest.js` regenerated (the new group and `/visualizer`).

## Edits outside the new files (small, additive)
- `tools/three-sandbox.html`: the "music visualizers" block (before light physics); `await __labVisReady()` in `sqFrame`.
- `tools/three.js`: `viscore` in `LIB_FILES`; one row in ＋ Add; `LabVisHook.layerMenu` in the layer right-click.
- `tools/three-easy.js`: `LabVisHook` in the layer menu's kinds.
- `tools/three-search-core.js`, `appsearch-data.js`: phrases and help answers. `mcp/hearth-map.js`: the on-demand `visualizer` topic.
- `lazy-data.js`: the hook in `lab`, the `labvis` group (+ regenerated META). `index.html`: `labvis` in the lazy-at tag.
- `dev/run-checks.js`: the unit test, `labvisualizers` in `lab:`, a `labvisualizers` group.

## Not done / risks
- The existing FX "Visualizers" templates (live analyser) are untouched; they still don't render exactly. The new looks do.
- **Found, not fixed (outside this lane):** the page's `sqOffline` decodes `lastMediaBytes.slice(0)`. An export page
  gets the song as a byte view (not an ArrayBuffer), so that decode fails silently there and `SQ.pcm` stays empty.
  This stream's own decode handles both.
- The track costs one decode + analysis per song per page (≈ 1–2 s in a Worker for a long song, once). An export
  pays it again in its own page.
- The hit walk-back calls ♪'s hit functions, which make a small object per call (8 a frame).
- Not tried on a real GPU or a Mac (SwiftShader, Linux). On SwiftShader a full-frame look costs 15–100 ms of GPU.
  On a real GPU it is one cheap pass, and the fountain (5 × 16 particles per pixel) is the dearest.

## For the patch notes
- **Music visualizers in one click**: right-click the Lab preview › ＋ Add › **🎵 Music visualizer…**. 17 looks with live previews: spectrum bars, circular spectrum, mirrored bars, waveform line and ring, oscilloscope, a burst or rings on the kick, a particle fountain on the bass, a starfield, a tunnel, a retro terrain, a breathing blob, VU meters, a spectrogram strip, a beat flash, and your logo bouncing on the kick.
- Pick **what it listens to** (the whole song, bass, mids, highs, the kick, the snare, the beat, or the voice / drums once the song is split), the **sensitivity**, **smoothing**, **glow**, **size**, **where it sits** and **colors from your palette**.
- **Drop a picture on the picker** to make the logo bounce use it.
- **Renders and exports match the preview frame for frame.** The looks read the song's own analysis, not the live sound.
- They're ordinary layers: saved with the scene, templates, recipes and packs, with sliders you can Save, Shuffle, keyframe or move with the music. Drag them on the picture to move or scale them.
- Every change is one undo (↶ in the picker, or Ctrl/⌘+Z while it's open). Right-click a 🎵 layer › 🎵 Visualizer for another look.
- Search "visualizer" or "spectrum" in Lab search or Ctrl/⌘+K. Chat: `/visualizer rings`, `/visualizer listen bass`.
