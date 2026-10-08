# Video stream: Video Review, Video Director and After Effects

Built around how you actually use it: music-driven visuals for 9:16 / 16:9 / 4:5 / 1:1, made in the Three.js Lab and
After Effects, reviewed with the director. The two header buttons nobody clicked ("💬 Video Director" and "⋯ Toolkit")
are gone: one slim **Review · Director · Toolkit** switch sits in the review's own top bar. Everything below also works
from any chat with the `/commands` listed at the end (type `/help video`).

## Layout (13)
1. **One review surface**: render library on the left, player + timeline in the middle, notes on the right.
2. **Compact header**: the tool's title row is folded into the review's top bar (title, size, format, codec, bitrate, age).
3. **Review · Director · Toolkit** segmented switch (gold chrome) replaces the two unused header buttons.
4. **Director** segment shows / hides the docked Video Director chat.
5. **Set up a Video Director** in one click when none exists (Claude, docked in Video Review, video tools on).
6. **Toolkit drawer**: the After Effects kit slides over the right side instead of replacing the review (✕ or Esc closes).
7. **Hide the library** (☰ or B) for a bigger player; remembered.
8. **Fits beside the Director chat**: below ~940 px the library becomes a drawer over the player and the top bar slims down.
9. **Very narrow**: notes move under the player instead of disappearing.
10. **Transport in groups** (play · time · speed/fps/loop · tools) with icon buttons; rare actions live in ⋯.
11. **⋯ More** menu: export, presets, proxy, contact sheet, frame copy/save, frame rate, tags, folders, rescan, ffmpeg, show file, shortcuts.
12. **Forgeheart skin** for the review: cut corners, gold play button, square cards and notes.
13. **Mac default folders**: Desktop, Documents/Codex and Movies/Hearth (Windows paths no longer hard-coded).

