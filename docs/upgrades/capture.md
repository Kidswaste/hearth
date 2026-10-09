# Capture (round 7): Hearth screenshots and records itself, and reads any video exactly

For your intro video for socials and for the chats. One entry on screen: **⋯ in the rail → ◉ Capture** (or ⌘/Ctrl+Alt+S, or `/capture`). Everything else is in that menu's submenus, right-click menus on every capture, keys (listed in the keys list) and chat commands (`/capture-help`).
Files go to the captures folder (`data/captures`: shots, recordings, frames, sheets, made; `/capture-folder` to change it). Tested headless (Electron + Xvfb, ffmpeg 6): see the end.

## The one menu, keys and progressive disclosure

1. ◉ Capture in the rail's ⋯ menu: the only new thing on screen (plus the REC light while recording).
2. The capture menu: screenshot of this tool first, then submenus (Screenshot of…, Social frame…, Beautified…, Record…, Tours…), Captures, Read frames, Settings.
3. Submenus open in place with a "‹ back" row (works with the plain menus and with the declutter stream's submenus).
4. ⌘/Ctrl+Alt+S opens the capture menu anywhere, even while the Lab's sandboxed preview has the keyboard (the key is caught in the main process).
5. ⌘/Ctrl+Alt+A: screenshot of a region you drag or a thing you click.
6. ⌘/Ctrl+Alt+R: start / stop recording Hearth.
7. ⌘/Ctrl+Alt+P: pause / resume the recording.
8. ⌘/Ctrl+Alt+V: your captures.
9. ⌘/Ctrl+Alt+T: pick a tour, or stop the running one.
10. Hold Alt while a capture menu opens: every item at once (no More…).
11. Every key, modifier and right-click gesture is registered with the keys list (Keys.add, area "Capture"): 59 entries.
12. Every keyed action is also in a menu and a chat command.
13. 17 Ctrl+K palette actions ("Capture: …"): screenshot of this tool / the window / a region / the tall chat / the Lab / a beautified post shot / 9:16, record / stop, record a region, pause, captures, read frames, tours, the menu, a GIF / PNG frames / 9:16 copy of the newest recording.
14. `/capture-help`: everything capture does, with its keys and commands.

## Screenshots of Hearth itself

15. Whole window (`/shot window`), at the screen's real pixels (2× on a Retina Mac).
16. This tool or chat only, without the rail (`/shot tool`).
17. The chat messages (`/shot chat`).
18. The whole chat as one tall picture: it scrolls and stitches, nothing re-rendered (`/shot transcript`, `/shot last 10` for the last 10 messages).
19. The docked director chat (`/shot dock`).
20. The Lab preview at its exact frame size (1080×1920 for 9:16), from the Lab's own renderer (`/shot lab`).
21. `/shot lab 9:16` (or 16:9, 4:5, 1:1): the Lab renders at that size for the shot and goes back.
22. The chat box (`/shot composer`), the rail (`/shot rail`), the chats list (`/shot panel`).
23. Any part by CSS selector (`/shot .three-preview`, `/shot sel:#rail`), for tours and the AI.
24. A region you drag, or a thing you click: the picker outlines what's under the pointer (`/shot region`).
25. The picker shows the size in real pixels while you drag.
26. Delay with a countdown for hover states (`/shot 3s`, `/shot delay 5`, the "In 3 seconds" menu item).
27. Clean: no toasts, menus, scrollbars, carets or focus rings in the picture (`/shot clean`).
28. No rail and chats list: the content gets the whole width (`/shot norail`).
29. Pixel size: screen pixels (sharp on Retina) or 1× CSS size (`/shot 1x`).
30. PNG (default), JPEG or WebP (`/shot jpg`, `/shot webp`).
31. Copy to the clipboard as it saves (`/shot copy`, Settings → also copy).
32. Attach it to the chat you're in (`/shot attach`); it goes through the attachments folder so Claude can read it.
33. Annotate right after (`/shot annotate`).
34. Beautify at the same time (`/shot pretty`, `/shot window violet`).
35. Burst: N shots every S seconds (`/shot burst 5 1s`).
36. Shots are named after what they show and when ("Hearth Lab 9x16 2026-10-09 …").
37. A toast with Open after each shot (`quiet` for tours and the AI).
38. `/shot` / `/screenshot` share their name with the chat's own version: with a target, frame or option word it takes a capture; plain `/screenshot` still attaches the window to your message.
39. HiDPI correct in every target: rectangles follow Hearth's zoom setting.

## Social frames (crop or fit, exact sizes)
Each frame crops a shot (or a recording) to its exact pixels: `/shot tool 9:16`, `/crop-shot 4:5`, Social frame… in the menus, "All sizes…" in a searchable picker.

40. 9:16: Reels / TikTok / Shorts / Stories, 1080×1920.
41. 4:5: Instagram / Facebook feed (portrait), 1080×1350.
42. 1:1: Square post, 1080×1080.
43. 16:9: YouTube / landscape video, 1920×1080.
44. 3:4: Instagram grid (3:4), 1080×1440.
45. 2:3: Pinterest pin, 1000×1500.
46. 4:3: Classic 4:3, 1440×1080.
47. 3:2: Photo 3:2, 1620×1080.
48. 5:4: Print 5:4, 1350×1080.
49. 21:9: Cinematic 21:9, 2560×1080.
50. 1.91:1: Link card (og:image 1200×628), 1200×628.
51. 2:1: GitHub social preview (1280×640), 1280×640.
52. 3:1: X / Twitter header (1500×500), 1500×500.
53. 4:1: LinkedIn banner (1584×396), 1584×396.
54. yt-thumb: YouTube thumbnail (1280×720), 1280×720.
55. x-post: X / Twitter post image (1600×900), 1600×900.
56. dribbble: Dribbble shot (1600×1200), 1600×1200.
57. ph-gallery: Product Hunt gallery (1270×760), 1270×760.
58. iphone: App Store iPhone 6.9″ (1290×2796), 1290×2796.
59. ipad: App Store iPad 13″ (2064×2752), 2064×2752.
60. mac-store: Mac App Store (2880×1800), 2880×1800.
61. 4k: 4K UHD (3840×2160), 3840×2160.
62. story-safe: Story with safe zones (1080×1920), 1080×1920 (safe zones shaded).
63. Fill (crop the sides, centered) or Fit (the whole picture on its own blurred colors): `/crop-shot 9:16 fit`.
64. Words work too: reels, tiktok, story, square, feed, youtube, cinematic, og, thumbnail, banner…
65. Free sizes and ratios: `/crop-shot 1500x500`, `/shot tool 7:5`.

## Beautified shots for posts
A shot on a background with padding, rounded corners, a shadow and a window bar: `/beautify`, Beautify… in a picture's right-click menu, or `/shot pretty`.

66. Look "clean": Clean: white, soft shadow.
67. Look "forge": Forge: ember gradient, Mac window.
68. Look "violet": AI violet, Mac window.
69. Look "studio": Studio: dark, big shadow.
70. Look "glass": Glass: its own colors blurred.
71. Look "dribbble": Dribbble: peach, browser.
72. Look "launch": Launch day: sunset, Mac window.
73. Look "minimal": Minimal: paper, thin bar.
74. Look "night": Neon night, no bar.
75. Look "aurora": Aurora, Windows bar.
76. Look "phone": Phone: bezel on a gradient.
77. Look "flat": Flat: no padding, rounded.
78. Look "keyable": Green screen, no shadow (for compositing).
79. Look "rainbow": Hearth rainbow.
80. Look "chrome": Chrome metal.
81. Your own mix, remembered: Beautify → Background / Padding / Corners / Shadow / Window bar, or `/beautify bg:nebula pad:l corners:24 shadow:strong bar:mac`.
82. Background "forge": Forge ember (`/beautify bg:forge`).
83. Background "molten": Molten (`/beautify bg:molten`).
84. Background "gold": Gold leaf (`/beautify bg:gold`).
85. Background "violet": AI violet (`/beautify bg:violet`).
86. Background "ice": Ice glass (`/beautify bg:ice`).
87. Background "midnight": Midnight (`/beautify bg:midnight`).
88. Background "aurora": Aurora (`/beautify bg:aurora`).
89. Background "sunset": Sunset (`/beautify bg:sunset`).
90. Background "peach": Peach (`/beautify bg:peach`).
91. Background "ocean": Ocean (`/beautify bg:ocean`).
92. Background "lime": Lime soda (`/beautify bg:lime`).
93. Background "candy": Candy (`/beautify bg:candy`).
94. Background "grape": Grape (`/beautify bg:grape`).
95. Background "royal": Royal (`/beautify bg:royal`).
96. Background "mint": Mint (`/beautify bg:mint`).
97. Background "rose": Rose gold (`/beautify bg:rose`).
98. Background "neon": Neon night (`/beautify bg:neon`).
99. Background "rainbow": Hearth rainbow (`/beautify bg:rainbow`).
100. Background "chrome": Chrome (`/beautify bg:chrome`).
101. Background "paper": Paper (`/beautify bg:paper`).
102. Background "white": White (`/beautify bg:white`).
103. Background "black": Black (`/beautify bg:black`).
104. Background "charcoal": Charcoal (`/beautify bg:charcoal`).
105. Background "studio": Studio grey (`/beautify bg:studio`).
106. Background "spot": Spotlight (`/beautify bg:spot`).
107. Background "blur": Its own colors, blurred (`/beautify bg:blur`).
108. Background "none": Transparent (`/beautify bg:none`).
109. Background "green": Green screen (key it out) (`/beautify bg:green`).
110. Background "blue": Blue screen (key it out) (`/beautify bg:blue`).
111. Background "sand": Sand dune (`/beautify bg:sand`).
112. Background "forest": Forest (`/beautify bg:forest`).
113. Background "cherry": Cherry (`/beautify bg:cherry`).
114. Background "steel": Steel (`/beautify bg:steel`).
115. Background "lavender": Lavender (`/beautify bg:lavender`).
116. Background "cyber": Cyber (`/beautify bg:cyber`).
117. Background "dusk": Dusk (`/beautify bg:dusk`).
118. Background "tropical": Tropical (`/beautify bg:tropical`).
119. Background "berry": Berry (`/beautify bg:berry`).
120. Background "sky": Sky (`/beautify bg:sky`).
121. Background "coral": Coral (`/beautify bg:coral`).
122. Background "slate": Slate (`/beautify bg:slate`).
123. Background "onyx": Onyx (`/beautify bg:onyx`).
124. Background "pearl": Pearl (`/beautify bg:pearl`).
125. Background "sakura": Sakura (`/beautify bg:sakura`).
126. Background "matrix": Matrix (`/beautify bg:matrix`).
127. Background "lagoon": Lagoon (`/beautify bg:lagoon`).
128. Background "citrus": Citrus (`/beautify bg:citrus`).
129. Background "plum": Plum (`/beautify bg:plum`).
130. Background "arctic": Arctic (`/beautify bg:arctic`).
131. Background "copper": Copper (`/beautify bg:copper`).
132. Background "jade": Jade (`/beautify bg:jade`).
133. Background "noir": Noir (`/beautify bg:noir`).
134. Background "velvet": Velvet (`/beautify bg:velvet`).
135. Background "solar": Solar flare (`/beautify bg:solar`).
136. Background "nebula": Nebula (mesh) (`/beautify bg:nebula`).
137. Background "forge-mesh": Forge glow (mesh) (`/beautify bg:forge-mesh`).
138. Background "aurora-mesh": Aurora (mesh) (`/beautify bg:aurora-mesh`).
139. Background "candy-mesh": Candy (mesh) (`/beautify bg:candy-mesh`).
140. Background "ocean-mesh": Deep ocean (mesh) (`/beautify bg:ocean-mesh`).
141. Window bar: No window bar (`bar:none`).
142. Window bar: Mac window (traffic lights) (`bar:mac`).
143. Window bar: Windows title bar (`bar:win`).
144. Window bar: Minimal bar (three dots) (`bar:minimal`).
145. Window bar: Browser with an address bar (`bar:browser`).
146. Window bar: Phone bezel (`bar:phone`).
147. Padding: No padding (`pad:none`).
148. Padding: Small (`pad:s`).
149. Padding: Medium (`pad:m`).
150. Padding: Large (`pad:l`).
151. Padding: Huge (`pad:xl`).
152. Corners: Square (`corners:0`).
153. Corners: Soft (`corners:8`).
154. Corners: Round (`corners:14`).
155. Corners: Rounder (`corners:24`).
156. Corners: Very round (`corners:40`).
157. Shadow: No shadow (`shadow:none`).
158. Shadow: Soft (`shadow:soft`).
159. Shadow: Medium (`shadow:medium`).
160. Shadow: Strong (`shadow:strong`).
161. Mesh gradients (soft blobs of color) as a background kind.

## Annotation (✎ on any picture, `/annotate`)

162. Select / move (key V).
163. Arrow (key A).
164. Line (key L).
165. Box (key R).
166. Circle (key O).
167. Pen (key P).
168. Highlighter (key H).
169. Text (key T).
170. Number badge (1, 2, 3…) (key N).
171. Blur (hide private bits) (key B).
172. Pixelate (key X).
173. Redact (solid box) (key D).
174. Spotlight (dim the rest) (key S).
175. Magnifier (loupe) (key M).
176. Crop (key C).
177. Color Ember (keys 1–9, 0; the swatch menu).
178. Color Gold (keys 1–9, 0; the swatch menu).
179. Color Red (keys 1–9, 0; the swatch menu).
180. Color Violet (keys 1–9, 0; the swatch menu).
181. Color Blue (keys 1–9, 0; the swatch menu).
182. Color Green (keys 1–9, 0; the swatch menu).
183. Color Pink (keys 1–9, 0; the swatch menu).
184. Color White (keys 1–9, 0; the swatch menu).
185. Color Black (keys 1–9, 0; the swatch menu).
186. Color Cyan (keys 1–9, 0; the swatch menu).
187. Thickness Thin ([ and ]).
188. Thickness Medium ([ and ]).
189. Thickness Thick ([ and ]).
190. Thickness Extra thick ([ and ]).
191. Shapes stay editable until you save: V selects, drag moves, Delete removes, double-click edits text.
192. Shift keeps lines at 45° and boxes square.
193. Numbered badges count up by themselves.
194. Spotlights dim everything outside all of them together.
195. Blur, pixelate and redact read the original picture (nothing leaks through).
196. Undo / redo (⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z, ⌘/Ctrl+Y), save (⌘/Ctrl+S), copy (⌘/Ctrl+C).
197. Save makes a new file "… annotated.png"; the original stays.
198. → Chat saves and attaches it.
199. The six everyday tools on the bar, the rest behind ⋯; your tool, color and thickness are remembered.

## Recording Hearth itself

200. `/record` (outside the Lab, or `/record app …` anywhere) and `/rec`: record Hearth; the Lab's own `/record` still records the sketch in the Lab.
201. The page records itself (its own frame): no other windows, no OS cursor, nothing private around it.
202. The REC light is a tiny window of its own, on top of Hearth but never in the picture.
203. The REC light is also hidden from macOS / Windows screen recordings and screenshots (content protection).
204. The REC light has ❚❚ and ■ buttons, the time, markers and the tour step.
205. Countdown before it starts (Settings → Countdown, `/record countdown 5`, `/record now`).
206. Pause and resume; the pause isn't in the file.
207. Markers while recording (`/record mark drop`), saved with the file.
208. Markers show on the player's scrub bar (click to jump, M for the next one) and become notes in Video Review.
209. Longest take: it stops by itself (`/record 15s`, Settings → Longest take).
210. What to record: the window, this tool, the chat, the dock, the Lab preview, the chat box, a region or a thing you pick, or a CSS selector (`/record lab`, `/record region`).
211. A steady clock: frames at the chosen rate whether or not the screen changes, so the file is the real length.
212. Takes into a social frame (`/record 9:16`): recorded at the screen's own pixels in that shape, the MP4 scaled to exactly 1080×1920.
213. 1080p / 720p / 4K output sizes (`/record 1080p`).
214. Hearth's own sound (the Lab's music, previews) on Mac and Windows alike (`/record sound`).
215. Your microphone, alone or mixed with Hearth's sound (`/record mic`, `/record both`).
216. The whole computer's sound on Windows (`/record system`); on a Mac it explains once that this needs extra software and records Hearth's sound instead.
217. Recorded straight to disk while it records (a long take never sits in memory).
218. The WebM is fixed after recording (duration and seeking) when ffmpeg is there.
219. An MP4 too (H.264 + AAC, constant frame rate, fast start) for editors and uploads; cut to the real length.
220. Encoder per platform: H.264 on Mac / Windows (their hardware encoders), VP9 elsewhere; an encoder that gives two empty takes is skipped for the session.
221. A slow-starting encoder gets a moment before the stop, so short takes aren't lost.
222. The cursor drawn into the picture, as you like (`/cursor-fx`, Settings → Cursor).
223. Click effects drawn into the picture (Settings → Clicks).
224. The keys you press shown at the bottom (`/keys-overlay on`, `/record keys`); letters typed in a box aren't shown.
225. Hide toasts while recording (Settings, and on by default for the promo / reel / social presets).
226. While recording, tour and cursor animations run so every frame reaches the file; outside recordings they stay on the compositor (smooth UI).
227. A tiny repaint poke when nothing changed for a moment, so a lone change is never lost between frames.
228. The effects layer is a zero-size box (a full-window layer on top would make every captured frame cost a full composite).
229. After a take: a toast with Open; the recording is listed in Video Review's library.
230. One click opens it in Video Review, in the editor timeline, adds it to the current edit, or loads it in the Lab as media (the capture's menu).
231. `/record status`, `/record pause`, `/record resume`, `/record stop` (stops the Lab's recording when that's what runs).
232. `/window-size 1920x1080`: the window's content at an exact size for a clean 16:9 (or 4:5…) take; `/window-size reset`.
233. `/record-presets`: the presets and your default.
234. Preset "quick": Quick: window, 30 fps, good quality (`/record quick`).
235. Preset "smooth": Smooth: 60 fps, high quality (`/record smooth`).
236. Preset "promo": Promo: 60 fps, very high quality, MP4, clicks shown (`/record promo`).
237. Preset "reel": Reel: 9:16 1080×1920, 60 fps, MP4 (`/record reel`).
238. Preset "square": Square post: 1080×1080, 30 fps, MP4 (`/record square`).
239. Preset "feed": Feed: 4:5 1080×1350, 30 fps, MP4 (`/record feed`).
240. Preset "youtube": YouTube: 1920×1080, 60 fps, MP4 (`/record youtube`).
241. Preset "tutorial": Tutorial: cursor, clicks and keys shown, voice (`/record tutorial`).
242. Preset "voice": Voice-over: your microphone only (`/record voice`).
243. Preset "draft": Draft: small file, 24 fps (`/record draft`).
244. Preset "gif": GIF-ready: 15 fps, 720p (`/record gif`).
245. Preset "master": Master: 60 fps, near lossless (big files) (`/record master`).
246. Preset "lab": Lab preview only, 60 fps (`/record lab`).
247. Preset "chat": The chat only, 30 fps (`/record chat`).
248. Preset "cinema": Cinematic 24 fps, 21:9 (`/record cinema`).
249. Quality Draft (3 Mb/s).
250. Quality Good (8 Mb/s).
251. Quality High (16 Mb/s).
252. Quality Very high (30 Mb/s).
253. Quality Master (50 Mb/s).
254. 15 frames per second.
255. 24 frames per second.
256. 25 frames per second.
257. 30 frames per second.
258. 50 frames per second.
259. 60 frames per second.
260. Sound: No sound.
261. Sound: Hearth's own sound (the Lab's music, previews).
262. Sound: Your microphone.
263. Sound: Hearth's sound + your microphone.
264. Sound: The whole computer's sound (Windows only).
265. Cursor: No cursor drawn.
266. Cursor: Dot.
267. Cursor: Ring.
268. Cursor: Soft yellow halo.
269. Cursor: Spotlight (dims around the cursor).
270. Cursor: Big arrow.
271. Cursor: Pointing hand.
272. Cursor: Crosshair.
273. Cursor: Violet glow.
274. Cursor: Square focus box.
275. Clicks: No click effect.
276. Clicks: Ring ripple.
277. Clicks: Burst.
278. Clicks: Soft pulse.
279. Clicks: Double ring.
280. Clicks: Square.
281. Clicks: Gold spark.
282. Countdown: none.
283. Countdown: 3 seconds.
284. Countdown: 5 seconds.
285. Countdown: 10 seconds.
286. Longest take: no limit.
287. Longest take: 10 s.
288. Longest take: 15 s.
289. Longest take: 30 s.
290. Longest take: 1 min.
291. Longest take: 2 min.
292. Longest take: 5 min.
293. Longest take: 10 min.

