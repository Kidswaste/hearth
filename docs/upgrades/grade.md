# Grade (round 24, grade): cinematic finishing for the Lab and its sequence

You asked for cinematic color in the Lab. This round adds a whole finishing stage: a grade, LUTs, film and lens
effects, and scopes. It all sits in one place: two filter layers on top of the scene, **◐ Grade** and **◐ Film & lens**,
plus one small panel that drives them. The GPU draws the whole grade as **one pass**. The ◐ Grade layer draws inside
the Film & lens pass (round 21's merged filter passes, extended so they now carry a filter's helper functions and
its own LUT texture). At amount 0 each layer steps aside and costs nothing. A Lab sequence clip, or the whole
sequence, gets its own grade from the same shader. The preview and the export page run that same code, so the
render is what you saw (checked pixel by pixel).

Nothing new is on screen until you ask for it. You'll find the grade under **right-click the preview › ◐ Grade**,
**right-click a sequence clip › ◐ Grade**, **⌘/Ctrl+K "Lab: Grade…"**, the **FX picker's Grade tab**, the Layers
**＋** list, and **`/grade`** in any chat. Claude and Astra use it through `three_do run "/grade …"`. The app map
topic `grade` is read on demand, so it adds no prompt tokens.

## Upgrades

### The ◐ Grade layer (filter `cgrade`, per pixel)
1. **◐ Grade layer**: one filter layer on top changes everything under it. Its settings are ordinary sliders, so Save, Shuffle, looks, keyframes and MIDI all work on them.
2. **Tone mapping: ACES** (filmic S-curve, rolled-off highlights).
3. **Tone mapping: AgX** (the Blender 4 curve: soft, natural saturation in the highlights).
4. **Tone mapping: Filmic** (Hable / Uncharted 2).
5. **Tone mapping: Reinhard** (extended, gentle roll-off).
6. **Tone mapping: Neutral** (Khronos PBR Neutral: keeps hues and brand colors).
7. Every tone curve is normalised so white stays white. Your picture is already display-referred, so choosing ACES gives its shape without dimming everything.
8. **Exposure** in stops, applied in linear light, before the tone curve (+1 = twice the light).
9. **Contrast** around mid grey.
10. **White balance: temperature** (warm ↔ cool, brightness kept).
11. **White balance: tint** (green ↔ magenta).
12. **Lift wheel**: a hue and an amount tint the shadows, and a slider sets their level.
13. **Gamma wheel**: the same for the midtones.
14. **Gain wheel**: the same for the highlights.
15. **Luma curve**: shadows, mids and highlights points (smooth Catmull-Rom curve, hue kept).
16. **Red, green and blue curves**: one per channel.
17. **HSL qualifier**: pick one band of hues (center, range, softness), then shift its hue, its saturation and its brightness (e.g. turn the reds green, calm a sky). Greys are left alone.
18. **Saturation**.
19. **Vibrance**: dull colors gain more than vivid ones.
20. **Split toning**: a shadow color, a highlight color and their balance.
21. **LUT with strength**: any starter or imported LUT, mixed from 0 to 100 %.
22. **Vignette** with softness.
23. **Film grain** with a size, plus a **luma response** that puts more grain in the midtones, like real film. The grain moves at 24 frames a second.
24. **Letterbox bars** per format (2.39, 2.35, 2:1, 1.85, 16:9, 4:3, 1:1, 4:5, 9:16) and a bar color. A format wider than the frame gives bars at the top and bottom; a narrower one gives bars at the sides.
25. **Grade amount**: mixes the whole grade with the original. At 0 the layer steps aside, with no pass and no cost.

### The ◐ Film & lens layer (filter `clens`, reads around each pixel)
26. **◐ Film & lens layer**, placed right under ◐ Grade so the two draw as one pass.
27. **Bloom with a threshold** and a size: only what is brighter than the threshold glows.
28. **Halation**: the red-orange glow around film highlights, in a color you pick.
29. **Anamorphic streaks**: horizontal flares from bright points, with a length and a color.
30. **Chromatic aberration**: red and blue fringes that grow toward the edges.
31. **Lens distortion**: barrel or pincushion. Barrel zooms itself to fill the frame.
32. **Film & lens amount**: at 0 it steps aside.

### Speed
33. **A full grade is one GPU pass**: ◐ Grade draws inside ◐ Film & lens's pass (checked in `/lab perf`'s merges and by the check), and Film & lens takes the scene's canvas as it is (no 2D merge).
34. **Zero cost when off**: a grade at amount 0, a sequence clip without a grade, or the scopes panel closed costs nothing.
35. A LUT becomes a texture once, in half-float (smooth gradients). Starter LUTs are made only when first used.

