# ♪ Move with the music (round 38, beatlink)

Goal: in the Three.js Lab, "make this move with the music" is one gesture and 0 tokens, on any slider. Pick what
drives it (the beat, the bar, the kick, the snare, the hi-hats, the bass, the mids, the highs, the vocals, the drums,
the loudness), pick how it moves (pulse on each hit, follow the level, step through values, random on each hit), and
drag two handles on the slider for the range. It renders the same every time and works with live sound.

It is not a new system next to the old ones. A slider's music link was already one entry per slider (the scene's
`bindings`, used by the ♪ panel, the curve editor, `/react-to`, the presets and ✦ Make it react). This stream gives
that entry a "how" and a range (`{ band, how, lo, hi, att, dec, steps, glide, seed }`) and puts it one click away.
Because it is the same entry, it is saved with the scene, its looks, 📐 My templates and `.hearthpack` packs with no
extra code. The older curves still work; the card offers them under More ▾.

New files (in the `lab` lazy group, loaded with the Lab):
- `tools/three-beatlink-core.js` (`BeatLinkCore`): the math, no DOM. The same file runs in the Lab, in the preview page (sent as source the first time a link needs it, like the motion kit) and in Node (`dev/beatlink-test.js`).
- `tools/three-beatlink.js` (`BeatLink`): the card, the range handles on sliders and knobs, the badge, the Lab menu row, `/move-with`, the Ctrl/⌘+K action.
- `tools/three-beatlink.css`.

## How it stays the same in every render
The preview computes a link's value from **the song's time alone**:
- **Hit drivers** (beat, bar, kick, snare, hats) use sorted lists of times. Beats come from the timeline's grid (yours, or the analysis's). Bars are counted from bar 1. Drum hits are your Kick / Snare / Hats markers when the song has them, otherwise the hits the song analysis found. A pulse is `1` on the hit, then falls over the fall time. A step or random value is picked by the hit's number.
- **Level drivers** (bass, mids, highs, loudness) use the song analysis's 30 fps envelopes. Vocals and drums use the song's parts (the stems split). Bass uses the parts once they are split. Smoothing is a follower run back from a few time constants before `t` in 10 ms steps, so the value at a time doesn't depend on what was computed before.
- Random values come from a hash of (seed, hit number), so 🎲 gives another repeatable sequence.
- The Lab sequence and the hidden export page get each layer's links in the plan (`props.links`, `tools/three-seq.js`). The page writes them into the layer's values every frame, after its slider keyframes. An export frame waits for the math before its first frame.
- **Live sound** (the computer's sound through a loopback device, or a mic) uses the same shapes on what it hears now. Drum hits are the rising edges of the heard kick / snare / hat pulses. Beat and bar come from the live tempo. Levels are followed in real time.
- **No song**: the 120 BPM demo beat on the page's clock (in a sequence or an export, the program's own time, still exact).

