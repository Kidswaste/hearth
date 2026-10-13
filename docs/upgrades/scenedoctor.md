# 🩺 Fix my scene (round 34, scenedoctor): a free check before you ask the AI

When a Lab scene goes wrong (a black frame, a layer error, the subject gone, everything crawling), the first move used
to be asking the director, which costs tokens. **🩺 Fix my scene** checks the scene on your computer first, with
0 tokens. It writes each problem as one plain sentence and puts a fix button next to it. Every fix is one undo step.
When there's nothing to fix locally, **✦ Ask the director** puts a short, precise request in the director's message
box. It is never sent by itself, and it's about 20–40 tokens instead of a long back-and-forth.

How to get there, no commands needed: **right-click the preview › ✦ More › 🩺 Fix my scene** (first row), **the Lab
toolbar's ⋯ › 🩺 Fix my scene**, ⌘/Ctrl+K "Lab: Fix my scene", and **by itself**: a small calm hint in the preview's
corner when the Lab catches a layer error or the frame comes out blank. The app's internal command is `/fix-scene`.

## What it checks (locally, no tokens)
1. **A layer that throws**: the errors the Lab already catches, one line per layer, with the message and line ("The layer "Sparks" stopped with an error: TypeError: … (line 12).").
2. **A black / blank frame**: all black, all white or one flat color, and **why**: every layer hidden, a layer error, the subject outside the camera's view, or lit materials with no lights.
3. **Everything too dark**: the brightest parts reach only a few percent.
4. **Blown out**: big areas of pure white.
5. **The subject off-screen**: what a layer draws sits outside the frame or behind the camera. It reads each layer's three.js scene itself: objects, their bounds, the camera.
6. **The subject tiny**: under about 1 % of the frame. In a 2D sketch the picture says so, using ▦ All formats' subject reading.
7. **The camera inside an object** (a room or a sky dome you're meant to be inside doesn't count).
8. **NaN / undefined values**: a slider with no number, an object with a NaN position or size, a "NaN" in the console.
9. **Very slow frames** (under 20 fps), with the cause in plain words: thousands of separate objects, hundreds of thousands of particles, a high pixel ratio.
10. **Reacting to music with nothing playing**: a layer that reads `audio.*` or has sliders following the music, with no song and no live sound.
11. **A missing texture or file**: textures that never loaded in the scene, and "failed to load / 404 / not found" lines in the console, with the file's name.

## The fixes (one click, one undo step each)
12. **Hide this layer** (a layer that throws, when other layers are showing): the same Hide as the layer menu.
13. **Show the layers** (a blank frame because they're all hidden or at 0 opacity).
14. **Point the camera at it / Frame it / Step the camera out**: the layer's camera placement, kept with the layer (the same `@camera` placement the scene editor's "📷 Use this view" writes). It keeps the camera's direction and moves to the distance where the whole subject fits. ↶ puts the code's own camera back.
15. **Brighten it / Tone it down**: ✨ Make it look finished's exposure fixes alone (exposure, lift, whites, tone mapping on ◐ Grade), applied without its card. A light that looks deliberate is left alone, and a toast says so.
16. **Reset a NaN slider** to the middle of its range.
17. **Halve the count slider** (count, particles, amount, stars…) of the heavy layer when the scene is slow.
18. **🪶 Light mode**, or **the preview's own lightening switched back on** (labadapt's ladder) when you had turned it off.
19. **Listen to the computer's sound** for a layer that reacts to music with none playing (🎧 Live, system sound). ↶ puts it back as it was.
20. **Every fix is one undo step**: ↶ on its row, ↶ Undo at the bottom of the card (the last fix), or the toast's Undo.
21. **Checked again by itself** a moment after each fix and each undo, so the card shows what's left. Fixed rows stay listed with ✓ fixed and their own ↶.

