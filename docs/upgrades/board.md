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
185. Saved views: name the current view and fly back to it (Board › Views, /board-view).

## More ways to work with references

186. Ask a chat about references: right-click › Ask a chat about it (or Board › Ask a chat about the board, /board-ask) drafts a question in the chat with their vibe attached; nothing is sent until you send.
187. Footage only when you say so: right-click a clip / picture › Allow chats to use it as footage (/board-footage); only then does its file path go with its vibe, marked "FOOTAGE ALLOWED by the owner".
188. Loop this shot: the selected clip loops the shot it is on, using its cuts (/board-loop-shot).
189. Shift+. / Shift+, jump the selected clip to its next / previous cut.
190. Untangle overlaps: pushes overlapping items apart (selection or everything, /board-untangle).
191. Gather: brings the selection together in the middle of the view (/board-gather).
192. Style everything: one click restyles every note, text and picture plus the background (Board › Style everything, /board-style), with undo.
193. Note starters: notes that start as a checklist, shot list, brief, questions… (+ Add › More › Note starter, /board-starter).
194. Hover tooltips carry the item's name, your note and its first mood words.
195. The board's chips are named for Hearth's usage tracking (so rarely used controls can be reconsidered later).

## Layouts (auto-arrange)

Right-click › Arrange / Arrange everything, /board-layout <name>, board_arrange.

196. Grid: even rows, cells fit each item (`/board-layout grid`).
197. Tight grid: grid with hairline gaps (`/board-layout grid-tight`).
198. Airy grid: lots of breathing room (`/board-layout grid-airy`).
199. Grid · 2 columns (`/board-layout grid-2`).
200. Grid · 3 columns (`/board-layout grid-3`).
201. Grid · 4 columns (`/board-layout grid-4`).
202. Grid · 6 columns (`/board-layout grid-6`).
203. Square cells: every item in the same square (`/board-layout square-cells`).
204. Contact sheet: small equal squares like a film contact sheet (`/board-layout contact`).
205. Masonry: Pinterest-style columns (`/board-layout masonry`).
206. Masonry · 3 columns (`/board-layout masonry-3`).
207. Masonry · 5 columns (`/board-layout masonry-5`).
208. Masonry · wide columns (`/board-layout masonry-wide`).
209. One row: same height, side by side (`/board-layout row`).
210. Filmstrip: a tight strip of equal heights (`/board-layout filmstrip`).
211. One column: same width, stacked (`/board-layout column`).
212. Timeline strip (oldest → newest): in the order you added them (`/board-layout timeline`).
213. Timeline strip by length: clips sized by duration, stills as beats (`/board-layout timeline-duration`).
214. Timeline strip by pacing: slow cuts first, fast cuts last (`/board-layout timeline-pacing`).
215. Collage: packed edge to edge (`/board-layout collage`).
216. Collage, tilted: overlapping with a small tilt (`/board-layout collage-tilt`).
217. Polaroid scatter: loose and handmade (`/board-layout polaroid`).
218. Scatter (`/board-layout scatter`).
219. Pile: stacked like prints on a desk (`/board-layout pile`).
220. Card deck: fanned to the right (`/board-layout deck`).
221. Circle: a ring around the center (`/board-layout circle`).
222. Spiral: first item in the middle (`/board-layout spiral`).
223. Diagonal (`/board-layout diagonal`).
224. Zigzag (`/board-layout zigzag`).
225. Honeycomb: offset rows (`/board-layout honeycomb`).
226. Bento: one hero, the rest around it (`/board-layout bento`).
227. Hero + row: the first selected big, the rest underneath (`/board-layout hero-row`).
228. Pack (no gaps): shelves, fewest holes (`/board-layout pack`).
229. Tidy up: keeps your arrangement, snaps it to a grid (`/board-layout tidy`).
230. Rainbow (by hue): reds to violets, grays last (`/board-layout by-hue`).
231. Dark → bright (`/board-layout by-light`).
232. Muted → vivid (`/board-layout by-sat`).
233. Cool → warm (`/board-layout by-warmth`).
234. Soft → punchy (`/board-layout by-contrast`).
235. Calm → energetic: videos by motion energy (`/board-layout by-motion`).
236. Clean → busy: by texture / edge density (`/board-layout by-texture`).
237. Color wheel: angle = hue, distance = lightness (`/board-layout color-wheel`).
238. Columns by kind: pictures, clips, sites, notes, colors (`/board-layout cols-type`).
239. Columns by tag (`/board-layout cols-tag`).
240. Columns by stamp: ★ / ✓ / ✕ … (`/board-layout cols-stamp`).
241. Columns by mood: by each item's first mood word (`/board-layout cols-mood`).
242. Warm · neutral · cool (`/board-layout cols-temp`).
243. Columns by color family (`/board-layout cols-family`).
244. Low-key · mid · high-key (`/board-layout cols-light`).
245. Columns by shape: portrait / square / landscape (`/board-layout cols-aspect`).
246. Clusters by vibe: similar-feeling items grouped together (`/board-layout cluster`).
247. Around the selected (most similar near): the first selected in the middle, the closest vibes around it (`/board-layout similar`).
248. Newest first (`/board-layout newest`).
249. Biggest first (`/board-layout by-size`).
250. Shuffle: a random grid: fresh eyes on the same refs (`/board-layout shuffle`).
251. Staircase: overlapping steps (`/board-layout stairs`).
252. Grid · 5 columns (`/board-layout grid-5`).
253. Grid · 8 columns (`/board-layout grid-8`).
254. Grid · 10 columns (`/board-layout grid-10`).
255. Masonry · 2 columns (`/board-layout masonry-2`).
256. Masonry · 4 columns (`/board-layout masonry-4`).
257. Masonry · 6 columns (`/board-layout masonry-6`).
258. Tall filmstrip (`/board-layout filmstrip-tall`).
259. Small row (`/board-layout row-small`).
260. Wide column (`/board-layout column-wide`).
261. Tiny contact sheet (`/board-layout contact-tiny`).
262. Wide scatter (`/board-layout scatter-wide`).
263. Tight pile (`/board-layout pile-tight`).
264. Airy collage (`/board-layout collage-airy`).
265. Big honeycomb (`/board-layout honeycomb-big`).

## Templates

+ Add › Template, Board › New from a template, /board-template <name>, /board-new <name> | <template>.

