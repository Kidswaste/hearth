# Kinetic type and lyrics (round 25, type): text as a first-class Lab layer, lyrics on the song

You make music visuals: this stream gives the Lab real typography. A **🅰 type layer** is a normal Lab layer whose code
is a `tweak({…})` block and one call, `textLayer(P, opts)`: crisp text at any size (a signed-distance-field atlas per
font, so outline, glow and softness are free and nothing blurs when it scales), or **3D extruded letters with a bevel**
in the lab3d materials. Letters, words or lines animate in and out (26 presets, stagger, order, easing), sit on a line
or a path, react to the kick and the bass, and a type layer can carry **timed lyrics**: paste them or load an .lrc /
.srt, and untimed lines are put on the song by the music analysis (line starts on onsets near the beat, words inside
the lines), with a tap-along mode to fix them. It stacks, blends, keyframes, sits in the sequence and in precomps, is
graded by the ◐ Grade layers above it, and exports the same frame every time.

Where: `/text` (the preset picker), `/text <preset> [words]`, `/lyrics`, right-click a layer › 🅰 Type ›, right-click the
preview › 🅰 Type ›, the FX picker's "Type" category, Ctrl/⌘+K "Lab: 🅰 …". Directors: `three_do { cmd: "type", op }`
(one short entry in three_do: "type {op} text, lyrics") and `three_add_layer { template: "type-chrome3d" }`, explained
on demand by `three_do help type` (nothing added to the per-message prompt). (`/type` was already the alias of
`/draft`, so the command is `/text`.)

Files: `tools/three-type.js` (hub: code, commands, picker, menus, lyrics, tap-along, director tool),
`tools/three-type-data.js` (sliders, animations, paths, looks, the 32 presets), `tools/three-type-lyrics.js` (parsing,
alignment, tap, LRC / SRT: no DOM, Node-tested), the "kinetic type layers" block in `tools/three-sandbox.html` (the
runtime); the three hub files are in the lazy `lab` group.

## How it works and stays light
- 2D: one SDF atlas per font and weight (each glyph drawn once at 64 px, its distance field by Felzenszwalb's
  transform as in Mapbox's TinySDF, shelf-packed, the atlas grows when full), shared by every type layer; glyphs are
  one instanced draw, four floats ×4 per glyph written in place each frame (no per-frame arrays), layouts cached.
- 3D: each letter's outline is traced from the font itself (marching squares on a 2× raster, simplified, holes found
  by nesting), extruded with a bevel, cached per font / letter / depth / bevel (≤ 400): any font the page can draw
  works, no font files to parse. One mesh a letter, pooled.
- Time is the scene's clock (`__layerClock`: its song, its own timeline, a sequence clip's or a precomp's time). With
  nothing to follow a title loops so the preview plays; a render steps the clock exactly, and the export page waits for
  a Google / asset font that is still loading, so **the same frame renders the same pixels** (checked).
- Measured headless (SwiftShader): 10 glyphs 0.6 ms render, one draw call; 3D "HI 3D" 2,404 triangles.

## Upgrades

### The layer (runtime in the preview)
1. **🅰 Type layers**: `textLayer(P, opts)` in a layer's code makes it a type layer (its own renderer from the context pool).
2. **Crisp SDF text at any size**: one distance-field atlas per font, shared by every type layer; scaling never blurs.
3. **Outline** (width and color) from the same field.
4. **Hollow letters**: Fill 0 with an outline draws only the outline.
5. **Glow** (amount and color) from the field, no extra pass.
6. **Softness** (out of focus).
7. **Any installed font** by family name (`opts.font`), with a weight.
8. **Google Fonts**: `font: "google:Anton"` downloads it into the page (`/text font google:Anton`).
9. **Asset-library fonts**: `/text font <name>` finds the font in the asset library (or a .ttf / .otf / .woff path) and uses it as a scene reference (`ref:<key>`).
10. **Renders wait for a font that is still loading** (a Google / asset font) and for 3D letters' reflections before drawing a frame.
11. **3D extruded letters** (`opts.mode: "3d"`): outlines traced from the font itself, holes and all (any font works).
12. **Depth** slider.
13. **Bevel** slider.
14. **12 materials on 3D letters**: plain, chrome, gold, glass, toon, clay, matte, wireframe, holographic, x-ray, normals, palette (the lab3d presets).
15. **Lights and room reflections** for 3D letters (chrome and gold look metal).
16. **3D spin and tilt** sliders.
17. **Fits the frame by itself**: a long line shrinks to stay inside.
18. **Several lines** (a new line or " / " starts one).
19. **Align** left / center / right.
20. **Case**: as typed, UPPER, lower.
21. **Letter spacing** and **line spacing** sliders.
22. **Size, position, opacity** sliders.
23. **A slow frame never stalls it**: no per-frame allocations, layouts and atlases cached, glyphs in one draw call.

