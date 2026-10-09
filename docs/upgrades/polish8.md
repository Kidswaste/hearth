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
| **All surfaces in declutter-count.js** | **118** | **109** | **172** |

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
33. Settings is the last row of the capture menu.
34. Holding Alt while a capture menu opens still shows every row (no More…), now in the app's menus.

## B. Icons: one set, drawn in the look's gold
35. Menu rows can carry an icon (any menu in the app): drawn first, in the look's gold, a soft glow when you point at the row.
36. Same verb, same icon everywhere: **Look** (sparkles).
37. **Arrange** (a grid).
38. **Send … to a chat** / **Ask a chat** (a speech bubble with an arrow).
39. **Export** (an arrow leaving a tray).
40. **Present** (a screen with a play mark).
41. **Vibe** (three overlapping color drops).
42. **Customise this…** (sliders), in every menu of the app.
43. Video projects: **Sequence ›** and **Template ›** in the editor carry the film-strip icon.
44. **Tours ›** carries the route icon (a dotted path to a flag).
45. **Read frames** carries the frames icon (three offset frames).
46. **Snapshots ›** / **Recent ›** carry the recent icon.
47. Capture menu: **Screenshot of this tool / Screenshot of ›** — the camera icon (was 📷).
48. **Social frame ›** — the phone-frame icon (was ⬚).
49. **Beautified ›** / **Beautify ›** — sparkles (was ✨).
50. **Record Hearth / Record ›** — the record icon (was ●).
51. **Stop recording** — the stop icon (was ■).
52. **Marker here** (while recording) — the timecode icon (was ◆).
53. **Captures** — the grid icon (was ▦).
54. **Annotate** — the pen icon (was ✎).
55. **Make ›** — scissors (was ✂).
56. **Open / Play** a capture — the camera / play icons (were 🖼 / ▶).
57. **Recent** captures — film / camera icons per row (were 🎬 / 📷).
58. Rail ⋯ menu: **Notes**, **Memory**, **All side by side**, **Ask-all bar**, **Import past chats**, **Capture** show the same SVG icons as their rail buttons (were 🗒 🧠 ▦ ⌨ ⇪ ◉).
59. The Capture rail button (hidden in the ⋯; pin it on screen with Customise this…) shows the capture icon instead of ◉.
60. The board's **Boards chip** shows the board icon (the lock icon when the board is read-only) instead of ▦ / 🔒.
61. The editor bar's title: the **editor icon** + EDIT (or the sequence's name) instead of "✂ Edit".
62. The board drawer's head: the board icon.
63. The captures library's title: the capture icon (in place of the generic ◆).
64. The empty board: the board icon above its line.
65. The empty captures library: the capture icon above its line.
66. Video Review's empty library: the film icon above its line.
67. New icon: **capture** (a viewfinder around a record dot).
68. New icon: **shot** (a camera).
69. New icon: **rec** (a ring with a dot).
70. New icon: **stop**.
71. New icon: **editor** (three lanes of clips and a playhead).
72. New icon: **cut** (scissors).
73. New icon: **film** (a video project).
74. New icon: **frames**.
75. New icon: **tour**.
76. New icon: **sparkle**.
77. New icon: **social** (a phone frame).
78. New icon: **export**.
79. New icon: **pen**.
80. New icon: **tochat** (send to a chat).
81. New icon: **keys** (a keyboard).
82. New icon: **vibe**.
83. New icon: **present**.
84. New icon: **clock** (timecode).
85. New icon: **sliders** (customise).
86. New icon: **recent**.
87. New icon: **lock** (a read-only board).
88. `Icons.svg(key)` gives other modules an icon's markup (for CSS masks: headings and empty states drawn by CSS use the same set).

