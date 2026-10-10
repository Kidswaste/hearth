# The orb (round 10): a new chat's scene is a node-built orb on its own timeline, one clock per scene

You asked: "make the new "New Chat" scene a node scene of an orb that's not necessarily hooked to music, has a
timeline and tie timelines to music timelines and its scene". A new Three Director chat now opens a glowing orb built
as node graphs, in the chat's color, moving on the scene's own timeline (no song needed, frame-exact, keyframes
already on it). Every scene has one clock: its song when it has one, else its own timeline; keyframes, cues, the loop
and the scene's sequence all sit on it, and they travel with the scene. Nothing new on screen except the timeline's
name ("⏱ Scene timeline · 10 s", click it for the length); the rest is chat commands and the directors' tools.

## A new chat's scene: the orb
1. **"＋ New chat" opens a glowing orb** instead of the wireframe starter: a sphere whose surface flows with soft noise, a dim veined core, a bright rim, a halo and a tilted ring of motes, on a gradient backdrop with slow clouds.
2. **In the chat's color**: the chat's color (scenes, round 4) seeds the whole palette (core, rim, halo, the backdrop's middle and edges), so side by side the chats stay recognisable; it takes the color when you send the first message, like before.
3. **Built in layers**: Backdrop at the bottom, Orb (orb + halo + camera) on top; each is its own layer with its own track, so a new effect goes on top as usual.
4. **Built as node graphs**: the Nodes view (Alt+N) shows each layer's graph (Timeline → Glowing orb + Orb halo + Camera → Output; Timeline → Backdrop → Output), editable as nodes or by the director's node tool.
5. **Every knob is a Lab slider**, in groups Orb (core, rim, size, glow, rim sharpness, ripple, lumps, flow, turns), Halo (color, glow size, glow, motes, ring size, mote size, turns, tilt), Camera (lens, distance, height) and Backdrop (middle, edges, middle glow, clouds, cloud drift, vignette): Save, Shuffle, looks and keyframes work on them.
6. **Not hooked to the music**: nothing in it reads the audio; it moves on its timeline. "Make it react" (✦ in the song note, `/make-it-react`) is still how it starts following the music, when you ask.
7. **`/make-it-react` on a scene with no song** says it will move with the music once you load a song or turn on 🎧 Live (instead of silently linking sliders to nothing).
8. **Stays in the frame in tall formats**: in 9:16 and 4:5 the orb and its halo shrink to fit the width (1:1 and 16:9 unchanged).
9. **An untouched starter from before becomes the orb in place** ("New chat" reuses it, as before: no pile of empty sketches).
10. **`/scene new`** gives the chat a fresh orb in its color.

## New nodes and presets
11. **Glowing orb** node (Objects): noise-flowing surface in the vertex shader (nothing per vertex on the CPU), fresnel rim, size, glow, ripple, lumps, flow, turns, all knobs.
12. **Orb halo** node (Particles): a soft glow sprite behind an orb and a tilted ring of glowing motes turning around it.
13. **Backdrop** node (Colors): a full-screen gradient with a glow in the middle, drifting clouds and a vignette; fills the frame whatever the camera does.
14. **Timeline** node (Time): the scene's clock as a node: seconds, a 0..1 loop over a length and a smooth 0..1 breath.
15. Preset **Glowing orb** (⏱ timeline, `/nodes-layer timed-orb`).
16. Preset **Backdrop glow** (⏱ timeline, `/nodes-layer timed-backdrop`).
17. **The Keyframes node follows the scene's timeline**: the song, else the scene's own timeline, else (in a sequence) the clip's own time; with nothing loaded, the layer's own clock as before.

## Every scene has a timeline, no song needed
18. **The scene's own timeline**: a scene with no song gets a timeline (10 s by default) that plays silently, so keyframes, slider keys, cues, the loop and Space work on it.
19. **Frame-exact**: 30 frames a second; every seek, scrub snap and step lands on a frame start; the same frame always shows the same picture.
20. **The counter shows minutes:seconds:frames · frame number** (`00:02:15 · f75`).
21. **← / → step one frame** (Shift: ten) on the scene's timeline; **, / .** too.
22. **Keyframes on it from the start**: the orb breathes (size), its glow swells twice, the camera drifts in and up; all four loop seamlessly over the 10 s.
23. **The Glow curve shows as a lane** under the Orb track, the other keys as ◆ on the track.
24. **It plays from the moment the chat opens**, looping, so the orb is alive; Space pauses it on a frame (a paused scene is a still frame, like a video editor).
25. **Click the timeline's name** ("⏱ Scene timeline · 10 s") for its length: 5, 10, 15, 20, 30 or 60 s (the keyframes stay where they are), or Load a song on it….
26. **The music controls tuck away** on the scene's own timeline (Tap, K S H, live sound, triggers, the grid row); ⋯ shows them, like silent footage.
27. **Keyframes past its end make it longer** (never shorter).
28. **Cues, markers and the loop are the scene's own**: kept with the scene's timeline, back when you come back to the scene.
29. **The playhead is remembered per scene**: switching away and back returns to the same frame.
30. **No more "Load a song first"** for keyframes, ◆ on a slider, animation presets, timeline edits and the Lab's timeline commands (`/loop`, `/cue`, markers…): a scene with no timeline gets its own there and then.
31. **Older scenes with keyframes and no song** get a timeline that holds their keyframes when you open them (they never played without a song before); scenes with a song are unchanged.

## Tied to the music timeline
32. **Load a song on a scene**: its keyframes keep their seconds on the song's timeline.
33. **Its cues and markers come along** onto the song's timeline at the same seconds.
34. **✦ Snap them to bars**: one click in the note that appears once the song's bars are known puts every keyframe and cue on the nearest bar (on a beat for a setting whose keys would share a bar), with Undo.
35. **Take the song out (×)**: the scene goes back to its own timeline, with the cues you placed on the song.
36. **Switching chats or scenes switches all three together**: the scene, its timeline (song or its own) and its sequence.
37. **Duplicate keeps it**: the copy has the same timeline, cues and markers (Sketch menu, Your sketches, a chat's copy, a jam's copy); Claude ⇄ Astra handoffs keep the same scene and timeline.

## The scene's sequence
38. **A scene's sequence starts with the scene** as one clip of its timeline's length when it has no song (it used to start empty).
39. **Leaving the sequence brings back the scene's own timeline** (it used to leave the Lab with no timeline).
40. **Node graphs move the same in the Lab and in the sequence**: inside a clip they follow the clip's own time (sketches can read it too as `layer.scene`).

## Chats and directors
41. **`/scene-timeline`**: what's on the scene's timeline (song or its own, length, fps, frame, keyframes, cues, its sequence).
42. **`/scene-timeline length <s>`**.
43. **`/scene-timeline go <time | f120>`** (frame-exact).
44. **`/scene-timeline play` / `pause`**.
45. **`/scene-timeline snap`**: keyframes and cues to the song's bars.
46. **`/scene`** says when the chat's scene plays on its own timeline.
47. **Directors: `three_do timeline_edit { length }`** sets the scene's own timeline (Claude and Astra).
48. **`three_do timeline_edit { snapToBars: true }`** puts keyframes and cues on the song's bars.
49. **`three_media_control` and the timeline tools work with no song** (on the scene's own timeline); `three_keyframes` with no song makes the timeline the keys play on.
50. **The directors see "no song: the scene's own timeline"** in the media info and reports, instead of "no music loaded (demo beat)".
51. **`three_load_media` on a scene** brings its cues along like the 🎵 button does.
52. **The app map knows it** (topics lab, nodes; the timeline help): one clock per scene, the orb, its nodes; read on demand, no tokens added to any message.

## For testing (not counted)
- `sh dev/run-checks.sh orb` (`dev/checks/orb.js`, fake engines, a reload in the middle): new chat → the orb drawn (pixels: bright middle, dark corners, B in B's color), its node graphs and the Nodes view, nothing reading audio, the 10 s / 30 fps timeline with its keyframes, frame-exact seeks (the same frame twice is the same picture, f75 at 2.5 s, `/scene-timeline go f120`), a cue, `three_timeline_edit { length }`, `/make-it-react` with no song, a song on it (keyframes at their seconds, the cue on the song, beats, ✦ snap to bars), the song taken out, chat B's own orb / timeline / sequence (starting with its scene), switching with ▤ showing, Duplicate, and after a reload everything back.
- `dev/checks/scenes.js` follows the orb starter (its Orb layer carries the color and the knobs).

## For the lead (technical)
- `tools/three-nodes.js`: nodes `orb`, `orbHalo`, `backdrop`, `timeline`; helpers `sceneTime()` (`layer.scene ?? t`), `ORB_NOISE` (GLSL value noise), `aspectFit()`; `ThreeNodes.orbScene(tint)` → `{ layers: [{ name, code, keys, lanes }], timeline: { len, fps } }`, `orbColors(tint)`; presets `timed-orb`, `timed-backdrop`; the Keyframes node uses `sceneTime()`.
- `tools/three-sandbox.html` (one line): `layer.scene` = the clip's time in a sequence, the media's time otherwise, null with nothing loaded.
- `tools/three-media.js` player: `loadClock({ key, seconds, fps, startAt, playing })` (a silent 8 kHz WAV made in memory; path `scene:<sketch id>`; `st.clock`), frame snapping / steps / counter on it, `setClockLength`, `carry(from, to)` (cues + markers between maps), `copyMap`, `clock`, `isClock`, the `clock-length` event, `.mb-clock` on the bar (CSS in `three-lab.css`).
- `tools/three.js`: `extras[id].timeline = { len, fps, time }`; `sceneMedia(id)` (song, else the clock, else nothing) used by `openSketch` and `ThreeLab.scenes.mediaUp`; `timelineOf` (with the migration), `setTimeline`, `ensureTimeline` (keyframes / timeline edits / `needSong`), `fitClock`, `songOnScene` / `songOut` (carry), `snapToBars`; `ThreeLab.scenes.create({ timeline })`, `timelineOf`, `setTimeline`; director `ensureTimeline`, `songOnScene`, `snapToBars`; `timelineEdit { length, snapToBars }`.
- `tools/three-seq.js` (two small edits): `create()` adds the scene as a clip of its timeline's length when it has no song; `leave()` restores the scene's own timeline.
- `chat-scenes.js`: the orb starter (`starterLayers`, `starterSketch`, `makeOrb`, pristine check on both layers' code + keys, the previous starter kept as `legacyStarter`), `/scene-timeline`, `/scene` line. `tools/three-music.js`: the no-song note on `/make-it-react`.
- Data: `data/kv/three-lab-extras.json` `timeline` per sketch; the scene timeline's cues / markers in `three-beatmaps.json` under `scene:<sketch id>`.

Count: **52** upgrades.
