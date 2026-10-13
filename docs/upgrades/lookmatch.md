# 🎨 Make it look like this (round 28, lookmatch)

You drop a picture or a video, pick something on the mood board, or choose a recent render, and the Lab matches its
look. The first step is local and costs no tokens: the reference is read with the board's own vibe reader plus the
numbers a grade needs. The Lab reads its own picture the same way, and the difference lands on the scene's ◐ Grade
and ◐ Film & lens layers as ordinary sliders, with the reference's colors as the sketch palette. It takes one click
and one Undo. After that, if you want, the director gets a small picture of the reference and the numbers so it can
match shapes, light and motion. It shows you the cost before it asks.

How to get there, no commands needed: the director's **◎ mission "Make it look like this"**, **right-click the
preview › ✦ More › ✨ Look & motion › 🎨 Make it look like this**, **right-click a board item › 🎨 Use this look in
the Lab**, **drop a picture on the Lab preview › 🎨 Match this look**, and ⌘/Ctrl+K "Lab: Make it look like this…".
The app's internal command is `/look-match`, and the director reaches it through `three_do run`.
New files: `tools/three-lookmatch-core.js` (the numbers, Node-testable), `tools/three-lookmatch.js` (the card, the
picker, the ways in), `tools/three-lookmatch.css`. They load with the Lab (lazy group "lab").

## Reading a reference (no tokens)
1. **Palette with weights**: the board's k-means palette (board-vibe.js), up to 6 colors, each with its share of the picture, drawn as a proportional strip on the card.
2. **Light, contrast, saturation, colorfulness, warmth, grain, composition, moods**: the board's vibe reader, reused (the same words the board uses).
3. **Tone levels**: the black point, the quartiles and the white point (2 / 5 / 25 / 50 / 75 / 95 / 98 %), which the curve match needs.
4. **Color temperature in kelvin**, from the mid-tones' mean color in linear light (McCamy), e.g. "warm ≈3,100 K".
5. **Shadow and highlight tints**: the color the darkest quarter and the brightest quarter lean to (teal shadows, orange highlights…).
6. **Green / magenta lean** of the whole picture.
7. **Vignette**: the corners measured against the middle.
8. **Glow**: the share of blown highlights.
9. **Letterbox detection**: dark, flat bars at both ends are found, named (2.39:1, 1.85:1…) and left out of every other measure.
10. **Videos**: 5 frames across the clip are read and merged (numbers averaged, palettes merged by weight, bars by majority).
11. **A clip's motion**: motion energy, cuts, seconds per shot and its light arc, from the board's clip reader (a board clip reuses the vibe it already has).
12. **Recorded .webm clips** (screen and canvas captures) now read their real length. They used to report "Infinity" and read as one black frame. This also fixes the board's vibe for such clips.

## Matching it on the scene (one click, no tokens)
13. **Measured against your scene**: the Lab's own picture is read first, with any old grade stepped aside, so the match is the difference between the two looks and not a fixed preset.
14. **A curve through the levels** (luma curve shadows / mids / highs): the scene's quartiles move to the reference's, a LUT-like tone match.
15. **Faded blacks → Lift**, crushed or dim whites → Gain.
16. **Saturation** from the ratio of the two pictures, down to **black & white** when the reference has no color.
17. **White balance**: temperature from the warmth difference, tint from the green / magenta lean.
18. **Split toning on the wheels**: the reference's shadow tint goes to the Lift wheel and its highlight tint to the Gain wheel (hue and amount), apart from the overall cast.
19. **Film grain** (heavy grain gets a bigger grain size).
20. **Vignette**.
21. **Letterbox bars** in the reference's format.
22. **Bloom** on ◐ Film & lens when the reference has more glow; **halation** on warm, grainy, glowing film looks.
23. **The reference's colors become the sketch palette** (Recolor and the director use them).
24. **It checks itself**: after writing, it reads the graded picture once more and corrects what's still off (tone points, saturation, warmth, grain).
25. **How close it got**, shown on the card: "≈82 % close (was 32 %)".
26. **Plain words for what changed**: "brighter mids · lifted, faded blacks · warmer (≈3,100 K) · teal shadows, orange highlights · fine grain".
27. **Everything is sliders**: it lands on the same ◐ Grade / ◐ Film & lens layers as the grade panel, so Save, Shuffle, looks, keyframes, MIDI and ◐ Fine-tune all work on it.
28. **One GPU pass**: the lens layer goes right under the grade, so the two still draw as one pass.
29. **Nothing breaks halfway**: if writing fails, the scene's grade and palette go back as they were.