## Tours: hands-free, repeatable recordings
A tour is plain text, one step per line, run with the real UI. `/tour` picks one, `/tour intro` runs one, `/tour edit`, `/tour new`, `/tour steps`, `/tour run "open three; wait 1s; shot lab"`. Esc stops it.

294. The editor: name, steps, a live check (unknown steps or commands), the steps list, Save, Run, Delete.
295. Your tours are saved (kv `capture-tours`) next to the built-in ones.
296. The cursor glides to what it clicks (a tour always shows its cursor).
297. Things are found by selector, by their words ("Run", "Send") or by name (tool, chat, lab, composer…).
298. Everything a tour changed comes back at the end: zoom, tilt, blur, overlays, hidden parts, window size, clean mode, the recording it started.
299. Tours hide toasts and menus while they run.
300. The REC light shows the tour's step ("tour 3/12").
301. A toast at the end: steps, shots, the recording (Open) or why steps were skipped.
302. A real Esc (or ⌘/Ctrl+Alt+T) stops a tour; a tour's own "key Escape" doesn't.
303. Commands run in the chat on screen (Lab commands in the Lab).
304. `key Ctrl+;` and `key Ctrl+K` open the command bar and the palette (they are caught before the page).
305. Step `record [preset] [9:16] [60fps] [sound]`: Start recording (the rest of the tour is filmed).
306. Step `stop`: Stop recording (the file opens when the tour ends).
307. Step `open <three | ae | board | chat | claude | astra | tool id>`: Show a tool or a chat.
308. Step `wait <1.5s | 800ms>`: Wait.
309. Step `cmd </command args>`: Run a chat command in the chat on screen.
310. Step `type "<text>" [fast|slow]`: Type into the chat box like a person.
311. Step `send`: Send what was typed.
312. Step `click <selector | "Button text">`: Glide the cursor there and click.
313. Step `hover <selector | "text">`: Glide the cursor there.
314. Step `move <x> <y> [0.8s]`: Glide the cursor to a point (pixels or 0..1 of the window).
315. Step `key <Ctrl+K>`: Press keys (shown when the keys overlay is on).
316. Step `zoom <selector | x y> [1.6] [1s]`: Zoom the view into something.
317. Step `zoom out [1s]`: Back to the whole window.
318. Step `pan <x> <y> [1s]`: Move the zoomed view.
319. Step `caption "<text>" [2.5s] [lower|subtitle|top|center|pill|typewriter]`: Words on screen.
320. Step `title "<title>" ["subtitle"] [2s] [forge|clean|glass|rainbow]`: A title card over the app.
321. Step `highlight <selector | "text"> [2s]`: Spotlight one thing.
322. Step `scroll <selector> <pixels>`: Scroll something smoothly.
323. Step `shot [target] [9:16]`: Take a screenshot.
324. Step `mark "<label>"`: A marker in the recording (shown in the viewer and Video Review).
325. Step `pause / resume`: Pause / resume the recording.
326. Step `cursor <dot|ring|halo|spotlight|arrow|off>`: Cursor style while filming.
327. Step `clean on|off`: Hide toasts, menus and scrollbars.
328. Step `theme <name>`: Switch Hearth's look.
329. Step `size <1920x1080>`: Resize the window content exactly (restored after the tour).
330. Step `fade in|out [0.6s]`: Fade the picture from / to black.
331. Step `say "<text>"`: A note in the chat (not sent).
332. Step `esc`: Close menus and dialogs.
333. Step `tilt <x°> [y°] [1s]`: Tilt the whole app in 3D (camera move).
334. Step `spin <deg> [1s]`: Rotate the view.
335. Step `push <selector> [1.3] [3s]`: A slow push in (Ken Burns).
336. Step `shake [strength] [0.4s]`: Camera shake.
337. Step `whip out|in [left|right] [0.35s]`: Whip pan out (blurred) and back in, between scenes.
338. Step `flash [white|gold|#hex] [0.25s]`: A flash frame.
339. Step `blur in|out [0.6s]`: Focus pull from / to blur.
340. Step `letterbox on|off [2.39]`: Cinema bars.
341. Step `vignette on|off`: Darker corners.
342. Step `grain on|off`: Film grain over the picture.
343. Step `watermark "<text>" [corner] | off`: A small mark in a corner for the whole take.
344. Step `timecode on|off`: A running clock in the corner.
345. Step `progress on|off`: A thin bar showing the tour's progress.
346. Step `confetti [count]`: A burst of Hearth-colored confetti.
347. Step `emoji "🔥" [x y]`: A big emoji pop.
348. Step `ease <smooth|snappy|slow|linear>`: Easing for the next moves and zooms.
349. Step `bpm <120>`: Tempo for beat waits.
350. Step `beat [n]`: Wait n beats (sync a tour to music).
351. Step `drag <from> <to> [0.8s]`: Press, glide and release (sliders, timelines).
352. Step `hide <selector> / show <selector>`: Hide a part of the app for the take (back after the tour).
353. Tour "hello": Hello Hearth (10 s) (`/tour hello`).
354. Tour "intro": App intro for socials (≈30 s) (`/tour intro`).
355. Tour "lab": Lab glow-up (≈15 s) (`/tour lab`).
356. Tour "sizes": Frame sizes parade (≈12 s) (`/tour sizes`).
357. Tour "commands": Chat commands showcase (≈15 s) (`/tour commands`).
358. Tour "palette": Command bar (≈10 s) (`/tour palette`).
359. Tour "looks": Looks parade (≈12 s) (`/tour looks`).
360. Tour "review": Video Review tour (≈12 s) (`/tour review`).
361. Tour "shots": Screenshots of every tool (no recording) (`/tour shots`).
362. Tour "reel": Vertical reel of the Lab (9:16) (`/tour reel`).
363. Tour "cinematic": Cinematic intro (bars, tilt, push, whip) (`/tour cinematic`).
364. Tour "beat": On the beat (120 BPM cuts) (`/tour beat`).
365. Tour "kinetic": Kinetic words (text-led) (`/tour kinetic`).
366. Tour "tutorial": Tutorial style (cursor, clicks, keys) (`/tour tutorial`).
367. Tour "zooms": Zoom showcase (UI details) (`/tour zooms`).
368. Tour "clean-ui": Clean UI shots of each screen (no rail) (`/tour clean-ui`).
369. Tour "social-set": Screenshots in all four social sizes (`/tour social-set`).
370. Tour "square-post": Square post (1:1) of the chats (`/tour square-post`).
371. Tour "glitch": Glitchy transitions (`/tour glitch`).
372. Tour "watermarked": Watermarked walkthrough with a clock (`/tour watermarked`).
373. Tour "celebrate": Celebration ending (`/tour celebrate`).
374. Caption style "lower": Lower third (left, bottom).
375. Caption style "subtitle": Subtitle (centered, bottom).
376. Caption style "top": Top banner.
377. Caption style "center": Big centered words.
378. Caption style "pill": Small pill (top right).
379. Caption style "typewriter": Typewriter (letters appear).
380. Caption style "kinetic": Kinetic (words pop in one by one).
381. Caption style "neon": Neon sign.
382. Caption style "glass": Frosted glass card.
383. Caption style "tag": Gold tag (left).
384. Caption style "quote": Quote (big quotation marks).
385. Caption style "bubble": Chat bubble.
386. Caption style "label": Small caps label (top left).
387. Caption style "outline": Huge outlined words.
388. Title card "forge": Forge: gold on ember.
389. Title card "clean": Clean: white on black.
390. Title card "glass": Glass over the app.
391. Title card "rainbow": Hearth rainbow.
392. Title card "neon": Neon on black.
393. Title card "minimal": Minimal: small and calm.
394. Title card "gradient": Violet gradient.
395. Title card "split": Split: title left, subtitle right.
396. Title card "chrome": Chrome letters.
397. Title card "ember": Ember glow.
398. Title card "paper": Paper and ink.
399. Title card "mono": Monospace terminal.
400. Easing "smooth" for moves and zooms (`ease smooth`).
401. Easing "snappy" for moves and zooms (`ease snappy`).
402. Easing "slow" for moves and zooms (`ease slow`).
403. Easing "linear" for moves and zooms (`ease linear`).

