# Polish 8 (round 8): the board, the editor and capture feel like one Forgeheart app

Round 7 added three big new places at once — the **mood board**, the **video editor** inside Video Review and
**capture** — plus the declutter pass (Alt reveal, the keys button, right-click everywhere, Customise this…). They
were built in parallel, so each one had its own idea of a menu, its own symbols and its own corners. This pass makes
them read as one calm app, following your rule: *less in my face, more submenus, keep the customisability, right-click
more, hide buttons behind Alt / Ctrl with the keys button bottom left.* Nothing was removed: every tucked control is
behind Alt, under the pointer, in a right-click menu, in the keys sheet and still a `/command`.

How to see it in four lines:
- **Right-click** anything on the board, the editor's track or bar, a capture: the same menu shape everywhere — the
  main action first, then arrange, then look, then send / export, More…, Delete, and **Customise this…** last.
- Menus show the app's own **SVG icons** on the verbs every surface shares (Look, Arrange, Send to a chat, Export,
  Present, Customise this…) and on the capture menu, instead of emoji.
- **Hold Alt** in the editor or over the board drawer: the rarer buttons come back (dashed outline). `/tidy` lists them.
- **The keys button** (bottom left) now lists the editor and capture too, with an icon per area, the board first when
  you're on the board and the editor first when it's open.

Files: new `polish8.js` + `polish8.css` (loaded last), icons in `icons.js`; small edits in `renderer.js` (menu icons,
1 line), `declutter.js` (`addRules`, the Customise icon), `keys-ui.js` (the sheet's areas), `capture.js` (its menu uses
the app's submenus; the keys reach the sheet), `capture-view.js` / `capture-annotate.js` (labels), `board.js` (chip
icon, empty state), `tools/video-cut.js` (title icon, keys at load), `tools/review.js` (notes empty state),
`tools/video.css` (2 lines), `tools/three.js` (1 line), `index.html` (2 tags). Checks: `dev/checks/polish8.js`,
`polish8-tour.js`, `polish8-tour2.js`, `polish8-smooth.js`; `clutter.js` and `declutter-count.js` now cover the board,
its drawer, the editor and captures.

## Before → after: what's on screen
Counted by `node dev/smoke.js --fake-engines --script dev/checks/declutter-count.js` on round 7 (`main` at 3ba238f)
and on this branch, same fixtures (3 references on the board, a video in Video Review with the editor open, one
capture). "Tidy" is what you see by default.

| Surface | Round 7 (tidy) | Now (tidy) | Everything out (`/calm off`) |
|---|---:|---:|---:|
| Board (chips over the canvas) | 3 | 3 | 3 |
| Board drawer (3 references) | 9 | 4 | 9 |
| Editor bar | 6 | 5 | 6 |
| Video Review with the editor open | 31 | 29 | 44 |
| Captures library | 6 | 6 | 6 |
| Capture viewer | 5 | 5 | 5 |
| **Round 7 surfaces** | **60** | **52** | **73** |
| **All surfaces in declutter-count.js** | **118** | **110** | **173** |

`dev/checks/clutter.js` (the round 4 counter, now with these surfaces) agrees: board drawer (4 references) 6 → 4, editor
bar 6 → 5, Video Review with the editor 31 → 29; the board item / canvas, editor ⋯ and capture menus each gain one row
(Customise this…, which they lacked), so its grand total reads 242 → 248 while what's on screen went down by 5.

The board drawer counts 2 + one → per reference before (11 with 6 references); now 4 whatever the board holds.
The menus got *shorter to read* rather than shorter: the same rows, grouped with separators, the rare ones in More….

