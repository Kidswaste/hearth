# FX stream: effects, presets and add-ons for the Three.js Lab

Everything is in **one searchable picker** (press **X** in the Lab, or the Layers **＋ Layer** button) and drivable from chat
(`/fx`, `/template`, `/look-apply`, `/palette`, `/trigger-preset`, `/animate`, `/ease`, `/blend`, `/surprise`, `/fx-list`).
Filters and templates are normal layers: their settings are sliders, so Save / Shuffle / looks / keyframes all work.

## Picker and workflow

1. **FX picker**: one searchable list of everything below (660 items), opened by **X** in the Lab, the Layers **＋ Layer** button (Alt+click keeps the old plain menu), Ctrl+K → "Lab: Effects & layers picker", or `/fx-picker [kind]`.
2. Picker **tabs**: Add · Layers · Filters · Looks · Palettes · Triggers · Animate · Eases · Blends · All (Tab / Shift+Tab to switch).
3. Picker **search** across names, categories, descriptions and tags, best matches first.
4. Picker **keyboard**: ↑↓ / PgUp / PgDn move, Enter applies, Shift+Enter applies the alternative (shown in the footer), Esc closes.
5. Picker **favorites**: ★ on a row (or Ctrl+D); favorites sit at the top of every tab, and the ★ button shows only favorites.
6. Picker **recent**: the last things you applied, at the top of each tab.
7. Picker **🎲 Surprise me** (Alt+R): applies a random item from the current tab. Also `/surprise [filter|layer|look|palette]` and Ctrl+K → "Lab: Surprise me".
8. **Live filter thumbnails**: each filter is previewed on *your current picture* (rendered in the sandbox, only for rows in view); a test card is used when the preview is black.
9. Swatch thumbnails for looks, palettes and layer templates, band diagrams for trigger presets, curves for eases, and live blend-mode samples for blend presets.
10. **Apply to the selected layer**: filters go right above the selected layer (Shift+Enter: on top of everything); layers on top (Shift+Enter: above the selected one).
11. Looks replace the previous look: their filter layers are named "✦ …" and swapped out together; the selected layer stays selected.
12. Palettes and looks **recolor the selected layer**'s color sliders (undo with ↶ in Sliders; Shift+Enter / `--only` / `--colors` skips that).
13. **Trigger presets** in the ⚡ Triggers "Presets ▾" menu: the five classics plus "All 67 presets… (search)" opening the picker.
14. Ctrl+K actions: "Lab: Looks…", "Lab: Palettes…", "Lab: Trigger presets…", "Lab: Animate the selected layer…", "Lab: Keyframe eases…", "Lab: Blend presets…".

## Chat commands (area "Three.js Lab")

15. `/fx [filter] [--top]`: add a filter layer (alone: the picker on Filters). Suggestions as you type.
16. `/fx-list [filters|layers|looks|palettes|triggers|animate|eases|blends] [category]`: lists the pack in the chat, grouped by category.
17. `/template [name] [--above]` (also `/layer-add`): add a ready-made layer.
18. `/look-apply [look] [--colors]` (also `/look` when no other command owns that name): apply a look.
19. `/palette [name] [--only]`: set the sketch palette and recolor the selected layer.
20. `/trigger-preset [genre or behavior]`: set the ⚡ triggers.
21. `/animate [animation]`: one-click keyframes on the selected layer.
22. `/ease [ease]`: every keyframe of the selected layer uses that ease.
23. `/blend [preset]`: blend mode + opacity preset for the selected layer.
24. `/surprise [kind]` (also `/random-fx`): a random filter, layer, look or palette.
25. `/fx-picker [kind]` (also `/effects`): open the picker.

## Filter engine (sandbox)

26. Shared GLSL helpers for every filter: HSV conversion, hue shift, value noise / fbm, 9-tap blur, Bayer 2/4/8 dither thresholds.
27. Every filter can react to any music source: kick, snare, bass, level, beat, hit, hi-hats or the **drop** ("Reacts to" + "Music amount" sliders).
28. New music uniforms for filters: hi-hats, drop (fades after a detected drop) and beat phase.
29. Filter sliders the shader uses are declared as uniforms automatically (less boilerplate, fewer mistakes).
30. No per-frame allocations in filter layers (colors written into their own vectors, reused size vector).
31. Stacked filters are faster: a filter skips the layers already covered by an opaque, untransformed filter below it.
32. Feedback filters use half-float buffers (longer trails without banding).
33. `filter.types`, `filter.check()` (compiles every filter, reports failures) and `filter.thumbs()` for the director, tests and the picker.
34. 113 new filter shaders (all compile-checked; list below).
35. ASCII glyph atlases support any Unicode characters (blocks, katakana).
36. Keyframe colors can no longer overflow with overshooting eases.

## Filters (156 new filter layers; ★ = preset of another filter)

