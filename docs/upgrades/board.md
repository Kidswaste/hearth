# Mood board (round 7, board stream)

A new rail tool, **Board** (▦): an infinite canvas of your references — pictures, clips, websites, notes, colors — that every chat can borrow a **vibe** from (palette, light, texture, motion, pacing, mood, your notes), never the footage itself unless you ask for the clip. One open action on screen (+ Add), everything else in right-click menus, Alt / Ctrl reveals and chat commands. Always at hand: **Ctrl+Shift+M** (or the ▦ in the rail, or `/board-peek`) opens it as a drawer over any chat or tool; drag a reference into a chat to attach its vibe.

Start: open ▦ Board, drop pictures / clips / links on it, then in any chat type `/board-use` (or drag a reference from Ctrl+Shift+M into the message box). The AI tools are opt-in: `/board-tools on` (or `/board-tools directors`).

## The board page (rail ▦ "Board")

An infinite canvas for your references. On screen only: the board name, + Add and the zoom. Everything else is a right-click away, behind Alt / Ctrl, or a chat command.

1. New rail tool **Board** with its own icon: an infinite canvas of pictures, clips, websites, notes, text, colors, shapes, arrows, stickers and frames.
2. Pan and zoom are one CSS transform on one layer (compositor only): nothing on the board is rewritten while you move.
3. Deep zoom from 2 % to 3200 %, always toward the pointer.
4. Mouse wheel zooms smoothly (eased toward the target, not in jumps).
5. Trackpad pinch and Ctrl+wheel zoom directly (no lag behind your fingers).
6. Two-finger trackpad scroll pans; Shift+wheel pans sideways.
7. Middle-button drag pans; Space + drag pans; an optional hand tool makes plain drags pan (View › Hand tool).
8. Two-finger touch pinch zooms and pans on touch screens.
9. Zoom readout chip: click for the view menu, Alt+click zooms to fit at once.
10. Zoom to fit (Shift+1, Ctrl+0), zoom to the selection (Shift+2), 100 % (Shift+0), + / − steps, and 11 zoom presets from 2 % to 3200 % (View › Zoom).
11. Fly-to animations (zoom to fit / selection / frames) ease in log space so zooming out and in feels even; reduced-motion jumps instead.
12. Off-screen items are culled (not drawn), with a margin so panning never shows holes; while you move only newly reachable items are revealed.
13. Pictures load a small (256 px), medium (1024 px) or full file depending on how big they are on screen, swapped only when the view settles.
14. Big pictures get downscaled copies when added, so a 6000 px photo never decodes at full size just to be a thumbnail.
15. Background pattern (dots / grid / lines / crosses) moves with the board on its own composited layer.
16. Selection handles, guides and the quick bar hide while you pan / zoom and come back when the view settles (no chrome repainting during moves).
17. Frame titles keep the same size on screen at every zoom.
18. Minimap (bottom right): appears while you move, or always / never (View › Minimap, M); click or drag in it to jump.
19. The board remembers where you were looking, per board.
20. Empty board hint: drop, paste or + Add.
21. Measured: during a 1 s trackpad pan over 150 references no layout and no raster work happens (only the transform per frame; repaints only when the move starts / settles); dev/checks/board-perf.js.

## Adding references

Files are copied into Hearth's data folder (data/board/media); your originals are never touched.