266. Basics › Moodboard: Mood, Palette, Light, Motion, Texture, Type (`/board-template moodboard`).
267. Basics › Three columns: palette · light · motion: Palette, Light, Motion (`/board-template mood-3`).
268. Basics › Want · avoid: Want, Avoid (`/board-template refs-avoid`).
269. Basics › Try · trying · keep: To try, Trying, Keep (`/board-template kanban`).
270. Basics › Weekly inspiration: Mon, Tue, Wed, Thu, Fri, Weekend (`/board-template weekly`).
271. Basics › A / B looks: Look A, Look B (`/board-template a-b`).
272. Basics › Before / after: Before, After (`/board-template before-after`).
273. Basics › Four empty frames: 1, 2, 3, 4 (`/board-template blank-frames`).
274. Music › Music video treatment: Song feel, Palette, Light, Camera & motion, Cut pacing, Type & titles, Key moments, Avoid (`/board-template music-video`).
275. Music › Music visualizer: Drop energy, Calm parts, Palette, Shapes & textures, Reactions to the beat, Frame sizes (`/board-template visualizer`).
276. Music › Album cover: Cover, Type, Palette, Back cover (`/board-template album-cover`).
277. Music › Tour poster: Poster, Type, Palette, Photos (`/board-template tour-poster`).
278. Music › Lyric video: Type in motion, Backgrounds, Palette, Timing (`/board-template lyric-video`).
279. Music › DJ set visuals: Warm-up, Build, Peak, Cool-down (`/board-template dj-set`).
280. Social › Social reel (9:16): Hook 0–2 s, Middle, Payoff, End card (`/board-template social-reel`).
281. Social › Carousel 4:5: Slide 1, Slide 2, Slide 3, Slide 4, Slide 5 (`/board-template carousel`).
282. Social › Thumbnail tests (16:9): Thumb A, Thumb B, Thumb C, Thumb D (`/board-template thumbs`).
283. Social › Story set: Story 1, Story 2, Story 3 (`/board-template story-set`).
284. Social › App intro video: Hook, The problem, The app in action, Features montage, Call to action, Palette & type (`/board-template app-intro`).
285. Social › Product launch: Teaser, Reveal, Details, Lifestyle, Launch day (`/board-template launch`).
286. Design › Brand board: Logo, Palette, Type, Imagery, Voice, Do / don't (`/board-template brand`).
287. Design › Logo exploration: Marks, Wordmarks, Colors, Contexts (`/board-template logo`).
288. Design › UI look: Screens, Components, Palette, Type, Motion, Icons (`/board-template ui`).
289. Design › Type study: Headlines, Body, Pairings, In motion (`/board-template typography`).
290. Design › Poster: Poster, Layout refs, Palette, Type (`/board-template poster`).
291. Design › Editorial spread: Spread, Photos, Type, Grid (`/board-template editorial`).
292. Design › Packaging: Front, Back, Materials, Palette (`/board-template packaging`).
293. Design › Icon set: Style refs, Grid & stroke, Set, In context (`/board-template icon-set`).
294. Film › Film look: Grade, Grain & texture, Lenses, Light, Framing, Pacing (`/board-template film-look`).
295. Film › Storyboard · 6 panels: Shot 1, Shot 2, Shot 3, Shot 4, Shot 5, Shot 6 (`/board-template storyboard-6`).
296. Film › Storyboard · 9 panels: Shot 1, Shot 2, Shot 3, Shot 4, Shot 5, Shot 6, Shot 7, Shot 8, Shot 9 (`/board-template storyboard-9`).
297. Film › Storyboard · 12 panels: Shot 1, Shot 2, Shot 3, Shot 4, Shot 5, Shot 6, Shot 7, Shot 8, Shot 9, Shot 10, Shot 11, Shot 12 (`/board-template storyboard-12`).
298. Film › Shot list: Wide, Medium, Close-up, Insert, Movement, Transitions (`/board-template shot-list`).
299. Film › Color script: Act 1, Act 2, Act 3, Climax, End (`/board-template color-script`).
300. Film › Lighting study: Key, Fill, Rim, Practicals, Night, Golden hour (`/board-template lighting`).
301. Film › Title sequence: Opening, Names, Transitions, Type, Palette, Ending (`/board-template title-seq`).
302. Film › VFX look-dev: Plates, Elements, Comp refs, Grade (`/board-template vfx`).
303. Film › Documentary: Interviews, B-roll, Archival, Graphics (`/board-template documentary`).
304. 3D / games › Character: Silhouette, Faces, Costume, Palette, Poses, Materials (`/board-template character`).
305. 3D / games › Environment: Wide, Details, Light, Weather, Palette, Scale (`/board-template environment`).
306. 3D / games › Material study: Metal, Glass, Fabric, Stone, Organic, Emissive (`/board-template material`).
307. 3D / games › Three.js scene: Forms, Materials, Light & fog, Camera moves, Post effects, Palette (`/board-template three-scene`).
308. 3D / games › Shader look: Patterns, Noise, Color ramps, Motion (`/board-template shader`).
309. 3D / games › Game level: Layout, Landmarks, Mood, Enemies, UI, Palette (`/board-template game-level`).
310. 3D / games › Game UI: HUD, Menus, Icons, Fonts, Effects (`/board-template game-ui`).
311. Motion › Motion study: Easing, Timing, Loops, Transitions, Particles, Camera (`/board-template motion-study`).
312. Motion › Loop ideas: Seamless, Morphs, Patterns, Kinetic type (`/board-template loops`).
313. Motion › Transitions: Cuts, Wipes, Morphs, Match cuts, Glitches (`/board-template transitions`).
314. Motion › Kinetic type: Layouts, Rhythm, Fonts, Color (`/board-template kinetic-type`).
315. Lifestyle › Fashion: Silhouettes, Fabrics, Palette, Styling, Locations (`/board-template fashion`).
316. Lifestyle › Interior: Rooms, Materials, Light, Furniture, Palette (`/board-template interior`).
317. Lifestyle › Architecture: Forms, Facades, Materials, Light, Context (`/board-template architecture`).
318. Lifestyle › Food styling: Plates, Props, Light, Palette (`/board-template food`).
319. Lifestyle › Travel: Places, People, Light, Palette, Textures (`/board-template travel`).
320. Photo › Photo series: Subjects, Framing, Light, Grade, Sequence (`/board-template photo-series`).
321. Photo › Portrait lighting: Soft, Hard, Color gels, Backgrounds (`/board-template portrait`).
322. Photo › Street photo: Moments, Geometry, Light & shadow, Night (`/board-template street`).
323. Photo › Product shots: Hero, Details, Lifestyle, Backgrounds (`/board-template product-shot`).
324. Events › Event visuals: Stage, Screens, Signage, Merch, Palette (`/board-template event`).
325. Events › Celebration: Venue, Flowers, Palette, Stationery, Light (`/board-template wedding`).
326. Events › Workshop: Goals, References, Ideas, Decisions (`/board-template workshop`).
327. Business › Pitch deck look: Cover, Story, Charts, Photos, Palette, Type (`/board-template pitch`).
328. Business › Competitor scan: Them, Us, Gaps, Steal like an artist (`/board-template competitors`).
329. Business › Portfolio: Best work, Process, About, Layout refs (`/board-template portfolio`).
330. Web › Website look: Hero sections, Navigation, Type, Palette, Motion, Footers (`/board-template website`).
331. Web › Landing page: Hero, Features, Social proof, Pricing, Call to action (`/board-template landing`).
332. Web › Newsletter: Headers, Layouts, Type, Images (`/board-template newsletter`).
333. Web › Dark mode study: Surfaces, Accents, Text, States (`/board-template dark-mode`).
334. Color › Palette exploration: Warm, Cool, Neon, Pastel, Earth, Mono (`/board-template palette-explore`).
335. Color › Gradients: Linear, Radial, Mesh, Grain (`/board-template gradients`).
336. Color › Neon night: Signs, Rain, Reflections, Palette (`/board-template neon-night`).
337. Color › Golden hour: Skies, Skin, Shadows, Palette (`/board-template golden-hour`).
338. Color › Forgeheart look: Gold, Molten, Chrome, Glass, Embers (`/board-template forgeheart`).
339. Social › Hearth intro (social): Logo sting, The app moving, Chats in action, The Lab, Outro (`/board-template hearth-intro`).
340. Social › Trend remake: Original, Our take, Sound, Captions (`/board-template tiktok-trend`).
341. Social › YouTube video look: Thumbnail, Intro, B-roll, Lower thirds, End screen (`/board-template yt-video`).
342. Social › Podcast cover + clips: Cover, Clip frames, Waveform style, Type (`/board-template podcast`).
343. Social › Ad spot: Hook, Product, Benefit, Proof, Offer, End card (`/board-template ad`).
344. Music › Single release promo: Cover, Canvas loop, Teaser, Palette, Type (`/board-template music-promo`).
345. Music › Live show visuals: LED wall, Stage light, Loops, Transitions, Palette by song (`/board-template live-visuals`).
346. Music › Beat-synced moments: Intro, Verse, Pre, Drop, Break, Outro (`/board-template beat-map`).
347. Music › Techno visual: Monochrome, Strobes, Geometry, Tunnels (`/board-template genre-techno`).
348. Music › Ambient visual: Slow forms, Fog & light, Water, Palette (`/board-template genre-ambient`).
349. Music › Hip-hop visual: Streets, Type, Gold, Crew, Cars (`/board-template genre-hiphop`).
350. Music › Pop visual: Color, Dance, Fashion, Sets, Type (`/board-template genre-pop`).
351. Music › Rock visual: Live energy, Grain, Type, Merch (`/board-template genre-rock`).
352. 3D / games › Lab: particles: Swarms, Trails, Bursts, Colors, Camera (`/board-template lab-particles`).
353. 3D / games › Lab: tunnel: Shapes, Speed, Light, Palette (`/board-template lab-tunnel`).
354. 3D / games › Lab: terrain: Landforms, Sky, Fog, Flyover (`/board-template lab-terrain`).
355. 3D / games › Lab: glass & chrome: Refraction, Reflections, Lighting, Backgrounds (`/board-template lab-glass`).
356. 3D / games › Lab: 3D type: Letterforms, Materials, Motion, Lighting (`/board-template lab-type`).
357. 3D / games › Lab: abstract loops: Patterns, Noise, Color ramps, Loops (`/board-template lab-abstract`).
358. Film › Neo-noir: Shadows, Rain, Neon, Faces, Type (`/board-template noir`).
359. Film › Sci-fi: Worlds, Interfaces, Ships, Light, Palette (`/board-template scifi`).
360. Film › Horror: Dread, Light, Faces, Places, Sound (`/board-template horror`).
361. Film › Western: Landscapes, Dust, Faces, Type (`/board-template western`).
362. Film › Road movie: Roads, Cars, Motels, Skies, Night (`/board-template road-movie`).
363. Film › Trailer: Hook, World, Conflict, Montage, Title card (`/board-template trailer`).
364. Basics › Mood of the week: Colors, Pictures, Words, Sounds (`/board-template mood-week`).
365. Basics › Inbox (sort later): Inbox (`/board-template inbox`).
366. Basics › Yes · maybe · no: Yes, Maybe, No (`/board-template yes-maybe-no`).
367. Basics › Palette · light · motion · type: Palette, Light, Motion, Type (`/board-template palette-light-motion`).
368. Basics › Reference vs ours: Reference, Ours, Notes (`/board-template reference-vs-ours`).
369. Business › Review round: Option A, Option B, Option C, Feedback, Decision (`/board-template client-review`).
370. Business › Brand refresh: Old, New direction, Competitors, Palette, Type (`/board-template brand-refresh`).
371. Web › App store screenshots: Shot 1, Shot 2, Shot 3, Shot 4, Shot 5 (`/board-template app-store`).
372. Web › App onboarding: Screen 1, Screen 2, Screen 3 (`/board-template onboarding`).
373. Web › Dashboard look: Layouts, Charts, Cards, Palette, Dark / light (`/board-template dashboard`).
374. Design › App icon: Icon, Variations, Colors, In the dock (`/board-template icon-app`).
375. Design › Merch: Shirts, Stickers, Posters, Palette (`/board-template merch`).

## Vibe lenses (recolor the view by its vibe)

Right-click › Lens, View › Lens, L cycles, /board-lens <name>.

376. Palette: each item as its palette stripes (`/board-lens palette`).
377. Dominant color: each item as its strongest color (`/board-lens dominant`).
378. Color blocks: flat blocks of each item's colors, sized by share (`/board-lens blocks`).
379. Light: black and white, contrast pushed: see the values (`/board-lens light`).
380. Light zones: shadows / mids / highlights in three steps (`/board-lens luma`).
381. Squint: blurred: only the big shapes and values remain (`/board-lens squint`).
382. Monochrome: no color at all (`/board-lens mono`).
383. Saturation boost: colors pushed to see the hues (`/board-lens vivid`).
384. Negative: inverted (`/board-lens invert`).
385. Motion: red = lots of motion, blue = calm; stills fade (`/board-lens motion`).
386. Cut pacing: seconds per shot on every clip (`/board-lens pacing`).
387. Warmth: warm vs cool tint (`/board-lens warmth`).
388. Saturation: how colorful each item is (`/board-lens saturation`).
389. Contrast: soft to punchy (`/board-lens contrast`).
390. Texture: clean to busy (edge density) (`/board-lens texture`).
391. Brightness: dark to bright (`/board-lens brightness`).
392. Composition: thirds grid and where the weight sits (`/board-lens composition`).
393. Symmetry: how mirror-like each item is (`/board-lens symmetry`).
394. Negative space: how much calm empty area (`/board-lens space`).
395. Mood words: the words Hearth reads in each item (`/board-lens mood`).
396. Type: fonts of sites and text; pictures fade (`/board-lens type`).
397. Tags: your tags on every item (`/board-lens tags`).
398. Notes: your notes on every item (`/board-lens notes`).
399. Shape: aspect ratio of every item (`/board-lens aspect`).
400. Stamped only: only items with a stamp (`/board-lens stamps`).
401. Clips only: only videos and gifs (`/board-lens videos`).
402. Stills only: only pictures (`/board-lens stills`).
403. Sites only: only website cards (`/board-lens sites`).
404. Outlines: boxes only: the board's own composition (`/board-lens outline`).
405. Focus selection: everything but the selection fades (`/board-lens focus`).
406. Like the selection: red = feels like what you selected, blue = far from it (`/board-lens similar`).
407. Grain: smooth to grainy (`/board-lens grain`).
408. Color families: each item's main color family (`/board-lens family`).
409. Clip length: duration of clips (`/board-lens length`).
410. When added: how long ago each item came in (`/board-lens added`).
411. Resolution: pixel size of pictures and clips (`/board-lens resolution`).
412. Warm only: only the warm references (`/board-lens warm-only`).
413. Cool only: only the cool references (`/board-lens cool-only`).
414. Low-key only: only the dark references (`/board-lens dark-only`).
415. High-key only: only the bright references (`/board-lens bright-only`).
416. Notes and text only: only your words (`/board-lens notes-only`).
417. Colors only: only swatches and palettes (`/board-lens colors-only`).

