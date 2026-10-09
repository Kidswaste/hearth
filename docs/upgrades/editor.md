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
32. **Split everything at the playhead: Shift+S** (`/split-all`): the main track and every unlocked track.
33. **Razor: B** (`/razor`): click any clip or layer to cut it where you click (a red line follows the pointer; Esc ends).
34. **Roll: Shift+drag a cut** — one side longer, the other shorter, total unchanged (`/roll <frames>`).
35. **Slip: Ctrl/⌘+drag a clip** — same place and length, a different part of the source; the picture follows (`/slip <frames>`, Alt+, / .).
36. **Slide: Shift+drag a clip** — it keeps its content, its neighbours trim (`/slide <frames>`, Alt+← / →).
37. **Insert** a library video at the playhead (everything after moves right): ＋ › From the library, `/insert-clip`.
38. **Overwrite** at the playhead (nothing moves): ＋ › From the library, `/overwrite-clip`.
39. **Lift** the in–out range (a gap stays): ⋯ › Range, `/lift`.
40. **Extract** the in–out range (closes up): ⋯ › Range, `/extract`.
41. **Extend edit: Shift+E** (`/extend-edit`): the nearest cut rolls to the playhead.
42. **Nudge the selection one frame: Alt+← / →** (Shift: 10): layers move, main-track clips slide.
43. **Move a layer to the track above / below: Alt+↑ / ↓** (or drag it there).
44. **Drag layers** along their lane (snapping to cuts, other layers, markers, the playhead) and **drag their edges** to trim.
45. **Snapping on / off: N** (`/snap`); off, everything still lands on frames.
46. **Copy / paste clips and layers: Ctrl/⌘+C / V** (`/copy-clips`, `/paste-clips`); without a selection Ctrl/⌘+C still copies the frame.
47. **Select everything: Ctrl/⌘+A**; Shift+click adds to the selection; `/select 3 V2.1 all none`.
48. **Delete layers with Del** (main-track clips keep Del = gap, Shift+Del = ripple).
49. **Q / W trim layers too** (the selected layer's start / end to the playhead).
50. **Swap with the next clip** (right-click › Clip, `/swap-next`).
51. **Shuffle the clips** for a montage idea (⋯, `/shuffle-clips`; undo puts them back).
52. **Fit to fill**: a gap and the clip after it — the clip changes speed to cover both (right-click the gap › Clip, `/fit-to-fill`).
53. **Make a clip last N seconds** (`/clip-duration 1.5`): videos change speed, stills / titles change length.
54. **Move a main-track clip up to an overlay track** (right-click › Edit, `/to-overlay`) and **an overlay down to the main track** (`/to-main`).
55. **Nest (compound clip)**: select clips next to each other › right-click › Edit › Nest — ffmpeg renders them into one clip that keeps its parts; **Un-nest** gets them back (`/nest`, `/unnest`).
56. **Match frame** (right-click › Clip, `/match-frame`): the source of the picture under the playhead opens in Review on the same frame.
57. **Clip label colors** (8, right-click › Clip › Label color, `/clip-label`).
58. **Rename a clip** (right-click › Clip, `/clip-rename`).
59. **Turn a clip off** (hidden and silent, kept in place; right-click › Clip, `/clip-off`).
60. **In–out = the selection** (right-click › Clip, `/range-selection`): render or loop just those clips.
61. **Every change is one undo step** (⌘/Ctrl+Z, Shift+⌘/Ctrl+Z), sliders included (one step when you let go).
62. **After a menu pick the keys keep working** (the focus goes back to the editor).

## Layers and tracks
63. **Overlay video tracks** (V2, V3…): picture in picture, split screens, logos, B-roll over A-roll; a layer goes on the first free track, or a new one.
64. **Text tracks** for titles, lower thirds and captions.
65. **Audio tracks** for music and sound (mixed under everything, each with its volume, fades and sound effects).
66. **Add a track** of each kind (right-click a lane, ＋ › Empty track, `/track-add video|text|audio`).
67. **Hide, mute, lock, rename, delete a track** (right-click its label, Alt switches, `/track V2 hide|mute|lock|rename|delete`).
68. **Stills as clips or layers**: PNG / JPEG / WebP / GIF on the main track or above (`/add-image <file> [s] [main]`).
69. **Color mattes** on the main track (black, white, gold, ember, violet, night blue…) or as see-through color layers (`/add-color`).
70. **Lab recordings as clips**: ＋ › Lab recordings lists them; library cards and Lab files drop in like any video.
71. **Drop files on the editor**: videos on the main lane join the edit; on a track lane they land on that track where you dropped; pictures and sounds land on tracks; a video dropped on a template slot fills it.
72. **Overlays default to the full frame**; `/clip-scale`, `/clip-position`, motion presets or the inspector make them a PIP.
73. **Fill the frame** (cover, cropping the edges) instead of fitting (right-click › Clip, `/clip-fill`) — for 16:9 footage in a 9:16 edit.
74. **Reset transform** (right-click › Clip, `/reset-transform`).
75. **Music from the start** with a volume (`/add-music <file> [at] [60%]`), its waveform on the lane.

## Keyframes
76. **Keyframes on opacity, position x / y, scale, rotation and volume** for clips and layers.
77. **◆ in the inspector**: a key at the playhead (click again removes it); ‹ › jump to the previous / next key.
78. **Auto-key**: once a property has keys, changing it at another time adds a key (like After Effects).
79. **A curve per key** (57 easing curves, below): the inspector's Curve, `/ease`.
80. **Alt+K** keys position, scale, rotation and opacity at once.
81. **Shift+↑ / ↓** jumps between the selection's keyframes.
82. **`/keyframe <prop> [value] [curve]`**, **`/keyframes`** (list), **`/keyframes-clear [prop]`**.
83. **Copy / paste keyframes** between clips (right-click › Clip, `/copy-keyframes`, `/paste-keyframes`).
84. **Keyframes survive splits** (each half keeps the curve where it was).
85. **Rendered exactly**: the eased curve is sampled into ffmpeg expressions (scale, rotation, position, opacity, volume).

## Titles and captions
86. **Titles over the picture** on a text track (＋ › Title, Alt+T, `/add-title <text> [style] [anim] [s]`), with in and out animations.
87. **Lower thirds** (name · role) with accents and their own animations (＋ › Lower third, `/lower-third`).
88. **The inspector edits titles**: the words (multi-line), style or lower third, In / Out animation, animation length, size, color, place (top, upper, center, lower, bottom, left, right).
89. **Titles render as PNG frames drawn by the preview's code**, so the export matches what you saw; the frames are cleaned up afterwards.
90. **Long titles shrink to fit** 90 % of the frame width.
91. **Count-up numbers**, typing cursor, scramble, highlight bar, underline, box reveal, RGB glitch and mask animations are real per-letter / per-word / per-line effects.
92. **Captions from an SRT / VTT file** (⋯ › Captions, `/captions-import <file> [style]`): one title per caption on a "Captions" track.
93. **Save the titles as SRT** (⋯ › Captions, `/captions-export`) for the platforms' own captions.
94. **Safe-zone check** (⋯ › Check titles against the safe zone, `/safe-check [zone]`): which titles reach into TikTok / Reels / Shorts buttons and captions; the first one opens in the inspector.
95. **Main-track title cards keep working** (Shift+T) and can take styles and animations too.

## Transitions, looks, effects, sound
96. **Transitions overlap the cut like a real NLE** (the edit gets shorter by their length, like ffmpeg's xfade), shown as a bow-tie.
97. **91 transitions** (list below), each with a canvas preview and an ffmpeg render; custom ones (zoom, whip, spin, glitch, RGB split, dips to any color, light leaks, shapes) are ffmpeg expressions.
98. **Transition length** (right-click a bow-tie › Length, the inspector's slider, `/transition <id> <s>`).
99. **One transition on every cut** (⋯ › Transitions on every cut, `/transition <id> <s> all`), and remove them all.
100. **Shift+D**: a cross dissolve on the nearest cut (again: removes it).
101. **Looks**: 155 color grades with a strength, plus 17 adjustments and a color wash, all on clips and layers.
102. **Match a reference picture's look** (right-click › Look › Match a picture's look…, `/match-look <picture>`): exposure, contrast, saturation, warmth and tint move toward the picture, measured on the frame at the playhead — the reference gives the vibe, it never enters the edit.
103. **Copy / paste a look** between clips (right-click › Look).
104. **Clip effects** (32, stackable, each with an amount): mirror, symmetry, letterbox, borders, rounded corners, blur, glow, bloom, pixelate, posterize, ink, solarize, edges, emboss, RGB shift, scanlines, static, VHS, CRT, old film, hue cycle, strobe, pulse…
105. **Sound effects** (18): voice boost, bass, lo-fi, radio, telephone, echo, hall, pitch up / down, social loudness (−14 LUFS), compressor, wide, mono, duck… heard in the render.
106. **Blend modes** for layers (13): screen, add, multiply, overlay, soft light, difference…
107. **Reverse a clip**: R, right-click › Speed › Reverse, `/reverse` (played by stepping frames in the preview, rendered with ffmpeg reverse / areverse).
108. **Speed ramps** (14, below): the clip becomes steps at those speeds (`/speed-ramp`).
109. **Speed for layers and music too** (0.25–4×, pitch kept).
110. **Volume per clip / layer** (0–200 %, right-click › Volume, `/clip-volume`) and keyframable.
111. **Opacity, scale, rotation, position** from menus (right-click › Opacity), the inspector or `/clip-opacity`, `/clip-scale`, `/clip-rotate`, `/clip-position`.

## The inspector (double-click a clip, Enter, or right-click › Inspector)
112. **Opens over the notes column** on the selected clip, closes with Esc / ✕ or when the selection goes; the keys go back to the editor.
113. **Header**: name, track and place (V1 · clip 3, V2.1…), start → end timecodes, length in seconds and frames.
114. **Title section**: words, style / lower third, In, Out, anim length, size, color, place.
115. **Transform section**: opacity, scale, position X / Y, rotation sliders with ◆ keys and ‹ › key jumps, the curve, motion presets, "remove every keyframe".
116. **Clip section**: speed, reverse, speed ramp, volume with ◆, sound effects, mute, fade in / out, blend (layers), length (stills, colors), color (mattes).
117. **Color section**: look + strength, Adjust (16 sliders + color wash), reset.
118. **Effects section**: each effect with its amount and ✕, add one from a grouped list.
119. **Transition in section**: type and length.
120. **Sliders preview live while you drag** and make one undo step when you let go; double-click a slider resets it.
121. **The ◆ buttons light up** when the playhead sits on a key (and dim when the property has keys elsewhere).

## Markers, ranges, music
122. **Markers with notes** (`/marker-note`, Shift+M, right-click a marker › note): the chats read them in the edit.
123. **Marker colors** (8, below), **rename**, **go to**, **delete**, **in / out point at a marker**, **split at a marker** (right-click a marker).
124. **PgUp / PgDn** previous / next marker (`/marker-go next|prev|<n>|<name>`).
125. **Double-click the ruler** adds a marker there.
126. **Right-click the ruler**: marker, in, out, clear in–out, zoom (in / out / fit / one second of frames), snapping.
127. **Markers on the music** (⋯, `/beat-markers beat|bar|2bars|4bars`) from the song on an audio track (or the clips' own sound).
128. **Marker labels show on the ruler** when zoomed in.

## Sequences, formats, templates
129. **Sequences of their own** (not tied to one video): `/editor new <name> [9:16]`, `/editor open <name>`, `/editor list`, `/sequences`; templates start one.
130. **Formats** (14, below) and **frame rates** (9) from the format chip or `/edit-format`, `/edit-fps`; the preview frame takes the shape.
131. **"The video's own format"** goes back to the source's size.
132. **Safe zones from the format chip** (every vertical app, TikTok, Reels, Shorts, feed 4:5, YouTube).
133. **Templates** (40, below): start from one, or lay its titles and markers over your clips; slots stretch so the edit keeps its length.
134. **Fill a slot** by dropping a video on it, double-clicking it, right-click › Fill this slot, or `/fill-slot <n> <video>`.

## Preview and playback
135. **A compositor plays rich edits**: one canvas draws the main track (with its transition), every layer (transform, opacity, blend, look, effects) and the titles; hidden decoders feed it.
136. **Plain cut-only edits keep the gapless two-decoder player** (nothing changed there).
137. **Layers that start soon wait preloaded at their first frame**; decoders re-sync when they drift over three frames.
138. **Smooth**: the playhead glides on the compositor, one canvas draw per frame, no DOM writes while playing (measured).
139. **The preview renders at most 1280 px** on its long side (renders use the full size).
140. **Slip and roll drags show the picture live** as you move.
141. **The frame on screen takes the sequence's shape** (9:16, 4:5…), and goes back when you leave the editor.
142. **In–out plays as a loop** in rich edits too.
143. **Track mute / hide** apply in the preview and the render.

## Rendering
144. **⇪ Export renders rich edits with ffmpeg**: transitions (xfade + acrossfade), layers (overlay, blend modes), keyframes (expressions), looks and effects, titles (PNG frames), music and sound effects (amix), reverse, ramps, stills, colors, in–out.
145. **Export menu in groups**: Socials, Small files, Loops and web, Masters, Stills and sound (34 more presets, below).
146. **Size-targeted exports** (Discord, email, tiny…): the bitrate is computed from the length to stay under the limit.
147. **Audio-only exports** (WAV, MP3, AAC).
148. **JPEG stills** of every frame (next to the PNG option).
149. **Poster frame**: the frame at the playhead as a full-size PNG (`/poster-frame`).
150. **Record in real time** (⇪ › More, `/edit-render record`): a WebM of the edit or its in–out through the browser — used automatically when ffmpeg isn't installed.
151. **Sequences export next to their first source** (exports/), named after the sequence.
152. **`/edit-render [preset] [crop|fit|blur]`** renders any preset; it's also in Flow / chats.
153. **Checked**: lengths with ffprobe, frames read back from the rendered file (exact source frames under transitions and in a PIP), every transition, look, effect and sound effect rendered in tests.

## The Lab and Video Review
154. **Right-click the Lab's waveform › Edit it in the video editor** (`/lab-to-editor`): the Lab's video (or its loop / trim) opens as its own edit, frame by frame.
155. **› Overlay … on the open edit** (`/lab-overlay`): the Lab's video as a layer at the edit's playhead.
156. **› Use as the edit's music** (`/lab-music`): the Lab's song (or its loop / trim) on the editor's audio track.
157. **Video Review's time box gives the focus back** after Enter, so keys keep working.
158. **E is listed** in the keys button for Video Review; every editor key is listed under "Editor" while it's open.

## Chats: commands (area Video, `/help editor`)
159. `/editor [on|off|new <name> [format]|open <name>|list|keys]`
160. `/edit-list` — everything in the edit, with timecodes
161. `/edit-template <template> [new|keep]`
162. `/edit-format <9:16|4:5|1:1|16:9|WxH|source> [fps]`
163. `/edit-fps <rate>`
164. `/sequences`
165. `/track-add <video|text|audio>`
166. `/track <V2|T1|A1> <hide|show|mute|unmute|lock|unlock|delete|rename …>`
167. `/overlay <video> [at] [from] [to]`
168. `/add-image <file> [s] [main]`
169. `/add-music <file> [at] [volume%]`
170. `/add-title <text> [style] [anim] [s]`
171. `/lower-third <name\nrole> [preset] [s]`
172. `/add-color <color> [s] [layer]`
173. `/fill-slot <n> <video>`
174. `/insert-clip <video> [from] [to]`
175. `/overwrite-clip <video> [from] [to]`
176. `/to-overlay [n]`
177. `/to-main [V2.1]`
178. `/transition <type|off> [s] [n|all]`
179. `/grade <look|off> [strength%] [n…]`
180. `/adjust <adjustment> <value>`
181. `/effect <effect|off|remove effect> [amount%]`
182. `/sound-effect <effect|off>`
183. `/keyframe <prop> [value] [curve]`
184. `/keyframes`
185. `/keyframes-clear [prop]`
186. `/ease <curve>`
187. `/edit-motion <preset>`
188. `/clip-opacity <value>`
189. `/clip-scale <value>`
190. `/clip-rotate <degrees>`
191. `/clip-position <x> <y>`
192. `/blend-mode <mode>`
193. `/clip-volume <percent>`
194. `/speed-ramp <ramp>`
195. `/reverse [n…] [on|off]`
196. `/roll <frames> [n]`
197. `/slip <frames> [n]`
198. `/slide <frames> [n]`
199. `/lift`
200. `/extract`
201. `/split-all [time]`
202. `/razor [on|off]`
203. `/snap [on|off]`
204. `/nest`
205. `/unnest [n]`
206. `/select <n|V2.1|all|none>`
207. `/copy-clips`
208. `/paste-clips`
209. `/inspector [n|V2.1]`
210. `/captions-import <file> [style]`
211. `/captions-export`
212. `/match-look <picture>`
213. `/clip-fill [n…]`
214. `/reset-transform [n…]`
215. `/clip-duration <s> [n]`
216. `/fit-to-fill [gap n]`
217. `/extend-edit`
218. `/swap-next [n]`
219. `/shuffle-clips`
220. `/match-frame`
221. `/clip-label <color>`
222. `/clip-rename <name>`
223. `/clip-off [n…]`
224. `/range-selection`
225. `/beat-markers [beat|bar|2bars|4bars]`
226. `/copy-keyframes`
227. `/paste-keyframes`
228. `/safe-check [zone]`
229. `/marker-note <note>`
230. `/marker-color <color>`
231. `/marker-go <n|name|next|prev>`
232. `/goto-frame <frame|timecode>`
233. `/frame-step <n>`
234. `/frame-check`
235. `/edit-zoom <in|out|fit|n>`
236. `/edit-frame [frame|time]` — attaches the composited frame to the chat
237. `/edit-render [preset] [crop|fit|blur]`
238. `/poster-frame`
239. `/edit-presets <kind> [search]` — every preset family, searchable
(`/lab-to-editor`, `/lab-overlay` and `/lab-music` are in the Lab section above.)
240. Targets everywhere: no number = the selection (else the clip under the playhead), `3` = main-track clip 3, `V2.1` / `T1.2` = an item of a track.
241. Every editor command shares its name safely (`when` in Video Review): 0 duplicate names.

## Chats: tools for Claude and Astra (mcp/video-mcp.js, the Video Director's toolset)
242. **`video_edit_read`**: the edit as compact text — name, format, fps, length, playhead (timecode + frame), in–out, selection; V1 clips with timecodes and transitions; tracks with layers, titles, styles, animations; keyframes; markers with notes. `what`: all / clips / tracks / markers / presets (+ kind, search).
243. **`video_edit_frame`**: an image of the composited program at an exact frame (number, seconds or timecode), with the source frame each layer really shows.
244. **`video_edit`**: changes, one undo step per call — ops below.
245. op **open** (a video or a sequence) · op **new** (a sequence, optionally from a template).
246. op **template** (start from one, or keep the clips).
247. op **format** (shape and frame rate).
248. op **add**: video on the main track (append / insert / overwrite), overlay, image, audio, title, lower third, color.
249. op **split** (one track or all) · op **trim** (edge to a time) · op **move** (layers in time / track, main clips by position) · op **delete** (ripple or not).
250. op **roll** / **slip** / **slide** by frames.
251. op **transition** (one cut or all, type and length, or off).
252. op **look** / **adjust** / **effect** / **sound** / **match** (a reference picture: vibe only).
253. op **keyframe** (property, value, time, curve) · op **motion** (a preset).
254. op **speed** / **ramp** / **reverse**.
255. op **set** (opacity, scale, x, y, rotate, volume, blend, mute, fades, words, style, animations, size, color, length…).
256. op **marker** (time, label, note, color) · op **range** (in–out or off) · op **select**.
257. op **captions** (import an SRT, or export the titles).
258. op **undo** / **redo** · op **render** (any preset, or "record").
259. op **command**: runs any Video chat command and returns its text (only Video / Lab areas).
260. op **help**: the field list, on demand (so the tool description stays short).
261. **Lean**: the three tools cost ≈ 350 tokens in the Video Director's tool list (only that toolset); details are read on demand (`op: "help"`, `hearth_help editor`).
262. **References stay a vibe**: the tool description and the app map say mood-board media never enter an edit unless you ask; `match` grades toward a picture without adding it.
263. **The app map knows the editor** (`hearth_help editor`, also from `edit`, `nle`, `cut`, `titles`, `transitions`), and the video topic points to it.
264. **`video_status` mentions the layers** when the edit has some (one short line, only then).

## Keys (all in the keys button under "Editor" while it's open; each also has a menu entry or a command)
265. **Shift+S** split every track · **B** razor · **N** snapping · **R** reverse · **Shift+D** dissolve on the nearest cut · **Shift+E** extend edit.
266. **+ / − / \\** zoom in / out / fit · **Ctrl/⌘+wheel** zoom at the pointer · **wheel** scroll when zoomed.
267. **Alt+← / →** nudge (Shift: 10) · **Alt+, / .** slip one frame · **Alt+↑ / ↓** layer to the track above / below.
268. **Alt+K** key the transform · **Alt+T** a title over the picture · **Alt (hold)** track switches.
269. **Shift+↑ / ↓** previous / next keyframe · **PgUp / PgDn** previous / next marker · **Shift+M** marker with a note.
270. **Enter** opens the inspector (or accepts an auto-cut) · **Esc** razor off / suggestion off / deselect / leave.
271. **Ctrl/⌘+C / V** copy / paste clips and layers · **Ctrl/⌘+A** select everything · **Ctrl/⌘+= / −** zoom.
272. **Drag modifiers**: Shift+edge roll, Shift+body slide, Ctrl/⌘+body slip, Alt free (no snapping).
273. **Right-click on everything**: clips, layers, transitions, markers, lane labels, empty lanes, the ruler.
274. **The keys sheet** (? in the editor, `/editor keys`) lists them all.


## Transitions (91)
Right-click a clip › Transition in › (group) › name, the inspector's "Transition in", Shift+D (dissolve), `/transition <id> [s] [n|all]`, ⋯ › Transitions on every cut, `video_edit {op:"transition"}`. Each one plays in the preview and renders with ffmpeg (xfade or a custom expression).
275. **Cross dissolve** · Dissolve (`dissolve`, 0.5 s by default)
276. **Dither dissolve** · Dissolve (`dither`, 0.5 s by default)
277. **Fast dissolve** · Dissolve (`fast-dissolve`, 0.3 s by default)
278. **Slow dissolve** · Dissolve (`slow-dissolve`, 1 s by default)
279. **Dissolve through gray** · Dissolve (`gray-dissolve`, 0.6 s by default)
280. **Distance dissolve** · Dissolve (`distance`, 0.6 s by default)
281. **Blur dissolve** · Dissolve (`blur-dissolve`, 0.5 s by default)
282. **Dip to black** · Dip (`dip-black`, 0.6 s by default)
283. **Dip to white** · Dip (`dip-white`, 0.6 s by default)
284. **Dip to gold** · Dip (`dip-gold`, 0.6 s by default)
285. **Dip to ember** · Dip (`dip-ember`, 0.6 s by default)
286. **Dip to red** · Dip (`dip-red`, 0.6 s by default)
287. **Dip to violet** · Dip (`dip-violet`, 0.6 s by default)
288. **Dip to blue** · Dip (`dip-blue`, 0.6 s by default)
289. **Dip to cyan** · Dip (`dip-cyan`, 0.6 s by default)
290. **Dip to pink** · Dip (`dip-pink`, 0.6 s by default)
291. **Dip to green** · Dip (`dip-green`, 0.6 s by default)
292. **Flash** · Dip (`flash-white`, 0.3 s by default)
293. **Gold flash** · Dip (`flash-gold`, 0.3 s by default)
294. **Wipe left** · Wipe (`wipe-left`, 0.5 s by default)
295. **Wipe right** · Wipe (`wipe-right`, 0.5 s by default)
296. **Wipe up** · Wipe (`wipe-up`, 0.5 s by default)
297. **Wipe down** · Wipe (`wipe-down`, 0.5 s by default)
298. **Soft wipe left** · Wipe (`soft-wipe-left`, 0.6 s by default)
299. **Soft wipe right** · Wipe (`soft-wipe-right`, 0.6 s by default)
300. **Soft wipe up** · Wipe (`soft-wipe-up`, 0.6 s by default)
301. **Soft wipe down** · Wipe (`soft-wipe-down`, 0.6 s by default)
302. **Wipe from top left** · Wipe (`wipe-tl`, 0.5 s by default)
303. **Wipe from top right** · Wipe (`wipe-tr`, 0.5 s by default)
304. **Wipe from bottom left** · Wipe (`wipe-bl`, 0.5 s by default)
305. **Wipe from bottom right** · Wipe (`wipe-br`, 0.5 s by default)
306. **Diagonal from top left** · Wipe (`diag-tl`, 0.5 s by default)
307. **Diagonal from top right** · Wipe (`diag-tr`, 0.5 s by default)
308. **Diagonal from bottom left** · Wipe (`diag-bl`, 0.5 s by default)
309. **Diagonal from bottom right** · Wipe (`diag-br`, 0.5 s by default)
310. **Clock wipe** · Wipe (`clock`, 0.6 s by default)
311. **Iris open** · Shape (`iris-open`, 0.6 s by default)
312. **Iris close** · Shape (`iris-close`, 0.6 s by default)
313. **Circle crop** · Shape (`circle-crop`, 0.6 s by default)
314. **Box crop** · Shape (`rect-crop`, 0.6 s by default)
315. **Barn doors open (vertical)** · Shape (`doors-open-v`, 0.5 s by default)
316. **Barn doors close (vertical)** · Shape (`doors-close-v`, 0.5 s by default)
317. **Barn doors open (horizontal)** · Shape (`doors-open-h`, 0.5 s by default)
318. **Barn doors close (horizontal)** · Shape (`doors-close-h`, 0.5 s by default)
319. **Slices left** · Shape (`slices-left`, 0.6 s by default)
320. **Slices right** · Shape (`slices-right`, 0.6 s by default)
321. **Slices up** · Shape (`slices-up`, 0.6 s by default)
322. **Slices down** · Shape (`slices-down`, 0.6 s by default)
323. **Wind left** · Shape (`wind-left`, 0.6 s by default)
324. **Wind right** · Shape (`wind-right`, 0.6 s by default)
325. **Wind up** · Shape (`wind-up`, 0.6 s by default)
326. **Wind down** · Shape (`wind-down`, 0.6 s by default)
327. **Push left** · Push (`push-left`, 0.5 s by default)
328. **Push right** · Push (`push-right`, 0.5 s by default)
329. **Push up** · Push (`push-up`, 0.5 s by default)
330. **Push down** · Push (`push-down`, 0.5 s by default)
331. **Cover left** · Push (`cover-left`, 0.5 s by default)
332. **Cover right** · Push (`cover-right`, 0.5 s by default)
333. **Cover up** · Push (`cover-up`, 0.5 s by default)
334. **Cover down** · Push (`cover-down`, 0.5 s by default)
335. **Reveal left** · Push (`reveal-left`, 0.5 s by default)
336. **Reveal right** · Push (`reveal-right`, 0.5 s by default)
337. **Reveal up** · Push (`reveal-up`, 0.5 s by default)
338. **Reveal down** · Push (`reveal-down`, 0.5 s by default)
339. **Zoom in** · Motion (`zoom-in`, 0.5 s by default)
340. **Zoom out** · Motion (`zoom-out`, 0.5 s by default)
341. **Zoom cross (ffmpeg)** · Motion (`zoom-cross`, 0.5 s by default)
342. **Whip pan left** · Motion (`whip-left`, 0.35 s by default)
343. **Whip pan right** · Motion (`whip-right`, 0.35 s by default)
344. **Spin** · Motion (`spin`, 0.5 s by default)
345. **Squeeze horizontal** · Motion (`squeeze-h`, 0.5 s by default)
346. **Squeeze vertical** · Motion (`squeeze-v`, 0.5 s by default)
347. **Glitch** · Digital (`glitch`, 0.4 s by default)
348. **RGB split** · Digital (`rgb-split`, 0.35 s by default)
349. **Pixelate** · Digital (`pixelate`, 0.6 s by default)
350. **Checkerboard** · Shape (`checker`, 0.6 s by default)
351. **Blinds (horizontal)** · Shape (`blinds-h`, 0.6 s by default)
352. **Blinds (vertical)** · Shape (`blinds-v`, 0.6 s by default)
353. **Diamond iris** · Shape (`diamond`, 0.6 s by default)
354. **Random blocks** · Shape (`blocks`, 0.6 s by default)
355. **Bars wipe (ragged)** · Wipe (`bars-wipe`, 0.6 s by default)
356. **Shutter (bars close, then open)** · Shape (`shutter`, 0.5 s by default)
357. **Iris to black and open** · Shape (`iris-black`, 0.8 s by default)
358. **Wipe with a gold edge** · Wipe (`gold-edge-wipe`, 0.5 s by default)
359. **Light leak (gold)** · Light (`light-leak`, 0.8 s by default)
360. **Film burn (ember)** · Light (`film-burn`, 0.8 s by default)
361. **Overexpose (white out)** · Light (`white-out`, 0.5 s by default)
362. **Stretch through** · Motion (`stretch`, 0.4 s by default)
363. **Ripple** · Motion (`ripple`, 0.7 s by default)
364. **Slide and fade left** · Push (`slide-fade-left`, 0.5 s by default)
365. **Slide and fade up** · Push (`slide-fade-up`, 0.5 s by default)

## Looks (color grades) (155)
Right-click › Look › (group) › name, the inspector's Color › Look (with a strength slider), `/grade <id> [strength%]`, `video_edit {op:"look"}`. One recipe drives the preview (an SVG color matrix) and the render (colorchannelmixer, lutrgb, vignette, grain…), so they match.
366. **Teal & orange** · Cinematic (`teal-orange`)
367. **Blockbuster** · Cinematic (`blockbuster`)
368. **Bleach bypass** · Cinematic (`bleach`)
369. **Moody** · Cinematic (`moody`)
370. **Cinematic noir** · Cinematic (`noir-cine`)
371. **Code green** · Cinematic (`matrix`)
372. **Desert heat** · Cinematic (`desert`)
373. **Arctic** · Cinematic (`arctic`)
374. **Day for night** · Cinematic (`day-for-night`)
375. **Golden hour** · Cinematic (`golden-hour`)
376. **Blue hour** · Cinematic (`blue-hour`)
377. **Anamorphic** · Cinematic (`anamorphic`)
378. **Thriller** · Cinematic (`thriller`)
379. **Romance** · Cinematic (`romance`)
380. **Epic** · Cinematic (`epic`)
381. **Portrait film** · Film (`portra`)
382. **Vivid film** · Film (`ektar`)
383. **Slide film** · Film (`velvia`)
384. **Green-shadow film** · Film (`fuji-green`)
385. **Grainy B&W film** · Film (`tri-x`)
386. **Tungsten night film** · Film (`cine-800`)
387. **Expired film** · Film (`expired`)
388. **Instant photo** · Film (`polaroid`)
389. **Super 8** · Film (`super8`)
390. **16 mm** · Film (`16mm`)
391. **Cross process** · Film (`cross-process`)
392. **Lomo** · Film (`lomo`)
393. **Warm slide** · Film (`kodachrome`)
394. **Black & white** · Black & white (`bw`)
395. **B&W high contrast** · Black & white (`bw-high`)
396. **B&W soft** · Black & white (`bw-soft`)
397. **Ink (crushed)** · Black & white (`bw-ink`)
398. **Silver** · Black & white (`bw-silver`)
399. **Sepia** · Black & white (`sepia`)
400. **Selenium tone** · Black & white (`selenium`)
401. **Cyanotype** · Black & white (`cyanotype`)
402. **Newsprint** · Black & white (`newsprint`)
403. **Vintage** · Vintage (`vintage`)
404. **70s** · Vintage (`70s`)
405. **80s VHS** · Vintage (`80s`)
406. **90s camcorder** · Vintage (`90s`)
407. **Faded** · Vintage (`faded`)
408. **Matte** · Vintage (`matte`)
409. **Old photo** · Vintage (`old-photo`)
410. **Western** · Vintage (`western`)
411. **Cyberpunk** · Neon (`cyberpunk`)
412. **Synthwave** · Neon (`synthwave`)
413. **Neon noir** · Neon (`neon-noir`)
414. **Acid** · Neon (`acid`)
415. **Vaporwave** · Neon (`vaporwave`)
416. **Club lights** · Neon (`club`)
417. **Hologram** · Neon (`hologram`)
418. **Ultraviolet** · Neon (`ultraviolet`)
419. **Infrared** · Neon (`infrared`)
420. **Forgeheart (gold & ember)** · Neon (`forgeheart`)
421. **Molten** · Neon (`molten`)
422. **Ice neon** · Neon (`ice-neon`)
423. **Clean bright** · Clean (`clean`)
424. **Punchy** · Clean (`punchy`)
425. **Vivid** · Clean (`vivid`)
426. **Soft** · Clean (`soft`)
427. **Airy** · Clean (`airy`)
428. **Pastel** · Clean (`pastel`)
429. **Crisp** · Clean (`crisp`)
430. **Natural warm** · Clean (`natural-warm`)
431. **Natural cool** · Clean (`natural-cool`)
432. **Food** · Clean (`food`)
433. **Product** · Clean (`product`)
434. **Skin friendly** · Clean (`skin`)
435. **HDR-ish** · Clean (`hdr`)
436. **High key** · Clean (`high-key`)
437. **Low key** · Clean (`low-key`)
438. **Summer** · Seasons (`summer`)
439. **Autumn** · Seasons (`autumn`)
440. **Winter** · Seasons (`winter`)
441. **Spring** · Seasons (`spring`)
442. **Forest** · Seasons (`forest`)
443. **Ocean** · Seasons (`ocean`)
444. **Sunset** · Seasons (`sunset`)
445. **Fog** · Seasons (`fog`)
446. **Storm** · Seasons (`storm`)
447. **Negative** · Stylised (`negative`)
448. **Thermal-ish** · Stylised (`thermal`)
449. **Dream** · Stylised (`dream`)
450. **Nightmare** · Stylised (`nightmare`)
451. **Comic** · Stylised (`comic`)
452. **Pop art** · Stylised (`pop-art`)
453. **Poster** · Stylised (`posterized`)
454. **Glow** · Stylised (`glow`)
455. **Dim** · Stylised (`dim`)
456. **Bright** · Stylised (`bright`)
457. **Ghost** · Stylised (`ghost`)
458. **Red pop B&W** · Stylised (`sin-city`)
459. **Pink haze** · Music video (`mv-pink-haze`)
460. **Chrome (cold, glossy)** · Music video (`mv-chrome`)
461. **Red room** · Music video (`mv-red-room`)
462. **Green tint (indie)** · Music video (`mv-green-tint`)
463. **Gold club** · Music video (`mv-gold-hour-club`)
464. **Mono with red** · Music video (`mv-mono-red`)
465. **Anime bright** · Cartoon (`anime-bright`)
466. **Anime dusk** · Cartoon (`anime-dusk`)
467. **Cel shaded** · Cartoon (`cel`)
468. **Storybook** · Cartoon (`storybook`)
469. **Dawn** · Time of day (`dawn`)
470. **Hard noon** · Time of day (`noon`)
471. **Dusk** · Time of day (`dusk`)
472. **Night city** · Time of day (`night-city`)
473. **Midnight blue** · Time of day (`midnight`)
474. **Overcast** · Time of day (`overcast`)
475. **Handheld green** · Retro game (`gameboy`)
476. **Arcade** · Retro game (`arcade`)
477. **CGA (cyan & magenta)** · Retro game (`cga`)
478. **Old console** · Retro game (`sepia-game`)
479. **Sci-fi teal** · Sci-fi (`scifi-teal`)
480. **Mars** · Sci-fi (`mars`)
481. **Deep space** · Sci-fi (`space`)
482. **HUD** · Sci-fi (`hud`)
483. **Neo-noir orange** · Sci-fi (`replicant`)
484. **Deep green code** · Sci-fi (`matrix-deep`)
485. **Sickly** · Horror (`horror-sick`)
486. **Blood** · Horror (`horror-blood`)
487. **Found footage** · Horror (`horror-found`)
488. **Jungle** · Nature (`jungle`)
489. **Snow** · Nature (`snow`)
490. **Desert pastel** · Nature (`desert-pastel`)
491. **Lake** · Nature (`lake`)
492. **Deep autumn** · Nature (`autumn-deep`)
493. **Forgeheart ember** · Forgeheart (`forge-ember`)
494. **Forgeheart AI violet** · Forgeheart (`forge-ai`)
495. **Forgeheart steel** · Forgeheart (`forge-steel`)
496. **Forgeheart dark gold** · Forgeheart (`forge-gold-dark`)
497. **Forgeheart live (vivid)** · Forgeheart (`forge-rainbow`)
498. **Forgeheart ash** · Forgeheart (`forge-ash`)
499. **Color wash: red** · Color washes (`wash-red`)
500. **Color wash: orange** · Color washes (`wash-orange`)
501. **Color wash: gold** · Color washes (`wash-gold`)
502. **Color wash: lime** · Color washes (`wash-lime`)
503. **Color wash: green** · Color washes (`wash-green`)
504. **Color wash: teal** · Color washes (`wash-teal`)
505. **Color wash: cyan** · Color washes (`wash-cyan`)
506. **Color wash: blue** · Color washes (`wash-blue`)
507. **Color wash: indigo** · Color washes (`wash-indigo`)
508. **Color wash: violet** · Color washes (`wash-violet`)
509. **Color wash: magenta** · Color washes (`wash-magenta`)
510. **Color wash: pink** · Color washes (`wash-pink`)
511. **Color wash: ember** · Color washes (`wash-ember`)
512. **Color wash: ai-violet** · Color washes (`wash-ai-violet`)
513. **Duotone: gold black** · Duotones (`duo-gold-black`)
514. **Duotone: violet night** · Duotones (`duo-violet-night`)
515. **Duotone: cyan ink** · Duotones (`duo-cyan-ink`)
516. **Duotone: rose** · Duotones (`duo-rose`)
517. **Duotone: mint** · Duotones (`duo-mint`)
518. **Duotone: blood** · Duotones (`duo-blood`)
519. **Duotone: ocean duo** · Duotones (`duo-ocean-duo`)
520. **Duotone: amber** · Duotones (`duo-amber`)

## Color adjustments (17)
Inspector › Color › Adjust (sliders, double-click resets), `/adjust <name> <value>`, `video_edit {op:"adjust"}`; they add on top of a look.
521. **Exposure** (`exposure`, -2 … 2)
522. **Contrast** (`contrast`, -1 … 1)
523. **Saturation** (`saturation`, -1 … 1)
524. **Temperature** (`temp`, -1 … 1)
525. **Tint** (`tint`, -1 … 1)
526. **Hue** (`hue`, -180 … 180)
527. **Gamma (midtones)** (`gamma`, -1 … 1)
528. **Highlights** (`highlights`, -1 … 1)
529. **Shadows** (`shadows`, -1 … 1)
530. **Fade (lifted blacks)** (`fade`, 0 … 1)
531. **Black & white** (`mono`, 0 … 1)
532. **Sepia** (`sepia`, 0 … 1)
533. **Color wash** (`tintAmt`, 0 … 1)
534. **Vignette** (`vignette`, 0 … 1)
535. **Grain** (`grain`, 0 … 1)
536. **Blur** (`blur`, 0 … 1)
537. **Sharpen** (`sharpen`, 0 … 1)

## Clip effects (32)
Right-click › Effects › (group), the inspector's Effects (each with an amount and ✕), `/effect <id> [amount%]`, `/effect remove <id>`, `/effect off`, `video_edit {op:"effect"}`. Stackable; preview and render share the idea (canvas / SVG filters ⇄ ffmpeg filters).
538. **Mirror (flip left ↔ right)** · Geometry (`mirror`)
539. **Upside down** · Geometry (`flip`)
540. **Symmetry (left half mirrored)** · Geometry (`mirror-left`)
541. **Symmetry (top half mirrored)** · Geometry (`mirror-top`)
542. **Letterbox 2.39 (cinema bars)** · Frame (`letterbox-239`)
543. **Letterbox 1.85** · Frame (`letterbox-185`)
544. **White border** · Frame (`border-white`)
545. **Gold border** · Frame (`border-gold`)
546. **Black border** · Frame (`border-black`)
547. **Rounded corners** · Frame (`rounded`)
548. **Blur** · Stylize (`blur`)
549. **Soft glow** · Stylize (`soft-glow`)
550. **Bloom (strong glow)** · Stylize (`bloom`)
551. **Sharpen** · Stylize (`sharpen`)
552. **Pixelate** · Stylize (`pixelate`)
553. **Posterize** · Stylize (`posterize`)
554. **Threshold (black & white ink)** · Stylize (`threshold`)
555. **Invert** · Stylize (`invert`)
556. **Gray** · Stylize (`grayscale`)
557. **Solarize** · Stylize (`solarize`)
558. **Edge detect (neon lines)** · Stylize (`edges`)
559. **Emboss** · Stylize (`emboss`)
560. **RGB shift (chromatic aberration)** · Glitch (`rgb-shift`)
561. **Scanlines** · Glitch (`scanlines`)
562. **Static noise** · Glitch (`static`)
563. **VHS** · Glitch (`vhs`)
564. **CRT screen** · Glitch (`crt`)
565. **Old film (flicker, grain, sepia)** · Glitch (`old-film`)
566. **Hue cycle (colors rotate over time)** · Animated (`hue-cycle`)
567. **Strobe (white flashes on the beat, 120 bpm)** · Animated (`strobe`)
568. **Brightness pulse** · Animated (`pulse`)
569. **Desaturate over the clip** · Animated (`fade-gray`)

## Sound effects (18)
Right-click › Sound effects, the inspector's "Sound fx", `/sound-effect <id>`, `video_edit {op:"sound"}`. Heard in the render (the preview plays the clean sound).
570. **Voice boost (clearer speech)** (`voice`)
571. **Bass boost** (`bass`)
572. **Bright (treble boost)** (`treble`)
573. **Warm (soft highs)** (`warm`)
574. **Lo-fi** (`lofi`)
575. **Radio** (`radio`)
576. **Telephone** (`telephone`)
577. **Underwater / muffled** (`underwater`)
578. **Echo** (`echo`)
579. **Big room (reverb-ish)** (`hall`)
580. **Pitch up (chipmunk-ish, same length)** (`pitch-up`)
581. **Pitch down (deep, same length)** (`pitch-down`)
582. **Loudness to social level (−14 LUFS)** (`loud`)
583. **Compressor (even level)** (`compress`)
584. **Wider stereo** (`wide`)
585. **Mono** (`mono`)
586. **Ducked (−12 dB, a music bed under voice)** (`duck`)
587. **Long tail (gentle fade at the end)** (`fade-tail`)

## Easing curves (keyframes) (57)
Inspector › Transform › Curve, `/ease <id>`, `/keyframe <prop> <value> <curve>`, `video_edit {op:"keyframe", ease}`. The curve runs from a keyframe to the next one, in the preview and in the render (sampled into the ffmpeg expression).
588. **Linear** (`linear`)
589. **Hold (jump at the next key)** (`hold`)
590. **Ease (smooth both ends)** (`ease`)
591. **Ease in** (`easeIn`)
592. **Ease out** (`easeOut`)
593. **Ease in-out** (`easeInOut`)
594. **Smoothstep** (`smooth`)
595. **Smootherstep** (`smoother`)
596. **Snappy (fast start, soft land)** (`snappy`)
597. **Motion design (AE-style 33/100)** (`motion`)
598. **Anticipate (pulls back first)** (`anticipate`)
599. **Overshoot** (`overshoot`)
600. **Spring** (`spring`)
601. **Whip (very fast middle)** (`whip`)
602. **Steps ×4** (`steps4`)
603. **Steps ×8 (stop motion)** (`steps8`)
604. **Wiggle (settles)** (`wiggle`)
605. **Material standard** (`material`)
606. **Decelerate** (`decelerate`)
607. **Accelerate** (`accelerate`)
608. **Swift (quick out, long glide)** (`swift`)
609. **Gentle** (`gentle`)
610. **Punch (overshoots hard)** (`punch`)
611. **Pull back, then go** (`pullback`)
612. **Settle (soft spring)** (`settle`)
613. **Steps ×2** (`steps2`)
614. **Steps ×12 (stop motion, fine)** (`steps12`)
615. **Quad in** (`quadIn`)
616. **Quad out** (`quadOut`)
617. **Quad in-out** (`quadInOut`)
618. **Cubic in** (`cubicIn`)
619. **Cubic out** (`cubicOut`)
620. **Cubic in-out** (`cubicInOut`)
621. **Quart in** (`quartIn`)
622. **Quart out** (`quartOut`)
623. **Quart in-out** (`quartInOut`)
624. **Quint in** (`quintIn`)
625. **Quint out** (`quintOut`)
626. **Quint in-out** (`quintInOut`)
627. **Sine in** (`sineIn`)
628. **Sine out** (`sineOut`)
629. **Sine in-out** (`sineInOut`)
630. **Expo in** (`expoIn`)
631. **Expo out** (`expoOut`)
632. **Expo in-out** (`expoInOut`)
633. **Circ in** (`circIn`)
634. **Circ out** (`circOut`)
635. **Circ in-out** (`circInOut`)
636. **Back (overshoot) in** (`backIn`)
637. **Back (overshoot) out** (`backOut`)
638. **Back (overshoot) in-out** (`backInOut`)
639. **Elastic in** (`elasticIn`)
640. **Elastic out** (`elasticOut`)
641. **Elastic in-out** (`elasticInOut`)
642. **Bounce in** (`bounceIn`)
643. **Bounce out** (`bounceOut`)
644. **Bounce in-out** (`bounceInOut`)

## Title styles (60)
＋ › Title › (group) › style, right-click a title › Title style, the inspector's Style, `/add-title <text> <style>`, `video_edit {op:"add", kind:"title", style}`. Titles are drawn by one renderer for the preview and the export (PNG frames), so they look the same; long words shrink to fit the frame.
645. **Bold center** · Titles (`bold`)
646. **Huge headline** · Titles (`big`)
647. **Display (Oxanium)** · Titles (`display`)
648. **Thin elegant** · Titles (`thin`)
649. **Serif classic** · Titles (`serif`)
650. **Mono / code** · Titles (`mono`)
651. **Outline** · Titles (`outline`)
652. **Gold outline** · Titles (`outline-gold`)
653. **Neon glow** · Titles (`neon`)
654. **Cyan neon** · Titles (`neon-cyan`)
655. **Forgeheart gold** · Titles (`gold`)
656. **Ember** · Titles (`ember`)
657. **Drop shadow** · Titles (`shadow`)
658. **Boxed** · Titles (`boxed`)
659. **Gold box** · Titles (`boxed-gold`)
660. **White box** · Titles (`boxed-white`)
661. **Sticker** · Titles (`sticker`)
662. **Casual italic** · Titles (`handwritten`)
663. **Caption (bottom)** · Captions (`caption`)
664. **Caption on a box** · Captions (`caption-box`)
665. **Yellow caption** · Captions (`caption-yellow`)
666. **Social caption (big, stroked)** · Captions (`caption-tiktok`)
667. **Subtitle** · Captions (`subtitle`)
668. **Top line** · Placement (`top`)
669. **Bottom line** · Placement (`bottom`)
670. **Left aligned** · Placement (`left`)
671. **Right aligned** · Placement (`right`)
672. **Corner tag (top left)** · Placement (`corner-tl`)
673. **Corner tag (bottom right)** · Placement (`corner-br`)
674. **Quote** · Titles (`quote`)
675. **Big number** · Titles (`stat`)
676. **Kinetic stack** · Titles (`kinetic`)
677. **Glass card** · Titles (`glass`)
678. **Chrome** · Titles (`chrome`)
679. **App UI label** · Titles (`app-ui`)
680. **Countdown digit** · Titles (`countdown`)
681. **Hero (giant)** · Titles (`hero`)
682. **Huge gold** · Colors (`big-gold`)
683. **Huge ember** · Colors (`big-ember`)
684. **Huge violet** · Colors (`big-violet`)
685. **Cyan outline** · Colors (`outline-cyan`)
686. **Pink outline** · Colors (`outline-pink`)
687. **Gold neon** · Colors (`neon-gold`)
688. **Green neon** · Colors (`neon-green`)
689. **Violet neon** · Colors (`neon-violet`)
690. **Red box** · Colors (`boxed-red`)
691. **Violet box** · Colors (`boxed-violet`)
692. **Gold on black** · Colors (`gold-on-black`)
693. **Gold caption** · Captions (`caption-gold`)
694. **Caption on white** · Captions (`caption-white-box`)
695. **Yellow subtitle** · Captions (`subtitle-yellow`)
696. **Retro (serif, gold, shadow)** · Titles (`retro`)
697. **Terminal** · Titles (`tech-green`)
698. **Headline (left)** · Placement (`headline-left`)
699. **Headline (right)** · Placement (`headline-right`)
700. **Tiny label** · Titles (`tiny-label`)
701. **Soft** · Titles (`soft`)
702. **Dark glass card** · Titles (`glass-dark`)
703. **Stamp** · Titles (`stamp`)
704. **Gold quote** · Titles (`quote-gold`)

## Title animations (in and out) (72)
Right-click a title › Title animation › In / Out, the inspector's In / Out and Anim length, `/add-title <text> <style> <anim>`. Each works as an entrance and as an exit; letter, word and line animations stagger.
705. **None (cut in)** (`none`, by the whole title)
706. **Fade** (`fade`, by the whole title)
707. **Fade up** (`fade-up`, by the whole title)
708. **Fade down** (`fade-down`, by the whole title)
709. **Slide in from the right** (`slide-left`, by the whole title)
710. **Slide in from the left** (`slide-right`, by the whole title)
711. **Rise (lines)** (`rise`, by lines)
712. **Drop in (lines)** (`drop`, by lines)
713. **Pop** (`pop`, by the whole title)
714. **Pop (word by word)** (`pop-words`, by words)
715. **Pop (letter by letter)** (`pop-chars`, by chars)
716. **Zoom out (from big)** (`zoom-out`, by the whole title)
717. **Zoom in (from small)** (`zoom-in`, by the whole title)
718. **Blur in** (`blur-in`, by the whole title)
719. **Blur in (words)** (`blur-words`, by words)
720. **Focus pull** (`focus`, by the whole title)
721. **Typewriter** (`typewriter`, by chars)
722. **Type with cursor** (`type-cursor`, by chars)
723. **Letters fade in** (`letters-fade`, by chars)
724. **Letters rise** (`letters-rise`, by chars)
725. **Letters drop** (`letters-drop`, by chars)
726. **Letters spin** (`letters-spin`, by chars)
727. **Letters gather** (`letters-scatter`, by chars)
728. **Words rise** (`words-rise`, by words)
729. **Words slide in** (`words-slide`, by words)
730. **Words flip** (`words-flip`, by words)
731. **Tracking in (letters close up)** (`tracking-in`, by the whole title)
732. **Tracking out (letters spread)** (`tracking-out`, by the whole title)
733. **Wipe reveal** (`wipe`, by the whole title)
734. **Wipe reveal (lines)** (`wipe-lines`, by lines)
735. **Mask up (lines)** (`mask-up`, by lines)
736. **Mask down (lines)** (`mask-down`, by lines)
737. **Stretch in** (`stretch`, by the whole title)
738. **Squash** (`squash`, by the whole title)
739. **Bounce in** (`bounce`, by the whole title)
740. **Elastic** (`elastic`, by the whole title)
741. **Spin in** (`spin-in`, by the whole title)
742. **Swing** (`swing`, by the whole title)
743. **Flicker on** (`flicker`, by the whole title)
744. **Neon flicker (letters)** (`neon-flicker`, by chars)
745. **Glitch in** (`glitch`, by the whole title)
746. **Scramble (decode)** (`scramble`, by chars)
747. **Highlight bar** (`highlight`, by the whole title)
748. **Underline grows** (`underline`, by the whole title)
749. **Box reveal** (`box-reveal`, by the whole title)
750. **Split (top / bottom)** (`split`, by lines)
751. **Kinetic punch (words)** (`kinetic`, by words)
752. **Count up (numbers)** (`ticker`, by the whole title)
753. **Letters zoom in** (`letters-zoom`, by chars)
754. **Letters blur in** (`letters-blur`, by chars)
755. **Letters wave in** (`letters-wave`, by chars)
756. **Letters flip** (`letters-flip`, by chars)
757. **Letters slide in** (`letters-slide`, by chars)
758. **Cascade (letters fall in)** (`cascade`, by chars)
759. **Glitch letters** (`glitch-letters`, by chars)
760. **Typewriter (fast)** (`type-fast`, by chars)
761. **Letters wipe on** (`wipe-chars`, by chars)
762. **Words drop** (`words-drop`, by words)
763. **Words zoom in** (`words-zoom`, by words)
764. **Words fade in** (`words-fade`, by words)
765. **Words spin in** (`words-spin`, by words)
766. **Lines slide in (from the left)** (`lines-slide-left`, by lines)
767. **Lines zoom in** (`lines-zoom`, by lines)
768. **Lines blur in** (`lines-blur`, by lines)
769. **Pop (line by line)** (`pop-lines`, by lines)
770. **Unfold** (`unfold`, by the whole title)
771. **Tilt in** (`tilt-in`, by the whole title)
772. **Shake in** (`shake-in`, by the whole title)
773. **Heartbeat** (`heartbeat`, by the whole title)
774. **Stamp (slams in)** (`stamp`, by the whole title)
775. **Float up (slow)** (`float-up`, by the whole title)
776. **Zoom blur in** (`zoom-blur`, by the whole title)

## Lower thirds (26)
＋ › Lower third › name, `/lower-third Name\nRole <id>`, `video_edit {op:"add", kind:"lower"}`; two lines (name · role), each with its own accent and animation.
777. **Gold bar** (`bar-gold`)
778. **Ember bar** (`bar-ember`)
779. **Violet bar** (`bar-violet`)
780. **Dark box** (`box-dark`)
781. **White box** (`box-white`)
782. **Glass card** (`glass`)
783. **Minimal** (`minimal`)
784. **Minimal (right)** (`minimal-right`)
785. **Neon** (`neon`)
786. **News strap** (`news`)
787. **Tech (mono)** (`tech`)
788. **Underlined** (`underline`)
789. **Stacked bold** (`stack`)
790. **Centered** (`center`)
791. **Top left tag** (`top-left`)
792. **Forgeheart** (`forge`)
793. **Cyan bar** (`bar-cyan`)
794. **Pink bar** (`bar-pink`)
795. **Gold box** (`box-gold`)
796. **Violet box** (`box-violet`)
797. **Serif (editorial)** (`serif`)
798. **Spaced capitals** (`caps-tracking`)
799. **Typewriter** (`typewriter`)
800. **Glitch** (`glitch`)
801. **Word by word** (`words`)
802. **Box (right)** (`right-box`)

## Motion presets (keyframes made for you) (51)
Right-click › Motion › (group), the inspector's Motion, `/edit-motion <id>`, `video_edit {op:"motion"}`. They write ordinary keyframes you can then change.
803. **Ken Burns in** · Slow (`ken-burns-in`)
804. **Ken Burns out** · Slow (`ken-burns-out`)
805. **Slow push in** · Slow (`push-in`)
806. **Slow pull out** · Slow (`pull-out`)
807. **Pan left** · Slow (`pan-left`)
808. **Pan right** · Slow (`pan-right`)
809. **Pan up** · Slow (`pan-up`)
810. **Pan down** · Slow (`pan-down`)
811. **Drift** · Slow (`drift`)
812. **Punch in** · Hits (`punch-in`)
813. **Punch out** · Hits (`punch-out`)
814. **Bump** · Hits (`beat-bump`)
815. **Camera shake** · Hits (`shake`)
816. **Hard shake** · Hits (`shake-hard`)
817. **Flash in** · Hits (`flash-in`)
818. **Pop in** · Enter (`pop-in`)
819. **Fade in** · Enter (`fade-in`)
820. **Fade out** · Exit (`fade-out`)
821. **Slide in from the left** · Enter (`slide-in-left`)
822. **Slide in from the right** · Enter (`slide-in-right`)
823. **Slide in from the top** · Enter (`slide-in-top`)
824. **Slide in from the bottom** · Enter (`slide-in-bottom`)
825. **Slide out to the left** · Exit (`slide-out-left`)
826. **Slide out to the right** · Exit (`slide-out-right`)
827. **Spin in** · Enter (`spin-in`)
828. **Zoom away** · Exit (`zoom-out-exit`)
829. **Tilt** · Slow (`tilt`)
830. **Float** · Slow (`float`)
831. **Logo bug (top right)** · Layout (`logo-tr`)
832. **Logo bug (top left)** · Layout (`logo-tl`)
833. **Logo bug (bottom right)** · Layout (`logo-br`)
834. **Logo bug (bottom left)** · Layout (`logo-bl`)
835. **Picture in picture (top right)** · Layout (`pip-tr`)
836. **Picture in picture (bottom left)** · Layout (`pip-bl`)
837. **Split screen: left half** · Layout (`split-left`)
838. **Split screen: right half** · Layout (`split-right`)
839. **Split screen: top half** · Layout (`split-top`)
840. **Split screen: bottom half** · Layout (`split-bottom`)
841. **Crash zoom** · Hits (`crash-zoom`)
842. **Fast zoom in** · Hits (`zoom-in-fast`)
843. **Fast zoom out** · Hits (`zoom-out-fast`)
844. **Whip in from the left** · Enter (`whip-in-left`)
845. **Whip in from the right** · Enter (`whip-in-right`)
846. **Drop in (bounce)** · Enter (`drop-in`)
847. **Rise in** · Enter (`rise-in`)
848. **Dolly left (slow push + pan)** · Slow (`dolly-left`)
849. **Dolly right** · Slow (`dolly-right`)
850. **Orbit (small circle)** · Slow (`orbit`)
851. **Breathe (slow scale pulse)** · Slow (`breathe`)
852. **Sway** · Slow (`sway`)
853. **No motion (reset)** · Layout (`reset`)

## Speed ramps (14)
Right-click › Speed › Speed ramp, the inspector's Ramp, `/speed-ramp <id>`, `video_edit {op:"ramp"}` (the clip becomes steps at those speeds; sound keeps its pitch).
854. **Hero slow-mo (1 → 0.3 → 1)** (`slow-mid`: 1 → 0.7 → 0.4 → 0.3 → 0.3 → 0.4 → 0.7 → 1×)
855. **Ease into slow-mo** (`slow-in`: 1 → 0.8 → 0.6 → 0.45 → 0.35 → 0.3×)
856. **Slow-mo back to speed** (`slow-out`: 0.3 → 0.35 → 0.45 → 0.6 → 0.8 → 1×)
857. **Speed burst (1 → 3 → 1)** (`burst`: 1 → 1.5 → 2.5 → 3 → 2.5 → 1.5 → 1×)
858. **Ramp up (to 3×)** (`ramp-up`: 1 → 1.3 → 1.7 → 2.2 → 2.7 → 3×)
859. **Ramp down (from 3×)** (`ramp-down`: 3 → 2.7 → 2.2 → 1.7 → 1.3 → 1×)
860. **Flash forward (4× then normal)** (`flash-forward`: 4 → 4 → 3 → 2 → 1 → 1×)
861. **Bullet time (0.25× center)** (`bullet`: 1 → 0.6 → 0.25 → 0.25 → 0.25 → 0.6 → 1×)
862. **Montage (2×)** (`montage`: 2×)
863. **Half speed** (`half`: 0.5×)
864. **Double speed** (`double`: 2×)
865. **Pulse (fast · slow · fast)** (`pulse`: 2 → 0.5 → 2 → 0.5 → 2×)
866. **Stutter** (`stutter`: 1 → 0.25 → 1 → 0.25 → 1 → 0.25×)
867. **Drop hit (fast, freeze-ish, fast)** (`drop-hit`: 2.5 → 2 → 0.3 → 0.25 → 1.5 → 2.5×)

## Blend modes (layers) (13)
Right-click a layer › Blend, the inspector's Blend, `/blend-mode <id>`; preview (canvas composite) and render (ffmpeg blend over a neutral pad) match.
868. **Normal** (`normal`)
869. **Screen** (`screen`)
870. **Add (lighter)** (`add`)
871. **Lighten** (`lighten`)
872. **Multiply** (`multiply`)
873. **Darken** (`darken`)
874. **Overlay** (`overlay`)
875. **Soft light** (`soft-light`)
876. **Hard light** (`hard-light`)
877. **Difference** (`difference`)
878. **Exclusion** (`exclusion`)
879. **Color dodge** (`color-dodge`)
880. **Color burn** (`color-burn`)

## Sequence formats (14)
The format chip (9:16 · 30 fps) in the editor's header, `/edit-format <id|WxH|source>`, `video_edit {op:"format"}`; the frame takes that shape, safe zones follow.
881. **Vertical 9:16 (Reels · TikTok · Shorts)** (1080×1920)
882. **Portrait 4:5 (feeds)** (1080×1350)
883. **Square 1:1** (1080×1080)
884. **Landscape 16:9 (YouTube)** (1920×1080)
885. **16:9 4K** (3840×2160)
886. **16:9 720p (light)** (1280×720)
887. **9:16 720p (light)** (720×1280)
888. **Pin 2:3** (1000×1500)
889. **Portrait 3:4** (1080×1440)
890. **Classic 4:3** (1440×1080)
891. **Cinema 21:9** (2560×1080)
892. **Scope 2.39:1** (1920×804)
893. **Flat 1.85:1** (1998×1080)
894. **Story 9:16 with safe margins** (1080×1920)

## Frame rates (9)
Format chip › Frame rate, `/edit-fps <rate>`; timecode, stepping and the render follow.
895. **23.976 fps**
896. **24 fps**
897. **25 fps**
898. **29.97 fps**
899. **30 fps**
900. **48 fps**
901. **50 fps**
902. **59.94 fps**
903. **60 fps**

## More export presets (34)
⇪ Export › Socials / Small files / Loops and web / Masters / Stills and sound, `/edit-render <id>`, `video_edit {op:"render", preset}` (on top of the social, GIF, WebM and ProRes presets the cut already had).
904. **Instagram Story** (1080×1920)
905. **Facebook feed 4:5** (1080×1350)
906. **Facebook square** (1080×1080)
907. **LinkedIn 16:9** (1920×1080)
908. **LinkedIn 4:5** (1080×1350)
909. **X / Twitter square** (1080×1080)
910. **Threads 4:5** (1080×1350)
911. **WhatsApp status (small)** (720×1280)
912. **Discord (under 10 MB)** (under 9.5 MB)
913. **Email / chat (under 25 MB)** (under 24 MB)
914. **Tiny (under 8 MB)** (under 7.5 MB)
915. **Reels 60 fps** (1080×1920 · 60 fps)
916. **TikTok 60 fps** (1080×1920 · 60 fps)
917. **YouTube 1080p 60 fps** (1920×1080 · 60 fps)
918. **Draft (fast 720p)**
919. **High quality, same size**
920. **H.265 / HEVC (smaller files)**
921. **GIF small (480 wide, 12 fps)**
922. **GIF high (960 wide, 20 fps)**
923. **WebM VP9 (website loop, no sound)**
924. **Audio only (WAV)**
925. **Audio only (MP3)**
926. **Audio only (AAC .m4a)**
927. **JPEG stills (every frame)**
928. **TikTok high quality** (1080×1920)
929. **Reels high quality** (1080×1920)
930. **Shorts 60 fps high quality** (1080×1920 · 60 fps)
931. **Bluesky (16:9, small)** (1280×720)
932. **Mastodon (720p, small)**
933. **Telegram (720p)**
934. **Slack / Discord preview (under 10 MB)** (under 9.5 MB)
935. **Messages (under 100 MB, 1080p)** (under 95 MB)
936. **Twitch / stream clip (1080p 60)** (1920×1080 · 60 fps)
937. **Website hero (720p H.264, light)** (1280×720)

## Sequence templates (40)
⋯ › Template › name › "Start from it" or "Lay its titles and markers over my clips", `/edit-template <id> [new|keep]`, `video_edit {op:"template"}`. Slots (＋ gaps) take your videos: drop on them, double-click them or `/fill-slot <n> <video>`; slots stretch so the edit keeps the template's length.
938. **Social intro 15 s (9:16)** (`social-intro-15`, 9:16, 15 s) — Six slots, hook title, three feature captions, end card
939. **App teaser 15 s (motion design)** (`app-teaser-15`, 9:16, 15 s) — Eight quick slots on 128 bpm half bars, one word each
940. **Reel 30 s (9:16)** (`reel-30`, 9:16, 30 s)
941. **TikTok hook 7 s** (`tiktok-hook-7`, 9:16, 7 s)
942. **Shorts 20 s** (`shorts-20`, 9:16, 20 s)
943. **YouTube intro 5 s (16:9)** (`yt-intro-5`, 16:9, 5 s)
944. **App promo 30 s (16:9)** (`promo-30-169`, 16:9, 30 s)
945. **Square loop 6 s** (`square-loop-6`, 1:1, 6 s)
946. **Feed post 15 s (4:5)** (`feed-15-45`, 4:5, 15 s)
947. **Story 3 × 5 s** (`story-3x5`, 9:16, 15 s)
948. **Logo sting 3 s** (`logo-sting-3`, 16:9, 3 s)
949. **Countdown 3-2-1** (`countdown`, 9:16, 4 s)
950. **Before / after split** (`before-after`, 9:16, 8 s)
951. **Feature list (4 beats)** (`features-4`, 9:16, 12 s)
952. **Beat montage (16 cuts at 120 bpm)** (`beat-montage`, 9:16, 8 s)
953. **Quote card 6 s** (`quote-card`, 1:1, 6 s)
954. **Interview with lower third** (`lower-third-demo`, 16:9, 10 s)
955. **Trailer 30 s (dark, dips)** (`trailer-30`, 16:9, 30 s)
956. **Product reveal 10 s** (`product-reveal`, 9:16, 10 s)
957. **Photo slideshow (8 × 2 s, Ken Burns)** (`slideshow`, 16:9, 16 s)
958. **Tutorial steps (16:9)** (`tutorial`, 16:9, 24 s)
959. **Meme (top / bottom text)** (`meme`, 1:1, 6 s)
960. **Music visual 30 s (Lab recording)** (`music-visual-30`, 9:16, 30 s)
961. **Event promo 15 s** (`event`, 4:5, 15 s)
962. **Hearth intro 20 s (the app, in 9:16)** (`hearth-intro-20`, 9:16, 20 s) — Eight quick slots with a word each, gold end card
963. **Carousel teaser 8 s (4:5)** (`carousel-teaser`, 4:5, 8 s)
964. **Quote reel 10 s** (`quote-reel`, 9:16, 10 s)
965. **Three features (16:9, 15 s)** (`three-features-169`, 16:9, 15 s)
966. **Podcast clip 30 s (9:16, captions)** (`podcast-clip`, 9:16, 30 s)
967. **Travel montage 15 s** (`travel-montage`, 9:16, 15 s)
968. **Recipe / how-to 30 s** (`recipe-steps`, 4:5, 30 s)
969. **Event recap 20 s** (`event-recap`, 16:9, 20 s)
970. **Announcement 8 s** (`announcement`, 1:1, 8 s)
971. **Year in review 30 s** (`year-review`, 9:16, 30 s)
972. **Gaming highlight 15 s** (`gaming-highlight`, 16:9, 15 s)
973. **Dark teaser 12 s** (`teaser-dark`, 9:16, 12 s)
974. **Blank 9:16 (10 s)** (`blank-916`, 9:16, 10 s)
975. **Blank 16:9 (10 s)** (`blank-169`, 16:9, 10 s)
976. **Blank 1:1 (10 s)** (`blank-11`, 1:1, 10 s)
977. **Blank 4:5 (10 s)** (`blank-45`, 4:5, 10 s)

## Marker colors (8)
Right-click a marker › Color, `/marker-color <name>`, `video_edit {op:"marker", color}`.
978. **gold** (#ffd75e)
979. **red** (#ff4d4d)
980. **orange** (#ff8c42)
981. **green** (#4fd18b)
982. **blue** (#6bc7ff)
983. **violet** (#9b8bff)
984. **pink** (#ff6b9a)
985. **white** (#ffffff)

**Total: 985 upgrades.**

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
  own number as a pixel code): 69 checks — model operations, presets unique and valid, and real ffmpeg renders
  read back frame by frame: a dissolve (exact frames on both sides), every transition (91), every look (155),
  every clip effect (32), every sound effect (18, length kept), a keyframed rotating PIP at its exact source
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
- `dev/checks/editor-more.js`: 21 steps — effects and sound effects, SRT import / export, safe check, match look
  (nothing added to the edit), labels, clip off, swap, extend edit, clip duration, fit to fill, fill the frame,
  beat markers from music, nest (ffmpeg) and un-nest, poster frame, the real-time WebM recorder, the Lab's
  /lab-to-editor, /lab-overlay, /lab-music.
- `dev/checks/editor-mcp.js` (`--fake-engines`): the Video Director calls video_edit_read, video_edit (split,
  transition, title, keyframe, look, effect, command, marker, speed, undo, an unknown op) and video_edit_frame
  through the real MCP server; all 13 results check out. `node dev/editor-mcp-test.js`: the tools are listed, lean
  (≈350 tokens for the three), say references are a vibe, hearth_help editor answers locally.
- Unchanged and still green: `dev/checks/cut.js` (the round-6 clip track, 57 steps), `node dev/cut-test.js`
  (51), `sh dev/journeys.sh video`, `dev/checks/nodes-video.js`, `node dev/director-mcp-test.js`,
  `dev/checks/qa-commands.js` (0 duplicates, 720 commands).

## Not done / notes
- Sound effects are heard in the render only (the preview plays the clean sound: file:// media can't go through
  Web Audio here).
- Reverse plays in the preview by stepping frames (smooth enough to judge, not real-time perfect).
- Preview transitions are canvas look-alikes of ffmpeg's; the render is the reference.
- The real-time WebM (no ffmpeg) has no duration in its header (a browser limitation); players still play it.
- Compound clips are rendered files (with the parts kept to un-nest), not live nested timelines.
