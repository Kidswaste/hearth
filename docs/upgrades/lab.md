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
20. **Ctrl+PgUp / Ctrl+PgDn**: previous / next sketch. `/sketch next`, `/sketch prev`.
21. **Compact Lab menus**: one line per item (name left, hint right), so long menus stay short; the current choice is marked ●.
22. Timeline menus never run off the top of the screen (they open downward when there's no room) and scroll when long.
23. Lab menus close with Esc.
24. Run: **Shift+click restarts from scratch**.
25. Console button: **right-click** for when it shows, Errors only, Clear, Copy.
26. Console **Errors only** filter (hides console.log lines).
27. Layers: **right-click a layer** for Hide / Show, Solo, Rename, Duplicate, Move up / down / to the top, Opacity 100 / 75 / 50 / 25 %, Blend modes and Delete (with Undo).
28. The never-used ⧉ / 🗑 layer buttons moved into that menu.

## Keys
29. **F freezes** the picture (you freeze a lot; Focus was never used) and **Shift+F** is Focus. `\` still freezes too.
30. **R shuffles** the selected layer's sliders (it opens the panel if it's closed).
31. **Shift+R** goes back to the shuffle before.
32. **Shift+1…5**: Fit, 9:16, 16:9, 4:5, 1:1.
33. **O** opens your sketches as pictures.
34. **`** shows / hides the console.
35. **/** jumps to the slider search.
36. **|** pins the current frame to compare.
37. **Shift+L** turns live sound on / off (remembers system sound or mic).
38. **Q** quantize taps on / off.
39. **Shift+T**: this tap is the 1 (the downbeat).
40. **= / - / 0**: zoom the timeline in / out / whole song.
41. **PgUp / PgDn**: previous / next cue.
42. **Ctrl+Z inside the sliders panel** undoes the slider change (not the timeline).
43. The Lab keys sheet (?) and the shortcut sheet (Ctrl+/) list the new keys.

## Sliders panel
44. **Big Save** (with the number of changes) on its own full-width row with Shuffle.
45. **Save ▾**: into the code, as a look (quick), as a look…, into slot A / B / C, Auto-save.
46. **Shift+click Save** saves the values as a look with a quick name instead of into the code.
47. **Big 🎲 Shuffle** (R).
48. **Shuffle amounts**: Subtle 10 %, Normal 35 %, Bold 60 %, Wild (anywhere in the range). `/shuffle wild`.
49. **Shuffle only some**: everything, ★ favorites, colors, numbers, only what you changed, or what the panel shows (search / group). `/shuffle colors`.
50. **Shuffle one group** from the Shuffle menu. `/shuffle Formation bold`.
51. **Seeded shuffles**: each shuffle has a number; the same seed gives the same shuffle again (shown on the button's tooltip). `/shuffle seed 42`.
52. Shuffle with a typed seed (Shuffle ▾ → Shuffle with a seed…).
53. **Shuffle history ‹ ›**: step back and forward through your shuffles; › at the end makes a new one. `/unshuffle`, `/reshuffle`.
54. Shuffle ▾ lists the recent seeds: click one to go back to it.
55. Copy this shuffle's seed.
56. Forget the shuffle history.
57. Shuffle ▾ → **One control at random**.
58. Shuffle ▾ → **Colors from the palette**: every color slider takes one of the sketch palette's colors. `/shuffle palette`.
59. **Halfway back to the code**: every changed number moves half the way back (tames a wild shuffle). `/tame`.
60. **Exaggerate ×1.5**: pushes your changes further. `/exaggerate`.
61. **Save slots A / B / C**: click an empty slot to store, click a full one to recall (undoable). `/slot A save`, `/slot B`.
62. **Hold a slot to peek** at it; let go to come back.
63. Shift+click a slot to store again, Alt+click to clear, right-click for its menu (incl. Save it as a look).
64. **Morph crossfader** between two slots (numbers and colors blend smoothly, switches flip halfway). `/morph 0.5`.
65. Choose which slots the crossfader morphs (A↔B, B↔C, A↔C); double-click it for halfway.
66. **Group chips** (All · each group): one click shows only that group (your slider groups get lots of clicks); again for all. `/slider-group Colors`.
67. **• Changed chip** with a count: only what you moved.
68. **Right-click a group header** (or chip): shuffle it subtle / normal / bold / wild.
69. Group menu: back to the code's values, lock the group, unlock it, add all to ★ Favorites, copy its values, only this group.
70. Group menu: **Make it breathe** (each number on a slow wave), **Pulse on the beat**, **Still**.
71. Search shows **“3 of 25”**, also matches group names, **Enter** jumps to the first match, **Esc** clears.
72. **Scrub a number by dragging its name** sideways (Shift: 10× finer, Alt: 100× finer), like Blender / After Effects.
73. Knobs: **Alt** for extra-fine dragging, wheel and arrow steps.
74. Sliders: **Shift / Alt + arrow keys** for finer steps than the slider's own.
75. Right-click a slider → **Type a value…** (with its range shown).
76. Right-click → **Shuffle just this one**.
77. Right-click → **Save just this one** into the code (your other changes stay live). `/save-one speed`.
78. Right-click → **Copy / paste the value** (between sliders of the same kind).
79. **Value history per slider**: right-click lists its last values; click one to go back.
80. Right-click → **🎛 Map to a MIDI knob…** (then turn the knob). `/midi-learn glow`.
81. **Move by itself: Wave (LFO)** with sine / triangle / saw / square shapes, in time with the beat.
82. **Move by itself: Random walk** (drifts around on its own).
83. **Move by itself: Steps on beats** (a new random value every beat or every few).
84. **Move by itself: Pulse on beats** (jumps on each beat and falls back).
85. **Move by itself: Song sections** (lower in quiet parts, higher in loud ones).
86. Motion **rate** (¼ beat … 8 bars) and **depth** per slider; in the ♪ panel or `/move-slider wobble lfo 4 30%`.
87. Motions ride on top of your value (nothing to save, nothing marked changed) and are saved per sketch.
88. Sliders that move by themselves show **∿** on their ♪ button.
89. ⋯ → **Stop every motion**.
90. ⋯ (the sliders') → Reset, Undo the last slider change (both moved here; Reset was rare, Undo never used).
91. ⋯ → **Copy all values / Paste values** (to another layer or sketch). `/copy-sliders`, `/paste-sliders`.
92. ⋯ → **Copy as tweak() code** with the current values as defaults. `/tweak-code`.
93. ⋯ → Lock everything / Unlock everything.
94. ⋯ → Knobs or sliders, Only what I changed, Unused values, One group open at a time (the old checkbox row is gone).
95. ⋯ → Fold every group / Unfold every group.
96. Looks: **Alt+click a look morphs into it** over a second (or right-click → Morph into it). `/look morph Drop`.
97. Looks: right-click → **Store in slot A / B / C**.
98. Looks: **next / previous / random**. `/look next`, `/look random`.
99. The status line is one short line (“3 changes live · Save keeps them”).
100. Ask the director: new one-click chips **React to the kick**, **Change on the drop**, **Fill the 9:16 frame**.
101. A **MIDI-ready mapping hook**: any 0…1 value (a knob, a fader, a command) moves a slider across its range, like your hand would. `/knob glow 0.75`.
102. Fix: shuffle history, motions and slots stay consistent when the code changes shape (they reset or carry over by name).

## Preview
103. **Frame sizes as one segmented control** in the order you use them: 9:16, 16:9, 4:5, 1:1 (plus Fit and More…).
104. The pixel size label only shows while the mouse is over the preview (less clutter).
105. **Your own frame size** (More → Your own size…, remembered). `/size 1440x2560`.
106. Mouse wheel over the size control steps through the sizes.
107. **Right-click a size**: still at that size, record at that size, Stage window at that size, safe zones.
108. **Safe zones for every format**, not just 9:16. `/safe on`.
109. 9:16 safe zones for **TikTok, Reels or Shorts** (right-click Safe). `/safe reels`.
110. 4:5: Instagram's **3:4 profile-grid crop** and the 1:1 center.
111. 16:9, 1:1 and the rest: **title-safe and action-safe** frames.
112. **❚❚ Freeze** is bigger, labeled, and shows ▶ Frozen.
113. **Freeze on the next beat / bar** (right-click Freeze): lands exactly on the beat while it plays. `/freeze beat`.
114. **◐ Compare**: pin a frame (|) and compare it with what you change next.
115. Compare as an **onion skin** (25 / 50 / 75 % see-through).
116. Compare as a **wipe** with a line you drag (pinned left, live right).
117. Compare as a **difference** (only what changed lights up). `/onion diff`.
118. **Pin when I freeze** option: every freeze also pins the frame (freeze → change → compare).
119. Save the pinned frame.
120. **📷 Still** in the preview: a PNG at the exact frame size, named after the sketch, size and song time. `/still`.
121. Shift+click 📷 copies the still to the clipboard. `/still copy`.
122. Right-click 📷: **a still at 9:16 / 16:9 / 4:5 / 1:1** (the preview switches, shoots and comes back). `/still 4:5`.
123. The preview's own **⋯**: guides, safe zones and platforms, pin, still, Present, Stage window, frame rate.
124. **Present info line (I)**: sketch, size, song time / length, BPM, live sound, fps, frozen.
125. Present remembers whether the info line was on.
126. **PgUp / PgDn in Present** switch sketches (a live set).
127. **F freezes in Present**.
128. Right-click **Present**: present from the top of the song, present the loop, the info line, Stage window.
129. Double-click beside the picture (the letterbox) to present.
130. The Present hint lists the new keys.

## Timeline and music
131. **Tap is bigger and always in the main row** (even in the compact timeline), next to K / S / H.
132. **Tap confidence**: how even your taps are, in % and as the button's glow.
133. **BPM readout** beside Tap (yellow when it's your grid, ✓ when your taps were steady); click it to type a BPM.
134. Right-click **Tap**: this tap is the 1, ×2, ½, auto, “taps line up the grid” on / off, “round to whole BPM” on / off, forget the taps.
135. **Shift+click Tap** (or Shift+T) puts the 1 at that tap, on the real hit.
136. **Q: quantize taps**: K / S / H land exactly on the grid. `/quantize on`.
137. Right-click Q: quantize to bar, beat, 1/8, 1/16, 1/32.
138. **K / S / H buttons in the main row**; right-click one to fill its row (every beat, 1 and 3, 2 and 4, every bar), copy its times or clear it.
139. **Right-click a marker**: delete, nudge 10 ms earlier / later, onto the grid, onto the real hit, to the playhead, make it another kind (kick ↔ snare ↔ hit…).
140. **Right-click the waveform**: play from here, loop this bar, loop 4 bars, loop this loud / quiet part, remove the loop, cue here, section here, the 1 is here, whole song.
141. **Shift+drag (or Alt+drag) the waveform draws a loop** (the loop buttons you never used moved into ⋯).
142. **The loop as one chip** (beats · seconds): click it to turn looping on / off, × to remove. `/loop 4 bars`, `/loop 0:32 0:48`, `/loop off`.
143. **Hover hairline** over the timeline with the time and the bar.beat under the mouse.
144. Double-click the ruler: whole song (or zoom to the loop).
145. **Smooth zoom**: a mouse notch zooms ~1.25×, a trackpad pinch zooms gradually.
146. Alt+wheel pans the timeline (sideways two-finger scrolling too).
147. **View ▾**: beat lines, bar numbers, subdivisions, dim the grid, loud parts, drops (each on / off). `/beat-grid dim`.
148. View ▾ → **Marker lines** over the waveform at any zoom.
149. View ▾ → **Taller timeline**.
150. View ▾ → **Follow the playhead** on / off.
151. **Beat light**: the BPM readout blinks on every beat, red on the 1.
152. **Click track**: a soft click on every beat while it plays, to check the grid by ear. `/click-track`.
153. **Sections ▾ → Mark sections from the song**: Intro / Build / Drop / Break / Outro cues from its loud and quiet parts; looks follow them (right-click a cue). `/sections`.
154. Sections ▾ → a section cue at the playhead (Intro, Verse, Build, Drop, Break, Chorus, Bridge, Outro). `/cue Drop`.
155. Sections ▾ → remove every cue.
156. **Section cues are colored** by kind (drops red, builds orange, intros / outros blue…), on the timeline and the overview.
157. **Trigger Presets ▾ in the timeline** (techno / house, hip-hop / trap, drum & bass, rock, ambient, yours, another song's). `/preset techno`.
158. **Auto bars in the timeline** (opens ⚡ Triggers for 3 s if it's closed, fits the bars, closes it). `/autobars`.
159. Right-click **Set 1 here**: the 1 on the real hit, on the next kick marker, on the first cue, or auto.
160. ◂ ▸ grid shift: **Shift+click 1 ms**, Alt+click 20 ms (5 ms as before).
161. Click the **time** to jump to a typed time. `/song seek 1:20`.
162. **Volume**: mouse wheel steps it, double-click mutes.
163. Right-click **Play**: play from the start, play the loop, speed 1 / ¾ / ½ / ¼.
164. The load button shrinks to 🎵 once a song is loaded (the name shows next to it).
165. Empty timeline groups hide (no Play / Beat buttons without a song, no Loop group without a loop); group labels in the main row are gone; live-sound controls sit together in one group.
166. **Live sound: choose the input** (microphone / line-in).
167. **Live gain** ×0.5…×4. `/live gain 2`.
168. **Live latency offset** 0…300 ms, so the sketch lines up with a speaker or Bluetooth delay. `/live latency 80`.
169. Restart live sound (after changing devices).
170. **Record menu: pick one of your four sizes** before recording.
171. Record at **60 or 30 fps**.
172. Record at **normal or high quality** (16 / 32 Mbps).
173. **3-second countdown** before recording.
174. Fix: “loop 4 bars” / “loop this bar” at the very start of a song no longer comes out short.

## Ctrl+K palette (each also reachable with /do)
175. Lab: Shuffle the sliders.
176. Lab: The shuffle before.
177. Lab: Recall slot A / B / C (3 actions).
178. Lab: Store the sliders in slot A / B.
179. Lab: Save as a look (quick).
180. Lab: Next look.
181. Lab: Freeze on the next beat.
182. Lab: Pin this frame to compare.
183. Lab: Compare off.
184. Lab: Still at the exact frame size.
185. Lab: Safe zones on / off.
186. Lab: Live sound on / off.
187. Lab: Auto bars.
188. Lab: Mark the song's sections.
189. Lab: Click track on / off.
190. Lab: Quantize taps on / off.
191. Lab: Frame 9:16 / 16:9 / 4:5 / 1:1 / Fit (5 actions).
192. Lab: Next sketch / Previous sketch.
193. Lab: Tools drawer.

## Chat commands (tools/three-cmds.js, area “Three.js Lab”; `/help lab` lists them)
194. `/lab [tool]` opens the Lab or one of its tools.
195. `/lab-tools` lists the tools.
196. `/lab-state` (or `/lab-status`): sketch, layer, frame, song, BPM, live sound.
197. `/run`.
198. `/restart-sketch`.
199. `/lab-keys`.
200. `/save-sliders` (or `/ss`).
201. `/shuffle [group|colors|numbers|favs|changed|one|palette] [subtle|normal|bold|wild|0.5] [seed N]` (or `/dice`).
202. `/unshuffle` (or `/shuffle-back`).
203. `/reshuffle` (or `/shuffle-forward`).
204. `/shuffle-mode` sets what R and /shuffle do by default.
205. `/tame [0–1]`.
206. `/exaggerate [factor]`.
207. `/slot A|B|C [save|clear]`.
208. `/morph <0–1|%> [A-B|B-C|A-C]`.
209. `/look [name] | next | prev | random | morph <name> | save [name] | delete <name>` (or `/looks`).
210. `/save-look [name]`.
211. `/save-one <slider>`.
212. `/reset-sliders`.
213. `/undo-sliders`.
214. `/copy-sliders`.
215. `/paste-sliders`.
216. `/tweak-code` (copies and shows the tweak() code).
217. `/slider <name> <value>` (numbers, #colors, on / off, choices).
218. `/knob <slider> <0–1>`.
219. `/lock-slider <slider>`.
220. `/unlock-slider <slider>`.
221. `/fav-slider <slider>`.
222. `/move-slider <slider> lfo|walk|beat|pulse|section|off [beats] [depth%] [shape]`.
223. `/follow-music <slider> kick|snare|hats|bass|mid|highs|loudness|beat|off [amount]`.
224. `/midi-learn <slider>`.
225. `/slider-group <group|all>`.
226. `/find-slider <text>`.
227. `/size 9:16|16:9|4:5|1:1|fit|21:9|4:3|2:3|4k|4k-v|WxH` (also tiktok, reels, shorts, youtube, square, feed) (or `/frame`).
228. `/fit`.
229. `/freeze [on|off|beat|bar]`.
230. `/next-frame`.
231. `/onion [pin|onion|wipe|diff|off]` (or `/compare-frame`).
232. `/still [9:16|16:9|4:5|1:1] [copy]`.
233. `/safe [on|off|tiktok|reels|shorts]`.
234. `/guides`.
235. `/present`.
236. `/lab-focus`.
237. `/stage-window`.
238. `/fps max|60|30`.
239. `/show-code [on|off]`.
240. `/sliders [on|off]` (the layers & sliders panel).
241. `/console [show|hide|clear|copy]` (no argument: toggles it and prints the last lines in the chat).
242. `/edit-scene`.
243. `/sketch <name> | new [template] | rename <name> | duplicate | next | prev`.
244. `/sketches [browse]`.
245. `/layer [name] | hide <layer> | show <layer> | solo [layer]` (or `/layers`).
246. `/tap [bpm|one]`.
247. `/bpm <n|x2|half|auto|one>` (or `/tempo`).
248. `/nudge-grid <ms>`.
249. `/live [system|mic|off] | gain <×> | latency <ms>`.
250. `/preset <name>`.
251. `/autobars` (or `/auto-bars`).
252. `/triggers [on|off]`.
253. `/marker kick|snare|hit`, plus the hidden shortcuts `/kick`, `/snare`, `/hit`.
254. `/fill-markers kicks|kicks13|snares|hits`.
255. `/clear-markers <row>`.
256. `/quantize [on|off]`.
257. `/snap <off|bar|beat|1/8|1/16|1/32|hits>`.
258. `/beat-grid lines|numbers|subs|dim|sections|drops|marklines|tall|follow|light|click`.
259. `/loop <start> <end> | <n> bars | bar | off`.
260. `/click-track [on|off]` (or `/metronome`).
261. `/sections`.
262. `/cue [name] | next | prev` (or `/section`).
263. `/cues`.
264. `/song play|pause|seek <t>|speed <r>|mute|load [path]|zoom <a> <b>|all` (no argument: what's loaded).
265. `/record [loop|song|here|stop] [30|60] [hq]`.
266. `/lab-palette [coolors link | #hex …]`.
267. `/recolor`.
268. `/refs`.
269. `/lab-note [text]`.
270. `/contact-sheet`.
271. Commands suggest their arguments as you type (slider names, groups, looks, sketches, layers, sizes, presets…).
272. Commands that need the song wait a moment for it when a sketch was just opened, instead of failing.
