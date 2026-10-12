# Lab live stage (round 22, labstage): the Lab as a VJ instrument

You make music visuals in the Lab. This stream turns it into something you can play live: knobs on a MIDI
controller, scenes in a set list that crossfade on the bar, a clean output on a second screen, and a show mode that
keeps going when something breaks. Nothing new sits on screen until you use it: it lives in **right-click the
preview → 🎚 Live (VJ)**, the old **🎛 MIDI** menu, Ctrl/⌘+K ("Lab: Live …") and **`/stage`** (alias `/vj`).

Files: `tools/three-stage.js` (set list, deck, GO, tempo, output, show mode, menus), `tools/three-stage-midi.js`
(MIDI, learn, soft takeover, keys), `tools/three-stage-cmds.js` (`/stage`), `tools/three-stage.css`; loaded with the
Lab (lazy-data.js lab group).

## Measured
`dev/checks/labstage.js` (fake MIDI controller: `navigator.requestMIDIAccess` stubbed), headless, loaded machine:

| | |
|---|---|
| 500 knob messages in a burst: the hub's work | 3.8 ms (≈ 8 µs a message) |
| … slider updates they caused | 1 (the latest value, once a frame) |
| Crossfade: both scenes drawing at once | yes (the deck at 10–90 % over the live preview) |
| Cut "on the next beat" → the new scene on screen | 1.85 s (≤ 1 beat wait + the scene's start) |
| MIDI clock at 120 BPM (40 ticks) → tempo read | 117 BPM after 0.8 s (exact over a longer run) |
| Per frame while playing a set | nothing in the stage's JS (no rAF loop, no DOM writes; the beat dot is a compositor animation) |

`smooth-lab`, `labhub`, `lazy`, `qa-commands` pass with these changes.

## Upgrades

### MIDI controllers
1. **🎛 Learn knobs**: touch a slider (or just point at it), turn a knob: bound. Learn stays on for the next one until Esc (`/stage midi learn`).
2. While learning, **the slider under the pointer wins** (it gets a dashed outline as you hover), else the last one you touched.
3. A small **learn pill** on the preview says what it's waiting for; click it to stop.
4. **Knobs are kept per scene**: each scene has its own knob layout, and switching scenes switches it.
5. **Learn knobs for every scene**: binds by the slider's name instead ("Glow" on any scene that has a Glow) (`/stage midi learn global`).
6. **Soft takeover**: a knob that doesn't match the slider does nothing until it passes through its value; no jumps after a scene switch or a shuffle (`/stage midi soft on|off`).
7. Takeover starts over when you switch scenes or move the slider another way (your hand, a shuffle, a look).
8. **Pads trigger actions**: GO, cut, next / previous scene, shuffle, the shuffle before, freeze, tap tempo, black-out, play / pause, next look, show mode, cue scene 1–8 of the set list, jump to the song's cue 1–4 (Learn a pad or key ›, `/stage midi pad <action>`).
9. Buttons that send CC (127 / 0) work as pads too: they act on the press only.
10. **Plain keyboard mappings**: the same actions on any key you press while learning; they work while the Lab is on screen (`/stage keys`).
11. **MIDI crossfader**: learn a fader, then slide it to mix the cued scene in; at the far end the scene takes over and the fader's ends swap, like a DJ mixer (`/stage midi xfader`, `/stage xfade 0.4`).
12. **Pitch bend** can be learned like a knob.
13. **MIDI clock in**: a drum machine, DAW or DJ software sending clock sets the stage's tempo (start / stop understood).
14. **Light on the hub**: messages only note the latest value; one frame applies them (500 messages → 1 slider update, 8 µs each).
15. **Mappings list**: every knob, pad, key and the crossfader with its control; click one to forget it (`/stage midi`, `/stage midi forget <n>`).
16. Plugging or unplugging a controller says so; MIDI opens by itself on the next start once you've used it.
17. The older 🎛 MIDI menu links to it ("🎚 Live performance (VJ)…").

### Set list and scene switching
18. **Set list**: your scenes in show order: add this scene, take it out, start from your 8 most recent, clear (`/stage set add|remove|fill|clear`).
19. **Cue a scene**: it starts live in a small **cue monitor** in the preview's corner (a second Lab sandbox), so you see it's right before it goes out (`/stage cue <name>`, 1–8 in show mode).
20. **GO: crossfade**: both scenes run live while they mix, then the Lab takes over the new one underneath (Enter in show mode, `/stage go`).
21. **Cut**: straight to the cued scene on the beat (`/stage cut`, Shift+Enter).
22. **Dip to black**: down to black and up into the new scene (`/stage mode dip`).
23. **Length**: 1 beat, 2 beats, 1 bar, 2 bars, 4 bars (`/stage length 2bars`).
24. **Lands on**: now, the next beat or the next bar (the default) (`/stage quantize bar`).
25. **The next scene is cued by itself** after each GO, so GO, GO, GO plays the set (Set list › Cue the next one by itself).
26. **Next / previous** wrap around the set list (→ / ← in show mode, `/stage next`).
27. In show mode a cued scene with an error isn't sent out on the first GO (a second GO forces it).
28. The cue monitor sleeps while the Lab isn't on screen, like the preview.

### Output on a second screen
29. **Output on the other screen**: the existing Stage window goes fullscreen on the screen Hearth isn't on; the hub stays on your main screen and keeps the keyboard (`/stage output`).
30. **Pick the screen** (Output › Screen: name, resolution and refresh rate) (`/stage output screen 2`).
31. **Output resolution**: the sketch's frame size, fill the screen, 720p, 1080p, 1440p, 4K, vertical 1080×1920 (`/stage output res 1080p`).
32. **Output frame rate**: 60, 50 (projectors), 30, as fast as the screen, auto (`/stage output fps 50`).
33. **Crossfade on the output**: the old picture fades into the new scene there, for the transition's length (and dip to black there too).
34. **Black-out reaches the output** with a short fade (B, the HUD's ■, `/stage blackout`).
35. No mouse cursor on the output.
36. Freeze reaches the output (F, the HUD's ❚❚).

### Tempo and beat-synced sliders
37. **One tempo for the stage**: the song's grid while it plays, else MIDI clock, else your taps (the HUD says which).
38. **Tap tempo** without a song (the HUD's BPM, a pad, `/stage tap`); with a song it also taps the song's grid.
39. **Type a BPM** when no song plays (`/stage bpm 128`).
40. **Beat LFO on any slider**: Live › Beat LFO on a slider › shape › rate, on the last slider you touched (`/stage lfo glow tri 1bar 0.3`, `/stage lfo glow off`).
41. LFO rates from ¼ beat to 8 bars, synced to bars.
42. **The sliders' own waves follow MIDI clock or your taps** when no song plays (they used a free 120 before).
43. New wave shape: **⟍ Ramp down** (also in a slider's ∿ panel).
44. New wave shape: **⊏ Steps** (four steps per cycle).
45. New wave shape: **⌒ Bounce**.

### Show mode (performance safety)
46. **Show mode**: the code, the console, the toolbar and the stats line step away; the picture, sliders and timeline stay (Live › Show mode, `/stage show`).
47. **The show bar**: tempo with a beat dot, the set list as chips (click to cue), GO, black-out, freeze, output, the menu, leave.
48. The beat dot pulses on the beat as a compositor animation, restarted only when the tempo moves.
49. **The frame rate is locked** to the output's (60 by default) instead of Auto stepping mid-set; your setting comes back after.
50. **No accidental reloads**: reloading the window is blocked, and Ctrl/⌘+R doesn't restart the scene.
51. **A scene error holds the last good frame** (also a lost GPU context), with a note on the show bar.
52. **…and the show goes on**: the next scene of the set list comes in on the next bar, unfrozen.
53. **Light mode when frames keep dropping** (3 s below 80 % of the target): steady frames instead of stutter; back off when show mode ends.
54. A thin red edge on the preview while show mode is on.
55. Key: **Enter** = GO (Shift+Enter = cut now).
56. Keys: **← / →** previous / next scene.
57. Keys: **1–8** cue that scene of the set list.
58. Key: **B** black-out.
59. Key: **Shift+Esc** leaves show mode.

### Where to find it
60. **Right-click the preview → 🎚 Live (VJ)**: show mode, GO, cue a scene, set list, transition, tempo, beat LFO, MIDI & keys, output.
61. Right-click the show bar's **GO** for the transition, its **🖥** for the output settings.
62. **`/stage`**: status (scene, cued, set list, transition, tempo, output, MIDI) and every action above; **`/vj`** is the same.
63. Ctrl/⌘+K: Lab: Live show mode on / off · Live: GO · Live (VJ) menu · Live: output on the other screen · Live: add this scene to the set list.
64. The keys sheet lists the show-mode keys and Esc while learning.
65. The directors' app map knows `/stage` (one line, read on demand).

## How it works (for the lead)
- Deck: `ThreeLab._sandbox` (a second sandbox page, like the backstage) placed over the preview's picture; its
  opacity is the mix (WAAPI, compositor). Hand-over: `ThreeLab.scenes.open(id)` under the deck, wait for the
  preview's `stack-drawn`, fade the deck away (280 ms). On the Stage window the deck can't be on top, so the switch uses
  the preview page's own swap cover with a longer fade (`stage-mask { swapMs }`).
- Hooks (small, additive): `tools/three.js` (`api.stageHooks` / `ThreeLab.stageHooks`, `ThreeStage.preview(msg)` at the
  top of the preview's message handler, `touched` and `clock` in the slider controller, the output size in `setStage`,
  the preview's right-click item, a line in the MIDI menu, show mode in `restartVisible`), `tools/three-tweaks.js`
  (rows carry `data-tw-key`; ramp / steps / bounce waves), `tools/three-sandbox.html` (`stage-mask`: a black veil and the
  swap cross-fade length), `main.js` + `preload.js` (`stage:displays`, `stage:place`), `lazy-data.js` (lab group +
  regenerated manifest), `dev/run-checks.js` (labstage in the lab group), `mcp/hearth-map.js` (one line).
- Test: `node dev/smoke.js --check-timeout 300000 --script dev/checks/labstage.js` (or `sh dev/run-checks.sh labstage`).

## Not done / limits
- The cued scene in the deck reacts to the demo beat, not the song, until it takes over (the song's analysis lives in
  the preview page); the hand-over restarts the new scene's clock under a 280 ms fade.
- On the output window the crossfade is from the old scene's last picture into the live new one (one page there).
- Headless, the Stage window's own page can't fetch three.js (smoke.js serves the CDN copy only to the main page and
  its frames), so the check confirms it opens, goes fullscreen, switches and closes, not its picture.
- Show mode blocks quitting too (the page refuses to unload): leave show mode first.

Count: 65 upgrades.