37. **RGB split** (Glitch): Red, green and blue pulled apart, harder on kicks. `/fx rgb split`
38. **Block glitch** (Glitch): Rectangles of the picture jump, swap colors and invert on hits. `/fx block glitch`
39. **Scanline tear** (Glitch): Horizontal lines tear sideways. `/fx scanline tear`
40. **Pixel sort** (Glitch): Bright areas smear into streaks, like sorted pixels. `/fx pixel sort`
41. **Datamosh melt** (Glitch): Frames melt and drip into each other in blocks. `/fx datamosh melt`
42. **Datamosh bloom** (Glitch): Still areas freeze and bloom outward while motion breaks through. `/fx datamosh bloom`
43. **Datamosh freeze** (Glitch): Random blocks freeze (dropped I-frames), more on hits. `/fx datamosh freeze`
44. **Digital noise** (Glitch): Corrupted static and broken lines. `/fx digital noise`
45. **JPEG crunch** (Glitch): Over-compressed: 8×8 blocks and color smear, worse on kicks. `/fx jpeg crunch`
46. **Interlace** (Glitch): Every other line shifts, like a bad deinterlace. `/fx interlace`
47. **Wave tear** (Glitch): Rows wave sideways with color fringes. `/fx wave tear`
48. **Chroma bands** (Glitch): Bands of the picture slip and change hue on hits. `/fx chroma bands`
49. **Bit crush** (Glitch): Few colors with ordered dithering. `/fx bit crush`
50. **Noise displace** (Glitch): The picture warps along flowing noise. `/fx noise displace`
51. **Film grain** (Film): Fine animated grain, stronger in the shadows. `/fx film grain`
52. **Halation** (Film): Red-orange glow bleeding around highlights, like real film. `/fx halation`
53. **Gate weave** (Film): The frame drifts and jitters like film in a projector. `/fx gate weave`
54. **Light leaks** (Film): Warm drifting light leaks from the edges. `/fx light leaks`
55. **Vignette** (Film): Dark (or colored) corners that can pulse with the music. `/fx vignette`
56. **VHS tape** (Film): Smeared color, wobble, dropouts and head-switching noise. `/fx vhs tape`
57. **CRT monitor** (Film): Aperture grille, scanlines, glow and a rolling bar. `/fx crt monitor`
58. **8mm film** (Film): Super 8 home movie: grain, weave, warm color, scratches. `/fx 8mm film`
59. **Dust & scratches** (Film): Specks, hairs and scratch lines over the picture. `/fx dust & scratches`
60. **Bleach bypass** (Film): Silvery, contrasty, less color. `/fx bleach bypass`
61. **Sepia** (Film): Old photo toning. `/fx sepia`
62. **Letterbox** (Frame): Cinema bars for a wider (or other) ratio. `/fx letterbox`
63. **Tritone** (Color): Three colors for shadows, mids and highlights. `/fx tritone`
64. **Gradient map** (Color): Brightness mapped onto a 4-color gradient that can cycle on the beat. `/fx gradient map`
65. **Posterize** (Color): Flat bands of color. `/fx posterize`
66. **Hue cycle** (Color): Colors rotate around the color wheel, jumping on hits. `/fx hue cycle`
67. **Infrared** (Color): Aerochrome-style false color infrared. `/fx infrared`
68. **Solarize** (Color): Bright parts flip negative (Sabattier). `/fx solarize`
69. **Invert** (Color): Negative, or a negative flash on hits. `/fx invert`
70. **Color grade** (LUT): A cinematic grade from a list of looks. `/fx color grade`
71. **Channel swap** (Color): Swap or isolate the red, green and blue channels. `/fx channel swap`
72. **Adjust** (Color): Brightness, contrast, saturation, vibrance, temperature, gamma. `/fx adjust`
73. **Colorize** (Color): Everything in one color. `/fx colorize`
74. **Split tone** (Color): One color in the shadows, another in the highlights. `/fx split tone`
75. **Night vision** (Color): Green image intensifier with noise. `/fx night vision`
76. **False color** (Color): Brightness as rainbow bands with contour lines. `/fx false color`
77. **Levels** (Color): Black point, white point and gamma. `/fx levels`
78. **Prism** (Color): A rainbow gradient washed over the picture. `/fx prism`
79. **Selective color** (Color): Black & white except one color (Sin City). `/fx selective color`
80. **Neonize** (Color): Saturated neon colors with glow. `/fx neonize`
81. **Heat map** (Color): Blue → cyan → yellow → red by brightness. `/fx heat map`
82. **Dither** (Stylize): Ordered or noise dithering with retro palettes. `/fx dither`
83. **ASCII rain** (Stylize): Green code rain shaped by the picture. `/fx ascii rain`
84. **ASCII blocks** (Stylize): Shade blocks ░▒▓█ instead of characters. `/fx ascii blocks`
85. **ASCII dense** (Stylize): A long 70-character ramp for detailed text art. `/fx ascii dense`
86. **Hex pixels** (Stylize): Hexagon mosaic. `/fx hex pixels`
87. **Triangle mosaic** (Stylize): Low-poly triangles. `/fx triangle mosaic`
88. **Crystallize** (Stylize): Moving Voronoi cells with outlines. `/fx crystallize`
89. **Mirror** (Distort): Reflect half (or a quarter) of the frame. `/fx mirror`
90. **Tile** (Distort): Repeat the picture in a grid that grows on hits. `/fx tile`
91. **Fisheye** (Distort): Barrel lens distortion that breathes with the bass. `/fx fisheye`
92. **Bulge / pinch** (Distort): Bulge out (or pinch in) around a point. `/fx bulge / pinch`
93. **Twirl** (Distort): A swirl in the middle. `/fx twirl`
94. **Ripple** (Distort): Water ripples from the center, sent by kicks. `/fx ripple`
95. **Wave warp** (Distort): Sine waves bend the picture. `/fx wave warp`
96. **Emboss** (Stylize): Raised relief, like stamped metal. `/fx emboss`
97. **Toon** (Stylize): Cel-shaded flat colors with ink outlines. `/fx toon`
98. **Neon edges** (Stylize): Glowing neon outlines (rainbow or one color). `/fx neon edges`
99. **Pencil sketch** (Stylize): Pencil lines and hatching on paper. `/fx pencil sketch`
100. **Oil paint** (Stylize): Painterly brush areas (Kuwahara). `/fx oil paint`
101. **Crosshatch** (Stylize): Ink cross-hatching by darkness. `/fx crosshatch`
102. **LED wall** (Stylize): A wall of glowing LED dots. `/fx led wall`
103. **Scanlines** (Stylize): Plain horizontal scanlines, optionally scrolling. `/fx scanlines`
104. **Polar / tunnel** (Distort): Wrap the picture into a circle, unwrap it, or fly through it as a tunnel. `/fx polar / tunnel`
105. **Frosted glass** (Distort): Seen through bumpy frosted glass. `/fx frosted glass`
106. **Glass blocks** (Distort): Seen through a wall of glass bricks. `/fx glass blocks`
107. **Heat haze** (Distort): Shimmering hot air rising. `/fx heat haze`
108. **Contour lines** (Stylize): Topographic lines that follow brightness. `/fx contour lines`
109. **Mandala** (Distort): Kaleidoscope with mirrored rings flowing outward. `/fx mandala`
110. **CMYK print** (Stylize): Four rotated halftone screens like a magazine. `/fx cmyk print`
111. **Slit scan** (Feedback): One line of the picture smeared across time. `/fx slit scan`
112. **Outline** (Stylize): Clean outlines on a solid background. `/fx outline`
113. **Line shading** (Stylize): The picture drawn with parallel lines of varying width. `/fx line shading`
114. **Bloom** (Blur & light): Soft glow around bright parts, pumping on kicks. `/fx bloom`
115. **Zoom blur** (Blur & light): Radial blur from a point, punching on kicks. `/fx zoom blur`
116. **Motion blur** (Blur & light): Blur in one direction. `/fx motion blur`
117. **Tilt-shift** (Blur & light): Miniature look: a sharp band, blurred above and below. `/fx tilt-shift`
118. **God rays** (Blur & light): Light shafts streaming from a point. `/fx god rays`
119. **Lens flare** (Blur & light): A drifting lens flare with ghosts and halo. `/fx lens flare`
120. **Chromatic aberration** (Blur & light): Lens color fringing toward the edges. `/fx chromatic aberration`
121. **Anamorphic streaks** (Blur & light): Long horizontal blue streaks on highlights. `/fx anamorphic streaks`
122. **Dream glow** (Blur & light): Soft-focus diffusion (Pro-Mist). `/fx dream glow`
123. **Blur** (Blur & light): Plain soft blur (great for backgrounds). `/fx blur`
124. **Sharpen** (Blur & light): Crisper edges. `/fx sharpen`
125. **Star filter** (Blur & light): Star-shaped sparkles on bright points. `/fx star filter`
126. **Shine sweep** (Blur & light): A glossy light band sweeping across, once per beat. `/fx shine sweep`
127. **Trails** (Feedback): Moving things leave fading trails. `/fx trails`
128. **Video echo** (Feedback): Echoes that zoom, turn and shift hue. `/fx video echo`
129. **Zoom feedback** (Feedback): Infinite tunnel feedback: dark areas fill with the zooming past. `/fx zoom feedback`
130. **Liquid smear** (Feedback): The picture flows like paint in water. `/fx liquid smear`
131. **Ghost** (Feedback): A tinted onion-skin of the last frames. `/fx ghost`
132. **RGB trails** (Feedback): Each color channel leaves a different trail length. `/fx rgb trails`
133. **Melt** (Feedback): Bright parts drip down the screen. `/fx melt`
134. **Kaleido feedback** (Feedback): Kaleidoscopic echoes folding into themselves. `/fx kaleido feedback`
135. **Kick shake** (Beat): Camera shake, twist and zoom on every kick. `/fx kick shake`
136. **Snare flash** (Beat): A flash of color (or a negative) on every snare. `/fx snare flash`
137. **Strobe** (Beat): Strobe flashes or blackouts on beats, half / quarter beats or hits. `/fx strobe`
138. **Bass zoom** (Beat): The frame punches in with the bass. `/fx bass zoom`
139. **Beat invert** (Beat): Flips to negative while a hit sounds. `/fx beat invert`
140. **Beat shatter** (Beat): The frame shatters into tiles on hits and snaps back. `/fx beat shatter`
141. **Hi-hat glitter** (Beat): Sparkles on bright areas with every hi-hat. `/fx hi-hat glitter`
142. **Drop boom** (Beat): A big zoom, split and flash when the drop hits. `/fx drop boom`
143. **Pulse vignette** (Beat): The dark edges breathe in on every hit. `/fx pulse vignette`
144. **Glow border** (Frame): A rounded frame with glow, great for social posts. `/fx glow border`
145. **Viewfinder** (Frame): Camera viewfinder corners and a center cross. `/fx viewfinder`
146. **Grade · Teal & orange** (LUT, ★ preset): Color grade preset: teal & orange. `/fx grade · teal & orange`
147. **Grade · Bleach** (LUT, ★ preset): Color grade preset: bleach. `/fx grade · bleach`
148. **Grade · Cross process** (LUT, ★ preset): Color grade preset: cross process. `/fx grade · cross process`
149. **Grade · Matrix** (LUT, ★ preset): Color grade preset: matrix. `/fx grade · matrix`
150. **Grade · Warm film** (LUT, ★ preset): Color grade preset: warm film. `/fx grade · warm film`
151. **Grade · Cold blue** (LUT, ★ preset): Color grade preset: cold blue. `/fx grade · cold blue`
152. **Grade · Faded pastel** (LUT, ★ preset): Color grade preset: faded pastel. `/fx grade · faded pastel`
153. **Grade · Noir** (LUT, ★ preset): Color grade preset: noir. `/fx grade · noir`
154. **Grade · Sunset** (LUT, ★ preset): Color grade preset: sunset. `/fx grade · sunset`
155. **Grade · Cyberpunk** (LUT, ★ preset): Color grade preset: cyberpunk. `/fx grade · cyberpunk`
156. **Grade · Kodachrome** (LUT, ★ preset): Color grade preset: kodachrome. `/fx grade · kodachrome`
157. **Grade · Forgeheart** (LUT, ★ preset): Color grade preset: forgeheart. `/fx grade · forgeheart`
158. **Grade · Vaporwave** (LUT, ★ preset): Color grade preset: vaporwave. `/fx grade · vaporwave`
159. **Grade · Moonlight** (LUT, ★ preset): Color grade preset: moonlight. `/fx grade · moonlight`
160. **Grade · Desert** (LUT, ★ preset): Color grade preset: desert. `/fx grade · desert`
161. **Grade · Emerald** (LUT, ★ preset): Color grade preset: emerald. `/fx grade · emerald`
162. **Grade · Rose gold** (LUT, ★ preset): Color grade preset: rose gold. `/fx grade · rose gold`
163. **Game Boy** (Stylize, ★ preset): Four greens, chunky pixels. `/fx game boy`
164. **1-bit dither** (Stylize, ★ preset): Pure black and white Bayer dither. `/fx 1-bit dither`
165. **Two-tone dither** (Stylize, ★ preset): Dithered into your two colors. `/fx two-tone dither`
166. **Noise dither** (Stylize, ★ preset): Animated noise dithering. `/fx noise dither`
167. **Mirror · four ways** (Distort, ★ preset): Quad symmetry. `/fx mirror · four ways`
168. **Mirror · top to bottom** (Distort, ★ preset): Reflect the top half down. `/fx mirror · top to bottom`
169. **Little planet** (Distort, ★ preset): The picture wrapped into a circle. `/fx little planet`
170. **Unwrap** (Distort, ★ preset): A circle unwrapped into a band. `/fx unwrap`
171. **Kick strobe** (Beat, ★ preset): White flash on every kick. `/fx kick strobe`
172. **Blackout strobe** (Beat, ★ preset): Blackouts on half beats. `/fx blackout strobe`
173. **4:3 frame** (Frame, ★ preset): Old TV ratio. `/fx 4:3 frame`
174. **Square frame** (Frame, ★ preset): 1:1 inside any frame size. `/fx square frame`
175. **Lens split** (Glitch, ★ preset): RGB split growing toward the edges. `/fx lens split`
176. **Long exposure** (Feedback, ★ preset): Very long trails, like a long exposure. `/fx long exposure`
177. **Spiral echo** (Feedback, ★ preset): Echoes spiral inward. `/fx spiral echo`
178. **Bloom · heavy** (Blur & light, ★ preset): Big bright glow. `/fx bloom · heavy`
179. **Vignette · pulsing** (Beat, ★ preset): Corners close in on kicks. `/fx vignette · pulsing`
180. **Film grain · heavy** (Film, ★ preset): Coarse 16mm grain. `/fx film grain · heavy`
181. **Hex pixels · chunky** (Stylize, ★ preset): Huge hexagons that pump. `/fx hex pixels · chunky`
182. **8-bit console** (Stylize, ★ preset): Big pixels, 2 bits per channel. `/fx 8-bit console`
183. **Gradient map · fire** (Color, ★ preset): Black → red → orange → yellow. `/fx gradient map · fire`
184. **Gradient map · ice** (Color, ★ preset): Navy → blue → cyan → white. `/fx gradient map · ice`
185. **Gradient map · Forgeheart** (Color, ★ preset): Forge colors: violet, ember, gold. `/fx gradient map · forgeheart`
186. **Poster · 3 levels** (Color, ★ preset): Very flat, screen-print look. `/fx poster · 3 levels`
187. **Whirlpool** (Distort, ★ preset): A strong spinning whirlpool. `/fx whirlpool`
188. **Rain drop** (Distort, ★ preset): Gentle water ripples. `/fx rain drop`
189. **ASCII · terminal** (Stylize, ★ preset): Green terminal characters. `/fx ascii · terminal`
190. **VHS · worn out** (Film, ★ preset): A tape played a hundred times. `/fx vhs · worn out`
191. **Glitch · subtle** (Glitch, ★ preset): Small, tasteful glitches on hits. `/fx glitch · subtle`
192. **CRT · arcade** (Film, ★ preset): Strong curve and phosphor glow. `/fx crt · arcade`