## A. One menu shape: board, editor, capture, Lab
1. Right-click a **board item**: its menu is grouped — open / duplicate, then Arrange, then Look / note / tags / stamp, then Send vibe / Vibe / Ask a chat, then More… and Delete — with thin separators between the groups.
2. Right-click the **board canvas**: the same grouping (Add / View / Board / Search, then Arrange everything / Select, then Lens, then Present / Send the board's vibe).
3. Right-click a **clip in the editor**: grouped — Split / Delete / Edit / Inspector first, then time (keyframes, fades, speed, motion, transition), then look (Look, effects, opacity, blend, title style and animation), then sound (mute, volume, sound effects).
4. Right-click a **capture** (library card, player, viewer, frame results): grouped — open / copy / Video Review / editor / Lab, then annotate / beautify / social frame, then send / make / read frames.
5. In every grouped menu, **Look leads its group** (the verb you reach for most).
6. **More…** always sits at the end, just above Delete and Customise this… (it used to land after Customise this… in the board canvas and editor ⋯ menus).
7. **Delete** closes the Boards menu (it sat above "Style everything").
8. **Customise this…** ends the board item menu.
9. … the board canvas menu.
10. … the Boards chip menu (click or right-click).
11. … the zoom chip menu.
12. … the board drawer's tile menu.
13. … the board drawer's own menu (right-click its background).
14. … the editor's clip and layer menu.
15. … the editor's track (lane label) menu.
16. … the editor's marker menu.
17. … the editor's ruler menu.
18. … the editor's transition menu.
19. … the editor's ⋯ menu.
20. … the capture menu (rail ⋯ › Capture, Ctrl/⌘+Alt+S).
21. … every capture's right-click menu (library, player, viewer, frame results).
22. … the captures library's ⋯ and the viewer's ⋯.
23. … Video Review's right-click menus.
24. … the rail's ⋯ menu.
25. … the Lab's ⋯ menu (Focus, Capture, Console, Code…).
26. Customise this… in the editor offers its tucked buttons (Undo, A|B) to pin back; in the drawer, its ↗ / ＋ / → / count.
27. The **capture menu now uses the app's own submenus**: › rows open beside the menu when you point at them (flyouts), instead of replacing the menu.
28. … with ‹ back naming where you came from, ← / → / ↑ / ↓ / Enter / Esc like every other menu.
29. … and a "Type to filter…" field that also finds rows inside its submenus ("Screenshot of › The chat box").
30. Thin separators in the capture menu: screenshots | recording and tours | captures and frames | settings.
31. Submenu rows lose their "…" (Screenshot of ›, Social frame ›, Beautified ›, Record ›, Tours ›, Settings ›, Beautify ›, Make ›, Read frames ›): › already says there's more, "…" now always means a dialog.
32. Capture's two "→ Chat" rows became **Send to this chat** and **Send to a chat ›** (the same verb as the board's "Send vibe to a chat"; they read as two identical rows before).
33. The editor's menus show their keys in the key column on the right, like every other menu ("Split here … S", "Ripple delete … Shift+Del"), instead of "(S)" in the label: the clip and layer menu.
34. … in its submenus (Edit ›, Delete ›, Speed ›…).
35. … the marker, ruler and track menus.
36. … the ⋯ menu ("Freeze frame here … Shift+F", "Title card here… … Shift+T", "Keys … ?").
37. The editor's ⋯ shows Undo / Redo with their keys (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z).
38. The editor's ⋯ is grouped: the edit actions | Tools, Snapshots, Sequence | Undo, Redo.
39. The Lab's ⋯ › Capture › ends with **The capture menu…** (social frames, recording, tours) — the Lab reaches all of capture in one place.
40. The board drawer's rail button (right-click) ends with Customise this… too.

