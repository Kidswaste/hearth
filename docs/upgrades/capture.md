# Capture (round 7): Hearth screenshots and records itself, and reads any video exactly

For your intro video for socials and for the chats. One entry on screen: **⋯ in the rail → ◉ Capture** (or ⌘/Ctrl+Alt+S, or `/capture`). Everything else is in that menu's submenus, right-click menus on every capture, keys (listed in the keys list) and chat commands (`/capture-help`).
Files go to the captures folder (`data/captures`: shots, recordings, frames, sheets, made; `/capture-folder` to change it). Tested headless (Electron + Xvfb, ffmpeg 6): see the end.

## The one menu, keys and progressive disclosure

1. ◉ Capture in the rail's ⋯ menu: the only new thing on screen (plus the REC light while recording).
2. The capture menu: screenshot of this tool first, then submenus (Screenshot of…, Social frame…, Beautified…, Record…, Tours…), Captures, Read frames, Settings.
3. Submenus open in place with a "‹ back" row (works with the plain menus and with the declutter stream's submenus).
4. The capture keys work anywhere, even while the Lab's sandboxed preview has the keyboard (caught in the main process), and on a Mac by key position (⌥ changes the letter).
5. Every key, modifier and right-click gesture is registered with the keys list (Keys.add, area "Capture"), and every keyed action is also in a menu and a chat command.
6. Recent… in the capture menu: your last 8 captures.
7. A searchable picker for the long families (social frames, backgrounds, tours).

## Screenshots of Hearth itself

8. Whole window (`/shot window`), at the screen's real pixels (2× on a Retina Mac).
9. This tool or chat only, without the rail (`/shot tool`).
10. The chat messages (`/shot chat`).
11. The whole chat as one tall picture: it scrolls and stitches, nothing re-rendered (`/shot transcript`, `/shot last 10` for the last 10 messages).
12. The docked director chat (`/shot dock`).
13. The Lab preview at its exact frame size (1080×1920 for 9:16), from the Lab's own renderer (`/shot lab`).
14. `/shot lab 9:16` (or 16:9, 4:5, 1:1): the Lab renders at that size for the shot and goes back.
15. The chat box (`/shot composer`), the rail (`/shot rail`), the chats list (`/shot panel`).
16. Any part by CSS selector (`/shot .three-preview`, `/shot sel:#rail`), for tours and the AI.
17. A region you drag, or a thing you click: the picker outlines what's under the pointer (`/shot region`).
18. The picker shows the size in real pixels while you drag.
19. Delay with a countdown for hover states (`/shot 3s`, `/shot delay 5`, the "In 3 seconds" menu item).
20. Clean: no toasts, menus, scrollbars, carets or focus rings in the picture (`/shot clean`).
21. No rail and chats list: the content gets the whole width (`/shot norail`).
22. Pixel size: screen pixels (sharp on Retina) or 1× CSS size (`/shot 1x`).
23. PNG (default), JPEG or WebP (`/shot jpg`, `/shot webp`).
24. Copy to the clipboard as it saves (`/shot copy`, Settings → also copy).
25. Attach it to the chat you're in (`/shot attach`); it goes through the attachments folder so Claude can read it.
26. Annotate right after (`/shot annotate`).
27. Beautify at the same time (`/shot pretty`, `/shot window violet`).
28. Burst: N shots every S seconds (`/shot burst 5 1s`).
29. Every screen at once: one picture of each tool in the rail and each chat, then back where you were (`/shot all`).
30. Shots are named after what they show and when ("Hearth Lab 9x16 2026-10-09 …").
31. A toast with Open after each shot (`quiet` for tours and the AI).
32. `/shot` / `/screenshot` share their name with the chat's own version: with a target, frame or option word it takes a capture; plain `/screenshot` still attaches the window to your message.
33. HiDPI correct in every target: rectangles follow Hearth's zoom setting.

## Social frames (crop or fit, exact sizes)
Each frame crops a shot (or a recording) to its exact pixels: `/shot tool 9:16`, `/crop-shot 4:5`, Social frame… in the menus, "All sizes…" in a searchable picker.

34. 9:16: Reels / TikTok / Shorts / Stories, 1080×1920.
35. 4:5: Instagram / Facebook feed (portrait), 1080×1350.
36. 1:1: Square post, 1080×1080.
37. 16:9: YouTube / landscape video, 1920×1080.
38. 3:4: Instagram grid (3:4), 1080×1440.
39. 2:3: Pinterest pin, 1000×1500.
40. 4:3: Classic 4:3, 1440×1080.
41. 3:2: Photo 3:2, 1620×1080.
42. 5:4: Print 5:4, 1350×1080.
43. 21:9: Cinematic 21:9, 2560×1080.
44. 1.91:1: Link card (og:image 1200×628), 1200×628.
45. 2:1: GitHub social preview (1280×640), 1280×640.
46. 3:1: X / Twitter header (1500×500), 1500×500.
47. 4:1: LinkedIn banner (1584×396), 1584×396.
48. yt-thumb: YouTube thumbnail (1280×720), 1280×720.
49. x-post: X / Twitter post image (1600×900), 1600×900.
50. dribbble: Dribbble shot (1600×1200), 1600×1200.
51. ph-gallery: Product Hunt gallery (1270×760), 1270×760.
52. iphone: App Store iPhone 6.9″ (1290×2796), 1290×2796.
53. ipad: App Store iPad 13″ (2064×2752), 2064×2752.
54. mac-store: Mac App Store (2880×1800), 2880×1800.
55. 4k: 4K UHD (3840×2160), 3840×2160.
56. story-safe: Story with safe zones (1080×1920), 1080×1920 (safe zones shaded).
57. Fill (crop the sides, centered) or Fit (the whole picture on its own blurred colors): `/crop-shot 9:16 fit`.
58. Words work too: reels, tiktok, story, square, feed, youtube, cinematic, og, thumbnail, banner…
59. Free sizes and ratios: `/crop-shot 1500x500`, `/shot tool 7:5`.

## Beautified shots for posts
A shot on a background with padding, rounded corners, a shadow and a window bar: `/beautify`, Beautify… in a picture's right-click menu, or `/shot pretty`.

60. Look "clean": Clean: white, soft shadow.
61. Look "forge": Forge: ember gradient, Mac window.
62. Look "violet": AI violet, Mac window.
63. Look "studio": Studio: dark, big shadow.
64. Look "glass": Glass: its own colors blurred.
65. Look "dribbble": Dribbble: peach, browser.
66. Look "launch": Launch day: sunset, Mac window.
67. Look "minimal": Minimal: paper, thin bar.
68. Look "night": Neon night, no bar.
69. Look "aurora": Aurora, Windows bar.
70. Look "phone": Phone: bezel on a gradient.
71. Look "flat": Flat: no padding, rounded.
72. Look "keyable": Green screen, no shadow (for compositing).
73. Look "rainbow": Hearth rainbow.
74. Look "chrome": Chrome metal.
75. Your own mix, remembered: Beautify → Background / Padding / Corners / Shadow / Window bar, or `/beautify bg:nebula pad:l corners:24 shadow:strong bar:mac`.
76. Background "forge": Forge ember (`/beautify bg:forge`).
77. Background "molten": Molten (`/beautify bg:molten`).
78. Background "gold": Gold leaf (`/beautify bg:gold`).
79. Background "violet": AI violet (`/beautify bg:violet`).
80. Background "ice": Ice glass (`/beautify bg:ice`).
81. Background "midnight": Midnight (`/beautify bg:midnight`).
82. Background "aurora": Aurora (`/beautify bg:aurora`).
83. Background "sunset": Sunset (`/beautify bg:sunset`).
84. Background "peach": Peach (`/beautify bg:peach`).
85. Background "ocean": Ocean (`/beautify bg:ocean`).
86. Background "lime": Lime soda (`/beautify bg:lime`).
87. Background "candy": Candy (`/beautify bg:candy`).
88. Background "grape": Grape (`/beautify bg:grape`).
89. Background "royal": Royal (`/beautify bg:royal`).
90. Background "mint": Mint (`/beautify bg:mint`).
91. Background "rose": Rose gold (`/beautify bg:rose`).
92. Background "neon": Neon night (`/beautify bg:neon`).
93. Background "rainbow": Hearth rainbow (`/beautify bg:rainbow`).
94. Background "chrome": Chrome (`/beautify bg:chrome`).
95. Background "paper": Paper (`/beautify bg:paper`).
96. Background "white": White (`/beautify bg:white`).
97. Background "black": Black (`/beautify bg:black`).
98. Background "charcoal": Charcoal (`/beautify bg:charcoal`).
99. Background "studio": Studio grey (`/beautify bg:studio`).
100. Background "spot": Spotlight (`/beautify bg:spot`).
101. Background "blur": Its own colors, blurred (`/beautify bg:blur`).
102. Background "none": Transparent (`/beautify bg:none`).
103. Background "green": Green screen (key it out) (`/beautify bg:green`).
104. Background "blue": Blue screen (key it out) (`/beautify bg:blue`).
105. Background "sand": Sand dune (`/beautify bg:sand`).
106. Background "forest": Forest (`/beautify bg:forest`).
107. Background "cherry": Cherry (`/beautify bg:cherry`).
108. Background "steel": Steel (`/beautify bg:steel`).
109. Background "lavender": Lavender (`/beautify bg:lavender`).
110. Background "cyber": Cyber (`/beautify bg:cyber`).
111. Background "dusk": Dusk (`/beautify bg:dusk`).
112. Background "tropical": Tropical (`/beautify bg:tropical`).
113. Background "berry": Berry (`/beautify bg:berry`).
114. Background "sky": Sky (`/beautify bg:sky`).
115. Background "coral": Coral (`/beautify bg:coral`).
116. Background "slate": Slate (`/beautify bg:slate`).
117. Background "onyx": Onyx (`/beautify bg:onyx`).
118. Background "pearl": Pearl (`/beautify bg:pearl`).
119. Background "sakura": Sakura (`/beautify bg:sakura`).
120. Background "matrix": Matrix (`/beautify bg:matrix`).
121. Background "lagoon": Lagoon (`/beautify bg:lagoon`).
122. Background "citrus": Citrus (`/beautify bg:citrus`).
123. Background "plum": Plum (`/beautify bg:plum`).
124. Background "arctic": Arctic (`/beautify bg:arctic`).
125. Background "copper": Copper (`/beautify bg:copper`).
126. Background "jade": Jade (`/beautify bg:jade`).
127. Background "noir": Noir (`/beautify bg:noir`).
128. Background "velvet": Velvet (`/beautify bg:velvet`).
129. Background "solar": Solar flare (`/beautify bg:solar`).
130. Background "nebula": Nebula (mesh) (`/beautify bg:nebula`).
131. Background "forge-mesh": Forge glow (mesh) (`/beautify bg:forge-mesh`).
132. Background "aurora-mesh": Aurora (mesh) (`/beautify bg:aurora-mesh`).
133. Background "candy-mesh": Candy (mesh) (`/beautify bg:candy-mesh`).
134. Background "ocean-mesh": Deep ocean (mesh) (`/beautify bg:ocean-mesh`).
135. Window bar: No window bar (`bar:none`).
136. Window bar: Mac window (traffic lights) (`bar:mac`).
137. Window bar: Windows title bar (`bar:win`).
138. Window bar: Minimal bar (three dots) (`bar:minimal`).
139. Window bar: Browser with an address bar (`bar:browser`).
140. Window bar: Phone bezel (`bar:phone`).
141. Padding: No padding (`pad:none`).
142. Padding: Small (`pad:s`).
143. Padding: Medium (`pad:m`).
144. Padding: Large (`pad:l`).
145. Padding: Huge (`pad:xl`).
146. Corners: Square (`corners:0`).
147. Corners: Soft (`corners:8`).
148. Corners: Round (`corners:14`).
149. Corners: Rounder (`corners:24`).
150. Corners: Very round (`corners:40`).
151. Shadow: No shadow (`shadow:none`).
152. Shadow: Soft (`shadow:soft`).
153. Shadow: Medium (`shadow:medium`).
154. Shadow: Strong (`shadow:strong`).
155. Mesh gradients (soft blobs of color) as a background kind.

## Annotation (✎ on any picture, `/annotate`)

156. Select / move (key V).
157. Arrow (key A).
158. Line (key L).
159. Box (key R).
160. Circle (key O).
161. Pen (key P).
162. Highlighter (key H).
163. Text (key T).
164. Number badge (1, 2, 3…) (key N).
165. Blur (hide private bits) (key B).
166. Pixelate (key X).
167. Redact (solid box) (key D).
168. Spotlight (dim the rest) (key S).
169. Magnifier (loupe) (key M).
170. Crop (key C).
171. Color Ember (keys 1–9, 0; the swatch menu).
172. Color Gold (keys 1–9, 0; the swatch menu).
173. Color Red (keys 1–9, 0; the swatch menu).
174. Color Violet (keys 1–9, 0; the swatch menu).
175. Color Blue (keys 1–9, 0; the swatch menu).
176. Color Green (keys 1–9, 0; the swatch menu).
177. Color Pink (keys 1–9, 0; the swatch menu).
178. Color White (keys 1–9, 0; the swatch menu).
179. Color Black (keys 1–9, 0; the swatch menu).
180. Color Cyan (keys 1–9, 0; the swatch menu).
181. Thickness Thin ([ and ]).
182. Thickness Medium ([ and ]).
183. Thickness Thick ([ and ]).
184. Thickness Extra thick ([ and ]).
185. Shapes stay editable until you save: V selects, drag moves, Delete removes, double-click edits text.
186. Shift keeps lines at 45° and boxes square.
187. Numbered badges count up by themselves.
188. Spotlights dim everything outside all of them together.
189. Blur, pixelate and redact read the original picture (nothing leaks through).
190. Undo / redo (80 steps).
191. Save makes a new file "… annotated.png"; the original stays.
192. → Chat saves and attaches it.
193. The six everyday tools on the bar, the rest behind ⋯; your tool, color and thickness are remembered.

## Recording Hearth itself

194. `/record` (outside the Lab, or `/record app …` anywhere) and `/rec`: record Hearth; the Lab's own `/record` still records the sketch in the Lab.
195. The page records itself (its own frame): no other windows, no OS cursor, nothing private around it.
196. The REC light is a tiny window of its own, on top of Hearth but never in the picture.
197. The REC light is also hidden from macOS / Windows screen recordings and screenshots (content protection).
198. The REC light has ❚❚ and ■ buttons, the time, markers and the tour step.
199. Countdown before it starts (Settings → Countdown, `/record countdown 5`, `/record now`).
200. Pause and resume; the pause isn't in the file.
201. Markers while recording (`/record mark drop`), saved with the file.
202. Markers show on the player's scrub bar (click to jump, M for the next one) and become notes in Video Review.
203. Longest take: it stops by itself (`/record 15s`, Settings → Longest take).
204. What to record: the window, this tool, the chat, the dock, the Lab preview, the chat box, a region or a thing you pick, or a CSS selector (`/record lab`, `/record region`).
205. A steady clock: frames at the chosen rate whether or not the screen changes, so the file is the real length.
206. Takes into a social frame (`/record 9:16`): recorded at the screen's own pixels in that shape, the MP4 scaled to exactly 1080×1920.
207. 1080p / 720p / 4K output sizes (`/record 1080p`).
208. Hearth's own sound (the Lab's music, previews) on Mac and Windows alike (`/record sound`).
209. Your microphone, alone or mixed with Hearth's sound (`/record mic`, `/record both`).
210. The whole computer's sound on Windows (`/record system`); on a Mac it explains once that this needs extra software and records Hearth's sound instead.
211. Recorded straight to disk while it records (a long take never sits in memory).
212. The WebM is fixed after recording (duration and seeking) when ffmpeg is there.
213. An MP4 too (H.264 + AAC, constant frame rate, fast start) for editors and uploads; cut to the real length.
214. Encoder per platform: H.264 on Mac / Windows (their hardware encoders), VP9 elsewhere; an encoder that gives two empty takes is skipped for the session.
215. A slow-starting encoder gets a moment before the stop, so short takes aren't lost.
216. The cursor drawn into the picture, as you like (`/cursor-fx`, Settings → Cursor).
217. Click effects drawn into the picture (Settings → Clicks).
218. The keys you press shown at the bottom (`/keys-overlay on`, `/record keys`); letters typed in a box aren't shown.
219. Hide toasts while recording (Settings, and on by default for the promo / reel / social presets).
220. While recording, tour and cursor animations run so every frame reaches the file; outside recordings they stay on the compositor (smooth UI).
221. A tiny repaint poke when nothing changed for a moment, so a lone change is never lost between frames.
222. The effects layer is a zero-size box (a full-window layer on top would make every captured frame cost a full composite).
223. After a take: a toast with Open; the recording is listed in Video Review's library.
224. One click opens it in Video Review, in the editor timeline, adds it to the current edit, or loads it in the Lab as media (the capture's menu).
225. `/record stop` stops the Lab's own recording when that is what runs.
226. Zoom in on clicks: each click zooms the view toward it (1.6×), it eases back out after 2 s without clicks (`/record autozoom`, the Studio preset, Settings).
227. A camera bubble: your camera, round, in a corner of the picture (`/record camera`, `camera:tl`, the Facecam preset, Settings → Camera bubble).
228. Chapter markers by themselves: a marker named after the screen each time you switch tool or chat while recording (Settings to turn off).
229. The GIF preset makes a GIF when it stops.
230. Camera: No camera.
231. Camera: Camera bottom right.
232. Camera: Camera bottom left.
233. Camera: Camera top right.
234. Camera: Camera top left.
235. Preset "quick": Quick: window, 30 fps, good quality (`/record quick`).
236. Preset "smooth": Smooth: 60 fps, high quality (`/record smooth`).
237. Preset "promo": Promo: 60 fps, very high quality, MP4, clicks shown (`/record promo`).
238. Preset "reel": Reel: 9:16 1080×1920, 60 fps, MP4 (`/record reel`).
239. Preset "square": Square post: 1080×1080, 30 fps, MP4 (`/record square`).
240. Preset "feed": Feed: 4:5 1080×1350, 30 fps, MP4 (`/record feed`).
241. Preset "youtube": YouTube: 1920×1080, 60 fps, MP4 (`/record youtube`).
242. Preset "tutorial": Tutorial: cursor, clicks and keys shown, voice (`/record tutorial`).
243. Preset "voice": Voice-over: your microphone only (`/record voice`).
244. Preset "draft": Draft: small file, 24 fps (`/record draft`).
245. Preset "gif": GIF: 15 fps, 720p, makes a GIF when it stops (`/record gif`).
246. Preset "studio": Studio: zooms in on your clicks, 60 fps, MP4 (like a screen-studio take) (`/record studio`).
247. Preset "facecam": Facecam: your camera in a corner bubble, voice (`/record facecam`).
248. Preset "master": Master: 60 fps, near lossless (big files) (`/record master`).
249. Preset "lab": Lab preview only, 60 fps (`/record lab`).
250. Preset "chat": The chat only, 30 fps (`/record chat`).
251. Preset "cinema": Cinematic 24 fps, 21:9 (`/record cinema`).
252. Quality Draft (3 Mb/s).
253. Quality Good (8 Mb/s).
254. Quality High (16 Mb/s).
255. Quality Very high (30 Mb/s).
256. Quality Master (50 Mb/s).
257. 15 frames per second.
258. 24 frames per second.
259. 25 frames per second.
260. 30 frames per second.
261. 50 frames per second.
262. 60 frames per second.
263. Sound: No sound.
264. Sound: Hearth's own sound (the Lab's music, previews).
265. Sound: Your microphone.
266. Sound: Hearth's sound + your microphone.
267. Sound: The whole computer's sound (Windows only).
268. Cursor: No cursor drawn.
269. Cursor: Dot.
270. Cursor: Ring.
271. Cursor: Soft yellow halo.
272. Cursor: Spotlight (dims around the cursor).
273. Cursor: Big arrow.
274. Cursor: Pointing hand.
275. Cursor: Crosshair.
276. Cursor: Violet glow.
277. Cursor: Square focus box.
278. Clicks: No click effect.
279. Clicks: Ring ripple.
280. Clicks: Burst.
281. Clicks: Soft pulse.
282. Clicks: Double ring.
283. Clicks: Square.
284. Clicks: Gold spark.
285. Countdown: none.
286. Countdown: 3 seconds.
287. Countdown: 5 seconds.
288. Countdown: 10 seconds.
289. Longest take: no limit.
290. Longest take: 10 s.
291. Longest take: 15 s.
292. Longest take: 30 s.
293. Longest take: 1 min.
294. Longest take: 2 min.
295. Longest take: 5 min.
296. Longest take: 10 min.