## Looks for pictures and clips

Right-click › Look › Filter, /board-look <name> (the export draws them too).

418. Original.
419. Black & white (grayscale(1)).
420. Hard black & white (grayscale(1) contrast(1.6)).
421. Soft black & white (grayscale(1) contrast(0.85) brightness(1.08)).
422. Noir (grayscale(1) contrast(1.9) brightness(0.8)).
423. Sepia (sepia(0.85)).
424. Faded film (contrast(0.82) brightness(1.1) saturate(0.75) sepia(0.12)).
425. Matte (contrast(0.88) brightness(1.06) saturate(0.9)).
426. Warm (sepia(0.25) saturate(1.25) hue-rotate(-8deg)).
427. Cool (saturate(1.1) hue-rotate(12deg) brightness(1.02)).
428. Vivid (saturate(1.7) contrast(1.1)).
429. Punchy (contrast(1.35) saturate(1.3)).
430. Muted (saturate(0.45)).
431. Pastel (saturate(0.6) brightness(1.18) contrast(0.88)).
432. Bleach bypass (saturate(0.35) contrast(1.5) brightness(0.95)).
433. Cross-process (contrast(1.2) saturate(1.5) hue-rotate(-18deg) sepia(0.15)).
434. Teal & orange (sepia(0.3) saturate(1.6) hue-rotate(-12deg) contrast(1.1)).
435. Cyberpunk (hue-rotate(280deg) saturate(2.2) contrast(1.2)).
436. Day for night (brightness(0.55) saturate(0.7) hue-rotate(200deg) contrast(1.2)).
437. Sunset (sepia(0.5) saturate(1.7) hue-rotate(-24deg) brightness(1.04)).
438. Dreamy (blur(1.2px) brightness(1.12) saturate(1.15) contrast(0.9)).
439. Haze (contrast(0.7) brightness(1.18)).
440. Darker (brightness(0.7)).
441. Brighter (brightness(1.3)).
442. More contrast (contrast(1.4)).
443. Less contrast (contrast(0.7)).
444. Soft blur (blur(3px)).
445. Heavy blur (blur(10px)).
446. Invert (invert(1)).
447. X-ray (invert(1) grayscale(1) contrast(1.3)).
448. Thermal-ish (invert(1) hue-rotate(180deg) saturate(3) contrast(1.3)).
449. Hue shift 90° (hue-rotate(90deg)).
450. Hue shift 180° (hue-rotate(180deg)).
451. Hue shift 270° (hue-rotate(270deg)).
452. Lomo (contrast(1.4) saturate(1.5) brightness(0.95)).
453. Polaroid (sepia(0.2) contrast(0.95) brightness(1.1) saturate(1.2)).
454. Warm print (sepia(0.18) saturate(1.35) contrast(1.08) brightness(1.04)).
455. Green print (saturate(1.2) hue-rotate(8deg) contrast(1.05)).
456. Chrome (grayscale(0.6) contrast(1.6) brightness(1.1)).
457. Gilded (sepia(1) saturate(2.4) hue-rotate(-6deg) brightness(1.05)).
458. Neon (saturate(3) contrast(1.3) brightness(1.1)).
459. Ghost (opacity(0.55) grayscale(0.5) blur(0.6px)).
460. Silhouette (brightness(0.2) contrast(3)).
461. Poster (contrast(2.4) saturate(1.6)).
462. Washed out (brightness(1.25) contrast(0.75) saturate(0.8)).
463. Moody (brightness(0.82) contrast(1.15) saturate(0.8)).
464. VHS-ish (saturate(1.4) contrast(1.15) blur(0.6px) hue-rotate(-6deg)).
465. Cinema (contrast(1.12) saturate(0.85) sepia(0.12) brightness(0.96)).
466. Vivid print (saturate(1.5) contrast(1.12) hue-rotate(-4deg)).
467. Soft portrait (saturate(0.9) contrast(0.92) brightness(1.06) sepia(0.12)).
468. Grainy B&W (grayscale(1) contrast(1.35) brightness(0.95)).
469. Cool B&W (grayscale(1) sepia(0.2) hue-rotate(180deg) contrast(1.1)).
470. Warm B&W (grayscale(1) sepia(0.35) contrast(1.05)).
471. Infrared-ish (hue-rotate(180deg) saturate(1.8) contrast(1.2) invert(0.1)).
472. Lo-fi (contrast(1.5) saturate(1.3) brightness(0.9)).
473. Summer (brightness(1.1) saturate(1.35) sepia(0.15)).
474. Winter (brightness(1.08) saturate(0.6) hue-rotate(15deg)).
475. Autumn (sepia(0.4) saturate(1.4) hue-rotate(-14deg)).
476. Spring (brightness(1.08) saturate(1.2) hue-rotate(8deg)).
477. Pink cast (sepia(0.3) hue-rotate(290deg) saturate(2)).
478. Green cast (sepia(0.3) hue-rotate(60deg) saturate(1.6)).
479. Blue cast (sepia(0.3) hue-rotate(170deg) saturate(1.6)).
480. Red cast (sepia(0.5) hue-rotate(-30deg) saturate(2.2)).
481. Amber (sepia(0.7) saturate(1.8) hue-rotate(-10deg)).
482. Ink (grayscale(1) contrast(3) brightness(1.1)).
483. Fog (contrast(0.6) brightness(1.25) saturate(0.7) blur(0.8px)).
484. Dusk (brightness(0.8) sepia(0.25) hue-rotate(-20deg) saturate(1.3)).
485. Midnight (brightness(0.6) hue-rotate(210deg) saturate(1.4) contrast(1.3)).
486. Acid (hue-rotate(90deg) saturate(3) contrast(1.4)).
487. Soft focus (blur(1.6px) brightness(1.05)).

## Blend modes

Right-click › Look › Blend, /board-blend <mode>.

488. Blend: normal.
489. Blend: multiply.
490. Blend: screen.
491. Blend: overlay.
492. Blend: darken.
493. Blend: lighten.
494. Blend: color-dodge.
495. Blend: color-burn.
496. Blend: hard-light.
497. Blend: soft-light.
498. Blend: difference.
499. Blend: exclusion.
500. Blend: hue.
501. Blend: saturation.
502. Blend: color.
503. Blend: luminosity.

## Opacity, corners, shadows, borders, rotation

Right-click › Look.

504. Opacity 100 %.
505. Opacity 85 %.
506. Opacity 70 %.
507. Opacity 50 %.
508. Opacity 30 %.
509. Opacity 15 %.
510. Corners: Square.
511. Corners: Slight (default).
512. Corners: Soft.
513. Corners: Round.
514. Corners: Circle / oval.
515. Shadow: None.
516. Shadow: Soft.
517. Shadow: Hard offset.
518. Shadow: Gold glow.
519. Shadow: Floating.
520. Border: None.
521. Border: Thin line.
522. Border: Thick white.
523. Border: Polaroid.
524. Border: Gold.
525. Rotate 90° right.
526. Rotate 90° left.
527. Rotate 180°.
528. Tilt +15°.
529. Tilt −15°.
530. Straighten.

## Crops

Right-click › Look › Crop, /board-crop <ratio>; Alt-drag the edges for a free crop.

531. Crop Free (reset).
532. Crop 1:1.
533. Crop 4:5.
534. Crop 5:4.
535. Crop 3:4.
536. Crop 4:3.
537. Crop 2:3.
538. Crop 3:2.
539. Crop 9:16.
540. Crop 16:9.
541. Crop 21:9.
542. Crop 2.39:1.
543. Crop 1.85:1.
544. Crop 3:1 banner.

## Note colors and sizes

Right-click a note › Note color / Text size.

545. Note color: Lemon.
546. Note color: Peach.
547. Note color: Mint.
548. Note color: Sky.
549. Note color: Lilac.
550. Note color: Rose.
551. Note color: Paper.
552. Note color: Kraft.
553. Note color: Ink.
554. Note color: Slate.
555. Note color: Gold.
556. Note color: Ember.
557. Note color: Ice.
558. Note color: Neon pink.
559. Note color: Neon lime.
560. Note color: Blueprint.
561. Note color: Chalkboard.
562. Note color: Glass.
563. Note color: Forge.
564. Note color: Index card.
565. Note color: Teal.
566. Note color: Coral.
567. Note color: Lavender.
568. Note color: Sand.
569. Note color: Night.
570. Note color: Wine.
571. Note color: Moss.
572. Note color: Chrome.
573. Note text: Small text.
574. Note text: Normal text.
575. Note text: Large text.
576. Note text: Huge text.

## Text styles

Right-click a text › Text style; Size presets 24–240.

577. Text style: Clean sans.
578. Text style: Heavy.
579. Text style: Poster.
580. Text style: Wide caps.
581. Text style: Thin.
582. Text style: Serif.
583. Text style: Serif italic.
584. Text style: Fashion serif.
585. Text style: Book.
586. Text style: Mono.
587. Text style: Terminal.
588. Text style: Typewriter.
589. Text style: Handwritten.
590. Text style: Script.
591. Text style: Condensed.
592. Text style: Rounded.
593. Text style: Forgeheart.
594. Text style: Neon glow.
595. Text style: Outline.
596. Text style: Chrome.
597. Text style: Gold leaf.
598. Text style: Sunset gradient.
599. Text style: Ice gradient.
600. Text style: Drop shadow.
601. Text style: Retro offset.
602. Text style: Glitch.
603. Text style: Stencil.
604. Text style: Small caps.
605. Text style: Label.
606. Text style: Quote.
607. Text style: Tight heavy.
608. Text style: Airy light caps.
609. Text style: All lowercase.
610. Text style: Mono caps.
611. Text style: Serif caps.
612. Text style: Sticker.
613. Text style: Ember glow.
614. Text style: Ice glow.
615. Text style: Rainbow.
616. Text style: Subtle caption.
617. Text size 24.
618. Text size 36.
619. Text size 48.
620. Text size 64.
621. Text size 96.
622. Text size 128.
623. Text size 180.
624. Text size 240.