## Captures: library, player, viewer

404. `/captures` (⌘/Ctrl+Alt+V): a grid of your shots and recordings, newest first.
405. Filter: all, pictures, videos.
406. Search by name.
407. Sort: newest, oldest, biggest, by name (⋯ → Sort).
408. Videos play only while hovered (nothing runs in the background).
409. Drag a capture out as a real file: into a chat (it attaches), the board, Finder / Explorer, After Effects.
410. Alt+click a capture: attach it to the chat.
411. Double-click: open; right-click: everything.
412. The grid refreshes when a new capture lands.
413. `/capture-last`: open the newest capture.
414. The player: exact frame stepping with the true frame rate (ffprobe), the shown frame confirmed by requestVideoFrameCallback.
415. ←/→ or , and . one frame; Shift ten frames; Home / End; Space or K play; J half a second back; L faster.
416. Timecode + frame number readout; click it for seconds or ms.
417. Scrub bar with recording markers (click a marker to jump; M for the next).
418. Speed: 0.1× to 2× (click to step, right-click to pick).
419. I / O set a part (shown on the bar), X clears it; G makes a GIF of it.
420. C copies the frame on screen, S saves it, Enter sends it to the chat.
421. R or 🎞 Read: read frames; ✂ Make: GIF, trim, timelapse…
422. The info line: size, fps (variable when it is), frames, markers.
423. Pictures: wheel to zoom, drag to pan, double-click to fit, 0 to fit, A annotate, C copy, Enter → chat.