## Tours: hands-free, repeatable recordings
A tour is plain text, one step per line, run with the real UI. `/tour` picks one, `/tour intro` runs one, `/tour edit`, `/tour new`, `/tour steps`, `/tour run "open three; wait 1s; shot lab"`. Esc stops it.

297. The editor: name, steps, a live check (unknown steps or commands), the steps list, Save, Run, Delete.
298. Your tours are saved (kv `capture-tours`) next to the built-in ones.
299. The cursor glides to what it clicks (a tour always shows its cursor).
300. Things are found by selector, by their words ("Run", "Send") or by name (tool, chat, lab, composer…).
301. Everything a tour changed comes back at the end: zoom, tilt, blur, overlays, hidden parts, window size, clean mode, the recording it started.
302. Tours hide toasts and menus while they run.
303. The REC light shows the tour's step ("tour 3/12").
304. A toast at the end: steps, shots, the recording (Open) or why steps were skipped.
305. A real Esc (or ⌘/Ctrl+Alt+T) stops a tour; a tour's own "key Escape" doesn't.
306. Commands run in the chat on screen (Lab commands in the Lab).
307. `key Ctrl+;` and `key Ctrl+K` open the command bar and the palette (they are caught before the page).
308. Tape a tour: do it once (clicks, screens, typing, shortcuts, the pauses between), get the steps to edit and replay exactly (`/tour tape`, Tours → Tape a tour).
309. Taped clicks are named by their words, id or classes so the replay finds them again.
310. Step `record [preset] [9:16] [60fps] [sound]`: Start recording (the rest of the tour is filmed).
311. Step `stop`: Stop recording (the file opens when the tour ends).
312. Step `open <three | ae | board | chat | claude | astra | tool id>`: Show a tool or a chat.
313. Step `wait <1.5s | 800ms>`: Wait.
314. Step `cmd </command args>`: Run a chat command in the chat on screen.
315. Step `type "<text>" [fast|slow]`: Type into the chat box like a person.
316. Step `send`: Send what was typed.
317. Step `click <selector | "Button text">`: Glide the cursor there and click.
318. Step `hover <selector | "text">`: Glide the cursor there.
319. Step `move <x> <y> [0.8s]`: Glide the cursor to a point (pixels or 0..1 of the window).
320. Step `key <Ctrl+K>`: Press keys (shown when the keys overlay is on).
321. Step `zoom <selector | x y> [1.6] [1s]`: Zoom the view into something.
322. Step `zoom out [1s]`: Back to the whole window.
323. Step `pan <x> <y> [1s]`: Move the zoomed view.
324. Step `caption "<text>" [2.5s] [lower|subtitle|top|center|pill|typewriter]`: Words on screen.
325. Step `title "<title>" ["subtitle"] [2s] [forge|clean|glass|rainbow]`: A title card over the app.
326. Step `highlight <selector | "text"> [2s]`: Spotlight one thing.
327. Step `scroll <selector> <pixels>`: Scroll something smoothly.
328. Step `shot [target] [9:16]`: Take a screenshot.
329. Step `mark "<label>"`: A marker in the recording (shown in the viewer and Video Review).
330. Step `pause / resume`: Pause / resume the recording.
331. Step `cursor <dot|ring|halo|spotlight|arrow|off>`: Cursor style while filming.
332. Step `clean on|off`: Hide toasts, menus and scrollbars.
333. Step `theme <name>`: Switch Hearth's look.
334. Step `size <1920x1080>`: Resize the window content exactly (restored after the tour).
335. Step `fade in|out [0.6s]`: Fade the picture from / to black.
336. Step `say "<text>"`: A note in the chat (not sent).
337. Step `esc`: Close menus and dialogs.
338. Step `tilt <x°> [y°] [1s]`: Tilt the whole app in 3D (camera move).
339. Step `spin <deg> [1s]`: Rotate the view.
340. Step `push <selector> [1.3] [3s]`: A slow push in (Ken Burns).
341. Step `shake [strength] [0.4s]`: Camera shake.
342. Step `whip out|in [left|right] [0.35s]`: Whip pan out (blurred) and back in, between scenes.
343. Step `flash [white|gold|#hex] [0.25s]`: A flash frame.
344. Step `blur in|out [0.6s]`: Focus pull from / to blur.
345. Step `letterbox on|off [2.39]`: Cinema bars.
346. Step `vignette on|off`: Darker corners.
347. Step `grain on|off`: Film grain over the picture.
348. Step `watermark "<text>" [corner] | off`: A small mark in a corner for the whole take.
349. Step `timecode on|off`: A running clock in the corner.
350. Step `progress on|off`: A thin bar showing the tour's progress.
351. Step `confetti [count]`: A burst of Hearth-colored confetti.
352. Step `emoji "🔥" [x y]`: A big emoji pop.
353. Step `ease <smooth|snappy|slow|linear>`: Easing for the next moves and zooms.
354. Step `bpm <120>`: Tempo for beat waits.
355. Step `beat [n]`: Wait n beats (sync a tour to music).
356. Step `drag <from> <to> [0.8s]`: Press, glide and release (sliders, timelines).
357. Step `hide <selector> / show <selector>`: Hide a part of the app for the take (back after the tour).
358. Tour "hello": Hello Hearth (10 s) (`/tour hello`).
359. Tour "intro": App intro for socials (≈30 s) (`/tour intro`).
360. Tour "lab": Lab glow-up (≈15 s) (`/tour lab`).
361. Tour "sizes": Frame sizes parade (≈12 s) (`/tour sizes`).
362. Tour "commands": Chat commands showcase (≈15 s) (`/tour commands`).
363. Tour "palette": Command bar (≈10 s) (`/tour palette`).
364. Tour "looks": Looks parade (≈12 s) (`/tour looks`).
365. Tour "review": Video Review tour (≈12 s) (`/tour review`).
366. Tour "shots": Screenshots of every tool (no recording) (`/tour shots`).
367. Tour "reel": Vertical reel of the Lab (9:16) (`/tour reel`).
368. Tour "cinematic": Cinematic intro (bars, tilt, push, whip) (`/tour cinematic`).
369. Tour "beat": On the beat (120 BPM cuts) (`/tour beat`).
370. Tour "kinetic": Kinetic words (text-led) (`/tour kinetic`).
371. Tour "tutorial": Tutorial style (cursor, clicks, keys) (`/tour tutorial`).
372. Tour "zooms": Zoom showcase (UI details) (`/tour zooms`).
373. Tour "clean-ui": Clean UI shots of each screen (no rail) (`/tour clean-ui`).
374. Tour "social-set": Screenshots in all four social sizes (`/tour social-set`).
375. Tour "square-post": Square post (1:1) of the chats (`/tour square-post`).
376. Tour "glitch": Glitchy transitions (`/tour glitch`).
377. Tour "watermarked": Watermarked walkthrough with a clock (`/tour watermarked`).
378. Tour "celebrate": Celebration ending (`/tour celebrate`).
379. Caption style "lower": Lower third (left, bottom).
380. Caption style "subtitle": Subtitle (centered, bottom).
381. Caption style "top": Top banner.
382. Caption style "center": Big centered words.
383. Caption style "pill": Small pill (top right).
384. Caption style "typewriter": Typewriter (letters appear).
385. Caption style "kinetic": Kinetic (words pop in one by one).
386. Caption style "neon": Neon sign.
387. Caption style "glass": Frosted glass card.
388. Caption style "tag": Gold tag (left).
389. Caption style "quote": Quote (big quotation marks).
390. Caption style "bubble": Chat bubble.
391. Caption style "label": Small caps label (top left).
392. Caption style "outline": Huge outlined words.
393. Title card "forge": Forge: gold on ember.
394. Title card "clean": Clean: white on black.
395. Title card "glass": Glass over the app.
396. Title card "rainbow": Hearth rainbow.
397. Title card "neon": Neon on black.
398. Title card "minimal": Minimal: small and calm.
399. Title card "gradient": Violet gradient.
400. Title card "split": Split: title left, subtitle right.
401. Title card "chrome": Chrome letters.
402. Title card "ember": Ember glow.
403. Title card "paper": Paper and ink.
404. Title card "mono": Monospace terminal.
405. Easing "smooth" for moves and zooms (`ease smooth`).
406. Easing "snappy" for moves and zooms (`ease snappy`).
407. Easing "slow" for moves and zooms (`ease slow`).
408. Easing "linear" for moves and zooms (`ease linear`).