## The card (over the preview, top left)
30. **🎨 Look match card**: the reference's thumbnail, its palette strip, its words (key, contrast, color, kelvin, grain, motion), what changed and how close.
31. **Strength** slider: how much of the matched look you get (it moves the grade and lens amounts live, and keeps them when you let go).
32. **Before** (hold): the look steps aside while you hold it.
33. **↶ Undo**: the scene's grade layers and palette go back exactly as they were (a toast's Undo does the same).
34. **◐ Fine-tune**: opens the grade panel on the matched grade (curves, wheels, film, lens, scopes).
35. **✦ Ask the director**: see below. ✕ closes the card and keeps the look; Esc works too.

## Asking the director (optional, cost first)
36. **Cost first**: a confirm that says what goes along and what it costs: the small picture (≈ w·h/750 tokens), the numbers (≈ chars/3.6 tokens), and the total for this message.
37. **A small picture of the reference** made through labdirector's small-picture path (≤ 384 px, JPEG): about 50–200 image tokens.
38. **A clip goes as a 2 × 2 sheet** of 4 of its frames (≤ 448 px).
39. **The numbers and the vibe line** in about 100–190 tokens: palette with weights, light, color, texture, composition, moods, levels, kelvin, grain, vignette, bars, motion.
40. **It knows the colors are already matched**: it keeps the ◐ Grade and adapts shapes, materials, light, composition and motion. It borrows the feel and never imports the reference.
41. **Your words ride along**: the mission's message, or `/look-match ask <words>`.
42. **No director yet?** One is made for you, docked in the Lab.

## Ways in
43. **◎ Mission "Make it look like this"** in the Lab director's chat: pick the reference, the look lands at once, then your words go to the director with the picture (cost first). If you cancel the picker, your words go back in the box.
44. **The picker**: drop a picture or video, or Choose a file…; your **mood board** as thumbnails (clips marked ▶); **a recent render**; **a look you matched before**.
45. **Right-click a board item › 🎨 Use this look in the Lab** (pictures, gifs, clips, web pages): it opens the Lab and matches, reusing the item's vibe.
46. **Drop a picture on the Lab preview**: a small menu offers 🎨 Match this look, Match it then ask the director, or Add it to the sketch's references.
47. **Files dropped on the preview now reach it**: the preview's page used to swallow drops over the picture. Songs and videos dropped on the picture now load too.
48. **✦ More › ✨ Look & motion › 🎨 Make it look like this**: once you have matched something it becomes a submenu: choose another, ↶ Undo the last match, ✦ Ask the director, and your recent matched looks.
49. **Your matched looks**: the last 8, with a thumbnail, reapplied in one click (and undoable).
50. **⌘/Ctrl+K "Lab: Make it look like this…"**.
51. **For the AI**: `/look-match [file] | board | undo | ask [words] | status`. The app map's grade topic explains it, so the director can do it when you just ask (no prompt tokens: the topic is read on demand).

## Tests
- `node dev/lookmatch-test.js` (unit group): 18 tests on generated pictures. They cover the reading (bars, levels, kelvin order, vignette, glow, grain) and each kind of reference moving the right values the right way: warm / cool, faded, punchy / dark, B&W / muted / vivid, grain + vignette + bars + glow, teal / orange split. Also covered: a reference equal to the scene changes nothing, every value in range, the palette, refine, closeness, merging clip frames, the brief's length and the cost.
- `dev/checks/lookmatch.js` (lab group, `--fake-engines`). It uses generated pictures and a recorded clip to check the mission, the ✦ More entry, the board right-click and a real (CDP) file drop on the preview. It checks a warm, faded, grainy picture (warmer, lifted, grainy, palette set, 32 → 82 % close), Strength, Before, Undo, B&W with bars from the board, the clip's motion and cool cast, the director ask (cost first, then the message with one small picture and your words), and the mission's picker and cancel.