## One right-click menu for every capture (library, player, viewer, read results)

424. Play / Open.
425. Copy the picture (or the frame on screen).
426. → Chat (videos attach their contact sheet, never the file).
427. → Chat… (pick which chat).
428. Open in Video Review.
429. Open in the editor timeline.
430. Add to the edit (when the editor is open).
431. Add to the Lab as media.
432. Read frames… (contact sheet, scenes, motion, pacing, palette, every 10 frames, true fps, more).
433. Annotate.
434. Beautify… (looks and your mix).
435. Social frame… (crop or fit, all sizes).
436. Make… (everything below in "Made from a video").
437. Make an MP4 (from a WebM).
438. Show in folder.
439. Open with the system app.
440. Copy the path.
441. Move to the Trash (never a permanent delete).

## Frame reader: any video, exactly
For your reference footage and recordings. `/frames <video | last | open> <mode> …`, Read frames… in menus, `capture_frames` for the AI. With ffmpeg: frame-exact; without: the player's own frames, confirmed.

442. The time of every frame from the file's packets (fast, no decoding), sorted, edit-list aware: 29.97, VFR phone footage, B-frames and odd start times all land on the exact frame.
443. A frame by number (`f120`, `#120`), by time (`1.5`, `0:02.250`, `250ms`) or by timecode (`00:00:01:12`, counted at the video's own rate: 29.97 counts 30 a second).
444. Negative numbers count from the end (frame -1 is the last).
445. The grab: a fast seek before the frame, then an exact trim between frame N-1 and N: pixel-identical to ffmpeg decoding everything (tested).
446. Many frames: parallel seeks on long videos, one decoding pass when dense; scaled pictures (width) in PNG / JPEG / WebP.
447. Results are cached per file (probe, frame times, curves).
448. Without ffmpeg: a hidden player seeks to the middle of the frame and requestVideoFrameCallback confirms which frame it showed (retries until exact; tested on every test frame).
449. Without ffmpeg the frame rate is measured from playback and snapped to 23.976 / 24 / 25 / 29.97 / 30 / 50 / 59.94 / 60 / 120.
450. Without ffmpeg scenes and motion are measured from ≤ 240 sampled frames.
451. A labelled contact sheet drawn in Hearth: header with size, fps, frame count, duration; timecode under each frame.
452. A motion chart picture: motion energy, brightness and cuts over time, busiest moments marked.
453. The results panel: frames with timecodes (click to open, drag out, right-click), the text, → Chat (a sheet when many), copy, folder.
454. Pick a video: the newest recording, what Video Review shows, or any file.
455. `/frame-at f120 last chat`: one exact frame, attached.
456. `/scenes`, `/contact`, `/pacing`, `/motion-curve`, `/frame-palette`: the common readings as their own commands.
457. Add `chat` to any `/frames` command to attach the pictures instead of showing them.
458. Reading "at": Exact frame at a time / frame / timecode (<time | f120 | 00:00:01:12>).
459. Reading "every": Every N frames (<N>).
460. Reading "spread": N frames spread evenly (<N>).
461. Reading "scenes": Scene changes (one frame per shot) ([gentle|normal|sensitive|every]).
462. Reading "sheet": Contact sheet with timecodes ([layout]).
463. Reading "motion": Motion energy curve (+ busiest moments).
464. Reading "pacing": Pacing: shots, average shot length, cuts per minute.
465. Reading "palette": Palette of a frame (or across the video) ([time]).
466. Reading "light": Brightness and saturation over time.
467. Reading "info": True fps, frame count, duration, size, codec.
468. Reading "verify": Check the shown frame in the player matches (requestVideoFrameCallback) (<frame>).
469. Reading "diff": Difference between two frames (<a> <b>).
470. Reading "black": Black stretches (fades to black, gaps).
471. Reading "freeze": Frozen stretches (holds, still shots).
472. Reading "silence": Quiet stretches in the sound.
473. Reading "loudness": Loudness (LUFS) for socials.
474. Reading "keyframes": Keyframes (clean cut points).
475. Reading "letterbox": Black bars: the picture's real area.
476. Reading "barcode": Color barcode (the color story in one picture).
477. Reading "waveform": Sound waveform picture.
478. Reading "loop": Best seamless loop point ([from]).
479. Scene sensitivity "gentle": Gentle: only hard cuts.
480. Scene sensitivity "normal": Normal.
481. Scene sensitivity "sensitive": Sensitive: soft cuts and flashes too.
482. Scene sensitivity "every": Every change (fast motion counts).
483. Contact sheet "3x3": 3 × 3 (`/contact 3x3`).
484. Contact sheet "4x3": 4 × 3 (default) (`/contact 4x3`).
485. Contact sheet "4x4": 4 × 4 (`/contact 4x4`).
486. Contact sheet "5x4": 5 × 4 (`/contact 5x4`).
487. Contact sheet "6x5": 6 × 5 (dense) (`/contact 6x5`).
488. Contact sheet "8x6": 8 × 6 (very dense) (`/contact 8x6`).
489. Contact sheet "2x2": 2 × 2 (big frames) (`/contact 2x2`).
490. Contact sheet "strip": Film strip (one row of 8) (`/contact strip`).
491. Contact sheet "column": One column of 6 (for a phone) (`/contact column`).
492. Contact sheet "story": Storyboard: 3 wide with notes space (`/contact story`).
493. Contact sheet "portrait": Portrait 2 × 4 (fits 9:16) (`/contact portrait`).
494. Contact sheet "wide": Wide 6 × 2 (fits 16:9) (`/contact wide`).
495. Contact sheet "scenes": One frame per shot (scene changes) (`/contact scenes`).
496. Contact sheet "polaroid": Polaroids (white frames, handwritten feel) (`/contact polaroid`).
497. Contact sheet "minimal": none (`/contact minimal`).
498. Contact sheet "3x4": 3 × 4 (portrait page) (`/contact 3x4`).
499. Contact sheet "7x7": 7 × 7 (the whole video at a glance) (`/contact 7x7`).
500. Contact sheet "long-strip": Long strip (one row of 12) (`/contact long-strip`).
501. Contact sheet "frames": frame (`/contact frames`).
502. Contact sheet "both": both (`/contact both`).
503. Sheet theme Dark (`/contact … dark`).
504. Sheet theme Light (`/contact … light`).
505. Sheet theme Forge (`/contact … forge`).
506. Sheet theme Film (`/contact … film`).
507. Sheet theme Violet (`/contact … violet`).
508. Sheet theme Blueprint (`/contact … blueprint`).
509. Sheet theme Paper (`/contact … paper`).
510. Sheet theme Mint (`/contact … mint`).
511. Timecodes as 00:00:01:12 (timecode) (Settings → Timecodes).
512. Timecodes as 0:01.500 (minutes:seconds.ms) (Settings → Timecodes).
513. Timecodes as f36 (frame number) (Settings → Timecodes).
514. Timecodes as 1.500s (seconds) (Settings → Timecodes).
515. Timecodes as Timecode + frame number (Settings → Timecodes).
516. Sheet labels: timecode, frame, both, time or none (`/contact … both`).
517. Pacing in words ("steady, rhythmic cutting, medium motion") for a reference's rhythm, not its footage.
518. Loudness with advice for socials (they aim near -14 LUFS).

## Made from a video (`/make`, ✂ Make…)
Saved as new files (next to a capture; your own footage stays untouched: things made from it go to captures/made). The player's I / O part is used when set. `/make gif last 1 3.5`.

519. GIF (15 fps, 720 px).
520. Small GIF (10 fps, 480 px).
521. Trim (frame-exact MP4).
522. Timelapse 2×.
523. Timelapse 4×.
524. Timelapse 8× (silent).
525. Slow motion 0.5×.
526. Boomerang (forward + back).
527. PNG frames for After Effects.
528. JPEG frames (smaller).
529. Reframe to 9:16 (crop).
530. Reframe to 9:16 (fit on a blurred fill).
531. Reframe to 1:1.
532. Reframe to 4:5.
533. Reframe to 16:9 (fit).
534. A copy without sound.
535. The sound only (m4a).
536. Poster frame (PNG).
537. `/make loop`: finds the best seamless loop and cuts it.
538. Everything made shows in Video Review's library.

## For the chats: Claude and Astra capture too
`/capture-tools on` lets this chat's AI use four tools (≈ 550 tokens a message while on; never on by default). `/capture-tools agent on` for every chat of an agent.

539. capture_shot: a screenshot of Hearth by target or CSS selector, optional social crop; returns the path and a small picture.
540. capture_record: start (target, preset, fps, size, sound, seconds = record that long and stop), stop, status, pause, resume, mark.
541. capture_record tour: run a saved tour by name, or steps written by the AI.
542. capture_frames: every reading above, on any video ("last", "open" or a path).
543. capture_frames make: a GIF, trim, timelapse, boomerang, reframe or PNG frames.
544. capture_list: the newest captures.
545. Pictures come back inline as small JPEGs that both Claude and Astra (Codex) see, plus their paths.
546. Many frames come back as one labelled sheet (cheaper to read than each picture).
547. `see: false` returns paths and text only.
548. Region / element need your mouse: the AI gets a clear "use a selector" answer.
549. When Hearth is closed, capture_frames still reads a video file with ffmpeg (info, at, every, spread, scenes, pacing, motion, sheet).
550. Per-chat opt-in travels with the chat's runs (never lean / one-off runs).
551. Astra gets the server through its MCP settings with a long tool timeout (tours and takes take time).
552. Long calls (takes, tours, long videos) get 15 minutes in the bridge.
553. The tool set is listed in `/director-cost`.
554. The app map (`hearth_help capture`, `three_do help capture`) explains capture, with "reference ≠ footage: take the vibe".
555. Screenshots attached to a chat go through the attachments folder, so Claude can open them.

## Settings (Capture menu → Settings…)

556. Screenshots: clean by default.
557. Screenshots: hide the rail by default.
558. Screenshots: also copy.
559. Screenshot format: PNG / JPEG / WebP.
560. Pixel size: screen pixels or 1×.
561. Social crop: fill or fit.
562. Recording: default preset, fps, quality, sound, cursor, clicks, keys, countdown, longest take.
563. Recording: also make an MP4.
564. Recording: hide toasts.
565. Timecode style for sheets and labels.
566. Captures folder (choose, open, `/capture-folder`).

## Other commands

567. `/capture [shot|record|stop|library|tour|frames|settings|folder]`.
568. `/copy-shot`: the newest screenshot to the clipboard.
569. `/clean-ui [on|off|norail]`: clean Hearth for your own screenshots or screen recorders.
570. `/cursor-fx <style> [clicks]`: cursor and clicks shown now and in takes.
571. `/capture-folder [open|choose|path]`.

## Tested

- `node dev/capture-test.js`: test videos with the frame number burned in as text and an 11-bit bar code (29.97 / 25 / 60 fps, VFR, WebM, shots, motion, A/V with black / still / silent parts, letterbox); every frame asked for by number, time and timecode is read back exactly, and is pixel-identical to ffmpeg's decode-everything extraction; every reading and every edit checked with ffprobe.
- `node dev/capture-mcp-test.js`: the MCP server over stdio (tool list ≈ 545 tokens, no instructions, frames from a file without the hub with inline pictures, clear errors) and the opt-in wiring in engines.js for Claude and Codex.
- `node dev/smoke.js --script dev/checks/capture-shots.js`: every screenshot target, clean mode, social frames, beautify, the tall chat, annotation, library, viewer, the region picker driven with real mouse events, the menus.
- `dev/checks/capture-record.js`: recordings checked with ffprobe (size, constant fps, length, sound track), pause, markers, max length, a 9:16 take → 1080×1920 MP4, the cursor drawn in, no REC light in the frame, a tour that records itself, capture_record, /record, the player.
- `dev/checks/capture-frames.js` (after `node dev/capture-test.js --make /tmp/hearth-capture-test`): the frame reader in the app, with and without ffmpeg, read back from the burned-in bar codes; scenes, sheets, motion, pacing, palette, diff; /frames; capture_frames; exact stepping in the player.
- `dev/checks/capture-more.js`: every tour step and template, every caption / title / cursor / click style, every look and background, every social frame, sheet layout and theme, every reading and /make, the player's I / O, bursts.
- `dev/checks/capture-lab.js`: the Lab at exact frame sizes, capture_shot on the Lab, a Lab take opened in Video Review and loaded as Lab media.
- `dev/checks/qa-commands.js`: no duplicate commands.

Not verified here: a real Mac / Windows GPU and hardware encoder (the test machine renders WebGL in software, so Lab takes were short there), macOS microphone permission prompts, Windows loopback sound.