## Layer templates (85 new, music-reactive, every setting a slider)

193. **Gradient flow** (Backgrounds): Soft flowing gradient of three colors that pulses on kicks. `/template gradient flow`
194. **Mesh gradient** (Backgrounds): Four colored blobs blending like a modern app wallpaper. `/template mesh gradient`
195. **Plasma** (Backgrounds): Classic demoscene plasma, faster with the bass. `/template plasma`
196. **Aurora** (Backgrounds): Northern lights curtains over a dark sky. `/template aurora`
197. **Warp starfield** (Backgrounds): Stars streaking past, jumping to warp on kicks. `/template warp starfield`
198. **Neon tunnel** (Backgrounds): A flying tunnel of neon rings that flash on kicks. `/template neon tunnel`
199. **Synthwave grid** (Backgrounds): Retro sun over a scrolling neon grid. `/template synthwave grid`
200. **Metaballs** (Backgrounds): Gooey blobs that merge, swell on kicks. `/template metaballs`
201. **Lava lamp** (Backgrounds): Slow warm blobs rising and falling. `/template lava lamp`
202. **Cell field** (Backgrounds): Living Voronoi cells with glowing borders. `/template cell field`
203. **Sunburst** (Backgrounds): Rotating rays from the center, pulsing on beats. `/template sunburst`
204. **Clouds** (Backgrounds): Soft drifting clouds (sky or smoke). `/template clouds`
205. **Fire** (Backgrounds): Rising flames that flare on kicks. `/template fire`
206. **Water caustics** (Backgrounds): Light dancing on a pool floor. `/template water caustics`
207. **Warped checkers** (Backgrounds): Op-art checkerboard twisting with the beat. `/template warped checkers`
208. **Pulse circles** (Backgrounds): Concentric circles radiating out on every kick. `/template pulse circles`
209. **Hypno spiral** (Backgrounds): A spinning hypnotic spiral. `/template hypno spiral`
210. **Fractal zoom** (Backgrounds): A Julia set that morphs with the bass. `/template fractal zoom`
211. **Liquid orb** (Backgrounds): A raymarched glossy orb that wobbles with the bass. `/template liquid orb`
212. **Infinite columns** (Backgrounds): Flying through an endless field of glowing pillars. `/template infinite columns`
213. **Moiré** (Backgrounds): Two drifting ring patterns interfering. `/template moiré`
214. **Spectrum glow** (Backgrounds): Full-screen glowing spectrum bars. `/template spectrum glow`
215. **Spectrum halo** (Backgrounds): The spectrum wrapped around a glowing circle. `/template spectrum halo`
216. **Laser show** (Backgrounds): Sweeping laser beams from the bottom, flashing on hits. `/template laser show`
217. **Color wash** (Backgrounds): Full-screen color flashes on kicks (transparent between hits). `/template color wash`
218. **Spotlights** (Backgrounds): Moving stage spotlights (transparent overlay). `/template spotlights`
219. **Twinkling stars** (Backgrounds): A starry sky that twinkles with the hi-hats. `/template twinkling stars`
220. **Truchet maze** (Backgrounds): Animated arcs tiling into a maze that flips on beats. `/template truchet maze`
221. **Beat dots** (Backgrounds): A grid of dots lighting up with the spectrum. `/template beat dots`
222. **Glitch blocks** (Backgrounds): Flickering colored blocks, more on hits. `/template glitch blocks`
223. **Ink swirl** (Backgrounds): Marbled ink swirling (domain-warped noise). `/template ink swirl`
224. **Sonar** (Backgrounds): A radar sweep with pings on hits. `/template sonar`
225. **Vapor sun** (Backgrounds): A big striped sunset sun with a glow. `/template vapor sun`
226. **Contour map** (Backgrounds): Animated topographic map lines. `/template contour map`
227. **Kaleido pattern** (Backgrounds): A self-generating kaleidoscope (no picture needed). `/template kaleido pattern`
228. **Neon rain** (Backgrounds): Falling neon streaks (rain at night). `/template neon rain`
229. **Bokeh** (Backgrounds): Soft out-of-focus light circles drifting. `/template bokeh`
230. **Speed lines** (Backgrounds): Manga speed lines radiating from the center. `/template speed lines`
231. **Spectrum bars** (Visualizers): Classic equalizer bars along the bottom (or mirrored in the middle). `/template spectrum bars`
232. **Radial spectrum** (Visualizers): Spectrum bars around a circle (put a cover or logo in the middle). `/template radial spectrum`
233. **Oscilloscope** (Visualizers): The waveform as a glowing line across the frame. `/template oscilloscope`
234. **Waveform ring** (Visualizers): The waveform bent into a circle. `/template waveform ring`
235. **Sound blob** (Visualizers): A smooth filled blob shaped by the spectrum. `/template sound blob`
236. **Spectrogram** (Visualizers): A scrolling waterfall of the spectrum over time. `/template spectrogram`
237. **VU meters** (Visualizers): Level, bass, mids and highs as meters with peak hold. `/template vu meters`
238. **Hi-fi equalizer** (Visualizers): Segmented LED bars like an old stereo, with peak dots. `/template hi-fi equalizer`
239. **Title** (Text & HUD): Big title text that punches on kicks (pick or edit the text). `/template title`
240. **Caption bar** (Text & HUD): A lower-third bar with a title and subtitle. `/template caption bar`
241. **Beat counter** (Text & HUD): Bar · beat · BPM readout with a beat light. `/template beat counter`
242. **Song progress** (Text & HUD): A thin progress bar for the song (or loop). `/template song progress`
243. **Timecode** (Text & HUD): A running SMPTE timecode in a corner. `/template timecode`
244. **Now playing** (Text & HUD): A card with the song name, a little equalizer and progress. `/template now playing`
245. **Safe zones** (Social): TikTok / Reels / Shorts UI zones to keep text clear (hide before exporting). `/template safe zones`
246. **Drop countdown** (Text & HUD): Counts down to the next detected drop. `/template drop countdown`
247. **Bouncing logo** (Text & HUD): Text bouncing around the frame, changing color on each wall. `/template bouncing logo`
248. **Confetti** (Visualizers): Bursts of confetti on hits. `/template confetti`
249. **Marquee** (Text & HUD): Scrolling text band (news ticker style). `/template marquee`
250. **Glitch text** (Text & HUD): Text that tears into RGB slices on hits. `/template glitch text`
251. **Story bars** (Social): Instagram-story style segments that fill bar by bar. `/template story bars`
252. **Handle tag** (Social): Your @handle in a pill in a corner, nudging on kicks. `/template handle tag`
253. **Word flash** (Text & HUD): One word per beat from a list (kinetic typography). `/template word flash`
254. **Data HUD** (Text & HUD): Sci-fi readouts of the music: levels, bpm, a mini scope. `/template data hud`
255. **Spectrum city** (3D): A city of boxes: each row is the spectrum a moment ago, scrolling toward you. `/template spectrum city`
256. **Cube burst** (3D): Hundreds of cubes on a sphere that burst outward on kicks. `/template cube burst`
257. **Particle galaxy** (3D): A spiral galaxy of glowing points that spins with the music. `/template particle galaxy`
258. **Breathing sphere** (3D): A sphere of points that breathes with the bass and ripples with noise. `/template breathing sphere`
259. **Particle fountain** (3D): Sparks shooting up on every kick and falling back. `/template particle fountain`
260. **Pulsar lines** (3D): Stacked waveform lines like a famous album cover. `/template pulsar lines`
261. **Spectrum terrain** (3D): A wireframe landscape raised by the spectrum, scrolling toward you. `/template spectrum terrain`
262. **Ring tunnel** (3D): Glowing rings flying past the camera. `/template ring tunnel`
263. **Wire mountains** (3D): A wireframe noise landscape flyover (synthwave). `/template wire mountains`
264. **Noise blob** (3D): A glossy blob deformed by noise, swelling with the bass. `/template noise blob`
265. **Chrome knot** (3D): A shiny torus knot that twists on kicks. `/template chrome knot`
266. **Orbits** (3D): Glowing spheres orbiting a core, each orbit a slice of the spectrum. `/template orbits`
267. **DNA helix** (3D): A rotating double helix of glowing beads. `/template dna helix`
268. **Cube wave** (3D): A grid of cubes rippling like water from the center. `/template cube wave`
269. **Lissajous** (3D): A glowing 3D Lissajous curve that changes shape on bars. `/template lissajous`
270. **Shape cycle** (3D): A neon wireframe shape that becomes a new one every bar. `/template shape cycle`
271. **Box tunnel** (3D): Flying through a square tunnel of boxes. `/template box tunnel`
272. **Swarm** (3D): A flock of little arrows swirling, scattering on kicks. `/template swarm`
273. **Spectrum crown** (3D): A circle of 3D bars standing up with the spectrum. `/template spectrum crown`
274. **Hyperspace** (3D): Real 3D stars streaming past, jumping to warp on the drop. `/template hyperspace`
275. **Ripple floor** (3D): A shiny floor where every kick drops a ripple. `/template ripple floor`
276. **Metaballs 3D** (3D): Real 3D metaballs (marching cubes) merging and swelling. `/template metaballs 3d`
277. **Mirror ball** (3D): A disco ball whose tiles flash to the music. `/template mirror ball`