### Animation (in and out)
24. In / out **Fade**.
25. **Typewriter** (one at a time).
26. **Wave** (rises in a wave).
27. **Scatter** (flies in from everywhere).
28. **Glitch** (jumps, flickers, wrong letters).
29. **Slide up**.
30. **Slide down**.
31. **Slide from the right**.
32. **Slide from the left**.
33. **Scale pop** (overshoot).
34. **Blur in** (comes into focus).
35. **Split-flap** (flips through letters like a departures board).
36. **Drop** (falls and bounces).
37. **Spin**.
38. **Flip** (turns over; in 3D a real turn).
39. **Zoom** (down from big).
40. **Elastic** (snaps in on a spring).
41. **Bounce** (from above).
42. **Scramble / decode** (random letters settle into the word).
43. **Tracking** (letters gather from wide spacing).
44. **Swing**.
45. **Stretch**.
46. **Fly-in** (at the camera in 3D, grows in 2D).
47. **Rise**.
48. **Neon flicker**.
49. **Shatter** (best as an out).
50. **Any of them as the out animation** (or none: the text stays).
51. **By glyph, word or line**.
52. **Order**: forward, reverse, from the center, from the edges, random.
53. **11 easings** (out, smooth, linear, in, in-out, expo, expo in-out, back, elastic, bounce, sine).
54. **Timing sliders**: starts at, stagger, each takes, hold (0 = stays).
55. **Amount** (how far / how big the move is).
56. **Float**: an idle drift once the letters are in.
57. **Words and lines turn and scale around their own middle**.
58. **Loops in the preview** with no song or in point; with one it follows the scene's clock (scrub, pause, render).

### Paths
59. **Around a circle** (spins with Path spin).
60. **Along an arc** (a banner).
61. **Along a sine wave** (it travels).
62. **Along a spiral**.
63. **Your own points** (`opts.points`, `three_do type path {kind: custom, points}`).
64. **Along the path** slider (slide the text along it).
65. **Path size** and **path spin** sliders.

### One letter at a time
66. **Glyph-level looks**: one letter's own color, scale, place, turn or alpha (`opts.glyphs`, `/text letter 3 #ff2bd6 1.4`, `three_do type letter`).

### Music (all sliders: Save, Shuffle, keyframes, MIDI work on them; 0 until you want it)
67. **Scale on kick**.
68. **Glow on kick**.
69. **Jitter on kick**.
70. **Bounce on kick**.
71. **Color on bass** (toward the accent).
72. **Per letter**: each letter reacts in its own time instead of all together.
73. **`/text react [kick | bass | jitter | off]`** sets them in one go.
74. Any type slider can also follow any sound through `/react-to` and its curve editor.

