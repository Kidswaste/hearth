# labsmooth54 (round 54): the Lab at 240 Hz while you work on a game with the Three Director

The owner spends most of their time in the Three.js Lab, now on Clink (their three.js game) with the Three Director
docked beside it. This pass worked through that session on a throwaway game-like scene and measured each gesture:
- a director reply streaming in the docked chat;
- director edits landing (the layer hot-swapped in the preview, the playloop path);
- both at once;
- switching layers and opening the layers panel;
- scrolling the code;
- scrubbing the timeline.

It then fixed the biggest frame-time spikes it found. Nothing looks different and nothing behaves differently.
Nothing is added to any prompt (0 tokens). The code paths are the same on Mac and Windows: nothing here is
platform-specific (Chromium canvas / ResizeObserver / timers only).

## How it was measured
- **New check: `dev/checks/labsmooth54.js`.** It runs in the `smooth` group and in its own `labsmooth54` group.
  - **The fixture** is a Clink-like scene with 6 layers: a sky shader; a world with a 2K ground texture, a shadowed sun
    and 24 walls; 160–400 instanced crates with a 2K texture; 6,000 particles; a HUD layer; and a 🧊 GLB model (≈ 2k
    vertices, an animation clip). It has a 90 s song, the director is docked, and the look is Forgeheart.
  - **Input is real** (CDP mouse / wheel). One timeline trace (`dev/trace-stats.js`) is cut into stretches: stream,
    edits, both, switch, panel, code and scrub.
  - **The numbers per stretch**: frames over 4.2 ms / 8.3 ms, the worst frame, tasks over 4.2 ms and the longest
    task, forced style / layout with the line that asked for it, and the top scripts. It also records the three
    longest animation frames (LoAF).
  - **Profiles on demand**: `window.L54_PROFILE = 'edits'` adds a JS profile, with the browser's own calls charged
    to their caller (this is how the toDataURL and timer findings below were found).
- **The preview's picture is held** (❚❚ Freeze) except while scrubbing. Its page runs in the Lab window's process,
  and here it draws with a software GPU, so each of its frames takes hundreds of ms. Those frames would bury the
  Lab's own work. `window.L54_PLAY = 1` keeps it drawing. The preview's GPU side has its own check (lab240gpu).
- **Before** is this round's base (764fb08), run from a copy with the same check, interleaved with the branch over
  2 pairs.
- **This machine** has 4 shared CPUs, software GL and a 60 Hz Xvfb display, and other streams' checks were running
  at the same time. A frame with none of our work already costs more than 4.2 ms here, so "frames over 4.2 ms" stays
  near 100 % on both sides. The worst frame, the longest task and the counts are the reliable numbers. On a real Mac
  or PC the same work is several times cheaper.

## Before → after (2 interleaved pairs, ms)

| Stretch | Worst frame | Longest task | Frames > 4.2 ms | What changed |
|---|---:|---:|---:|---|
| **Director edits landing** (6 edits) | 785 / 475 → **77 / 153** | 692 / 362 → **57 / 56** | 23 / 17 → 18 / 16 | the scene still no longer waits for the GPU; the folded code editor isn't laid out |
| **Layers & sliders panel** (open / close ×2) | 250 / 297 → **93 / 69** | 243 / 281 → **91 / 69** | 21 / 19 → 20 / 18 | the chat's scene still (made when a director turn ends) no longer blocks the window |
| **Switching layers** (12 clicks) | 127 / 119 → **103 / 108** | 125 / 119 → **101 / 91** | 18 / 21 → 18 / 17 | the timeline's layout inside the click: 58 / 49 ms → **0** (forced style / layout total 62 / 54 → 3 / 6 ms) |
| **Scrubbing** (paused, 100 moves) | 134 / 115 → **113 / 111** | 132 / 110 → **106 / 108** | 93 / 96 → 96 / 97 | interval timers made while scrubbing: 72 / 81 → **1** |
| **A director reply streaming** | 108 / 75 → 107 / 127 | 52 / 54 → 33 / 102 | 29 / 29 → 38 / 31 | the usage meter's CPU while streaming: 42–46 → **13–14 ms** per 14 s reply |
| **Edits while streaming** | 182 / 158 → 224 / 166 | 43 / 104 → 49 / 59 | 32 / 31 → 32 / 40 | (as above, inside the noise) |
| **Scrolling the code** | 48 / 62 → 53 / 47 | 46 / 60 → 50 / 40 | 12 / 13 → **6 / 8** | already light |

The counts the check fails on fail on the base and pass on the branch (both pairs):
- scene stills encoded with toDataURL during director work: 2 → **0**;
- interval timers made while scrubbing: 72–81 → **1** (budget 3);
- the timeline drawn inside a layer click: yes → **no**;
- the folded code editor drawn by an edit: yes → **no**;
- freshen.js touching the Lab before its lazy group is in: 1 → **0**.