## Looks (154: palette + filter layers)

278. **Forgeheart** (Forgeheart): The house look: gold glow, ember grade, dark corners — bloom + grade + vignette.
279. **Forge ember** (Forgeheart): Hot embers bleeding into black — halation + grain + vignette.
280. **Anvil strike** (Forgeheart): Metal sparks on every kick — kickshake + starburst + grade.
281. **Rune glow** (Forgeheart): Violet runes glowing in the dark — neonglow + bloom.
282. **Molten core** (Forgeheart): Lava colors with heat shimmer — gradientmap-fire + bloom + heathaze.
283. **Quench** (Forgeheart): Steel cooling in blue water — grade + anamorphic + grain.
284. **Hearth fire** (Forgeheart): Warm and cozy, like sitting by the fire — dreamglow + lightleak + vignette.
285. **Arcane forge** (Forgeheart): Magic violet with gold sparks — chromatic + bloom + grade.
286. **Forge HUD** (Forgeheart): Game-like gold HUD frame — scanframe + scanlines + bloom.
287. **Slag** (Forgeheart): Gritty desaturated metal — bleach + grain + vignette.
288. **Gold dust** (Forgeheart): Gold sparkles on the hi-hats — hatsglitter + bloom + vignette.
289. **Ember rain** (Forgeheart): Glowing drips falling down — melt + bloom.
290. **Blade edge** (Forgeheart): Gold outlines on black — outline + bloom.
291. **Crucible** (Forgeheart): Three-tone molten metal — tritone + bloom.
292. **Forgeheart pixel** (Forgeheart): Retro game Forgeheart — bitcrush + bloom.
293. **Forge heat haze** (Forgeheart): Air shimmering over the anvil — heathaze + grade + bloom.
294. **Runic glitch** (Forgeheart): Glitching violet magic — chromaglitch + rgbsplit + bloom.
295. **Smithy at night** (Forgeheart): Blue night, orange fire — grade + halation + vignette.
296. **Golden forge** (Forgeheart): Everything in violet, ember and gold — gradientmap-forge + bloom.
297. **Forge echoes** (Forgeheart): Golden echoes trailing the beat — echo + bloom.
298. **Hammer drop** (Forgeheart): Gold flash and shake on the drop — dropboom + kickshake + bloom.
299. **Blockbuster** (Cinematic): Teal and orange, wide bars, blue flares — grade + anamorphic + letterbox + grain.
300. **Noir** (Cinematic): Hard black and white — grade + grain + vignette.
301. **Bleach bypass** (Cinematic): Silvery, gritty war-movie look — bleach + grain + vignette.
302. **Golden hour** (Cinematic): Warm late-afternoon sun — grade + lightleak + dreamglow.
303. **Moonlit** (Cinematic): Blue night scene — grade + dreamglow + vignette.
304. **Thriller** (Cinematic): Sickly green tension — grade + sharpen + vignette.
305. **Epic trailer** (Cinematic): Light shafts, flares, bars — godrays + anamorphic + letterbox + grade.
306. **Pro-Mist** (Cinematic): Soft blooming highlights — dreamglow + halation + grade.
307. **Desert road** (Cinematic): Hot dusty highway — grade + heathaze + grain.
308. **Emerald city** (Cinematic): Rich greens — grade + bloom + vignette.
309. **Tilt-shift town** (Cinematic): Everything looks like a miniature — tiltshift + adjust.
310. **Lens flare** (Cinematic): Sun flares and glow — lensflare + bloom + grade.
311. **Widescreen** (Cinematic): Cinemascope bars and cool grade — letterbox + grade + grain.
312. **Rose gold** (Cinematic): Soft pink metallic — grade + dreamglow.
313. **Sunset drive** (Cinematic): Purple-orange evening — grade + lightleak + anamorphic.
314. **VHS home video** (Retro): A camcorder tape from 1994 — tape + vhs + vignette.
315. **Super 8 memory** (Retro): Warm home movie film — super8 + lightleak.
316. **Old TV** (Retro): A flickering tube TV — crtroll + grain.
317. **Arcade** (Retro): Curved arcade cabinet screen — crt-arcade + bloom.
318. **Game Boy** (Retro): Four shades of green — dither-gameboy.
319. **8-bit** (Retro): Console pixels — bitcrush-nes + scanlines.
320. **Polaroid** (Retro): Instant photo with a white frame — grade + grain + vignette + border.
321. **Kodachrome** (Retro): Saturated slide film — grade + grain.
322. **Sepia print** (Retro): Old brown photograph — sepia + dust + vignette.
323. **Found footage** (Retro): Lost tape horror — vhs-worn + dust + gateweave.
324. **Newspaper** (Retro): Printed dots on paper — halftone + grain.
325. **Comic** (Retro): Inked cartoon with print dots — toon + cmyk.
326. **Magazine** (Retro): Four-color print — cmyk.
327. **Pixel art** (Retro): Chunky pixels — pixelate.
328. **Teletext** (Retro): Blocky TV text page — pixelate + scanlines.
329. **70s show** (Retro): Warm hazy seventies — grade + dreamglow + grain + vignette.
330. **Daguerreotype** (Retro): The oldest photo look — sepia + gateweave + dust + vignette.
331. **Silent film** (Retro): Flickering black and white, 4:3 — grade + super8 + letterbox-43.
332. **Camcorder 2003** (Retro): Early digital video — jpeg + sharpen + interlace.
333. **Lomo** (Retro): Toy camera: punchy and vignetted — adjust + vignette + lightleak.
334. **Synthwave** (Neon): Pink and cyan glow with scanlines — grade + bloom + scanlines.
335. **Cyberpunk** (Neon): Neon city at night — grade + chromatic + bloom.
336. **Neon edges** (Neon): Glowing outlines with trails — neonglow + trails.
337. **Club strobe** (Neon): Flashes and shakes on kicks — strobe-kick + bloom + kickshake.
338. **Laser room** (Neon): Sparkling lasers — starburst + bloom + vignette.
339. **Blacklight** (Neon): UV paint glow — neonize + bloom.
340. **Acid** (Neon): Melting rainbow trip — huecycle + wavewarp + bloom.
341. **Hologram** (Neon): Iridescent projection — prism + scanlines + chromatic.
342. **Tron** (Neon): Blue light lines on black — outline + bloom.
343. **Miami vice** (Neon): Pink and teal heat — grade + bloom + lightleak.
344. **Ultraviolet** (Neon): Everything in UV — gradientmap + bloom.
345. **LED stadium** (Neon): A giant LED screen — ledwall + bloom.
346. **Rave tunnel** (Neon): Infinite colored tunnel — zoomfeedback + huecycle.
347. **Night drive** (Neon): City lights streaking by — anamorphic + grade + trails.
348. **Disco** (Neon): Glitter ball sparkle — hatsglitter + starburst + huecycle.
349. **Datamosh** (Glitch): Melting compression art — moshbloom + rgbsplit.
350. **Corrupted** (Glitch): A broken file — blockglitch + digitalnoise + rgbsplit.
351. **Signal lost** (Glitch): Breaking-up broadcast — tape + scantear + digitalnoise.
352. **Pixel sort** (Glitch): Streaked sorted pixels — pixelsort + chromaglitch.
353. **JPEG hell** (Glitch): Compressed to death — jpeg + bitcrush.
354. **RGB punch** (Glitch): Color split on every kick — rgbsplit + kickshake.
355. **Error screen** (Glitch): A screen about to crash — interlace + blockglitch + scanlines.
356. **Melt down** (Glitch): Frames dripping into each other — moshmelt + huecycle.
357. **Freeze frame** (Glitch): Blocks stuck in time — moshfreeze + rgbsplit.
358. **Broken LCD** (Glitch): Cracked display — channelmix + blockglitch + chromaglitch.
359. **Wave tear** (Glitch): Wobbly torn video — wobble + interlace.
360. **Glitch subtle** (Glitch): Small tasteful glitches — glitch-subtle + grain.
361. **Hyperpop** (Glitch): Loud and colorful — rgbsplit + bloom + huecycle.
362. **Slit scan** (Glitch): Time smeared sideways — slitscan + bloom.
363. **Digital rain** (Glitch): Falling green code — asciimatrix + bloom.
364. **Dreamy** (Dreamy): Soft and hazy — dreamglow + grade + grain.
365. **Cotton candy** (Dreamy): Pastel sugar — gradientmap + dreamglow.
366. **Underwater** (Dreamy): Rippling under the surface — wavewarp + grade + godrays.
367. **Heaven** (Dreamy): Bright, glowing, rays — bloom + godrays + adjust.
368. **Lo-fi** (Dreamy): Chill beats to study to — grade + grain + vignette.
369. **Echo dream** (Dreamy): Echoes fading into each other — echo + dreamglow.
370. **Snow globe** (Dreamy): Seen through frosty glass — frosted + bloom + vignette.
371. **Ghostly** (Dreamy): Faint onion-skin trails — ghost + grade + dreamglow.
372. **Watercolor** (Dreamy): Soft painted look — oilpaint + adjust + grain.
373. **Long exposure** (Dreamy): Light painting trails — trails-long + bloom.
374. **Mirage** (Dreamy): Shimmering hot air — heathaze + dreamglow.
375. **Kaleido dream** (Dreamy): Soft kaleidoscope — kaleido + dreamglow.
376. **Lucid** (Dreamy): Flowing like paint — liquid + huecycle.
377. **Aurora sky** (Dreamy): Northern lights green — bloom + grade + grain.
378. **Halo** (Dreamy): Glowing edges — halation + dreamglow.
379. **Pencil** (Art): Pencil drawing — sketch.
380. **Ink etching** (Art): Cross-hatched ink — crosshatch.
381. **Oil painting** (Art): Thick painted strokes — oilpaint + adjust.
382. **Cartoon** (Art): Flat cel shading with outlines — toon.
383. **Stained glass** (Art): Colored glass cells — crystal + adjust.
384. **Mosaic** (Art): Big hexagon tiles — hexpixel-big.
385. **Low poly** (Art): Triangle facets — trimosaic.
386. **Blueprint** (Art): Technical drawing — outline + scanlines.
387. **ASCII art** (Art): Characters — ascii.
388. **Terminal** (Art): Amber text screen — asciidense + scanlines + bloom.
389. **Topographic** (Art): Contour map lines — contours.
390. **Engraving** (Art): Banknote-style lines — stripes.
391. **Pop poster** (Art): Flat bold screen print — posterize-3 + adjust.
392. **Duotone pink** (Art): Two-color poster — duotone.
393. **Duotone blue** (Art): Cool two-color poster — duotone.
394. **Risograph** (Art): Grainy riso print — tritone + grain.
395. **Emboss** (Art): Stamped metal relief — emboss.
396. **Mandala** (Art): Kaleidoscopic rings — mandala.
397. **Little planet** (Art): The picture wrapped into a planet — polar-to.
398. **Mirror world** (Art): Four-way symmetry — mirror-quad + bloom.
399. **Clean B&W** (Mono): Simple black and white — adjust.
400. **High contrast** (Mono): Crushed blacks and whites — levels + adjust.
401. **1-bit** (Mono): Black and white dots — dither-1bit.
402. **Silver** (Mono): Glowing silver — adjust + bloom + grain.
403. **Red only** (Mono): Black and white except red — selectivecolor.
404. **Gold only** (Mono): Black and white except gold — selectivecolor.
405. **Night vision** (Mono): Green night goggles — nightvision.
406. **Thermal** (Mono): Heat camera — thermal.
407. **Infrared** (Mono): Pink false-color foliage — infrared.
408. **X-ray** (Mono): Inverted blue negative — invert + adjust + colorize.
409. **Kick punch** (Beat): Everything punches on kicks — basszoom + kickshake + bloom.
410. **Snare flash** (Beat): White flash and split on snares — snareflash + rgbsplit.
411. **Drop boom** (Beat): Huge impact on the drop — dropboom + bloom.
412. **Strobe club** (Beat): Half-beat strobes — strobe + bloom.
413. **Blackout** (Beat): Blackouts on the beat — strobe-blackout.
414. **Heartbeat** (Beat): Red pulse on every kick — pulsevignette + basszoom.
415. **Shatter** (Beat): The frame shatters on hits — beatsplit + rgbsplit.
416. **Bass wobble** (Beat): The bass bends the picture — fisheye + wavewarp.
417. **Hi-hat sparkle** (Beat): Sparkles on every hat — hatsglitter + bloom.
418. **Ripple kick** (Beat): Kicks send ripples — ripple + bloom.
419. **Invert hits** (Beat): Negative flash on snares — beatinvert.
420. **Beat sweep** (Beat): A shine sweeps every beat — shine + bloom.
421. **Echo pump** (Beat): Echoes pump with the kick — echo + bloom.
422. **Pulse grid** (Beat): The grid multiplies on kicks — tile + rgbsplit.
423. **Bass zoom blur** (Beat): Zoom blur with the bass — zoomblur.
424. **Story clean** (Social): Punchy and clean for stories — adjust + sharpen.
425. **Reel glow** (Social): Glowy and vibrant — bloom + grade + vignette.
426. **Framed post** (Social): Clean white frame — border + grade.
427. **Neon frame** (Social): Rainbow glowing frame — border + bloom.
428. **Viewfinder** (Social): Recording camera overlay — scanframe + grain + vignette.
429. **Square crop** (Social): A 1:1 square inside any frame — letterbox-square.
430. **Album cover** (Social): Print-ready warm grade — grade + grain + vignette.
431. **Lyric video** (Social): Blurred dark background for text — blur + adjust + vignette.