### Lyrics
75. **Paste lyrics** (one line each): `/lyrics`, the picker's Lyrics presets, the preview's right-click › 🅰 Type › Lyrics….
76. **[Chorus] tags, blank lines and (x2) are dropped** from pasted lyrics.
77. **.lrc files** (offset tag, several times on a line, an empty stamp ends a line).
78. **Enhanced .lrc word times** (`<mm:ss.xx>` before each word).
79. **.srt / .vtt files** (tags dropped, lines joined).
80. **Lines aligned to the song**: the singing span (after the intro, before the outro, from the analysis' sections) shared by syllables, each start snapped to an onset near the beat (kick, snare, hats, your hit markers).
81. **Words aligned inside each line** (by syllables, snapped to onsets in the line).
82. **Timed lines are tightened** onto an onset within 120 ms (an .lrc made by ear lands on the hit).
83. **No song loaded**: lines are spread a few seconds apart (`/lyrics align` once the song is in).
84. **🎤 Tap-along correction** (`/lyrics tap`, right-click › 🅰 Type › Tap along): a small strip shows the next line, Space marks its start while the song plays.
85. **A tap moves the lines after it too** (up to a line already tapped), snapped to an onset within 80 ms; ⌫ goes back, Enter keeps, Esc cancels.
86. **`/lyrics align`**: aligned to the song again (after a song change).
87. **`/lyrics shift <s>`**: every line earlier or later.
88. **Sync nudge** slider (the whole lyrics, live).
89. **`/lyrics export lrc | srt`** (also with word times: `lrc-words`), into a "Hearth lyrics" folder.
90. **`/lyrics sequence`**: the lines on the Lab sequence's Captions track (rendered with its caption look, written as an .srt next to the video).
91. **The lyrics live in the layer's code**: undoable, the time machine sees every change.
92. Lyric look **Centered fades** (each line in and out with the in / out animations).
93. Lyric look **Karaoke** (the line fills with the accent word by word as it is sung, the next line dim under it).
94. Lyric look **One word big**.
95. Lyric look **Scrolling** (every line, the sung one lit in the middle, gliding).
96. Lyric look **Typed** (each line types on across its own length).
97. Lyric look **Lines** (in / out presets per line: 3D lyric words).

### With the rest of the Lab
98. **Words into ✦ particles** (`/text particles`, right-click › 🅰 Type › Into particles): the particles' text emitter with the layer's words and font.
99. **The same exported frame twice is the same picture** (checked); the ◐ Grade layers grade type like everything else.
100. **The 32 presets are templates** in the FX picker's "Type" category and `/template type-<id>` / `three_add_layer { template }`.

### Presets (32; `/text <id> [words]`)
101. Title (`title`): rising in a wave, fading out.
102. Typewriter (`typewriter`).
103. Wave (`wave`): rises and keeps floating.
104. Scatter (`scatter`): in and out from everywhere.
105. Glitch (`glitch`).
106. Slide up (`slide`): words one after another.
107. Scale pop (`pop`).
108. Blur in (`blur`): from the middle out.
109. Split-flap (`splitflap`).
110. Decode (`decode`).
111. Neon sign (`neon`).
112. Outline (`outline`): outlined letters gathering in.
113. Drop (`drop`): words fall in, shatter out.
114. Stretch (`stretch`).
115. Chrome 3D (`chrome3d`).
116. Gold 3D (`gold3d`).
117. Glass 3D (`glass3d`).
118. Toon 3D (`toon3d`).
119. Hologram 3D (`holo3d`).
120. Circle badge (`circle`).
121. Arc banner (`arc`).
122. Wave line (`waveline`).
123. Spiral (`spiral`).
124. Kick title (`kick`): punches and glows on every kick.
125. Bass colors (`bass`).
126. Jitter punk (`punk`).
127. Lyrics: karaoke (`karaoke`).
128. Lyrics: one word big (`oneword`).
129. Lyrics: scrolling (`scroll`).
130. Lyrics: centered fades (`fades`).
131. Lyrics: typed (`typed`).
132. Lyrics: 3D words (`lyric3d`).

### Chat, menus, directors
133. **`/text`** (aliases `/text-layer`, `/lettering`): the preset picker (one searchable list; Enter adds, Shift+Enter replaces the selected type layer).
134. `/text <preset> [words]` (and `/text <any words>` = a title).
135. `/text text <words>`.
136. `/text 3d <words>` (and `/text 2d`).
137. `/text in <animation>` · `/text out <animation>`.
138. `/text by glyph | word | line`.
139. `/text path circle | arc | wave | spiral | line [size]`.
140. `/text font <family | google:Name | asset font>`.
141. `/text material <kind>`.
142. `/text set <slider> <value>`: written into the code (undoable); a slider the layer lacks is added.
143. `/text list [word]`, `/text info`, `/text help`.
144. **`/lyrics`** (`/lyric`, `/karaoke`): paste, `load [file]`, `look <look>`, `align`, `tap`, `shift`, `export`, `sequence`, `info`.
145. Right-click a 🅰 layer › 🅰 Type ›: Text…, In, Out, By, Path, Extrude (3D) / Flat, Material, ♪ React, lyric look / Tap along / Align / To the sequence (or Lyrics…), Into particles, Replace with a preset.
146. Right-click the preview › 🅰 Type ›: New type layer, Lyrics…, Lyrics from a file…, Tap along.
147. Ctrl/⌘+K "Lab: 🅰 Kinetic type (presets)…".
148. Ctrl/⌘+K "Lab: 🅰 Lyrics (paste, aligned to the song)…".
149. Ctrl/⌘+K "Lab: 🎤 Tap along to fix the lyric timing".
150. The keys sheet lists the tap-along keys (area Lab).
151. **`three_do type { op }`** for Claude and Astra: list, add, set, anim, path, text, font, mode, letter, lyrics, align, shift, react, particles, export, sequence, info, help (per-chat scenes like the other Lab tools); one short line in three_do (the lean tool list stays at 1,693 of its 1,700-token budget).
152. `three_do help type` (also text, lyrics, karaoke, lrc, srt, sdf, extrude, typography…): the whole API in one on-demand topic.
153. The scene's layer list marks 🅰 layers as `type (text / lyrics: three_do type)`.
154. `window.__labType` in the preview: each type layer's numbers (glyphs, font, the lyric line, a draw signature) and the music held at a value (three_eval, checks).

## How it was tested
- `node dev/type-test.js` (new, unit group, 25 checks): plain / .lrc (offset, multi-stamps, gaps, enhanced word times) /
  .srt parsing; on a 128 BPM onset map: aligned lines in order, after the intro and before the outro, every start on an
  onset (±30 ms), no overlaps, longer lines longer, words in order inside their lines and mostly on onsets; timed lines
  tightened ≤ 120 ms; no-song fallback; tap (snap ≤ 80 ms, the lines after move, a tapped line stops the move); shift;
  LRC / SRT round trips; the packed form. Passed.
- `dev/checks/type.js` (new, lab group, smoke): a 2D title draws its 10 glyphs (atlas, no errors, lit pixels); 3D
  "HI 3D" draws 4 letter meshes (2,404 triangles, holes); text on a circle vs the same text on a line (same glyphs,
  other places), arc / wave / spiral; with a generated 120 BPM song paused and sought, **all 26 in animations move the
  glyphs between 0.75 s and 1.05 s and settle on the word**; scatter out after the hold; by word; the held kick moves
  the letters; pasted lyrics aligned to the song with **every line start on an analysis onset (0 ms off)**, words
  timed; karaoke shows the sung line at its time; the five other looks draw; an .lrc keeps its times (≤ 120 ms); tap-along
  moves the tapped line +0.509 s and the lines after it by the same, the first stays; three_do type list / add / anim
  / info / help / react; `/text list`, `/text path`; **two exports of the same frame identical, another time different**.
  Passed.
- `sh dev/run-checks.sh labgpu smooth-lab qa-commands` passed; `node dev/director-mcp-test.js` passed (lean list 1,693 ≤ 1,700
  tokens); `node --check` on every touched file; `node dev/lazy-manifest.js` regenerated.

## Not done / risks
- MSDF (multi-channel) isn't used: the single-channel SDF keeps corners slightly rounded at very large sizes (outline,
  glow and softness come out better from it); fine at title sizes.
- 3D outlines are traced from a 128 px raster: very thin serifs at huge sizes are a little soft; thin fonts get fewer
  triangles. Many 3D lyric lines on screen at once cost a mesh a letter.
- Google Fonts need the network (offline: the system fallback, after up to 6 s in a render). A font that never loads
  renders in the fallback.
- Alignment uses onsets and beats, not vocals: lines land on hits near the right place, and the tap-along fixes the
  rest; it doesn't hear the singing.
- Not tried on a real GPU or a Mac here (SwiftShader only).

Count: 154 upgrades.
