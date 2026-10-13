# labeasy (round 26): the Three.js Lab without commands

The owner hid the commands ("I hate commands"; "/" opens no menu). About 180 Lab features were reached mostly by typing
one. This stream audited every Lab command in the running app, gave the ones that had no button a home where they
belong (in plain words, behind one level), added Lab missions to the director's ◎, and took "/command" talk out of the
Lab's visible hints. The commands still run (they are the app's internal API); the new menu rows run them for you.

Files: `tools/three-easy.js` (menus, missions, plain answers), `tools/three-easy-data.js` (where every other Lab
command already lived), `dev/labeasy-audit.js` (the audit), `dev/checks/labeasy.js` (the check, in the `lab` group).
Hooks elsewhere (small, additive): one line each in `tools/three.js` (preview right-click, toolbar ⋯),
`tools/three-layers.js` (a layer row's right-click), `missions.js` (`Missions.add`), the lab group in `lazy-data.js`.

## The audit
`node dev/smoke.js --script dev/labeasy-audit.js` lists every command of the areas "Three.js Lab", "Lab" and
"Director" from `Commands.list()` in the running app and where its feature lives. The new menus are walked, so the
"now in" column is always true; the homes the features already had were checked by hand
(`tools/three-easy-data.js`). A Lab command added later without a place shows up as "unsorted" (the check fails).

**206 Lab commands: 22 had no button or menu entry (now they do) · 152 had a home already (11 of them now also in a
new menu) · 7 are facts the director tells you when asked · 14 stay commands (power / diagnostic) · 0 unsorted.**

| command (had no button) | now in |
|---|---|
| make-it-react | Preview right-click › ✦ More › ♪ Music › ✦ Make it react to the music (and a layer's right-click) |
| react-off | ✦ More › ♪ Music › Stop everything following the sound (a layer's right-click: Stop it following the sound) |
| drops | ✦ More › ♪ Music › Jump to the next drop |
| cue (next / prev) | ✦ More › ♪ Music › Next cue · Previous cue |
| auto-preset | ✦ More › ♪ Music › Pick the triggers from the song |
| click-track | ✦ More › ♪ Music › Click on every beat (was Ctrl+K only) |
| cut-loop | ✦ More › ♪ Music › Save the loop as its own file |
| analyze | ✦ More › ♪ Music › What's in the song |
| song-features | ✦ More › ♪ Music › Its key, drops and builds |
| surprise | ✦ More › ✨ Look & motion › 🎲 Surprise me › A filter / layer / look / palette |
| hearth-on-screen | ✦ More › ✨ Look & motion › Put Hearth on screen (was Ctrl+K only) |
| motion-intro | ✦ More › ✨ Look & motion › A motion intro › 9:16 / 16:9 / 1:1 / 4:5 (was Ctrl+K only) |
| cursor-path | ✦ More › ✨ Look & motion › A cursor tour |
| blackout | ✦ More › ✨ Look & motion › Fade to black and back |
| crew | ✦ More › ⇪ Make › 👥 4 variations of this scene… (and the ◎ mission "Make 4 variations") |
| render-again | ✦ More › ⇪ Make › Render this chat's sequence again |
| lab-state | ✦ More › ℹ What's going on › What the Lab shows now |
| audio | ✦ More › ℹ What's going on › What the Lab hears now |
| ease | Layer right-click › More… › Ease every keyframe… (was Ctrl+K only) |
| task | Toolbar ⋯ › Director › What it is making |
| director-cost | Toolbar ⋯ › Director › What it costs per message |
| director-setup | Toolbar ⋯ › Director › Make the Three Director (only when it's missing) |

Already had a home (by place): the ＋ Layer effects picker (motion kit, brand looks, camera moves, end cards, logo
reveals, Hearth UI, kinetic / 3D type, shot list…); the layer list; the preview's right-click (freeze, sizes, capture,
view, comp, 3D, shaders, particles, type, camera, physics, live / stage incl. phone remote, OSC, OBS, MIDI out, Link,
grade, export); the preview's buttons (guides, fps, still, stills, compare); the toolbar; the sliders panel (save,
shuffle styles, tame, exaggerate, slots, morph, looks, copy / paste values, a slider's right-click: react, move, MIDI,
lock, favorite); the timeline and its right-click (tap, markers, BPM, bar 1, grid, snap, loop, cues, sections, trim,
record, presets, triggers, live input / loopback); the footage frames menu (every cut / step / shuttle / hold
command); references; the sequence and the time machine; the docked director (undo / redo, activity, picture).
Just ask the director: cues, fx-list, motion-list, motion-words, live-status, pace-check, scene-timeline.
Kept as commands: knob, frame-check and the director's diagnostics (director-tools / -stats / -try / -guide / -mode /
-shot-size / -autoshot / -chips / -clear / -ask, astra-tools, director).

## Upgrades
### ✦ More in the preview's right-click (one entry; four groups behind it)
1. **✦ More** in the picture's right-click menu: ♪ Music · ✨ Look & motion · ⇪ Make · ℹ What's going on.
2. ♪ **Make it react to the music**: sensible sliders follow the kick, bass and loudness; the toast has **Undo**.
3. ♪ **Stop everything following the sound** (every layer).
4. ♪ **Jump to the next drop**.
5. ♪ **Next cue**.
6. ♪ **Previous cue**.
7. ♪ **Pick the triggers from the song** (from its style and tempo, says why).
8. ♪ **Click on every beat** (hear the grid; again: off).
9. ♪ **Save the loop as its own file** (next to the song, ffmpeg).
10. ♪ **What's in the song**: tempo, bar 1, sections, drops (a small card).
11. ♪ **Its key, drops and builds**.
12. ✨ **Surprise me** › a filter, a layer, a look or a palette.
13. ✨ **Put Hearth on screen** (a whole shot in a new sketch).
14. ✨ **A motion intro** › 9:16 / 16:9 / 1:1 / 4:5 (logo → Hearth on screen → end card, as a sequence).
15. ✨ **A cursor tour** (a cursor glides and clicks around the frame).
16. ✨ **Fade to black and back**.
17. ⇪ **4 variations of this scene…** (a few words on what to explore; the crew shows its cost first).
18. ⇪ **Render this chat's sequence again**.
19. ℹ **What the Lab shows now** (sketch, layer, frame size, song, tempo).
20. ℹ **What the Lab hears now** (hits, bands, loudness, beat).
### Toolbar ⋯ › Director
21. **Director ›** in the Lab toolbar's ⋯.
22. **What it is making** (and how far it got).
23. **What it did lately** (its latest tool calls).
24. **What it costs per message**.
25. **Its last picture, bigger**.
26. **↶ Undo its last code edit**.
27. **Make the Three Director** (shown only when there is none).
### A layer's right-click (Layers list; new)
28. Right-click a layer: its own menu (it selects the layer first).
29. **Hide / Show**.
30. **Show only this one** (again: all).
31. **Rename…**.
32. **⧉ Duplicate**.
33. **✦ Make it react to the music** (with Undo).
34. **Add a filter above…** (the effects picker on Filters).
35. **Apply a look…** (the picker on Looks).
36. More… › **Blend…**.
37. More… › **Animate…** (bounce in, heartbeat, punch zoom…).
38. More… › **Ease every keyframe…**.
39. More… › **Recolor with the palette**.
40. More… › **Stop it following the sound**.
41. More… › **Reset its sliders to the code**.
42. More… › **💾 Save its sliders into the code**.
43. **Delete this layer** (at the bottom, red; not on the last layer).
### Lab missions in the director's ◎ (only in the Lab's director chat)
44. 👥 **Make 4 variations**: a crew of 4 explores your words on copies of the scene; you pick one (the generic
    "Swarm" steps aside in the Lab: this is what it did there).
45. ♪ **Make it react to the music**: your words go with a short visible brief (kick, bass, loudness, drops, calm parts).
46. 📱 **Make a 9:16 version**: the frame goes 9:16 first, then the director recomposes for vertical, clear of the
    app buttons.
47. 🎨 **Polish the look**: grade, palette, light, glow, texture; the motion and timing stay.
48. 🎬 **Render it**: finish, render the final video in the best quality at this frame size, say where it is.
49. In the Lab director's ◎ the Lab missions come first, right after "Just answer"; once or 📌 from now on, like the
    others. The brief is part of the message you see in the chat (nothing hidden).
### Plain words
50. What a menu row's command says comes as a toast (a small card when long), without markdown and without the
    "/command" asides it had for typing.
51. The director's chat box no longer says "(/ for commands)".
52. "Add a quick chip": no "start with / to run a command".
53. 🎛 Jam chip: "or pick 🎛 Jam in ◎ and write your idea" instead of "/jam <idea>".
54. Preview ⋯: Safe zones (TikTok, Reels, Shorts), Light mode and Perf HUD hints without commands.
55. Sketch ▾ › Publish & Adobe hints without /deploy, /photoshop.
56. ◐ Grade: the preview entry and the effects picker's Grade tab in words.
57. ◇ Shaders: the preview entry and the workbench's ? in words.
58. Time machine: Branch / Back rows and their keys-sheet lines without /branch, /back, /history.
59. ✦ Astra picks (effects picker, looks) and "Shuffle 4, pick one" tooltips without /decide, /shuffle-pick.
60. Crew grid: ■ and ✕ tooltips without /crew.
61. Timeline: the grid nudge hint points to ✦ More › Music › Click on every beat; the trim toast points to "Untrim
    the song".
62. Particle / physics presets (picture in particles, jelly pyramid, flag): descriptions in words.
63. ▤ Sequence tab tooltip, loopback how-to, "nothing cued" (live), frame-mode hint, the scene mark's tooltips, the
    comp / motion-kit / lyrics tap-along keys-sheet lines: in words.

## Tests
`node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/labeasy.js` (also `sh dev/run-checks.sh
labeasy`): 27 steps, all pass — the audit (206 commands, none unsorted, 22 newly placed, every row's command exists),
a real right-click in the preview → ✦ More → Music / Make, toolbar ⋯ › Director (a row runs and shows its answer
without "/command"), a layer's right-click (rows, More…, Hide then Show for real), Surprise › A filter adds a layer,
Click on every beat toggles, the plain-words filter, the Lab missions (only for the Lab director; Swarm hidden there,
present elsewhere; ◎ in the dock lists them; one sent for real through the dock's chat box and answered by the fake
engine, brief visible in front; the others with sending stubbed; 9:16 sets the frame), and no visible "/command" in
the Lab pane, its dock, placeholders and every menu the check opened.

## Risks / not done
- The "had a home" column is checked by hand from the menus' code, not by clicking every menu.
- Command answers printed by commands themselves (typed or from tools) still mention commands; only answers shown by the
  new menu rows are cleaned. Tool texts meant for the director were left alone.
- `missions.js`, `native.js` (placeholder) and other streams' Lab files got one-line text edits; merges should be easy.