## Stamps

Right-click › Stamp, /board-stamp.

625. Stamp ★ Favorite.
626. Stamp ♥ Love it.
627. Stamp ✓ Approved.
628. Stamp ✕ Not this.
629. Stamp ? Question.
630. Stamp ! Important.
631. Stamp ☀ Light reference.
632. Stamp ♪ Music feel.
633. Stamp ⚡ Energy.
634. Stamp ◐ Contrast.
635. Stamp ◆ Color reference.
636. Stamp Aa Type reference.

## Board backgrounds

View › Background, /board-bg <name>.

637. Background: Follow the app look.
638. Background: Dots.
639. Background: Grid.
640. Background: Lined.
641. Background: Plain dark.
642. Background: Black.
643. Background: Charcoal.
644. Background: Plain light.
645. Background: Paper.
646. Background: White.
647. Background: Graph paper.
648. Background: Blueprint.
649. Background: Crosses.
650. Background: Studio gray.
651. Background: 18% gray.
652. Background: Warm dark.
653. Background: Forge.
654. Background: Night blue.
655. Background: Plum.
656. Background: Olive.
657. Background: Sand.
658. Background: Mint.
659. Background: Cork.
660. Background: Green felt.
661. Background: Slate.
662. Background: Wine.
663. Background: Ocean.
664. Background: Ember.
665. Background: Fog.
666. Background: Cream.
667. Background: Lilac.
668. Background: Deep teal.
669. Background: Light crosses.
670. Background: Void.

## Frame sizes and colors

+ Add › Frame, /board-frame <size> | <title>; right-click a frame › Frame color.

671. Frame 9:16 story / reel (540 × 960).
672. Frame 4:5 feed (540 × 675).
673. Frame 1:1 square (600 × 600).
674. Frame 16:9 video (960 × 540).
675. Frame 2.39:1 cinema (1035 × 433).
676. Frame 1.85:1 film (999 × 540).
677. Frame 4:3 (720 × 540).
678. Frame 3:2 photo (810 × 540).
679. Frame 2:3 photo (540 × 810).
680. Frame A4 portrait (595 × 842).
681. Frame A4 landscape (842 × 595).
682. Frame US Letter (612 × 792).
683. Frame Poster 2:3 (600 × 900).
684. Frame Banner 3:1 (1200 × 400).
685. Frame YouTube thumbnail (640 × 360).
686. Frame X header 3:1 (1500 × 500).
687. Frame Slide 16:9 (1280 × 720).
688. Frame Phone screen (393 × 852).
689. Frame Tablet (820 × 1180).
690. Frame Desktop screen (1440 × 900).
691. Frame Album cover (600 × 600).
692. Frame Vinyl sleeve (620 × 620).
693. Frame 21:9 (1260 × 540).
694. Frame 4:5 tall (480 × 600).
695. Frame Panorama 4:1 (1600 × 400).
696. Frame Business card (525 × 300).
697. Frame Sticky size (300 × 300).
698. Frame Tall column (520 × 1400).
699. Frame Big section (1600 × 1000).
700. Frame Huge area (3000 × 2000).
701. Frame Pinterest pin 2:3 (500 × 750).
702. Frame Spotify Canvas 9:16 (540 × 960).
703. Frame LinkedIn banner 4:1 (1584 × 396).
704. Frame YouTube banner (1280 × 720).
705. Frame Twitch panel (640 × 320).
706. Frame Link preview 1.91:1 (1200 × 628).
707. Frame 1.91:1 feed (1080 × 566).
708. Frame A3 portrait (842 × 1191).
709. Frame A5 portrait (420 × 595).
710. Frame Postcard (600 × 400).
711. Frame CD cover (600 × 600).
712. Frame Bookmark strip (200 × 600).
713. Frame Watch face (396 × 484).
714. Frame Big square (1200 × 1200).
715. Frame color: Neutral.
716. Frame color: Gold.
717. Frame color: Ember.
718. Frame color: Red.
719. Frame color: Pink.
720. Frame color: Violet.
721. Frame color: Blue.
722. Frame color: Cyan.
723. Frame color: Green.
724. Frame color: Lime.
725. Frame color: Sand.
726. Frame color: Slate.
727. Frame color: White.
728. Frame color: Black.

## Grid sizes

View › Grid size.

729. Grid snap every 10.
730. Grid snap every 20.
731. Grid snap every 40.
732. Grid snap every 80.
733. Grid snap every 120.

## Harmonies

Right-click a swatch › Harmonies, + Add › Color › Harmony from a color…, /board-harmony <name> <#hex>.

734. Harmony: Complementary.
735. Harmony: Analogous.
736. Harmony: Triadic.
737. Harmony: Split complementary.
738. Harmony: Tetradic.
739. Harmony: Square.
740. Harmony: Monochrome.
741. Harmony: Shades.
742. Harmony: Tints.
743. Harmony: Tones.
744. Harmony: Warmer steps.
745. Harmony: Cooler steps.
746. Harmony: Color + neutrals.
747. Harmony: Dark + accent.
748. Harmony: Pastel set.
749. Harmony: Neon set.
750. Harmony: Earthy.
751. Harmony: Duotone pair.

## Palette library

+ Add › Color › Palette library (grouped), /board-color <name>.

