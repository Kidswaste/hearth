# Three.js Lab upgrades (lab stream)

The Lab was reworked around how you actually use it: music-driven visuals with the Three Director docked,
tapping beats, live sound, saving and shuffling sliders, switching between the four social frame sizes and
freezing frames. The controls you use most are bigger and one click away; the ones you never touched moved into
⋯ menus (they still work, with their usage names). Almost everything is also a chat command (type `/help lab`).

## Layout and navigation
1. **Tabs moved into the Lab's header**: the Lab gains a whole row of height.
2. **The Sketch is the default path**: the other tabs are gone from view; **🧰 Tools ▾** (top right) holds Model viewer, Shader playground, Textures, Docs, Color and Easing, each with a one-line description. `/lab shader`, `/lab-tools`.
3. While a tool is open its name shows as a chip in the header, with **◭ Sketch** to go back.
4. **Esc** in any tool goes back to the Sketch.
5. Tools ▾ → **Open a 3D model…** directly.
6. Tools ▾ → **Paste a shader…**: opens the shader playground with the shader in your clipboard.
7. **One-row toolbar in workflow order**: your sketch, New, Sketch ▾, Run · Sliders, Code, Console, Edit, Present · palette, references, Stage, ⋯.
8. Shorter labels (⚡ Sliders, ✥ Edit, 🖼 with a count, 🖥) so the toolbar fits one row at full width; it wraps tidily beside the docked director.
9. **Lab ⋯ menu** for what you never used: ⛶ Focus, 📷 Screenshot, Insert snippet, three.js version (they keep their usage names).
10. ⋯ → Copy a screenshot to the clipboard.
11. ⋯ → Console mode (always / with the code / when I open it).
12. ⋯ → Live code on / off, Copy all the code, Export HTML.
13. ⋯ → Preview frame rate (Max / 60 / 30).
14. Insert snippet is now a compact searchable-at-a-glance menu instead of a dropdown in the toolbar.
15. three.js version is a menu (current one marked) instead of a toolbar dropdown.
16. **Key hints on hover**: hold the mouse on Run, Restart, Console, Edit, Present, Freeze, Save, Shuffle, Tap, K / S / H, Q, the frame sizes… and a small badge shows its key.
17. Key hints can be turned off (⋯ → Key hints on hover).
18. **Your sketches** picker lists ★ pinned sketches first (pin them in the sketch browser) and shows the count.
19. Right-click **Your sketches**: a quick switcher (pinned + 14 most recent), all as pictures, new sketch.
20. Right-click **New**: the templates as a list (and Duplicate this one).
21. Sketch browser: right-click a sketch → **Open and present**.
22. **Ctrl+PgUp / Ctrl+PgDn**: previous / next sketch. `/sketch next`, `/sketch prev`.
23. **Compact Lab menus**: one line per item (name left, hint right), so long menus stay short; the current choice is marked ●.
24. Timeline menus never run off the top of the screen (they open downward when there's no room) and scroll when long.
25. Lab menus close with Esc.
26. Run: **Shift+click restarts from scratch**.
27. Console button: **right-click** for when it shows, Errors only, Clear, Copy.
28. Console **Errors only** filter (hides console.log lines).
29. Console **Ask director to fix** (shows when there are errors): the errors go into the Three Director's chat box with a request to fix them. `/fix-errors`.
30. Layers: **right-click a layer** for Hide / Show, Solo, Rename, Duplicate, Move up / down / to the top, Opacity 100 / 75 / 50 / 25 %, Blend modes and Delete (with Undo).
31. The never-used ⧉ / 🗑 layer buttons moved into that menu.

## Keys
32. **F freezes** the picture (you freeze a lot; Focus was never used) and **Shift+F** is Focus. `\` still freezes too.
33. **R shuffles** the selected layer's sliders (it opens the panel if it's closed).
34. **Shift+R** goes back to the shuffle before.
35. **Shift+A / Shift+B / Shift+C** recall save slots A / B / C.
36. **Shift+1…5**: Fit, 9:16, 16:9, 4:5, 1:1.
37. **O** opens your sketches as pictures.
38. **`** shows / hides the console.
39. **/** jumps to the slider search.
40. **|** pins the current frame to compare.
41. **Shift+L** turns live sound on / off (remembers system sound or mic).
42. **Q** quantize taps on / off.
43. **Shift+T**: this tap is the 1 (the downbeat).
44. **= / - / 0**: zoom the timeline in / out / whole song.
45. **PgUp / PgDn**: previous / next cue.
46. **Ctrl+Z inside the sliders panel** undoes the slider change (not the timeline).
47. The Lab keys sheet (?) and the shortcut sheet (Ctrl+/) list the new keys.

## Sliders panel
48. **Big Save** (with the number of changes) on its own full-width row with Shuffle.
49. **Save ▾**: into the code, as a look (quick), as a look…, into slot A / B / C, Auto-save.
50. **Shift+click Save** saves the values as a look with a quick name instead of into the code.
51. **Big 🎲 Shuffle** (R).
52. Right-click Shuffle or Save opens its options (same as its ▾).
53. **Shuffle amounts**: Subtle 10 %, Normal 35 %, Bold 60 %, Wild (anywhere in the range). `/shuffle wild`.
54. **Shuffle only some**: everything, ★ favorites, colors, numbers, only what you changed, or what the panel shows (search / group). `/shuffle colors`.
55. **Shuffle one group** from the Shuffle menu. `/shuffle Formation bold`.
56. **Seeded shuffles**: each shuffle has a number; the same seed gives the same shuffle again (shown on the button's tooltip). `/shuffle seed 42`.
57. Shuffle with a typed seed (Shuffle ▾ → Shuffle with a seed…).
58. **Shuffle history ‹ ›**: step back and forward through your shuffles; › at the end makes a new one. `/unshuffle`, `/reshuffle`.
59. Shuffle ▾ lists the recent seeds: click one to go back to it.
60. Copy this shuffle's seed.
61. Forget the shuffle history.
62. Shuffle ▾ → **One control at random**.
63. Shuffle ▾ → **Colors from the palette**: every color slider takes one of the sketch palette's colors. `/shuffle palette`.
64. **Halfway back to the code**: every changed number moves half the way back (tames a wild shuffle). `/tame`.
65. **Exaggerate ×1.5**: pushes your changes further. `/exaggerate`.
66. **Save slots A / B / C**: click an empty slot to store, click a full one to recall (undoable). `/slot A save`, `/slot B`.
67. **Hold a slot to peek** at it; let go to come back.
68. Shift+click a slot to store again, Alt+click to clear, right-click for its menu (incl. Save it as a look).
69. **Morph crossfader** between two slots (numbers and colors blend smoothly, switches flip halfway). `/morph 0.5`.
70. Choose which slots the crossfader morphs (A↔B, B↔C, A↔C); double-click it for halfway.
71. Slot menu → **Swap A and B**. `/morph swap`.
72. **Auto-morph**: the crossfader glides A ↔ B every 1, 2, 4 or 8 bars while the song plays, on top of your values (nothing to save). `/morph auto 4`, `/morph auto off`.
73. **Group chips** (All · each group): one click shows only that group (your slider groups get lots of clicks); again for all. `/slider-group Colors`.
74. **• Changed chip** with a count: only what you moved.
75. **Shift+click a group chip** shuffles that group; **double-click** it puts the group back to the code's values.
76. **Right-click a group header** (or chip): shuffle it subtle / normal / bold / wild.
77. Group menu: back to the code's values, lock the group, unlock it, add all to ★ Favorites, copy its values, only this group.
78. Group menu: **Make it breathe** (each number on a slow wave), **Pulse on the beat**, **Still**.
79. Search shows **“3 of 25”**, also matches group names, **Enter** jumps to the first match, **Esc** clears.
80. **Scrub a number by dragging its name** sideways (Shift: 10× finer, Alt: 100× finer), like Blender / After Effects.
81. Knobs: **Alt** for extra-fine dragging, wheel and arrow steps.
82. Sliders: **Shift / Alt + arrow keys** for finer steps than the slider's own.
83. Right-click a slider → **Type a value…** (with its range shown).
84. Right-click → **Shuffle just this one**.
85. Right-click → **Save just this one** into the code (your other changes stay live). `/save-one speed`.
86. Right-click → **Copy / paste the value** (between sliders of the same kind).
87. **Value history per slider**: right-click lists its last values; click one to go back.
88. Right-click → **🎛 Map to a MIDI knob…** (then turn the knob). `/midi-learn glow`.
89. **Move by itself: Wave (LFO)** with sine / triangle / saw / square shapes, in time with the beat.
90. **Move by itself: Random walk** (drifts around on its own).
91. **Move by itself: Steps on beats** (a new random value every beat or every few).
92. **Move by itself: Pulse on beats** (jumps on each beat and falls back).
93. **Move by itself: Song sections** (lower in quiet parts, higher in loud ones).
94. Motion **rate** (¼ beat … 8 bars) and **depth** per slider; in the ♪ panel or `/move-slider wobble lfo 4 30%`.
95. Motions ride on top of your value (nothing to save, nothing marked changed) and are saved per sketch.
96. Sliders that move by themselves show **∿** on their ♪ button.
97. ⋯ → **Stop every motion**.
98. ⋯ (the sliders') → Reset, Undo the last slider change (both moved here; Reset was rare, Undo never used).
99. ⋯ → **Copy all values / Paste values** (to another layer or sketch). `/copy-sliders`, `/paste-sliders`.
100. ⋯ → **Copy as tweak() code** with the current values as defaults. `/tweak-code`.
101. ⋯ → Lock everything / Unlock everything.
102. ⋯ → Knobs or sliders, Only what I changed, Unused values, One group open at a time (the old checkbox row is gone).
103. ⋯ → Fold every group / Unfold every group.
104. Looks: **Alt+click a look morphs into it** over a second (or right-click → Morph into it). `/look morph Drop`.
105. Looks: right-click → **Store in slot A / B / C**.
106. Looks: **next / previous / random**. `/look next`, `/look random`.
107. The status line is one short line (“3 changes live · Save keeps them”).
108. Ask the director: new one-click chips **React to the kick**, **Change on the drop**, **Fill the 9:16 frame**.
109. A **MIDI-ready mapping hook**: any 0…1 value (a knob, a fader, a command) moves a slider across its range, like your hand would. `/knob glow 0.75`.
110. Fix: shuffle history, motions and slots stay consistent when the code changes shape (they reset or carry over by name).

## Preview
111. **Frame sizes as one segmented control** in the order you use them: 9:16, 16:9, 4:5, 1:1 (plus Fit and More…).
112. The pixel size label only shows while the mouse is over the preview (less clutter).
113. **Your own frame size** (More → Your own size…, remembered). `/size 1440x2560`.
114. Mouse wheel over the size control steps through the sizes.
115. **Right-click a size**: still at that size, record at that size, Stage window at that size, safe zones.
116. **Safe zones for every format**, not just 9:16. `/safe on`.
117. 9:16 safe zones for **TikTok, Reels or Shorts** (right-click Safe). `/safe reels`.
118. 4:5: Instagram's **3:4 profile-grid crop** and the 1:1 center.
119. 16:9, 1:1 and the rest: **title-safe and action-safe** frames.
120. **❚❚ Freeze** is bigger, labeled, and shows ▶ Frozen.
121. **Freeze on the next beat / bar** (right-click Freeze): lands exactly on the beat while it plays. `/freeze beat`.
122. Freeze **on the next kick** marker. `/freeze kick`.
123. While frozen, **double-click Freeze** steps one frame.
124. **◐ Compare**: pin a frame (|) and compare it with what you change next.
125. Compare as an **onion skin** (25 / 50 / 75 % see-through).
126. Compare as a **wipe** with a line you drag (pinned left, live right).
127. Compare as a **difference** (only what changed lights up). `/onion diff`.
128. **Pin when I freeze** option: every freeze also pins the frame (freeze → change → compare).
129. Save the pinned frame.
130. Compare → **Send before / after to the director** (the pinned frame and now). `/frame-to-director compare`.
131. **📷 Still** in the preview: a PNG at the exact frame size, named after the sketch, size and song time. `/still`.
132. Shift+click 📷 copies the still to the clipboard. `/still copy`.
133. Right-click 📷: **a still at 9:16 / 16:9 / 4:5 / 1:1** (the preview switches, shoots and comes back). `/still 4:5`.
134. 📷 menu → **a folder of stills in all four sizes** (9:16, 16:9, 4:5, 1:1 PNGs of the same moment, e.g. covers for each platform). `/stills sizes`.
135. 📷 menu → **a folder of stills at every cue** (or six frames across the song), named by cue. `/stills cues`.
136. 📷 menu → **Send this frame to the director** (attached in its chat). `/frame-to-director`.
137. The preview's own **⋯**: guides, safe zones and platforms, pin, still, Present, Stage window, frame rate.
138. **Present info line (I)**: sketch, size, song time / length, BPM, live sound, fps, frozen.
139. The info line also shows the cue / section you're in.
140. **B in Present: blackout** (fades to black and back). `/blackout`.
141. Present remembers whether the info line was on.
142. **PgUp / PgDn in Present** switch sketches (a live set).
143. **F freezes in Present**.
144. Right-click **Present**: present from the top of the song, present the loop, the info line, Stage window.
145. Double-click beside the picture (the letterbox) to present.
146. The Present hint lists the new keys.

## Timeline and music
147. **Tap is bigger and always in the main row** (even in the compact timeline), next to K / S / H.
148. **Tap confidence**: how even your taps are, in % and as the button's glow.
149. **BPM readout** beside Tap (yellow when it's your grid, ✓ when your taps were steady); click it to type a BPM.
150. Right-click **Tap**: this tap is the 1, ×2, ½, auto, “taps line up the grid” on / off, “round to whole BPM” on / off, forget the taps.
151. **Shift+click Tap** (or Shift+T) puts the 1 at that tap, on the real hit.
152. **Q: quantize taps**: K / S / H land exactly on the grid. `/quantize on`.
153. Right-click Q: quantize to bar, beat, 1/8, 1/16, 1/32.
154. **K / S / H buttons in the main row**; right-click one to fill its row (every beat, 1 and 3, 2 and 4, every bar), copy its times or clear it.
155. **Right-click a marker**: delete, nudge 10 ms earlier / later, onto the grid, onto the real hit, to the playhead, make it another kind (kick ↔ snare ↔ hit…).
156. **Right-click the waveform**: play from here, loop this bar, loop 4 bars, loop this loud / quiet part, remove the loop, cue here, section here, the 1 is here, whole song.
157. **Shift+drag (or Alt+drag) the waveform draws a loop** (the loop buttons you never used moved into ⋯).
158. **The loop as one chip** (beats · seconds): click it to turn looping on / off, × to remove. `/loop 4 bars`, `/loop 0:32 0:48`, `/loop off`.
159. **Hover hairline** over the timeline with the time and the bar.beat under the mouse.
160. The hairline also names the cue / section under the mouse.
161. Double-click the ruler: whole song (or zoom to the loop).
162. **Smooth zoom**: a mouse notch zooms ~1.25×, a trackpad pinch zooms gradually.
163. Alt+wheel pans the timeline (sideways two-finger scrolling too).
164. **View ▾**: beat lines, bar numbers, subdivisions, dim the grid, loud parts, drops (each on / off). `/beat-grid dim`.
165. View ▾ → **Marker lines** over the waveform at any zoom.
166. View ▾ → **Taller timeline**.
167. View ▾ → **Follow the playhead** on / off.
168. **Beat light**: the BPM readout blinks on every beat, red on the 1.
169. **Click track**: a soft click on every beat while it plays, to check the grid by ear. `/click-track`.
170. **Sections ▾ → Mark sections from the song**: Intro / Build / Drop / Break / Outro cues from its loud and quiet parts; looks follow them (right-click a cue). `/sections`.
171. Sections ▾ → a section cue at the playhead (Intro, Verse, Build, Drop, Break, Chorus, Bridge, Outro). `/cue Drop`.
172. Sections ▾ → remove every cue.
173. Right-click a cue → **✦ The current sliders, here**: saves them as a look that plays from that cue.
174. **Each section its own look**: every section cue gets a bold shuffle of the sliders as its look, as rough material to refine (your values come back). `/sections looks`.
175. **Section cues are colored** by kind (drops red, builds orange, intros / outros blue…), on the timeline and the overview.
176. **Trigger Presets ▾ in the timeline** (techno / house, hip-hop / trap, drum & bass, rock, ambient, yours, another song's). `/preset techno`.
177. **Auto bars in the timeline** (opens ⚡ Triggers for 3 s if it's closed, fits the bars, closes it). `/autobars`.
178. Right-click **Set 1 here**: the 1 on the real hit, on the next kick marker, on the first cue, or auto.
179. ◂ ▸ grid shift: **Shift+click 1 ms**, Alt+click 20 ms (5 ms as before).
180. Click the **time** to jump to a typed time. `/song seek 1:20`.
181. **Volume**: mouse wheel steps it, double-click mutes.
182. Right-click **Play**: play from the start, play the loop, speed 1 / ¾ / ½ / ¼.
183. The load button shrinks to 🎵 once a song is loaded (the name shows next to it).
184. Empty timeline groups hide (no Play / Beat buttons without a song, no Loop group without a loop); group labels in the main row are gone; live-sound controls sit together in one group.
185. **Live sound: choose the input** (microphone / line-in).
186. **Live gain** ×0.5…×4. `/live gain 2`.
187. **Live latency offset** 0…300 ms, so the sketch lines up with a speaker or Bluetooth delay. `/live latency 80`.
188. Restart live sound (after changing devices).
189. Right-click **🎧 Live**: straight on / off (system sound or mic, whichever you used last).
190. **Record menu: pick one of your four sizes** before recording.
191. Record at **60 or 30 fps**.
192. Record at **normal or high quality** (16 / 32 Mbps).
193. **3-second countdown** before recording.
194. Record **8 bars from here** (sets the loop to 8 bars from this bar and records it once). `/record 8 bars`.
195. Record **15 / 30 / 60 / 90 s from here** (social lengths). `/record 15s`.
196. Fix: “loop 4 bars” / “loop this bar” at the very start of a song no longer comes out short.

## Ctrl+K palette (each also reachable with /do)
197. Lab: Shuffle the sliders.
198. Lab: The shuffle before.
199. Lab: Recall slot A.
200. Lab: Recall slot B.
201. Lab: Recall slot C.
202. Lab: Store the sliders in slot A.
203. Lab: Store the sliders in slot B.
204. Lab: Save as a look (quick).
205. Lab: Next look.
206. Lab: Freeze on the next beat.
207. Lab: Pin this frame to compare.
208. Lab: Compare off.
209. Lab: Still at the exact frame size.
210. Lab: Safe zones on / off.
211. Lab: Live sound on / off.
212. Lab: Auto bars.
213. Lab: Mark the song's sections.
214. Lab: Click track on / off.
215. Lab: Quantize taps on / off.
216. Lab: Frame 9:16.
217. Lab: Frame 16:9.
218. Lab: Frame 4:5.
219. Lab: Frame 1:1.
220. Lab: Fit the frame.
221. Lab: Next sketch.
222. Lab: Previous sketch.
223. Lab: Tools drawer.

## Chat commands (tools/three-cmds.js, area “Three.js Lab”; `/help lab` lists them)
224. `/lab [tool]` opens the Lab or one of its tools.
225. `/lab-tools` lists the tools.
226. `/lab-state` (or `/lab-status`): sketch, layer, frame, song, BPM, live sound.
227. `/run`.
228. `/restart-sketch`.
229. `/lab-keys`.
230. `/save-sliders` (or `/ss`).
231. `/shuffle [group|colors|numbers|favs|changed|one|palette] [subtle|normal|bold|wild|0.5] [seed N]` (or `/dice`).
232. `/unshuffle` (or `/shuffle-back`).
233. `/reshuffle` (or `/shuffle-forward`).
234. `/shuffle-mode` sets what R and /shuffle do by default.
235. `/tame [0–1]`.
236. `/exaggerate [factor]`.
237. `/slot A|B|C [save|clear]`.
238. `/morph <0–1|%> [A-B|B-C|A-C]`.
239. `/look [name] | next | prev | random | morph <name> | save [name] | delete <name>` (or `/looks`).
240. `/save-look [name]`.
241. `/save-one <slider>`.
242. `/reset-sliders`.
243. `/undo-sliders`.
244. `/copy-sliders`.
245. `/paste-sliders`.
246. `/tweak-code` (copies and shows the tweak() code).
247. `/slider <name> <value>` (numbers, #colors, on / off, choices).
248. `/knob <slider> <0–1>`.
249. `/lock-slider <slider>`.
250. `/unlock-slider <slider>`.
251. `/fav-slider <slider>`.
252. `/move-slider <slider> lfo|walk|beat|pulse|section|off [beats] [depth%] [shape]`.
253. `/follow-music <slider> kick|snare|hats|bass|mid|highs|loudness|beat|off [amount]`.
254. `/midi-learn <slider>`.
255. `/slider-group <group|all>`.
256. `/find-slider <text>`.
257. `/size 9:16|16:9|4:5|1:1|fit|21:9|4:3|2:3|4k|4k-v|WxH` (also tiktok, reels, shorts, youtube, square, feed) (or `/frame`).
258. `/fit`.
259. `/freeze [on|off|beat|bar]`.
260. `/next-frame`.
261. `/onion [pin|onion|wipe|diff|off]` (or `/compare-frame`).
262. `/still [9:16|16:9|4:5|1:1] [copy]`.
263. `/safe [on|off|tiktok|reels|shorts]`.
264. `/guides`.
265. `/present`.
266. `/lab-focus`.
267. `/stage-window`.
268. `/fps max|60|30`.
269. `/show-code [on|off]`.
270. `/sliders [on|off]` (the layers & sliders panel).
271. `/console [show|hide|clear|copy]` (no argument: toggles it and prints the last lines in the chat).
272. `/edit-scene`.
273. `/sketch <name> | new [template] | rename <name> | duplicate | next | prev`.
274. `/sketches [browse]`.
275. `/layer [name] | hide <layer> | show <layer> | solo [layer]` (or `/layers`).
276. `/tap [bpm|one]`.
277. `/bpm <n|x2|half|auto|one>` (or `/tempo`).
278. `/nudge-grid <ms>`.
279. `/live [system|mic|off] | gain <×> | latency <ms>`.
280. `/preset <name>`.
281. `/autobars` (or `/auto-bars`).
282. `/triggers [on|off]`.
283. `/marker kick|snare|hit`, plus the hidden shortcuts `/kick`, `/snare`, `/hit`.
284. `/fill-markers kicks|kicks13|snares|hits`.
285. `/clear-markers <row>`.
286. `/quantize [on|off]`.
287. `/snap <off|bar|beat|1/8|1/16|1/32|hits>`.
288. `/beat-grid lines|numbers|subs|dim|sections|drops|marklines|tall|follow|light|click`.
289. `/loop <start> <end> | <n> bars | bar | off`.
290. `/click-track [on|off]` (or `/metronome`).
291. `/sections`.
292. `/cue [name] | next | prev` (or `/section`).
293. `/cues`.
294. `/song play|pause|seek <t>|speed <r>|mute|load [path]|zoom <a> <b>|all` (no argument: what's loaded).
295. `/record [loop|song|here|stop] [30|60] [hq]`.
296. `/lab-palette [coolors link | #hex …]`.
297. `/recolor`.
298. `/refs`.
299. `/lab-note [text]`.
300. `/contact-sheet`.
301. `/stills cues|sizes`.
302. `/blackout [on|off]`.
303. `/fix-errors`.
304. `/frame-to-director [compare]`.
305. Commands suggest their arguments as you type (slider names, groups, looks, sketches, layers, sizes, presets…).
306. Commands that need the song wait a moment for it when a sketch was just opened, instead of failing.