## Palettes (104)

432. **Forgeheart** (Forgeheart): #ffd75e #ff8c42 #bd8bff #ff6a6a #48ddff
433. **Forge ember** (Forgeheart): #1a0b05 #5c1a0b #c2410c #ff8c42 #ffd75e
434. **Anvil night** (Forgeheart): #0b0d12 #1f2430 #3a4050 #ffd75e #ff6a2a
435. **Rune violet** (Forgeheart): #0d0614 #2b1255 #6b2fd6 #bd8bff #f3e8ff
436. **Molten core** (Forgeheart): #2b0000 #7a0a00 #ff3c00 #ffa600 #fff1b8
437. **Spark & steel** (Forgeheart): #101418 #3b4652 #9aa5b1 #ffd75e #ff8c42
438. **Hearth glow** (Forgeheart): #1b0f0a #4a2412 #b5541f #f2a65a #ffe3b3
439. **Arcane forge** (Forgeheart): #0a0a1f #3d1d7a #7c5cff #ff6a6a #ffd75e
440. **Quench blue** (Forgeheart): #05101a #0e3a5a #48ddff #ffd75e #ffffff
441. **Slag & gold** (Forgeheart): #16130f #3a332b #7a6a52 #c9a227 #ffd75e
442. **Synthwave** (Neon): #120024 #2d0b59 #ff2bd6 #2bd9ff #ffd75e
443. **Cyberpunk** (Neon): #0b0221 #3b0d63 #f107a3 #00f0ff #fcee0a
444. **Miami** (Neon): #0b1e3f #ff2a6d #d1f7ff #05d9e8 #ff9a3c
445. **Tokyo night** (Neon): #1a1b26 #7aa2f7 #bb9af7 #f7768e #e0af68
446. **Acid rave** (Neon): #000000 #39ff14 #ff00ff #00ffff #ffff00
447. **Laser show** (Neon): #05010a #00ff9c #ff2bd6 #2b6bff #ffffff
448. **Vaporwave** (Neon): #ff71ce #01cdfe #05ffa1 #b967ff #fffb96
449. **Blacklight** (Neon): #0d001a #3c00ff #a100ff #ff00c8 #00ffd5
450. **Club red** (Neon): #0a0000 #3d0000 #ff0033 #ff6a6a #ffffff
451. **Ultraviolet** (Neon): #0c0032 #190061 #240090 #3500d3 #ff2bd6
452. **Hologram** (Neon): #a0f0ff #c3a6ff #ffb3f0 #fff3b0 #ffffff
453. **Glitch RGB** (Neon): #000000 #ff0000 #00ff00 #0000ff #ffffff
454. **Sunset** (Warm): #2b1055 #7f2c7f #d8436e #f68a5b #ffd27a
455. **Golden hour** (Warm): #3d2c1e #8a5a2b #d99a4e #f4c27a #fff0c9
456. **Desert** (Warm): #3b2414 #8c5a2e #d9a066 #f2d0a4 #fff4e0
457. **Peach** (Warm): #ffb4a2 #ffcdb2 #e5989b #b5838d #6d6875
458. **Autumn** (Warm): #582f0e #7f4f24 #936639 #a68a64 #b6ad90
459. **Paprika** (Warm): #2d0c0c #8c1c13 #bf4342 #e7d7c1 #a78a7f
460. **Lava** (Warm): #0d0000 #5a0001 #b80c09 #ff5e00 #ffb100
461. **Terracotta** (Warm): #6b2d1a #a44a3f #d1785c #e8b298 #f5e3d3
462. **Firelight** (Warm): #03071e #370617 #9d0208 #e85d04 #ffba08
463. **Honey** (Warm): #432818 #99582a #bb9457 #ffe6a7 #fff4d6
464. **Ocean** (Cool): #03045e #0077b6 #00b4d8 #90e0ef #caf0f8
465. **Arctic** (Cool): #0b132b #1c2541 #3a506b #5bc0be #e0fbfc
466. **Deep sea** (Cool): #001219 #005f73 #0a9396 #94d2bd #e9d8a6
467. **Glacier** (Cool): #e8f1f2 #b3d4e0 #6fa8c7 #2f6690 #0f2d4a
468. **Midnight** (Cool): #020202 #0d1b2a #1b263b #415a77 #778da9
469. **Teal & orange** (Cool): #00303d #006d77 #83c5be #ffddd2 #e29578
470. **Moonlight** (Cool): #0a0f1e #1c2a4a #4a6fa5 #a9c4eb #eef4ff
471. **Lagoon** (Cool): #073b4c #118ab2 #06d6a0 #ffd166 #ef476f
472. **Ice cave** (Cool): #00111c #001a2c #003554 #00a6fb #ade8f4
473. **Storm** (Cool): #22223b #4a4e69 #9a8c98 #c9ada7 #f2e9e4
474. **Cotton candy** (Pastel): #ffc8dd #ffafcc #bde0fe #a2d2ff #cdb4db
475. **Lavender haze** (Pastel): #e0c3fc #c8b6ff #b8c0ff #bbd0ff #d6e4ff
476. **Mint cream** (Pastel): #d8f3dc #b7e4c7 #95d5b2 #74c69d #52b788
477. **Sorbet** (Pastel): #fec5bb #fcd5ce #fae1dd #f8edeb #e8e8e4
478. **Dreamy** (Pastel): #f9c6c9 #f5e6e8 #d5c6e0 #aaa1c8 #967aa1
479. **Lilac** (Pastel): #f1e3f3 #c2bbf0 #8fb8ed #62bfed #3590f3
480. **Seafoam** (Pastel): #e8fcf6 #b8f2e6 #aed9e0 #5e6472 #ffa69e
481. **Blush** (Pastel): #fff1e6 #fde2e4 #fad2e1 #e2ece9 #bee1e6
482. **Rose gold** (Pastel): #3d2b2b #b76e79 #e0a899 #f2d0c4 #fff1ec
483. **Pastel rainbow** (Pastel): #ffadad #ffd6a5 #fdffb6 #caffbf #9bf6ff
484. **Forest** (Nature): #081c15 #1b4332 #2d6a4f #52b788 #b7e4c7
485. **Moss** (Nature): #283618 #606c38 #dda15e #bc6c25 #fefae0
486. **Aurora** (Nature): #020611 #0b3d3a #3dffb5 #9b5cff #f3fff9
487. **Jungle** (Nature): #004b23 #006400 #38b000 #70e000 #ccff33
488. **Earth** (Nature): #3e2723 #6d4c41 #a1887f #d7ccc8 #efebe9
489. **Cherry blossom** (Nature): #2b2d42 #8d99ae #edf2f4 #ffb7c5 #ef233c
490. **Lagoon sunset** (Nature): #264653 #2a9d8f #e9c46a #f4a261 #e76f51
491. **Wildflower** (Nature): #5f0f40 #9a031e #fb8b24 #e36414 #0f4c5c
492. **Savanna** (Nature): #3d2b1f #8a6f45 #c9a66b #e6d3a3 #f7efd8
493. **Coral reef** (Nature): #05668d #028090 #00a896 #02c39a #f0f3bd
494. **70s** (Retro): #3d1c02 #8c3b0f #d97d0d #f2b705 #f2e6c9
495. **80s arcade** (Retro): #000000 #ff004d #ffec27 #00e436 #29adff
496. **Game Boy** (Retro): #0f380f #306230 #8bac0f #9bbc0f #e0f8d0
497. **Polaroid** (Retro): #f4ecd8 #e3c9a8 #c49a6c #8b5e3c #3e2f22
498. **Kodachrome** (Retro): #1d2a3a #2e5e8c #d9b44a #c2402b #f2e8cf
499. **VHS** (Retro): #1a1a2e #16213e #0f3460 #e94560 #f5f5f5
500. **Diner** (Retro): #ef476f #ffd166 #06d6a0 #118ab2 #073b4c
501. **Pop art** (Retro): #ff006e #ffbe0b #3a86ff #8338ec #fb5607
502. **Bauhaus** (Retro): #1d1d1b #e63946 #f1c40f #1d3557 #f1faee
503. **Mid-century** (Retro): #264653 #e9c46a #f4a261 #e76f51 #2a9d8f
504. **Sepia** (Retro): #2b1d0e #5c4033 #8e6e53 #c2a383 #eee0cb
505. **Super 8** (Retro): #2a1a12 #6b4226 #c08552 #e8c39e #fff1d6
506. **Noir** (Mono): #000000 #1a1a1a #4d4d4d #b3b3b3 #ffffff
507. **Paper** (Mono): #f5f0e6 #e0d8c8 #a69f91 #5c574f #1f1d1a
508. **Graphite** (Mono): #0b0c0e #1e2126 #3a3f47 #7d8590 #e6e8eb
509. **Ink & gold** (Mono): #0a0a0a #1c1c1c #3d3d3d #c9a227 #f5e6b8
510. **Blueprint** (Mono): #0a2342 #2a4d7a #6f93c4 #c5d9f2 #ffffff
511. **Red accent** (Mono): #0f0f0f #2e2e2e #8a8a8a #f0f0f0 #e63946
512. **Cream** (Mono): #fffdf7 #f5efe0 #e6dcc4 #c9bc9f #8a7e66
513. **Slate** (Mono): #0f172a #1e293b #334155 #64748b #cbd5e1
514. **Matrix** (Mono): #000000 #003b00 #008f11 #00ff41 #d0ffd8
515. **Amber terminal** (Mono): #0d0700 #3d2600 #b36b00 #ffb000 #ffe0a0
516. **Techno** (Genre): #050505 #1a1a1a #ff0040 #00e5ff #ffffff
517. **House** (Genre): #1b1035 #5b2a86 #f15bb5 #fee440 #00bbf9
518. **Trap** (Genre): #0b0b0b #3d0066 #9d00ff #ff007a #ffd000
519. **Drum & bass** (Genre): #00090f #003049 #00b4d8 #ff5400 #ffbd00
520. **Lo-fi** (Genre): #2d2a32 #6c5b7b #c06c84 #f67280 #f8b195
521. **Ambient** (Genre): #0b1d26 #1f4e5f #79a3b1 #d0e1e6 #fcf8ec
522. **Rock** (Genre): #0d0d0d #3b0b0b #8b0000 #d9a441 #f2f2f2
523. **Metal** (Genre): #000000 #202020 #595959 #b30000 #e6e6e6
524. **Hip-hop gold** (Genre): #0b0b0b #262626 #b8860b #ffd700 #ffffff
525. **Pop** (Genre): #ff4d6d #ff8fa3 #ffd6e0 #7bdff2 #b2f7ef
526. **Jazz** (Genre): #1b1b2f #162447 #1f4068 #e43f5a #f5d6ba
527. **Reggae** (Genre): #0b0b0b #1e7b1e #f2c500 #d62828 #f5f5f5
528. **K-pop** (Genre): #ff99c8 #fcf6bd #d0f4de #a9def9 #e4c1f9
529. **Phonk** (Genre): #0a0005 #2b0016 #8c0037 #ff2e63 #f9ed69
530. **Hyperpop** (Genre): #ff00e5 #00fff7 #fff500 #7a00ff #ffffff
531. **Classical** (Genre): #1c1814 #4a3f35 #8c7a5b #d4c39f #f7f1e3
532. **Synth pop** (Genre): #0d0221 #261447 #2de2e6 #f6019d #ff6c11
533. **Dubstep** (Genre): #000000 #1a0033 #6600ff #00ff99 #ccff00
534. **Afrobeat** (Genre): #2b2118 #c75000 #f2a900 #008753 #f5ead6
535. **Country** (Genre): #3b2a1a #7a5230 #b88b4a #e3c58e #f6efe2