### LUTs
36. **Starter LUT: Teal & orange** (teal shadows, warm skin and highlights).
37. **Starter LUT: Bleach bypass** (silver retained: low saturation, hard contrast).
38. **Starter LUT: Kodak-ish warm** (Portra-like warmth, soft contrast, lifted blacks).
39. **Starter LUT: Fuji-ish fresh** (cool shadows, clean greens and cyans).
40. **Starter LUT: Noir** (black & white through a red filter, deep contrast).
41. **Starter LUT: Cross-process** (yellow highlights, blue shadows).
42. **Starter LUT: Day for night** (daylight made into moonlight).
43. **Starter LUT: Vintage fade** (faded blacks, 70s print).
44. **Starter LUT: Cyberpunk** (cyan shadows, magenta highlights).
45. **Starter LUT: Golden hour**.
46. **Starter LUT: Arctic blue**.
47. **Starter LUT: Matrix green**.
48. **Starter LUT: Sepia**.
49. **Starter LUT: Film print** (print contrast with a warm-cool split).
50. **Import .cube 3D LUTs** (any size from 2 to 129, Resolve / Premiere / Adobe format) from the panel, the preview menu, ⌘/Ctrl+K or `/grade import <file>`.
51. **Import .cube 1D LUTs**: turned into 3D, per-channel curves kept; `DOMAIN_MIN / DOMAIN_MAX` are honoured.
52. **Imported LUTs are kept** and reach every Lab page: the preview, the Stage window and the hidden export page (renders use them too).
53. **Export the current grade as a .cube** (33³, with a title) for Premiere, Resolve or anything that reads .cube. Only its color part goes in, because vignette, grain and bars depend on where a pixel sits. Panel ⋯, the preview menu, ⌘/Ctrl+K, `/grade export [file]`.
54. **Remove an imported LUT** (panel ⋯ › Imported LUTs).

### Presets (one click: a grade + a matching Film & lens)
55. **Neutral** (back to no grade).
56. **Blockbuster**: ACES, teal & orange, a little bloom, 2.39 bars.
57. **Kodak warm**: Filmic curve, warm stock, grain and halation.
58. **Fuji fresh**: AgX, cool greens, fine grain.
59. **Noir**: hard black & white, grain, vignette, wide bars.
60. **Bleach bypass**.
61. **Cross-processed**.
62. **Day for night**.
63. **Vintage 70s**: faded print, heavy grain, halation, soft corners.
64. **Music video neon**: cyberpunk colors, bloom, streaks and fringes.
65. **Anamorphic sci-fi**: cold blue, blue streaks, fringes, distortion, 2.39 bars.
66. **Golden hour**: warm gold and a soft glow.
67. **Clean commercial**: Neutral curve, lively colors, a hint of glow.
68. **Documentary**: Reinhard roll-off, muted colors, fine grain.
69. **Super 8 home movie**: warm fade, big grain, dark corners, 4:3.
70. **Matrix**.
71. **Old photo**: sepia, grain and vignette.
72. **Film print**: print contrast, a warm-cool split, grain.
73. **Teal shadows (wheels)**: the same look built with the wheels instead of a LUT.
74. A preset at a strength: `/grade blockbuster 60%`.

### Scopes (only while you look at them)
75. **Waveform** (luma by position across the frame).
76. **Vectorscope**, with the six color targets and the skin-tone line.
77. **Histogram**: red, green, blue and luma.
78. The scopes come from a 96 × 54 read of the picture, four times a second, only while the Scopes tab shows and the window is visible.

### The ◐ Grade panel
79. **One compact card** over the top right of the preview, with tabs: Tone · Wheels · Curves · HSL · Color · LUT · Film · Lens · Scopes. One part shows at a time, with no row of new buttons. It remembers the last tab.
80. **Color wheels**: drag the dot toward a color (distance = how much), set the level with the slider under each wheel; double-click a wheel to reset it.
81. **Curves editor**: Luma / R / G / B tabs, drag the three points; double-click straightens the curve.
82. **Hue strip** to pick the hue the HSL qualifier changes.
83. **LUT grid**: starters, your imported LUTs and ＋ Import, all in one list.
84. **Double-click any slider** to put it back to its start value.
85. Moves are live, like a slider move. **Closing the panel** (or ⋯ › Keep) writes them into the scene.
86. **Presets ▾** and **⋯** (import, export, reset, turn off) sit in the panel's header; Esc closes it.

### The Lab sequence
87. **A grade per clip** (scenes, footage, pictures, titles, color cards): the same ◐ shader runs on top of that clip only, in the preview and in every render or export.
88. **A grade for the whole sequence** (clips without their own use it).
89. **Right-click a clip › ◐ Grade**: the panel for this clip, every preset, "Use it for the whole sequence", the panel for the whole sequence, No grade. Works on several selected clips at once.
90. **The ◐ Grade panel on a clip or the sequence**: every control, with the same tabs. Changes are one undo step at a time and show in the preview as you move.
91. A clip's grade sits on top of its older color look; the look isn't applied twice.

### Where to find it
92. **Right-click the preview › ◐ Grade**: the panel, Presets, LUT (+ Import), Scopes, Export the grade as a .cube.
93. **The FX picker's Grade tab**: every preset and LUT, searchable, with swatches (press X in the Lab).
94. **Layers ＋ / `/fx`**: "Grade (cinematic)" and "Film & lens" as plain filter layers.
95. **⌘/Ctrl+K "Lab: Grade…"**.
96. **⌘/Ctrl+K "Lab: Grade scopes"**.
97. **⌘/Ctrl+K "Lab: Import .cube LUTs…"**.
98. **⌘/Ctrl+K "Lab: Export the grade as a .cube LUT…"**.