## What was slow, and the fixes
1. **A chat's scene still blocked the window for up to 0.7 s** (`chat-scenes.js`, `tools/three.js`). When a director
   turn ends, the chat's row gets a small picture of its scene, and the Lab also takes its own thumbnail after a run.
   Both drew it into a canvas and called `toDataURL`. The canvas was on the GPU, so `toDataURL` waited for the GPU to
   finish the Lab's frames, here 200–690 ms in one task, during edits and right after. The canvas now stays in memory
   (`willReadFrequently`) and is encoded off the main thread (`canvasDataUrl` → `toBlob`). The JPEG and its size are
   the same.
2. **A layer switch laid out the whole Lab inside the click** (`tools/three-media.js` `setTracks`). Picking a layer
   rebuilds the Layers list and hands the timeline its tracks, and the timeline drew right away. Its canvas font then
   asked for the page's style and layout in the middle of the click, about 50 ms here, and the frame did it again.
   After a list rebuild it now draws in the coming frame, once. Dragging clips, keys and lanes still draws at
   once.
3. **The hidden code editor was laid out on every director edit** (`tools/three.js` `LabEditor`). The code is
   usually folded away, but every edit or layer switch set its text, and drawing it read the textarea's scroll and
   size, which forced a layout. While folded it now only takes the text, and it draws in full when it shows again (its
   ResizeObserver). Scrolling, highlighting and line numbers are unchanged.
4. **Scrubbing made a timer on every preview message** (`tools/three.js`). The preview answers each seek with
   `media-state`, and each answer restarted the 100 ms "follow the keyframes" timer. On a layer with no keyframes, the
   timer's first tick stopped it again, so a 100-move scrub made 72–81 timers. It only starts now when the selected
   layer has keyframes to follow. The scrub sound's sleep timer and the seek queue's timer are also reused instead of
   being cleared and made again for every grain or seek (`tools/three-media.js`).
5. **The usage meter worked out every cell ~8× a second while a reply streamed** (`meter.js`). That included today's
   sums, the week, the split and the usability count, even with the strip folded away (the default). With the strip
   folded it now works out only what the Usage pill shows.
6. **Two "is the Lab on screen" questions styled the window mid-stream.** These were the scene doctor's blank-frame
   check after a run (`tools/three-doctor-hook.js`) and before / after's still (`tools/three-abcompare.js`). Asked
   from a timer or an idle callback while a reply streams, each one styled the whole page first (up to ≈ 40 ms). The
   cheap answers now come first, and the visibility question is asked right after a frame, when style is fresh.
7. **freshen.js:131 (`keepView`)** looked at the `ThreeLab` global before the Lab's lazy group had loaded, and the
   lazy manifest reported it as an early touch, which can pull in the whole group mid-start. `busy()`,
   `capture()` and `keepView()` now ask `Lazy.isIn('lab')` first. If the Lab isn't loaded, it isn't open, playing or
   holding a scene, so there is nothing to read. Once it's loaded, they read it as before.

## Looked at, left as is
- **The reply's own streaming paint** (`native.js` `repaintPending`) is the largest part of a streaming stretch.
  It's one paint every 60 ms in a frame, and it was tuned in rounds 35–49. It isn't Lab-specific.
- **Opening the layers panel re-runs the layers with sliders attached** (`run({ sync: true })`). With the panel
  hidden, layers run as plain code, which is the long-standing "sliders off" behavior. Keeping them instrumented
  while hidden would change what a hidden panel's unsaved slider moves do to the picture. The panel is open by
  default.
- **The panel's width change redraws the timeline's waveform** at the new size, and the panel's sliders get styled
  as they appear. Both are new pixels and new content.

## Tested
- `node --check` on every touched JS file.
- `dev/checks/labsmooth54.js`: 2 interleaved before / after pairs (above). The branch passes. The base fails every
  count budget and the edit budget.
- `node dev/run-checks.js --exact labsmooth54 lazy unit:boot-test labscrub playloop`: everything passes.
  - labscrub failed once on clip-drag CPU per move (9.9 > 8). The first version of fix 2 deferred every timeline draw,
    including a drag's own frame, so it was narrowed to list rebuilds. After that labscrub and labsmooth54 pass.
  - That last labsmooth54 run, on a quieter moment: a director edit's longest task was 17 ms, a layer switch's 61 ms,
    a panel toggle's 50 ms.

## Edits outside the lane
`meter.js` (one helper, light readings while the strip is folded), `chat-scenes.js` (`shrink`), `freshen.js`
(`labIn`), `tools/three-doctor-hook.js`, `tools/three-abcompare.js` (one guard each), `dev/run-checks.js` (`smooth`
+ the `labsmooth54` group). All small and self-contained.

## For the patch notes
- The Lab stays smoother while the Three Director works on your scene. A chat's little scene picture used to freeze
  the window for a moment (up to more than half a second on a slow computer) after a director edit or at the end of
  a reply. It's now made in the background.
- Clicking between layers is lighter: the timeline redraws once, in the next frame, instead of laying out the whole
  Lab inside your click.
- With the code hidden (the usual way), director edits no longer lay out the hidden code editor. It draws when you
  open the code.
- Scrubbing the timeline does less behind the scenes.
- The usage meter does less while a reply streams.
- After a reload or a crash, Hearth no longer loads the whole Lab early just to check whether it was open.
- Nothing looks different. A new check keeps it this way.