## Trigger presets (62 new: genres and ◆ behaviors)

536. **Techno · peak time**
537. **Minimal techno**
538. **Hard techno**
539. **Deep house**
540. **Tech house**
541. **Disco / nu-disco**
542. **Trance**
543. **Psytrance**
544. **Trap**
545. **Boom bap**
546. **Drill**
547. **Phonk**
548. **Dubstep**
549. **Riddim**
550. **Liquid DnB**
551. **Neurofunk**
552. **Jungle / breaks**
553. **Breakbeat**
554. **UK garage**
555. **Future bass**
556. **EDM / big room**
557. **Hardstyle**
558. **Lo-fi hip-hop**
559. **Chillwave**
560. **Synthwave**
561. **Pop**
562. **K-pop**
563. **R&B**
564. **Reggaeton**
565. **Afrobeats**
566. **Funk**
567. **Indie rock**
568. **Metal**
569. **Punk**
570. **Jazz**
571. **Classical / orchestral**
572. **Cinematic / trailer**
573. **Acoustic / folk**
574. **Reggae / dub**
575. **Latin / salsa**
576. **Hyperpop**
577. **Garage rock**
578. **◆ Kick only**
579. **◆ Kick + snare**
580. **◆ Everything on**
581. **◆ Busy (more hits)**
582. **◆ Calm (fewer hits)**
583. **◆ Only the big hits**
584. **◆ Snappy (short flashes)**
585. **◆ Smooth (long tails)**
586. **◆ Sub-bass drops**
587. **◆ Hi-hat rolls**
588. **◆ Vocals as hits**
589. **◆ Claps & snaps**
590. **◆ Cymbal crashes**
591. **◆ Synth stabs**
592. **◆ Guitar chugs**
593. **◆ Live mic (noisy room)**
594. **◆ Laptop speakers (no bass)**
595. **◆ Half-time feel**
596. **◆ Double-time feel**
597. **◆ Bass as kick**

