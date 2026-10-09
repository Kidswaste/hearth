# Editor: the timeline becomes a whole video editor (round 7)

You asked: "edit the timeline of a footage and stop frame by frame on an edit even if it's not a song… the timeline
becomes a whole video editor that chat knows about and can use." Video Review's clip track (E or ✂) grew into that
editor instead of a second one: any footage, with or without sound, frame-exact, multi-track, with titles,
transitions, keyframes, looks and effects, rendered by ffmpeg (or recorded in real time when ffmpeg isn't there).
The screen gains two small things only (＋ and a format chip); everything else lives in right-click menus with
submenus, the inspector that opens on a clip, Alt-revealed switches, keys (all listed by the keys button) and
chat commands (`/help editor`, area Video). Claude and Astra read and change the same edit through three lean
MCP tools. Made for your Hearth intro: start from **⋯ › Template › Hearth intro 20 s**.

## Frame-exact, any footage, no song needed
1. **Frames are exact everywhere**: a program frame n covers n/fps … (n+1)/fps; every seek lands in the middle of its frame, so the picture is always the frame the counter says (checked against frame numbers burned into test clips, at 24, 25 and 30 fps).
2. **The true frame rate**: ffprobe's when it's installed (read for every source the edit uses), else measured from requestVideoFrameCallback while playing; a sequence can set its own.
3. **Every seek is verified**: after a seek the decoder's presented frame is read back with requestVideoFrameCallback (the frame check reports what each layer really shows).
4. **Timecode HH:MM:SS:FF + frame number** in the transport while editing (T or a click switches to seconds / frames).
5. **← / →** one frame, **Shift** ten frames, exactly (no song needed).
6. **Type a time or timecode** in the time box (`00:00:04:12`, `f120`, `+10f`, `1:02.5`): it lands on that frame; the keys keep working after Enter.
7. **J / K / L shuttle** in the edit; **K and Space stop on a whole frame** (the decoder goes to the frame the counter shows).
8. **Scrubbing snaps to frames** (and to cuts, markers, beats when snapping is on).
9. **Silent clips just work**: stepping, playback, export (silence fills in); , / . beat jumps simply do nothing without music.
10. **Frame check** (⋯ › Tools › Frame-check the playhead, `/frame-check`): program frame, timecode, fps and the exact source frame each layer shows.
11. **`/goto-frame <n|timecode>`** goes to an exact frame and reports what's on screen.
12. **`/frame-step <n>`** steps N frames exactly.
13. **Things added at the playhead start on its frame** (no half-frame offsets in renders).
14. **Pause lands on a whole frame in rich edits too** (the compositor renders that exact frame).

## The editor on screen (progressive)
15. **＋ Add** (one button): a video or picture file, a library video (end / insert / overwrite / overlay), Lab recordings, a title by style, a lower third, music, a color matte, a freeze frame, a marker, an empty track.
16. **Format chip** (`9:16 · 30 fps`): the program's shape and frame rate, safe zones; the frame on screen takes that shape.
17. **Lanes**: text tracks on top, overlay video tracks (V2, V3…), the main track V1, audio tracks (A1…) under it; the box grows with its lanes.
18. **Lane labels** V1 / V2 / T1 / A1 with their state (hidden ⊘, muted 🔇, locked 🔒).
19. **Hold Alt**: each lane shows its switches (👁 hide · 🔇 mute · 🔒 lock), click to flip them.
20. **Right-click a lane label**: hide / mute / lock, rename, add here, add a track, delete the track.
21. **Zoom the timeline**: Ctrl/⌘+wheel at the pointer, + / −, \ fits; the wheel scrolls when zoomed; a thin bar shows where you are.
22. **Frame-level ruler**: when zoomed in far the ruler counts frames (f120…).
23. **The playhead pages** when it reaches the edge of a zoomed view.
24. **Transitions show as a bow-tie** over the overlap with their name; click selects, double-click opens the inspector.
25. **Keyframes show as diamonds** on the selected clip (a color per property).
26. **Clip tags on the track**: name, speed, ◀ reversed, 🔇, ◐ look.
27. **Overlay items draw their filmstrip** (stills their picture), titles their words and animation, music its waveform.
28. **Label colors and names** show on clips; a clip turned off shows dimmed.
29. **Template slots** show as "＋ slot n" gaps.
30. **Selection summary** in the header: clips, layers, length, in–out, what's selected, razor, zoom.
31. **The edit list** (⋯ › More › Copy the edit list) now includes tracks, layers, transitions, looks, effects and keyframes.

## Editing (the NLE moves)
32. **Hold the first or last frame** of a clip for N seconds (right-click a clip › Hold the first / last frame, `/hold-frame [first|last] [s] [clip]`): a freeze right before or after it, frame-exact.
33. **Split everything at the playhead: Shift+S** (`/split-all`): the main track and every unlocked track.
34. **Razor: B** (`/razor`): click any clip or layer to cut it where you click (a red line follows the pointer; Esc ends).
35. **Roll: Shift+drag a cut** — one side longer, the other shorter, total unchanged (`/roll <frames>`).
36. **Slip: Ctrl/⌘+drag a clip** — same place and length, a different part of the source; the picture follows (`/slip <frames>`, Alt+, / .).
37. **Slide: Shift+drag a clip** — it keeps its content, its neighbours trim (`/slide <frames>`, Alt+← / →).
38. **Insert** a library video at the playhead (everything after moves right): ＋ › From the library, `/insert-clip`.
39. **Overwrite** at the playhead (nothing moves): ＋ › From the library, `/overwrite-clip`.
40. **Lift** the in–out range (a gap stays): ⋯ › Range, `/lift`.
41. **Extract** the in–out range (closes up): ⋯ › Range, `/extract`.
42. **Extend edit: Shift+E** (`/extend-edit`): the nearest cut rolls to the playhead.
43. **Nudge the selection one frame: Alt+← / →** (Shift: 10): layers move, main-track clips slide.
44. **Move a layer to the track above / below: Alt+↑ / ↓** (or drag it there).
45. **Drag layers** along their lane (snapping to cuts, other layers, markers, the playhead) and **drag their edges** to trim.
46. **Snapping on / off: N** (`/snap`); off, everything still lands on frames.
47. **Copy / paste clips and layers: Ctrl/⌘+C / V** (`/copy-clips`, `/paste-clips`); without a selection Ctrl/⌘+C still copies the frame.
48. **Select everything: Ctrl/⌘+A**; Shift+click adds to the selection; `/select 3 V2.1 all none`.
49. **Delete layers with Del** (main-track clips keep Del = gap, Shift+Del = ripple).
50. **Q / W trim layers too** (the selected layer's start / end to the playhead).
51. **Swap with the next clip** (right-click › Clip, `/swap-next`).
52. **Shuffle the clips** for a montage idea (⋯, `/shuffle-clips`; undo puts them back).
53. **Fit to fill**: a gap and the clip after it — the clip changes speed to cover both (right-click the gap › Clip, `/fit-to-fill`).
54. **Make a clip last N seconds** (`/clip-duration 1.5`): videos change speed, stills / titles change length.
55. **Move a main-track clip up to an overlay track** (right-click › Edit, `/to-overlay`) and **an overlay down to the main track** (`/to-main`).
56. **Nest (compound clip)**: select clips next to each other › right-click › Edit › Nest — ffmpeg renders them into one clip that keeps its parts; **Un-nest** gets them back (`/nest`, `/unnest`).
57. **Match frame** (right-click › Clip, `/match-frame`): the source of the picture under the playhead opens in Review on the same frame.
58. **Clip label colors** (8, right-click › Clip › Label color, `/clip-label`).
59. **Rename a clip** (right-click › Clip, `/clip-rename`).
60. **Turn a clip off** (hidden and silent, kept in place; right-click › Clip, `/clip-off`).
61. **In–out = the selection** (right-click › Clip, `/range-selection`): render or loop just those clips.
62. **Every change is one undo step** (⌘/Ctrl+Z, Shift+⌘/Ctrl+Z), sliders included (one step when you let go).
63. **After a menu pick the keys keep working** (the focus goes back to the editor).

## Layers and tracks
64. **Lane height** compact / normal / tall (⋯ › Tools › Lane height, `/lane-height`), remembered.
65. **Restyle a whole text track** (right-click its label › Every title on it: style / animation, `/track-style T1 <style> [anim]`): captions restyled in one go.
66. **Shift a whole track by frames** (right-click its label › Shift it, `/track-shift A1 -3`) to sync music or captions.
67. **Solo a clip's sound** (⋯ › Tools, `/solo-sound [clip]`): the others mute; again brings every sound back (only the ones it muted).
68. **Every sound at −14 LUFS** (⋯ › Tools, `/normalize-all`) in the render, the social loudness.
69. **Center the view on the playhead** when zoomed (⋯ › Tools › Center on the playhead).
70. **Overlay video tracks** (V2, V3…): picture in picture, split screens, logos, B-roll over A-roll; a layer goes on the first free track, or a new one.
71. **Text tracks** for titles, lower thirds and captions.
72. **Audio tracks** for music and sound (mixed under everything, each with its volume, fades and sound effects).
73. **Add a track** of each kind (right-click a lane, ＋ › Empty track, `/track-add video|text|audio`).
74. **Hide, mute, lock, rename, delete a track** (right-click its label, Alt switches, `/track V2 hide|mute|lock|rename|delete`).
75. **Stills as clips or layers**: PNG / JPEG / WebP / GIF on the main track or above (`/add-image <file> [s] [main]`).
76. **Color mattes** on the main track (black, white, gold, ember, violet, night blue…) or as see-through color layers (`/add-color`).
77. **Lab recordings as clips**: ＋ › Lab recordings lists them; library cards and Lab files drop in like any video.
78. **Drop files on the editor**: videos on the main lane join the edit; on a track lane they land on that track where you dropped; pictures and sounds land on tracks; a video dropped on a template slot fills it.
79. **Overlays default to the full frame**; `/clip-scale`, `/clip-position`, motion presets or the inspector make them a PIP.
80. **Fill the frame** (cover, cropping the edges) instead of fitting (right-click › Clip, `/clip-fill`) — for 16:9 footage in a 9:16 edit.
81. **Reset transform** (right-click › Clip, `/reset-transform`).
82. **Music from the start** with a volume (`/add-music <file> [at] [60%]`), its waveform on the lane.

## Keyframes
83. **Keyframes on opacity, position x / y, scale, rotation and volume** for clips and layers.
84. **◆ in the inspector**: a key at the playhead (click again removes it); ‹ › jump to the previous / next key.
85. **Auto-key**: once a property has keys, changing it at another time adds a key (like After Effects).
86. **A curve per key** (57 easing curves, below): the inspector's Curve, `/ease`.
87. **Alt+K** keys position, scale, rotation and opacity at once.
88. **Shift+↑ / ↓** jumps between the selection's keyframes.
89. **`/keyframe <prop> [value] [curve]`**, **`/keyframes`** (list), **`/keyframes-clear [prop]`**.
90. **Copy / paste keyframes** between clips (right-click › Clip, `/copy-keyframes`, `/paste-keyframes`).
91. **Keyframes survive splits** (each half keeps the curve where it was).
92. **Rendered exactly**: the eased curve is sampled into ffmpeg expressions (scale, rotation, position, opacity, volume).

## Titles and captions
93. **Shapes and motion graphics** (＋ › Shape or graphic, `/add-shape <shape> [s] [anim] [#color]`, `video_edit {op:"add", kind:"shape"}`): arrows, boxes, rings, stars, frames, callouts, gradients, light, progress bars, rays, equalizers — 70 of them, listed below.
94. **Shapes take every title animation** (pop, wipe, blur, spin…): lines and arrows draw themselves on with the reveal animations.
95. **Shapes move by themselves where it makes sense**: progress bars and rings fill over the item's length, countdown rings empty, scan lines sweep, rays turn, loading dots and equalizer bars bounce, pulse rings ripple, an orbit dot circles.
96. **Frame-wide graphics** (gradients, caption fades top / bottom, scrim, vignette, glows, letterbox bars, borders, a thirds grid) cover the whole frame of any format.
97. **Right-click a shape › Shape / Shape color** swaps it or recolors it (white, gold, ember, violet, cyan, pink, black, or back to the preset's color).
98. **Shapes render exactly like the preview**: they are drawn by the same title renderer into the PNG frames ffmpeg lays over the edit.
99. **Shapes show in the timeline as ◆ name** and in `video_edit_read` as `shape <id>` with color and animations.
100. **Titles over the picture** on a text track (＋ › Title, Alt+T, `/add-title <text> [style] [anim] [s]`), with in and out animations.
101. **Lower thirds** (name · role) with accents and their own animations (＋ › Lower third, `/lower-third`).
102. **The inspector edits titles**: the words (multi-line), style or lower third, In / Out animation, animation length, size, color, place (top, upper, center, lower, bottom, left, right).
103. **Titles render as PNG frames drawn by the preview's code**, so the export matches what you saw; the frames are cleaned up afterwards.
104. **Long titles shrink to fit** 90 % of the frame width.
105. **Count-up numbers**, typing cursor, scramble, highlight bar, underline, box reveal, RGB glitch and mask animations are real per-letter / per-word / per-line effects.
106. **Captions from an SRT / VTT file** (⋯ › Captions, `/captions-import <file> [style]`): one title per caption on a "Captions" track.
107. **Save the titles as SRT** (⋯ › Captions, `/captions-export`) for the platforms' own captions.
108. **Safe-zone check** (⋯ › Check titles against the safe zone, `/safe-check [zone]`): which titles reach into TikTok / Reels / Shorts buttons and captions; the first one opens in the inspector.
109. **Main-track title cards keep working** (Shift+T) and can take styles and animations too.

## Transitions, looks, effects, sound
110. **Transitions overlap the cut like a real NLE** (the edit gets shorter by their length, like ffmpeg's xfade), shown as a bow-tie.
111. **91 transitions** (list below), each with a canvas preview and an ffmpeg render; custom ones (zoom, whip, spin, glitch, RGB split, dips to any color, light leaks, shapes) are ffmpeg expressions.
112. **Transition length** (right-click a bow-tie › Length, the inspector's slider, `/transition <id> <s>`).
113. **One transition on every cut** (⋯ › Transitions on every cut, `/transition <id> <s> all`), and remove them all.
114. **Shift+D**: a cross dissolve on the nearest cut (again: removes it).
115. **Looks**: 155 color grades with a strength, plus 17 adjustments and a color wash, all on clips and layers.
116. **Match a reference picture's look** (right-click › Look › Match a picture's look…, `/match-look <picture>`): exposure, contrast, saturation, warmth and tint move toward the picture, measured on the frame at the playhead — the reference gives the vibe, it never enters the edit.
117. **Copy / paste a look** between clips (right-click › Look).
118. **Clip effects** (32, stackable, each with an amount): mirror, symmetry, letterbox, borders, rounded corners, blur, glow, bloom, pixelate, posterize, ink, solarize, edges, emboss, RGB shift, scanlines, static, VHS, CRT, old film, hue cycle, strobe, pulse…
119. **Sound effects** (18): voice boost, bass, lo-fi, radio, telephone, echo, hall, pitch up / down, social loudness (−14 LUFS), compressor, wide, mono, duck… heard in the render.
120. **Blend modes** for layers (13): screen, add, multiply, overlay, soft light, difference…
121. **Reverse a clip**: R, right-click › Speed › Reverse, `/reverse` (played by stepping frames in the preview, rendered with ffmpeg reverse / areverse).
122. **Speed ramps** (14, below): the clip becomes steps at those speeds (`/speed-ramp`).
123. **Speed for layers and music too** (0.25–4×, pitch kept).
124. **Volume per clip / layer** (0–200 %, right-click › Volume, `/clip-volume`) and keyframable.
125. **Opacity, scale, rotation, position** from menus (right-click › Opacity), the inspector or `/clip-opacity`, `/clip-scale`, `/clip-rotate`, `/clip-position`.

## The inspector (double-click a clip, Enter, or right-click › Inspector)
126. **Opens over the notes column** on the selected clip, closes with Esc / ✕ or when the selection goes; the keys go back to the editor.
127. **Header**: name, track and place (V1 · clip 3, V2.1…), start → end timecodes, length in seconds and frames.
128. **Title section**: words, style / lower third, In, Out, anim length, size, color, place.
129. **Transform section**: opacity, scale, position X / Y, rotation sliders with ◆ keys and ‹ › key jumps, the curve, motion presets, "remove every keyframe".
130. **Clip section**: speed, reverse, speed ramp, volume with ◆, sound effects, mute, fade in / out, blend (layers), length (stills, colors), color (mattes).
131. **Color section**: look + strength, Adjust (16 sliders + color wash), reset.
132. **Effects section**: each effect with its amount and ✕, add one from a grouped list.
133. **Transition in section**: type and length.
134. **Sliders preview live while you drag** and make one undo step when you let go; double-click a slider resets it.
135. **The ◆ buttons light up** when the playhead sits on a key (and dim when the property has keys elsewhere).

## Markers, ranges, music
136. **A marker on every cut** (⋯ › Tools, `/markers-at-cuts`) to note each shot.
137. **Remove every marker** in one undoable step (⋯ › Tools, `/markers-clear`).
138. **Markers with notes** (`/marker-note`, Shift+M, right-click a marker › note): the chats read them in the edit.
139. **Marker colors** (8, below), **rename**, **go to**, **delete**, **in / out point at a marker**, **split at a marker** (right-click a marker).
140. **PgUp / PgDn** previous / next marker (`/marker-go next|prev|<n>|<name>`).
141. **Double-click the ruler** adds a marker there.
142. **Right-click the ruler**: marker, in, out, clear in–out, zoom (in / out / fit / one second of frames), snapping.
143. **Markers on the music** (⋯, `/beat-markers beat|bar|2bars|4bars`) from the song on an audio track (or the clips' own sound).
144. **Marker labels show on the ruler** when zoomed in.

## Sequences, formats, templates
145. **Motion-design templates use shapes**: logo reveal (turning rays and glow), 3 · 2 · 1 countdown with emptying rings, a story with a progress bar, feature callouts (circle + arrow + caption), a camera viewfinder intro, kinetic words with no footage, a follow end card, a square promo with a gold frame and a spinning badge.
146. **Snapshots of an edit** (⋯ › Snapshots, `/edit-snapshot save <name>`): keep a named copy, try another idea, come back with `/edit-snapshot back <name>` (undoable); the last 30 per video.
147. **Duplicate a sequence** (⋯ › Sequence › Duplicate, `/sequence-duplicate [name]`): the edit copied into a new sequence and opened, its format kept.
148. **Rename a sequence** (⋯ › Sequence › Rename, `/sequence-rename <name>`).
149. **Save the edit as an EDL** (CMX 3600, ⋯ › Sequence › Save as an EDL, `/edit-edl`) in exports/ for other editors.
150. **Sequences of their own** (not tied to one video): `/editor new <name> [9:16]`, `/editor open <name>`, `/editor list`, `/sequences`; templates start one.
151. **Formats** (14, below) and **frame rates** (9) from the format chip or `/edit-format`, `/edit-fps`; the preview frame takes the shape.
152. **"The video's own format"** goes back to the source's size.
153. **Safe zones from the format chip** (every vertical app, TikTok, Reels, Shorts, feed 4:5, YouTube).
154. **Templates** (40, below): start from one, or lay its titles and markers over your clips; slots stretch so the edit keeps its length.
155. **Fill a slot** by dropping a video on it, double-clicking it, right-click › Fill this slot, or `/fill-slot <n> <video>`.

## Preview and playback
156. **A compositor plays rich edits**: one canvas draws the main track (with its transition), every layer (transform, opacity, blend, look, effects) and the titles; hidden decoders feed it.
157. **Plain cut-only edits keep the gapless two-decoder player** (nothing changed there).
158. **Layers that start soon wait preloaded at their first frame**; decoders re-sync when they drift over three frames.
159. **Smooth**: the playhead glides on the compositor, one canvas draw per frame, no DOM writes while playing (measured).
160. **The preview renders at most 1280 px** on its long side (renders use the full size).
161. **Slip and roll drags show the picture live** as you move.
162. **The frame on screen takes the sequence's shape** (9:16, 4:5…), and goes back when you leave the editor.
163. **In–out plays as a loop** in rich edits too.
164. **Track mute / hide** apply in the preview and the render.

## Rendering
165. **Edits with no footage at all render** (color clips, gradients, shapes, words): ffmpeg no longer waits for a source file the graph doesn't use — the kinetic-words template renders straight away.
166. **⇪ Export renders rich edits with ffmpeg**: transitions (xfade + acrossfade), layers (overlay, blend modes), keyframes (expressions), looks and effects, titles (PNG frames), music and sound effects (amix), reverse, ramps, stills, colors, in–out.
167. **Export menu in groups**: Socials, Small files, Loops and web, Masters, Stills and sound (34 more presets, below).
168. **Size-targeted exports** (Discord, email, tiny…): the bitrate is computed from the length to stay under the limit.
169. **Audio-only exports** (WAV, MP3, AAC).
170. **JPEG stills** of every frame (next to the PNG option).
171. **Poster frame**: the frame at the playhead as a full-size PNG (`/poster-frame`).
172. **Record in real time** (⇪ › More, `/edit-render record`): a WebM of the edit or its in–out through the browser — used automatically when ffmpeg isn't installed.
173. **Sequences export next to their first source** (exports/), named after the sequence.
174. **`/edit-render [preset] [crop|fit|blur]`** renders any preset; it's also in Flow / chats.
175. **Checked**: lengths with ffprobe, frames read back from the rendered file (exact source frames under transitions and in a PIP), every transition, look, effect and sound effect rendered in tests.

## The Lab and Video Review
176. **Right-click the Lab's waveform › Edit it in the video editor** (`/lab-to-editor`): the Lab's video (or its loop / trim) opens as its own edit, frame by frame.
177. **› Overlay … on the open edit** (`/lab-overlay`): the Lab's video as a layer at the edit's playhead.
178. **› Use as the edit's music** (`/lab-music`): the Lab's song (or its loop / trim) on the editor's audio track.
179. **Video Review's time box gives the focus back** after Enter, so keys keep working.
180. **E is listed** in the keys button for Video Review; every editor key is listed under "Editor" while it's open.

## Chats: commands (area Video, `/help editor`)
181. `/add-shape <shape> [s] [anim] [#color]`
182. `/edit-snapshot [save <name>|list|back <name>]`
183. `/edit-edl`
184. `/sequence-duplicate [name]` · `/sequence-rename <name>`
185. `/lane-height <compact|normal|tall>`
186. `/markers-at-cuts` · `/markers-clear`
187. `/hold-frame [first|last] [s] [clip]`
188. `/track-style <T1> [style] [anim]` · `/track-shift <track> <±frames>`
189. `/normalize-all` · `/solo-sound [clip…]`
190. `/editor [on|off|new <name> [format]|open <name>|list|keys]`
191. `/edit-list` — everything in the edit, with timecodes
192. `/edit-template <template> [new|keep]`
193. `/edit-format <9:16|4:5|1:1|16:9|WxH|source> [fps]`
194. `/edit-fps <rate>`
195. `/sequences`
196. `/track-add <video|text|audio>`
197. `/track <V2|T1|A1> <hide|show|mute|unmute|lock|unlock|delete|rename …>`
198. `/overlay <video> [at] [from] [to]`
199. `/add-image <file> [s] [main]`
200. `/add-music <file> [at] [volume%]`
201. `/add-title <text> [style] [anim] [s]`
202. `/lower-third <name\nrole> [preset] [s]`
203. `/add-color <color> [s] [layer]`
204. `/fill-slot <n> <video>`
205. `/insert-clip <video> [from] [to]`
206. `/overwrite-clip <video> [from] [to]`
207. `/to-overlay [n]`
208. `/to-main [V2.1]`
209. `/transition <type|off> [s] [n|all]`
210. `/grade <look|off> [strength%] [n…]`
211. `/adjust <adjustment> <value>`
212. `/effect <effect|off|remove effect> [amount%]`
213. `/sound-effect <effect|off>`
214. `/keyframe <prop> [value] [curve]`
215. `/keyframes`
216. `/keyframes-clear [prop]`
217. `/ease <curve>`
218. `/edit-motion <preset>`
219. `/clip-opacity <value>`
220. `/clip-scale <value>`
221. `/clip-rotate <degrees>`
222. `/clip-position <x> <y>`
223. `/blend-mode <mode>`
224. `/clip-volume <percent>`
225. `/speed-ramp <ramp>`
226. `/reverse [n…] [on|off]`
227. `/roll <frames> [n]`
228. `/slip <frames> [n]`
229. `/slide <frames> [n]`
230. `/lift`
231. `/extract`
232. `/split-all [time]`
233. `/razor [on|off]`
234. `/snap [on|off]`
235. `/nest`
236. `/unnest [n]`
237. `/select <n|V2.1|all|none>`
238. `/copy-clips`
239. `/paste-clips`
240. `/inspector [n|V2.1]`
241. `/captions-import <file> [style]`
242. `/captions-export`
243. `/match-look <picture>`
244. `/clip-fill [n…]`
245. `/reset-transform [n…]`
246. `/clip-duration <s> [n]`
247. `/fit-to-fill [gap n]`
248. `/extend-edit`
249. `/swap-next [n]`
250. `/shuffle-clips`
251. `/match-frame`
252. `/clip-label <color>`
253. `/clip-rename <name>`
254. `/clip-off [n…]`
255. `/range-selection`
256. `/beat-markers [beat|bar|2bars|4bars]`
257. `/copy-keyframes`
258. `/paste-keyframes`
259. `/safe-check [zone]`
260. `/marker-note <note>`
261. `/marker-color <color>`
262. `/marker-go <n|name|next|prev>`
263. `/goto-frame <frame|timecode>`
264. `/frame-step <n>`
265. `/frame-check`
266. `/edit-zoom <in|out|fit|n>`
267. `/edit-frame [frame|time]` — attaches the composited frame to the chat
268. `/edit-render [preset] [crop|fit|blur]`
269. `/poster-frame`
270. `/edit-presets <kind> [search]` — every preset family, searchable
(`/lab-to-editor`, `/lab-overlay` and `/lab-music` are in the Lab section above.)
271. Targets everywhere: no number = the selection (else the clip under the playhead), `3` = main-track clip 3, `V2.1` / `T1.2` = an item of a track.
272. Every editor command shares its name safely (`when` in Video Review): 0 duplicate names.

## Chats: tools for Claude and Astra (mcp/video-mcp.js, the Video Director's toolset)
273. **`video_edit_read`**: the edit as compact text — name, format, fps, length, playhead (timecode + frame), in–out, selection; V1 clips with timecodes and transitions; tracks with layers, titles, styles, animations; keyframes; markers with notes. `what`: all / clips / tracks / markers / presets (+ kind, search).
274. **`video_edit_frame`**: an image of the composited program at an exact frame (number, seconds or timecode), with the source frame each layer really shows.
275. **`video_edit`**: changes, one undo step per call — ops below.
276. op **open** (a video or a sequence) · op **new** (a sequence, optionally from a template).
277. op **template** (start from one, or keep the clips).
278. op **format** (shape and frame rate).
279. op **add**: video on the main track (append / insert / overwrite), overlay, image, audio, title, lower third, color.
280. op **split** (one track or all) · op **trim** (edge to a time) · op **move** (layers in time / track, main clips by position) · op **delete** (ripple or not).
281. op **roll** / **slip** / **slide** by frames.
282. op **transition** (one cut or all, type and length, or off).
283. op **look** / **adjust** / **effect** / **sound** / **match** (a reference picture: vibe only).
284. op **keyframe** (property, value, time, curve) · op **motion** (a preset).
285. op **speed** / **ramp** / **reverse**.
286. op **set** (opacity, scale, x, y, rotate, volume, blend, mute, fades, words, style, animations, size, color, length…).
287. op **marker** (time, label, note, color) · op **range** (in–out or off) · op **select**.
288. op **captions** (import an SRT, or export the titles).
289. op **undo** / **redo** · op **render** (any preset, or "record").
290. op **command**: runs any Video chat command and returns its text (only Video / Lab areas).
291. op **help**: the field list, on demand (so the tool description stays short).
292. **Lean**: the three tools cost ≈ 350 tokens in the Video Director's tool list (only that toolset); details are read on demand (`op: "help"`, `hearth_help editor`).
293. **References stay a vibe**: the tool description and the app map say mood-board media never enter an edit unless you ask; `match` grades toward a picture without adding it.
294. **The app map knows the editor** (`hearth_help editor`, also from `edit`, `nle`, `cut`, `titles`, `transitions`), and the video topic points to it.
295. **`video_status` mentions the layers** when the edit has some (one short line, only then).

## Keys (all in the keys button under "Editor" while it's open; each also has a menu entry or a command)
296. **Shift+S** split every track · **B** razor · **N** snapping · **R** reverse · **Shift+D** dissolve on the nearest cut · **Shift+E** extend edit.
297. **+ / − / \\** zoom in / out / fit · **Ctrl/⌘+wheel** zoom at the pointer · **wheel** scroll when zoomed.
298. **Alt+← / →** nudge (Shift: 10) · **Alt+, / .** slip one frame · **Alt+↑ / ↓** layer to the track above / below.
299. **Alt+K** key the transform · **Alt+T** a title over the picture · **Alt (hold)** track switches.
300. **Shift+↑ / ↓** previous / next keyframe · **PgUp / PgDn** previous / next marker · **Shift+M** marker with a note.
301. **Enter** opens the inspector (or accepts an auto-cut) · **Esc** razor off / suggestion off / deselect / leave.
302. **Ctrl/⌘+C / V** copy / paste clips and layers · **Ctrl/⌘+A** select everything · **Ctrl/⌘+= / −** zoom.
303. **Drag modifiers**: Shift+edge roll, Shift+body slide, Ctrl/⌘+body slip, Alt free (no snapping).
304. **Right-click on everything**: clips, layers, transitions, markers, lane labels, empty lanes, the ruler.
305. **The keys sheet** (? in the editor, `/editor keys`) lists them all.


## Transitions (131)
Right-click a clip › Transition in › (group) › name, the inspector's "Transition in", Shift+D (dissolve), `/transition <id> [s] [n|all]`, ⋯ › Transitions on every cut, `video_edit {op:"transition"}`. Each one plays in the preview and renders with ffmpeg (xfade or a custom expression).
306. **Cross dissolve** · Dissolve (`dissolve`, 0.5 s by default)
307. **Dither dissolve** · Dissolve (`dither`, 0.5 s by default)
308. **Fast dissolve** · Dissolve (`fast-dissolve`, 0.3 s by default)
309. **Slow dissolve** · Dissolve (`slow-dissolve`, 1 s by default)
310. **Dissolve through gray** · Dissolve (`gray-dissolve`, 0.6 s by default)
311. **Distance dissolve** · Dissolve (`distance`, 0.6 s by default)
312. **Blur dissolve** · Dissolve (`blur-dissolve`, 0.5 s by default)
313. **Dip to black** · Dip (`dip-black`, 0.6 s by default)
314. **Dip to white** · Dip (`dip-white`, 0.6 s by default)
315. **Dip to gold** · Dip (`dip-gold`, 0.6 s by default)
316. **Dip to ember** · Dip (`dip-ember`, 0.6 s by default)
317. **Dip to red** · Dip (`dip-red`, 0.6 s by default)
318. **Dip to violet** · Dip (`dip-violet`, 0.6 s by default)
319. **Dip to blue** · Dip (`dip-blue`, 0.6 s by default)
320. **Dip to cyan** · Dip (`dip-cyan`, 0.6 s by default)
321. **Dip to pink** · Dip (`dip-pink`, 0.6 s by default)
322. **Dip to green** · Dip (`dip-green`, 0.6 s by default)
323. **Flash** · Dip (`flash-white`, 0.3 s by default)
324. **Gold flash** · Dip (`flash-gold`, 0.3 s by default)
325. **Wipe left** · Wipe (`wipe-left`, 0.5 s by default)
326. **Wipe right** · Wipe (`wipe-right`, 0.5 s by default)
327. **Wipe up** · Wipe (`wipe-up`, 0.5 s by default)
328. **Wipe down** · Wipe (`wipe-down`, 0.5 s by default)
329. **Soft wipe left** · Wipe (`soft-wipe-left`, 0.6 s by default)
330. **Soft wipe right** · Wipe (`soft-wipe-right`, 0.6 s by default)
331. **Soft wipe up** · Wipe (`soft-wipe-up`, 0.6 s by default)
332. **Soft wipe down** · Wipe (`soft-wipe-down`, 0.6 s by default)
333. **Wipe from top left** · Wipe (`wipe-tl`, 0.5 s by default)
334. **Wipe from top right** · Wipe (`wipe-tr`, 0.5 s by default)
335. **Wipe from bottom left** · Wipe (`wipe-bl`, 0.5 s by default)
336. **Wipe from bottom right** · Wipe (`wipe-br`, 0.5 s by default)
337. **Diagonal from top left** · Wipe (`diag-tl`, 0.5 s by default)
338. **Diagonal from top right** · Wipe (`diag-tr`, 0.5 s by default)
339. **Diagonal from bottom left** · Wipe (`diag-bl`, 0.5 s by default)
340. **Diagonal from bottom right** · Wipe (`diag-br`, 0.5 s by default)
341. **Clock wipe** · Wipe (`clock`, 0.6 s by default)
342. **Iris open** · Shape (`iris-open`, 0.6 s by default)
343. **Iris close** · Shape (`iris-close`, 0.6 s by default)
344. **Circle crop** · Shape (`circle-crop`, 0.6 s by default)
345. **Box crop** · Shape (`rect-crop`, 0.6 s by default)
346. **Barn doors open (vertical)** · Shape (`doors-open-v`, 0.5 s by default)
347. **Barn doors close (vertical)** · Shape (`doors-close-v`, 0.5 s by default)
348. **Barn doors open (horizontal)** · Shape (`doors-open-h`, 0.5 s by default)
349. **Barn doors close (horizontal)** · Shape (`doors-close-h`, 0.5 s by default)
350. **Slices left** · Shape (`slices-left`, 0.6 s by default)
351. **Slices right** · Shape (`slices-right`, 0.6 s by default)
352. **Slices up** · Shape (`slices-up`, 0.6 s by default)
353. **Slices down** · Shape (`slices-down`, 0.6 s by default)
354. **Wind left** · Shape (`wind-left`, 0.6 s by default)
355. **Wind right** · Shape (`wind-right`, 0.6 s by default)
356. **Wind up** · Shape (`wind-up`, 0.6 s by default)
357. **Wind down** · Shape (`wind-down`, 0.6 s by default)
358. **Push left** · Push (`push-left`, 0.5 s by default)
359. **Push right** · Push (`push-right`, 0.5 s by default)
360. **Push up** · Push (`push-up`, 0.5 s by default)
361. **Push down** · Push (`push-down`, 0.5 s by default)
362. **Cover left** · Push (`cover-left`, 0.5 s by default)
363. **Cover right** · Push (`cover-right`, 0.5 s by default)
364. **Cover up** · Push (`cover-up`, 0.5 s by default)
365. **Cover down** · Push (`cover-down`, 0.5 s by default)
366. **Reveal left** · Push (`reveal-left`, 0.5 s by default)
367. **Reveal right** · Push (`reveal-right`, 0.5 s by default)
368. **Reveal up** · Push (`reveal-up`, 0.5 s by default)
369. **Reveal down** · Push (`reveal-down`, 0.5 s by default)
370. **Zoom in** · Motion (`zoom-in`, 0.5 s by default)
371. **Zoom out** · Motion (`zoom-out`, 0.5 s by default)
372. **Zoom cross (ffmpeg)** · Motion (`zoom-cross`, 0.5 s by default)
373. **Whip pan left** · Motion (`whip-left`, 0.35 s by default)
374. **Whip pan right** · Motion (`whip-right`, 0.35 s by default)
375. **Spin** · Motion (`spin`, 0.5 s by default)
376. **Squeeze horizontal** · Motion (`squeeze-h`, 0.5 s by default)
377. **Squeeze vertical** · Motion (`squeeze-v`, 0.5 s by default)
378. **Glitch** · Digital (`glitch`, 0.4 s by default)
379. **RGB split** · Digital (`rgb-split`, 0.35 s by default)
380. **Pixelate** · Digital (`pixelate`, 0.6 s by default)
381. **Checkerboard** · Shape (`checker`, 0.6 s by default)
382. **Blinds (horizontal)** · Shape (`blinds-h`, 0.6 s by default)
383. **Blinds (vertical)** · Shape (`blinds-v`, 0.6 s by default)
384. **Diamond iris** · Shape (`diamond`, 0.6 s by default)
385. **Random blocks** · Shape (`blocks`, 0.6 s by default)
386. **Bars wipe (ragged)** · Wipe (`bars-wipe`, 0.6 s by default)
387. **Shutter (bars close, then open)** · Shape (`shutter`, 0.5 s by default)
388. **Iris to black and open** · Shape (`iris-black`, 0.8 s by default)
389. **Wipe with a gold edge** · Wipe (`gold-edge-wipe`, 0.5 s by default)
390. **Light leak (gold)** · Light (`light-leak`, 0.8 s by default)
391. **Film burn (ember)** · Light (`film-burn`, 0.8 s by default)
392. **Overexpose (white out)** · Light (`white-out`, 0.5 s by default)
393. **Stretch through** · Motion (`stretch`, 0.4 s by default)
394. **Ripple** · Motion (`ripple`, 0.7 s by default)
395. **Slide and fade left** · Push (`slide-fade-left`, 0.5 s by default)
396. **Push with motion blur left** · Push (`blur-push-left`, 0.4 s by default)
397. **Push with motion blur right** · Push (`blur-push-right`, 0.4 s by default)
398. **Push with motion blur up** · Push (`blur-push-up`, 0.4 s by default)
399. **Push with motion blur down** · Push (`blur-push-down`, 0.4 s by default)
400. **Iris from the top left corner** · Shape (`iris-tl`, 0.6 s by default)
401. **Iris from the top right corner** · Shape (`iris-tr`, 0.6 s by default)
402. **Iris from the bottom left corner** · Shape (`iris-bl`, 0.6 s by default)
403. **Iris from the bottom right corner** · Shape (`iris-br`, 0.6 s by default)
404. **Diamond close** · Shape (`diamond-close`, 0.6 s by default)
405. **Checkerboard (big squares)** · Shape (`checker-big`, 0.6 s by default)
406. **Random blocks (fine)** · Shape (`blocks-fine`, 0.6 s by default)
407. **Diagonal blinds** · Shape (`blinds-diag`, 0.6 s by default)
408. **Flash (ember)** · Dip (`flash-ember`, 0.3 s by default)
409. **Flash (violet)** · Dip (`flash-violet`, 0.3 s by default)
410. **Flash (cyan)** · Dip (`flash-cyan`, 0.3 s by default)
411. **Flash (pink)** · Dip (`flash-pink`, 0.3 s by default)
412. **Light leak (ember)** · Light (`leak-ember`, 0.8 s by default)
413. **Light leak (violet)** · Light (`leak-violet`, 0.8 s by default)
414. **Light leak (cyan)** · Light (`leak-cyan`, 0.8 s by default)
415. **Light leak (pink)** · Light (`leak-pink`, 0.8 s by default)
416. **Crush to black and back** · Light (`black-crush`, 0.5 s by default)
417. **Stretch through (vertical)** · Motion (`stretch-v`, 0.4 s by default)
418. **Wipe with a white edge** · Wipe (`edge-wipe-white`, 0.5 s by default)
419. **Wipe with a cyan edge** · Wipe (`edge-wipe-cyan`, 0.5 s by default)
420. **Wipe with a violet edge** · Wipe (`edge-wipe-violet`, 0.5 s by default)
421. **Flash (red)** · Dip (`flash-red`, 0.3 s by default)
422. **Flash (green)** · Dip (`flash-green`, 0.3 s by default)
423. **Flash (blue)** · Dip (`flash-blue`, 0.3 s by default)
424. **Light leak (gold)** · Light (`leak-gold`, 0.8 s by default)
425. **Light leak (red)** · Light (`leak-red`, 0.8 s by default)
426. **Light leak (green)** · Light (`leak-green`, 0.8 s by default)
427. **Light leak (white)** · Light (`leak-white`, 0.8 s by default)
428. **Wipe with a gold edge** · Wipe (`edge-wipe-gold`, 0.5 s by default)
429. **Wipe with a ember edge** · Wipe (`edge-wipe-ember`, 0.5 s by default)
430. **Wipe with a pink edge** · Wipe (`edge-wipe-pink`, 0.5 s by default)
431. **Wipe with a black edge** · Wipe (`edge-wipe-black`, 0.5 s by default)
432. **Iris from the top edge** · Shape (`iris-top`, 0.6 s by default)
433. **Iris from the bottom edge** · Shape (`iris-bottom`, 0.6 s by default)
434. **Iris from the left edge** · Shape (`iris-left`, 0.6 s by default)
435. **Iris from the right edge** · Shape (`iris-right`, 0.6 s by default)
436. **Slide and fade up** · Push (`slide-fade-up`, 0.5 s by default)

## Looks (color grades) (197)
Right-click › Look › (group) › name, the inspector's Color › Look (with a strength slider), `/grade <id> [strength%]`, `video_edit {op:"look"}`. One recipe drives the preview (an SVG color matrix) and the render (colorchannelmixer, lutrgb, vignette, grain…), so they match.
437. **Teal & orange** · Cinematic (`teal-orange`)
438. **Blockbuster** · Cinematic (`blockbuster`)
439. **Bleach bypass** · Cinematic (`bleach`)
440. **Moody** · Cinematic (`moody`)
441. **Cinematic noir** · Cinematic (`noir-cine`)
442. **Code green** · Cinematic (`matrix`)
443. **Desert heat** · Cinematic (`desert`)
444. **Arctic** · Cinematic (`arctic`)
445. **Day for night** · Cinematic (`day-for-night`)
446. **Golden hour** · Cinematic (`golden-hour`)
447. **Blue hour** · Cinematic (`blue-hour`)
448. **Anamorphic** · Cinematic (`anamorphic`)
449. **Thriller** · Cinematic (`thriller`)
450. **Romance** · Cinematic (`romance`)
451. **Epic** · Cinematic (`epic`)
452. **Portrait film** · Film (`portra`)
453. **Vivid film** · Film (`ektar`)
454. **Slide film** · Film (`velvia`)
455. **Green-shadow film** · Film (`fuji-green`)
456. **Grainy B&W film** · Film (`tri-x`)
457. **Tungsten night film** · Film (`cine-800`)
458. **Expired film** · Film (`expired`)
459. **Instant photo** · Film (`polaroid`)
460. **Super 8** · Film (`super8`)
461. **16 mm** · Film (`16mm`)
462. **Cross process** · Film (`cross-process`)
463. **Lomo** · Film (`lomo`)
464. **Warm slide** · Film (`kodachrome`)
465. **Black & white** · Black & white (`bw`)
466. **B&W high contrast** · Black & white (`bw-high`)
467. **B&W soft** · Black & white (`bw-soft`)
468. **Ink (crushed)** · Black & white (`bw-ink`)
469. **Silver** · Black & white (`bw-silver`)
470. **Sepia** · Black & white (`sepia`)
471. **Selenium tone** · Black & white (`selenium`)
472. **Cyanotype** · Black & white (`cyanotype`)
473. **Newsprint** · Black & white (`newsprint`)
474. **Vintage** · Vintage (`vintage`)
475. **70s** · Vintage (`70s`)
476. **80s VHS** · Vintage (`80s`)
477. **90s camcorder** · Vintage (`90s`)
478. **Faded** · Vintage (`faded`)
479. **Matte** · Vintage (`matte`)
480. **Old photo** · Vintage (`old-photo`)
481. **Western** · Vintage (`western`)
482. **Cyberpunk** · Neon (`cyberpunk`)
483. **Synthwave** · Neon (`synthwave`)
484. **Neon noir** · Neon (`neon-noir`)
485. **Acid** · Neon (`acid`)
486. **Vaporwave** · Neon (`vaporwave`)
487. **Club lights** · Neon (`club`)
488. **Hologram** · Neon (`hologram`)
489. **Ultraviolet** · Neon (`ultraviolet`)
490. **Infrared** · Neon (`infrared`)
491. **Forgeheart (gold & ember)** · Neon (`forgeheart`)
492. **Molten** · Neon (`molten`)
493. **Ice neon** · Neon (`ice-neon`)
494. **Clean bright** · Clean (`clean`)
495. **Punchy** · Clean (`punchy`)
496. **Vivid** · Clean (`vivid`)
497. **Soft** · Clean (`soft`)
498. **Airy** · Clean (`airy`)
499. **Pastel** · Clean (`pastel`)
500. **Crisp** · Clean (`crisp`)
501. **Natural warm** · Clean (`natural-warm`)
502. **Natural cool** · Clean (`natural-cool`)
503. **Food** · Clean (`food`)
504. **Product** · Clean (`product`)
505. **Skin friendly** · Clean (`skin`)
506. **HDR-ish** · Clean (`hdr`)
507. **High key** · Clean (`high-key`)
508. **Low key** · Clean (`low-key`)
509. **Summer** · Seasons (`summer`)
510. **Autumn** · Seasons (`autumn`)
511. **Winter** · Seasons (`winter`)
512. **Spring** · Seasons (`spring`)
513. **Forest** · Seasons (`forest`)
514. **Ocean** · Seasons (`ocean`)
515. **Sunset** · Seasons (`sunset`)
516. **Fog** · Seasons (`fog`)
517. **Storm** · Seasons (`storm`)
518. **Negative** · Stylised (`negative`)
519. **Thermal-ish** · Stylised (`thermal`)
520. **Dream** · Stylised (`dream`)
521. **Nightmare** · Stylised (`nightmare`)
522. **Comic** · Stylised (`comic`)
523. **Pop art** · Stylised (`pop-art`)
524. **Poster** · Stylised (`posterized`)
525. **Glow** · Stylised (`glow`)
526. **Dim** · Stylised (`dim`)
527. **Bright** · Stylised (`bright`)
528. **Ghost** · Stylised (`ghost`)
529. **Red pop B&W** · Stylised (`sin-city`)
530. **Pink haze** · Music video (`mv-pink-haze`)
531. **Chrome (cold, glossy)** · Music video (`mv-chrome`)
532. **Red room** · Music video (`mv-red-room`)
533. **Green tint (indie)** · Music video (`mv-green-tint`)
534. **Gold club** · Music video (`mv-gold-hour-club`)
535. **Mono with red** · Music video (`mv-mono-red`)
536. **Anime bright** · Cartoon (`anime-bright`)
537. **Anime dusk** · Cartoon (`anime-dusk`)
538. **Cel shaded** · Cartoon (`cel`)
539. **Storybook** · Cartoon (`storybook`)
540. **Dawn** · Time of day (`dawn`)
541. **Hard noon** · Time of day (`noon`)
542. **Dusk** · Time of day (`dusk`)
543. **Night city** · Time of day (`night-city`)
544. **Midnight blue** · Time of day (`midnight`)
545. **Overcast** · Time of day (`overcast`)
546. **Handheld green** · Retro game (`gameboy`)
547. **Arcade** · Retro game (`arcade`)
548. **CGA (cyan & magenta)** · Retro game (`cga`)
549. **Old console** · Retro game (`sepia-game`)
550. **Sci-fi teal** · Sci-fi (`scifi-teal`)
551. **Mars** · Sci-fi (`mars`)
552. **Deep space** · Sci-fi (`space`)
553. **HUD** · Sci-fi (`hud`)
554. **Neo-noir orange** · Sci-fi (`replicant`)
555. **Deep green code** · Sci-fi (`matrix-deep`)
556. **Sickly** · Horror (`horror-sick`)
557. **Blood** · Horror (`horror-blood`)
558. **Found footage** · Horror (`horror-found`)
559. **Jungle** · Nature (`jungle`)
560. **Snow** · Nature (`snow`)
561. **Desert pastel** · Nature (`desert-pastel`)
562. **Lake** · Nature (`lake`)
563. **Deep autumn** · Nature (`autumn-deep`)
564. **Forgeheart ember** · Forgeheart (`forge-ember`)
565. **Forgeheart AI violet** · Forgeheart (`forge-ai`)
566. **Forgeheart steel** · Forgeheart (`forge-steel`)
567. **Forgeheart dark gold** · Forgeheart (`forge-gold-dark`)
568. **Forgeheart live (vivid)** · Forgeheart (`forge-rainbow`)
569. **Forgeheart ash** · Forgeheart (`forge-ash`)
570. **Color wash: red** · Color washes (`wash-red`)
571. **Color wash: orange** · Color washes (`wash-orange`)
572. **Color wash: gold** · Color washes (`wash-gold`)
573. **Color wash: lime** · Color washes (`wash-lime`)
574. **Color wash: green** · Color washes (`wash-green`)
575. **Color wash: teal** · Color washes (`wash-teal`)
576. **Color wash: cyan** · Color washes (`wash-cyan`)
577. **Color wash: blue** · Color washes (`wash-blue`)
578. **Color wash: indigo** · Color washes (`wash-indigo`)
579. **Color wash: violet** · Color washes (`wash-violet`)
580. **Color wash: magenta** · Color washes (`wash-magenta`)
581. **Color wash: pink** · Color washes (`wash-pink`)
582. **Color wash: ember** · Color washes (`wash-ember`)
583. **Color wash: ai-violet** · Color washes (`wash-ai-violet`)
584. **Duotone: gold black** · Duotones (`duo-gold-black`)
585. **Duotone: violet night** · Duotones (`duo-violet-night`)
586. **Duotone: cyan ink** · Duotones (`duo-cyan-ink`)
587. **Duotone: rose** · Duotones (`duo-rose`)
588. **Duotone: mint** · Duotones (`duo-mint`)
589. **Duotone: blood** · Duotones (`duo-blood`)
590. **Duotone: ocean duo** · Duotones (`duo-ocean-duo`)
591. **Duotone: amber** · Duotones (`duo-amber`)
592. **Clean skin** · Social (`soc-clean-skin`)
593. **Food pop** · Social (`soc-food`)
594. **Travel vivid** · Social (`soc-travel`)
595. **Fitness punch** · Social (`soc-fitness`)
596. **Beauty soft** · Social (`soc-beauty`)
597. **Product white** · Social (`soc-product`)
598. **Vlog warm** · Social (`soc-vlog`)
599. **Tech cool** · Social (`soc-tech`)
600. **Fashion matte** · Social (`soc-fashion`)
601. **Street contrast** · Social (`soc-street`)
602. **Night out** · Social (`soc-night-out`)
603. **Bright interior** · Social (`soc-real-estate`)
604. **1920s silent film** · Decades (`dec-1920`)
605. **1950s Technicolor-style** · Decades (`dec-1950`)
606. **1960s print** · Decades (`dec-1960`)
607. **2000s digicam** · Decades (`dec-2000`)
608. **2010s photo filter** · Decades (`dec-2010`)
609. **Rainy day** · Weather (`wx-rain`)
610. **Heatwave** · Weather (`wx-heat`)
611. **Haze** · Weather (`wx-haze`)
612. **Smog** · Weather (`wx-smog`)
613. **After the rain** · Weather (`wx-after-rain`)
614. **Arena lights** · Sport (`sport-arena`)
615. **Gritty training** · Sport (`sport-grit`)
616. **Green pitch** · Sport (`sport-pitch`)
617. **Ice rink** · Sport (`sport-ice`)
618. **Split tone: orange / teal** · Split tones (`split-orange-teal`)
619. **Split tone: teal / orange** · Split tones (`split-teal-orange`)
620. **Split tone: magenta / green** · Split tones (`split-magenta-green`)
621. **Split tone: gold / blue** · Split tones (`split-gold-blue`)
622. **Split tone: blue / gold** · Split tones (`split-blue-gold`)
623. **Split tone: red / cyan** · Split tones (`split-red-cyan`)
624. **Split tone: violet / amber** · Split tones (`split-violet-amber`)
625. **Split tone: pink / mint** · Split tones (`split-pink-mint`)
626. **Pastel: peach** · Pastels (`pastel-peach`)
627. **Pastel: lilac** · Pastels (`pastel-lilac`)
628. **Pastel: mint** · Pastels (`pastel-mint`)
629. **Pastel: sky** · Pastels (`pastel-sky`)
630. **Pastel: butter** · Pastels (`pastel-butter`)
631. **Pastel: rose** · Pastels (`pastel-rose`)
632. **Pastel: sage** · Pastels (`pastel-sage`)
633. **Pastel: lavender** · Pastels (`pastel-lavender`)

## Color adjustments (17)
Inspector › Color › Adjust (sliders, double-click resets), `/adjust <name> <value>`, `video_edit {op:"adjust"}`; they add on top of a look.
634. **Exposure** (`exposure`, -2 … 2)
635. **Contrast** (`contrast`, -1 … 1)
636. **Saturation** (`saturation`, -1 … 1)
637. **Temperature** (`temp`, -1 … 1)
638. **Tint** (`tint`, -1 … 1)
639. **Hue** (`hue`, -180 … 180)
640. **Gamma (midtones)** (`gamma`, -1 … 1)
641. **Highlights** (`highlights`, -1 … 1)
642. **Shadows** (`shadows`, -1 … 1)
643. **Fade (lifted blacks)** (`fade`, 0 … 1)
644. **Black & white** (`mono`, 0 … 1)
645. **Sepia** (`sepia`, 0 … 1)
646. **Color wash** (`tintAmt`, 0 … 1)
647. **Vignette** (`vignette`, 0 … 1)
648. **Grain** (`grain`, 0 … 1)
649. **Blur** (`blur`, 0 … 1)
650. **Sharpen** (`sharpen`, 0 … 1)

## Clip effects (56)
Right-click › Effects › (group), the inspector's Effects (each with an amount and ✕), `/effect <id> [amount%]`, `/effect remove <id>`, `/effect off`, `video_edit {op:"effect"}`. Stackable; preview and render share the idea (canvas / SVG filters ⇄ ffmpeg filters).
651. **Mirror (flip left ↔ right)** · Geometry (`mirror`)
652. **Upside down** · Geometry (`flip`)
653. **Symmetry (left half mirrored)** · Geometry (`mirror-left`)
654. **Symmetry (top half mirrored)** · Geometry (`mirror-top`)
655. **Letterbox 2.39 (cinema bars)** · Frame (`letterbox-239`)
656. **Letterbox 1.85** · Frame (`letterbox-185`)
657. **White border** · Frame (`border-white`)
658. **Gold border** · Frame (`border-gold`)
659. **Black border** · Frame (`border-black`)
660. **Rounded corners** · Frame (`rounded`)
661. **Blur** · Stylize (`blur`)
662. **Soft glow** · Stylize (`soft-glow`)
663. **Bloom (strong glow)** · Stylize (`bloom`)
664. **Sharpen** · Stylize (`sharpen`)
665. **Pixelate** · Stylize (`pixelate`)
666. **Posterize** · Stylize (`posterize`)
667. **Threshold (black & white ink)** · Stylize (`threshold`)
668. **Invert** · Stylize (`invert`)
669. **Gray** · Stylize (`grayscale`)
670. **Solarize** · Stylize (`solarize`)
671. **Edge detect (neon lines)** · Stylize (`edges`)
672. **Emboss** · Stylize (`emboss`)
673. **RGB shift (chromatic aberration)** · Glitch (`rgb-shift`)
674. **Scanlines** · Glitch (`scanlines`)
675. **Static noise** · Glitch (`static`)
676. **VHS** · Glitch (`vhs`)
677. **CRT screen** · Glitch (`crt`)
678. **Old film (flicker, grain, sepia)** · Glitch (`old-film`)
679. **Hue cycle (colors rotate over time)** · Animated (`hue-cycle`)
680. **Strobe (white flashes on the beat, 120 bpm)** · Animated (`strobe`)
681. **Brightness pulse** · Animated (`pulse`)
682. **Desaturate over the clip** · Animated (`fade-gray`)
683. **Kaleido (four mirrored corners)** · Geometry (`quad-mirror`)
684. **Tile 2 × 2** · Geometry (`tile-2`)
685. **Tile 3 × 3** · Geometry (`tile-3`)
686. **Instant-photo frame** · Frame (`polaroid`)
687. **White vignette (dreamy)** · Frame (`vignette-white`)
688. **Denoise (clean grain)** · Stylize (`denoise`)
689. **Gold glow** · Stylize (`glow-gold`)
690. **Neon edges (glowing outlines)** · Stylize (`neon-edges`)
691. **Strong chromatic split** · Glitch (`chroma-strong`)
692. **Color noise** · Glitch (`color-noise`)
693. **Hue shift** · Color (`hue-shift`)
694. **Oversaturate** · Color (`oversaturate`)
695. **Crushed contrast** · Color (`contrast-crush`)
696. **Sepia tone** · Color (`sepia-tone`)
697. **Hard black & white** · Color (`bw-hard`)
698. **Night vision** · Color (`night-vision`)
699. **Dream (soft and bright)** · Stylize (`dream`)
700. **Strong vignette** · Frame (`vignette-strong`)
701. **Ember border** · Frame (`border-ember`)
702. **Violet border** · Frame (`border-violet`)
703. **Letterbox 2:1** · Frame (`letterbox-2`)
704. **Thick scanlines** · Glitch (`scanlines-thick`)
705. **Heavy grain** · Glitch (`noise-heavy`)
706. **Flicker** · Animated (`flicker`)

## Sound effects (39)
Right-click › Sound effects, the inspector's "Sound fx", `/sound-effect <id>`, `video_edit {op:"sound"}`. Heard in the render (the preview plays the clean sound).
707. **Voice boost (clearer speech)** (`voice`)
708. **Bass boost** (`bass`)
709. **Bright (treble boost)** (`treble`)
710. **Warm (soft highs)** (`warm`)
711. **Lo-fi** (`lofi`)
712. **Radio** (`radio`)
713. **Telephone** (`telephone`)
714. **Underwater / muffled** (`underwater`)
715. **Echo** (`echo`)
716. **Big room (reverb-ish)** (`hall`)
717. **Pitch up (chipmunk-ish, same length)** (`pitch-up`)
718. **Pitch down (deep, same length)** (`pitch-down`)
719. **Loudness to social level (−14 LUFS)** (`loud`)
720. **Compressor (even level)** (`compress`)
721. **Wider stereo** (`wide`)
722. **Mono** (`mono`)
723. **Ducked (−12 dB, a music bed under voice)** (`duck`)
724. **Long tail (gentle fade at the end)** (`fade-tail`)
725. **Louder (+6 dB)** (`boost`)
726. **Quieter (−6 dB)** (`quieter`)
727. **Limiter (no clipping)** (`limiter`)
728. **Noise gate** (`gate`)
729. **Noise reduction** (`denoise`)
730. **De-ess (softer s sounds)** (`deess`)
731. **Chorus** (`chorus`)
732. **Flanger** (`flanger`)
733. **Phaser** (`phaser`)
734. **Tremolo** (`tremolo`)
735. **Auto-pan (left ↔ right)** (`autopan`)
736. **Soft (cut the highs)** (`high-cut`)
737. **Cut the rumble (low cut)** (`bass-cut`)
738. **Karaoke (center voice out)** (`karaoke`)
739. **Backwards** (`backwards`)
740. **Stadium echo** (`stadium`)
741. **Bitcrush (8-bit)** (`bitcrush`)
742. **Swap left and right** (`swap-lr`)
743. **Even level (dynamic normalizer)** (`level`)
744. **Left channel only (both sides)** (`left-only`)
745. **Right channel only (both sides)** (`right-only`)

## Easing curves (keyframes) (63)
Inspector › Transform › Curve, `/ease <id>`, `/keyframe <prop> <value> <curve>`, `video_edit {op:"keyframe", ease}`. The curve runs from a keyframe to the next one, in the preview and in the render (sampled into the ffmpeg expression).
746. **Linear** (`linear`)
747. **Hold (jump at the next key)** (`hold`)
748. **Ease (smooth both ends)** (`ease`)
749. **Ease in** (`easeIn`)
750. **Ease out** (`easeOut`)
751. **Ease in-out** (`easeInOut`)
752. **Smoothstep** (`smooth`)
753. **Smootherstep** (`smoother`)
754. **Snappy (fast start, soft land)** (`snappy`)
755. **Motion design (AE-style 33/100)** (`motion`)
756. **Anticipate (pulls back first)** (`anticipate`)
757. **Overshoot** (`overshoot`)
758. **Spring** (`spring`)
759. **Whip (very fast middle)** (`whip`)
760. **Steps ×4** (`steps4`)
761. **Steps ×8 (stop motion)** (`steps8`)
762. **Wiggle (settles)** (`wiggle`)
763. **Material standard** (`material`)
764. **Decelerate** (`decelerate`)
765. **Accelerate** (`accelerate`)
766. **Swift (quick out, long glide)** (`swift`)
767. **Gentle** (`gentle`)
768. **Punch (overshoots hard)** (`punch`)
769. **Pull back, then go** (`pullback`)
770. **Settle (soft spring)** (`settle`)
771. **Steps ×2** (`steps2`)
772. **Steps ×12 (stop motion, fine)** (`steps12`)
773. **Slow middle (fast, slow, fast)** (`slowmid`)
774. **Soft bounce** (`bounce-soft`)
775. **Expo out (stronger)** (`expo-strong`)
776. **Sine wave (back and forth, ends at 1)** (`sine-wave`)
777. **Late (waits, then moves)** (`late`)
778. **Early (moves, then waits)** (`early`)
779. **Quad in** (`quadIn`)
780. **Quad out** (`quadOut`)
781. **Quad in-out** (`quadInOut`)
782. **Cubic in** (`cubicIn`)
783. **Cubic out** (`cubicOut`)
784. **Cubic in-out** (`cubicInOut`)
785. **Quart in** (`quartIn`)
786. **Quart out** (`quartOut`)
787. **Quart in-out** (`quartInOut`)
788. **Quint in** (`quintIn`)
789. **Quint out** (`quintOut`)
790. **Quint in-out** (`quintInOut`)
791. **Sine in** (`sineIn`)
792. **Sine out** (`sineOut`)
793. **Sine in-out** (`sineInOut`)
794. **Expo in** (`expoIn`)
795. **Expo out** (`expoOut`)
796. **Expo in-out** (`expoInOut`)
797. **Circ in** (`circIn`)
798. **Circ out** (`circOut`)
799. **Circ in-out** (`circInOut`)
800. **Back (overshoot) in** (`backIn`)
801. **Back (overshoot) out** (`backOut`)
802. **Back (overshoot) in-out** (`backInOut`)
803. **Elastic in** (`elasticIn`)
804. **Elastic out** (`elasticOut`)
805. **Elastic in-out** (`elasticInOut`)
806. **Bounce in** (`bounceIn`)
807. **Bounce out** (`bounceOut`)
808. **Bounce in-out** (`bounceInOut`)

## Title styles (117)
＋ › Title › (group) › style, right-click a title › Title style, the inspector's Style, `/add-title <text> <style>`, `video_edit {op:"add", kind:"title", style}`. Titles are drawn by one renderer for the preview and the export (PNG frames), so they look the same; long words shrink to fit the frame.
809. **Bold center** · Titles (`bold`)
810. **Huge headline** · Titles (`big`)
811. **Display (Oxanium)** · Titles (`display`)
812. **Thin elegant** · Titles (`thin`)
813. **Serif classic** · Titles (`serif`)
814. **Mono / code** · Titles (`mono`)
815. **Outline** · Titles (`outline`)
816. **Gold outline** · Titles (`outline-gold`)
817. **Neon glow** · Titles (`neon`)
818. **Cyan neon** · Titles (`neon-cyan`)
819. **Forgeheart gold** · Titles (`gold`)
820. **Ember** · Titles (`ember`)
821. **Drop shadow** · Titles (`shadow`)
822. **Boxed** · Titles (`boxed`)
823. **Gold box** · Titles (`boxed-gold`)
824. **White box** · Titles (`boxed-white`)
825. **Sticker** · Titles (`sticker`)
826. **Casual italic** · Titles (`handwritten`)
827. **Caption (bottom)** · Captions (`caption`)
828. **Caption on a box** · Captions (`caption-box`)
829. **Yellow caption** · Captions (`caption-yellow`)
830. **Social caption (big, stroked)** · Captions (`caption-tiktok`)
831. **Subtitle** · Captions (`subtitle`)
832. **Top line** · Placement (`top`)
833. **Bottom line** · Placement (`bottom`)
834. **Left aligned** · Placement (`left`)
835. **Right aligned** · Placement (`right`)
836. **Corner tag (top left)** · Placement (`corner-tl`)
837. **Corner tag (bottom right)** · Placement (`corner-br`)
838. **Quote** · Titles (`quote`)
839. **Big number** · Titles (`stat`)
840. **Kinetic stack** · Titles (`kinetic`)
841. **Glass card** · Titles (`glass`)
842. **Chrome** · Titles (`chrome`)
843. **App UI label** · Titles (`app-ui`)
844. **Countdown digit** · Titles (`countdown`)
845. **Hero (giant)** · Titles (`hero`)
846. **Huge gold** · Colors (`big-gold`)
847. **Huge ember** · Colors (`big-ember`)
848. **Huge violet** · Colors (`big-violet`)
849. **Cyan outline** · Colors (`outline-cyan`)
850. **Pink outline** · Colors (`outline-pink`)
851. **Gold neon** · Colors (`neon-gold`)
852. **Green neon** · Colors (`neon-green`)
853. **Violet neon** · Colors (`neon-violet`)
854. **Red box** · Colors (`boxed-red`)
855. **Violet box** · Colors (`boxed-violet`)
856. **Gold on black** · Colors (`gold-on-black`)
857. **Gold caption** · Captions (`caption-gold`)
858. **Caption on white** · Captions (`caption-white-box`)
859. **Yellow subtitle** · Captions (`subtitle-yellow`)
860. **Retro (serif, gold, shadow)** · Titles (`retro`)
861. **Terminal** · Titles (`tech-green`)
862. **Headline (left)** · Placement (`headline-left`)
863. **Headline (right)** · Placement (`headline-right`)
864. **Tiny label** · Titles (`tiny-label`)
865. **Soft** · Titles (`soft`)
866. **Dark glass card** · Titles (`glass-dark`)
867. **Stamp** · Titles (`stamp`)
868. **Gold quote** · Titles (`quote-gold`)
869. **Neon (white)** · Neon colors (`neon-white`)
870. **Outline (white)** · Outline colors (`outline-white`)
871. **Neon (ember)** · Neon colors (`neon-ember`)
872. **Outline (ember)** · Outline colors (`outline-ember`)
873. **Box (ember)** · Box colors (`boxed-ember`)
874. **Caption (ember)** · Caption colors (`caption-ember`)
875. **Neon (red)** · Neon colors (`neon-red`)
876. **Outline (red)** · Outline colors (`outline-red`)
877. **Caption (red)** · Caption colors (`caption-red`)
878. **Neon (pink)** · Neon colors (`neon-pink`)
879. **Box (pink)** · Box colors (`boxed-pink`)
880. **Caption (pink)** · Caption colors (`caption-pink`)
881. **Outline (violet)** · Outline colors (`outline-violet`)
882. **Caption (violet)** · Caption colors (`caption-violet`)
883. **Neon (blue)** · Neon colors (`neon-blue`)
884. **Outline (blue)** · Outline colors (`outline-blue`)
885. **Box (blue)** · Box colors (`boxed-blue`)
886. **Caption (blue)** · Caption colors (`caption-blue`)
887. **Box (cyan)** · Box colors (`boxed-cyan`)
888. **Caption (cyan)** · Caption colors (`caption-cyan`)
889. **Outline (green)** · Outline colors (`outline-green`)
890. **Box (green)** · Box colors (`boxed-green`)
891. **Caption (green)** · Caption colors (`caption-green`)
892. **Neon (lime)** · Neon colors (`neon-lime`)
893. **Outline (lime)** · Outline colors (`outline-lime`)
894. **Box (lime)** · Box colors (`boxed-lime`)
895. **Caption (lime)** · Caption colors (`caption-lime`)
896. **Wide spaced capitals** · Intro (`intro-wide`)
897. **Chrome** · Intro (`intro-chrome`)
898. **Ember headline** · Intro (`intro-ember`)
899. **Violet glow headline** · Intro (`intro-violet`)
900. **Mono tag** · Intro (`intro-mono-tag`)
901. **Stroke and fill** · Intro (`intro-stroke-fill`)
902. **Giant one word** · Intro (`intro-giant`)
903. **Giant outline word** · Intro (`intro-giant-outline`)
904. **Big serif** · Intro (`intro-serif-big`)
905. **Tilted bold** · Intro (`intro-tilted`)
906. **Bottom-left headline** · Intro (`intro-bottom-left`)
907. **Top headline** · Intro (`intro-top`)
908. **Hook (top, boxed white)** · Social hooks (`hook-top`)
909. **Hook (yellow, stroked)** · Social hooks (`hook-yellow`)
910. **Question hook** · Social hooks (`hook-question`)
911. **Big number** · Social hooks (`hook-number`)
912. **POV line** · Social hooks (`hook-pov`)
913. **Red alert** · Social hooks (`hook-red`)
914. **Two-line hook** · Social hooks (`hook-subtitle`)
915. **End card call to action** · Social hooks (`hook-end-card`)
916. **Huge (white)** · Huge colors (`huge-white`)
917. **Huge (gold)** · Huge colors (`huge-gold`)
918. **Huge (ember)** · Huge colors (`huge-ember`)
919. **Huge (red)** · Huge colors (`huge-red`)
920. **Huge (pink)** · Huge colors (`huge-pink`)
921. **Huge (violet)** · Huge colors (`huge-violet`)
922. **Huge (blue)** · Huge colors (`huge-blue`)
923. **Huge (cyan)** · Huge colors (`huge-cyan`)
924. **Huge (green)** · Huge colors (`huge-green`)
925. **Huge (lime)** · Huge colors (`huge-lime`)

## Title animations (in and out) (110)
Right-click a title › Title animation › In / Out, the inspector's In / Out and Anim length, `/add-title <text> <style> <anim>`. Each works as an entrance and as an exit; letter, word and line animations stagger.
926. **None (cut in)** (`none`, by the whole title)
927. **Fade** (`fade`, by the whole title)
928. **Fade up** (`fade-up`, by the whole title)
929. **Fade down** (`fade-down`, by the whole title)
930. **Slide in from the right** (`slide-left`, by the whole title)
931. **Slide in from the left** (`slide-right`, by the whole title)
932. **Rise (lines)** (`rise`, by lines)
933. **Drop in (lines)** (`drop`, by lines)
934. **Pop** (`pop`, by the whole title)
935. **Pop (word by word)** (`pop-words`, by words)
936. **Pop (letter by letter)** (`pop-chars`, by chars)
937. **Zoom out (from big)** (`zoom-out`, by the whole title)
938. **Zoom in (from small)** (`zoom-in`, by the whole title)
939. **Blur in** (`blur-in`, by the whole title)
940. **Blur in (words)** (`blur-words`, by words)
941. **Focus pull** (`focus`, by the whole title)
942. **Typewriter** (`typewriter`, by chars)
943. **Type with cursor** (`type-cursor`, by chars)
944. **Letters fade in** (`letters-fade`, by chars)
945. **Letters rise** (`letters-rise`, by chars)
946. **Letters drop** (`letters-drop`, by chars)
947. **Letters spin** (`letters-spin`, by chars)
948. **Letters gather** (`letters-scatter`, by chars)
949. **Words rise** (`words-rise`, by words)
950. **Words slide in** (`words-slide`, by words)
951. **Words flip** (`words-flip`, by words)
952. **Tracking in (letters close up)** (`tracking-in`, by the whole title)
953. **Tracking out (letters spread)** (`tracking-out`, by the whole title)
954. **Wipe reveal** (`wipe`, by the whole title)
955. **Wipe reveal (lines)** (`wipe-lines`, by lines)
956. **Mask up (lines)** (`mask-up`, by lines)
957. **Mask down (lines)** (`mask-down`, by lines)
958. **Stretch in** (`stretch`, by the whole title)
959. **Squash** (`squash`, by the whole title)
960. **Bounce in** (`bounce`, by the whole title)
961. **Elastic** (`elastic`, by the whole title)
962. **Spin in** (`spin-in`, by the whole title)
963. **Swing** (`swing`, by the whole title)
964. **Flicker on** (`flicker`, by the whole title)
965. **Neon flicker (letters)** (`neon-flicker`, by chars)
966. **Glitch in** (`glitch`, by the whole title)
967. **Scramble (decode)** (`scramble`, by chars)
968. **Highlight bar** (`highlight`, by the whole title)
969. **Underline grows** (`underline`, by the whole title)
970. **Box reveal** (`box-reveal`, by the whole title)
971. **Split (top / bottom)** (`split`, by lines)
972. **Kinetic punch (words)** (`kinetic`, by words)
973. **Count up (numbers)** (`ticker`, by the whole title)
974. **Letters zoom in** (`letters-zoom`, by chars)
975. **Letters blur in** (`letters-blur`, by chars)
976. **Letters wave in** (`letters-wave`, by chars)
977. **Letters flip** (`letters-flip`, by chars)
978. **Letters slide in** (`letters-slide`, by chars)
979. **Cascade (letters fall in)** (`cascade`, by chars)
980. **Glitch letters** (`glitch-letters`, by chars)
981. **Typewriter (fast)** (`type-fast`, by chars)
982. **Letters wipe on** (`wipe-chars`, by chars)
983. **Words drop** (`words-drop`, by words)
984. **Words zoom in** (`words-zoom`, by words)
985. **Words fade in** (`words-fade`, by words)
986. **Words spin in** (`words-spin`, by words)
987. **Lines slide in (from the left)** (`lines-slide-left`, by lines)
988. **Lines zoom in** (`lines-zoom`, by lines)
989. **Lines blur in** (`lines-blur`, by lines)
990. **Pop (line by line)** (`pop-lines`, by lines)
991. **Unfold** (`unfold`, by the whole title)
992. **Tilt in** (`tilt-in`, by the whole title)
993. **Shake in** (`shake-in`, by the whole title)
994. **Heartbeat** (`heartbeat`, by the whole title)
995. **Stamp (slams in)** (`stamp`, by the whole title)
996. **Float up (slow)** (`float-up`, by the whole title)
997. **Zoom blur in** (`zoom-blur`, by the whole title)
998. **Slide in from below** (`slide-up`, by the whole title)
999. **Slide in from above** (`slide-down`, by the whole title)
1000. **Letters from the left** (`letters-left`, by chars)
1001. **Letters from below** (`letters-up`, by chars)
1002. **Letters pop and spin** (`letters-pop-spin`, by chars)
1003. **Letters stretch in** (`letters-stretch`, by chars)
1004. **Words from the left** (`words-left`, by words)
1005. **Words from below (big move)** (`words-up`, by words)
1006. **Words zoom and blur in** (`words-blur-zoom`, by words)
1007. **Words elastic** (`words-elastic`, by words)
1008. **Lines rise and sharpen** (`lines-rise-blur`, by lines)
1009. **Lines drop and bounce** (`lines-drop-bounce`, by lines)
1010. **Spin and zoom (whole)** (`spin-zoom`, by the whole title)
1011. **Wipe reveal (fast)** (`wipe-reveal-fast`, by the whole title)
1012. **Slow fade** (`fade-slow`, by the whole title)
1013. **Drift in from the left (slow)** (`drift-right`, by the whole title)
1014. **Rise and grow** (`rise-scale`, by the whole title)
1015. **Heavy glitch** (`glitch-heavy`, by the whole title)
1016. **Neon switch-on (whole)** (`neon-on`, by the whole title)
1017. **Shrink in (from huge)** (`scale-down-in`, by the whole title)
1018. **Letters rise out of a blur** (`letters-rise-blur`, by chars)
1019. **Letters bounce in** (`letters-bounce`, by chars)
1020. **Letters spring up** (`letters-elastic`, by chars)
1021. **Letters appear at random** (`letters-random`, by chars)
1022. **Words pop and turn** (`words-pop-spin`, by words)
1023. **Words shrink into place** (`words-shrink`, by words)
1024. **Words swing in** (`words-swing`, by words)
1025. **Lines fade one by one** (`lines-fade`, by lines)
1026. **Lines slide in from the left** (`lines-slide-right`, by lines)
1027. **Flip in (turning)** (`flip-in-x`, by the whole title)
1028. **Flip in (tumbling)** (`flip-in-y`, by the whole title)
1029. **Drop and spin** (`drop-spin`, by the whole title)
1030. **Slide from the right with blur** (`slide-left-blur`, by the whole title)
1031. **Slide from the left with blur** (`slide-right-blur`, by the whole title)
1032. **Spaced letters close in, from a blur** (`tracking-blur`, by the whole title)
1033. **Zoom through (from the camera)** (`zoom-through`, by the whole title)
1034. **Slow rise** (`rise-slow`, by the whole title)
1035. **Pop (springy)** (`pop-elastic`, by the whole title)

## Lower thirds (36)
＋ › Lower third › name, `/lower-third Name\nRole <id>`, `video_edit {op:"add", kind:"lower"}`; two lines (name · role), each with its own accent and animation.
1036. **Gold bar** (`bar-gold`)
1037. **Ember bar** (`bar-ember`)
1038. **Violet bar** (`bar-violet`)
1039. **Dark box** (`box-dark`)
1040. **White box** (`box-white`)
1041. **Glass card** (`glass`)
1042. **Minimal** (`minimal`)
1043. **Minimal (right)** (`minimal-right`)
1044. **Neon** (`neon`)
1045. **News strap** (`news`)
1046. **Tech (mono)** (`tech`)
1047. **Underlined** (`underline`)
1048. **Stacked bold** (`stack`)
1049. **Centered** (`center`)
1050. **Top left tag** (`top-left`)
1051. **Forgeheart** (`forge`)
1052. **Cyan bar** (`bar-cyan`)
1053. **Pink bar** (`bar-pink`)
1054. **Gold box** (`box-gold`)
1055. **Violet box** (`box-violet`)
1056. **Serif (editorial)** (`serif`)
1057. **Spaced capitals** (`caps-tracking`)
1058. **Typewriter** (`typewriter`)
1059. **Glitch** (`glitch`)
1060. **Word by word** (`words`)
1061. **Box (right)** (`right-box`)
1062. **Green bar** (`bar-green`)
1063. **White bar** (`bar-white`)
1064. **Ember box** (`box-ember`)
1065. **Cyan box** (`box-cyan`)
1066. **Dark glass card** (`glass-dark`)
1067. **News strap (blue)** (`news-blue`)
1068. **Sport (italic, gold box)** (`sport`)
1069. **Outlined name** (`outline`)
1070. **Neon (violet)** (`neon-violet`)
1071. **Top right tag** (`top-right`)

## Shapes and motion graphics (70)
＋ › Shape or graphic › (group) › name, `/add-shape <id> [s] [anim] [#color]`, `video_edit {op:"add", kind:"shape"}`; right-click › Shape / Shape color. Drawn by the title renderer, so they take the title animations and render exactly as previewed.
1072. **Box** · Basic (`box`)
1073. **Box outline** · Basic (`box-outline`)
1074. **Rounded box** · Basic (`rounded`)
1075. **Rounded outline** · Basic (`rounded-outline`)
1076. **Pill** · Basic (`pill`)
1077. **Pill outline** · Basic (`pill-outline`)
1078. **Circle** · Basic (`circle`)
1079. **Ring** · Basic (`ring`)
1080. **Triangle** · Basic (`triangle`)
1081. **Diamond** · Basic (`diamond`)
1082. **Hexagon** · Basic (`hexagon`)
1083. **Hexagon outline** · Basic (`hexagon-outline`)
1084. **Star** · Basic (`star`)
1085. **Starburst** · Basic (`burst`)
1086. **Plus** · Basic (`plus`)
1087. **Cross (×)** · Basic (`cross`)
1088. **Check mark** · Basic (`check`)
1089. **Heart** · Basic (`heart`)
1090. **Line** · Lines and arrows (`line`)
1091. **Vertical line** · Lines and arrows (`line-v`)
1092. **Underline** · Lines and arrows (`underline`)
1093. **Double line** · Lines and arrows (`double-line`)
1094. **Dashed line** · Lines and arrows (`dashed-line`)
1095. **Arrow right** · Lines and arrows (`arrow-right`)
1096. **Arrow left** · Lines and arrows (`arrow-left`)
1097. **Arrow up** · Lines and arrows (`arrow-up`)
1098. **Arrow down** · Lines and arrows (`arrow-down`)
1099. **Arrow up right** · Lines and arrows (`arrow-up-right`)
1100. **Arrow down right** · Lines and arrows (`arrow-down-right`)
1101. **Chevrons »** · Lines and arrows (`chevrons`)
1102. **Chevrons up (swipe up)** · Lines and arrows (`chevrons-up`)
1103. **Viewfinder corners** · Frames (`corners`)
1104. **Viewfinder corners (wide)** · Frames (`corners-wide`)
1105. **Frame border** · Frames (`border`)
1106. **Gold frame border** · Frames (`border-gold`)
1107. **Letterbox bars (2.39)** · Frames (`letterbox`)
1108. **Thin letterbox bars** · Frames (`letterbox-thin`)
1109. **Split divider** · Frames (`divider`)
1110. **Recording frame (corners + red dot)** · Frames (`rec`)
1111. **Rule-of-thirds grid** · Frames (`thirds`)
1112. **Highlight circle** · Callouts (`highlight-circle`)
1113. **Spotlight (dark around a circle)** · Callouts (`spotlight`)
1114. **Map pin** · Callouts (`pin`)
1115. **Speech bubble** · Callouts (`bubble`)
1116. **Badge (starburst, gold)** · Callouts (`badge`)
1117. **Dot** · Callouts (`dot`)
1118. **Tag (outlined pill)** · Callouts (`tag`)
1119. **Gradient (sunset)** · Backgrounds (`grad-sunset`)
1120. **Gradient (ocean)** · Backgrounds (`grad-ocean`)
1121. **Gradient (forge)** · Backgrounds (`grad-forge`)
1122. **Gradient (night)** · Backgrounds (`grad-night`)
1123. **Gradient (mint)** · Backgrounds (`grad-mint`)
1124. **Gradient (rose)** · Backgrounds (`grad-rose`)
1125. **Dark fade at the bottom (caption backing)** · Backgrounds (`fade-bottom`)
1126. **Dark fade at the top** · Backgrounds (`fade-top`)
1127. **Scrim (dims the picture)** · Backgrounds (`scrim`)
1128. **Dark vignette** · Backgrounds (`vignette-dark`)
1129. **Center glow (white)** · Backgrounds (`glow-white`)
1130. **Center glow (ember)** · Backgrounds (`glow-ember`)
1131. **Center glow (violet)** · Backgrounds (`glow-violet`)
1132. **Center glow (cyan)** · Backgrounds (`glow-cyan`)
1133. **Progress bar (fills over its length)** · Motion graphics (`progress`)
1134. **Progress ring** · Motion graphics (`progress-ring`)
1135. **Countdown ring (empties)** · Motion graphics (`countdown-ring`)
1136. **Loading dots** · Motion graphics (`loading-dots`)
1137. **Light rays (turning)** · Motion graphics (`rays`)
1138. **Scan line (sweeps down)** · Motion graphics (`scan-line`)
1139. **Pulse rings** · Motion graphics (`pulse-ring`)
1140. **Orbit (dot circling)** · Motion graphics (`orbit`)
1141. **Equalizer bars** · Motion graphics (`equalizer`)

## Motion presets (keyframes made for you) (90)
Right-click › Motion › (group), the inspector's Motion, `/edit-motion <id>`, `video_edit {op:"motion"}`. They write ordinary keyframes you can then change.
1142. **Ken Burns in** · Slow (`ken-burns-in`)
1143. **Ken Burns out** · Slow (`ken-burns-out`)
1144. **Slow push in** · Slow (`push-in`)
1145. **Slow pull out** · Slow (`pull-out`)
1146. **Pan left** · Slow (`pan-left`)
1147. **Pan right** · Slow (`pan-right`)
1148. **Pan up** · Slow (`pan-up`)
1149. **Pan down** · Slow (`pan-down`)
1150. **Drift** · Slow (`drift`)
1151. **Punch in** · Hits (`punch-in`)
1152. **Punch out** · Hits (`punch-out`)
1153. **Bump** · Hits (`beat-bump`)
1154. **Camera shake** · Hits (`shake`)
1155. **Hard shake** · Hits (`shake-hard`)
1156. **Flash in** · Hits (`flash-in`)
1157. **Pop in** · Enter (`pop-in`)
1158. **Fade in** · Enter (`fade-in`)
1159. **Fade out** · Exit (`fade-out`)
1160. **Slide in from the left** · Enter (`slide-in-left`)
1161. **Slide in from the right** · Enter (`slide-in-right`)
1162. **Slide in from the top** · Enter (`slide-in-top`)
1163. **Slide in from the bottom** · Enter (`slide-in-bottom`)
1164. **Slide out to the left** · Exit (`slide-out-left`)
1165. **Slide out to the right** · Exit (`slide-out-right`)
1166. **Spin in** · Enter (`spin-in`)
1167. **Zoom away** · Exit (`zoom-out-exit`)
1168. **Tilt** · Slow (`tilt`)
1169. **Float** · Slow (`float`)
1170. **Logo bug (top right)** · Layout (`logo-tr`)
1171. **Logo bug (top left)** · Layout (`logo-tl`)
1172. **Logo bug (bottom right)** · Layout (`logo-br`)
1173. **Logo bug (bottom left)** · Layout (`logo-bl`)
1174. **Picture in picture (top right)** · Layout (`pip-tr`)
1175. **Picture in picture (bottom left)** · Layout (`pip-bl`)
1176. **Split screen: left half** · Layout (`split-left`)
1177. **Split screen: right half** · Layout (`split-right`)
1178. **Split screen: top half** · Layout (`split-top`)
1179. **Split screen: bottom half** · Layout (`split-bottom`)
1180. **Crash zoom** · Hits (`crash-zoom`)
1181. **Fast zoom in** · Hits (`zoom-in-fast`)
1182. **Fast zoom out** · Hits (`zoom-out-fast`)
1183. **Whip in from the left** · Enter (`whip-in-left`)
1184. **Whip in from the right** · Enter (`whip-in-right`)
1185. **Drop in (bounce)** · Enter (`drop-in`)
1186. **Rise in** · Enter (`rise-in`)
1187. **Dolly left (slow push + pan)** · Slow (`dolly-left`)
1188. **Dolly right** · Slow (`dolly-right`)
1189. **Orbit (small circle)** · Slow (`orbit`)
1190. **Breathe (slow scale pulse)** · Slow (`breathe`)
1191. **Sway** · Slow (`sway`)
1192. **No motion (reset)** · Layout (`reset`)
1193. **Ken Burns toward the top left** · Slow (`kb-tl`)
1194. **Diagonal pan to the top left** · Slow (`pan-tl`)
1195. **Small picture in picture (top left)** · Layout (`pip-small-tl`)
1196. **Picture in picture flies in (top left)** · Layout (`pip-in-tl`)
1197. **Ken Burns toward the top right** · Slow (`kb-tr`)
1198. **Diagonal pan to the top right** · Slow (`pan-tr`)
1199. **Small picture in picture (top right)** · Layout (`pip-small-tr`)
1200. **Picture in picture flies in (top right)** · Layout (`pip-in-tr`)
1201. **Ken Burns toward the bottom left** · Slow (`kb-bl`)
1202. **Diagonal pan to the bottom left** · Slow (`pan-bl`)
1203. **Small picture in picture (bottom left)** · Layout (`pip-small-bl`)
1204. **Picture in picture flies in (bottom left)** · Layout (`pip-in-bl`)
1205. **Ken Burns toward the bottom right** · Slow (`kb-br`)
1206. **Diagonal pan to the bottom right** · Slow (`pan-br`)
1207. **Small picture in picture (bottom right)** · Layout (`pip-small-br`)
1208. **Picture in picture flies in (bottom right)** · Layout (`pip-in-br`)
1209. **Thirds: left third** · Layout (`thirds-left`)
1210. **Thirds: middle third** · Layout (`thirds-center`)
1211. **Thirds: right third** · Layout (`thirds-right`)
1212. **Card (80 %, centered)** · Layout (`card`)
1213. **Tilted card** · Layout (`tilted-card`)
1214. **Pulse on 120 bpm** · Hits (`pulse-beat`)
1215. **Flicker** · Hits (`flicker`)
1216. **Fade in and out** · Enter (`fade-in-out`)
1217. **Ken Burns toward the top** · Slow (`kb-top`)
1218. **Ken Burns toward the bottom** · Slow (`kb-bottom`)
1219. **Ken Burns toward the left** · Slow (`kb-left`)
1220. **Ken Burns toward the right** · Slow (`kb-right`)
1221. **Slow full turn** · Slow (`spin-slow`)
1222. **Tilted left** · Layout (`tilt-left`)
1223. **Tilted right** · Layout (`tilt-right`)
1224. **Zoom then hold** · Slow (`zoom-hold`)
1225. **Fade and settle in** · Enter (`fade-scale-in`)
1226. **Pop out (exit)** · Exit (`pop-out-exit`)
1227. **Slide out to the top** · Exit (`slide-out-top`)
1228. **Slide out to the bottom** · Exit (`slide-out-bottom`)
1229. **Fade and grow out (exit)** · Exit (`blur-scale-exit`)
1230. **Soft handheld shake** · Energy (`shake-soft`)
1231. **Wobble (rotation)** · Energy (`wobble`)

## Speed ramps (22)
Right-click › Speed › Speed ramp, the inspector's Ramp, `/speed-ramp <id>`, `video_edit {op:"ramp"}` (the clip becomes steps at those speeds; sound keeps its pitch).
1232. **Hero slow-mo (1 → 0.3 → 1)** (`slow-mid`: 1 → 0.7 → 0.4 → 0.3 → 0.3 → 0.4 → 0.7 → 1×)
1233. **Ease into slow-mo** (`slow-in`: 1 → 0.8 → 0.6 → 0.45 → 0.35 → 0.3×)
1234. **Slow-mo back to speed** (`slow-out`: 0.3 → 0.35 → 0.45 → 0.6 → 0.8 → 1×)
1235. **Speed burst (1 → 3 → 1)** (`burst`: 1 → 1.5 → 2.5 → 3 → 2.5 → 1.5 → 1×)
1236. **Ramp up (to 3×)** (`ramp-up`: 1 → 1.3 → 1.7 → 2.2 → 2.7 → 3×)
1237. **Ramp down (from 3×)** (`ramp-down`: 3 → 2.7 → 2.2 → 1.7 → 1.3 → 1×)
1238. **Flash forward (4× then normal)** (`flash-forward`: 4 → 4 → 3 → 2 → 1 → 1×)
1239. **Bullet time (0.25× center)** (`bullet`: 1 → 0.6 → 0.25 → 0.25 → 0.25 → 0.6 → 1×)
1240. **Montage (2×)** (`montage`: 2×)
1241. **Half speed** (`half`: 0.5×)
1242. **Double speed** (`double`: 2×)
1243. **Pulse (fast · slow · fast)** (`pulse`: 2 → 0.5 → 2 → 0.5 → 2×)
1244. **Stutter** (`stutter`: 1 → 0.25 → 1 → 0.25 → 1 → 0.25×)
1245. **Drop hit (fast, freeze-ish, fast)** (`drop-hit`: 2.5 → 2 → 0.3 → 0.25 → 1.5 → 2.5×)
1246. **Quarter speed** (`quarter`: 0.25×)
1247. **Triple speed** (`triple`: 3×)
1248. **Four times** (`quadruple`: 4×)
1249. **Wind up (slow → fast)** (`wind-up`: 0.5 → 0.8 → 1.5 → 3×)
1250. **Brake (fast → slow)** (`brake`: 3 → 1.5 → 0.6 → 0.3×)
1251. **Surge (1 → 4 → 1)** (`surge`: 1 → 2 → 4 → 2 → 1×)
1252. **Dip (fast, slow, fast)** (`dip`: 2 → 0.3 → 2×)
1253. **Heartbeat** (`heartbeat`: 1.5 → 0.4 → 1.5 → 0.4×)

## Blend modes (layers) (13)
Right-click a layer › Blend, the inspector's Blend, `/blend-mode <id>`; preview (canvas composite) and render (ffmpeg blend over a neutral pad) match.
1254. **Normal** (`normal`)
1255. **Screen** (`screen`)
1256. **Add (lighter)** (`add`)
1257. **Lighten** (`lighten`)
1258. **Multiply** (`multiply`)
1259. **Darken** (`darken`)
1260. **Overlay** (`overlay`)
1261. **Soft light** (`soft-light`)
1262. **Hard light** (`hard-light`)
1263. **Difference** (`difference`)
1264. **Exclusion** (`exclusion`)
1265. **Color dodge** (`color-dodge`)
1266. **Color burn** (`color-burn`)

## Sequence formats (20)
The format chip (9:16 · 30 fps) in the editor's header, `/edit-format <id|WxH|source>`, `video_edit {op:"format"}`; the frame takes that shape, safe zones follow.
1267. **Vertical 9:16 (Reels · TikTok · Shorts)** (1080×1920)
1268. **Portrait 4:5 (feeds)** (1080×1350)
1269. **Square 1:1** (1080×1080)
1270. **Landscape 16:9 (YouTube)** (1920×1080)
1271. **16:9 4K** (3840×2160)
1272. **16:9 720p (light)** (1280×720)
1273. **9:16 720p (light)** (720×1280)
1274. **Pin 2:3** (1000×1500)
1275. **Portrait 3:4** (1080×1440)
1276. **Classic 4:3** (1440×1080)
1277. **Cinema 21:9** (2560×1080)
1278. **Scope 2.39:1** (1920×804)
1279. **Flat 1.85:1** (1998×1080)
1280. **Story 9:16 with safe margins** (1080×1920)
1281. **9:16 4K** (2160×3840)
1282. **16:9 1440p** (2560×1440)
1283. **1:1 720 (light)** (720×720)
1284. **4:5 720 (light)** (720×900)
1285. **Wide 2:1** (2000×1000)
1286. **Classic 5:4** (1350×1080)

## Frame rates (13)
Format chip › Frame rate, `/edit-fps <rate>`; timecode, stepping and the render follow.
1287. **12 fps**
1288. **15 fps**
1289. **23.976 fps**
1290. **24 fps**
1291. **25 fps**
1292. **29.97 fps**
1293. **30 fps**
1294. **48 fps**
1295. **50 fps**
1296. **59.94 fps**
1297. **60 fps**
1298. **100 fps**
1299. **120 fps**

## More export presets (34)
⇪ Export › Socials / Small files / Loops and web / Masters / Stills and sound, `/edit-render <id>`, `video_edit {op:"render", preset}` (on top of the social, GIF, WebM and ProRes presets the cut already had).
1300. **Instagram Story** (1080×1920)
1301. **Facebook feed 4:5** (1080×1350)
1302. **Facebook square** (1080×1080)
1303. **LinkedIn 16:9** (1920×1080)
1304. **LinkedIn 4:5** (1080×1350)
1305. **X / Twitter square** (1080×1080)
1306. **Threads 4:5** (1080×1350)
1307. **WhatsApp status (small)** (720×1280)
1308. **Discord (under 10 MB)** (under 9.5 MB)
1309. **Email / chat (under 25 MB)** (under 24 MB)
1310. **Tiny (under 8 MB)** (under 7.5 MB)
1311. **Reels 60 fps** (1080×1920 · 60 fps)
1312. **TikTok 60 fps** (1080×1920 · 60 fps)
1313. **YouTube 1080p 60 fps** (1920×1080 · 60 fps)
1314. **Draft (fast 720p)**
1315. **High quality, same size**
1316. **H.265 / HEVC (smaller files)**
1317. **GIF small (480 wide, 12 fps)**
1318. **GIF high (960 wide, 20 fps)**
1319. **WebM VP9 (website loop, no sound)**
1320. **Audio only (WAV)**
1321. **Audio only (MP3)**
1322. **Audio only (AAC .m4a)**
1323. **JPEG stills (every frame)**
1324. **TikTok high quality** (1080×1920)
1325. **Reels high quality** (1080×1920)
1326. **Shorts 60 fps high quality** (1080×1920 · 60 fps)
1327. **Bluesky (16:9, small)** (1280×720)
1328. **Mastodon (720p, small)**
1329. **Telegram (720p)**
1330. **Slack / Discord preview (under 10 MB)** (under 9.5 MB)
1331. **Messages (under 100 MB, 1080p)** (under 95 MB)
1332. **Twitch / stream clip (1080p 60)** (1920×1080 · 60 fps)
1333. **Website hero (720p H.264, light)** (1280×720)

## Sequence templates (48)
⋯ › Template › name › "Start from it" or "Lay its titles and markers over my clips", `/edit-template <id> [new|keep]`, `video_edit {op:"template"}`. Slots (＋ gaps) take your videos: drop on them, double-click them or `/fill-slot <n> <video>`; slots stretch so the edit keeps the template's length.
1334. **Social intro 15 s (9:16)** (`social-intro-15`, 9:16, 15 s) — Six slots, hook title, three feature captions, end card
1335. **App teaser 15 s (motion design)** (`app-teaser-15`, 9:16, 15 s) — Eight quick slots on 128 bpm half bars, one word each
1336. **Reel 30 s (9:16)** (`reel-30`, 9:16, 30 s)
1337. **TikTok hook 7 s** (`tiktok-hook-7`, 9:16, 7 s)
1338. **Shorts 20 s** (`shorts-20`, 9:16, 20 s)
1339. **YouTube intro 5 s (16:9)** (`yt-intro-5`, 16:9, 5 s)
1340. **App promo 30 s (16:9)** (`promo-30-169`, 16:9, 30 s)
1341. **Square loop 6 s** (`square-loop-6`, 1:1, 6 s)
1342. **Feed post 15 s (4:5)** (`feed-15-45`, 4:5, 15 s)
1343. **Story 3 × 5 s** (`story-3x5`, 9:16, 15 s)
1344. **Logo sting 3 s** (`logo-sting-3`, 16:9, 3 s)
1345. **Countdown 3-2-1** (`countdown`, 9:16, 4 s)
1346. **Before / after split** (`before-after`, 9:16, 8 s)
1347. **Feature list (4 beats)** (`features-4`, 9:16, 12 s)
1348. **Beat montage (16 cuts at 120 bpm)** (`beat-montage`, 9:16, 8 s)
1349. **Quote card 6 s** (`quote-card`, 1:1, 6 s)
1350. **Interview with lower third** (`lower-third-demo`, 16:9, 10 s)
1351. **Trailer 30 s (dark, dips)** (`trailer-30`, 16:9, 30 s)
1352. **Product reveal 10 s** (`product-reveal`, 9:16, 10 s)
1353. **Photo slideshow (8 × 2 s, Ken Burns)** (`slideshow`, 16:9, 16 s)
1354. **Tutorial steps (16:9)** (`tutorial`, 16:9, 24 s)
1355. **Meme (top / bottom text)** (`meme`, 1:1, 6 s)
1356. **Music visual 30 s (Lab recording)** (`music-visual-30`, 9:16, 30 s)
1357. **Event promo 15 s** (`event`, 4:5, 15 s)
1358. **Hearth intro 20 s (the app, in 9:16)** (`hearth-intro-20`, 9:16, 20 s) — Eight quick slots with a word each, gold end card
1359. **Logo reveal 5 s (rays and glow)** (`logo-reveal-5`, 9:16, 5 s) — One slot under a turning light burst; the name zooms through
1360. **Countdown intro 6 s (3 · 2 · 1)** (`countdown-6`, 9:16, 6 s) — Numbers with emptying rings, then a stamped word
1361. **Story with a progress bar 15 s** (`progress-story-15`, 9:16, 15 s) — A bar fills across the whole video; one step per slot
1362. **Feature callouts 12 s** (`feature-callouts-12`, 9:16, 12 s) — A circle, an arrow and a caption point at something in each slot
1363. **Camera viewfinder intro 10 s (16:9)** (`viewfinder-10`, 16:9, 10 s) — Corners, a blinking red dot and a mono tag over three slots
1364. **Kinetic words 8 s (no footage needed)** (`kinetic-words-8`, 9:16, 8 s) — Words stamp one by one on a gradient; nothing to film
1365. **End card 5 s (follow)** (`end-card-5`, 9:16, 5 s) — Dimmed last shot, a call to action and swipe chevrons
1366. **Square promo 10 s (1:1)** (`square-promo-10`, 1:1, 10 s) — Gold frame, a stamped NEW, a spinning badge at the end
1367. **Carousel teaser 8 s (4:5)** (`carousel-teaser`, 4:5, 8 s)
1368. **Quote reel 10 s** (`quote-reel`, 9:16, 10 s)
1369. **Three features (16:9, 15 s)** (`three-features-169`, 16:9, 15 s)
1370. **Podcast clip 30 s (9:16, captions)** (`podcast-clip`, 9:16, 30 s)
1371. **Travel montage 15 s** (`travel-montage`, 9:16, 15 s)
1372. **Recipe / how-to 30 s** (`recipe-steps`, 4:5, 30 s)
1373. **Event recap 20 s** (`event-recap`, 16:9, 20 s)
1374. **Announcement 8 s** (`announcement`, 1:1, 8 s)
1375. **Year in review 30 s** (`year-review`, 9:16, 30 s)
1376. **Gaming highlight 15 s** (`gaming-highlight`, 16:9, 15 s)
1377. **Dark teaser 12 s** (`teaser-dark`, 9:16, 12 s)
1378. **Blank 9:16 (10 s)** (`blank-916`, 9:16, 10 s)
1379. **Blank 16:9 (10 s)** (`blank-169`, 16:9, 10 s)
1380. **Blank 1:1 (10 s)** (`blank-11`, 1:1, 10 s)
1381. **Blank 4:5 (10 s)** (`blank-45`, 4:5, 10 s)

## Marker colors (8)
Right-click a marker › Color, `/marker-color <name>`, `video_edit {op:"marker", color}`.
1382. **gold** (#ffd75e)
1383. **red** (#ff4d4d)
1384. **orange** (#ff8c42)
1385. **green** (#4fd18b)
1386. **blue** (#6bc7ff)
1387. **violet** (#9b8bff)
1388. **pink** (#ff6b9a)
1389. **white** (#ffffff)

**Total: 1389 upgrades.**

## How it's built
- **One editing model** (`tools/cut-data.js`, `CutData`, loads in Node): the round-6 clip list stays the main track
  (V1) and grew tracks (`edit.tracks`: video / text / audio with items at program times), transitions that overlap
  the cut like xfade, keyframes `{ prop: [{ t, v, ease }] }`, looks, effects, sound effects, reverse, ramps,
  roll / slip / slide / overwrite / lift / extract / fill-gap, sequences (`edit.seq`, `seq:<name>` edits of their
  own), captions in and out. Plain cut-only edits are untouched (same player, same ffmpeg graph, same tests).
- **Presets** (`tools/cut-presets.js`, `EditFX`, loads in Node): every family above, each with both halves — the
  canvas / SVG preview and the ffmpeg filters — so preview and render agree.
- **Render** (`tools/cut-ffmpeg.js`, `CutFF`): the full filter graph for rich edits (xfade / acrossfade fold,
  per-clip layer chains with eased keyframe expressions, overlay / blend over neutral pads, title PNG sequences,
  amix of audio tracks, in–out, the export presets). `aemain.js` gained `video:rmtemp` (clears the title frames)
  and `preload.js` one line for it.
- **Preview** (`tools/video-comp.js`, `VideoComp`): the compositor with its decoder pool, exact seeks checked by
  requestVideoFrameCallback, playback sync, frame images for the agents, title frames for renders, and the
  MediaRecorder fallback. Titles: `tools/video-titles.js` (`VideoTitles`).
- **UI** (`tools/video-cut.js`, `VideoCut`): lanes, zoom, menus, keys, the actions; the inspector is
  `tools/video-inspector.js`. Styles at the end of `tools/video.css`.
- **Chats**: `tools/cut-edit-cmds.js` (commands), `tools/video-edit-tools.js` (the MCP handler, routed by
  HubBridge's longest prefix `video_edit`), `mcp/video-mcp.js` (3 tool definitions), `mcp/hearth-map.js` (topic
  `editor`). Small hooks: `tools/review.js` (time box focus, timecode parsing at the edit's fps),
  `tools/cut-cmds.js` (commands work in a sequence with no video open), `tools/three-media.js` (the Lab's
  waveform menu: editor / overlay / music).

## Tested
- `node dev/editor-test.js <dir>` (after `node dev/make-editor-videos.js <dir>`, clips whose frames carry their
  own number as a pixel code): 70 checks — model operations, presets unique and valid, and real ffmpeg renders
  read back frame by frame: a dissolve (exact frames on both sides), every transition (131), every look (197),
  every clip effect (56), every sound effect (39, length kept), a keyframed rotating PIP at its exact source
  frame, reverse, a 9:16 sequence from 16:9 footage, a silent clip + gap + still, square / GIF / WAV /
  size-targeted / stills exports, in–out of a rich edit.
- `node dev/smoke.js --lib dev/checks/journey-lib.js --lib dev/editor-frames.js --script dev/checks/editor.js`:
  52 steps with real keys and mouse — ✂ / E, → ×45 = frame 45 (counter, requestVideoFrameCallback and the pixels on
  screen agree), Shift+→, typed timecode, /goto-frame, J K L stop on a whole frame, S, B razor click, undo / redo,
  Shift+drag roll, /slip, /slide, right-click › Transition in › Dissolve › Cross dissolve, the compositor showing the
  exact source frame after the dissolve, ＋ › library › overlay, PIP at its exact frame, still / music / title /
  lower third, inspector (style, ◆ auto-key, curve), right-click › Look, /adjust, markers with notes, zoom / fit,
  snapping, smooth playback (one compositor playhead animation, few DOM writes), pause on an exact frame, export
  read back frame by frame (overlay and after the transition exact), square export, 24 fps silent and 25 fps
  footage stepping exactly, a template sequence filled and rendered (titles drawn as frames, cleaned up),
  0 duplicate commands.
- `dev/checks/editor-more.js`: 33 steps — effects and sound effects, SRT import / export, safe check, match look
  (nothing added to the edit), labels, clip off, swap, extend edit, clip duration, fit to fill, fill the frame,
  beat markers from music, nest (ffmpeg) and un-nest, poster frame, the real-time WebM recorder, the Lab's
  snapshots (save, hold a frame, back), markers at cuts, EDL export, lane height, solo sound, a shape added by
  command, seen in the preview (its pixels checked) and in video_edit_read, and rendered; the kinetic-words template (no footage) rendered to 8 s; /lab-to-editor,
  /lab-overlay, /lab-music.
- `dev/checks/editor-mcp.js` (`--fake-engines`): the Video Director calls video_edit_read, video_edit (split,
  transition, title, keyframe, look, effect, command, marker, speed, undo, an unknown op) and video_edit_frame
  through the real MCP server; all 13 results check out. `node dev/editor-mcp-test.js`: the tools are listed, lean
  (≈350 tokens for the three), say references are a vibe, hearth_help editor answers locally.
- Unchanged and still green: `dev/checks/cut.js` (the round-6 clip track, 57 steps), `node dev/cut-test.js`
  (51), `sh dev/journeys.sh video`, `dev/checks/nodes-video.js`, `node dev/director-mcp-test.js`,
  `dev/checks/qa-commands.js` (0 duplicates, 732 commands).

## Not done / notes
- Sound effects are heard in the render only (the preview plays the clean sound: file:// media can't go through
  Web Audio here).
- Reverse plays in the preview by stepping frames (smooth enough to judge, not real-time perfect).
- Preview transitions are canvas look-alikes of ffmpeg's; the render is the reference.
- The real-time WebM (no ffmpeg) has no duration in its header (a browser limitation); players still play it.
- Compound clips are rendered files (with the parts kept to un-nest), not live nested timelines.
- The list is 1389 upgrades, short of the ~1600 asked. Every line is a working preset or feature: each preset
  family is checked for unique ids, and the test renders every transition, look, clip effect and sound effect.
  Padding the list with near-duplicates wasn't worth it.
- Shapes are drawn on canvas (by the title renderer), not as vector layers: they scale with the frame, but you
  can't edit their points.