## C. Less in your face (Alt / where you point), with Customise this… to pin back
89. Editor bar: **↶ Undo** waits behind Alt (Ctrl/⌘+Z, ⋯ › Undo and right-click still undo); the bar keeps ＋, the format chip, ⇪ Export, ⋯ and ✕.
90. While editing, **A|B compare** waits behind Alt (it only works on the source; the editor said so when you pressed C).
91. Board drawer: **↗ Open the whole board** waits behind Alt (right-click the drawer, or the ▦ in the rail).
92. Board drawer: **＋ Add pictures** waits behind Alt (drop or paste onto the drawer still adds).
93. Board drawer: the **→ on each reference** shows on the reference you point at (dragging it into the chat does the same).
94. Board drawer: the **reference count** shows when you point at the drawer.
95. The **closed drawer is out of the page**: Tab no longer walks into it and screen readers no longer read it (it was only slid off screen).
96. `/tidy [board|editor|drawer]`: what these surfaces tuck away and how to get each back (pin one with `/pin-control <name>`, everything with `/calm off`).
97. The empty board teaches in one line ("Drop pictures, clips or links — or paste, or + Add") with a whisper under it ("Right-click for everything else").
98. The empty drawer says what it's for in one line ("Drop or paste references here — they give chats a vibe, never the footage").
99. Video Review's empty notes: one line ("Pause where something should change and press N (D draws on the frame).") instead of three sentences.
100. The empty captures library: one line ("No captures yet: Ctrl/⌘+Alt+S, or /shot in any chat.").
101. The captures library's hint: one line ("Double-click opens · right-click for more · drag it into a chat"; Alt+click is in the keys sheet).

## D. Right-click used more
102. Right-click the **Boards chip** on the board: the boards menu.
103. Right-click **+ Add**: the add menu.
104. Right-click the **zoom chip**: the view menu.
105. Right-click the editor bar's **＋**: the add menu.
106. … its **format chip**: the format menu.
107. … **⇪ Export**: the export menu.
108. Right-click the **empty part of the editor bar**: the editor's ⋯ menu.
109. Right-clicks on ✕ / ↶ in the editor bar don't open the browser's own menu.

## E. The keys sheet (the keys button, bottom left)
110. **Capture's keys finally reach the sheet**: about 60 lines (Ctrl/⌘+Alt+S / A / R / P / V / T, the player, the region picker, annotation, the library) were registered with a lookup that never found the keys list.
111. The **editor's keys** are listed from the start (before, only after Video Review had been opened once).
112. With the editor open, the sheet starts with **Editor**, then Video Review.
113. On the board, the sheet starts with **Board**, then Capture.
114. With the board drawer open over a chat, the Board lines join the chat's.
115. Capture's keys (they work anywhere) come right after the global ones, not at the bottom.
116. Every area heading carries its icon (Board, Editor, Capture, Video Review, Lab, Chat box, Director dock, Nodes, Notes, Command bar, …).
117. New line: **Home / End** — first / last frame of the edit.
118. New line: **Ctrl/⌘+D** — duplicate the selected clip.
119. New line: **Ctrl/⌘+Y** — redo.
120. New line: **Ctrl/⌘+= / Ctrl/⌘+−** — zoom the timeline.
121. New line: **?** — the editor's keys in one list.
122. New line: **Double-click** in the editor — a clip's inspector, a title's text, a marker on the ruler.
123. New line: **Esc** in the inspector — close it.
124. New line: **Right-click the editor bar** — its menus.
125. New line: **Right-click a board chip** — its menu.
126. New line: **Esc** in the board drawer — close it.
127. New line: **0** in the capture viewer — fit the picture.
128. New line: **Right-click (rail ⋯ › Capture)** — the capture menu; Alt shows every row.
129. Hold Ctrl/⌘ over the capture viewer: badges on **Copy (C)**, **Annotate (A)**, **→ Chat (Enter)**, **▶ (Space)**, **◀| / |▶ (, .)**, **Read (R)**, **✕ (Esc)**.
130. Hold Ctrl/⌘ on the board: a **Shift+1** badge on the zoom chip (zoom to fit).
131. Hold Ctrl/⌘ in the editor: an **E** badge on its ✕.