## Keyframes and animation

598. Ease **Ease in**: Starts slow, ends fast (cubic) (`/ease ease in`; the director can use it as `in`).
599. Ease **Ease out**: Starts fast, settles slowly (cubic) (`/ease ease out`; the director can use it as `out`).
600. Ease **Ease in-out**: Slow, fast, slow (cubic) (`/ease ease in-out`; the director can use it as `inOut`).
601. Ease **Gentle in**: A softer ease in (`/ease gentle in`; the director can use it as `quadIn`).
602. Ease **Gentle out**: A softer ease out (`/ease gentle out`; the director can use it as `quadOut`).
603. Ease **Strong in**: A heavy ease in (`/ease strong in`; the director can use it as `quartIn`).
604. Ease **Strong out**: A heavy ease out (`/ease strong out`; the director can use it as `quartOut`).
605. Ease **Strong in-out**: Snappy middle (`/ease strong in-out`; the director can use it as `quartInOut`).
606. Ease **Expo in**: Almost still, then shoots off (`/ease expo in`; the director can use it as `expoIn`).
607. Ease **Expo out**: Snaps in, then glides (great for punches) (`/ease expo out`; the director can use it as `expoOut`).
608. Ease **Expo in-out**: Very snappy middle (`/ease expo in-out`; the director can use it as `expoInOut`).
609. Ease **Sine in**: Gentle start (`/ease sine in`; the director can use it as `sineIn`).
610. Ease **Sine out**: Gentle stop (`/ease sine out`; the director can use it as `sineOut`).
611. Ease **Sine in-out**: Like a pendulum (`/ease sine in-out`; the director can use it as `sineInOut`).
612. Ease **Circular in**: Accelerates hard at the end (`/ease circular in`; the director can use it as `circIn`).
613. Ease **Circular out**: Fast start, long tail (`/ease circular out`; the director can use it as `circOut`).
614. Ease **Anticipate**: Pulls back first, then goes (`/ease anticipate`; the director can use it as `backIn`).
615. Ease **Overshoot**: Goes a bit too far, then settles (`/ease overshoot`; the director can use it as `backOut`).
616. Ease **Anticipate + overshoot**: Both ends (`/ease anticipate + overshoot`; the director can use it as `backInOut`).
617. Ease **Elastic**: Springs past the value and wobbles back (`/ease elastic`; the director can use it as `elastic`).
618. Ease **Elastic in**: Wind-up wobble before moving (`/ease elastic in`; the director can use it as `elasticIn`).
619. Ease **Bounce**: Lands and bounces (`/ease bounce`; the director can use it as `bounce`).
620. Ease **Bounce in**: Bounces before taking off (`/ease bounce in`; the director can use it as `bounceIn`).
621. Ease **Smoother**: An extra smooth in-out (`/ease smoother`; the director can use it as `smoother`).
622. Ease **4 steps**: Jumps in 4 steps (`/ease 4 steps`; the director can use it as `steps4`).
623. Ease **8 steps**: Jumps in 8 steps (`/ease 8 steps`; the director can use it as `steps8`).
624. Ease **Wobble**: Shakes and settles on the value (`/ease wobble`; the director can use it as `wobble`).
625. Ease **Pulse**: Goes to the value and comes back (`/ease pulse`; the director can use it as `pulse`).