## Captures: library, player, viewer

409. `/captures` (⌘/Ctrl+Alt+V): a grid of your shots and recordings, newest first.
410. Filter: all, pictures, videos.
411. Search by name.
412. Sort: newest, oldest, biggest, by name (⋯ → Sort).
413. Videos play only while hovered (nothing runs in the background).
414. Drag a capture out as a real file: into a chat (it attaches), the board, Finder / Explorer, After Effects.
415. The grid refreshes when a new capture lands.
416. The player: exact frame stepping with the true frame rate (ffprobe), the shown frame confirmed by requestVideoFrameCallback.
417. Timecode + frame number readout (timecode, seconds or ms).
418. Scrub bar with recording markers.
419. Speed from 0.1× to 2×.
420. A part (I / O) shown on the scrub bar, used by Make….
421. 🎞 Read and ✂ Make buttons on the player.
422. The info line: size, fps (variable when it is), frames, markers.
423. The picture viewer: zoom, pan, fit, with Annotate, Copy and → Chat.

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
455. Add `chat` to any `/frames` command to attach the pictures instead of showing them.
456. Reading "at": Exact frame at a time / frame / timecode (<time | f120 | 00:00:01:12>).
457. Reading "every": Every N frames (<N>).
458. Reading "spread": N frames spread evenly (<N>).
459. Reading "scenes": Scene changes (one frame per shot) ([gentle|normal|sensitive|every]).
460. Reading "sheet": Contact sheet with timecodes ([layout]).
461. Reading "motion": Motion energy curve (+ busiest moments).
462. Reading "pacing": Pacing: shots, average shot length, cuts per minute.
463. Reading "palette": Palette of a frame (or across the video) ([time]).
464. Reading "light": Brightness and saturation over time.
465. Reading "info": True fps, frame count, duration, size, codec.
466. Reading "verify": Check the shown frame in the player matches (requestVideoFrameCallback) (<frame>).
467. Reading "diff": Difference between two frames (<a> <b>).
468. Reading "black": Black stretches (fades to black, gaps).
469. Reading "freeze": Frozen stretches (holds, still shots).
470. Reading "silence": Quiet stretches in the sound.
471. Reading "loudness": Loudness (LUFS) for socials.
472. Reading "keyframes": Keyframes (clean cut points).
473. Reading "letterbox": Black bars: the picture's real area.
474. Reading "barcode": Color barcode (the color story in one picture).
475. Reading "waveform": Sound waveform picture.
476. Reading "loop": Best seamless loop point ([from]).
477. Reading "vibe": Vibe card: palette, light, pacing, motion and key frames in one picture (a reference's feel, not its footage).
478. Scene sensitivity "gentle": Gentle: only hard cuts.
479. Scene sensitivity "normal": Normal.
480. Scene sensitivity "sensitive": Sensitive: soft cuts and flashes too.
481. Scene sensitivity "every": Every change (fast motion counts).
482. Contact sheet "3x3": 3 × 3 (`/contact 3x3`).
483. Contact sheet "4x3": 4 × 3 (default) (`/contact 4x3`).
484. Contact sheet "4x4": 4 × 4 (`/contact 4x4`).
485. Contact sheet "5x4": 5 × 4 (`/contact 5x4`).
486. Contact sheet "6x5": 6 × 5 (dense) (`/contact 6x5`).
487. Contact sheet "8x6": 8 × 6 (very dense) (`/contact 8x6`).
488. Contact sheet "2x2": 2 × 2 (big frames) (`/contact 2x2`).
489. Contact sheet "strip": Film strip (one row of 8) (`/contact strip`).
490. Contact sheet "column": One column of 6 (for a phone) (`/contact column`).
491. Contact sheet "story": Storyboard: 3 wide with notes space (`/contact story`).
492. Contact sheet "portrait": Portrait 2 × 4 (fits 9:16) (`/contact portrait`).
493. Contact sheet "wide": Wide 6 × 2 (fits 16:9) (`/contact wide`).
494. Contact sheet "scenes": One frame per shot (scene changes) (`/contact scenes`).
495. Contact sheet "polaroid": Polaroids (white frames, handwritten feel) (`/contact polaroid`).
496. Contact sheet "minimal": none (`/contact minimal`).
497. Contact sheet "3x4": 3 × 4 (portrait page) (`/contact 3x4`).
498. Contact sheet "7x7": 7 × 7 (the whole video at a glance) (`/contact 7x7`).
499. Contact sheet "long-strip": Long strip (one row of 12) (`/contact long-strip`).
500. Contact sheet "frames": frame (`/contact frames`).
501. Contact sheet "both": both (`/contact both`).
502. Sheet theme Dark (`/contact … dark`).
503. Sheet theme Light (`/contact … light`).
504. Sheet theme Forge (`/contact … forge`).
505. Sheet theme Film (`/contact … film`).
506. Sheet theme Violet (`/contact … violet`).
507. Sheet theme Blueprint (`/contact … blueprint`).
508. Sheet theme Paper (`/contact … paper`).
509. Sheet theme Mint (`/contact … mint`).
510. Timecodes as 00:00:01:12 (timecode) (Settings → Timecodes).
511. Timecodes as 0:01.500 (minutes:seconds.ms) (Settings → Timecodes).
512. Timecodes as f36 (frame number) (Settings → Timecodes).
513. Timecodes as 1.500s (seconds) (Settings → Timecodes).
514. Timecodes as Timecode + frame number (Settings → Timecodes).
515. Sheet labels: timecode, frame, both, time or none (`/contact … both`).
516. Pacing in words ("steady, rhythmic cutting, medium motion") for a reference's rhythm, not its footage.
517. Loudness with advice for socials (they aim near -14 LUFS).

## Made from a video (`/make`, ✂ Make…)
Saved as new files (next to a capture; your own footage stays untouched: things made from it go to captures/made). The player's I / O part is used when set. `/make gif last 1 3.5`.

518. GIF (15 fps, 720 px).
519. Small GIF (10 fps, 480 px).
520. Trim (frame-exact MP4).
521. Timelapse 2×.
522. Timelapse 4×.
523. Timelapse 8× (silent).
524. Slow motion 0.5×.
525. Boomerang (forward + back).
526. PNG frames for After Effects.
527. JPEG frames (smaller).
528. Reframe to 9:16 (crop).
529. Reframe to 9:16 (fit on a blurred fill).
530. Reframe to 1:1.
531. Reframe to 4:5.
532. Reframe to 16:9 (fit).
533. A copy without sound.
534. The sound only (m4a).
535. Poster frame (PNG).
536. `/make loop`: finds the best seamless loop and cuts it.
537. Everything made shows in Video Review's library.

## For the chats: Claude and Astra capture too
`/capture-tools on` lets this chat's AI use four tools (≈ 550 tokens a message while on; never on by default). `/capture-tools agent on` for every chat of an agent.

538. capture_shot: a screenshot of Hearth by target or CSS selector, optional social crop; returns the path and a small picture.
539. capture_record: start (target, preset, fps, size, sound, seconds = record that long and stop), stop, status, pause, resume, mark.
540. capture_record tour: run a saved tour by name, or steps written by the AI.
541. capture_frames: every reading above, on any video ("last", "open" or a path).
542. capture_frames make: a GIF, trim, timelapse, boomerang, reframe or PNG frames.
543. capture_list: the newest captures.
544. Pictures come back inline as small JPEGs that both Claude and Astra (Codex) see, plus their paths.
545. Many frames come back as one labelled sheet (cheaper to read than each picture).
546. `see: false` returns paths and text only.
547. Region / element need your mouse: the AI gets a clear "use a selector" answer.
548. When Hearth is closed, capture_frames still reads a video file with ffmpeg (info, at, every, spread, scenes, pacing, motion, sheet).
549. Per-chat opt-in travels with the chat's runs (never lean / one-off runs).
550. Astra gets the server through its MCP settings with a long tool timeout (tours and takes take time).
551. Long calls (takes, tours, long videos) get 15 minutes in the bridge.
552. The tool set is listed in `/director-cost`.
553. The app map (`hearth_help capture`, `three_do help capture`) explains capture, with "reference ≠ footage: take the vibe".
554. Screenshots attached to a chat go through the attachments folder, so Claude can open them.

## Settings (Capture menu → Settings…)

555. Screenshots: clean by default.
556. Screenshots: hide the rail by default.
557. Screenshots: also copy.
558. Screenshot format: PNG / JPEG / WebP.
559. Pixel size: screen pixels or 1×.
560. Social crop: fill or fit.
561. Recording: default preset, fps, quality, sound, cursor, clicks, keys, countdown, longest take.
562. Recording: also make an MP4.
563. Recording: hide toasts.
564. Timecode style for sheets and labels.
565. Captures folder (choose, open, `/capture-folder`).

## Chat commands (all local, no tokens; `/help capture`)

566. `/capture`: the capture menu, or one of its actions (shot, record, stop, library, tour, frames, settings, folder).
567. `/screenshot`: (/shot) a screenshot of part of Hearth: a target, a social frame, clean, beautified, burst, all screens (shared with the chat's own /screenshot).
568. `/record`: record Hearth outside the Lab (or `/record app …`): presets, targets, fps, sizes, sound, length, markers, pause, status.
569. `/rec`: the same as /record, anywhere.
570. `/tour`: run, list, edit, tape and stop tours; `/tour steps` lists the steps.
571. `/frames`: (/read-frames) any reading of any video.
572. `/frame-at`: one exact frame at a time, timecode or frame number.
573. `/scenes`: scene changes with their frames and lengths.
574. `/contact`: a contact sheet (layouts, themes, labels).
575. `/pacing`: how a video is cut, in numbers and words.
576. `/motion-curve`: the motion energy chart.
577. `/frame-palette`: the main colors of a video or a frame.
578. `/make`: GIF, trim, timelapse, boomerang, PNG frames, 9:16 / 1:1 / 4:5 copies, sound, poster, loop.
579. `/captures`: (/shots) the library, pictures or videos.
580. `/capture-last`: open the newest capture.
581. `/annotate`: draw on the newest screenshot.
582. `/beautify`: the newest screenshot for a post: a look or your mix.
583. `/crop-shot`: the newest screenshot in a social frame (crop or fit).
584. `/copy-shot`: the newest screenshot to the clipboard.
585. `/clean-ui`: hide toasts, menus, scrollbars (norail: and the rail) for your own screenshots or screen recorders.
586. `/cursor-fx`: cursor and click effects now and in takes.
587. `/keys-overlay`: show the keys you press.
588. `/window-size`: the window's content at an exact size (1920x1080…), reset.
589. `/capture-tools`: let this chat's AI (or every chat of an agent) capture and read frames.
590. `/capture-folder`: where captures go (open, choose, a path).
591. `/record-presets`: the recording presets and your default.
592. `/capture-help`: everything capture does, with its keys and commands.

## Keys (all in the keys list; each also in a menu or a command)

593. ⌘/Ctrl+Alt+S: Capture menu (screenshots, recording, tours, captures).
594. ⌘/Ctrl+Alt+A: Screenshot of a region you drag (or a thing you click).
595. ⌘/Ctrl+Alt+R: Start / stop recording Hearth.
596. ⌘/Ctrl+Alt+P: Pause / resume the recording.
597. ⌘/Ctrl+Alt+V: Your captures.
598. ⌘/Ctrl+Alt+T: Tours: pick one / stop the running one.
599. Esc: Stops a running tour.
600. Shift (drag a region): Keep the ratio of the chosen social frame.
601. Alt (drag a region): Draw the region from its center.
602. Space (drag a region): Move the region while dragging.
603. ⌘/Ctrl+release (drag a region): Keep adjusting: arrows move, Alt+arrows resize, Enter takes it.
604. Click (region picker): Capture the thing under the pointer.
605. Alt (opening a capture menu): Show every item at once (no More…).
606. Click the timecode (player): Timecode / seconds / frame number.
607. ← / → (player): One frame back / on (Shift: 10).
608. , / . (player): One frame back / on.
609. Space / K (player): Play / pause.
610. J / L (player): Half a second back / play faster.
611. Home / End (player): First / last frame.
612. M (player): Next recording marker.
613. R (player): Read frames: contact sheet, scenes, motion….
614. C (player): Copy the frame on screen.
615. S (player): Save the frame on screen.
616. Enter (player): Send the frame on screen to the chat.
617. Right-click (speed button): Pick a playback speed.
618. I / O (player): Set the start / end of a part (for Make…: a GIF, a trim, a loop).
619. X (player): Clear the I / O part.
620. G (player): A GIF of the I / O part (or of the whole video).
621. Wheel / double-click (picture): Zoom / fit.
622. A (picture): Annotate.
623. C (picture): Copy.
624. Enter (picture): Attach to the chat.
625. 1–9, 0 (annotate): Colors.
626. [ / ] (annotate): Thinner / thicker.
627. Shift (annotate): Straight lines at 45°, square boxes.
628. ⌘/Ctrl+Z / ⌘/Ctrl+Shift+Z (annotate): Undo / redo.
629. ⌘/Ctrl+S (annotate): Save as a new picture.
630. ⌘/Ctrl+C (annotate): Copy the result.
631. Delete (annotate): Remove the selected shape.
632. Double-click text (annotate): Edit the text.
633. Double-click (captures): Open.
634. Alt+click (captures): Attach to the chat.
635. Right-click (captures, frames, player): Everything for that capture: copy, chat, Video Review, editor, Lab, read frames, beautify, social frame….
636. Drag (captures, frames): Into a chat, the board, Finder / Explorer or another app as a real file.
637. V (annotate): Select / move.
638. A (annotate): Arrow.
639. L (annotate): Line.
640. R (annotate): Box.
641. O (annotate): Circle.
642. P (annotate): Pen.
643. H (annotate): Highlighter.
644. T (annotate): Text.
645. N (annotate): Number badge (1, 2, 3…).
646. B (annotate): Blur (hide private bits).
647. X (annotate): Pixelate.
648. D (annotate): Redact (solid box).
649. S (annotate): Spotlight (dim the rest).
650. M (annotate): Magnifier (loupe).
651. C (annotate): Crop.

## Ctrl+K palette actions

652. Capture: screenshot of this tool.
653. Capture: screenshot of the whole window.
654. Capture: screenshot of a region….
655. Capture: the whole chat as one tall picture.
656. Capture: the Lab preview at full size.
657. Capture: beautified screenshot for a post.
658. Capture: screenshot in 9:16.
659. Capture: record Hearth / stop.
660. Capture: record a region….
661. Capture: pause / resume the recording.
662. Capture: your captures.
663. Capture: read frames of a video.
664. Capture: tours (hands-free recordings).
665. Capture: make a GIF of the newest recording.
666. Capture: PNG frames of the newest recording (for After Effects).
667. Capture: the newest recording in 9:16.
668. Capture: the capture menu.

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