### From chat (`/grade`, area "Three.js Lab")
99. `/grade`: the panel.
100. `/grade <preset> [60%]` (e.g. `/grade blockbuster`).
101. `/grade lut <name|none> [70%]`.
102. `/grade tone aces|agx|filmic|reinhard|neutral|none`.
103. `/grade set exposure=0.3 grain=0.2 bloom=0.4`: any setting, either layer, by its key or its label.
104. `/grade <setting> <value>` (e.g. `/grade exposure 0.5`, `/grade bars 2.39`, `/grade bloom 0.6`).
105. `/grade import <file.cube>` (alone: a file picker).
106. `/grade export [file.cube]`.
107. `/grade clip <n|name|all> <preset|none> [60%]`: a sequence clip's grade, or the whole sequence's.
108. `/grade scopes`.
109. `/grade status`: what the grade is now, in words ("ACES · LUT teal-orange · vignette · bloom").
110. `/grade presets` and `/grade luts`: the lists.
111. `/grade off` and `/grade keep`.
112. Completions for every subcommand, preset, LUT, tone, format and setting.
113. **Claude and Astra**: `three_do { cmd: "run", command: "/grade …" }`; app map topic `grade` (aliases lut, aces, bloom, letterbox, scopes…), read on demand.

### Fixes found on the way
114. A helper renderer the preview page makes for itself (filter thumbnails, grade bakes) when the director's eval or a message asks for it was taken for a stale module's renderer and drew nothing. It now draws.
115. Helper renderers draw at their own size. The preview's adaptive resolution shrank their viewport, which halved a thumbnail or a bake.

**Count: 115 upgrades.**

## How it was tested
- `dev/checks/grade.js` (new, `sh dev/run-checks.sh grade`, ≈ 50 s). It covers:
  - Pixel math on a row of known colors through the shader itself (`window.__grade.run`):
    - A neutral grade leaves the picture unchanged (difference 0).
    - Each control moves pixels the way it should: exposure ±, temperature, tint, contrast, lift / gamma / gain, the lift and gain wheels, the luma and red curves, the HSL qualifier (reds become green, reds desaturated, blue untouched), saturation 0 = grey, vibrance favouring the dull color, split toning, the five tone curves (black stays black, white near white), vignette, grain (more in the mids than near white), 2.39 bars, amount 0.
  - LUTs:
    - A 17³ inverting .cube made in the check gives 255 − x on every channel (≤ 2), and gives ≈ 128 at 50 %.
    - A 256-point 1D gamma .cube gives x² (≤ 3).
    - All 14 starter LUTs change the picture.
    - The imported LUTs reach the preview page.
  - The Lab:
    - `/grade kodak` makes ◐ Grade over ◐ Film & lens, and the page reports Grade drawn inside Film & lens (one pass).
    - The preview changes. Both layers at amount 0 give the original picture back (difference 0).
    - `/grade lut noir 100%` turns the preview black & white.
  - **Export round trip**: `/grade export` writes a 33³ .cube. Read back and applied as a LUT, it gives the grade's own pixels (mean difference 0.03 of 255).
  - Panel and scopes:
    - All 9 tabs render.
    - Moving Exposure in the panel brightens the preview, and closing the panel writes 1.5 into the layer's code.
    - Waveform, vectorscope and histogram draw from the picture and stop when closed.
  - **Sequence**, on the standard test sequence:
    - `/grade clip 1 noir` turns the red clip grey in the preview, with noir's 2.39 bars black. The next (green) clip stays green.
    - A still of that frame from the hidden export page shows the same grey (preview 122 vs render 119 luma), so preview = render.
    - `/grade clip 1 none` brings red back.
- `labgpu`, `labexport` (+ unit), `smooth-lab`, `qa-commands`: passed.
- `node dev/lazy-manifest.js` was regenerated, with /grade and the 4 ⌘/Ctrl+K actions in the lab group.

## Notes and limits
- The GLSL lives in `tools/three-sandbox.html` (section "cinematic grade"), so every page has it, including the one-file web page export. The starter LUTs are made there from small recipes. Imported LUTs come from the hub to each Lab page on its "ready". **A one-file web page export doesn't carry imported LUTs**: the starters work there, an imported LUT shows no LUT.
- A clip's grade goes on main-track clips and on the whole sequence. Overlay-track items keep their color look only, because a grade there would make the overlay opaque.
- Exporting a .cube needs the Lab open, since the grade is baked by the GPU. The .cube holds only the grade's color part: vignette, grain and bars depend on where a pixel sits.
- The scopes read a small merge of the picture (96 × 54). They are a guide, not broadcast-accurate.
- Only tested on SwiftShader (headless). Bloom and halation take 24 taps and streaks 16, which is cheap on a real GPU.