## Blending

626. Blend mode **Hard light** in the layer Blend menu (and in recordings / screenshots).
627. Blend mode **Color burn** in the layer Blend menu (and in recordings / screenshots).
628. Blend mode **Hue** in the layer Blend menu (and in recordings / screenshots).
629. Blend mode **Saturation** in the layer Blend menu (and in recordings / screenshots).
630. Blend mode **Color** in the layer Blend menu (and in recordings / screenshots).
631. Blend mode **Luminosity** in the layer Blend menu (and in recordings / screenshots).
632. Blend preset **Glow** (add, 100%): Adds light: black disappears, bright parts glow.
633. Blend preset **Soft glow** (add, 60%): A gentler additive glow.
634. Blend preset **Screen** (screen, 100%): Brightens without blowing out (light leaks, smoke).
635. Blend preset **Light veil** (screen, 50%): A thin bright veil.
636. Blend preset **Overlay punch** (overlay, 100%): Contrasty mix: textures, grain, gradients.
637. Blend preset **Soft overlay** (soft-light, 80%): Subtle tint and contrast.
638. Blend preset **Hard light** (hard-light, 100%): Strong colored light.
639. Blend preset **Multiply shadows** (multiply, 100%): Darkens: white disappears (paper, shadows, ink).
640. Blend preset **Ink** (multiply, 70%): A lighter multiply.
641. Blend preset **Darken** (darken, 100%): Keeps the darker of the two.
642. Blend preset **Lighten** (lighten, 100%): Keeps the lighter of the two.
643. Blend preset **Difference flip** (difference, 100%): Psychedelic inverted overlaps.
644. Blend preset **Exclusion** (exclusion, 100%): Softer, pastel difference.
645. Blend preset **Color dodge** (color-dodge, 100%): Burning bright highlights.
646. Blend preset **Color burn** (color-burn, 100%): Deep saturated darks.
647. Blend preset **Hue only** (hue, 100%): Takes only this layer's hue.
648. Blend preset **Saturation only** (saturation, 100%): Takes only this layer's saturation.
649. Blend preset **Color only** (color, 100%): Colors the layers below (keeps their brightness).
650. Blend preset **Luminosity only** (luminosity, 100%): Takes only this layer's brightness.
651. Blend preset **Ghost** (normal, 35%): Normal, mostly see-through.
652. Blend preset **Half** (normal, 50%): Normal at 50%.
653. Blend preset **Solid** (normal, 100%): Back to normal, fully opaque.

**Total: 653 upgrades.**
