# Lab frames: the Three.js Lab timeline works frame by frame on footage (round 8)

You asked: "edit the timeline of a footage and stop frame-by-frame on an edit even if it's not a song… the timeline
becomes a whole video editor that chat knows about and can use… the frame-reading should be a lot more accurate."
Round 7 did that in Video Review. This round brings it to the **Lab**: load a video (no song needed) and the Lab's
timeline counts exact frames, steps them, cuts them, and the sketch reads the very frame the timeline is on. The cut
you make in the Lab **is** the video's edit in Video Review's editor (one model), so you can finish it there and
come back. Reference clips (the Lab's references and board clips) read exactly too, and give their **pacing** to
your piece — the rhythm and energy, never the footage. Little new on screen: the time box becomes a timecode
counter, one ▦ chip next to it opens the frames menu (with submenus), the rest is keys, right-click and chat.

Load a video: 🎵 in the timeline, drop it on the preview, or `/song load <path>` / the director's `three_do load_media`.
Everything below is also in `/help footage` (area Three.js Lab) and the keys button (area "Lab timeline").

## Footage on the timeline, no song needed
1. **A video with no song drives the Lab timeline directly**: frames, cuts, loops, cues, markers and keyframes all work on it.
2. **The true frame rate from ffprobe** (the frame reader, framereader.js) for every video you load.
3. **29.97 and 23.976 footage handled exactly** (the rate kept as its fraction, 30000/1001).
4. **Variable-frame-rate phone footage**: every frame's own time, read from the file's packets.
5. **Without ffmpeg** the frame rate is measured from the frames the decoder presents (the smallest spacing, snapped to 23.976…120), so a busy machine that drops frames can't fool it.
6. **The footage's real end**: the end of its last frame (a browser can report the last frame's start as the length), so the last frame is never cut off.
7. **A silent video is footage, not an error**: no more "no audio track to analyze" warning.
8. **Frame mode turns itself on for any video** (one less choice); songs keep the music timeline as before.
9. **Frame mode off for one video** when you'd rather tap its music (▦ › More…, `/footage off`), remembered per file.
10. **The clock's source in the counter's tooltip** (ffprobe, every frame's time, or measured).
11. **Silent footage tucks the music controls away** (Tap, K S H, live sound, triggers, the grid row) behind ⋯ — less in your face.
12. **Footage with sound keeps them**: a music video can still be tapped and marked.

## The counter (the time box)
13. **Timecode HH:MM:SS:FF · frame number** in the time box while footage is loaded.
14. **A fixed-width counter** with even digits: stepping never moves the row.
15. **Green underline** once the decoder has confirmed that exact frame is on screen.
16. **Orange, with the reason in its tooltip**, if the decoder shows another frame than the counter.
17. **Click the time: go to a frame** — `f120`, `120f`, `00:00:04:12`, `+10f`, `-3`, `4.5`, `1:02.5`.
18. **T cycles** timecode · frames (`f47 / 95`) · seconds.
19. **Your choice is remembered** (`/frame-display tc|frames|seconds`).
20. **Timecodes count at the nominal rate** (29.97 counts 30 a second), like the editor and the frame reader.
21. **The hairline under the mouse names the frame** and its timecode (and says "removed" over a removed part).
22. **The hairline sits on the frame's start**, where a click will land.
23. **Present's info line (I)** shows the footage's timecode and frame.

## Stepping and transport
24. **← / →** one frame, exactly.
25. **Shift+← / →** ten frames.
26. **`,` / `.`** one frame (Shift: ten), the editor's habit.
27. **Steps skip the removed parts** of a cut (you step through what the sketch plays).
28. **Alt+← / →** steps through removed parts too (the raw source).
29. **Home / End**: the first / last frame that plays.
30. **↑ / ↓**: the previous / next edit point (cuts, cues, loop edges).
31. **J / K / L shuttle**: back · stop · forward.
32. **L again: 2×, 4×, 8×** forward.
33. **J plays backward** by stepping frames (again: 2×, 4×), since a browser decoder can't play in reverse.
34. **K stops on a whole frame** (the decoder goes to that frame).
35. **Hold K and tap J or L**: one frame back / forward.
36. **Space pauses on a whole frame** too.
37. **Every seek lands on a frame**: the playhead on the frame's start, the decoder in the frame's middle (never between two frames).
38. **Every step and seek is confirmed** with requestVideoFrameCallback: the frame the decoder presented comes back to the counter.
39. **A scrub that stays inside one frame costs nothing** (no message, no redraw).
40. **▦ › Step**: one / ten frames, one second back / forward, previous / next edit point, first / last frame, play backward / forward, stop.
41. **A selected marker moves one frame per arrow** (Shift: ten) on footage.

## Scrubbing and the timeline picture
42. **Scrubbing with the mouse lands on exact frames** (checked against the frame numbers burned into test footage).
43. **Frame ticks on the ruler** when you zoom in (a taller tick on each second).
44. **Frame numbers along the top of the picture lane**, spaced so they stay readable.
45. **The frame under the playhead is outlined** (one frame wide) when you're zoomed in.
46. **A filmstrip of the footage under the timeline** (bright on silent footage, faint under a waveform).
47. **The filmstrip is drawn in memory** by a hidden player: no files written for it.
48. **Zoomed in close, every frame gets its own exact picture** in the strip.
49. **The overview strip shows the filmstrip too.**
50. **Filmstrip on / off** (▦ › More…, `/footage film on|off`).
51. **▦ chip next to the time** opens the frames menu (and shows ✂N when the footage is cut).
52. **Right-click the time box**: the same menu.
53. **Right-click the picture lane**: the footage's moves at that frame come first (cut here, remove / put back this part, cue at this frame, hold this frame).
54. **Zoom: one second of frames, 12 frames, this part, the whole footage** (▦ › Zoom, `/footage zoom second|12f|part|all`).

## Loops, cues, markers and keyframes on frames
55. **[ / ]** set the loop's start / end on the frame.
56. **A loop drawn with Shift+drag** snaps to frames.
57. **Loop edges dragged** snap to frames.
58. **C drops a cue** on the frame.
59. **Cues dragged** snap to frames.
60. **Kick / snare / hit markers** (the sketch's triggers) land on frames when you click a lane.
61. **Automation points** in the curve lanes snap to frames.
62. **Layer keyframes** (the diamonds) dragged snap to frames.
63. **A layer's time bar** trimmed or moved snaps to frames.
64. **The song trim { }** snaps to frames on footage.
65. **A loop edge you just set doesn't steal the arrows** on footage (they still step frames).
66. **Loop N frames from here** (`/loop-frames 12`, ▦ › Cues: 12 frames, 24 frames, one second).
67. **Loop this part** of a cut.
68. **A cue at every cut** (▦ › Cues, `/markers-at-cuts` in the Lab).
69. **A cue at every shot**, found exactly by the frame reader (`/footage-scenes`).
70. Shot sensitivity **gentle** (hard cuts only).
71. Shot sensitivity **normal**.
72. Shot sensitivity **sensitive** (soft cuts and flashes too).
73. Shot sensitivity **every** (any change counts).
74. **`/edit-points`**: every cut and cue as a timecode.

## Cutting the footage (the sketch plays the parts)
75. **S cuts the footage at this frame.**
76. **Delete removes the part under the playhead**: the sketch skips it.
77. **Shift+Delete puts it back** (or double-click the removed part).
78. **Double-click a removed part** to bring it back.
79. **Drag a cut line** to move it: two parts that touch move together (a roll), a part next to a removed gap gets trimmed.
80. **The pointer turns into ↔ over a cut line.**
81. **The dragged line shows its frame** while you drag; the change is one undo step on release.
82. **Alt+, / Alt+.** move the nearest cut one frame earlier / later (▦ › Move the nearest cut: 1 or 5 frames).
83. **This part starts here / ends here** (▦ › This part, `/footage in`, `/footage out`): trims it to the frame.
84. **Part speed 0.25×** (▦ › This part › Speed, `/footage speed 0.25`).
85. Part speed **0.5×**.
86. Part speed **0.75×**.
87. Part speed **1×** (back to normal).
88. Part speed **1.25×**.
89. Part speed **1.5×**.
90. Part speed **2×**.
91. Part speed **3×**.
92. Part speed **4×**.
93. **Hold this frame 0.5 / 1 / 2 / 3 s** (▦ › Hold this frame, `/footage hold 1`, `/hold-frame`).
94. **Hold the part's last frame 0.5 / 1 / 2 s** (▦ › This part).
95. **Play a part again right after itself** (`/footage repeat`).
96. **Play a part first** (`/footage first`).
97. **Play a part last** (`/footage last`).
98. **A part's sound off / on** (`/footage mute`): the sketch hears silence there too.
99. **Keep only the loop** (`/cut-keep`, or two frames).
100. **Remove the loop's part** (`/cut-range`, or two frames).
101. **Cut at every shot** (gentle / normal / sensitive, `/cut-scenes`).
102. **Cut at every cue.**
103. **Cut on every bar / beat / 2 bars** of the footage's own sound (`/cut-bars`).
104. **Cut at every kick, snare or hit marker** (yours, the triggers' or pace hits) (▦ › Cut at every marker, `/cut-markers`).
105. **The whole video again** (`/cut-clear`; Ctrl+Z brings the cut back).
106. **List the parts** (frames, timecodes, speeds, held frames, sound off) (`/lab-cuts`).
107. **Copy the parts as text.**
108. **Removed parts are dark and hatched** on the timeline.
109. **…and darkened on the overview strip**, with a tick at each cut.
110. **Parts are numbered** on the timeline, with their speed.
111. **Each part's length** (as it plays) is written on it when there's room.
112. **Held frames show as ❚❚** with their length.
113. **Cut lines** in orange, with a notch on the ruler.
114. **✂N on the chip**; its tooltip gives the cut's length as it plays against the footage's.
115. **The sketch's footage plays only the parts, in their order** (media.texture() included).
116. **Part speeds change what the sketch sees** (and its clock).
117. **A held frame stands still**: the picture and the clock (audio.time) stop for its length.
118. **A removed frame never shows**: the jump is scheduled just before the first removed frame is due, leading a little more on a busy machine.
119. **A frame that overshot** (a slow machine skipped callbacks) jumps at once.
120. **Playing from after the last part starts from the top.**
121. **With Loop on, the cut loops** from its first part.
122. **The speed menu (¾, ½, ¼) multiplies a part's speed.**
123. **One undo history**: Ctrl+Z undoes cuts along with grid and marker changes.
124. **Record the sketch over the cut** (▦): it plays every part once, from the top, and saves the video.

## Motion design on the cut (▦ › Motion design on the cut)
125. **Each part its own look**: a cue at every cut and a bold shuffle of the selected layer's sliders for each, as rough material (`/footage looks`).
126. **Opacity on / off at every cut**: held keyframes on the selected layer, one per part.
127. **Scale pulse at every cut** (1.15 then 1).
128. **Any setting keyed at every cut**, alternating your values (`/footage key opacity 1 0.2`).
129. **The selected layer plays only in this part** (its in / out set to the part) (`/footage layer-part`).
130. **The footage's own motion as keyframes** on a slider (`/footage motion-to speed`).

## One edit with Video Review's editor
131. **The Lab's cut is the video's own edit in the editor** (one model, kv video-cuts): nothing is copied.
132. **Changes made in the editor reach the Lab right away** (the sketch plays them).
133. **Edit it in the video editor** (▦ › Editor, `/footage-editor`): the same cut, frame by frame, with every editor tool.
134. **As a new editor sequence** (`/footage-sequence [name]`): the footage's size and frame rate, your cues as markers.
135. **Take a sequence's cut back** (`/footage-back <sequence>`): its clips of the footage become the Lab's parts (other files stay in the editor).
136. **Render the cut as a video** (▦ › More…, `/footage render`): the editor's frame-exact ffmpeg render, next to the footage (checked: 150 frames out for 150 frames kept).
137. **Save the cut as an EDL** (CMX 3600) next to the video (`/footage edl`).
138. **`/goto-frame`** works on the Lab's footage (shared with the editor).
139. **`/frame-step`** in the Lab.
140. **`/frame-check`** in the Lab.
141. **`/cut-delete`** in the Lab.
142. **`/clip-speed`** in the Lab.
143. **`/hold-frame`** in the Lab.
144. **`/markers-at-cuts`** in the Lab.

## Reading the footage exactly
145. **This frame as a picture** (ffmpeg's exact frame, or the player's confirmed one without ffmpeg).
146. **Contact sheet of the footage** with timecodes (exact frames).
147. **Contact sheet as…** 3 × 3, 4 × 4, 6 × 5, film strip, storyboard or portrait.
148. **Scene list** of the footage.
149. **Motion curve** of the footage.
150. **Pacing** of the footage.
151. **Check the frame on screen**: what the counter says against what the sketch's video presents.
152. **A still of the sketch at this exact frame** (`/footage still`).
153. **Storyboard**: the sketch at the first frame of every part, one numbered sheet (`/footage storyboard`).
154. **Copy this frame's timecode** (`/footage copy`).
155. **Palette from this frame** becomes the sketch palette (`/footage palette`).
156. **Pin this frame to the mood board** (`/footage board`): a reference picture for the chats.

## For sketches (the `media` global, in code)
157. **`media.frame`**: the exact frame the decoder presented — the one `media.texture()` shows.
158. **`media.fps`**: the footage's true frame rate.
159. **`media.frames`**: how many frames it has.
160. **`media.frameTime`**: the presented frame's time.
161. **`media.timecode`**: its timecode.
162. **`media.exact`**: true when the clock came from ffprobe.
163. **`media.part`**: which part of the cut is playing.
164. **`media.parts`**: the cut, part by part.
165. **`media.timeOf(n)`**: frame → seconds.
166. **`media.frameAt(t)`**: seconds → frame.
167. **`media.onFrame((n, t) => …)`**: runs once per presented frame (ends with its layer).
168. **`media.texture()` shows exactly the frame `media.frame` names** (checked from the sketch's own pixels).
169. **The frame rides along with the playback updates** (4 a second while playing): no message per frame.
170. **The clock and the cut survive preview reloads** (sent again with the footage).

## Footage layers (Layers ＋ › Footage; `/template`, the director's three_add_layer)
171. **Footage**: the video full frame (cover, fit or stretch), zoom, pan and a quick grade.
172. **Timecode burn-in**: timecode and / or frame number over the picture, seven places, a box, a label.
173. **Frame echo**: onion skin, the last frames as fading tinted ghosts.
174. **On twos**: the footage holds each frame for N frames (stop-motion feel).
175. **Time RGB split**: red from now, green and blue from frames before.
176. **Motion glow**: what moved since the last frame, glowing.
177. **Flash on cuts**: a flash on every cut (your Lab cuts and jumps in the frames).
178. **Footage in a shape**: circle, rounded box, diamond or ring, with a border.
179. **Delay grid**: 2 × 2 or 3 × 3 tiles, each a few frames behind.
180. **Slit scan**: rows or columns from different past frames.
181. **Freeze on hits**: holds a few frames on each kick / snare / hit marker (or every N frames).
182. **Frame blend**: motion blur from the footage's own frames.
183. **Frame strobe**: one frame in N, the rest dark (or a color).
184. **Then / now**: split screen in time, with a moving divider.
185. **Punch-in on cuts**: a short zoom on every cut.
186. **Shake on cuts**: a short camera shake on every cut.
187. **Glitch on cuts**: RGB tearing for a few frames on every cut.
188. **Luma key**: keeps the bright (or dark) parts, the layers below show through.
189. **Green screen**: removes a color (green by default) with spill removal.
190. **Fit on a blurred fill**: the whole footage over a blurred copy (the 9:16 social reframe).
191. **Frame wall**: the last 16 frames as a 4 × 4 wall.
192. **Their sliders are ordinary sliders**: Save, Shuffle, looks and keyframes work on them.

## Reference footage: its pacing and energy, never its footage
193. **🎞 Read ▾ on every video in the Lab's 🖼 References.**
194. **Contact sheet of a reference** with timecodes.
195. **Scene list** of a reference.
196. **Motion curve** of a reference.
197. **Pacing** of a reference (shots, average shot, cuts a minute, in words).
198. **Vibe card** of a reference.
199. **Match this pacing: fitted** to the loop, the footage or the song (`/match-pacing <clip>`): Pace cues at its rhythm.
200. **…with its own shot lengths**, repeated (`/match-pacing <clip> seconds`).
201. **…on the beat** (each cue on the nearest beat of your song) (`… beats`).
202. **…and cut the footage to it** (`… cut`).
203. **…as Hit markers** the sketch reacts to (`audio.hit` fires on its rhythm) (`… hits`).
204. **Pace cues replace the previous ones** (Pace 1, Pace 2…), on frames with footage.
205. **Its motion as keyframes** on a slider or a layer setting (`/ref-motion <clip> <slider>`): calm low, busy high.
206. **Compare my cut's pacing** with a reference (shots, average shot, cuts a minute: faster, slower or about the same) (`/pace-check <clip>`).
207. **Board clips count as reference clips** (pacing, sheets, motion).
208. **The pacing profile is kept with the sketch.**
209. **Load it as footage only when you choose** (More… in its menu).

## Chat commands (area Three.js Lab, `/help footage`)
210. `/footage` — one open command: status, step, go, cut, delete, restore, speed, hold, in, out, roll, repeat, first, last, mute, clear, parts, scenes, cues, shots, zoom, looks, key, layer-part, motion-to, palette, board, editor, sequence, from, render, edl, sheet, motion, pacing, read, still, storyboard, copy, check, time, film, keys, on, off (suggestions as you type).
211. `/shuttle <-8…8|stop>`
212. `/loop-frames <frames>`
213. `/edit-points`
214. `/frame-display <tc|frames|seconds>`
215. `/frame-read [chat]` — the exact frame as a picture, or attached to the chat.
216. `/cut-here [frame]`
217. `/cut-restore [frame]`
218. `/cut-clear`
219. `/cut-keep [from] [to]`
220. `/cut-range [from] [to]`
221. `/cut-scenes [gentle|normal|sensitive]`
222. `/cut-bars [bar|beat|2bars]`
223. `/cut-markers [kick|snare|hit]`
224. `/pace-check <clip>`
225. `/lab-cuts`
226. `/footage-scenes [sensitivity]`
227. `/footage-editor`
228. `/footage-sequence [name]`
229. `/footage-back <sequence>`
230. `/ref-frames <clip> [sheet|scenes|motion|pacing|vibe]`
231. `/match-pacing [clip] [fit|seconds|beats] [cut|hits]`
232. `/ref-motion <clip> <slider>`
233. Short names: `/frames-lab`, `/footage-cut`, `/time-display`, `/read-frame`, `/cut-shots`, `/footage-parts`, `/shot-cues`, `/ref-read`, `/pace-like`.
234. Reference clips, sequences and sensitivities are suggested as you type.
235. The editor's frame commands share their names safely (they act on the Lab's footage only in the Lab): 0 duplicate commands.

## Ctrl+K (palette)
236. Lab footage: go to a frame or timecode…
237. Lab footage: the frames menu
238. Lab footage: cut here
239. Lab footage: remove the part here
240. Lab footage: cut at every shot
241. Lab footage: a cue at every shot
242. Lab footage: contact sheet (exact frames)
243. Lab footage: storyboard of the cut
244. Lab footage: open the cut in the video editor
245. Lab footage: match a reference clip's pacing

## Keys (the keys button, area "Lab timeline"; each also in a menu or a command)
246. All the footage keys are listed in the keys button under "Lab timeline" while footage is loaded (15 lines).
247. The Lab keys sheet (?) lists the footage keys first when footage is loaded.
248. The frame keys work while presenting too (Present passes the timeline's keys on).

## Claude and Astra (the Three Director's tools; lean)
249. **`three_media_control` frame**: go to a frame by number, `"f120"` or timecode, confirmed on screen.
250. **…step n** frames.
251. **…read**: the exact frame now (frame, timecode, what the sketch sees, exact or not).
252. **…read with `see: true`**: plus the frame's picture from the file.
253. **`three_do footage` info**: fps, frames, frame, timecode, parts.
254. **…cuts**: the cut, part by part.
255. **…split / delete / restore** at a frame.
256. **…speed / hold** at a frame.
257. **…keep / clear.**
258. **…in / out / roll / repeat / first / last / mute.**
259. **…cut_scenes / cut_markers / cue.**
260. **…looks / key_cuts / layer_part** (motion design on the cut).
261. **…compare**: the cut's pacing against a reference.
262. **…palette / zoom.**
263. **…sheet / scenes / motion** of the footage or a reference clip (one picture for sheets).
264. **…pacing**: a reference's compact profile (≈300 characters), saying "never its footage".
265. **…match**: pace cues (or `hits`, or `cut`).
266. **…storyboard**: one picture of the sketch at every part.
267. **…editor**: open the cut in Video Review's editor.
268. **Frames in `three_keyframes`** (`{ frame: 48, value }`).
269. **Frames in `three_timeline_edit`** (markers, cues and loops as `"f48"` or timecodes).
270. **Frames in `three_screenshot`** (`at: "f48"`) **and `three_contact_sheet`** (`frames: [12, 24]`).
271. **`three_do media_info`** adds one footage line (fps, frame, timecode, the cut) only when footage is loaded.
272. **`three_do help footage`**: the whole guide, answered by the server (no tokens unless asked).
273. **The app map knows** (the Lab topic and the commands topic each got one line).
274. **Lean**: the tool list grew by 232 characters (≈58 tokens) for both engines; the rest is on demand.
275. **Astra (Codex) gets the same tools** (tested through the real MCP server).
276. **A director call re-sends the footage** to a preview page that lost it.
277. **Full mode lists `three_footage`** as its own tool.

## Smoother timeline (measured with `smoke({ trace })`, numbers below)
278. **The timeline's controls are written only when they change** (a seek used to rewrite them all): DOM changes while stepping 403 → 32–40 a second.
279. **The tempo guesses are rebuilt only when they change.**
280. **The hairline and the tooltip stay still while you drag** (no attribute churn while scrubbing).
281. **A scrub inside one frame does nothing** (painted area while scrubbing 856 → 81 Mpx).
282. **The frame outline redraws per step only when you're zoomed in** enough to see it.
283. **The counter has a fixed width** (no layout per step).
284. **`media.onFrame` callbacks end with their layer** (a re-run layer's old callbacks used to keep running and slowed later layers).

## How it's built
- `tools/three-frames.js` (`ThreeFrames`): the frame math (pure, loads in Node), the footage clock (FrameRead.info /
  ffprobe packet times / our own decoder measurement), the cut list as the video's CutData edit (read and stored
  through `VideoCut.editFor / storeEdit`, two small additive functions in `tools/video-cut.js`), the frames menu,
  drawing, filmstrip, reference pacing, the director handler (`handle(tool, args)`, called first in tools/three.js
  directorCall). It plugs into the Lab player through `player.hooks` (seek / snap / keys / drawing / messages / undo)
  added in `tools/three-media.js`; the player also got `redraw`, `pushUndo`, `shuttleRate`, `view`, `selection`.
- `tools/three-sandbox.html`: the footage clock and cut (`media-clock`, `media-cuts`), a requestVideoFrameCallback
  loop (`media.frame`, `media.onFrame`, `media-frame` replies to steps), whole-frame pauses, part playback (speeds,
  holds at rate 0, muted parts, the scheduled jump before a removed frame).
- `tools/three-frames-cmds.js` (commands, Ctrl+K), `tools/three-frames-templates.js` (21 footage layers),
  `mcp/three-mcp.js` (three_media_control frame / step / read, `three_do footage`), `mcp/three-guide.js` (topic
  footage), `mcp/hearth-map.js` (two lines). CSS at the end of `tools/three-lab.css`.

## Tested
- `node dev/make-lab-footage.js /tmp/labframes-media` makes the test footage: frame-coded clips (24, 25, 29.97, 30 fps,
  silent and with sound; every frame carries its number as a 12-band code) and a reference with known shots.
- `dev/checks/labframes.js` (46 steps, all ✓): silent 24 fps footage with no song — every step read back three ways (the
  counter, `media.frame`, and the number decoded from the pixels the sketch drew): → ×45 = f45, Shift+←, `,` `.`,
  Home, End, a typed timecode, a mouse scrub, J K L (2×, backward), loops / cues / markers / keyframes on exact frames,
  S S Delete → the sketch, playing through the cut, never shows a removed frame; steps skip it; Ctrl+Z; the editor
  holds the same cut, a cut made in the editor reaches the Lab, a sequence round trip; the director's tools; 25 fps
  with sound; 29.97 (f37 = 00:00:01:07); a reference's pacing (5 shots, 0.9 s) and /match-pacing; commands; keys;
  0 duplicate commands.
- `dev/checks/labframes-more.js` (46 steps, all ✓): all 21 footage templates compile and draw; the Footage layer shows the
  exact frame (decoded from its own pixels, f40 then f47); the menus; T; the filmstrip and exact zoomed frames; the
  clock without ffmpeg (measured 30 fps, f33 exact); cues and cuts at shots (0, 30, 45, 90, 105); in / out, roll
  with Alt+, , repeat, first, mute; a held frame and a 0.5× part as the sketch plays them; dragging a cut line,
  double-click to restore, the waveform menu; zoom presets; palette; pin to board; EDL; storyboard; copy; media_info
  and contact sheet by frames; Ctrl+K; the keys sheet; recording the sketch over the cut; pacing as hits, by
  seconds, motion on a slider; board clips as references; the References panel button.
- `dev/checks/labframes-mcp.js` (`--fake-engines`, 10 steps, all ✓): the Three Director through the real MCP server, as Claude then
  Astra: frame "f30", step 5, read with a picture, footage split at frame 48 + cuts, keyframes on frames 24 / 48, help
  footage; Astra: a frame by timecode (f60, exact) and footage info.
- `dev/checks/smooth-labframes.js`: playing, stepping (→ held) and scrubbing footage, before this round → the final run
  (the same machine, but other test runs shared it, so fps and style / layout times swing; the DOM-change and paint
  numbers are the steady ones):
  playing: DOM changes 11 → 11 / s, painted 50 → 29 Mpx, paint 35 → 9 ms;
  stepping: DOM changes **403 → 38 / s**, painted 60 → 45 Mpx, paint 51 → 27 ms, layout 138 → 99 ms;
  scrubbing: DOM changes **158 → 13 / s**, painted **856 → 88 Mpx**, paint 189 → 39 ms, layout 149 → 118 ms.
- `dev/checks/smooth-lab.js` (the music Lab, before → after): playing mutations 16 → 16 / s, painted 52 → 34 Mpx;
  slider drag 48 → 43 / s; dock streaming 78 → 59 / s (fps lower in the after run: the machine was busier).
- Still green: `dev/checks/music.js` (36 steps), `sh dev/journeys.sh lab` (26 steps; one run missed its tap-tempo step at 127 BPM under load, the rerun passed), `dev/checks/qa-commands.js`
  (882 commands, 0 duplicates), `node dev/director-mcp-test.js` (the full-mode tool count moved 32 → 33).

## Not done / notes
- On footage the timeline's K and S keys are the editor's (stop, cut); the Kick / Snare buttons (and their right-click
  fills) still place markers, and ▦ › More… › Frame mode off gives a music video its music keys back.
- Reverse playback (J) steps frames (up to 30 a second): smooth enough to find a moment, not real-time reverse.
- A held frame stops the footage's clock; the Lab's own playhead keeps its smooth glide and is pulled back by the
  sandbox's updates (a small back-step on the timeline at the end of a hold).
- Reversed clips and clips of other files in the editor's edit play in the editor only (the Lab plays this video's
  own parts).
- The cut list ignores the older song trim ({ }) while a cut exists (the cut decides what plays).
- Switching the docked director between Claude and Astra left the Lab preview blank in a test (seemingly before this
  round's changes); director frame calls now re-send the footage, and a separate task was suggested to fix the blank
  preview itself.
- 284 lines, short of the ~350 asked: every line is a working feature, preset or command (the preset families are
  small: speeds, holds, sensitivities); padding with near-duplicates wasn't worth it.