## B. Icons: one set, drawn in the look's gold
41. Menu rows can carry an icon (any menu in the app): drawn first, in the look's gold, a soft glow when you point at the row.
42. Same verb, same icon everywhere: **Look** (sparkles).
43. **Arrange** (a grid).
44. **Send … to a chat** / **Ask a chat** (a speech bubble with an arrow).
45. **Export** (an arrow leaving a tray).
46. **Present** (a screen with a play mark).
47. **Vibe** (three overlapping color drops).
48. **Customise this…** (sliders), in every menu of the app.
49. Video projects: **Sequence ›** and **Template ›** in the editor carry the film-strip icon.
50. **Tours ›** carries the route icon (a dotted path to a flag).
51. **Read frames** carries the frames icon (three offset frames).
52. **Snapshots ›** / **Recent ›** carry the recent icon.
53. Capture menu: **Screenshot of this tool / Screenshot of ›** — the camera icon (was 📷).
54. **Social frame ›** — the phone-frame icon (was ⬚).
55. **Beautified ›** / **Beautify ›** — sparkles (was ✨).
56. **Record Hearth / Record ›** — the record icon (was ●).
57. **Stop recording** — the stop icon (was ■).
58. **Marker here** (while recording) — the timecode icon (was ◆).
59. **Captures** — the grid icon (was ▦).
60. **Annotate** — the pen icon (was ✎).
61. **Make ›** — scissors (was ✂).
62. **Open / Play** a capture — the camera / play icons (were 🖼 / ▶).
63. **Recent** captures — film / camera icons per row (were 🎬 / 📷).
64. Rail ⋯ menu: **Notes**, **Memory**, **All side by side**, **Ask-all bar**, **Import past chats**, **Capture** show the same SVG icons as their rail buttons (were 🗒 🧠 ▦ ⌨ ⇪ ◉).
65. The Capture rail button (hidden in the ⋯; pin it on screen with Customise this…) shows the capture icon instead of ◉.
66. The board's **Boards chip** shows the board icon (the lock icon when the board is read-only) instead of ▦ / 🔒.
67. The editor bar's title: the **editor icon** + EDIT (or the sequence's name) instead of "✂ Edit".
68. The board drawer's head: the board icon.
69. The captures library's title: the capture icon (in place of the generic ◆).
70. The empty board: the board icon above its line.
71. The empty captures library: the capture icon above its line.
72. Video Review's empty library: the film icon above its line.
73. New icon: **capture** (a viewfinder around a record dot).
74. New icon: **shot** (a camera).
75. New icon: **rec** (a ring with a dot).
76. New icon: **stop**.
77. New icon: **editor** (three lanes of clips and a playhead).
78. New icon: **cut** (scissors).
79. New icon: **film** (a video project).
80. New icon: **frames**.
81. New icon: **tour**.
82. New icon: **sparkle**.
83. New icon: **social** (a phone frame).
84. New icon: **export**.
85. New icon: **pen**.
86. New icon: **tochat** (send to a chat).
87. New icon: **keys** (a keyboard).
88. New icon: **vibe**.
89. New icon: **present**.
90. New icon: **clock** (timecode).
91. New icon: **sliders** (customise).
92. New icon: **recent**.
93. New icon: **lock** (a read-only board).

## C. Less in your face (Alt / where you point), with Customise this… to pin back
94. Editor bar: **↶ Undo** waits behind Alt (Ctrl/⌘+Z, ⋯ › Undo and right-click still undo); the bar keeps ＋, the format chip, ⇪ Export, ⋯ and ✕.
95. While editing, **A|B compare** waits behind Alt (it only works on the source; the editor said so when you pressed C).
96. Board drawer: **↗ Open the whole board** waits behind Alt (right-click the drawer, or the ▦ in the rail).
97. Board drawer: **＋ Add pictures** waits behind Alt (drop or paste onto the drawer still adds).
98. Board drawer: the **→ on each reference** shows on the reference you point at (dragging it into the chat does the same).
99. Board drawer: the **reference count** shows when you point at the drawer.
100. The **closed drawer is out of the page**: Tab no longer walks into it and screen readers no longer read it (it was only slid off screen).
101. `/tidy [board|editor|drawer]`: what these surfaces tuck away and how to get each back (pin one with `/pin-control <name>`, everything with `/calm off`).
102. The empty board teaches in one line ("Drop pictures, clips or links — or paste, or + Add") with a whisper under it ("Right-click for everything else").
103. The empty drawer says what it's for in one line ("Drop or paste references here — they give chats a vibe, never the footage").
104. Video Review's empty notes: one line ("Pause where something should change and press N (D draws on the frame).") instead of three sentences.
105. The empty captures library: one line ("No captures yet: Ctrl/⌘+Alt+S, or /shot in any chat.").
106. The captures library's hint: one line ("Double-click opens · right-click for more · drag it into a chat"; Alt+click is in the keys sheet).