22. Drop pictures, gifs and clips (any number) anywhere on the board; they land where you drop them, in a neat row.
23. A dropped batch re-flows into a row once the real sizes are known (until you move one).
24. Paste pictures (Ctrl+V), links (become website cards or downloaded media), colors (#hex lists become swatches / palettes) and text (becomes a note).
25. Drop links or text dragged from websites or other apps.
26. + Add › Pictures or clips… (file picker with media filters).
27. + Add › Website… asks for an address; picture / clip links are downloaded, pages become cards.
28. + Add › From the clipboard (pictures or text).
29. + Add › A folder of pictures… adds every picture / clip of a folder (up to 200) and arranges them as masonry.
30. + Add › A board file (.json)… opens a board someone exported.
31. + Add › A screenshot of Hearth puts the whole window on the board.
32. + Add › The Lab's current picture (from the Three.js Lab, through its own screenshot tool).
33. + Add › Video Review's current frame.
34. + Add › Pictures from the current chat (everything attached in it).
35. + Add › Color from the screen: the eyedropper picks any pixel on screen as a swatch (E).
36. Double-click empty space for a new note right there.
37. New items added "in the middle" step aside from what is already there instead of piling up.
38. Clips get a poster frame; gifs get a still poster (they only animate on hover).
39. Copy and paste items between boards (Ctrl+C / Ctrl+V); pasted in a chat they paste their vibe text.
40. Drag a reference from the drawer onto the board to copy it from another board.
41. Drop or paste anything onto the drawer (from any chat or tool) to add it to that board without leaving what you are doing.

## Websites

A website is a card with a live snapshot, its title, its icon and an ↗ to open it in your browser.

42. Live snapshot taken by an offscreen window (no network calls from Hearth's own page; popups, downloads and permissions refused).
43. Card shows the page title, the favicon and the domain; ↗ opens it in your browser.
44. Reads the page's theme color, description and fonts (heading / body) for the vibe and the Type lens.
45. Works offline gracefully: without network the card shows the site's initial on its theme color and says why (right-click › Refresh snapshot).
46. Local and data: pages work too (saved pages, files).
47. Refresh snapshot (single, or every site with /board-snapshot all).
48. Snapshot at a size (right-click › Snapshot at): Desktop 1280 × 800, Laptop 1440 × 900, Phone 390 × 844, Tablet 820 × 1180, Tall page 1280 × 2400, Wide 1920 × 1080 — exact even beyond the screen size; the card takes the page's shape.
49. Live preview: the site inside Hearth in a large overlay (Esc closes).
50. Copy the address.
51. Snapshots run one at a time with timeouts, so a slow site never blocks the board.

## Clips on the board

Clips show posters and only play while hovered or selected and on screen (two at most), so a board full of video stays light.

52. Hover a clip to play it (muted), leave to stop; the selected clip keeps playing.
53. Per-clip in / out points: right-click › Clip › Set in / Set out at the current frame; the badge shows the played range.
54. Loop on / off per clip.
55. Sound on / off per clip (muted by default).
56. Speed per clip: 0.25×, 0.5×, 0.75×, 1×, 1.5×, 2×, 4×.
57. Step frame by frame on the selected clip (, and .).
58. Alt + move over a playing clip scrubs it from its in to its out point.
59. Frame grab: the current frame becomes a still picture next to the clip (it remembers where it came from).
60. Use the current frame as the clip's poster.
61. One still per shot: a still from the middle of every shot (found from the cuts), in a row under the clip.
62. Contact sheet: 6 frames of the clip with their times as one picture.
63. Watch large: the clip big with controls (Esc closes).
64. Open the clip in Video Review in one click.
65. Play / pause / mute every clip in view together (/board-play).
66. Clips inside a frame play together from the frame's menu (four at most).
67. A clip remembers where you left it.

## Items: look, shape, order

Right-click › Look / Arrange; Alt shows rotate and crop handles; Ctrl shows a quick bar.

68. Free drag and drop of items; drag several at once.
69. Marquee select by dragging on empty space (Shift adds); Shift+click toggles.
70. Resize from the corners; pictures keep their shape (Shift frees it), notes and frames stay free (Shift keeps it).
71. Resize several items at once from the selection box.
72. Alt (hold) reveals the rotate handle (15° steps; keep Alt for free rotation) and crop handles on the edges of a picture.
73. Crop by dragging the edges: the picture stays put, the window over it moves.
74. Ctrl (hold) reveals a quick bar on the selection: → Chat, Vibe, Open, Compare (two), ★, Duplicate, Delete.
75. Snapping to the edges and centers of nearby items with pink smart guides; Ctrl+drag moves without snapping.
76. Optional grid snap (View › Snap to a grid, G).
77. Shift+drag moves along one axis; Alt+drag duplicates.
78. Arrow keys nudge (Shift ×10); with nothing selected they pan.
79. Alt+← / → rotate the selection by 1° (Shift: 15°); Ctrl+Alt+↑ / ↓ scale it by 10 %.
80. Alt+wheel over the selection changes its opacity; Shift+Alt+wheel rotates it.
81. Flip horizontally / vertically.
82. Bring to front / forward / backward / to back (Ctrl+] / ] / [ / Ctrl+[).
83. Group / ungroup (Ctrl+G / Ctrl+Shift+G): a group selects and moves together.
84. Lock in place (it can't be dragged or resized).
85. Hide items (H): they stay out of the vibe too; Board › Show hidden brings them back.
86. Duplicate (Ctrl+D), copy, cut (Ctrl+X), delete (Del) with undo.
87. Rename; your note on an item (chats read it with the vibe).
88. Info (I): file, size in pixels, length and cuts, place on the board, date added, tags, fonts.
89. Size › Actual size (100 % of the file), Reset size, Fill its frame.
90. Swap the positions of two selected items.
91. Reset the look of an item in one click.
92. Show the file in its folder, open it with the system app, copy its path.
93. View large (pictures) with Vibe and → Chat buttons.
94. Tab / Shift+Tab select the next / previous item in reading order (and bring it on screen).
95. R jumps to a random reference (fresh eyes); /board-random.
96. Undo / redo everything on the board (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y), per board.

## Notes, text, colors, shapes, arrows, connectors

97. Notes with Markdown (titles, bold, lists, checklists, quotes), edited in place (Enter or double-click; Ctrl+Enter / Esc finish).
98. Big text items edited in place; their box grows with the text.
99. Fit text to its box (/board-fit-text).
100. Text size presets and alignment (left / center / right), text colors from the board's own palette.
101. Turn a note into big text and back.
102. Color swatches with hex and a plain color name ("deep teal").
103. Palette cards: hover a stripe for its hex, Alt+click it to copy.
104. Palette card from any picture, clip or site (right-click › Vibe › Palette card), or from the whole board.
105. Harmonies from any swatch (right-click › Harmonies), or from a picked color.
106. Pick a color… (system color picker) as a swatch.
107. Save a palette to your own library (Yours) and reuse it on any board.
108. Shapes with any color (right-click › Shape / Color).
109. Arrows and lines as items (straight, curved, dashed, double, bold).
110. Stickers (big emoji / symbols) with colors.
111. Connectors (C or right-click › Connect): arrows between items that follow them as they move, even mid-drag.
112. Connectors: style (arrow, both ways, plain, dashed, curved, bold), a label, reverse, color; they go when an item they join goes.

## Frames, templates, arrangement

113. Frames with titles: moving a frame carries what sits inside it.
114. Frame the selection (F) or add a frame of a preset size; double-click a frame title to rename it.
115. Frame colors; fit a frame to its contents (Shift+F); arrange only what is inside a frame.
116. Zoom to frame 1 … 9 with the number keys (presentation order).
117. Templates: + Add › Template (or a new board from a template) lays out titled frames and hint notes beside your content.
118. Save the board's frames as a template of your own (Board › Save as a template…).
119. Auto-arrange the selection, a frame's contents or the whole board (right-click › Arrange everything) with one undo step.
120. "Columns by …" layouts add column titles, replaced on the next arrangement.
121. Align (left, centers, right, tops, middles, bottoms), distribute with equal gaps, stack in a row / column, match width / height / size.
122. Tidy up: snaps a loose arrangement to a grid without losing its shape.

## Vibe: what Hearth reads from every reference (locally, no tokens)

Each reference gets a vibe in the background; chats get it as a short text, never the file.

123. Dominant palette by k-means (up to 6 colors with their share), seeded so small accent colors survive.
124. Light: key (low / mid / high), contrast from the 5–95 % brightness range.
125. Color: saturation, colorfulness, warmth (warm / neutral / cool).
126. Texture: edge density (clean / busy) and grain.
127. Composition: where the visual weight sits (thirds, centered), symmetry, negative space, horizon line.
128. Aspect ratio named (9:16, 4:5, 1:1, 16:9, 2.39:1…).
129. Clips: motion energy from ~4 samples a second, cuts (brightness or color jumps), seconds per shot, cuts per minute, cut times.
130. Clips: light over time (steady, pulsing, brightening, darkening, strobing) and color drift.
131. Sites: the snapshot's vibe plus fonts and theme color; offline sites keep their theme color.
132. Mood words from the descriptors (nocturnal, airy, electric, gritty, rapid-fire cuts, long takes…).
133. Your notes, tags and stamps ride along with each vibe; ★ / ♥ references weigh more in the board's vibe.
134. Board vibe: merged palette, average light / color / texture, median motion and pacing, top moods, tags, fonts and your notes.
135. A board brief (your intent in your words) goes first in every board vibe (Board › Brief…, /board-brief).
136. References in a frame named "Avoid" / "Don't" (or stamped ✕) become an "avoid" line instead of the vibe.
137. Default vibe focus per board (Board › Chats get…, /board-focus): e.g. a board that only lends its palette.
138. Vibe card (right-click › Vibe › Show the vibe): palette, meters for light / contrast / saturation / warmth / texture / grain / space / symmetry / motion, pacing, and the exact text chats get.
139. Find similar: selects what feels like the selected reference; vibe distance between any two.
140. Read the vibe again (after replacing a file, or to refresh).
141. Tags from the vibe: #low-key #warm #muted #busy #fast-cuts #teal… on the selection or the whole board.
142. Unfinished work (thumbnails, posters, snapshots, vibes) resumes when the board opens again.

## Search, tags, stamps

143. Search / filter the board (/ or Ctrl+F): words, #tags, color names ("teal"), mood words, kinds ("clip", "site"), fonts; non-matches fade.
144. Search by a #hex color finds references with a close color.
145. Enter selects and zooms to the matches; Select gives the same.
146. Tags on items (right-click › Tags): toggle existing tags, new tag, clear.
147. Stamps on items (right-click › Stamp, S for ★): a small mark that also sorts, filters and weighs the vibe.
148. Select › everything, nothing, invert, pictures, clips, sites, notes, colors, frames, stamped, untagged, with a tag, same kind, added in the last hour, added today, like the selected.

## Chats: always at hand, vibes not footage

The board is reachable from every chat and tool, and chats get references as a short vibe text.

149. The drawer: Ctrl+Shift+M, the small ▦ in the rail, or /board-peek opens the board over any chat or tool.
150. Drawer: the chat's linked board first (or the current one), a board picker, search, and the board's palette + vibe in two lines.
151. Drag a reference from the drawer into any chat's message box: the chat gets a "vibe · name.txt" attachment with its vibe, not the file.
152. Drag the board's vibe strip into a chat for the whole board's vibe; click it to pick the focus.
153. Hover a drawer tile for → (attach to the chat on screen); right-click a tile to send only its palette / light / motion…
154. Right-click the rail ▦: open the board, use its vibe here, link it to this chat, new board.
155. Every vibe sent to a chat ends with "references give a vibe only: don't put the reference media in the result unless I ask for the clip".
156. Link a board to a chat (drawer, Board › Link to a chat, /board-link): that chat's drawer, /board-use and the board tools use it.
157. Send vibe to a chat from any item's menu, any frame's menu (the frame's contents) or the board's menu, to any Claude / Astra chat, with a focus.
158. Give the board's vibe to the Three Director in one click (Board menu, /board-to-lab): it lands in its message box with the "for a Lab scene" focus.
159. Save a chat's last reply to the board as a note (/board-save-reply).
160. Copy the vibe text of the selection or the board.
161. Drawer width (260–520 px) and side (left / right) from its right-click menu.
162. Board tools for the AI (opt-in per agent: /board-tools on, or "directors"): Claude and Astra can list boards, read a board / frame / item vibe (with a small preview on request), add notes / links / colors / frames, and arrange.
163. The board tools cost ≈ 460 tokens of definitions and one ≈ 70-token prompt line, only for agents you switch them on for; plain chats pay nothing.
164. The board tools' descriptions and prompt line say it plainly: references give a vibe; never place reference media in the output unless the owner asks for the clip.
165. board_vibe for one item returns the vibe, the path of a small preview and (with image: true) a 384 px JPEG; clips also return their cut times.
166. board_add can place things inside a named frame; board_arrange can arrange a frame or items by id.
167. The app map (hearth-map) has a "board" topic both engines can read (help board / moodboard / vibe / refs).

## Boards

168. Several boards: switch from the board chip, the Board menu, /board <name> or the drawer.
169. New board, new board from a template, rename, duplicate, delete (with Undo in the notification).
170. Star boards (starred come first); lock a board (look, pan and send vibes; nothing moves).
171. Board backgrounds (View › Background), or a picture of your own behind the board (dimmed).
172. Versions: save a version (Ctrl+Shift+S, /board-version) and go back to any of the last 12.
173. All boards at a glance with their covers (/board-overview).
174. The board as a sortable table of references with their vibe numbers (/board-list); click a row to go there.
175. Statistics (kinds, clip time, vibes still being read, linked chats) and a vibe comparison between two boards (/board-diff).
176. Move or copy the selection to another board.
177. Tidy the media folder: files no board uses go to the Recycle Bin (never deleted outright).
178. Saves are debounced and flushed when the window closes; every save keeps the previous one (kv .prev).

## Export, present, compare

179. Export draws the board itself (with crops, looks, blends, rotation, notes, text styles, shapes, arrows and connectors).
180. Presentation (P or Present › Start): flies between frames in order (or between items when there are no frames), → / Space next, ← back, Home / End, Esc ends; clips in the frame play.
181. Presentation order per frame (Earlier / Later), start from a selected frame, auto-advance every 3–20 s.
182. Presentation flights are single compositor animations on the board layer; the view lands exactly on the frame.
183. Compare two items: wipe, side by side, onion skin, difference, with both vibes and their vibe distance.
184. Copy the selection or the board to the clipboard as a picture (Ctrl+Shift+C).

## Layouts (auto-arrange)

Right-click › Arrange / Arrange everything, /board-layout <name>, board_arrange.

185. Grid: even rows, cells fit each item (`/board-layout grid`).
186. Tight grid: grid with hairline gaps (`/board-layout grid-tight`).
187. Airy grid: lots of breathing room (`/board-layout grid-airy`).
188. Grid · 2 columns (`/board-layout grid-2`).
189. Grid · 3 columns (`/board-layout grid-3`).
190. Grid · 4 columns (`/board-layout grid-4`).
191. Grid · 6 columns (`/board-layout grid-6`).
192. Square cells: every item in the same square (`/board-layout square-cells`).
193. Contact sheet: small equal squares like a film contact sheet (`/board-layout contact`).
194. Masonry: Pinterest-style columns (`/board-layout masonry`).
195. Masonry · 3 columns (`/board-layout masonry-3`).
196. Masonry · 5 columns (`/board-layout masonry-5`).
197. Masonry · wide columns (`/board-layout masonry-wide`).
198. One row: same height, side by side (`/board-layout row`).
199. Filmstrip: a tight strip of equal heights (`/board-layout filmstrip`).
200. One column: same width, stacked (`/board-layout column`).
201. Timeline strip (oldest → newest): in the order you added them (`/board-layout timeline`).
202. Timeline strip by length: clips sized by duration, stills as beats (`/board-layout timeline-duration`).
203. Timeline strip by pacing: slow cuts first, fast cuts last (`/board-layout timeline-pacing`).
204. Collage: packed edge to edge (`/board-layout collage`).
205. Collage, tilted: overlapping with a small tilt (`/board-layout collage-tilt`).
206. Polaroid scatter: loose and handmade (`/board-layout polaroid`).
207. Scatter (`/board-layout scatter`).
208. Pile: stacked like prints on a desk (`/board-layout pile`).
209. Card deck: fanned to the right (`/board-layout deck`).
210. Circle: a ring around the center (`/board-layout circle`).
211. Spiral: first item in the middle (`/board-layout spiral`).
212. Diagonal (`/board-layout diagonal`).
213. Zigzag (`/board-layout zigzag`).
214. Honeycomb: offset rows (`/board-layout honeycomb`).
215. Bento: one hero, the rest around it (`/board-layout bento`).
216. Hero + row: the first selected big, the rest underneath (`/board-layout hero-row`).
217. Pack (no gaps): shelves, fewest holes (`/board-layout pack`).
218. Tidy up: keeps your arrangement, snaps it to a grid (`/board-layout tidy`).
219. Rainbow (by hue): reds to violets, grays last (`/board-layout by-hue`).
220. Dark → bright (`/board-layout by-light`).
221. Muted → vivid (`/board-layout by-sat`).
222. Cool → warm (`/board-layout by-warmth`).
223. Soft → punchy (`/board-layout by-contrast`).
224. Calm → energetic: videos by motion energy (`/board-layout by-motion`).
225. Clean → busy: by texture / edge density (`/board-layout by-texture`).
226. Color wheel: angle = hue, distance = lightness (`/board-layout color-wheel`).
227. Columns by kind: pictures, clips, sites, notes, colors (`/board-layout cols-type`).
228. Columns by tag (`/board-layout cols-tag`).
229. Columns by stamp: ★ / ✓ / ✕ … (`/board-layout cols-stamp`).
230. Columns by mood: by each item's first mood word (`/board-layout cols-mood`).
231. Warm · neutral · cool (`/board-layout cols-temp`).
232. Columns by color family (`/board-layout cols-family`).
233. Low-key · mid · high-key (`/board-layout cols-light`).
234. Columns by shape: portrait / square / landscape (`/board-layout cols-aspect`).
235. Clusters by vibe: similar-feeling items grouped together (`/board-layout cluster`).
236. Around the selected (most similar near): the first selected in the middle, the closest vibes around it (`/board-layout similar`).
237. Newest first (`/board-layout newest`).
238. Biggest first (`/board-layout by-size`).
239. Shuffle: a random grid: fresh eyes on the same refs (`/board-layout shuffle`).
240. Staircase: overlapping steps (`/board-layout stairs`).
241. Grid · 5 columns (`/board-layout grid-5`).
242. Grid · 8 columns (`/board-layout grid-8`).
243. Grid · 10 columns (`/board-layout grid-10`).
244. Masonry · 2 columns (`/board-layout masonry-2`).
245. Masonry · 4 columns (`/board-layout masonry-4`).
246. Masonry · 6 columns (`/board-layout masonry-6`).
247. Tall filmstrip (`/board-layout filmstrip-tall`).
248. Small row (`/board-layout row-small`).
249. Wide column (`/board-layout column-wide`).
250. Tiny contact sheet (`/board-layout contact-tiny`).
251. Wide scatter (`/board-layout scatter-wide`).
252. Tight pile (`/board-layout pile-tight`).
253. Airy collage (`/board-layout collage-airy`).
254. Big honeycomb (`/board-layout honeycomb-big`).

## Templates

+ Add › Template, Board › New from a template, /board-template <name>, /board-new <name> | <template>.

255. Basics › Moodboard: Mood, Palette, Light, Motion, Texture, Type (`/board-template moodboard`).
256. Basics › Three columns: palette · light · motion: Palette, Light, Motion (`/board-template mood-3`).
257. Basics › Want · avoid: Want, Avoid (`/board-template refs-avoid`).
258. Basics › Try · trying · keep: To try, Trying, Keep (`/board-template kanban`).
259. Basics › Weekly inspiration: Mon, Tue, Wed, Thu, Fri, Weekend (`/board-template weekly`).
260. Basics › A / B looks: Look A, Look B (`/board-template a-b`).
261. Basics › Before / after: Before, After (`/board-template before-after`).
262. Basics › Four empty frames: 1, 2, 3, 4 (`/board-template blank-frames`).
263. Music › Music video treatment: Song feel, Palette, Light, Camera & motion, Cut pacing, Type & titles, Key moments, Avoid (`/board-template music-video`).
264. Music › Music visualizer: Drop energy, Calm parts, Palette, Shapes & textures, Reactions to the beat, Frame sizes (`/board-template visualizer`).
265. Music › Album cover: Cover, Type, Palette, Back cover (`/board-template album-cover`).
266. Music › Tour poster: Poster, Type, Palette, Photos (`/board-template tour-poster`).
267. Music › Lyric video: Type in motion, Backgrounds, Palette, Timing (`/board-template lyric-video`).
268. Music › DJ set visuals: Warm-up, Build, Peak, Cool-down (`/board-template dj-set`).
269. Social › Social reel (9:16): Hook 0–2 s, Middle, Payoff, End card (`/board-template social-reel`).
270. Social › Carousel 4:5: Slide 1, Slide 2, Slide 3, Slide 4, Slide 5 (`/board-template carousel`).
271. Social › Thumbnail tests (16:9): Thumb A, Thumb B, Thumb C, Thumb D (`/board-template thumbs`).
272. Social › Story set: Story 1, Story 2, Story 3 (`/board-template story-set`).
273. Social › App intro video: Hook, The problem, The app in action, Features montage, Call to action, Palette & type (`/board-template app-intro`).
274. Social › Product launch: Teaser, Reveal, Details, Lifestyle, Launch day (`/board-template launch`).
275. Design › Brand board: Logo, Palette, Type, Imagery, Voice, Do / don't (`/board-template brand`).
276. Design › Logo exploration: Marks, Wordmarks, Colors, Contexts (`/board-template logo`).
277. Design › UI look: Screens, Components, Palette, Type, Motion, Icons (`/board-template ui`).
278. Design › Type study: Headlines, Body, Pairings, In motion (`/board-template typography`).
279. Design › Poster: Poster, Layout refs, Palette, Type (`/board-template poster`).
280. Design › Editorial spread: Spread, Photos, Type, Grid (`/board-template editorial`).
281. Design › Packaging: Front, Back, Materials, Palette (`/board-template packaging`).
282. Design › Icon set: Style refs, Grid & stroke, Set, In context (`/board-template icon-set`).
283. Film › Film look: Grade, Grain & texture, Lenses, Light, Framing, Pacing (`/board-template film-look`).
284. Film › Storyboard · 6 panels: Shot 1, Shot 2, Shot 3, Shot 4, Shot 5, Shot 6 (`/board-template storyboard-6`).
285. Film › Storyboard · 9 panels: Shot 1, Shot 2, Shot 3, Shot 4, Shot 5, Shot 6, Shot 7, Shot 8, Shot 9 (`/board-template storyboard-9`).
286. Film › Storyboard · 12 panels: Shot 1, Shot 2, Shot 3, Shot 4, Shot 5, Shot 6, Shot 7, Shot 8, Shot 9, Shot 10, Shot 11, Shot 12 (`/board-template storyboard-12`).
287. Film › Shot list: Wide, Medium, Close-up, Insert, Movement, Transitions (`/board-template shot-list`).
288. Film › Color script: Act 1, Act 2, Act 3, Climax, End (`/board-template color-script`).
289. Film › Lighting study: Key, Fill, Rim, Practicals, Night, Golden hour (`/board-template lighting`).
290. Film › Title sequence: Opening, Names, Transitions, Type, Palette, Ending (`/board-template title-seq`).
291. Film › VFX look-dev: Plates, Elements, Comp refs, Grade (`/board-template vfx`).
292. Film › Documentary: Interviews, B-roll, Archival, Graphics (`/board-template documentary`).
293. 3D / games › Character: Silhouette, Faces, Costume, Palette, Poses, Materials (`/board-template character`).
294. 3D / games › Environment: Wide, Details, Light, Weather, Palette, Scale (`/board-template environment`).
295. 3D / games › Material study: Metal, Glass, Fabric, Stone, Organic, Emissive (`/board-template material`).
296. 3D / games › Three.js scene: Forms, Materials, Light & fog, Camera moves, Post effects, Palette (`/board-template three-scene`).
297. 3D / games › Shader look: Patterns, Noise, Color ramps, Motion (`/board-template shader`).
298. 3D / games › Game level: Layout, Landmarks, Mood, Enemies, UI, Palette (`/board-template game-level`).
299. 3D / games › Game UI: HUD, Menus, Icons, Fonts, Effects (`/board-template game-ui`).
300. Motion › Motion study: Easing, Timing, Loops, Transitions, Particles, Camera (`/board-template motion-study`).
301. Motion › Loop ideas: Seamless, Morphs, Patterns, Kinetic type (`/board-template loops`).
302. Motion › Transitions: Cuts, Wipes, Morphs, Match cuts, Glitches (`/board-template transitions`).
303. Motion › Kinetic type: Layouts, Rhythm, Fonts, Color (`/board-template kinetic-type`).
304. Lifestyle › Fashion: Silhouettes, Fabrics, Palette, Styling, Locations (`/board-template fashion`).
305. Lifestyle › Interior: Rooms, Materials, Light, Furniture, Palette (`/board-template interior`).
306. Lifestyle › Architecture: Forms, Facades, Materials, Light, Context (`/board-template architecture`).
307. Lifestyle › Food styling: Plates, Props, Light, Palette (`/board-template food`).
308. Lifestyle › Travel: Places, People, Light, Palette, Textures (`/board-template travel`).
309. Photo › Photo series: Subjects, Framing, Light, Grade, Sequence (`/board-template photo-series`).
310. Photo › Portrait lighting: Soft, Hard, Color gels, Backgrounds (`/board-template portrait`).
311. Photo › Street photo: Moments, Geometry, Light & shadow, Night (`/board-template street`).
312. Photo › Product shots: Hero, Details, Lifestyle, Backgrounds (`/board-template product-shot`).
313. Events › Event visuals: Stage, Screens, Signage, Merch, Palette (`/board-template event`).
314. Events › Celebration: Venue, Flowers, Palette, Stationery, Light (`/board-template wedding`).
315. Events › Workshop: Goals, References, Ideas, Decisions (`/board-template workshop`).
316. Business › Pitch deck look: Cover, Story, Charts, Photos, Palette, Type (`/board-template pitch`).
317. Business › Competitor scan: Them, Us, Gaps, Steal like an artist (`/board-template competitors`).
318. Business › Portfolio: Best work, Process, About, Layout refs (`/board-template portfolio`).
319. Web › Website look: Hero sections, Navigation, Type, Palette, Motion, Footers (`/board-template website`).
320. Web › Landing page: Hero, Features, Social proof, Pricing, Call to action (`/board-template landing`).
321. Web › Newsletter: Headers, Layouts, Type, Images (`/board-template newsletter`).
322. Web › Dark mode study: Surfaces, Accents, Text, States (`/board-template dark-mode`).
323. Color › Palette exploration: Warm, Cool, Neon, Pastel, Earth, Mono (`/board-template palette-explore`).
324. Color › Gradients: Linear, Radial, Mesh, Grain (`/board-template gradients`).
325. Color › Neon night: Signs, Rain, Reflections, Palette (`/board-template neon-night`).
326. Color › Golden hour: Skies, Skin, Shadows, Palette (`/board-template golden-hour`).
327. Color › Forgeheart look: Gold, Molten, Chrome, Glass, Embers (`/board-template forgeheart`).
328. Social › Hearth intro (social): Logo sting, The app moving, Chats in action, The Lab, Outro (`/board-template hearth-intro`).
329. Social › Trend remake: Original, Our take, Sound, Captions (`/board-template tiktok-trend`).
330. Social › YouTube video look: Thumbnail, Intro, B-roll, Lower thirds, End screen (`/board-template yt-video`).
331. Social › Podcast cover + clips: Cover, Clip frames, Waveform style, Type (`/board-template podcast`).
332. Social › Ad spot: Hook, Product, Benefit, Proof, Offer, End card (`/board-template ad`).
333. Music › Single release promo: Cover, Canvas loop, Teaser, Palette, Type (`/board-template music-promo`).
334. Music › Live show visuals: LED wall, Stage light, Loops, Transitions, Palette by song (`/board-template live-visuals`).
335. Music › Beat-synced moments: Intro, Verse, Pre, Drop, Break, Outro (`/board-template beat-map`).
336. Music › Techno visual: Monochrome, Strobes, Geometry, Tunnels (`/board-template genre-techno`).
337. Music › Ambient visual: Slow forms, Fog & light, Water, Palette (`/board-template genre-ambient`).
338. Music › Hip-hop visual: Streets, Type, Gold, Crew, Cars (`/board-template genre-hiphop`).
339. Music › Pop visual: Color, Dance, Fashion, Sets, Type (`/board-template genre-pop`).
340. Music › Rock visual: Live energy, Grain, Type, Merch (`/board-template genre-rock`).
341. 3D / games › Lab: particles: Swarms, Trails, Bursts, Colors, Camera (`/board-template lab-particles`).
342. 3D / games › Lab: tunnel: Shapes, Speed, Light, Palette (`/board-template lab-tunnel`).
343. 3D / games › Lab: terrain: Landforms, Sky, Fog, Flyover (`/board-template lab-terrain`).
344. 3D / games › Lab: glass & chrome: Refraction, Reflections, Lighting, Backgrounds (`/board-template lab-glass`).
345. 3D / games › Lab: 3D type: Letterforms, Materials, Motion, Lighting (`/board-template lab-type`).
346. 3D / games › Lab: abstract loops: Patterns, Noise, Color ramps, Loops (`/board-template lab-abstract`).
347. Film › Neo-noir: Shadows, Rain, Neon, Faces, Type (`/board-template noir`).
348. Film › Sci-fi: Worlds, Interfaces, Ships, Light, Palette (`/board-template scifi`).
349. Film › Horror: Dread, Light, Faces, Places, Sound (`/board-template horror`).
350. Film › Western: Landscapes, Dust, Faces, Type (`/board-template western`).
351. Film › Road movie: Roads, Cars, Motels, Skies, Night (`/board-template road-movie`).
352. Film › Trailer: Hook, World, Conflict, Montage, Title card (`/board-template trailer`).
353. Basics › Mood of the week: Colors, Pictures, Words, Sounds (`/board-template mood-week`).
354. Basics › Inbox (sort later): Inbox (`/board-template inbox`).
355. Basics › Yes · maybe · no: Yes, Maybe, No (`/board-template yes-maybe-no`).
356. Basics › Palette · light · motion · type: Palette, Light, Motion, Type (`/board-template palette-light-motion`).
357. Basics › Reference vs ours: Reference, Ours, Notes (`/board-template reference-vs-ours`).
358. Business › Review round: Option A, Option B, Option C, Feedback, Decision (`/board-template client-review`).
359. Business › Brand refresh: Old, New direction, Competitors, Palette, Type (`/board-template brand-refresh`).
360. Web › App store screenshots: Shot 1, Shot 2, Shot 3, Shot 4, Shot 5 (`/board-template app-store`).
361. Web › App onboarding: Screen 1, Screen 2, Screen 3 (`/board-template onboarding`).
362. Web › Dashboard look: Layouts, Charts, Cards, Palette, Dark / light (`/board-template dashboard`).
363. Design › App icon: Icon, Variations, Colors, In the dock (`/board-template icon-app`).
364. Design › Merch: Shirts, Stickers, Posters, Palette (`/board-template merch`).

## Vibe lenses (recolor the view by its vibe)

Right-click › Lens, View › Lens, L cycles, /board-lens <name>.

365. Palette: each item as its palette stripes (`/board-lens palette`).
366. Dominant color: each item as its strongest color (`/board-lens dominant`).
367. Color blocks: flat blocks of each item's colors, sized by share (`/board-lens blocks`).
368. Light: black and white, contrast pushed: see the values (`/board-lens light`).
369. Light zones: shadows / mids / highlights in three steps (`/board-lens luma`).
370. Squint: blurred: only the big shapes and values remain (`/board-lens squint`).
371. Monochrome: no color at all (`/board-lens mono`).
372. Saturation boost: colors pushed to see the hues (`/board-lens vivid`).
373. Negative: inverted (`/board-lens invert`).
374. Motion: red = lots of motion, blue = calm; stills fade (`/board-lens motion`).
375. Cut pacing: seconds per shot on every clip (`/board-lens pacing`).
376. Warmth: warm vs cool tint (`/board-lens warmth`).
377. Saturation: how colorful each item is (`/board-lens saturation`).
378. Contrast: soft to punchy (`/board-lens contrast`).
379. Texture: clean to busy (edge density) (`/board-lens texture`).
380. Brightness: dark to bright (`/board-lens brightness`).
381. Composition: thirds grid and where the weight sits (`/board-lens composition`).
382. Symmetry: how mirror-like each item is (`/board-lens symmetry`).
383. Negative space: how much calm empty area (`/board-lens space`).
384. Mood words: the words Hearth reads in each item (`/board-lens mood`).
385. Type: fonts of sites and text; pictures fade (`/board-lens type`).
386. Tags: your tags on every item (`/board-lens tags`).
387. Notes: your notes on every item (`/board-lens notes`).
388. Shape: aspect ratio of every item (`/board-lens aspect`).
389. Stamped only: only items with a stamp (`/board-lens stamps`).
390. Clips only: only videos and gifs (`/board-lens videos`).
391. Stills only: only pictures (`/board-lens stills`).
392. Sites only: only website cards (`/board-lens sites`).
393. Outlines: boxes only: the board's own composition (`/board-lens outline`).
394. Focus selection: everything but the selection fades (`/board-lens focus`).
395. Like the selection: red = feels like what you selected, blue = far from it (`/board-lens similar`).
396. Grain: smooth to grainy (`/board-lens grain`).
397. Color families: each item's main color family (`/board-lens family`).
398. Clip length: duration of clips (`/board-lens length`).
399. When added: how long ago each item came in (`/board-lens added`).
400. Resolution: pixel size of pictures and clips (`/board-lens resolution`).
401. Warm only: only the warm references (`/board-lens warm-only`).
402. Cool only: only the cool references (`/board-lens cool-only`).
403. Low-key only: only the dark references (`/board-lens dark-only`).
404. High-key only: only the bright references (`/board-lens bright-only`).
405. Notes and text only: only your words (`/board-lens notes-only`).
406. Colors only: only swatches and palettes (`/board-lens colors-only`).

## Looks for pictures and clips

Right-click › Look › Filter, /board-look <name> (the export draws them too).

407. Original.
408. Black & white (grayscale(1)).
409. Hard black & white (grayscale(1) contrast(1.6)).
410. Soft black & white (grayscale(1) contrast(0.85) brightness(1.08)).
411. Noir (grayscale(1) contrast(1.9) brightness(0.8)).
412. Sepia (sepia(0.85)).
413. Faded film (contrast(0.82) brightness(1.1) saturate(0.75) sepia(0.12)).
414. Matte (contrast(0.88) brightness(1.06) saturate(0.9)).
415. Warm (sepia(0.25) saturate(1.25) hue-rotate(-8deg)).
416. Cool (saturate(1.1) hue-rotate(12deg) brightness(1.02)).
417. Vivid (saturate(1.7) contrast(1.1)).
418. Punchy (contrast(1.35) saturate(1.3)).
419. Muted (saturate(0.45)).
420. Pastel (saturate(0.6) brightness(1.18) contrast(0.88)).
421. Bleach bypass (saturate(0.35) contrast(1.5) brightness(0.95)).
422. Cross-process (contrast(1.2) saturate(1.5) hue-rotate(-18deg) sepia(0.15)).
423. Teal & orange (sepia(0.3) saturate(1.6) hue-rotate(-12deg) contrast(1.1)).
424. Cyberpunk (hue-rotate(280deg) saturate(2.2) contrast(1.2)).
425. Day for night (brightness(0.55) saturate(0.7) hue-rotate(200deg) contrast(1.2)).
426. Sunset (sepia(0.5) saturate(1.7) hue-rotate(-24deg) brightness(1.04)).
427. Dreamy (blur(1.2px) brightness(1.12) saturate(1.15) contrast(0.9)).
428. Haze (contrast(0.7) brightness(1.18)).
429. Darker (brightness(0.7)).
430. Brighter (brightness(1.3)).
431. More contrast (contrast(1.4)).
432. Less contrast (contrast(0.7)).
433. Soft blur (blur(3px)).
434. Heavy blur (blur(10px)).
435. Invert (invert(1)).
436. X-ray (invert(1) grayscale(1) contrast(1.3)).
437. Thermal-ish (invert(1) hue-rotate(180deg) saturate(3) contrast(1.3)).
438. Hue shift 90° (hue-rotate(90deg)).
439. Hue shift 180° (hue-rotate(180deg)).
440. Hue shift 270° (hue-rotate(270deg)).
441. Lomo (contrast(1.4) saturate(1.5) brightness(0.95)).
442. Polaroid (sepia(0.2) contrast(0.95) brightness(1.1) saturate(1.2)).
443. Warm print (sepia(0.18) saturate(1.35) contrast(1.08) brightness(1.04)).
444. Green print (saturate(1.2) hue-rotate(8deg) contrast(1.05)).
445. Chrome (grayscale(0.6) contrast(1.6) brightness(1.1)).
446. Gilded (sepia(1) saturate(2.4) hue-rotate(-6deg) brightness(1.05)).
447. Neon (saturate(3) contrast(1.3) brightness(1.1)).
448. Ghost (opacity(0.55) grayscale(0.5) blur(0.6px)).
449. Silhouette (brightness(0.2) contrast(3)).
450. Poster (contrast(2.4) saturate(1.6)).
451. Washed out (brightness(1.25) contrast(0.75) saturate(0.8)).
452. Moody (brightness(0.82) contrast(1.15) saturate(0.8)).
453. VHS-ish (saturate(1.4) contrast(1.15) blur(0.6px) hue-rotate(-6deg)).
454. Cinema (contrast(1.12) saturate(0.85) sepia(0.12) brightness(0.96)).
455. Vivid print (saturate(1.5) contrast(1.12) hue-rotate(-4deg)).
456. Soft portrait (saturate(0.9) contrast(0.92) brightness(1.06) sepia(0.12)).
457. Grainy B&W (grayscale(1) contrast(1.35) brightness(0.95)).
458. Cool B&W (grayscale(1) sepia(0.2) hue-rotate(180deg) contrast(1.1)).
459. Warm B&W (grayscale(1) sepia(0.35) contrast(1.05)).
460. Infrared-ish (hue-rotate(180deg) saturate(1.8) contrast(1.2) invert(0.1)).
461. Lo-fi (contrast(1.5) saturate(1.3) brightness(0.9)).
462. Summer (brightness(1.1) saturate(1.35) sepia(0.15)).
463. Winter (brightness(1.08) saturate(0.6) hue-rotate(15deg)).
464. Autumn (sepia(0.4) saturate(1.4) hue-rotate(-14deg)).
465. Spring (brightness(1.08) saturate(1.2) hue-rotate(8deg)).
466. Pink cast (sepia(0.3) hue-rotate(290deg) saturate(2)).
467. Green cast (sepia(0.3) hue-rotate(60deg) saturate(1.6)).
468. Blue cast (sepia(0.3) hue-rotate(170deg) saturate(1.6)).
469. Red cast (sepia(0.5) hue-rotate(-30deg) saturate(2.2)).
470. Amber (sepia(0.7) saturate(1.8) hue-rotate(-10deg)).
471. Ink (grayscale(1) contrast(3) brightness(1.1)).
472. Fog (contrast(0.6) brightness(1.25) saturate(0.7) blur(0.8px)).
473. Dusk (brightness(0.8) sepia(0.25) hue-rotate(-20deg) saturate(1.3)).
474. Midnight (brightness(0.6) hue-rotate(210deg) saturate(1.4) contrast(1.3)).
475. Acid (hue-rotate(90deg) saturate(3) contrast(1.4)).
476. Soft focus (blur(1.6px) brightness(1.05)).

## Blend modes

Right-click › Look › Blend, /board-blend <mode>.

477. Blend: normal.
478. Blend: multiply.
479. Blend: screen.
480. Blend: overlay.
481. Blend: darken.
482. Blend: lighten.
483. Blend: color-dodge.
484. Blend: color-burn.
485. Blend: hard-light.
486. Blend: soft-light.
487. Blend: difference.
488. Blend: exclusion.
489. Blend: hue.
490. Blend: saturation.
491. Blend: color.
492. Blend: luminosity.

## Opacity, corners, shadows, borders, rotation

Right-click › Look.

493. Opacity 100 %.
494. Opacity 85 %.
495. Opacity 70 %.
496. Opacity 50 %.
497. Opacity 30 %.
498. Opacity 15 %.
499. Corners: Square.
500. Corners: Slight (default).
501. Corners: Soft.
502. Corners: Round.
503. Corners: Circle / oval.
504. Shadow: None.
505. Shadow: Soft.
506. Shadow: Hard offset.
507. Shadow: Gold glow.
508. Shadow: Floating.
509. Border: None.
510. Border: Thin line.
511. Border: Thick white.
512. Border: Polaroid.
513. Border: Gold.
514. Rotate 90° right.
515. Rotate 90° left.
516. Rotate 180°.
517. Tilt +15°.
518. Tilt −15°.
519. Straighten.

## Crops

Right-click › Look › Crop, /board-crop <ratio>; Alt-drag the edges for a free crop.

520. Crop Free (reset).
521. Crop 1:1.
522. Crop 4:5.
523. Crop 5:4.
524. Crop 3:4.
525. Crop 4:3.
526. Crop 2:3.
527. Crop 3:2.
528. Crop 9:16.
529. Crop 16:9.
530. Crop 21:9.
531. Crop 2.39:1.
532. Crop 1.85:1.
533. Crop 3:1 banner.

## Note colors and sizes

Right-click a note › Note color / Text size.

534. Note color: Lemon.
535. Note color: Peach.
536. Note color: Mint.
537. Note color: Sky.
538. Note color: Lilac.
539. Note color: Rose.
540. Note color: Paper.
541. Note color: Kraft.
542. Note color: Ink.
543. Note color: Slate.
544. Note color: Gold.
545. Note color: Ember.
546. Note color: Ice.
547. Note color: Neon pink.
548. Note color: Neon lime.
549. Note color: Blueprint.
550. Note color: Chalkboard.
551. Note color: Glass.
552. Note color: Forge.
553. Note color: Index card.
554. Note color: Teal.
555. Note color: Coral.
556. Note color: Lavender.
557. Note color: Sand.
558. Note color: Night.
559. Note color: Wine.
560. Note color: Moss.
561. Note color: Chrome.
562. Note text: Small text.
563. Note text: Normal text.
564. Note text: Large text.
565. Note text: Huge text.

## Text styles

Right-click a text › Text style; Size presets 24–240.

566. Text style: Clean sans.
567. Text style: Heavy.
568. Text style: Poster.
569. Text style: Wide caps.
570. Text style: Thin.
571. Text style: Serif.
572. Text style: Serif italic.
573. Text style: Fashion serif.
574. Text style: Book.
575. Text style: Mono.
576. Text style: Terminal.
577. Text style: Typewriter.
578. Text style: Handwritten.
579. Text style: Script.
580. Text style: Condensed.
581. Text style: Rounded.
582. Text style: Forgeheart.
583. Text style: Neon glow.
584. Text style: Outline.
585. Text style: Chrome.
586. Text style: Gold leaf.
587. Text style: Sunset gradient.
588. Text style: Ice gradient.
589. Text style: Drop shadow.
590. Text style: Retro offset.
591. Text style: Glitch.
592. Text style: Stencil.
593. Text style: Small caps.
594. Text style: Label.
595. Text style: Quote.
596. Text style: Tight heavy.
597. Text style: Airy light caps.
598. Text style: All lowercase.
599. Text style: Mono caps.
600. Text style: Serif caps.
601. Text style: Sticker.
602. Text style: Ember glow.
603. Text style: Ice glow.
604. Text style: Rainbow.
605. Text style: Subtle caption.
606. Text size 24.
607. Text size 36.
608. Text size 48.
609. Text size 64.
610. Text size 96.
611. Text size 128.
612. Text size 180.
613. Text size 240.

## Stamps

Right-click › Stamp, /board-stamp.

614. Stamp ★ Favorite.
615. Stamp ♥ Love it.
616. Stamp ✓ Approved.
617. Stamp ✕ Not this.
618. Stamp ? Question.
619. Stamp ! Important.
620. Stamp ☀ Light reference.
621. Stamp ♪ Music feel.
622. Stamp ⚡ Energy.
623. Stamp ◐ Contrast.
624. Stamp ◆ Color reference.
625. Stamp Aa Type reference.

## Board backgrounds

View › Background, /board-bg <name>.

626. Background: Follow the app look.
627. Background: Dots.
628. Background: Grid.
629. Background: Lined.
630. Background: Plain dark.
631. Background: Black.
632. Background: Charcoal.
633. Background: Plain light.
634. Background: Paper.
635. Background: White.
636. Background: Graph paper.
637. Background: Blueprint.
638. Background: Crosses.
639. Background: Studio gray.
640. Background: 18% gray.
641. Background: Warm dark.
642. Background: Forge.
643. Background: Night blue.
644. Background: Plum.
645. Background: Olive.
646. Background: Sand.
647. Background: Mint.
648. Background: Cork.
649. Background: Green felt.
650. Background: Slate.
651. Background: Wine.
652. Background: Ocean.
653. Background: Ember.
654. Background: Fog.
655. Background: Cream.
656. Background: Lilac.
657. Background: Deep teal.
658. Background: Light crosses.
659. Background: Void.

## Frame sizes and colors

+ Add › Frame, /board-frame <size> | <title>; right-click a frame › Frame color.

660. Frame 9:16 story / reel (540 × 960).
661. Frame 4:5 feed (540 × 675).
662. Frame 1:1 square (600 × 600).
663. Frame 16:9 video (960 × 540).
664. Frame 2.39:1 cinema (1035 × 433).
665. Frame 1.85:1 film (999 × 540).
666. Frame 4:3 (720 × 540).
667. Frame 3:2 photo (810 × 540).
668. Frame 2:3 photo (540 × 810).
669. Frame A4 portrait (595 × 842).
670. Frame A4 landscape (842 × 595).
671. Frame US Letter (612 × 792).
672. Frame Poster 2:3 (600 × 900).
673. Frame Banner 3:1 (1200 × 400).
674. Frame YouTube thumbnail (640 × 360).
675. Frame X header 3:1 (1500 × 500).
676. Frame Slide 16:9 (1280 × 720).
677. Frame Phone screen (393 × 852).
678. Frame Tablet (820 × 1180).
679. Frame Desktop screen (1440 × 900).
680. Frame Album cover (600 × 600).
681. Frame Vinyl sleeve (620 × 620).
682. Frame 21:9 (1260 × 540).
683. Frame 4:5 tall (480 × 600).
684. Frame Panorama 4:1 (1600 × 400).
685. Frame Business card (525 × 300).
686. Frame Sticky size (300 × 300).
687. Frame Tall column (520 × 1400).
688. Frame Big section (1600 × 1000).
689. Frame Huge area (3000 × 2000).
690. Frame Pinterest pin 2:3 (500 × 750).
691. Frame Spotify Canvas 9:16 (540 × 960).
692. Frame LinkedIn banner 4:1 (1584 × 396).
693. Frame YouTube banner (1280 × 720).
694. Frame Twitch panel (640 × 320).
695. Frame Link preview 1.91:1 (1200 × 628).
696. Frame 1.91:1 feed (1080 × 566).
697. Frame A3 portrait (842 × 1191).
698. Frame A5 portrait (420 × 595).
699. Frame Postcard (600 × 400).
700. Frame CD cover (600 × 600).
701. Frame Bookmark strip (200 × 600).
702. Frame Watch face (396 × 484).
703. Frame Big square (1200 × 1200).
704. Frame color: Neutral.
705. Frame color: Gold.
706. Frame color: Ember.
707. Frame color: Red.
708. Frame color: Pink.
709. Frame color: Violet.
710. Frame color: Blue.
711. Frame color: Cyan.
712. Frame color: Green.
713. Frame color: Lime.
714. Frame color: Sand.
715. Frame color: Slate.
716. Frame color: White.
717. Frame color: Black.

## Grid sizes

View › Grid size.

718. Grid snap every 10.
719. Grid snap every 20.
720. Grid snap every 40.
721. Grid snap every 80.
722. Grid snap every 120.

## Harmonies

Right-click a swatch › Harmonies, + Add › Color › Harmony from a color…, /board-harmony <name> <#hex>.

723. Harmony: Complementary.
724. Harmony: Analogous.
725. Harmony: Triadic.
726. Harmony: Split complementary.
727. Harmony: Tetradic.
728. Harmony: Square.
729. Harmony: Monochrome.
730. Harmony: Shades.
731. Harmony: Tints.
732. Harmony: Tones.
733. Harmony: Warmer steps.
734. Harmony: Cooler steps.
735. Harmony: Color + neutrals.
736. Harmony: Dark + accent.
737. Harmony: Pastel set.
738. Harmony: Neon set.
739. Harmony: Earthy.
740. Harmony: Duotone pair.

## Palette library

+ Add › Color › Palette library (grouped), /board-color <name>.

741. Palette: Neon noir (#0b0f1a #1b1f3a #ff2e88 #2de2e6 #f6f5ae).
742. Palette: Teal & orange (#0f3d3e #1f7a7a #e3e3d3 #f29e4c #d1495b).
743. Palette: Golden hour (#2d1e2f #7c3a2d #e07a3f #f2b880 #fff1d6).
744. Palette: Blue hour (#0d1b2a #1b263b #415a77 #778da9 #e0e1dd).
745. Palette: Forgeheart (#120e09 #3a2a12 #e6b450 #ff7a3d #fff1c1).
746. Palette: Pastel dream (#ffd6e0 #ffefcf #d4f0f0 #cfe1ff #e2d4ff).
747. Palette: Vaporwave (#ff71ce #01cdfe #05ffa1 #b967ff #fffb96).
748. Palette: Synthwave (#2b0f54 #ab1f65 #ff4f69 #ff8031 #ffdf6c).
749. Palette: Matrix (#000000 #003b00 #008f11 #00ff41 #d0ffd8).
750. Palette: Bauhaus (#f2f2f2 #1c1c1c #d62828 #f7b801 #1d3557).
751. Palette: Swiss (#ffffff #111111 #ff0000 #e5e5e5 #777777).
752. Palette: Memphis (#ff6f91 #ffc75f #f9f871 #00c9a7 #845ec2).
753. Palette: Desert (#f2cc8f #e07a5f #81b29a #3d405b #f4f1de).
754. Palette: Forest floor (#1b2a1f #2f4f3a #6b8f5e #c9b37e #8a5a3b).
755. Palette: Ocean deep (#03045e #0077b6 #00b4d8 #90e0ef #caf0f8).
756. Palette: Coral reef (#ff6b6b #ffa36c #ffd93d #6bcb77 #4d96ff).
757. Palette: Moss & stone (#3b3c36 #5e6052 #8a8c74 #b9b8a3 #e4e2d6).
758. Palette: Rust belt (#2b2b2b #5a3e36 #a44a3f #d9a066 #eadcc4).
759. Palette: Chrome (#0e0f11 #3b4048 #9aa3ad #d7dde3 #ffffff).
760. Palette: Ice (#e8f8ff #b8e6f5 #7cc6e6 #3c8dbc #0b3c5d).
761. Palette: Lava (#1a0000 #5c0a0a #b3200e #ff6b1a #ffc23d).
762. Palette: Cherry blossom (#fff5f7 #ffd1dc #ff9eb5 #c9637e #5a2a3a).
763. Palette: Mint chip (#e9fff5 #b4f5d6 #6fd3a6 #2a7a5f #3b2a20).
764. Palette: Lavender fields (#f3eefe #d7c8f5 #a68ae0 #6a4fb0 #2e2350).
765. Palette: Noir (#000000 #1c1c1c #3a3a3a #8c8c8c #f0f0f0).
766. Palette: Sepia print (#2e2215 #5c4630 #a58a62 #d9c4a1 #f5ecd9).
767. Palette: Kodachrome (#1e2a3a #c0392b #e9b44c #4f8a8b #f2e8cf).
768. Palette: Polaroid (#f7f3e9 #e9d8a6 #94a89a #5e7c88 #2f3e46).
769. Palette: Wes pastel (#f1bb7b #fd6467 #5b1a18 #d67236 #e6d8c3).
770. Palette: Tokyo night (#1a1b26 #24283b #7aa2f7 #bb9af7 #f7768e).
771. Palette: Miami (#00c2c7 #ff8bd8 #ffd166 #06d6a0 #f8f9fa).
772. Palette: Nordic (#2e3440 #3b4252 #88c0d0 #a3be8c #eceff4).
773. Palette: Autumn (#3d1f12 #8c2f1b #d9631e #f2a541 #f2d7a0).
774. Palette: Winter (#f8fbff #cfe0f0 #8fb3d1 #4a6d8c #1d2f40).
775. Palette: Spring (#fffbe6 #d8f3dc #95d5b2 #ffcad4 #f4acb7).
776. Palette: Summer (#ffbe0b #fb5607 #ff006e #8338ec #3a86ff).
777. Palette: Muted editorial (#efeae2 #c8bfb0 #8e8576 #4a4640 #1f1d1a).
778. Palette: Clay (#e9d5c3 #d4a373 #b5784f #7f5539 #3a2618).
779. Palette: Olive drab (#2f3220 #4b5320 #7d8452 #b9b27e #e8e2c4).
780. Palette: Midnight gold (#0b0c10 #1f2833 #c5a35a #f2d58c #ffffff).
781. Palette: Royal (#14123b #2e2a72 #5d4ab8 #c9a227 #f4ecd6).
782. Palette: Candy (#ff5d8f #ff97b7 #ffd1e3 #a0e7e5 #b4f8c8).
783. Palette: Acid (#0d0d0d #c6ff3d #2dfcff #ff3df2 #ffffff).
784. Palette: Rave UV (#120024 #4b0082 #9d00ff #ff00e6 #00ffd5).
785. Palette: Bioluminescent (#00060f #00243a #00a6a6 #66ffe3 #c9fff7).
786. Palette: Aurora (#0b132b #1c2541 #3a506b #5bc0be #6fffe9).
787. Palette: Sakura neon (#1b0b1f #ff4fa3 #ffb3d9 #7af0ff #2a1a3f).
788. Palette: Gameboy (#0f380f #306230 #8bac0f #9bbc0f #cadc9f).
789. Palette: CGA (#000000 #55ffff #ff55ff #ffffff #aa00aa).
790. Palette: Blueprint (#0b2b5c #1f4fa8 #5a8de0 #b8d0ff #ffffff).
791. Palette: Terracotta (#f4e1d2 #e2a37f #c86b4a #8f3f2a #3b1e14).
792. Palette: Sage (#f1f3ec #cbd5c0 #9aae8f #627a5c #2f3d2c).
793. Palette: Dusty rose (#f7ebe8 #e6c1bd #c98f8f #8f5b5f #3f2a2d).
794. Palette: Steel blue (#e7edf3 #b6c6d6 #7d97b0 #4b6584 #25364a).
795. Palette: Sunflower (#fff8dc #ffe066 #f4a259 #5b8e7d #244f26).
796. Palette: Grape soda (#2b0f3a #5d1e7a #9b4dca #d6a2e8 #ffe5f9).
797. Palette: Highlighter (#faff00 #00ff85 #00e0ff #ff2fa0 #111111).
798. Palette: Concrete (#d9d9d6 #b0b0ac #85857f #595955 #2e2e2b).
799. Palette: Film noir red (#0a0a0a #2b2b2b #9e1b1b #e0e0e0 #ffffff).
800. Palette: Jungle (#0b2016 #1e4d2b #3f7d3c #9ccc65 #f2e94e).
801. Palette: Coffee (#f5ebe0 #d5bdaf #a98467 #6f4e37 #2b1d14).
802. Palette: Berry (#3b0a1e #7a1c3c #c2185b #f06292 #fce4ec).
803. Palette: Arctic neon (#001219 #005f73 #0a9396 #94d2bd #e9d8a6).
804. Palette: Sunrise (#fbd3e9 #bb377d #f6a14b #fde29b #fff6e5).
805. Palette: Tropical (#006d77 #83c5be #edf6f9 #ffddd2 #e29578).
806. Palette: Moody teal (#0f1f24 #173a40 #2c6e6f #a3c4bc #e8e1d4).
807. Palette: Peach fuzz (#fff1e6 #ffd6ba #ffbe98 #e8956b #7d4e3a).
808. Palette: Lilac haze (#f5f0ff #ddd0f7 #bca5e8 #8f78c4 #4d3f73).
809. Palette: Emerald city (#04211a #0b4f3c #13856a #3bd1a0 #c8fff0).
810. Palette: Ruby (#1a0006 #4d0011 #8f0020 #d1003a #ff8aa0).
811. Palette: Sapphire (#00081a #001a4d #003399 #3d6eff #a8c0ff).
812. Palette: Amber (#1a0e00 #4d2b00 #a35c00 #f29f05 #ffd98a).
813. Palette: Oyster (#f7f5f0 #e8e3d9 #cfc7b8 #a69f92 #6d675e).
814. Palette: Graphite (#111214 #1e2024 #2c2f35 #4a4e57 #9aa0aa).
815. Palette: Paper & ink (#f6f1e7 #e5dccb #1f2a44 #3c4f76 #b23a48).
816. Palette: Risograph (#ff48b0 #0078bf #ffe800 #00a95c #f6f1e7).
817. Palette: Halftone (#f2efe9 #2a2a2a #e63946 #457b9d #f1faee).
818. Palette: Comic (#ffde00 #ff0000 #0047ab #000000 #ffffff).
819. Palette: Pop art (#ff1f8e #ffe600 #00b3ff #00d26a #1a1a1a).
820. Palette: Ukiyo-e (#f2e8cf #6a994e #386641 #bc4749 #1d3557).
821. Palette: Renaissance (#2b1d0e #6b4423 #a67b5b #d9c3a5 #3d5a6c).
822. Palette: Impressionist (#a8d5e2 #f9d56e #f3a683 #b8de6f #5c6bc0).
823. Palette: Rothko (#3d0c11 #7a1e1e #c0392b #e67e22 #f4d03f).
824. Palette: Klein blue (#002fa7 #0b3fd1 #4f6dd9 #e8ecf8 #111111).
825. Palette: Mondrian (#ffffff #dd0100 #fac901 #225095 #000000).
826. Palette: Hokusai wave (#e6e2d3 #b8c5c9 #4f7c8a #1f3c58 #0b1a2b).
827. Palette: Matcha (#f3f5e9 #d1dfb7 #9cb87a #5f7a42 #2e3a1f).
828. Palette: Chai (#faf3e8 #e6cfa9 #c79a63 #8c5a2b #3d2410).
829. Palette: Smoky quartz (#ece6e1 #c7bcb4 #8f817a #5b4f4a #2b2422).
830. Palette: Lunar (#0a0a0f #1c1c26 #4a4a5a #9a9aad #e8e8f0).
831. Palette: Solar flare (#1a0500 #6b1d00 #e8590c #ffa94d #fff3bf).
832. Palette: Glacier (#f0fbff #d0f0fa #9fd8ea #5aa9c8 #1f5f7a).
833. Palette: Volcanic (#0d0d0d #2b2b2b #6b0f0f #d63b0f #ffb703).
834. Palette: Tidepool (#0b3d3a #1e6f68 #61a89c #f2d0a4 #e86f4a).
835. Palette: Meadow (#eef7e1 #c4e3a5 #8fc56b #4f8a3a #f6e27a).
836. Palette: Bubblegum (#ffe3f1 #ffb3d9 #ff7ab8 #c75cff #6ad1ff).
837. Palette: Lofi (#2d2a32 #4a4458 #8e7dbe #f2c6de #faf3dd).
838. Palette: Chillhop (#1f2937 #3b4a5c #d4a373 #e9c46a #f4f1de).
839. Palette: Drum & bass (#050505 #1a1a1a #00ff9c #00b3ff #ff0055).
840. Palette: Techno (#000000 #141414 #2e2e2e #ff0000 #ffffff).
841. Palette: House (#0d0221 #261447 #6c3baa #f75590 #fce38a).
842. Palette: Ambient (#eef2f3 #cfd9df #a3b8c8 #7090a8 #3d5a73).
843. Palette: Hip-hop gold (#0a0a0a #2b2b2b #c9a227 #f2d16b #ffffff).
844. Palette: Indie film (#ece4d4 #c8b79a #7f8c74 #4b5b55 #2a2f2d).
845. Palette: Horror (#050505 #1a0a0a #4a0000 #8b0000 #d9d9d9).
846. Palette: Sci-fi lab (#0a0f14 #12202b #1e90ff #00e5ff #f0f8ff).
847. Palette: Fantasy (#1b1033 #3c2a6b #7d5ba6 #e0b04c #f6e7c1).
848. Palette: Steampunk (#1e1611 #4a3423 #8c6239 #c9a227 #e8d8b0).
849. Palette: Cyber yellow (#0d0d0d #ffd300 #ff006e #00f5d4 #f1f1f1).
850. Palette: Holo foil (#c9f0ff #ffc9f5 #fff7c9 #c9ffd9 #e0c9ff).
851. Palette: Opal (#f7f7ff #dfe7fd #cde5f7 #f5d9ec #e8f6ef).
852. Palette: Obsidian (#050608 #0e1116 #1b2029 #2e3746 #5c6b80).
853. Palette: Sodium vapour (#0d0a05 #3a2408 #c96a12 #f2a33a #ffd88a).
854. Palette: Mercury vapour (#050d0c #0f2b26 #2f7a68 #8fd1b8 #e6fff6).
855. Palette: Tungsten (#1a1208 #4d3418 #a8743a #e8b06a #fff0d4).
856. Palette: Daylight (#f7f9fb #dce6ef #a9c1d6 #6b8fae #2c4760).
857. Palette: Overcast (#e4e6e8 #c2c7cc #9aa1a8 #6f777f #3d4349).
858. Palette: Thunderstorm (#101418 #26303a #4c5b69 #9fb0bf #f5d76e).
859. Palette: Desert night (#0f0b1e #2b1f45 #6a3d6e #d6845a #f7c58a).
860. Palette: Polar night (#020a14 #0a2238 #1d4f74 #5fa8c9 #c6ecff).
861. Palette: Rooftop sunset (#2a1638 #6b2d5c #c2456b #f28b5b #fbd38d).
862. Palette: Harbour dawn (#1c2b3a #4d6a82 #a7b9c6 #f0c9a4 #fbe7d3).
863. Palette: Concrete jungle (#1b1c1e #3d3f42 #6e7174 #a4a7aa #f2c14e).
864. Palette: Subway (#101010 #2a2a2a #f2c500 #00843d #e4002b).
865. Palette: Arcade (#0b0221 #3a0ca3 #f72585 #4cc9f0 #ffd60a).
866. Palette: Pixel pastel (#f7d6e0 #f2b5d4 #eff7f6 #b2f7ef #7bdff2).
867. Palette: Chrome age (#0f1114 #2f343b #8a9199 #c8cdd2 #f4f6f8).
868. Palette: Brushed gold (#2b2112 #5e4521 #a77d3c #dcb565 #f7e2a5).
869. Palette: Copper (#1e0f08 #5a2a14 #a5532b #d98a52 #f4c49a).
870. Palette: Patina (#13241f #2c5249 #4f8c7b #8cc2a8 #d6ead9).
871. Palette: Glacier blue (#e9f6fb #bfe4f2 #7fc4e3 #3d8fb8 #154e6b).
872. Palette: Aurora green (#04140f #0b3d2b #1a8f5a #52e8a0 #c3ffe4).
873. Palette: Sunset strip (#1f0b2e #5c1a6b #b5338a #f26b6b #ffc069).
874. Palette: Miami vice (#00b2ca #7dcfb6 #fbd1a2 #f79256 #f15bb5).
875. Palette: Film negative (#f2e3c6 #c49a6c #7d5a44 #3c2f2f #1a1a1a).
876. Palette: Cross-processed (#0b3c49 #2a9d8f #e9c46a #f4a261 #e76f51).
877. Palette: Bleach bypass (#1c1d1f #3e4144 #7b7f83 #b9bcbe #e8e8e6).
878. Palette: Day for night (#05080f #0e1b33 #1f3a66 #5a7fb0 #b8cbe6).
879. Palette: Technicolor (#c81d25 #ffe066 #0b6e4f #0353a4 #f4f1de).
880. Palette: Super 8 (#3b2f2f #8a5a44 #d9a066 #f2d49b #94a3a4).
881. Palette: Polar fleece (#f2f4f7 #d0d8e2 #9aaabf #5c708a #2a3647).
882. Palette: Cashmere (#f6efe6 #e5d5c3 #c9ad8f #9c7b5b #5b4330).
883. Palette: Velvet (#14060d #3d0f24 #6e1840 #a8335f #e0789a).
884. Palette: Champagne (#fbf6ea #f2e4c4 #e0c98f #bfa064 #7d6638).
885. Palette: Bubble tea (#f7e6d4 #e8c4a0 #b5835a #6b4a35 #2b1d16).
886. Palette: Matcha latte (#f4f6e8 #d8e3b5 #a9c27a #6d8a45 #3a4a23).
887. Palette: Strawberry (#fff0f3 #ffc2d1 #ff8fab #fb6f92 #c9184a).
888. Palette: Blueberry (#eef0ff #c3c8f5 #8b93e0 #4e58b5 #232a6b).
889. Palette: Lemonade (#fffbe6 #fff3a3 #ffe14d #f2c200 #a37c00).
890. Palette: Mint mojito (#effff8 #c2f5de #7de0b6 #2fb889 #0f6b4c).
891. Palette: Rainforest (#061a10 #0f3d22 #1f6e3a #4fa35a #a8d672).
892. Palette: Savanna (#f3e3b8 #e0bd76 #b8863f #7a5a2b #3a2e1c).
893. Palette: Tundra (#eef2f0 #c9d3cf #93a39b #5a6b63 #2a3530).
894. Palette: Coral sea (#ff7f6a #ffb199 #fde2d0 #4fb0c6 #1d6f8a).
895. Palette: Deep sea (#00040d #00172e #003b5c #007a8a #3fd6c8).
896. Palette: Lagoon (#e6fbf8 #a8ece2 #4fd1c2 #0f9b8e #05544e).
897. Palette: Volcano glass (#0a0a0c #1e1b24 #3d2f4a #7a4b6e #c47f8e).
898. Palette: Plasma (#0d0221 #4a0e8f #9e1fd0 #ff3cac #ffd1f0).
899. Palette: Laser (#000000 #ff0040 #00ff9f #00b8ff #ffffff).
900. Palette: UV paint (#0a001a #3f00ff #a000ff #ff00c8 #c8ff00).
901. Palette: Smoke machine (#0b0b0f #2a2a35 #5b5b70 #9a9ab0 #e0e0ec).
902. Palette: Strobe (#000000 #ffffff #000000 #f5f5f5 #222222).
903. Palette: Vinyl crackle (#1a1612 #3d342b #7a6a55 #c2ad8e #efe2c9).
904. Palette: Cassette (#f2e8d5 #e4572e #17bebb #ffc914 #2e282a).
905. Palette: Festival (#ff6b35 #f7c59f #efefd0 #004e89 #1a659e).
906. Palette: Orchestra (#1b120c #4a2f1d #8a5a32 #c9a36a #f2e6cf).
907. Palette: Synth pads (#120f2b #2d2a6e #5f5fd0 #a4a4ff #e4e4ff).
908. Palette: 808 (#0d0d0d #1f1f1f #ff3b30 #ffcc00 #f2f2f2).
909. Palette: Brutalist (#e9e9e6 #bdbdb8 #6e6e6a #2f2f2d #ff4d00).
910. Palette: Scandinavian (#f7f5f0 #e3ddd2 #c2b8a3 #7d8c84 #2f3b36).
911. Palette: Mid-century (#f2e3c6 #e09f3e #9e2a2b #335c67 #1b2b34).
912. Palette: Art deco (#0f0f0f #1f3a3d #c9a227 #e8d5a3 #f7f3e9).
913. Palette: Y2K (#c0c0ff #ff99ff #99ffff #ffffff #9999ff).
914. Palette: Grunge (#1a1a14 #3d3b2e #6b6650 #a19c7a #d9d3b0).
915. Palette: Kodak gold (#f5c518 #e09b1a #b5651d #6b3a1f #2b1a10).
916. Palette: Fuji green (#e9f0e1 #b9cfa3 #7fa36d #3f6b4a #1d3529).
917. Palette: Neon sign (#0a0a12 #ff2079 #ff8c00 #39ff14 #00e5ff).
918. Palette: Ghost town (#e8e2d4 #c4b89c #8f7f63 #5a4e3c #2b251c).

## Palette card styles

/board-palette-style.

919. Palette card style: Stripes.
920. Palette card style: Gradient.
921. Palette card style: Dots.
922. Palette card style: Blocks.

## Shapes, arrows, stickers

+ Add › Shape / Arrow or line / Sticker, /board-shape, /board-arrow, /board-sticker.

923. Shape: Rectangle.
924. Shape: Rounded rectangle.
925. Shape: Circle.
926. Shape: Pill.
927. Shape: Triangle.
928. Shape: Diamond.
929. Shape: Hexagon.
930. Shape: Star.
931. Shape: Blob.
932. Shape: Outline box.
933. Shape: Pentagon.
934. Shape: Octagon.
935. Shape: Chevron.
936. Shape: Cross.
937. Shape: Parallelogram.
938. Shape: Trapezoid.
939. Arrow →.
940. Arrow ←.
941. Arrow ↓.
942. Arrow ↑.
943. Arrow ↘.
944. Double arrow ↔.
945. Curved arrow.
946. Dashed arrow.
947. Plain line.
948. Bold arrow.
949. Sticker ★.
950. Sticker ♥.
951. Sticker ✓.
952. Sticker ✕.
953. Sticker ?.
954. Sticker !.
955. Sticker ☀.
956. Sticker ☾.
957. Sticker ⚡.
958. Sticker ♪.
959. Sticker ✿.
960. Sticker ❄.
961. Sticker ☁.
962. Sticker ◆.
963. Sticker ●.
964. Sticker ▲.
965. Sticker ✦.
966. Sticker ❤.
967. Sticker ☺.
968. Sticker ☹.
969. Sticker 👍.
970. Sticker 👎.
971. Sticker 🔥.
972. Sticker ✨.
973. Sticker 🎬.
974. Sticker 🎨.
975. Sticker 💡.
976. Sticker 📌.
977. Sticker 🎧.
978. Sticker 🌙.
979. Sticker 🎵.
980. Sticker 🎥.
981. Sticker 📷.
982. Sticker 🌈.
983. Sticker 🌊.
984. Sticker ⭐.
985. Sticker 💎.
986. Sticker 🌀.
987. Sticker 🖤.
988. Sticker 🤍.
989. Sticker 💜.
990. Sticker 💛.
991. Sticker 🧡.
992. Sticker 💚.
993. Sticker 💙.
994. Sticker 👀.
995. Sticker 🤔.
996. Sticker 🚀.

## Connector styles

Right-click a connector › Style, /board-connect <style>.

997. Connector: Arrow.
998. Connector: Both ways.
999. Connector: Plain line.
1000. Connector: Dashed.
1001. Connector: Curved.
1002. Connector: Bold.

## Vibe focuses (what part of a vibe a chat gets)

Send vibe ›, the drawer, /board-use <focus>, /ref <words> | <focus>, /board-focus.

1003. Full vibe: "Use these references for their vibe" (`/board-use full`).
1004. Palette only: "Take only the colors from these references" (`/board-use palette`).
1005. Light only: "Match the lighting (key, contrast) of these references" (`/board-use light`).
1006. Color feel: "Match the color feel (palette, saturation, warmth)" (`/board-use color`).
1007. Motion only: "Match the motion energy and cut pacing of these references" (`/board-use motion`).
1008. Pacing only: "Cut on this pacing" (`/board-use pacing`).
1009. Texture only: "Match the texture and grain" (`/board-use texture`).
1010. Composition only: "Compose like these references" (`/board-use composition`).
1011. Type only: "Match the typography feel" (`/board-use type`).
1012. Mood words: "Aim for this mood" (`/board-use mood`).
1013. My notes only: "My notes on the references" (`/board-use notes`).
1014. The opposite: "Do the OPPOSITE of these references (contrast them on purpose)" (`/board-use opposite`).
1015. Things to avoid: "AVOID looking like these references" (`/board-use avoid`).
1016. Blend them: "Blend these references into one look" (`/board-use blend`).
1017. For a Lab scene: "Build the scene with this vibe (colors, light, motion, texture), not the footage" (`/board-use lab`).
1018. For an edit: "Edit with this rhythm and look" (`/board-use edit`).
1019. For a poster: "Design the poster with this palette, composition and type feel" (`/board-use poster`).
1020. For titles / type: "Set the titles in this type feel and these colors" (`/board-use titles`).
1021. For a thumbnail: "Make the thumbnail with this color, light and framing" (`/board-use thumbnail`).
1022. For a social reel: "Cut the reel with this pacing, palette and light" (`/board-use reel`).
1023. For a color grade: "Grade toward these colors, contrast and warmth" (`/board-use grade`).
1024. For a music visual: "Make the music visual feel like this (colors, energy, texture, mood)" (`/board-use music`).
1025. Contrast and light: "Copy only the contrast and light key" (`/board-use contrast-only`).
1026. Framing + light: "Frame and light it like these references" (`/board-use composition-light`).

## Mood words

Read from each reference's vibe; shown in the Mood lens and sent with the vibe.

1027. Mood words: nocturnal, cold.
1028. Mood words: smoky, intimate.
1029. Mood words: dramatic, chiaroscuro.
1030. Mood words: airy, soft.
1031. Mood words: sunny, playful.
1032. Mood words: electric, loud.
1033. Mood words: restrained, monochrome.
1034. Mood words: vintage, nostalgic.
1035. Mood words: warm.
1036. Mood words: cool, clinical.
1037. Mood words: gritty, busy.
1038. Mood words: clean, minimal.
1039. Mood words: spacious, calm.
1040. Mood words: symmetric, formal.
1041. Mood words: frantic, energetic.
1042. Mood words: lively.
1043. Mood words: still, meditative.
1044. Mood words: rapid-fire cuts.
1045. Mood words: long takes.
1046. Mood words: colorful.
1047. Mood words: filmic, textured.
1048. Mood words: glossy, digital.
1049. Mood words: nostalgic, sunlit.
1050. Mood words: neon-lit, nightlife.
1051. Mood words: graphic, bold.
1052. Mood words: hazy, dreamy.
1053. Mood words: zen, quiet.
1054. Mood words: chaotic, raw.
1055. Mood words: icy, crisp.
1056. Mood words: moody, candlelit.
1057. Mood words: strobing, clubby.
1058. Mood words: uplifting, building.
1059. Mood words: ominous, fading.
1060. Mood words: iconic, centered.
1061. Mood words: big sky, open.

## Presentation transitions

Present › Transition, /board-present <name>.

1062. Transition: Fly (900 ms).
1063. Transition: Slow fly (1800 ms).
1064. Transition: Whip (380 ms).
1065. Transition: Bounce (900 ms).
1066. Transition: Cut.
1067. Transition: Fade through black (700 ms).
1068. Transition: Zoom out, then in (1300 ms).
1069. Transition: Dolly (scale only) (900 ms).
1070. Transition: Drift (2600 ms).
1071. Transition: Spin (1000 ms).
1072. Transition: Snap (220 ms).
1073. Transition: Glide (linear) (1200 ms).
1074. Transition: Slow fade (1400 ms).
1075. Transition: Punch in (520 ms).
1076. Transition: Big arc (2000 ms).
1077. Transition: Slow dolly (1800 ms).

## Exports

Board › Export, /board-export <kind>.

1078. Export: Board as PNG (`/board-export png`).
1079. Export: Board as PNG at 2× (`/board-export png2`).
1080. Export: Board as JPEG (smaller) (`/board-export jpg`).
1081. Export: Selection as PNG (`/board-export sel`).
1082. Export: Each frame as a PNG (`/board-export frames`).
1083. Export: Pages (frames stacked, PDF-like image) (`/board-export pages`).
1084. Export: Contact sheet of the media (`/board-export contact`).
1085. Export: Board palette as a PNG strip (`/board-export palette-png`).
1086. Export: Board palette as CSS variables (`/board-export palette-css`).
1087. Export: Board palette as JSON (`/board-export palette-json`).
1088. Export: Board palette for GIMP / Krita (.gpl) (`/board-export palette-gpl`).
1089. Export: Vibe brief as Markdown (`/board-export md`).
1090. Export: Vibe data as JSON (`/board-export vibe-json`).
1091. Export: Item list as CSV (`/board-export csv`).
1092. Export: Whole board as a .zip (data + media) (`/board-export zip`).
1093. Export: Copy the vibe text (`/board-export clip`).
1094. Export: Board file (.json, to open elsewhere) (`/board-export board-json`).
1095. Export: Web page (gallery + vibe) (`/board-export html`).

## Clip speeds

Right-click a clip › Clip › Speed.

1096. Clip speed 0.25×.
1097. Clip speed 0.5×.
1098. Clip speed 0.75×.
1099. Clip speed 1×.
1100. Clip speed 1.5×.
1101. Clip speed 2×.
1102. Clip speed 4×.

## Presentation timing

Present › Advance, /board-present-auto.

1103. Advance: By hand.
1104. Advance: Every 3 s.
1105. Advance: Every 5 s.
1106. Advance: Every 8 s.
1107. Advance: Every 12 s.
1108. Advance: Every 20 s.

## Chat commands (area "Board", /help board)

Every board feature is drivable from any chat or the command bar (Ctrl+;).

1109. `/board [board]`: Open the mood board (or switch to a board by name).
1110. `/boards`: List your boards (✓ = linked to this chat).
1111. `/board-new <name> [| template]`: A new board (optionally from a template).
1112. `/board-rename <name>`: Rename the current board.
1113. `/board-delete`: Delete the current board (Undo in the notification).
1114. `/board-duplicate`: Copy the current board.
1115. `/board-add <url | path | #hex… | text>` (also /pin): Add a website, a picture / clip link or file path, colors or a note to the board (the chat's linked board).
1116. `/board-note <text>`: A note on the board (Markdown).
1117. `/board-text <text>`: A big text / title on the board.
1118. `/board-color <#hex… | palette name>`: A color or palette card: hex colors or a palette from the library.
1119. `/board-harmony <harmony> <#hex>`: A palette built from one color (complementary, triadic, analogous…).
1120. `/board-frame [size] [| title]`: A frame (around the selection, or a size).
1121. `/board-template <template>`: Add a template's frames to this board (moodboard, music video treatment, storyboard…).
1122. `/board-layout <layout>` (also /board-arrange): Auto-arrange the selection (or everything): grid, masonry, timeline, collage, rainbow….
1123. `/board-align <side>`: Align the selection: left, center, right, top, middle, bottom.
1124. `/board-distribute <h|v>`: Even gaps across the selection: h or v.
1125. `/board-lens <lens|off>`: Look at the board through its vibe: palette, light, motion, texture, type, mood… (off).
1126. `/board-zoom <fit|sel|percent>`: Zoom: fit, sel (selection), a percent (2–3200).
1127. `/board-bg <background>`: Board background: dots, grid, paper, blueprint, black….
1128. `/board-minimap <auto|on|off>`: Minimap: auto (while moving), on, off.
1129. `/board-snap <on|off>`: Snapping to other items on / off (guides).
1130. `/board-grid <on|off> [size]`: Snap to a grid on / off.
1131. `/board-export <kind>`: Export: png, png2, jpg, sel, frames, pages, contact, palette-png/css/json/gpl, md, vibe-json, csv, zip, clip.
1132. `/board-present [transition]`: Present: fly between the frames (→ next, ← back, Esc ends).
1133. `/board-search <words>`: Find on the board: words, #tags, colors (teal), moods, kinds (clip, site).
1134. `/board-select <what>`: Select: all, none, pictures, clips, sites, notes, colors, frames, stamped, #tag, or words.
1135. `/board-tag <tag…>`: Tag the selection (#night, #hero…); "-tag" removes it.
1136. `/board-stamp <stamp>`: Stamp the selection: ★ ♥ ✓ ✕ ? ! … (none removes).
1137. `/board-note-on <text>`: Your note on the selected item(s) (chats read it with the vibe).
1138. `/board-look <filter>`: A look for the selected pictures: bw, sepia, faded, teal-orange, cyber, dream… (none).
1139. `/board-blend <mode>`: Blend mode of the selection (multiply, screen, overlay…).
1140. `/board-opacity <percent>`: Opacity of the selection (0–100).
1141. `/board-rotate <degrees>`: Rotate the selection by degrees (0 straightens).
1142. `/board-crop <ratio>`: Crop the selected pictures to a ratio: 1:1, 4:5, 9:16, 16:9, 2.39:1… (free resets).
1143. `/board-clip <in|out|clear|loop|sound|speed x|grab|poster>`: The selected clip on the board: in, out, clear, loop, sound, speed <x>, grab, poster.
1144. `/board-grab [seconds]`: Frame grab: the selected clip at a time (seconds) as a still on the board.
1145. `/board-compare`: Compare two selected items (wipe, side by side, onion, difference + their vibes).
1146. `/board-similar`: Select what feels like the selected item.
1147. `/board-palette`: A palette card from the selection (or the whole board).
1148. `/board-reread`: Read the vibe of the selection again (or everything).
1149. `/board-undo`: Undo on the board (Ctrl+Z there).
1150. `/board-redo`: Redo on the board.
1151. `/board-link [board]`: Link this chat to a board (the drawer and /board-use pick it here).
1152. `/board-unlink`: Unlink this chat from its board.
1153. `/board-use [focus] [send]`: Attach the board's vibe (linked or current) to your next message; "send" sends it now.
1154. `/ref <words> [| focus]` (also /refs): Attach the vibe of the references matching your words (or the selection) to your next message.
1155. `/vibe [words | board | sel]`: Show a vibe here (free, nothing sent): the board's, the selection's, or of references matching words.
1156. `/board-peek` (also /board-drawer): The board drawer over this chat (Ctrl+Shift+M): drag a reference into the chat for its vibe.
1157. `/board-save-reply`: Save the last reply of this chat as a note on the board.
1158. `/board-clean`: Move media no board uses any more to the Recycle Bin.
1159. `/board-tools <on|off|directors>`: Let this agent use the board itself (board tools: list, vibe, add, arrange; ≈ 350 tokens a message): on, off, or directors.
1160. `/board-shape <shape> [#color]`: A shape on the board: rect, round, circle, pill, triangle, diamond, hexagon, star, blob, frame-line.
1161. `/board-arrow <kind>`: An arrow or line: right, left, up, down, diag, double, curved, dashed, line, thick.
1162. `/board-sticker <sticker>`: A big sticker / emoji (★ ♥ 🔥 ✨ …).
1163. `/board-hide [show]`: Hide the selection (it stays out of the vibe); "show" brings everything back.
1164. `/board-info`: Everything about the selected item (file, size, length, cuts, tags…).
1165. `/board-move-to <board> [copy]`: Move (or copy) the selection to another board.
1166. `/board-brief <text>`: The board's brief: what it is for, in your words (chats read it first).
1167. `/board-lock [on|off]`: Lock / unlock the board (look and send vibes, nothing moves).
1168. `/board-star`: Star the board (starred boards come first).
1169. `/board-random`: Jump to a random reference (R on the board).
1170. `/board-import [folder|board]`: Add a whole folder of pictures and clips, or open a board file (.json).
1171. `/board-screenshot`: Put a screenshot of Hearth (the whole window) on the board.
1172. `/board-copy-image`: Copy the selection (or the whole board) to the clipboard as a picture.
1173. `/board-autotag`: Tag the selection (or everything) from its vibe: #low-key #warm #muted #busy #fast-cuts #teal….
1174. `/board-snapshot <size|all>`: Take the selected website snapshots again at a size: desktop, laptop, mobile, tablet, tall, wide (all = every site).
1175. `/board-shots`: One still per shot of the selected clip (from its cuts), in a row under it.
1176. `/board-sheet`: A contact sheet (6 frames) of the selected clip as a picture.
1177. `/board-to-lab [focus]`: Give the Three Director the board's vibe (for a scene: colors, light, motion, texture; never the footage).
1178. `/board-diff <board> | <board>`: How two boards differ in vibe (palette, light, contrast, saturation, warmth, texture, motion, mood).
1179. `/board-stats`: What's on the board (kinds, clip time, vibes being read, links).
1180. `/board-present-auto <seconds>`: Presentation advances by itself every N seconds (0 = by hand).
1181. `/board-version [save [name] | list | <number>]`: Save a version of the board, list them, or go back to one.
1182. `/board-overview`: All your boards with their covers (click one to open it).
1183. `/board-list`: The board as a sortable table: kind, light, contrast, saturation, warmth, motion, pacing, mood, tags.
1184. `/board-eyedropper`: Pick a color anywhere on screen as a swatch (E on the board).
1185. `/board-focus <focus>`: What this board gives chats by default: full, palette, light, motion, texture, composition, type, mood….
1186. `/board-from-lab`: Put the Lab's current picture on the board.
1187. `/board-from-review`: Put Video Review's current frame on the board.
1188. `/board-from-chat`: Put the pictures attached in this chat on the board.
1189. `/board-palette-style <style>`: How the selected palette cards look: stripes, gradient, dots, blocks.
1190. `/board-connect [style]`: Connect the selected items with arrows, in the order you picked them (C): arrow, both, line, dashed, curved, bold.
1191. `/board-save-template [name]`: Save this board's frames as a template of your own.
1192. `/board-save-palette [name]`: Save the selected palette (or the board's colors) to your palette library.
1193. `/board-backdrop [off]`: Use the selected picture as the board's background (off removes it).
1194. `/board-play [play|pause|mute|sound]`: Clips in view: play (four at most), pause, mute, sound.
1195. `/board-fit-text`: Make the selected text fill its box.

## Keys, modifiers and right-clicks (all listed in the keys button, area "Board")

Every one is also reachable from a visible menu or a chat command.

1196. Ctrl+Shift+M: board drawer over any chat or tool (also the ▦ in the rail, /board-peek).
1197. Drag a reference into a chat: attach its vibe (not the file) to your next message.
1198. Right-click a drawer tile: attach only its palette, light, motion… to the chat.
1199. Tab  /  Shift+Tab: select the next / previous item (in reading order).
1200. R: a random reference (fresh eyes).
1201. H: hide the selection (Board menu → Show hidden).
1202. I: information about the selected item.
1203. Ctrl+Shift+C: copy the selection (or the board) as a picture.
1204. Alt+move over a clip: scrub through it (in → out).
1205. Alt+wheel on the selection: opacity up / down.
1206. Shift+Alt+wheel on the selection: rotate.
1207. Alt+click a palette stripe: copy that color.
1208. C: connect the selected items with arrows (in the order you picked them).
1209. Drop / paste on the drawer: add it to that board from any chat or tool.
1210. Drag a drawer tile onto the board: copy that reference here.
1211. /  or  Ctrl+F: search and filter the board.
1212. P: present: fly between frames (→ / Space next, ← back, Esc ends).
1213. Alt+click the zoom: zoom to fit right away.
1214. Double-click a frame title: rename the frame.
1215. Right-click the drawer: its width and side.
1216. Delete / Backspace: delete the selection.
1217. Ctrl+Z: undo.
1218. Ctrl+Shift+Z / Ctrl+Y: redo.
1219. Ctrl+A: select everything.
1220. Ctrl+D: duplicate.
1221. Ctrl+G: group the selection.
1222. Ctrl+Shift+G: ungroup.
1223. Ctrl+C: copy items (paste them in any board).
1224. Ctrl+X: cut items.
1225. Ctrl+]  /  Ctrl+[: bring to front / send to back.
1226. ]  /  [: bring forward / send backward.
1227. Arrows (Shift = ×10): nudge the selection (or pan).
1228. Shift+1: zoom to fit everything.
1229. Shift+2: zoom to the selection.
1230. Shift+0: zoom to 100 %.
1231. +  /  −: zoom in / out.
1232. Ctrl+0: zoom to fit (like a browser).
1233. N: new note at the middle.
1234. T: new text.
1235. F: frame the selection (or a new frame).
1236. Enter: open / edit the selected item.
1237. Escape: clear the selection.
1238. , / .: step a selected clip one frame back / forward.
1239. Space (hold) + drag: pan.
1240. Middle-drag: pan the board.
1241. Wheel / pinch: zoom where the pointer is.
1242. Two-finger scroll: pan (trackpad).
1243. Ctrl+wheel: zoom (also the trackpad pinch).
1244. Shift+wheel: pan sideways.
1245. Drag on empty space: select with a box (Shift adds).
1246. Shift+click: add / remove from the selection.
1247. Alt+drag: duplicate while dragging.
1248. Shift+drag: move along one axis.
1249. Ctrl+drag: move without snapping.
1250. Shift+resize: free proportions (pictures) / keep them (notes).
1251. Alt (hold): show rotate and crop handles on the selection.
1252. Alt+rotate: rotate freely (otherwise 15° steps).
1253. Ctrl (hold): show the quick bar on the selection (→ chat, vibe, open).
1254. Right-click: menus for an item or the board.
1255. Double-click: open / edit an item, empty space = new note.
1256. Drag a file / link / text in: add it to the board.
1257. Ctrl+V: paste pictures, links, colors or text.

## Tested

node --check on every file; `node dev/board-unit-test.js` (vibe math, mood rules, layouts, colors); `node dev/board-mcp-test.js` (the MCP server over stdio, a round trip through a fake hub bridge, the engines.js opt-in); in the app (`sh dev/board-fixtures.sh`, then `node dev/smoke.js --script …`): `dev/checks/board.js` (real file drop, website snapshots incl. offline, vibes, wheel / pinch / middle-drag / trackpad, marquee, drag, right-click submenus, lenses, hover playback, undo / redo, exports, presentation), `board-chat.js` (commands, drawer drag into a chat, board_ tools), `board-extra.js`, `board-links.js`, `board-presets.js` (every preset of every family applied and checked), `board-perf.js` (pan / zoom traces with 150 references), `qa-commands.js` (no duplicate commands).
