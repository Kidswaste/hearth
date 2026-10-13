# ∞ Make it loop (round 31, perfectloop)

For looping 9:16 Shorts, Reels and TikToks: the Lab scene loops perfectly, so the replay doesn't show a jump. Make it
loop over N bars of the song (or N seconds of the scene's own timeline). The timeline loops there and the scene's
clock wraps with it, in the preview and in renders. Keyframes come back round, music reactions loop with the bars, and
code made to loop reads the loop's phase. A seamless check compares the loop's last frame with its first and says
"≈ seamless" or "a visible jump", with one click to fix it. Zero tokens unless you choose to ask the director, and
then the cost shows first.

How to get there, no commands needed: **✦ More › ⇪ Make › ∞ Make it loop** (pick a length), the director's **◎ mission
"Make it loop"**, **Ready to post**'s loop fix on a Lab render, ⌘/Ctrl+K "Lab: Make it loop", or just asking the
director ("make it loop over 4 bars"). The app's internal command is `/make-loop`, and the director's op is `three_do loop`.

New files (lazy group "lab"): `tools/three-loop-core.js` (loop timing, keyframes, the check's verdict, Node-testable),
`tools/three-loop.js` (the Lab side: make / off, the check, the card, renders, the ways in), `tools/three-loop.css`.
Small additive hooks: `tools/three-sandbox.html` (the loop clock and the sketch helpers in the helpers section, three
one-line hooks), `tools/three-export.js` (the export page gets the loop clock; `LabExport.probe` draws small frames for
the check), `tools/three.js` (one line: a fresh preview gets the loop clock again), `tools/three-easy.js` (the ⇪ Make
row), `publishkit.js` / `publishmain.js` (the Lab render loop fix; the check reads the very first frame),
`mcp/three-mcp.js` / `mcp/three-guide.js` / `mcp/hearth-map.js` (the director's op and help on demand).

## Make it loop
1. **Over N bars of the song**, from the bar the playhead is in (1, 2, 4, 8 or 16 bars; 4 is marked "good for Shorts").
2. **Over N seconds without a song** (2–15 s) on the scene's own timeline, from 0. The default is the timeline's own length when it's 20 s or less (the orb loops over its 10 s); a timeline shorter than the loop gets longer.
3. **The scene's clock wraps with the loop**: inside the preview, a layer's frame time (`setAnimationLoop((now) => …)`, `requestAnimationFrame`) and `performance.now()` are the timeline's time folded into the loop (0 while a layer sets up, like a sequence scene). Code, keyframes and the song all come round together, and a paused timeline is a still frame.
4. **Keyframes come back round**: a setting keyed to end somewhere else gets a key at the loop's end with its start value (and one at the start when the loop begins between two keys). Loop off puts the keys back.
5. **Music reactions loop with the bars**: the song's A–B loop is the loop, and reactions read the song at the playhead.
6. **A song that ends before the loop would**: the loop moves back to the last bars that fit.
7. **A loop you locked stays**: it becomes the loop.
8. **Kept with the scene**: switching scenes, a reloaded preview, a duplicated scene and a render all get it back. Drag the A–B loop by hand while it loops and the loop follows.
9. **Loop off**: the scene runs on its own clock again, the keys and your previous A–B loop come back. Keys whose slider is missing from the code for now are put back the next time.

## Code that loops by itself (sketch helpers, next to noise / wave / ease)
10. **`loopT(n = 1)`**: 0..1 over the loop, going round n whole times.
11. **`loopSin(n, phase)` / `loopCos(n, phase)`**: -1..1, n whole waves per loop.
12. **`loopWave(n)`**: a smooth 0..1..0, n times per loop.
13. **`loopAngle(n)`**: radians, n whole turns per loop.
14. **`loopNoise(x, y, t = loopT(), r = 1)`**: smooth Perlin noise sampled on a circle, so it's back to itself at the loop's end (r sets how far it wanders).
15. **`loop.on` / `loop.len` / `loop.start` / `loop.t` / `loop.time`**: the loop as numbers.
16. **They work without Make it loop too**: they go round the timeline's A–B loop when one is set, else every 4 s.

## When the code can't come round (a simulation, a drift)
17. **Blend the last beat into the first**, one click: in the preview, a picture of the last frame fades over the start on the compositor at each seam.
18. **Renders cross-fade it**: the frames past the loop's end (what the scene does next) blend into its first beat, so the end runs into the start.

## The seamless check
19. **≈ seamless / a visible jump**: the loop is drawn small on the hidden export page (a simulation steps through every frame), and its last frame is compared with its first using publishkit's loop check, against the usual change between two frames ("1.1× the usual change").
20. **≈ seamless (blended)**: with the blend on, the check reads the end running into what follows it.
21. **The card over the preview**: the verdict, the last → first pictures, and **one click that fixes what it found** (∞ Make it loop · ✦ Blend the last beat into the first · ⇪ Render the loop · ✦ Ask the director), plus Check again, No blend and Loop off.
22. **A progress bar** while it draws the loop.

## Render
23. **⇪ Render the loop**: a perfect-loop MP4 of exactly the loop (its frame count is the loop's), at the frame size.
24. **With its bars of the song under it**: the same N bars of sound, so the music loops too.
25. **Render as a GIF** (behind "More…" in the ∞ Make it loop menu once it loops).
26. **📮 Post** on the toast opens Ready to post on it.
27. **Every Lab render carries the loop's clock**: the export page's helpers go round with the preview's, exactly the loop's frames long.

## Ways in
28. **✦ More › ⇪ Make › ∞ Make it loop**: a length submenu. Once it loops: Is it seamless?, the blend, ⇪ Render the loop, GIF, another length, the card, Loop off.
29. **◎ mission "Make it loop"** (Lab director only; say "4 bars" or "8 s"): the loop and the check run first with no tokens. If it's seamless, that's it. If it still jumps, the director gets a short brief (the loop helpers and your words) only after a confirm that shows the cost. Cancel blends the last beat instead and puts your words back in the box.
30. **Ready to post's loop fix on a Lab render**: "∞ Render the scene as a perfect loop" renders the scene again over the video's length (bars of the song, or seconds), blended if the check finds a jump, and the kit checks the new copy by itself.
31. **Ready to post's loop check reads the very first frame**: it sampled a few frames in, so a loop whose start blends in read as a jump.
32. **⌘/Ctrl+K "Lab: Make it loop"**.
33. **For the AI: `three_do loop {bars | secs | fade | check | render | off | status}`**, one op inside the lean budget (three_do 176 → 177 tokens; the details come from `help loop`).
34. **`help loop`** (on demand, no prompt tokens): the helpers with examples, what still jumps and how to check. The audio helpers line and the app map's Lab topic point to it.
35. **`/make-loop`** (alias `/perfect-loop`): `4 bars` · `8 s` · `check` · `blend` · `no blend` · `render [gif]` · `off` · `status`.

## Tests
- `node dev/perfectloop-test.js` (unit group), 18 tests. Loop timing covers bars from the playhead's bar, the blend's length, odd tempos, a song that ends too soon, seconds in whole frames with the timeline's default, fold / phase, and the export page's frame times. Keyframes: closing them, leaving ones that already come back, a loop that starts mid-key, eases, colors and hold. Also the words. The seamless check uses publishkit's check on generated frames (periodic → ≈ seamless, drift → a jump, blended → ≈ seamless) and the director's brief. The sketch helpers are taken out of `three-sandbox.html` and run as the preview runs them: loopT and whole turns, the A–B loop, loopSin / loopCos / loopWave at the start and the end, loopNoise periodic + continuous + moving, a layer's folded clock (0 while it sets up, untouched when off / live / in a sequence), and the defaults.
- `dev/checks/perfectloop.js` (lab group, `--fake-engines`), 21 steps, all pass. It covers the ways in (✦ More, the labeasy audit, the mission for the director only, ⌘K). A 9:16 scene made with the helpers is made to loop over 2 s: the timeline loops, the size keyframe comes back round, and a layer's frame time is folded into 0–2 s. The check says ≈ seamless, and the card shows the pictures and ⇪ Render. The render is 60 frames and its first ≈ last frame (publishkit through ffmpeg: 1.1× the usual change). A drifting scene gets "a visible jump"; one click blends it ("≈ seamless (blended)"), the preview blends its seam, and the render's first ≈ last again. three_do loop check / status are covered. The mission runs locally first, then asks with the cost, and the director gets the brief with the helpers and the words. Ready to post's fix on a plain Lab render gives a new copy that "Loops seamlessly". Loop off puts the keys back.
- Also run: `node dev/director-mcp-test.js` (lean list 1184 tokens, three_do 177 ≤ 200), `node dev/publishkit-test.js` (19/19), `node dev/boot-test.js`, `sh dev/run-checks.sh labeasy`, and `node dev/lazy-manifest.js`. The manifest was regenerated: commands, aliases, keys, apps, tools and dups match. Its "actions" line lists /director-* actions as added in the lazy build, which was the case before this stream too.

## For the patch notes
- New: **∞ Make it loop**. Your Lab scene loops perfectly over 4 bars of the song (or a few seconds without one), so Shorts, Reels and TikToks replay without a jump.
- Find it under ✦ More › ⇪ Make › ∞ Make it loop, as the director's ◎ "Make it loop" mission, or just ask the director.
- The timeline loops, the scene's clock wraps with it, keyframes come back round to where they started, and music reactions loop with the bars, in the preview and in renders.
- A free seamless check compares the last frame with the first and says "≈ seamless" or "a visible jump". One click blends the last beat into the first when the motion can't come round by itself.
- ⇪ Render the loop makes a perfect-loop MP4 (or GIF) of exactly the loop, with its bars of the song.
- Ready to post's loop fix now renders a Lab render's scene again as a perfect loop, instead of blending the file's end into its start.
- The director knows new helpers (loopT, loopSin, loopNoise…) for motion that loops by itself. It reads them only when needed, and the mission asks before spending tokens.
- Caveat: code that reads `Date.now()`, live sound and scenes inside a sequence don't follow the loop's clock. While the loop is on, a paused timeline is a still frame.
- Caveat: tested with fake engines on a software GPU with generated scenes; how real scenes look at the seam wasn't seen.
