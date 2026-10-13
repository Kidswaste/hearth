# ✨ Make it look finished (round 30, autopolish)

One click, zero tokens. Hearth looks at the Lab scene on screen and measures its picture, a few frames of its motion,
where the 9:16 apps put their buttons, its grade, its sliders and what follows the music, and its frame rate. From
that it proposes a short list of fixes, each made only of ◐ Grade / ◐ Film & lens values and slider changes. It
applies them together as one undo step, then measures the picture again so the card shows real numbers ("brightest
parts: 21 % → 57 %") instead of guesses. You can untick any fix. Anything a slider can't fix is left for the
director, and asking it shows the cost first.

How to get there, no commands needed: **right-click the preview › ✨ Make it look finished** (second row), **✦ More ›
✨ Look & motion › ✨ Make it look finished**, the director's **◎ mission "Polish the look"** (it now runs this pass first
and only then offers the director what's left), and ⌘/Ctrl+K "Lab: Make it look finished". The app's internal command
is `/autopolish`, and the director reaches it through `three_do run`.

New files (lazy group "lab"): `tools/three-autopolish-core.js` (the rules, Node-testable),
`tools/three-autopolish.js` (measuring, applying, the card, the ways in), `tools/three-autopolish.css`.
It reuses lookmatch's picture reading (`LookCore.analyze` over the Lab's small shots), publishkit's safe areas
(`PublishCore.zonesFor / heatAdd / underUI`), the grade's layers and code (`GradeCore`, `LabGrade.findLayers / state`),
labaudio's reactions (a slider's `followsMusic`, `ThreeMusic.reactPlan`) and labperf's numbers (`perf()`).

## What it measures (no tokens)
1. **The picture**, read the way 🎨 lookmatch reads a reference: levels (black point, quartiles, white point), average, saturation, palette with weights, glow, blown highlights.
2. **Pure black and blown white**: how much of the picture is exactly black, how much sits in the shadows just above it, how much is clipped white.
3. **Motion from a few frames** (four small shots about 0.2 s apart): how much changes from one to the next, how much of the picture changes at all (a subject travelling versus everything churning), and brightness flicker.
4. **The 9:16 safe area**: in a vertical frame, the detail sitting under the buttons, caption and header of the platform your Safe zones show (TikTok, Reels or Shorts), with publishkit's zones.
5. **The scene's settings**: its ◐ Grade and ◐ Film & lens values, every slider of every layer (the grade's own sliders are left out), what follows the music and how strongly, any slider moving by itself.
6. **The frame rate** from labperf's stats (a parked preview isn't judged).

