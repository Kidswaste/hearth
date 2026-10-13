# ✦ Describe it: a scene from your words, 0 tokens (round 29, instantscene)

Write a sentence ("dreamy pink chrome tunnel that pulses on the kick, slow") and get three different scenes to pick
from. No model reads it: the words are matched on this computer, with a small hand-written vocabulary, against what
Hearth already has. That means the gallery's starting points and library, the particles / physics / type presets, the
◐ Grade looks, the palettes and the music reactions. One click opens a pick as a new scene, its sliders already set
from your words (colors, speed, intensity, the music) and the matched look on top. If you want more, "✦ Ask the
director to take it further" shows its cost first.

Ways in, no commands needed: **the gallery's search** (a "✦ Make it from my words" row shows when what you typed
reads like a description), **the empty Lab** ("✦ Describe it" on a new chat's starter and on a plain Shape scene),
**the director's ◎ mission "Make it from my words"** and **✦ More › ✨ Look & motion › ✦ Describe it…**.
The internal command is `/describe`; the director reaches it through `three_do run`.

Files: `tools/three-instant-data.js` (the vocabulary), `tools/three-instant-core.js` (reading + scoring + sliders,
Node-testable), `tools/three-instant.js` (the window, opening a pick, the card, the ask), all three loaded with the
gallery on first use (lazy group "gallery"). `tools/three-instant-hook.js` (the ways in) and `tools/three-instant.css`
load with the Lab. Small hooks elsewhere: two lines in `tools/three-gallery.js` (the search row; `shot` and `parkSoon`
exported), one in `tools/three-gallery-hook.js` (the starter chip's button), one in `tools/three-easy.js` (✦ More),
one in `mcp/hearth-map.js`, `lazy-data.js` (files + regenerated manifest), `dev/run-checks.js`.

## Reading your words (on this computer, no tokens)
1. **A sentence becomes 3 scene picks**, matched locally: no model call, 0 tokens.
2. **A hand-written vocabulary of about 470 words and phrases**: what the scene is (tunnel, blob, galaxy, lasers, fire, snow, text, dominoes…), moods and styles (dreamy, dark, retro, cyberpunk, cinematic, lo-fi…), speed, intensity and the music.
3. **51 color words → a palette of your own**: five colors from dark to light, made from the colors you named. Pastel / dreamy words soften it and dark words deepen it.
4. **Your colors rank the Lab's 100+ palettes** by how close their hues are: pink finds pink palettes, black and white finds the mono ones.
5. **Style words pick a look** from the ◐ Grade presets: dreamy → Golden hour, black and white → Noir, vintage → Vintage 70s, neon / cyberpunk → Music video neon, cold → Anamorphic sci-fi, matrix → Matrix…
6. **Speed words** (slow, slower, slow-mo, fast, frantic…), made stronger or weaker by "very", "super", "slightly", "a bit".
7. **Intensity words** (subtle, soft, intense, aggressive, wild, punchy…).
8. **Music words: a sound + what it does → a reaction preset**. "Pulses on the kick" → Pump on kick, "flashes on the hi hats" → Strobe on loud hats, "wobbles on the bass" → Wobble on the sub, "zooms on the drop", "rises through the build", "follows the vocals", "on the beat".
9. **"No music" / "not reactive"**: a scene that moves on its own timeline (its music sliders go to 0, no reaction).
10. **"No" / "not" / "without"**: "a tunnel but no text" leaves type out, and "not too fast" comes out a bit slower.
11. **Quoted words become the text** of a type pick: `"OUT NOW" release poster`.
12. **Short phrases read as one word**: hi hats, black and white, lo-fi, northern lights, slow motion, 80s, sci-fi, mirror ball, joy division…
13. **Words it doesn't know still search** names, tags and descriptions (so "outrun" or "plinko" still find theirs).
14. **It searches what Hearth has**: the gallery's 26 starting points, the library's layer templates, the particle, physics and type presets (presets that need your own files stay out).
15. **What the scene is weighs more than how it feels**: "dreamy chrome tunnel" gives a chrome or tunnel scene in a dreamy look, not just any dreamy scene.
16. **Three different picks**: each from a different mood or kind of layer, each with its own palette / look variant.
17. **The new scene is named from your words** ("Dreamy pink chrome tunnel").

## The window
18. **✦ Describe it**: your words on top, three big picture cards below.
19. **"Understood:"** lists the words it matched and what else it searched.
20. **Each card shows the pick as it will open**: its tuned layers and look, drawn one at a time in the gallery's one shared preview page. A picture that doesn't come out is tried again.
21. **Something to see at once**: the palette as a gradient and the starting point's saved gallery picture, while its own picture is drawn.
22. **A palette strip** on each card.
23. **Chips for what matched**: the words, the palette, the look and the reaction.
24. **One "why" line per pick**: "chrome → Chrome blob · your colors · look: Golden hour · speed ×0.4 · ♪ Pump on kick".
25. **Typing changes the picks at once** (no wait, no tokens).
26. **↻ 3 more**: the next three picks for the same words.
27. **Enter** opens the first pick; **Esc** closes.

## Opening a pick (one click, no tokens)
28. **A new scene** at the frame size you're on, opened right away.
29. **Colors on the sliders, in light order**: the darkest palette color goes where the darkest color was and the brightest where the brightest was, so the scene keeps its contrast.
30. **Speed sliders** (Speed, Flow, Spin, Drift, Travel…) scaled by your speed words, inside their ranges.
31. **Intensity sliders** (Glow, Bloom, Punch, Wobble, Brightness…) scaled by your intensity words.
32. **The sound you named gets more**: "on the kick" raises the Kick sliders, "on the snare" the Snare ones.
33. **The matched look on top** as the usual ◐ Grade and ◐ Film & lens layers: ordinary sliders, and the grade panel, Save and Shuffle work on them.
34. **Your colors become the sketch palette** (Recolor and the director use them).
35. **The music reaction lands on the main layer's best slider** (labaudio's preset, e.g. Pump on kick on Size), so you see it move with the song.
36. **Particle and type picks get a backdrop in your colors**, darkened so they stand out.
37. **The pictures' page goes to sleep** as soon as you pick, so the Lab gets the GPU.

## After: the director, only if you want
38. **A "✦ Made from your words · 0 tokens" card** over the preview says what was done.
39. **"✦ Ask the director to take it further · ≈N tokens"**: the cost is on the button.
40. **A confirm with the cost** before anything is sent. If there is no director yet, one is made.
41. **What it gets**: your words plus what was made (start, palette, look, speed, reaction), about 60–120 tokens, no picture. It keeps the layers and sliders and builds on them.
42. **Other picks** brings the three picks back.
43. **The card goes away by itself** when another scene is on screen, or after a minute.

## Ways in
44. **◎ Mission "Make it from my words"** in the Three Director's chat. Your message is the description, nothing goes to the director, and if you close without picking, your words go back in the box.
45. **The gallery's search**: a "✦ Make it from my words" row on top when the search reads like a description (one-word searches stay plain searches).
46. **A new chat's starter** shows "✦ Describe it" next to "Start from something like…".
47. **An empty scene** (just the plain Shape you start from) shows "✦ Describe it: a scene from your words".
48. **✦ More › ✨ Look & motion › ✦ Describe it…** (right-click the preview).
49. **The directors know it** (one line in the app map, read on demand, no prompt tokens) and can make one when you just ask.
50. **For the AI**: `/describe [words]` (the window) · `/describe make <words>` (the first pick at once) · `/describe list <words>` · `/describe ask`.

## Tests
- `node dev/instantscene-test.js` (unit group): 53 tests. It checks 43 phrasings against the real data (gallery, particles, physics, type, looks, palettes, reactions), that the 3 picks are different, the families and palettes, ↻ 3 more, colors → palettes, very / slightly / not, the sliders (`tune()` on every starting point), "reads like a description", the director brief and its cost, and that every look / palette / reaction the vocabulary names exists.
- `dev/checks/instantscene.js` (lab group, `--fake-engines`). It checks the mission (3 different picks, all 3 drawn), live re-picking and opening a pick (drawn in the Lab, no errors, ◐ Grade on top, palette, sliders, Pump on kick). It also covers the card and the ask (cost first, Cancel sends nothing, yes sends the brief), closing without a pick, the gallery's row, `/describe make`, particle / type / physics picks (no errors), the card closing on another scene and the empty-scene chip.

## For the patch notes
- New: **✦ Describe it**. Write what you want ("dreamy pink chrome tunnel that pulses on the kick, slow") and get 3 scenes to pick from, made on your computer with 0 tokens.
- It uses what Hearth already has: the gallery's starting points, particles, physics, type, looks, palettes and music reactions.
- One click opens a pick as a new scene, with its colors, speed, intensity and music reaction set from your words and a matching look on top.
- Find it in the gallery's search (type a description), on an empty scene, in the director's ◎ "Make it from my words", or under ✦ More › Look & motion.
- Want more? "✦ Ask the director to take it further" shows its cost before anything is sent.
- Each card shows a picture of the pick, what it understood and why it chose it. ↻ 3 more gives other ideas.
- Caveat: it only knows the words in its vocabulary (about 470) plus names in the gallery. Unusual words still search, but the picks can be loose.
- Caveat: pictures were checked on a software GPU here; how each pick looks on a real graphics card wasn't seen.