752. Palette: Neon noir (#0b0f1a #1b1f3a #ff2e88 #2de2e6 #f6f5ae).
753. Palette: Teal & orange (#0f3d3e #1f7a7a #e3e3d3 #f29e4c #d1495b).
754. Palette: Golden hour (#2d1e2f #7c3a2d #e07a3f #f2b880 #fff1d6).
755. Palette: Blue hour (#0d1b2a #1b263b #415a77 #778da9 #e0e1dd).
756. Palette: Forgeheart (#120e09 #3a2a12 #e6b450 #ff7a3d #fff1c1).
757. Palette: Pastel dream (#ffd6e0 #ffefcf #d4f0f0 #cfe1ff #e2d4ff).
758. Palette: Vaporwave (#ff71ce #01cdfe #05ffa1 #b967ff #fffb96).
759. Palette: Synthwave (#2b0f54 #ab1f65 #ff4f69 #ff8031 #ffdf6c).
760. Palette: Matrix (#000000 #003b00 #008f11 #00ff41 #d0ffd8).
761. Palette: Bauhaus (#f2f2f2 #1c1c1c #d62828 #f7b801 #1d3557).
762. Palette: Swiss (#ffffff #111111 #ff0000 #e5e5e5 #777777).
763. Palette: Memphis (#ff6f91 #ffc75f #f9f871 #00c9a7 #845ec2).
764. Palette: Desert (#f2cc8f #e07a5f #81b29a #3d405b #f4f1de).
765. Palette: Forest floor (#1b2a1f #2f4f3a #6b8f5e #c9b37e #8a5a3b).
766. Palette: Ocean deep (#03045e #0077b6 #00b4d8 #90e0ef #caf0f8).
767. Palette: Coral reef (#ff6b6b #ffa36c #ffd93d #6bcb77 #4d96ff).
768. Palette: Moss & stone (#3b3c36 #5e6052 #8a8c74 #b9b8a3 #e4e2d6).
769. Palette: Rust belt (#2b2b2b #5a3e36 #a44a3f #d9a066 #eadcc4).
770. Palette: Chrome (#0e0f11 #3b4048 #9aa3ad #d7dde3 #ffffff).
771. Palette: Ice (#e8f8ff #b8e6f5 #7cc6e6 #3c8dbc #0b3c5d).
772. Palette: Lava (#1a0000 #5c0a0a #b3200e #ff6b1a #ffc23d).
773. Palette: Cherry blossom (#fff5f7 #ffd1dc #ff9eb5 #c9637e #5a2a3a).
774. Palette: Mint chip (#e9fff5 #b4f5d6 #6fd3a6 #2a7a5f #3b2a20).
775. Palette: Lavender fields (#f3eefe #d7c8f5 #a68ae0 #6a4fb0 #2e2350).
776. Palette: Noir (#000000 #1c1c1c #3a3a3a #8c8c8c #f0f0f0).
777. Palette: Sepia print (#2e2215 #5c4630 #a58a62 #d9c4a1 #f5ecd9).
778. Palette: Kodachrome (#1e2a3a #c0392b #e9b44c #4f8a8b #f2e8cf).
779. Palette: Polaroid (#f7f3e9 #e9d8a6 #94a89a #5e7c88 #2f3e46).
780. Palette: Wes pastel (#f1bb7b #fd6467 #5b1a18 #d67236 #e6d8c3).
781. Palette: Tokyo night (#1a1b26 #24283b #7aa2f7 #bb9af7 #f7768e).
782. Palette: Miami (#00c2c7 #ff8bd8 #ffd166 #06d6a0 #f8f9fa).
783. Palette: Nordic (#2e3440 #3b4252 #88c0d0 #a3be8c #eceff4).
784. Palette: Autumn (#3d1f12 #8c2f1b #d9631e #f2a541 #f2d7a0).
785. Palette: Winter (#f8fbff #cfe0f0 #8fb3d1 #4a6d8c #1d2f40).
786. Palette: Spring (#fffbe6 #d8f3dc #95d5b2 #ffcad4 #f4acb7).
787. Palette: Summer (#ffbe0b #fb5607 #ff006e #8338ec #3a86ff).
788. Palette: Muted editorial (#efeae2 #c8bfb0 #8e8576 #4a4640 #1f1d1a).
789. Palette: Clay (#e9d5c3 #d4a373 #b5784f #7f5539 #3a2618).
790. Palette: Olive drab (#2f3220 #4b5320 #7d8452 #b9b27e #e8e2c4).
791. Palette: Midnight gold (#0b0c10 #1f2833 #c5a35a #f2d58c #ffffff).
792. Palette: Royal (#14123b #2e2a72 #5d4ab8 #c9a227 #f4ecd6).
793. Palette: Candy (#ff5d8f #ff97b7 #ffd1e3 #a0e7e5 #b4f8c8).
794. Palette: Acid (#0d0d0d #c6ff3d #2dfcff #ff3df2 #ffffff).
795. Palette: Rave UV (#120024 #4b0082 #9d00ff #ff00e6 #00ffd5).
796. Palette: Bioluminescent (#00060f #00243a #00a6a6 #66ffe3 #c9fff7).
797. Palette: Aurora (#0b132b #1c2541 #3a506b #5bc0be #6fffe9).
798. Palette: Sakura neon (#1b0b1f #ff4fa3 #ffb3d9 #7af0ff #2a1a3f).
799. Palette: Gameboy (#0f380f #306230 #8bac0f #9bbc0f #cadc9f).
800. Palette: CGA (#000000 #55ffff #ff55ff #ffffff #aa00aa).
801. Palette: Blueprint (#0b2b5c #1f4fa8 #5a8de0 #b8d0ff #ffffff).
802. Palette: Terracotta (#f4e1d2 #e2a37f #c86b4a #8f3f2a #3b1e14).
803. Palette: Sage (#f1f3ec #cbd5c0 #9aae8f #627a5c #2f3d2c).
804. Palette: Dusty rose (#f7ebe8 #e6c1bd #c98f8f #8f5b5f #3f2a2d).
805. Palette: Steel blue (#e7edf3 #b6c6d6 #7d97b0 #4b6584 #25364a).
806. Palette: Sunflower (#fff8dc #ffe066 #f4a259 #5b8e7d #244f26).
807. Palette: Grape soda (#2b0f3a #5d1e7a #9b4dca #d6a2e8 #ffe5f9).
808. Palette: Highlighter (#faff00 #00ff85 #00e0ff #ff2fa0 #111111).
809. Palette: Concrete (#d9d9d6 #b0b0ac #85857f #595955 #2e2e2b).
810. Palette: Film noir red (#0a0a0a #2b2b2b #9e1b1b #e0e0e0 #ffffff).
811. Palette: Jungle (#0b2016 #1e4d2b #3f7d3c #9ccc65 #f2e94e).
812. Palette: Coffee (#f5ebe0 #d5bdaf #a98467 #6f4e37 #2b1d14).
813. Palette: Berry (#3b0a1e #7a1c3c #c2185b #f06292 #fce4ec).
814. Palette: Arctic neon (#001219 #005f73 #0a9396 #94d2bd #e9d8a6).
815. Palette: Sunrise (#fbd3e9 #bb377d #f6a14b #fde29b #fff6e5).
816. Palette: Tropical (#006d77 #83c5be #edf6f9 #ffddd2 #e29578).
817. Palette: Moody teal (#0f1f24 #173a40 #2c6e6f #a3c4bc #e8e1d4).
818. Palette: Peach fuzz (#fff1e6 #ffd6ba #ffbe98 #e8956b #7d4e3a).
819. Palette: Lilac haze (#f5f0ff #ddd0f7 #bca5e8 #8f78c4 #4d3f73).
820. Palette: Emerald city (#04211a #0b4f3c #13856a #3bd1a0 #c8fff0).
821. Palette: Ruby (#1a0006 #4d0011 #8f0020 #d1003a #ff8aa0).
822. Palette: Sapphire (#00081a #001a4d #003399 #3d6eff #a8c0ff).
823. Palette: Amber (#1a0e00 #4d2b00 #a35c00 #f29f05 #ffd98a).
824. Palette: Oyster (#f7f5f0 #e8e3d9 #cfc7b8 #a69f92 #6d675e).
825. Palette: Graphite (#111214 #1e2024 #2c2f35 #4a4e57 #9aa0aa).
826. Palette: Paper & ink (#f6f1e7 #e5dccb #1f2a44 #3c4f76 #b23a48).
827. Palette: Risograph (#ff48b0 #0078bf #ffe800 #00a95c #f6f1e7).
828. Palette: Halftone (#f2efe9 #2a2a2a #e63946 #457b9d #f1faee).
829. Palette: Comic (#ffde00 #ff0000 #0047ab #000000 #ffffff).
830. Palette: Pop art (#ff1f8e #ffe600 #00b3ff #00d26a #1a1a1a).
831. Palette: Ukiyo-e (#f2e8cf #6a994e #386641 #bc4749 #1d3557).
832. Palette: Renaissance (#2b1d0e #6b4423 #a67b5b #d9c3a5 #3d5a6c).
833. Palette: Impressionist (#a8d5e2 #f9d56e #f3a683 #b8de6f #5c6bc0).
834. Palette: Rothko (#3d0c11 #7a1e1e #c0392b #e67e22 #f4d03f).
835. Palette: Klein blue (#002fa7 #0b3fd1 #4f6dd9 #e8ecf8 #111111).
836. Palette: Mondrian (#ffffff #dd0100 #fac901 #225095 #000000).
837. Palette: Hokusai wave (#e6e2d3 #b8c5c9 #4f7c8a #1f3c58 #0b1a2b).
838. Palette: Matcha (#f3f5e9 #d1dfb7 #9cb87a #5f7a42 #2e3a1f).
839. Palette: Chai (#faf3e8 #e6cfa9 #c79a63 #8c5a2b #3d2410).
840. Palette: Smoky quartz (#ece6e1 #c7bcb4 #8f817a #5b4f4a #2b2422).
841. Palette: Lunar (#0a0a0f #1c1c26 #4a4a5a #9a9aad #e8e8f0).
842. Palette: Solar flare (#1a0500 #6b1d00 #e8590c #ffa94d #fff3bf).
843. Palette: Glacier (#f0fbff #d0f0fa #9fd8ea #5aa9c8 #1f5f7a).
844. Palette: Volcanic (#0d0d0d #2b2b2b #6b0f0f #d63b0f #ffb703).
845. Palette: Tidepool (#0b3d3a #1e6f68 #61a89c #f2d0a4 #e86f4a).
846. Palette: Meadow (#eef7e1 #c4e3a5 #8fc56b #4f8a3a #f6e27a).
847. Palette: Bubblegum (#ffe3f1 #ffb3d9 #ff7ab8 #c75cff #6ad1ff).
848. Palette: Lofi (#2d2a32 #4a4458 #8e7dbe #f2c6de #faf3dd).
849. Palette: Chillhop (#1f2937 #3b4a5c #d4a373 #e9c46a #f4f1de).
850. Palette: Drum & bass (#050505 #1a1a1a #00ff9c #00b3ff #ff0055).
851. Palette: Techno (#000000 #141414 #2e2e2e #ff0000 #ffffff).
852. Palette: House (#0d0221 #261447 #6c3baa #f75590 #fce38a).
853. Palette: Ambient (#eef2f3 #cfd9df #a3b8c8 #7090a8 #3d5a73).
854. Palette: Hip-hop gold (#0a0a0a #2b2b2b #c9a227 #f2d16b #ffffff).
855. Palette: Indie film (#ece4d4 #c8b79a #7f8c74 #4b5b55 #2a2f2d).
856. Palette: Horror (#050505 #1a0a0a #4a0000 #8b0000 #d9d9d9).
857. Palette: Sci-fi lab (#0a0f14 #12202b #1e90ff #00e5ff #f0f8ff).
858. Palette: Fantasy (#1b1033 #3c2a6b #7d5ba6 #e0b04c #f6e7c1).
859. Palette: Steampunk (#1e1611 #4a3423 #8c6239 #c9a227 #e8d8b0).
860. Palette: Cyber yellow (#0d0d0d #ffd300 #ff006e #00f5d4 #f1f1f1).
861. Palette: Holo foil (#c9f0ff #ffc9f5 #fff7c9 #c9ffd9 #e0c9ff).
862. Palette: Opal (#f7f7ff #dfe7fd #cde5f7 #f5d9ec #e8f6ef).
863. Palette: Obsidian (#050608 #0e1116 #1b2029 #2e3746 #5c6b80).
864. Palette: Sodium vapour (#0d0a05 #3a2408 #c96a12 #f2a33a #ffd88a).
865. Palette: Mercury vapour (#050d0c #0f2b26 #2f7a68 #8fd1b8 #e6fff6).
866. Palette: Tungsten (#1a1208 #4d3418 #a8743a #e8b06a #fff0d4).
867. Palette: Daylight (#f7f9fb #dce6ef #a9c1d6 #6b8fae #2c4760).
868. Palette: Overcast (#e4e6e8 #c2c7cc #9aa1a8 #6f777f #3d4349).
869. Palette: Thunderstorm (#101418 #26303a #4c5b69 #9fb0bf #f5d76e).
870. Palette: Desert night (#0f0b1e #2b1f45 #6a3d6e #d6845a #f7c58a).
871. Palette: Polar night (#020a14 #0a2238 #1d4f74 #5fa8c9 #c6ecff).
872. Palette: Rooftop sunset (#2a1638 #6b2d5c #c2456b #f28b5b #fbd38d).
873. Palette: Harbour dawn (#1c2b3a #4d6a82 #a7b9c6 #f0c9a4 #fbe7d3).
874. Palette: Concrete jungle (#1b1c1e #3d3f42 #6e7174 #a4a7aa #f2c14e).
875. Palette: Subway (#101010 #2a2a2a #f2c500 #00843d #e4002b).
876. Palette: Arcade (#0b0221 #3a0ca3 #f72585 #4cc9f0 #ffd60a).
877. Palette: Pixel pastel (#f7d6e0 #f2b5d4 #eff7f6 #b2f7ef #7bdff2).
878. Palette: Chrome age (#0f1114 #2f343b #8a9199 #c8cdd2 #f4f6f8).
879. Palette: Brushed gold (#2b2112 #5e4521 #a77d3c #dcb565 #f7e2a5).
880. Palette: Copper (#1e0f08 #5a2a14 #a5532b #d98a52 #f4c49a).
881. Palette: Patina (#13241f #2c5249 #4f8c7b #8cc2a8 #d6ead9).
882. Palette: Glacier blue (#e9f6fb #bfe4f2 #7fc4e3 #3d8fb8 #154e6b).
883. Palette: Aurora green (#04140f #0b3d2b #1a8f5a #52e8a0 #c3ffe4).
884. Palette: Sunset strip (#1f0b2e #5c1a6b #b5338a #f26b6b #ffc069).
885. Palette: Miami vice (#00b2ca #7dcfb6 #fbd1a2 #f79256 #f15bb5).
886. Palette: Film negative (#f2e3c6 #c49a6c #7d5a44 #3c2f2f #1a1a1a).
887. Palette: Cross-processed (#0b3c49 #2a9d8f #e9c46a #f4a261 #e76f51).
888. Palette: Bleach bypass (#1c1d1f #3e4144 #7b7f83 #b9bcbe #e8e8e6).
889. Palette: Day for night (#05080f #0e1b33 #1f3a66 #5a7fb0 #b8cbe6).
890. Palette: Technicolor (#c81d25 #ffe066 #0b6e4f #0353a4 #f4f1de).
891. Palette: Super 8 (#3b2f2f #8a5a44 #d9a066 #f2d49b #94a3a4).
892. Palette: Polar fleece (#f2f4f7 #d0d8e2 #9aaabf #5c708a #2a3647).
893. Palette: Cashmere (#f6efe6 #e5d5c3 #c9ad8f #9c7b5b #5b4330).
894. Palette: Velvet (#14060d #3d0f24 #6e1840 #a8335f #e0789a).
895. Palette: Champagne (#fbf6ea #f2e4c4 #e0c98f #bfa064 #7d6638).
896. Palette: Bubble tea (#f7e6d4 #e8c4a0 #b5835a #6b4a35 #2b1d16).
897. Palette: Matcha latte (#f4f6e8 #d8e3b5 #a9c27a #6d8a45 #3a4a23).
898. Palette: Strawberry (#fff0f3 #ffc2d1 #ff8fab #fb6f92 #c9184a).
899. Palette: Blueberry (#eef0ff #c3c8f5 #8b93e0 #4e58b5 #232a6b).
900. Palette: Lemonade (#fffbe6 #fff3a3 #ffe14d #f2c200 #a37c00).
901. Palette: Mint mojito (#effff8 #c2f5de #7de0b6 #2fb889 #0f6b4c).
902. Palette: Rainforest (#061a10 #0f3d22 #1f6e3a #4fa35a #a8d672).
903. Palette: Savanna (#f3e3b8 #e0bd76 #b8863f #7a5a2b #3a2e1c).
904. Palette: Tundra (#eef2f0 #c9d3cf #93a39b #5a6b63 #2a3530).
905. Palette: Coral sea (#ff7f6a #ffb199 #fde2d0 #4fb0c6 #1d6f8a).
906. Palette: Deep sea (#00040d #00172e #003b5c #007a8a #3fd6c8).
907. Palette: Lagoon (#e6fbf8 #a8ece2 #4fd1c2 #0f9b8e #05544e).
908. Palette: Volcano glass (#0a0a0c #1e1b24 #3d2f4a #7a4b6e #c47f8e).
909. Palette: Plasma (#0d0221 #4a0e8f #9e1fd0 #ff3cac #ffd1f0).
910. Palette: Laser (#000000 #ff0040 #00ff9f #00b8ff #ffffff).
911. Palette: UV paint (#0a001a #3f00ff #a000ff #ff00c8 #c8ff00).
912. Palette: Smoke machine (#0b0b0f #2a2a35 #5b5b70 #9a9ab0 #e0e0ec).
913. Palette: Strobe (#000000 #ffffff #000000 #f5f5f5 #222222).
914. Palette: Vinyl crackle (#1a1612 #3d342b #7a6a55 #c2ad8e #efe2c9).
915. Palette: Cassette (#f2e8d5 #e4572e #17bebb #ffc914 #2e282a).
916. Palette: Festival (#ff6b35 #f7c59f #efefd0 #004e89 #1a659e).
917. Palette: Orchestra (#1b120c #4a2f1d #8a5a32 #c9a36a #f2e6cf).
918. Palette: Synth pads (#120f2b #2d2a6e #5f5fd0 #a4a4ff #e4e4ff).
919. Palette: 808 (#0d0d0d #1f1f1f #ff3b30 #ffcc00 #f2f2f2).
920. Palette: Brutalist (#e9e9e6 #bdbdb8 #6e6e6a #2f2f2d #ff4d00).
921. Palette: Scandinavian (#f7f5f0 #e3ddd2 #c2b8a3 #7d8c84 #2f3b36).
922. Palette: Mid-century (#f2e3c6 #e09f3e #9e2a2b #335c67 #1b2b34).
923. Palette: Art deco (#0f0f0f #1f3a3d #c9a227 #e8d5a3 #f7f3e9).
924. Palette: Y2K (#c0c0ff #ff99ff #99ffff #ffffff #9999ff).
925. Palette: Grunge (#1a1a14 #3d3b2e #6b6650 #a19c7a #d9d3b0).
926. Palette: Kodak gold (#f5c518 #e09b1a #b5651d #6b3a1f #2b1a10).
927. Palette: Fuji green (#e9f0e1 #b9cfa3 #7fa36d #3f6b4a #1d3529).
928. Palette: Neon sign (#0a0a12 #ff2079 #ff8c00 #39ff14 #00e5ff).
929. Palette: Ghost town (#e8e2d4 #c4b89c #8f7f63 #5a4e3c #2b251c).

## Palette card styles

/board-palette-style.

930. Palette card style: Stripes.
931. Palette card style: Gradient.
932. Palette card style: Dots.
933. Palette card style: Blocks.

## Shapes, arrows, stickers

+ Add › Shape / Arrow or line / Sticker, /board-shape, /board-arrow, /board-sticker.

934. Shape: Rectangle.
935. Shape: Rounded rectangle.
936. Shape: Circle.
937. Shape: Pill.
938. Shape: Triangle.
939. Shape: Diamond.
940. Shape: Hexagon.
941. Shape: Star.
942. Shape: Blob.
943. Shape: Outline box.
944. Shape: Pentagon.
945. Shape: Octagon.
946. Shape: Chevron.
947. Shape: Cross.
948. Shape: Parallelogram.
949. Shape: Trapezoid.
950. Arrow →.
951. Arrow ←.
952. Arrow ↓.
953. Arrow ↑.
954. Arrow ↘.
955. Double arrow ↔.
956. Curved arrow.
957. Dashed arrow.
958. Plain line.
959. Bold arrow.
960. Sticker ★.
961. Sticker ♥.
962. Sticker ✓.
963. Sticker ✕.
964. Sticker ?.
965. Sticker !.
966. Sticker ☀.
967. Sticker ☾.
968. Sticker ⚡.
969. Sticker ♪.
970. Sticker ✿.
971. Sticker ❄.
972. Sticker ☁.
973. Sticker ◆.
974. Sticker ●.
975. Sticker ▲.
976. Sticker ✦.
977. Sticker ❤.
978. Sticker ☺.
979. Sticker ☹.
980. Sticker 👍.
981. Sticker 👎.
982. Sticker 🔥.
983. Sticker ✨.
984. Sticker 🎬.
985. Sticker 🎨.
986. Sticker 💡.
987. Sticker 📌.
988. Sticker 🎧.
989. Sticker 🌙.
990. Sticker 🎵.
991. Sticker 🎥.
992. Sticker 📷.
993. Sticker 🌈.
994. Sticker 🌊.
995. Sticker ⭐.
996. Sticker 💎.
997. Sticker 🌀.
998. Sticker 🖤.
999. Sticker 🤍.
1000. Sticker 💜.
1001. Sticker 💛.
1002. Sticker 🧡.
1003. Sticker 💚.
1004. Sticker 💙.
1005. Sticker 👀.
1006. Sticker 🤔.
1007. Sticker 🚀.

## Board styles (restyle everything)

Board › Style everything, /board-style <name>.

1008. Board style: Editorial.
1009. Board style: Neon night.
1010. Board style: Polaroid wall.
1011. Board style: Minimal.
1012. Board style: Brutalist.
1013. Board style: Forgeheart.
1014. Board style: Gallery.
1015. Board style: Dreamy.
1016. Board style: Blueprint.
1017. Board style: Chrome.
1018. Board style: Retro.
1019. Board style: Back to plain.

## Questions to ask a chat about references

Right-click › Ask a chat about it, /board-ask <name>.

1020. Ask: What do they have in common? — "What do these references have in common? Name the shared vibe in a few words, then the 3 strongest traits." (`/board-ask common`).
1021. Ask: Write a creative brief — "Write a short creative brief from these references: mood, palette, light, motion, type, and what to avoid." (`/board-ask brief`).
1022. Ask: Make a palette from them — "Build a 5-color palette from these references, with a role for each color (background, main, accent…)." (`/board-ask palette`).
1023. Ask: Suggest a Lab scene — "Suggest a three.js scene for the Lab that borrows this vibe (forms, materials, light, motion), not the footage." (`/board-ask scene`).
1024. Ask: Make a shot list — "Turn these references into a shot list for a short video: shot, framing, movement, duration." (`/board-ask shots`).
1025. Ask: Name the mood — "Give this mood 5 short names, and the one you would pick." (`/board-ask name`).
1026. Ask: What is missing? — "Looking at these references as a moodboard, what is missing or inconsistent?" (`/board-ask missing`).
1027. Ask: Find the odd one out — "Which of these references does not fit the others, and why?" (`/board-ask odd`).
1028. Ask: Suggest fonts — "Suggest 3 font pairings (heading / body) that fit this vibe." (`/board-ask type`).
1029. Ask: What would it sound like? — "Describe the music that fits this vibe: tempo, instruments, energy." (`/board-ask music`).
1030. Ask: How should it be cut? — "How should a video with this vibe be edited: pacing, transitions, rhythm?" (`/board-ask edit`).
1031. Ask: Words for a caption — "Write 5 short captions that match this vibe." (`/board-ask words`).

## Note starters

+ Add › More › Note starter, /board-starter <name>.

1032. Note starter: To try (checklist).
1033. Note starter: Shot list.
1034. Note starter: Brief.
1035. Note starter: Questions.
1036. Note starter: Do / don't.
1037. Note starter: Palette roles.
1038. Note starter: Timing.
1039. Note starter: Why these refs.

## Connector styles

Right-click a connector › Style, /board-connect <style>.

1040. Connector: Arrow.
1041. Connector: Both ways.
1042. Connector: Plain line.
1043. Connector: Dashed.
1044. Connector: Curved.
1045. Connector: Bold.

## Vibe focuses (what part of a vibe a chat gets)

Send vibe ›, the drawer, /board-use <focus>, /ref <words> | <focus>, /board-focus.

1046. Full vibe: "Use these references for their vibe" (`/board-use full`).
1047. Palette only: "Take only the colors from these references" (`/board-use palette`).
1048. Light only: "Match the lighting (key, contrast) of these references" (`/board-use light`).
1049. Color feel: "Match the color feel (palette, saturation, warmth)" (`/board-use color`).
1050. Motion only: "Match the motion energy and cut pacing of these references" (`/board-use motion`).
1051. Pacing only: "Cut on this pacing" (`/board-use pacing`).
1052. Texture only: "Match the texture and grain" (`/board-use texture`).
1053. Composition only: "Compose like these references" (`/board-use composition`).
1054. Type only: "Match the typography feel" (`/board-use type`).
1055. Mood words: "Aim for this mood" (`/board-use mood`).
1056. My notes only: "My notes on the references" (`/board-use notes`).
1057. The opposite: "Do the OPPOSITE of these references (contrast them on purpose)" (`/board-use opposite`).
1058. Things to avoid: "AVOID looking like these references" (`/board-use avoid`).
1059. Blend them: "Blend these references into one look" (`/board-use blend`).
1060. For a Lab scene: "Build the scene with this vibe (colors, light, motion, texture), not the footage" (`/board-use lab`).
1061. For an edit: "Edit with this rhythm and look" (`/board-use edit`).
1062. For a poster: "Design the poster with this palette, composition and type feel" (`/board-use poster`).
1063. For titles / type: "Set the titles in this type feel and these colors" (`/board-use titles`).
1064. For a thumbnail: "Make the thumbnail with this color, light and framing" (`/board-use thumbnail`).
1065. For a social reel: "Cut the reel with this pacing, palette and light" (`/board-use reel`).
1066. For a color grade: "Grade toward these colors, contrast and warmth" (`/board-use grade`).
1067. For a music visual: "Make the music visual feel like this (colors, energy, texture, mood)" (`/board-use music`).
1068. Contrast and light: "Copy only the contrast and light key" (`/board-use contrast-only`).
1069. Framing + light: "Frame and light it like these references" (`/board-use composition-light`).

## Mood words

Read from each reference's vibe; shown in the Mood lens and sent with the vibe.

1070. Mood words: nocturnal, cold.
1071. Mood words: smoky, intimate.
1072. Mood words: dramatic, chiaroscuro.
1073. Mood words: airy, soft.
1074. Mood words: sunny, playful.
1075. Mood words: electric, loud.
1076. Mood words: restrained, monochrome.
1077. Mood words: vintage, nostalgic.
1078. Mood words: warm.
1079. Mood words: cool, clinical.
1080. Mood words: gritty, busy.
1081. Mood words: clean, minimal.
1082. Mood words: spacious, calm.
1083. Mood words: symmetric, formal.
1084. Mood words: frantic, energetic.
1085. Mood words: lively.
1086. Mood words: still, meditative.
1087. Mood words: rapid-fire cuts.
1088. Mood words: long takes.
1089. Mood words: colorful.
1090. Mood words: filmic, textured.
1091. Mood words: glossy, digital.
1092. Mood words: nostalgic, sunlit.
1093. Mood words: neon-lit, nightlife.
1094. Mood words: graphic, bold.
1095. Mood words: hazy, dreamy.
1096. Mood words: zen, quiet.
1097. Mood words: chaotic, raw.
1098. Mood words: icy, crisp.
1099. Mood words: moody, candlelit.
1100. Mood words: strobing, clubby.
1101. Mood words: uplifting, building.
1102. Mood words: ominous, fading.
1103. Mood words: iconic, centered.
1104. Mood words: big sky, open.

## Presentation transitions

Present › Transition, /board-present <name>.

1105. Transition: Fly (900 ms).
1106. Transition: Slow fly (1800 ms).
1107. Transition: Whip (380 ms).
1108. Transition: Bounce (900 ms).
1109. Transition: Cut.
1110. Transition: Fade through black (700 ms).
1111. Transition: Zoom out, then in (1300 ms).
1112. Transition: Dolly (scale only) (900 ms).
1113. Transition: Drift (2600 ms).
1114. Transition: Spin (1000 ms).
1115. Transition: Snap (220 ms).
1116. Transition: Glide (linear) (1200 ms).
1117. Transition: Slow fade (1400 ms).
1118. Transition: Punch in (520 ms).
1119. Transition: Big arc (2000 ms).
1120. Transition: Slow dolly (1800 ms).

## Exports

Board › Export, /board-export <kind>.

1121. Export: Board as PNG (`/board-export png`).
1122. Export: Board as PNG at 2× (`/board-export png2`).
1123. Export: Board as JPEG (smaller) (`/board-export jpg`).
1124. Export: Selection as PNG (`/board-export sel`).
1125. Export: Each frame as a PNG (`/board-export frames`).
1126. Export: Pages (frames stacked, PDF-like image) (`/board-export pages`).
1127. Export: Contact sheet of the media (`/board-export contact`).
1128. Export: Board palette as a PNG strip (`/board-export palette-png`).
1129. Export: Board palette as CSS variables (`/board-export palette-css`).
1130. Export: Board palette as JSON (`/board-export palette-json`).
1131. Export: Board palette for GIMP / Krita (.gpl) (`/board-export palette-gpl`).
1132. Export: Vibe brief as Markdown (`/board-export md`).
1133. Export: Vibe data as JSON (`/board-export vibe-json`).
1134. Export: Item list as CSV (`/board-export csv`).
1135. Export: Whole board as a .zip (data + media) (`/board-export zip`).
1136. Export: Copy the vibe text (`/board-export clip`).
1137. Export: Board file (.json, to open elsewhere) (`/board-export board-json`).
1138. Export: Web page (gallery + vibe) (`/board-export html`).

## Clip speeds

Right-click a clip › Clip › Speed.

1139. Clip speed 0.25×.
1140. Clip speed 0.5×.
1141. Clip speed 0.75×.
1142. Clip speed 1×.
1143. Clip speed 1.5×.
1144. Clip speed 2×.
1145. Clip speed 4×.

## Presentation timing

Present › Advance, /board-present-auto.

1146. Advance: By hand.
1147. Advance: Every 3 s.
1148. Advance: Every 5 s.
1149. Advance: Every 8 s.
1150. Advance: Every 12 s.
1151. Advance: Every 20 s.

## Chat commands (area "Board", /help board)

Every board feature is drivable from any chat or the command bar (Ctrl+;).

1152. `/board [board]`: Open the mood board (or switch to a board by name).
1153. `/boards`: List your boards (✓ = linked to this chat).
1154. `/board-new <name> [| template]`: A new board (optionally from a template).
1155. `/board-rename <name>`: Rename the current board.
1156. `/board-delete`: Delete the current board (Undo in the notification).
1157. `/board-duplicate`: Copy the current board.
1158. `/board-add <url | path | #hex… | text>`: Add a website, a picture / clip link or file path, colors or a note to the board (the chat's linked board).
1159. `/board-note <text>`: A note on the board (Markdown).
1160. `/board-text <text>`: A big text / title on the board.
1161. `/board-color <#hex… | palette name>`: A color or palette card: hex colors or a palette from the library.
1162. `/board-harmony <harmony> <#hex>`: A palette built from one color (complementary, triadic, analogous…).
1163. `/board-frame [size] [| title]`: A frame (around the selection, or a size).
1164. `/board-template <template>`: Add a template's frames to this board (moodboard, music video treatment, storyboard…).
1165. `/board-layout <layout>` (also /board-arrange): Auto-arrange the selection (or everything): grid, masonry, timeline, collage, rainbow….
1166. `/board-align <side>`: Align the selection: left, center, right, top, middle, bottom.
1167. `/board-distribute <h|v>`: Even gaps across the selection: h or v.
1168. `/board-lens <lens|off>`: Look at the board through its vibe: palette, light, motion, texture, type, mood… (off).
1169. `/board-zoom <fit|sel|percent>`: Zoom: fit, sel (selection), a percent (2–3200).
1170. `/board-bg <background>`: Board background: dots, grid, paper, blueprint, black….
1171. `/board-minimap <auto|on|off>`: Minimap: auto (while moving), on, off.
1172. `/board-snap <on|off>`: Snapping to other items on / off (guides).
1173. `/board-grid <on|off> [size]`: Snap to a grid on / off.
1174. `/board-export <kind>`: Export: png, png2, jpg, sel, frames, pages, contact, palette-png/css/json/gpl, md, vibe-json, csv, zip, clip.
1175. `/board-present [transition]`: Present: fly between the frames (→ next, ← back, Esc ends).
1176. `/board-search <words>`: Find on the board: words, #tags, colors (teal), moods, kinds (clip, site).
1177. `/board-select <what>`: Select: all, none, pictures, clips, sites, notes, colors, frames, stamped, #tag, or words.
1178. `/board-tag <tag…>`: Tag the selection (#night, #hero…); "-tag" removes it.
1179. `/board-stamp <stamp>`: Stamp the selection: ★ ♥ ✓ ✕ ? ! … (none removes).
1180. `/board-note-on <text>`: Your note on the selected item(s) (chats read it with the vibe).
1181. `/board-look <filter>`: A look for the selected pictures: bw, sepia, faded, teal-orange, cyber, dream… (none).
1182. `/board-blend <mode>`: Blend mode of the selection (multiply, screen, overlay…).
1183. `/board-opacity <percent>`: Opacity of the selection (0–100).
1184. `/board-rotate <degrees>`: Rotate the selection by degrees (0 straightens).
1185. `/board-crop <ratio>`: Crop the selected pictures to a ratio: 1:1, 4:5, 9:16, 16:9, 2.39:1… (free resets).
1186. `/board-clip <in|out|clear|loop|sound|speed x|grab|poster>`: The selected clip on the board: in, out, clear, loop, sound, speed <x>, grab, poster.
1187. `/board-grab [seconds]`: Frame grab: the selected clip at a time (seconds) as a still on the board.
1188. `/board-compare`: Compare two selected items (wipe, side by side, onion, difference + their vibes).
1189. `/board-similar`: Select what feels like the selected item.
1190. `/board-palette`: A palette card from the selection (or the whole board).
1191. `/board-reread`: Read the vibe of the selection again (or everything).
1192. `/board-undo`: Undo on the board (Ctrl+Z there).
1193. `/board-redo`: Redo on the board.
1194. `/board-link [board]`: Link this chat to a board (the drawer and /board-use pick it here).
1195. `/board-unlink`: Unlink this chat from its board.
1196. `/board-use [focus] [send]`: Attach the board's vibe (linked or current) to your next message; "send" sends it now.
1197. `/ref <words> [| focus]`: Attach the vibe of the references matching your words (or the selection) to your next message.
1198. `/vibe [words | board | sel]`: Show a vibe here (free, nothing sent): the board's, the selection's, or of references matching words.
1199. `/board-peek` (also /board-drawer): The board drawer over this chat (Ctrl+Shift+M): drag a reference into the chat for its vibe.
1200. `/board-save-reply`: Save the last reply of this chat as a note on the board.
1201. `/board-clean`: Move media no board uses any more to the Recycle Bin.
1202. `/board-tools <on|off|directors>`: Let this agent use the board itself (board tools: list, vibe, add, arrange; ≈ 350 tokens a message): on, off, or directors.
1203. `/board-shape <shape> [#color]`: A shape on the board: rect, round, circle, pill, triangle, diamond, hexagon, star, blob, frame-line.
1204. `/board-arrow <kind>`: An arrow or line: right, left, up, down, diag, double, curved, dashed, line, thick.
1205. `/board-sticker <sticker>`: A big sticker / emoji (★ ♥ 🔥 ✨ …).
1206. `/board-hide [show]`: Hide the selection (it stays out of the vibe); "show" brings everything back.
1207. `/board-info`: Everything about the selected item (file, size, length, cuts, tags…).
1208. `/board-move-to <board> [copy]`: Move (or copy) the selection to another board.
1209. `/board-brief <text>`: The board's brief: what it is for, in your words (chats read it first).
1210. `/board-lock [on|off]`: Lock / unlock the board (look and send vibes, nothing moves).
1211. `/board-star`: Star the board (starred boards come first).
1212. `/board-random`: Jump to a random reference (R on the board).
1213. `/board-import [folder|board]`: Add a whole folder of pictures and clips, or open a board file (.json).
1214. `/board-screenshot`: Put a screenshot of Hearth (the whole window) on the board.
1215. `/board-copy-image`: Copy the selection (or the whole board) to the clipboard as a picture.
1216. `/board-autotag`: Tag the selection (or everything) from its vibe: #low-key #warm #muted #busy #fast-cuts #teal….
1217. `/board-snapshot <size|all>`: Take the selected website snapshots again at a size: desktop, laptop, mobile, tablet, tall, wide (all = every site).
1218. `/board-shots`: One still per shot of the selected clip (from its cuts), in a row under it.
1219. `/board-sheet`: A contact sheet (6 frames) of the selected clip as a picture.
1220. `/board-to-lab [focus]`: Give the Three Director the board's vibe (for a scene: colors, light, motion, texture; never the footage).
1221. `/board-diff <board> | <board>`: How two boards differ in vibe (palette, light, contrast, saturation, warmth, texture, motion, mood).
1222. `/board-stats`: What's on the board (kinds, clip time, vibes being read, links).
1223. `/board-present-auto <seconds>`: Presentation advances by itself every N seconds (0 = by hand).
1224. `/board-version [save [name] | list | <number>]`: Save a version of the board, list them, or go back to one.
1225. `/board-overview`: All your boards with their covers (click one to open it).
1226. `/board-list`: The board as a sortable table: kind, light, contrast, saturation, warmth, motion, pacing, mood, tags.
1227. `/board-eyedropper`: Pick a color anywhere on screen as a swatch (E on the board).
1228. `/board-focus <focus>`: What this board gives chats by default: full, palette, light, motion, texture, composition, type, mood….
1229. `/board-from-lab`: Put the Lab's current picture on the board.
1230. `/board-from-review`: Put Video Review's current frame on the board.
1231. `/board-from-chat`: Put the pictures attached in this chat on the board.
1232. `/board-palette-style <style>`: How the selected palette cards look: stripes, gradient, dots, blocks.
1233. `/board-connect [style]`: Connect the selected items with arrows, in the order you picked them (C): arrow, both, line, dashed, curved, bold.
1234. `/board-save-template [name]`: Save this board's frames as a template of your own.
1235. `/board-save-palette [name]`: Save the selected palette (or the board's colors) to your palette library.
1236. `/board-backdrop [off]`: Use the selected picture as the board's background (off removes it).
1237. `/board-play [play|pause|mute|sound]`: Clips in view: play (four at most), pause, mute, sound.
1238. `/board-fit-text`: Make the selected text fill its box.
1239. `/board-ask <question>`: Draft a question about the selected references (or the board) with their vibe attached: common, brief, palette, scene, shots, name, missing, odd, type, music, edit, words.
1240. `/board-footage [on|off]`: Allow (or stop) chats using the selected clip / picture itself as footage — off by default, chats get vibes.
1241. `/board-view <save name | name | number>`: Save the current view under a name, or fly to a saved one.
1242. `/board-loop-shot`: The selected clip loops the shot it is on (in / out at its cuts).
1243. `/board-starter <starter>`: A note starter: todo, shots, brief, questions, dodont, palette, timing, refs.
1244. `/board-untangle`: Push overlapping items apart (the selection, or everything).
1245. `/board-gather`: Bring the selection together in the middle of the view.
1246. `/board-style <style>`: Restyle every note, text and picture at once: editorial, neon, polaroid, minimal, brutal, forge, gallery, dream, blueprint, chrome, retro, plain.

## Keys, modifiers and right-clicks (all listed in the keys button, area "Board")

Every one is also reachable from a visible menu or a chat command.

1247. Shift+.  /  Shift+,: the selected clip jumps to the next / previous cut.
1248. Ctrl+Shift+M: board drawer over any chat or tool (also the ▦ in the rail, /board-peek).
1249. Drag a reference into a chat: attach its vibe (not the file) to your next message.
1250. Right-click a drawer tile: attach only its palette, light, motion… to the chat.
1251. Tab  /  Shift+Tab: select the next / previous item (in reading order).
1252. R: a random reference (fresh eyes).
1253. H: hide the selection (Board menu → Show hidden).
1254. I: information about the selected item.
1255. Ctrl+Shift+C: copy the selection (or the board) as a picture.
1256. Alt+move over a clip: scrub through it (in → out).
1257. Alt+wheel on the selection: opacity up / down.
1258. Shift+Alt+wheel on the selection: rotate.
1259. Alt+click a palette stripe: copy that color.
1260. C: connect the selected items with arrows (in the order you picked them).
1261. Drop / paste on the drawer: add it to that board from any chat or tool.
1262. Drag a drawer tile onto the board: copy that reference here.
1263. /  or  Ctrl+F: search and filter the board.
1264. P: present: fly between frames (→ / Space next, ← back, Esc ends).
1265. Alt+click the zoom: zoom to fit right away.
1266. Double-click a frame title: rename the frame.
1267. Right-click the drawer: its width and side.
1268. Delete / Backspace: delete the selection.
1269. Ctrl+Z: undo.
1270. Ctrl+Shift+Z / Ctrl+Y: redo.
1271. Ctrl+A: select everything.
1272. Ctrl+D: duplicate.
1273. Ctrl+G: group the selection.
1274. Ctrl+Shift+G: ungroup.
1275. Ctrl+C: copy items (paste them in any board).
1276. Ctrl+X: cut items.
1277. Ctrl+]  /  Ctrl+[: bring to front / send to back.
1278. ]  /  [: bring forward / send backward.
1279. Arrows (Shift = ×10): nudge the selection (or pan).
1280. Shift+1: zoom to fit everything.
1281. Shift+2: zoom to the selection.
1282. Shift+0: zoom to 100 %.
1283. +  /  −: zoom in / out.
1284. Ctrl+0: zoom to fit (like a browser).
1285. N: new note at the middle.
1286. T: new text.
1287. F: frame the selection (or a new frame).
1288. Enter: open / edit the selected item.
1289. Escape: clear the selection.
1290. , / .: step a selected clip one frame back / forward.
1291. Space (hold) + drag: pan.
1292. Middle-drag: pan the board.
1293. Wheel / pinch: zoom where the pointer is.
1294. Two-finger scroll: pan (trackpad).
1295. Ctrl+wheel: zoom (also the trackpad pinch).
1296. Shift+wheel: pan sideways.
1297. Drag on empty space: select with a box (Shift adds).
1298. Shift+click: add / remove from the selection.
1299. Alt+drag: duplicate while dragging.
1300. Shift+drag: move along one axis.
1301. Ctrl+drag: move without snapping.
1302. Shift+resize: free proportions (pictures) / keep them (notes).
1303. Alt (hold): show rotate and crop handles on the selection.
1304. Alt+rotate: rotate freely (otherwise 15° steps).
1305. Ctrl (hold): show the quick bar on the selection (→ chat, vibe, open).
1306. Right-click: menus for an item or the board.
1307. Double-click: open / edit an item, empty space = new note.
1308. Drag a file / link / text in: add it to the board.
1309. Ctrl+V: paste pictures, links, colors or text.

## Tested

node --check on every file; `node dev/board-unit-test.js` (vibe math, mood rules, layouts, colors); `node dev/board-mcp-test.js` (the MCP server over stdio, a round trip through a fake hub bridge, the engines.js opt-in); in the app (`sh dev/board-fixtures.sh`, then `node dev/smoke.js --script …`): `dev/checks/board.js` (real file drop, website snapshots incl. offline, vibes, wheel / pinch / middle-drag / trackpad, marquee, drag, right-click submenus, lenses, hover playback, undo / redo, exports, presentation), `board-chat.js` (commands, drawer drag into a chat, board_ tools), `board-extra.js`, `board-links.js`, `board-presets.js` (every preset of every family applied and checked), `board-perf.js` (pan / zoom traces with 150 references), `qa-commands.js` (no duplicate commands).