## F. The mood board in the Forgeheart look
132. The chips over the board follow `/corners`: cut corners in Forgeheart, rounded in Swirl / round looks (they were always pills).
133. The chips share one height (28 px) and the look's bright line.
134. Chips lift a pixel when pressed and brighten their text on hover.
135. **+ Add**, the board's one primary action, is molten-gold chrome with forge lettering (like Run in the Lab).
136. The zoom readout uses the mono figures (it doesn't jitter while zooming).
137. Keyboard focus on the chips: the forged gold ring.
138. Keyboard focus on the board itself: a soft gold inner edge.
139. The empty board's text uses the forge heading font; the icon glows softly with `/glow`.
140. The empty board rises in gently when the board opens (still with `/motion off`).
141. The minimap uses the look's line and corners (no shadow: it redraws while you move).
142. The Ctrl quick bar (→ Chat, Vibe, Open…) is the look's glass-free metal with cut corners, and pops in.
143. Search (/) is a forge pill with a gold edge while you type, and pops in.
144. The size readout under a selection uses mono figures on a solid plate (readable over pictures and notes).
145. Pointing at a reference shows a quiet gold edge (it can be picked up); not while the board moves, not on locked items.
146. Pointing at a frame lights its title gold.
147. Frame titles use the forge heading font, in capitals.
148. Clip / GIF badges use mono figures with cut corners.
149. Stamps are molten gold with the forge font.
150. Website cards: the title bar in the heading font with a hairline above it.
151. The ↗ on a website card: rounded to the look and a gold ring for the keyboard.
152. Alignment guides use the look's hot color (they were a fixed pink).
153. The selection marquee uses the look's gold at 85 %.
154. Drop target: a soft gold edge and inner glow instead of a hard 3 px ring.
155. The "Drop to add to …" label: forge font, the look's pill / cut corners.
156. Presentation captions: the forge font.
157. The compare view (two references) fades in; its buttons follow the look's corners.
158. The vibe card: the palette bar follows the look's corners with a hairline.
159. The vibe card's meters run ember → gold.
160. The vibe card's words column uses mono figures.
161. The vibe text uses the mono font in a bordered well.
162. Light looks: soft shadows on pictures, notes, websites and color cards (they were made for dark grounds).
163. Light looks: clip badges stay readable.
164. Forgeheart Classic keeps its own colors on + Add (gold text, no chrome).

## G. The board drawer (Ctrl+Shift+M, over any chat)
165. The drawer is forged iron with a gold hairline on top (Forgeheart 2); Classic keeps its panel color.
166. Cut corners in Forgeheart, the look's radius elsewhere.
167. The board icon in its head.
168. The board picker and search share one 28 px height and the look's line.
169. Its buttons share one height, the look's line and corners.
170. Search lights its edge gold while you type.
171. The vibe strip lights its edge when you point at it (click or drag it into a chat).
172. References lift a pixel under the pointer.
173. Keyboard focus on a reference: the gold edge and ring.
174. The → on a reference is molten gold with dark ink.
175. Reference labels (picture / clip / note) use mono figures.
176. The foot has the look's bright line and a fixed height.
177. "Link to this chat" reads in gold text.
178. Light looks: a lighter drawer shadow.
179. `/motion off` and reduced motion: the drawer appears without sliding.
180. A reference dragged over a chat box: the box says "Drop: attach its vibe (not the file)" in a gold pill.

## H. The video editor (Video Review › ✂)
181. The editor bar: one 28 px row, buttons at one height.
182. EDIT in the forge heading font, in capitals, with the editor icon glowing softly.
183. The clip / duration summary in mono figures.
184. The format chip (9:16 · 30 fps) is a bordered chip with the look's corners.
185. ⇪ EXPORT in the forge font.
186. The auto-cut suggestion pill uses the look's info color and corners.
187. The clip track: the look's bright line with a forged inset shadow.
188. Keyboard focus on the track: a gold edge.
189. Light looks: the track's inset shadow is lighter.
190. The playhead is the look's bright gold with a glow that follows `/glow`.
191. Opening the editor: the bar and track rise in (hx-rise, like the rest of the app).
192. The inspector slides in from the right.
193. The inspector's clip name stays on top while you scroll its sections.
194. … on forged metal in Forgeheart 2.
195. The inspector's sections fold with a gold › that turns (not the browser's triangle).
196. Section titles light gold for the keyboard.
197. Keyframe ◆ and ‹ › buttons: a gold ring for the keyboard.
198. The inspector's selects and fields share one 24 px height.
199. Its color wells use the look's line and corners.
200. The inspector's border uses the look's bright line.
201. The transport's ✂ when the editor is open: molten-gold chrome in every look.
202. The program frame: a cut-corner hairline frame with a faint gold halo in Forgeheart.
203. Light looks: EDIT, ＋, ⇪ EXPORT and the inspector's clip name use the darker gold text tone (they were pale gold on pale metal).

