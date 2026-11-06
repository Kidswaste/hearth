# Round 139 · cuelooks139: cue looks play in renders, the way the preview plays them

A cue on the Lab timeline can carry looks (`looks: [{ layer, name }]`). The song map (songmap130) and the section moods
(sectionmood138) put looks on cues: Hype on the drops, Calm on the quiet parts. The preview and ◉ Perform played them.
Renders didn't, so the video didn't match what the owner saw.

## The cause
- **The preview** (`tools/three.js` `onCue`, from the timeline's `watchCues` in `tools/three-media.js`). While the song
  plays, each layer plays the look of the last cue at or before the playhead that names it, with
  `ThreeTweaks.controller().playLook(name)`:
  - the look morphs in over 450 ms from wherever the sliders are (smoothstep for numbers; colors and switches change
    halfway);
  - a slider the new look doesn't name goes back to the scene's own value;
  - 🔒 locked sliders and sliders read only at setup are left alone;
  - the same look named again changes nothing, and a look the layer doesn't have changes nothing;
  - keyframes still win: the page re-applies a keyed slider's value every frame. ♪ Follow the music links with a "how"
    win too, because their value comes from the song alone.
- **Every render** (stills, video, the sequence, multiformat, perfect loop, render presets, batch rows, the contact
  sheet) goes through the export page with a plan from `ThreeSeq.compile` → `sceneLayers` → `prepLayer`. That code did
  try to bake cue looks into held slider keys, but:
  1. it read the cues from `S.maps`, the sequence's copy of kv `three-beatmaps`, which is only loaded when ▤ Sequence
     opens. A scene rendered without opening the sequence got **no cue looks at all**. With the sequence opened, it got
     the cues as they were then, not your later edits.
  2. a scene with no song (its own ⏱ timeline) keeps its cues under `scene:<id>`, and the lookup never found them;
  3. even when it found them, it switched hard at the cue (no morph), kept a slider from the previous look when the new
     look didn't name it, and ignored 🔒 locks.
- The export page's `media-map` only carries the cue names and times (for scene code's `onCue()`), never the looks.