## D. Right-click used more
107. Right-click the **Boards chip** on the board: the boards menu.
108. Right-click **+ Add**: the add menu.
109. Right-click the **zoom chip**: the view menu.
110. Right-click the editor bar's **＋**: the add menu.
111. … its **format chip**: the format menu.
112. … **⇪ Export**: the export menu.
113. Right-click the **empty part of the editor bar**: the editor's ⋯ menu.
114. Right-clicks on ✕ / ↶ in the editor bar don't open the browser's own menu.

## E. The keys sheet (the keys button, bottom left)
115. **Capture's keys finally reach the sheet**: about 60 lines (Ctrl/⌘+Alt+S / A / R / P / V / T, the player, the region picker, annotation, the library) were registered with a lookup that never found the keys list.
116. The **editor's keys** are listed from the start (before, only after Video Review had been opened once).
117. With the editor open, the sheet starts with **Editor**, then Video Review.
118. On the board, the sheet starts with **Board**, then Capture.
119. With the board drawer open over a chat, the Board lines join the chat's.
120. Capture's keys (they work anywhere) come right after the global ones, not at the bottom.
121. Every area heading carries its icon (Board, Editor, Capture, Video Review, Lab, Chat box, Director dock, Nodes, Notes, Command bar, …).
122. New line: **Home / End** — first / last frame of the edit.
123. New line: **Ctrl/⌘+D** — duplicate the selected clip.
124. New line: **Ctrl/⌘+Y** — redo.
125. New line: **Ctrl/⌘+= / Ctrl/⌘+−** — zoom the timeline.
126. New line: **?** — the editor's keys in one list.
127. New line: **Double-click** in the editor — a clip's inspector, a title's text, a marker on the ruler.
128. New line: **Esc** in the inspector — close it.
129. New line: **Right-click the editor bar** — its menus.
130. New line: **Right-click a board chip** — its menu.
131. New line: **Esc** in the board drawer — close it.
132. New line: **0** in the capture viewer — fit the picture.
133. New line: **Right-click (rail ⋯ › Capture)** — the capture menu; Alt shows every row.
134. Click a new line in the keys sheet and it happens (first / last frame, duplicate, redo, zoom, the editor's keys, close the inspector or the drawer, the chip / editor bar / capture menus).
135. The editor's ⋯ › More › Keys opens the keys sheet on the editor (it was a plain list in a dialog).
136. The board's More › Keys on the board… opens the keys sheet on the board.
137. Hold Ctrl/⌘ over the capture viewer: badges on **Copy (C)**, **Annotate (A)**, **→ Chat (Enter)**, **▶ (Space)**, **◀| / |▶ (, .)**, **Read (R)**, **✕ (Esc)**.
138. Hold Ctrl/⌘ on the board: a **Shift+1** badge on the zoom chip (zoom to fit).
139. Hold Ctrl/⌘ in the editor: an **E** badge on its ✕.

## F. The mood board in the Forgeheart look
140. The chips over the board follow `/corners`: cut corners in Forgeheart, rounded in Swirl / round looks (they were always pills).
141. The chips share one height (28 px) and the look's bright line.
142. Chips lift a pixel when pressed and brighten their text on hover.
143. **+ Add**, the board's one primary action, is molten-gold chrome with forge lettering (like Run in the Lab).
144. The zoom readout uses the mono figures (it doesn't jitter while zooming).
145. Keyboard focus on the chips: the forged gold ring.
146. Keyboard focus on the board itself: a soft gold inner edge.
147. The empty board's text uses the forge heading font; the icon glows softly with `/glow`.
148. The empty board rises in gently when the board opens (still with `/motion off`).
149. The minimap uses the look's line and corners (no shadow: it redraws while you move).
150. The Ctrl quick bar (→ Chat, Vibe, Open…) is the look's glass-free metal with cut corners, and pops in.
151. Search (/) is a forge pill with a gold edge while you type, and pops in.
152. The size readout under a selection uses mono figures on a solid plate (readable over pictures and notes).
153. Pointing at a reference shows a quiet gold edge (it can be picked up); not while the board moves, not on locked items.
154. Pointing at a frame lights its title gold.
155. Frame titles use the forge heading font, in capitals.
156. Clip / GIF badges use mono figures with cut corners.
157. Stamps are molten gold with the forge font.
158. Website cards: the title bar in the heading font with a hairline above it.
159. The ↗ on a website card: rounded to the look and a gold ring for the keyboard.
160. Alignment guides use the look's hot color (they were a fixed pink).
161. The selection marquee uses the look's gold at 85 %.
162. Drop target: a soft gold edge and inner glow instead of a hard 3 px ring.
163. The "Drop to add to …" label: forge font, the look's pill / cut corners.
164. Presentation captions: the forge font.
165. The compare view (two references) fades in; its buttons follow the look's corners.
166. The vibe card: the palette bar follows the look's corners with a hairline.
167. The vibe card's meters run ember → gold.
168. The vibe card's words column uses mono figures.
169. The vibe text uses the mono font in a bordered well.
170. Light looks: soft shadows on pictures, notes, websites and color cards (they were made for dark grounds).
171. Forgeheart Classic keeps its own colors on + Add (gold text, no chrome).
172. Opening a picture or clip large (View large / Watch large) fades in; its title is in the forge heading font.
173. Pointing at a reference shows the grab hand (it can be dragged); text you're editing keeps the text cursor.

## G. The board drawer (Ctrl+Shift+M, over any chat)
174. The drawer is forged iron with a gold hairline on top (Forgeheart 2); Classic keeps its panel color.
175. Cut corners in Forgeheart, the look's radius elsewhere.
176. The board icon in its head.
177. The board picker and search share one 28 px height and the look's line.
178. Its buttons share one height, the look's line and corners.
179. Search lights its edge gold while you type.
180. The vibe strip lights its edge when you point at it (click or drag it into a chat).
181. References lift a pixel under the pointer.
182. Keyboard focus on a reference: the gold edge and ring.
183. The → on a reference is molten gold with dark ink.
184. Reference labels (picture / clip / note) use mono figures.
185. The foot has the look's bright line and a fixed height.
186. "Link to this chat" reads in gold text.
187. Light looks: a lighter drawer shadow.
188. `/motion off` and reduced motion: the drawer appears without sliding.
189. A reference dragged over a chat box: the box says "Drop: attach its vibe (not the file)" in a gold pill.

## H. The video editor (Video Review › ✂)
190. The editor bar: one 28 px row, buttons at one height.
191. EDIT in the forge heading font, in capitals, with the editor icon glowing softly.
192. The clip / duration summary in mono figures.
193. The format chip (9:16 · 30 fps) is a bordered chip with the look's corners.
194. ⇪ EXPORT in the forge font.
195. The auto-cut suggestion pill uses the look's info color and corners.
196. The clip track: the look's bright line with a forged inset shadow.
197. Keyboard focus on the track: a gold edge.
198. Light looks: the track's inset shadow is lighter.
199. The playhead is the look's bright gold with a glow that follows `/glow`.
200. Opening the editor: the bar and track rise in (hx-rise, like the rest of the app).
201. The inspector slides in from the right.
202. The inspector's clip name stays on top while you scroll its sections.
203. … on forged metal in Forgeheart 2.
204. The inspector's sections fold with a gold › that turns (not the browser's triangle).
205. Section titles light gold for the keyboard.
206. Keyframe ◆ and ‹ › buttons: a gold ring for the keyboard.
207. The inspector's selects and fields share one 24 px height.
208. Its color wells use the look's line and corners.
209. The inspector's border uses the look's bright line.
210. The transport's ✂ when the editor is open: molten-gold chrome in every look.
211. The program frame: a cut-corner hairline frame with a faint gold halo in Forgeheart.
212. Light looks: EDIT, ＋, ⇪ EXPORT and the inspector's clip name use the darker gold text tone (they were pale gold on pale metal).
213. While you edit, notifications rise above the editor's bar and track (they sat on ⇪ Export, ⋯ and ✕).

## I. Capture in the look
214. The captures library's tabs (All / Pictures / Videos): the app's segmented control — the "on" tab was gold on dark metal with dark text and read as an empty box.
215. The annotation tools' "on" state: the same lit style.
216. Dialog titles (Captures, a capture's name) in the forge heading font.
217. Their buttons share the look's line and corners (cut in Forgeheart).
218. The library search has the app's field height.
219. Capture cards lift a pixel under the pointer.
220. Keyboard focus on a card: the gold edge and ring.
221. Card dates use mono figures.
222. Cards, the viewer stage and frame cells follow Forgeheart's square corners.
223. The player's scrubber follows `/corners`, ember → gold fill.
224. The timecode in the look's gold text tone.
225. The viewer stage has a hairline frame.
226. The viewer is forged iron with a gold hairline (Forgeheart 2).
227. The annotation dialog's title is "Annotate" (it showed ◆ and ✎ side by side).
228. Frame-reader results: cells lift and get a gold edge under the pointer.
229. Frame-reader text in mono figures in a bordered well.
230. Pickers (tours, social frames, backgrounds): codes in mono figures, gold when you point at the row.
231. Picker rows: the look's corners, a gold bar for the keyboard.
232. The annotation toolbar: bordered with cut corners; tools highlight on hover.
233. The color swatch in annotation: a gold ring for the keyboard.
234. The region picker's tip: the forge font with a gold edge, popping in.
235. Keyboard rings on the board's quick bar, its search and the captures library's tabs.
236. The system's reduced-motion setting stills every entrance above (like `/motion off`).
237. The system's "more contrast" setting gives the board chips, the drawer, the editor's format chip and the capture tabs full-strength edges.

## J. Smoothness (measured with `dev/checks/polish8-smooth.js`, before → after on the same machine)
(Under Xvfb + SwiftShader on a shared machine the frame rates swung 17–50 fps between identical runs, so they can't
show a few-percent change either way. What the probe does show reliably: the menu over a playing clip and the capture
viewer had `blur(16px)` / `blur(3px)` backdrops in round 7 and have none now, and board panning / zooming with 20
references stayed in the same range — no regression from this pass. Idle stays at 0 animations, 0 DOM writes
(`smooth-app.js`).)
238. A dialog that plays a video (the capture viewer) no longer re-blurs the app behind it every frame (its glass is a solid forged panel, its backdrop a darkened gradient).
239. A menu opened over the board, the program monitor or a playing capture drops its live blur (it was set to re-blur moving pictures when the look's glass is on).
240. In light looks such a menu is solid (without the blur, the busy board or timeline showed through it).
241. The board's chip only rewrites itself when the board's name or lock changes (it was rewritten on every view change, over the moving board).
242. The minimap carries no shadow or clip (it redraws while you move).

## K. Fixes found on the way
243. **The editor's program monitor showed through other tools**: after editing in Video Review, the Lab (or any tool) had the edit's frame painted over it (`visibility: visible` beat the hidden surface). Fixed.
244. The same for Video Review's library drawer in a narrow window.
- (Also counted above: the captures library's unreadable selected tab, 214; capture's keys missing from the sheet, 115.)

## Chat commands
- `/tidy [board|editor|drawer]` (area Look), counted as 101.

## Tested
- `node --check` on every touched file.
- `dev/checks/polish8.js`: every board / editor / capture / drawer / Lab ⋯ menu ends with Customise this… with More… / Delete right above it, no doubled separators, icons in the capture menu and no emoji left, the drawer tucked and out of the page when closed, the editor bar's Undo behind Alt, the editor monitor hidden while the Lab shows, the keys sheet's areas (Board, Editor, Capture) and icons, `/tidy`, no duplicate commands.
- Picture tours (`polish8-tour.js`, `polish8-tour2.js`) in **Forgeheart 2**, **Forgeheart Classic** and **Forge Light**: the board (empty, references, Alt handles, Ctrl quick bar, search, vibe card, menus), the drawer, the editor (bar, clip menu, ⋯, format, export, add, inspector, Alt reveal), capture (menu, library, card menu, viewer, player of a real recording, tours picker, annotation, frame reader), the keys sheet, the rail ⋯ and Lab ⋯ menus.
- Round 7 and earlier checks: `declutter.js`, `board.js` (after `sh dev/board-fixtures.sh`), `capture-shots.js`, `editor-more.js`, `polish.js`, `qa-commands.js`, `smooth-app.js`.