## I. Capture in the look
204. The captures library's tabs (All / Pictures / Videos): the app's segmented control — the "on" tab was gold on dark metal with dark text and read as an empty box.
205. The annotation tools' "on" state: the same lit style.
206. Dialog titles (Captures, a capture's name) in the forge heading font.
207. Their buttons share the look's line and corners (cut in Forgeheart).
208. The library search has the app's field height.
209. Capture cards lift a pixel under the pointer.
210. Keyboard focus on a card: the gold edge and ring.
211. Card dates use mono figures.
212. Cards, the viewer stage and frame cells follow Forgeheart's square corners.
213. The player's scrubber follows `/corners`, ember → gold fill.
214. The timecode in the look's gold text tone.
215. The viewer stage has a hairline frame.
216. The viewer is forged iron with a gold hairline (Forgeheart 2).
217. The annotation dialog's title is "Annotate" (it showed ◆ and ✎ side by side).
218. Frame-reader results: cells lift and get a gold edge under the pointer.
219. Frame-reader text in mono figures in a bordered well.
220. Pickers (tours, social frames, backgrounds): codes in mono figures, gold when you point at the row.
221. Picker rows: the look's corners, a gold bar for the keyboard.
222. The annotation toolbar: bordered with cut corners; tools highlight on hover.
223. The color swatch in annotation: a gold ring for the keyboard.
224. The region picker's tip: the forge font with a gold edge, popping in.

## J. Smoothness (measured with `dev/checks/polish8-smooth.js`, before → after on the same machine)
225. A dialog that plays a video (the capture viewer) no longer re-blurs the app behind it every frame (its glass is a solid forged panel, its backdrop a darkened gradient).
226. A menu opened over the board, the program monitor or a playing capture drops its live blur (it was set to re-blur moving pictures when the look's glass is on).
227. The board's chip only rewrites itself when the board's name or lock changes (it was rewritten on every view change, over the moving board).
228. The minimap carries no shadow or clip (it redraws while you move).
229. Nothing in this pass runs per frame: the menu shape is worked out once per menu, the keys sheet icons once per paint, one stylesheet written once.

## K. Fixes found on the way
230. **The editor's program monitor showed through other tools**: after editing in Video Review, the Lab (or any tool) had the edit's frame painted over it (`visibility: visible` beat the hidden surface). Fixed.
231. The same for Video Review's library drawer in a narrow window.
232. The captures library's selected tab was unreadable (see 204).
233. Capture's keys never reached the keys sheet (see 110).

## Chat commands
234. `/tidy [board|editor|drawer]` (area Look): see 96.

## Tested
- `node --check` on every touched file.
- `dev/checks/polish8.js`: every board / editor / capture / drawer / Lab ⋯ menu ends with Customise this… with More… / Delete right above it, no doubled separators, icons in the capture menu and no emoji left, the drawer tucked and out of the page when closed, the editor bar's Undo behind Alt, the editor monitor hidden while the Lab shows, the keys sheet's areas (Board, Editor, Capture) and icons, `/tidy`, no duplicate commands.
- Picture tours (`polish8-tour.js`, `polish8-tour2.js`) in **Forgeheart 2**, **Forgeheart Classic** and **Forge Light**: the board (empty, references, Alt handles, Ctrl quick bar, search, vibe card, menus), the drawer, the editor (bar, clip menu, ⋯, format, export, add, inspector, Alt reveal), capture (menu, library, card menu, viewer, player of a real recording, tours picker, annotation, frame reader), the keys sheet, the rail ⋯ and Lab ⋯ menus.
- Round 7 and earlier checks: `declutter.js`, `board.js` (after `sh dev/board-fixtures.sh`), `capture-shots.js`, `editor-more.js`, `polish.js`, `qa-commands.js`, `smooth-app.js`.