## Measured / tested
| | |
|---|---|
| Unit (`node dev/beatlink-test.js`, 17 checks) | pulse / follow / step / random on hit and level drivers, bars from bar 1, rise and the last hit's tail, glide, a 100-frame "render" twice gives identical numbers, the follower is independent of call order, the live follower, a new link's range, typed words, the page's copy of the factory gives the same values |
| In the app (`dev/checks/beatlink.js`, 28 steps) | right-click › ♪ Move with the music… links the slider (one undo step); Kick + Pulse; the badge; the "to" handle dragged around the knob (one undo step, the knob itself doesn't turn); `/move-with … from 0.2 to 1.8`; **during playback every sample of the slider equals the pulse of the song's kicks at the playhead (130 / 130)**; paused values repeat; **two renders from the export page give the same JPEG bytes, kick frames brighter (231 vs 87)**; live sound (a stubbed loopback device playing the song) pulses about twice a second; undo walks back one change at a time; switching scenes keeps it; it is in the scene's pack and in a scene made from My templates; an older `/react-to` curve is kept until a choice is made; the slider layout's band + handles; Lab search and Find anything put it first for "move with the beat" / "pulse on kick" |
| Cost | Nothing until a slider has a link (the math is sent to the page then). Per linked slider per frame: one binary search (hits) or ≤ 400 envelope reads (smoothed levels), computed once per frame time. The card's meter repaints ≤ 12×/s, only when it moved. |

Also run: `stems`, `labaudio`, `music`, `labsearch`, `seqsolid`, `labhub`, `labeasy`, `lazy`, `unit:boot-test`,
`unit:director-mcp-test`, `unit:labsearch-test`, `unit:appsearch-test`, `unit:stems-test`, `unit:music-test` all pass.
`unit:audio-test` fails only its two speed steps under machine load ("analysed faster than real time", "song in < 4 s").
Its code is untouched by this stream.

## Upgrades

### One gesture on any slider
1. **♪ Move with the music…**: the first row of a slider's right-click menu (knob or slider). Its hint says what it does now.
2. **The ♪ next to a slider opens the same card** (it shows on hover, and stays lit while the slider moves with the music). The older ♪ panel is under the card's More ▾.
3. **A sensible first pick from the slider's name**: hue / angle / offset → step on each bar; speed / amount / chaos → follow the loudness; glow / bright / spark → pulse on the hats; anything else → pulse on the kick. The range starts where the slider sits and goes a third of the way up (down when it sits near the top).
4. **What drives it**: Beat, Bar, Kick, Snare, Hi-hats, Bass, Mids, Highs, Vocals, Drums, Loudness. One chip each.
5. **Pulse**: it jumps to the top on each hit and falls back.
6. **Follow**: it rides the level. On the beat or the bar it is a sweep across each beat or bar.
7. **Step**: the next of 2–8 values on each hit, round and round (a level steps on each beat).
8. **Random**: a new value on each hit, the same every render.
9. **Rise** and **Fall** (ms) for pulse and follow.
10. **Steps** and **Glide** (slide to the next value instead of jumping) for step, and Glide for random.
11. **🎲 Other values**: another random sequence, still repeatable.
12. **The range on the card**: a bar with two handles and a live dot showing where the slider is now, plus "from → to" in numbers.
13. **A live meter of the driver** on the card (what the preview hears for it now).
14. **Stop** (it stays where it is) and **Done**. Esc or a click outside also closes the card.

### On the slider itself
15. **Range handles on a slider**: a cyan band under the track with a "from" and a "to" handle. Drag them. The thumb stays free.
16. **Range handles on a knob**: a cyan arc just outside the ring with a handle at each end, dragged around the knob. The knob itself still turns.
17. **♪ badge**: a linked slider's ♪ reads "♪ Kick · pulse". A knob's ♪ lights up and its tooltip says what it follows.
18. **The thin live meter** under a linked slider (labaudio's) shows what the music does to it.

### Safe and saved
19. **One undo per change** in the sliders' own undo (↶, Ctrl/⌘+Z): linking, the driver, the how, a whole drag of a handle, a whole drag of a card field, Stop, `/move-with`.
20. **An older curve is kept** (`/react-to`, the curve editor, ✦ Make it react) until you pick something in the card. Then one undo brings the curve back.
21. **Saved with the scene, its 📐 My templates and its `.hearthpack` packs** (the scene's music links).
22. **Renders and exports match the preview**, frame for frame: the export page and the Lab sequence carry the links.
23. **Live sound**: the computer's sound (a loopback device) or a mic drives the same links.
24. **The song's parts**: Vocals and Drums use the stems split (a stand-in until it is ready). Bass uses it once it is there.
25. **No song**: links move on the 120 BPM demo beat.

### Find it, ask for it
26. **`/move-with <slider> <driver> [pulse|follow|step|random] [from X to Y] [rise= fall= steps= glide=]`**, `/move-with <slider> off`, `/move-with undo`, and `/move-with` alone lists the links (aliases `/beatlink`, `/move-with-music`). It completes slider names, drivers and hows.
27. **Right-click the preview › ✦ More › ♪ Music › ♪ Move a slider with the music…**: pick the slider (linked ones marked ♪), then the card.
28. **Ctrl/⌘+K › Lab: ♪ Move a slider with the music (pulse on kick, step on the beat…)**.
29. **Lab search** puts it first for "move with the beat", "pulse on kick", "step each bar", "beat link", plus a help answer: "How do I make a slider move with the beat?"
30. **Find anything** finds it ("pulse on kick" → first row), plus a help answer.
31. **The directors know it**: one line in the app map (`/move-with`; sliders report `followsMusic { band, how, lo, hi }`), read on demand, with no per-message tokens.

Count: 31 upgrades.

## Edits outside the new files (small, additive)
- `tools/three-tweaks.js`: links travel in `tweak-mods`. Adds `setLink` (one undo step, `{ link, prev }` entries in the sliders' undo), `linkAdapter`, the right-click row, ♪ opening the card, `BeatLink.decorate` per row / knob, and the controller API `link` / `linkAdapter` / `openLink` / `undoDepth`.
- `tools/three-sandbox.html`: a "move with the music" block (sources per driver, `blValue`, `applyLinks`). Also one line in `valueOf`, `applyLinks` in the compositor tick and the export step (with `blWait`), and the math prefetched when links arrive.
- `tools/three.js`: `beatlink` in the page libraries (`LIB_FILES`).
- `tools/three-seq.js`: `prepLayer` gets the layer's links (`props.links`).
- `tools/three-easy.js`: the ♪ Music row.
- `tools/three-search-core.js`: a help answer, six phrases, and menu rows may carry `tags` / `boost`.
- `appsearch-data.js`: a help answer.
- `mcp/hearth-map.js`: one line.
- `lazy-data.js` (lab group).
- `dev/run-checks.js`: the unit test, `beatlink` in `lab:`, and a `beatlink` group.
- `dev/checks/stems.js`: its ♪ panel step opens the panel through the card.

## Fix after the merge (a flaky "…and it still pulses there")
The preview caches a link's value per frame time. That cache was keyed on the link and the time only, so a value
computed before the song's hits / grid / analysis / parts arrived (the bottom of the range) stayed for that time. A
paused scene reads the same time every frame, so after a scene switch it could stay at the bottom until the playhead
moved. Now any change of the song, its analysis, beat map, parts, live input or the sequence clears the sources and
the cache (`blFresh` in tools/three-sandbox.html). New check step, deterministic: paused just after a beat, the grid is
nudged 60 ms (new beats, same playhead) and the value must follow (it stayed at 1.697 before the fix, 0.201 after);
5 runs in a row under parallel load (labhub, stems, labaudio) pass.

## Not done / limits
- The slider's thumb shows its own value, not the moving one. The band, the knob arc and the meter show the movement.
- Older curve links (`/react-to`, the curve editor) still use the live analyser's smoothing and are not carried into the Lab sequence / renders. Only links with a "how" are. Picking anything in the card turns an older curve into a link.
- Inside a Lab sequence, a link follows the sequence's song (not a scene's own song's markers, which keyframed hits follow).
- Live builds no history, so live smoothing is real-time (as expected). Live drum hits need the live analysis (the worklet), which starts by itself when something reads it.
- A deployed web page of a scene (deploy) doesn't load the math: its linked sliders sit at their own value.

## For the patch notes
- **Make any slider move with the music in one click**: right-click a slider (or click its ♪) › **♪ Move with the music…**
- Pick **what drives it**: the beat, each bar, the kick, the snare, the hi-hats, the bass, the mids, the highs, the vocals, the drums or the loudness.
- Pick **how it moves**: **Pulse** on each hit, **Follow** the level, **Step** through values, or a **Random** value on each hit.
- **Drag the two little handles** under the slider (or around the knob) to set how far it goes. A small live meter shows what drives it.
- A linked slider shows **♪ Kick · pulse** (or whatever drives it). Ctrl/⌘+Z undoes each change, one at a time.
- It is **saved with the scene**, its templates and its packs, and **renders and exports move exactly like the preview**, the same every time.
- It also works with **live sound** (your computer's sound or a mic).
- Search for it: "move with the beat" or "pulse on kick" in Lab search or Ctrl/⌘+K. Chat: `/move-with glow kick pulse from 0.2 to 1.8`.
- Good to know: the older "follow a sound with a curve" is still under the card's **More ▾**. Those curves don't go into renders; anything you pick in the card does.