## Ask the director (when no local fix exists)
22. **✦ Ask the director** on rows with no fix (and a small **✦ Ask** on the others): one precise sentence goes into the director's box, e.g. *Fix the error in layer "Sparks": "TypeError: …" at line 12. Keep the look.* It's not sent, so you read it and press Enter. The button's tooltip shows its size (≈ tokens).
23. With no Three Director yet, it makes one (docked in the Lab), as ✨ Make it look finished does.

## The calm hint (no nagging)
24. **A blank frame**: about 6 s after a run, one 48 px picture is checked, only while the Lab is on screen and not frozen and no sequence is playing. If it's blank, a small hint shows in the preview's bottom-right corner: "🩺 The frame is all black. · Fix my scene · ✕".
25. **A layer error**: the same hint, "🩺 A layer stopped with an error."
26. **Once per problem**: the same sketch's blank frame, or the same layer's same error, never hints twice. This is remembered across restarts (the last 80 problems). The hint goes away by itself after 14 s, never shows while the card is open, and leaves when you switch scenes.

## Ways in
27. **✦ More › 🩺 Fix my scene** (the preview's right-click, first row; the Lab audit lists it).
28. **The toolbar's ⋯ › 🩺 Fix my scene**.
29. **⌘/Ctrl+K "Lab: Fix my scene"**.
30. **For the AI**: `/fix-scene` (alias `/scene-doctor`) · `check` (only list) · `undo` · `status`, plus one line in the app map's lab topic. The director reaches it with `three_do run`. There's no new Director tool and no prompt tokens: the topic is read on demand.

**30 upgrades.**

## How it's built
- `tools/three-doctor-core.js` (`DoctorCore`, no DOM, Node-tested): `picture` (luma mean / spread / percentiles, black and white shares), `subject` (▦ All formats' `FormatsCore.subjectBox`), `probe` (a self-contained function sent through the director's sandbox eval over `__scenes`: per layer its objects, meshes, particles, instances, lights, lit materials, pixel ratio, NaN transforms and bounds, textures that never loaded, the subject's footprint in the camera's view, the camera inside a solid, and a framing that fits the subject's bounding sphere), and `diagnose` (the rules → findings with a fix and a short ask).
- `tools/three-doctor.js` (`SceneDoctor`, lazy group **scenedoctor**, tier `use`): reads the scene (a 160 px shot, `report()` errors / console, layers, sliders and code, the probe, `perf()`, live / song), the card, the fixes (layer data through the Lab's own `capture` / `restore`; sliders through `director.sliders`; Light mode / adapt / live through `ThreeLab.cmd`; exposure through `AutoPolish.run({ only, card: false })`), the undo stack, Ask, `/fix-scene`, the ⌘K action.
- `tools/three-doctor-hook.js` + `tools/three-doctor.css` (in the **lab** group, small): the ✦ More / ⋯ rows, the lazy loader and the calm hint.

## Edits outside the new files (small, additive)
- `tools/three.js`: one line at the end of `run()`, the window event `hearth:lab-ran` (the hint's blank check).
- `tools/three-easy.js`: the ✦ More first row and the toolbar ⋯ row (both guarded by `typeof SceneDoctorHook`).
- `tools/three-autopolish.js`: `run()` takes `only` (keep these fix ids) and `card: false`. Its defaults are unchanged.
- `lazy-data.js` (the hook + css in the lab group, the new `scenedoctor` group, the regenerated manifest), `index.html` (`scenedoctor` on the existing lazy-at.js tag), `mcp/hearth-map.js` (one lab-topic line), `dev/run-checks.js` (the check first in `lab:`, the unit test in UNIT), `dev/smoke.js` (the test scene's deliberate error, `scenedoctorGlow`, is ignored like seqsolid's).

## Tests
- `node dev/scenedoctor-test.js` (unit group), 12 tests on synthetic readings: the picture reader (black, a scene, dim, blown), a healthy scene finding nothing, a throwing layer (one finding per layer; Hide only when other layers show; a hidden layer's old error ignored), a black frame and its four causes with the matching fix, off-screen / tiny / camera-inside (and no camera fix for an orthographic camera or a camera rig; a 2D sketch's tiny subject from the picture), dark / blown → autopolish's exposure ids, NaN (slider reset, object, console), slow (the cause in words; halve a count slider; adapt back on; nothing local left → the director, with the pixel-ratio advice; a parked preview not judged), music with nothing playing, missing files (texture, console 404), every director request ≤ 70 tokens, and the probe's source self-contained.
- `dev/checks/scenedoctor.js` (lab group, `--fake-engines`, ~40 s), **19 steps, all pass**:
  - the ways in, and nothing loaded before use;
  - a black three.js scene with its red box behind the camera: the hint shows by itself ("The frame is all black."), its button opens the card, the black frame is found with a camera fix, and one click puts red on screen (0 → 43 % of the picture), with the `@camera` placement kept on the layer; checked again, it isn't blank any more and the row shows ✓ fixed; ↶ Undo (one step) brings back 0 % red and no placement; running it again shows no second hint;
  - a scene whose "Sparks" layer throws: the error hint by itself, then "stopped with an error … Hide this layer"; one click hides only that layer and the error leaves the list; ↶ shows it again; ✦ Ask puts *Fix the error in layer "Sparks": "TypeError: …" at line 1. Keep the look.* in the director's box, not sent;
  - a scene with 3,000 meshes and a 90 ms busy frame that reads `audio.bass`: "It's slow: 7 frames a second, with 3,000 separate objects" with Halve "Count" (3000 → 1500, ↶ → 3000), and "reacts to music, but no song or live sound plays" with Listen to the computer's sound; `/fix-scene check` lists the same.
- Also run and passing: `sh dev/run-checks.sh lazy unit:boot-test unit:director-mcp-test labeasy autopolish` (`node dev/lazy-manifest.js` regenerated, 0 duplicate commands). The screenshot shows the card on the throwing scene: one row, Hide this layer · ✦ Ask.

## Caveats
- The probe only sees three.js scenes a layer has rendered (`__scenes`). A 2D-canvas or shader-only layer gets the picture checks (blank, dark, blown, tiny) but no camera fix.
- The camera fix keeps the camera's direction and fits the subject's bounding sphere, so a long, thin subject ends up smaller than the frame. A camera on a rig (parented to another object) or an orthographic camera is left to the director.
- "Brighten it" uses ✨ Make it look finished's rules. A scene that is dark on purpose may get no change ("the light looks deliberate"), which is intended.
- "Listen to the computer's sound" needs the system-sound capture to work on that computer. If it can't start, a plain error says so and nothing changes.
- The blank-frame hint takes one tiny picture per run, about 6 s later. It was tested on SwiftShader; on a real GPU the cost is a 48 px JPEG.

## For the patch notes
- New: **🩺 Fix my scene** in the Lab (✦ More, first row, or the toolbar's ⋯). It checks your scene on your computer with 0 tokens and tells you in plain words what's wrong.
- It finds a black or blank frame (and why), a layer that crashed, a scene that's too dark or blown out, the subject off-screen, tiny or with the camera stuck inside it, NaN values, very slow frames (and what makes them slow), layers that react to music with nothing playing, and files that didn't load.
- Most problems have a one-click fix: hide the broken layer, show hidden layers, point the camera at the subject, brighten or tone down, reset a broken slider, halve a particle count or use Light mode, or listen to your computer's sound. Each fix is one undo step.
- When there's no local fix, **✦ Ask the director** writes one short, precise request in the director's box for you to send, a few dozen tokens instead of a long explanation.
- When a layer crashes or the frame comes out blank, a small hint appears in the corner of the preview, just once per problem, and goes away by itself.
- Caveat: the camera fix keeps your camera's direction and fits the whole subject, so you may want to nudge it closer. Cameras on rigs and orthographic cameras are left to the director.
- Caveat: tested with generated scenes on a software GPU; how it reads your real scenes wasn't seen.