## Library (30)
14. **Format chips** 9:16 · 16:9 · 4:5 · 1:1 filter the library (sizes are read in the background).
15. **Format badge** on every thumbnail, color-coded per aspect.
16. **Favorites** (☆ in the top bar, right-click, `/fav`): starred renders float to the top.
17. **★ chip** shows only favorites.
18. **Tags** (right-click → Tags…, `/tag`), shown on the card.
19. **Search** matches names, folders, `#tags`, sizes (`1080x1350`) and formats.
20. **"✎ Open notes" chip**: only renders with unresolved notes.
21. **Lab chip + LAB badge** for Three.js Lab recordings.
22. **Lab recordings show up wherever you saved them** (the Lab tells Video Review after each recording).
23. **Exports made here** also appear, even outside the watched folders.
24. **Sort menu (⇅)**: newest, oldest, name, longest, shortest, biggest, most notes.
25. **Group versions** (v1, v2, final, (2)…) into one card with "v3 · 3 versions" (toggle in ⇅).
26. **Length filter**: under 15 s, 15–60 s, over a minute.
27. **Date filter**: last 24 h, this week, this month.
28. **Project filter** (the render's folder).
29. **Hover scrub**: move the mouse across a thumbnail to flip through 8 frames of the clip, with a progress line.
30. **Open-notes count** badge on cards.
31. **Shown / total** count under the list.
32. **Live refresh**: watched folders are watched for changes (new renders pop up within a second or two; the 20 s rescan stays as a fallback).
33. **Sizes and lengths remembered** between sessions (cards show them immediately).
34. **Right-click a card**: open, compare as B, favorite, tags, export, playable copy, show in Finder/Explorer, open in default player, copy path, forget a Lab recording, Move to Trash.
35. **Alt/Shift+click a card** opens it as B (compare).
36. **Copy path** of a render.
37. **Move to Trash** (asks first; uses the system Trash).
38. **Playable copy (H.264 proxy)** for ProRes / huge renders that Chromium can't decode (ffmpeg).
39. **"Folders…"** link under the library; `/video-folders add|remove`.
40. **Smart version labels**: real version numbers (v1, v2…) instead of "−1, −2" when the name has one.
41. **Version chips in the top bar**: click opens, Alt+click / right-click compares.
42. **Versions understood**: `_v3`, ` v3`, `rev3`, `(2)`, `_003`, `final`, `copy`, `1080x1920` suffixes.
43. **Card highlights** the open video (gold) and the B side (blue stripe).

## Player (52)
44. **Frame-accurate stepping**: steps land on frame centers, so every press shows exactly the next frame.
45. **Exact frame rate from the file** via ffprobe when installed.
46. **Frame rate measured** from the decoder while playing when ffprobe isn't there.
47. **Frame-rate menu** (10 rates incl. 23.976, 29.97, 59.94, 120), remembered per file.
48. **Frame number** readout next to the timecode.
49. **J / K / L shuttle**: L 1×→2×→4×→8×, J the same backwards, K stops.
50. **Reverse playback** (J) even though browsers can't play backwards.
51. **9 speeds** (0.1× to 4×), `[` / `]` to change.
52. **Type a time** in the timecode box: `1:23`, `12.5`, `00:00:04:12`, `f240`, `+10f`, `-2s`, `50%`.
53. **Time display**: timecode, seconds or frames (click the total or T).
54. **Loop by dragging** along the top strip of the timeline.
55. **Adjust a loop**: drag its edges or move it as a block; a click clears it.
56. **I / O** set in / out at the playhead; **X** clears; **Shift+L** turns looping on/off.
57. **Ping-pong loop** (back and forth).
58. **Double-click a section** of the timeline to loop it (from the audio analysis).
59. **Timeline ruler** with seconds.
60. **Audio waveform** under the timeline (decoded from the video).
61. **Beat markers** on the waveform (downbeats brighter), from the Lab's beat tracker.
62. **Drops** marked in red.
63. **Tempo readout** (bpm · beats).
64. **Filmstrip** faintly behind the waveform.
65. **Hover preview**: frame thumbnail, timecode and beat number above the timeline.
66. **Note markers** in their category color (resolved ones fade).
67. **, / .** jump to the previous / next beat.
68. **< / >** jump to the previous / next section or drop.
69. **↑ / ↓** jump between notes.
70. **Home / End**.
71. **Zoom at the cursor** with the mouse wheel (up to 32×).
72. **Pan** by dragging when zoomed (or the middle button).
73. **Z**: 100% (real pixels) ↔ fit; double-click fits.
74. **Zoom %** shown in the corner.
75. **Right-click the frame**: note, draw, pick color, copy/save frame, zoom fit / 100% / 200%.
76. **Color picker** (P or ◉): hex, RGB and luma %, copied and added to your next note.
77. **Histogram** (RGB + luma) of the paused frame (Y or ▤).
78. **Luma waveform** scope.
79. **Crushed / clipped %** under the scopes.
80. **Red / green / blue channel** views (◐ or V).
81. **Luma view** (values only, no color).
82. **Negative view**.
83. **High-contrast view** to spot banding.
84. **Saturation-boost view** to spot dull areas.
85. **Mirror** the frame (H) for fresh eyes.
86. **Volume** (- / =), remembered; **M** mutes.
87. **Fullscreen review** (F or ⛶): player, timeline and transport together.
88. **On-screen HUD** for speed, modes and toggles.
89. **Copy frame** (⌘/Ctrl+C) and **save PNG** (⌘/Ctrl+S, right-click ⧉), drawings included.
90. **Contact sheet** of the whole video (⋯ → save, `/sheet` attaches it to the chat).
91. **Unsupported codec** message offers "Make a playable copy".
92. **Keyboard sheet** (?): every shortcut in one list.
93. **Faster when hidden**: the player stops redrawing while Video Review isn't on screen and nothing plays.
94. **Codec, bitrate and audio** facts from ffprobe in the top bar.
95. **Picked color chip** stays on screen (click to copy again).

## Compare A/B (12)
96. **Wipe**: drag anywhere on the frame to move the split line.
97. **Side by side** with the right proportions (the frame doubles in width).
98. **Onion skin** (B at 50% over A).
99. **Difference** (identical pixels go black: shows exactly what changed between versions).
100. **Flip** (B only).
101. **C cycles** compare modes.
102. **Swap A ⇄ B** (\ key).
103. **B offset in frames** for versions with a longer intro.
104. **A / B labels** with file names.
105. **B keeps its own proportions** when it has a different shape than A.
106. **Compare menu** lists versions first, then recent renders, then "choose a file".
107. **Compare mode remembered**.

## Social safe zones, guides and crops (21)
108. **TikTok** UI zones (top tabs, right buttons, caption + sound) with the clear area.
109. **Instagram Reels** zones.
110. **YouTube Shorts** zones.
111. **Facebook Reels** zones.
112. **Snapchat Spotlight** zones.
113. **"Safe on every vertical app"** (TikTok + Reels + Shorts combined).
114. **Instagram feed 4:5 grid crop** (the profile grid shows 3:4).
115. **YouTube player** (progress bar + title overlay) for 16:9.
116. Zones are **labeled** and warn when made for another aspect.
117. **Center cross** guide.
118. **8×8 grid** guide.
119. **Golden ratio** guide.
120. **Diagonals** guide.
121. **S / G** cycle safe zones / guides that fit the open video.
122. **Crop preview** to 4:5, 1:1, 9:16 or 16:9 with the outside dimmed.
123. **Drag the crop** to choose what stays; the export uses that position.
124. **"Keeps N%"** readout on the crop.
125. **Crop recipes** (`/crop 4:5`): what each conversion keeps and which export to use.
126. **▦ overlay menu** lists the zones that fit first.
127. **1080×1350 from 1080×1920** in two steps: `/crop 4:5`, drag, `/export feed45`.
128. **Title / action safe** updated to modern 93% / 90%.

## Notes and feedback (39)
129. **Inline note box** (N): no dialog; Enter saves, Shift+Enter new line, Esc cancels.
130. **8 categories**: timing, color, text, motion, audio/sync, framing, effects, general.
131. **Category guessed** from the words when you don't pick one.
132. **Alt+1…8** picks a category while typing.
133. **Draw on the frame** (D or ✎).
134. **Arrow** tool.
135. **Circle** tool.
136. **Box** tool.
137. **Freehand** tool.
138. **5 marker colors**.
139. **Undo last mark**.
140. **Drawings burned into the frame grab** that goes with the note.
141. **Drawings reappear** on the frame when you're paused on that note.
142. **Resolve** checkbox (strikes the note through); **reopen** by unticking.
143. **Hide resolved** notes.
144. **Show one category**.
145. **Edit a note** by double-clicking its text.
146. **Delete with Undo**.
147. **❗ Must fix** flag: urgent notes go first in feedback.
148. **Right-click a note**: go there, loop 1 s around it, must-fix, resolve, move to the playhead, copy, show the frame file, change category, delete.
149. **Move a note to the playhead** (⟲ in the note box, or right-click).
150. **Change category** from the chip on a note.
151. **Note numbers** (#1, #2…) used by `/resolve 2`, `/goto #3`.
152. **Director notes** marked "Director".
153. **Carry open notes to a newer version** (⋯ in Notes, `/carry-notes`) to tick them off there.
154. **Carried-over marker** (↪) on those notes.
155. **Export notes as Markdown** checklist.
156. **Export as CSV** (file, timecode, seconds, frame, category, status, note, color, author, frame grab).
157. **Export as JSON**.
158. **Copy as a Markdown checklist**.
159. **Resolve all** / **delete resolved notes**.
160. **Notes inbox** across every render (`/inbox`).
161. **Older notes upgraded** automatically (ids, categories, "Claude:" prefix → Director).
162. **Send feedback** to the Video Director (open notes + frame grabs in its chat box, new chat to keep it cheap).
163. **Send to Claude** (▾ next to Send).
164. **Send to Astra** for a second opinion.
165. **Send with a contact sheet** of the whole video.
166. **Include resolved notes** when you want the full history.
167. **Feedback lists the format and categories** so the agent knows what kind of fix each note is.

## Export for socials (34)
168. **TikTok** preset (1080×1920, 30 fps, 12 Mbps, AAC 256k) with limits and tips.
169. **Instagram Reels** preset.
170. **YouTube Shorts** (60 fps) preset.
171. **Instagram / Facebook feed 4:5** preset.
172. **Square 1:1** preset.
173. **YouTube 1080p** preset.
174. **YouTube 1440p** ("better encode" upscale trick).
175. **YouTube 4K** preset.
176. **X / Twitter 16:9** preset.
177. **X / Twitter vertical** preset.
178. **Snapchat Spotlight** preset.
179. **Pinterest 2:3** preset.
180. **LinkedIn 1:1** preset.
181. **Vimeo 1080p high quality** preset.
182. **Review proxy** (small H.264).
183. **ProRes 422 HQ master**.
184. **WebM (VP9)** for websites.
185. **GIF loop** (palette-optimized).
186. **Export with ffmpeg** in one click (⋯ → Export, `/export reels`), into `exports/` next to the render.
187. **Crop / fit / blurred-fill** when the shape changes (`/export tiktok blur`).
188. **Exports the loop range** when a loop is set.
189. **Uses your crop position** from the crop preview.
190. **All social formats in one go** (`/export-all`), with crop or blurred fill.
191. **File-size estimate** for each preset in the menu.
192. **Progress with Cancel** in the corner; "Open" when done.
193. **Open the exports folder**.
194. **Presets & tips sheet** (bitrate, fps, codec, audio, limits, platform tips).
195. **Matching After Effects output-module templates** listed per preset when AE is installed.
196. **ffmpeg found automatically** (Homebrew, MacPorts, winget, Chocolatey, Scoop, PATH).
197. **ffmpeg path setting** (⋯ → ffmpeg…) with the install command when missing.
198. **Clear message** when ffmpeg isn't installed: the preset's settings are shown to use in AE / Media Encoder instead.
199. **Exports rescanned** into the library automatically ("New render" toast).
200. **Blurred-fill** look (dimmed, blurred copy behind the fitted video).
201. **Even sizes and faststart MP4s** (plays while it downloads).

## After Effects on the Mac (and Windows) (20)
202. **Finds AE in /Applications or ~/Applications**, newest first, release before Beta.
203. **Spotlight fallback** when AE lives somewhere else.
204. **AE folder override** accepts the version folder or the .app itself.
205. **Clear "not installed" message** per platform (in the Toolkit banner, `/ae-status`, renders and scripts).
206. **Scripts run through AppleScript** (DoScriptFile) and report whether AE accepted them.
207. **Automation permission explained**: when macOS blocks Hearth, you get the exact Settings path.
208. **Other osascript errors** turned into plain words.
209. **AE is brought to the front** when a script runs.
210. **Long scripts / AE still starting** report "sent" instead of hanging.
211. **AE running?** shown in `/ae-status`.
212. **AE version** shown.
213. **aerender missing** reported with the folder it looked in.
214. **Render output folders created** before aerender writes.
215. **Shortcut reference in Mac keys** (⌘ ⌥ ⇧, fn for Page Up/Down).
216. **Project finder looks in Movies** on a Mac.
217. **Script failures shown** instead of a silent "sent".
218. **⌘Z / Ctrl+Z** named correctly in messages.
219. **Mac test** (`node dev/test-aemain-mac.js`) checks locating, overrides, osascript and the permission error.
220. **Windows**: also finds AE on D:\Program Files and accepts the version folder as override.
221. **Errors from the main process** shown without "Error invoking remote method…" noise.

## After Effects kit additions (26)
222. **Music expressions** group (listed first).
223. **Scale from audio amplitude**.
224. **Opacity from audio amplitude**.
225. **Glow / any effect from amplitude**.
226. **Kick shake** (amplitude threshold).
227. **Beat strobe** (BPM).
228. **Snap motion to the beat** (stepped by BPM).
229. **Rotate a step every bar**.
230. **Beat bounce**.
231. **Hue cycles with the bars**.
232. **Wiggle only on loud parts**.
233. **Script: duplicate the comp for every social format** (9:16, 4:5, 1:1, 16:9, fill or fit).
234. **Script: social safe-zone guide layer** (TikTok / Reels / Shorts / all; never renders).
235. **Script: beat markers from BPM** (bar numbers on downbeats).
236. **Script: audio to keyframes** on the selected layer.
237. **Script: work area to the comp markers**.
238. **Comp preset: Shorts / Reels / TikTok 60 fps**.
239. **Comp preset: Instagram story**.
240. **Comp preset: Spotify Canvas**.
241. **Comp preset: Pinterest 2:3**.
242. **Comp preset: LinkedIn / Facebook 4:5**.
243. **Comp preset: YouTube 1440p**.
244. **Comp preset: X vertical**.
245. **Comp preset: Facebook cover video**.
246. **4 more bitrate targets** (Shorts 60 fps, IG feed, Spotify Canvas, X 1080p).
247. **Toolkit tabs reachable from chat** (`/toolkit calc`) and Ctrl+K (color, easing added).

## Video Director (the agent) (8)
248. **video_control** tool: play, pause, seek, step, loop, speed, safe zone, guide, crop, compare mode, resolve a note.
249. **video_export** tool: exports a preset with ffmpeg and waits for it.
250. **Note categories** for the director's notes.
251. **Compare modes** for the director (wipe, side, onion, difference, flip).
252. **Richer status**: format, frame, fps source, loop, bpm, compare mode, overlay, resolved/urgent notes.
253. **video_list** gives format, length, Lab flag and open-note counts.
254. **Long exports allowed** by the bridge (45 min limit like renders).
255. **Pipeline description** (`Review.pipeline()`, `/pipeline`): source → render → review → feedback → export as nodes and edges, each with its chat command, ready for the node view.

## Ctrl+K palette (15)
256. Video: export for social…
257. Video: export presets and tips
258. Video: Video Director chat
259. Video: show / hide the library
260. Video: fullscreen review
261. Video: scopes
262. Video: TikTok safe zone
263. Video: Reels safe zone
264. Video: Shorts safe zone
265. Video: crop preview 4:5
266. Video: copy frame
267. Video: send feedback to the director
268. Video: keyboard shortcuts
269. AE color tool
270. AE easing curves

## Chat commands (54) — area "Video"
271. `/video [name]` opens Video Review.
272. `/videos [filter]` lists renders (text, #tag, 9:16, fav, lab, notes).
273. `/review <name|number|latest>` opens a render.
274. `/fav` favorites the open video.
275. `/tag <tags>` (`-` clears).
276. `/video-folders [add|remove <folder>]`.
277. `/play`.
278. `/pause`.
279. `/step ±n`.
280. `/goto <time | #note>`.
281. `/speed <x>`.
282. `/loop <in> <out> | beats <n> | off`.
283. `/fps <rate>`.
284. `/zoom fit|100|<percent>`.
285. `/fullscreen`.
286. `/scopes`.
287. `/safe tiktok|reels|shorts|facebook|snapchat|all|feed45|youtube|off`.
288. `/guide safe|thirds|center|grid|golden|diag|off`.
289. `/crop 4:5|1:1|9:16|16:9|off`.
290. `/formats`.
291. `/compare <a> [b] [wipe|side|onion|diff|flip]` or `/compare off`.
292. `/swap`.
293. `/note <text> [#category] [@time]`.
294. `/notes [open|md|csv|json|copy]`.
295. `/resolve <n…|all>`.
296. `/reopen <n>`.
297. `/unnote <n>`.
298. `/draw [arrow|circle|rect|free]`.
299. `/carry-notes [version]`.
300. `/grab [copy|save|chat|note]`.
301. `/send-feedback [director|claude|astra] [sheet] [all]`.
302. `/export <preset> [crop|fit|blur]`.
303. `/presets [preset]`.
304. `/proxy`.
305. `/ae-status`.
306. `/render <comp> [preset]` or `/render <project.aep> <comp> [preset]` (renders with aerender, then exports the preset).
307. `/ae-run <script name | code>`.
308. `/toolkit [tab]`.
309. `/director`.
310. `/sheet [frames]` attaches a contact sheet to the chat.
311. `/pipeline [preset]`.
312. `/view r|g|b|luma|invert|contrast|sat|normal`.
313. `/mirror`.
314. `/pingpong`.
315. `/volume <0-100>`.
316. `/timecode tc|sec|frames`.
317. `/section [next|prev]`.
318. `/inbox`.
319. `/urgent <n>`.
320. `/export-all [crop|blur|fit]`.
321. `/ae-open [name]`.
322. `/ae-comp <format> [seconds] [fps]`.
323. `/video-keys`.
324. `/video-status`.

Shared names (`/play`, `/note`, `/export`…) that another tool also registers are combined: inside Video Review (or its
director chat) they drive the video, anywhere else they keep doing what the other tool does.

**Total: 324 upgrades.**

Tested headless (`node dev/smoke.js` with ffmpeg-made test clips in all four social shapes, a beat track and versions):
library + filters, frame stepping, goto, notes with drawings and frame grabs, all compare modes, safe zones, crop,
scopes, views, exports (crop and blurred fill checked frame by frame), the toolkit drawer, Director setup + feedback,
and the director's tools. Not run for real: After Effects itself (no AE here; the Mac paths are covered by
`dev/test-aemain-mac.js` with a fake AE and osascript).