## What it fixes (each one a slider or grade change)
7. **Too dark** → exposure up on ◐ Grade, by enough to bring the brightest parts near 80 % (kept inside the slider's 3 stops).
8. **Too bright** → exposure down.
9. **Clipped whites** → tone mapping AgX when it was off, and the whites pulled down (Gain).
10. **Crushed blacks** → a little Lift. A black background covering most of the picture counts as a choice and is left alone.
11. **Flat contrast** → contrast up plus a gentle S-curve on the luma curve.
12. **Too much glow** → the ◐ Film & lens bloom halved, and the scene's own glow / bloom slider brought down.
13. **Bright highlights with no glow anywhere** (a dark scene) → a soft bloom on the highlights.
14. **Colors clashing** (hue pairs that sit badly: not the same family, not a triad, not complements) → the scene's color sliders move into one harmony built on the lead color (lead, a neighbour, the complement and its neighbour). Saturation and lightness stay, and the sketch palette follows.
15. **Clashing colors with no color sliders** → the loudest colors are tamed on the grade (vibrance, saturation), and the rest goes to the director.
16. **Content under the 9:16 app buttons** → a zoom / scale / size slider pulls the picture in from the edges (a camera distance or field of view goes up instead). With no such slider, it's left for the director.
17. **Too static** → the speed / rotation / flow sliders go up (from 0: a quarter of their range). With none, two sliders get a slow wave.
18. **Jittery motion** (the whole picture churning frame to frame) → the shake / noise / speed sliders calm down.
19. **The music barely moving anything** (a song or live sound is on) → existing reactions get stronger (their curves kept). With none, the sliders that "✦ Make it react" would pick follow the kick, bass and loudness.
20. **Frame rate dips** → 🪶 Light mode (30 fps, filters at half size; recordings and stills stay full size).

## The card (over the preview, top left)
21. **A finish score**, before → after, out of 100. It weighs exposure, contrast, color harmony, the safe area, motion, music and frame rate, and both scores are measured on the picture.
22. **Before / After pictures** side by side.
23. **One row per fix**: what was wrong, what it did, and the measured number before → after ("change between frames: 0.0 % → 6.5 %").
24. **Untick a fix** and only that one goes back. The others stay, and the picture is measured again.
25. **Hold "Before"** to see the picture from before the fixes over the preview.
26. **↶ Undo**: one step puts everything back (grade and lens layers, sliders, music links, motions, palette, Light mode). The toast's Undo does the same.
27. **◐ Fine-tune** opens the grade panel on what it set (shown when a grade fix is ticked).
28. **"Left for the director"**: what sliders couldn't fix, in plain words.
29. **✦ Ask the director (for what's left)**: it gets what was done (with the numbers) and what's left, about 60–200 tokens. The confirm shows the cost first.
30. **Already finished?** A toast says so with the score, and nothing changes.

## Ways in
31. **Right-click the preview › ✨ Make it look finished**, second row. Once a pass is applied it becomes a submenu: look again, ↶ Undo, show the card, ask the director.
32. **✦ More › ✨ Look & motion › ✨ Make it look finished**.
33. **◎ mission "Polish the look"** (the labeasy director brief): the local pass runs first. Then a confirm with the cost offers the director what's left plus your words, and Cancel puts your words back in the box.
34. **⌘/Ctrl+K "Lab: Make it look finished"**.
35. **For the AI**: `/autopolish` (run) · `check` (only list what it would fix) · `status` · `undo` · `ask [words]`. The app map's grade topic explains it, so the director can run it when you just ask (no prompt tokens: the topic is read on demand).

## Tests
- `node dev/autopolish-test.js` (unit group), 27 tests. Synthetic readings drive each rule: too dark (twice), too bright, clipped whites (tone kept when on), crushed blacks (and a black background left alone), flat contrast, too much glow, no glow, harmony and harmonize, clashing sliders, clashing without sliders, the grade's own colors ignored, the safe area (zoom, FOV, none), too static (speed, a wave), frozen, jitter versus travel, music (stronger, the react plan, no sound) and the frame rate. Also covered: a well-made scene changing nothing, merge, the readers on generated frames (black / white shares, motion, under the TikTok caption), the brief and its cost.
- `dev/checks/autopolish.js` (lab group, `--fake-engines`) runs on a deliberately bad 9:16 scene: too dark, three clashing color sliders, standing still. It covers the ways in (✦ More, the labeasy audit, a real CDP right-click on the preview, the mission for the director only) and `check` changing nothing. Then one click: exposure up, colors in harmony with the lead kept, speed up, measured again (brightest parts 21 % → 57 %, motion 0 → 6.5 %, finish 58 → 100). After that it checks the card, hold Before, untick (only that fix goes back), ↶ Undo (everything back, Light mode included), and the mission (local pass first, then cost first, then the director's message with the numbers and your words). 17 steps pass. `labeasy` passes too, and `node dev/lazy-manifest.js` regenerated and compared clean.

## For the patch notes
- New: **✨ Make it look finished**. One click and Hearth measures your Lab scene and fixes what's off, on your computer, with 0 tokens.
- It checks exposure, black and white levels, contrast, glow, clashing colors, things hidden under TikTok / Reels / Shorts buttons, motion that's too still or too jittery, music that barely moves anything, and frame-rate dips.
- Every fix is an ordinary grade or slider change, so you can keep tweaking it, save it or shuffle it.
- The card shows the real numbers before and after, a finish score, and Before / After pictures. Untick any fix you don't want, or ↶ Undo all of it in one step.
- Find it by right-clicking the preview, under ✦ More › Look & motion, or with the director's ◎ "Polish the look", which now does this free pass first and only then asks the director for what's left (cost shown first).
- Caveat: the rules judge numbers, not taste. A deliberately dark or black-background scene may get a brightness fix you don't want, so just untick it.
- Caveat: Light mode counts as fixing a frame-rate dip right away; the real fps settles a few seconds later and isn't re-read on the card.
- Caveat: tested on a software GPU with a generated scene; how the fixes look on your real scenes and screen wasn't seen.