## The fix
- `tools/three-seq.js`:
  - `cueLooksOf` works out, per layer, the cues where its look changes (the preview's "last cue at or before t that
    names it", skipping repeats and missing looks).
  - `cueMorphKeys` turns those into the slider's keys, exactly as `playLook` moves it: from the value at that moment
    (mid-morph too) to the look's value, or to the slider's own value when the look doesn't name it. Numbers use
    `ease` keys over `ThreeTweaks.LOOK_FADE` (450 ms; `ease` is the same smoothstep). Other kinds switch at half the
    fade.
  - A keyframed slider, a 🔒 locked one, or one the looks never touch gets no cue keys. ♪ links still override on the
    page (`applyLinks` runs after `applySliderKeys`), as in the preview.
  - The scene on screen uses its timeline's live cues (`liveCues`: `player.cues`, unsaved edits too). Other scenes use
    `S.maps`, now looked up under the song or `scene:<id>`. `loadMaps` is exported.
  - It's frame-exact and deterministic: the keys are on the scene's own clock, so a frame at t is the same every time.
- `tools/three-export.js`: `sceneEdit` (used by every scene render, probe, multiformat and the game-ready export) and
  the sequence source both load the maps fresh first.
- `tools/three-batch.js`: a batch row loads them before compiling.
- `tools/three-tweaks.js`: `LOOK_FADE` (450) is shared by `playLook` and the renders.
- The ▤ Sequence's own preview and renders use the same keys, so a scene clip's cue looks now morph there too.

One deliberate rule: renders follow **playback**. The preview only plays cue looks while the song plays, so a paused
preview shows your own sliders, and a still rendered at that playhead shows the look, as playing through would.

## What else renders missed (checked)
| Setting | In renders? | |
| --- | --- | --- |
| 🎛 Dial keys (mooddial135, section moods) | **Yes** | Baked onto the sliders' own keys, which the export page plays (sectionmood138 A4). |
| Section mood looks (sectionmood138), song map looks (songmap130) | **Yes, now** | These are cue looks: this fix. |
| 🎤 Lyrics (lyrics133) | **Yes** | The lines and their times are in the lyrics layer's code, and per-section styles are hold keys on its sliders. Both are in the plan. |
| ♪ Follow the music links with a "how" (beatlink, audiomap134) | **Yes** | `props.links`, computed from the song's time. |
| **Slider motions** ("move by itself": LFO, random walk, on the beat, pulse, by section; also ✨ Make it look finished's "slow wave") | **No — not fixed** | They're sent by the panel 30 times a second (`motionTick`). The preview plays them only while the Sliders column is open and the Lab isn't parked. The walk is `Math.random` and "section" is a smoothed filter, so neither can be the same frame twice. LFO, beat and pulse could be rendered exactly from the beat position. That needs a rule from the owner (render them always, or only when the panel shows them?) and a page-side evaluator, so it's left as the next step. |
| Old ♪ curves without a "how" (react to a band, pre-round-38) | No (by design since round 38) | They follow the live analyser. The export only plays "how" links. |
| Look cycling (⋯ › Look cycling, `three.lookCycle`) | No (skipped) | An app-wide live toggle, like Perform: not saved with the scene. |
| ◉ Perform's held looks and jumps | No (skipped) | Live only, as asked. ● Rec writes them as cues, and those now render. |
| Backstage scenes (a chat's scene off screen) | No cue looks | It's for the AI's screenshots, not the owner's renders. Not changed. |
| Setup-only sliders (read once, when the layer starts) | Almost always the same | The preview skips them, because they'd need a rebuild. The compile can't tell which sliders those are, so they get cue keys too. This only matters if the layer's setup runs after a cue's look has come in. Then the render would start with the look. Not handled. |

## Tests
One check, **`dev/checks/cuelooks139.js`** (group `cuelooks139`), on its own temp data and the fixture song. The scene
is one layer whose background is its sliders: red = Glow × 0.45, green = Tint, blue = Blue. It has two looks (Warm,
Cold), cue "One" → Warm at 3 s, cue "Two" → Cold at 5 s, and a keyframe of its own on Blue.
1. The preview, playing: the scene's sliders before cue 1, Warm in cue 1, Cold in cue 2. Blue stays on its key.
2. Export stills (`LabExport.render` still) at the same three times: the slider values the export page is sent match
   the preview's, and the pixels match (`[46,51,217]`, `[207,230,217]`, `[69,13,217]` against the preview's values).
3. Mid-morph: 0.225 s into cue 2 is exactly halfway from Warm to Cold, in values and in pixels.
4. Blue keeps its keyframe in every still, and a second render gives the same pixels.

**On the old code** (the four tool files put back), steps 2 and 3 fail: every still was `[46,51,217]`, the scene's own
sliders, in both cues.

Run (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`):
- `cuelooks139` ✓ (48 s), `songmap130` ✓, `sectionmood138` ✓, `renderpre131` ✓, `labchat92` ✓ (5/5 in 6 min);
- `node dev/boot-test.js` ✓ (3125 checks; first screen unchanged, 62 scripts, 1586 KB of 1586).

## For the patch notes
- **Your cue looks are in your renders now.** When a cue on the timeline switches a layer to one of your saved looks,
  like "Hype" on the drop from ✦ Map to the song or 🎭 the section moods, your video, stills, loops and sequence
  renders switch there too, exactly as the preview does when it plays: the look fades in over the same half second,
  and your keyframes still win.
- Before, renders kept your own slider values the whole way through, so the video didn't match what you saw.

## For Codex
No Codex-owned file was edited: `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged, and there's nothing to merge. There's no new data
or store: renders read the cues from kv `three-beatmaps`, as before, and the looks from the scene's extras.
