# Polish stream (round 2): one designed product

Round 1 built the look system (Forgeheart 2, Classic, 31 presets, materials) at the same time as a lot of new UI (Lab rework,
FX picker, node editor, Video Review, token meter, prompt library, notes, Kit, backups…). This pass makes all of it read as one
product: the same corners, colors, control heights, focus rings, motion and materials everywhere, in every look, and tighter.

How to see it: just use the app. Everything follows **Settings → Appearance** (now `/appearance`, ⌘⇧L / Ctrl+Shift+L), `/corners`,
`/motion`, `/density`, `/glow` and every preset. Forgeheart Classic keeps its colors; it gets the layout fixes and the new UI follows it.

Files: new `polish.css` (loaded last), `tools/three-fx.css` (FX picker on theme variables), color variables in `features.css`,
`tools/three-lab.css`, `tools/video.css`, `nodes.css`, `meter.css`; `juice.js` (tooltips, die, colors); `look.js` (`/appearance`);
`renderer.js` (menu shortcut keys, 4 lines); `index.html` (one link tag); `dev/checks/polish.js` (smoke check).

## One system for every surface
1. Corners: the FX picker, node editor, Video Review, meter dashboard, Kit, notes, memory and presets now follow `/corners` (cut / square in Forgeheart, rounded with `/corners round`). Before, they were rounded in every look.
2. The Swirl look gives those same surfaces its soft round corners.
3. Importance colors are variables for all new UI (gold active, cyan info / frozen, violet AI, red stop, orange attention, green ok), so they follow every preset. About 260 hard-coded colors were replaced across the chat, Lab, Video Review, meter and node CSS.
4. Lab sliders: the changed marker, highlighted values, live / rerun badges, slider accents and the unsaved line use the look's colors.
5. Lab knobs: arcs, notches and the changed / music / turning states use the look's colors.
6. Lab timeline: volume, BPM readout, loop info, scroll thumb, lane colors (kick, snare, hit), record blink, write-armed and live-sound pulses use the look's colors.
7. Lab layers, scene editor and preview: selected layer, drop target, editor mode buttons, drop outline, frozen tint, stall banner, safe zones, compare wipe use the look's colors.
8. Chat: thinking, opinion and plan cards, suggestion chips, context-meter warning, unread dots and counts, the "New" separator, find highlights, callouts, the reading-aloud edge and style chips use the look's colors.
9. Importance buttons (main, AI, live, capture) and the "most used" glow use the look's colors.
10. Status colors everywhere (ok / bad, danger buttons, error toasts, console rows, render rows, AE banners, kanban, diffs) use the look's colors.
11. Video Review: B-version, Lab badge, tags, author and format colors use the look's colors; its gold and orange are the preset's.
12. Token meter: the live line and the Classic hover / KPI glow use the look's colors.
13. Node editor: errors, sticky notes, status line and the Code ⇄ Nodes state use the look's colors.
14. One motion tempo: shared durations and easings for hovers, presses, menus and pickers; `/motion off` sets them all to zero.

## FX picker
15. Background follows the look (it was a fixed dark grey in every preset, light ones included).
16. Corners follow `/corners`.
17. Opens with a short rise-in.
18. ★, 🎲 and × are 30 px, the same height as the search box.
19. The search box uses the look's well color and lights its edge in the active color.
20. The tab row fades at the right edge, so you can tell more tabs scroll.
21. Tabs hover with a soft plate.
22. The active tab uses the look's active color (it was a fixed yellow).
23. Stuck section headers use the picker's own background.
24. The selected row's thumbnail frame lights up and its name turns bright.
25. Long effect names end with an ellipsis instead of pushing the row.
26. Stars have a 24 px target, grow on hover and glow when on.
27. Scrolling the list never scrolls the Lab behind it.

## Motion (calm, no idle loops)
28. The OS "reduce motion" setting now reaches every look, Plain ones and the new UI included: animations end instantly.
29. `/motion calm` also stops the node wires' flow (they stay dimly lit), the meter's live line and dot, the streaming shimmers and the chat's live dot.
30. The rail's rainbow and the ask-all rainbow rest while nothing is live, and turn while a reply streams.
31. The header glint no longer runs every 14 seconds forever: one sweep when you point at a header.
32. A lit tab twinkles twice, then rests.
33. An unread agent pulses five times, then stays lit.
34. The empty-chat star dust and floating icon settle after three breaths.
35. Lab menus pop in.
36. The code-block language label fades out when the actions fade in.

## Focus and accessibility
37. Text fields show one focus ring (the gold border), not a second outline on top.
38. Sliders show keyboard focus as a ring on the knob, in every look.
39. Classic: keyboard focus on cut-corner buttons is drawn inside, so it is no longer clipped away.
40. The FX picker, Video Review, node editor, dashboard, slider group chips, presets, Appearance tiles and segmented controls get the forged focus ring.
41. The meter strip's cells show keyboard focus.
42. Hit areas: the main controls of the new UI are at least 28 px (node HUD, video icons, chat header, dialog buttons, notes and memory rows, dashboard close, prompt rows, list rows).

## Scrolling and overflow
43. Long menus (right-click, Lab menus, node menus, the palette, Appearance, agent presets) fade at the bottom while there is more below.
44. Scrolling a menu, picker or panel list never drags the page behind it.
45. Lab menus stop at a comfortable height and scroll (the trigger presets menu ran off the screen).
46. Tab bars no longer show a stray vertical scrollbar; overflowing tabs get a slim one.
47. Small panes keep a stable scrollbar gutter, so content doesn't jump when a scrollbar appears.
48. Cut-off text shows its full text on hover (chat titles, render names, effect names, slider names, menu labels…), right over it.
49. Tooltips for rows in a list or menu sit beside the list, instead of covering the rows below.

## Menus
50. Right-click menus show shortcut keys on the right in a small mono font (Rename · F2, Delete chat · Del, /find, Alt+T, /help…).
51. A danger item's key is red too.
52. Menus have a sensible minimum width, so short menus don't look cramped.
53. The "/" menu: the keyboard selection is lit, the mouse hover is a softer wash, so you can tell them apart.
54. The "/" menu footer is glass in Forgeheart 2.
55. Lab menus hover in the active color; their section heads are tinted.

## Chat
56. Slimmer composer: two lines to start (66 px instead of 84), it still grows as you type.
57. The docked director's composer is slimmer too.
58. Tighter composer padding (more room for the conversation).
59. Slimmer ask-all bar.
60. Send and 📎 Attach are the same 34 px height and line up.
61. Send glows softly while there is text to send.
62. The character counter uses even-width digits and never overlaps the frame.
63. Message footers keep one height and even-width numbers.
64. Footer actions (Copy, 🔊, ⋯) get a small hover plate; Copy hovers gold.
65. Code blocks lose their empty 30 px foot: Save / Open in Lab / ⋯ sit at the top right and swap places with the language label on hover.
66. The live "Writing…" line sits closer to the reply.
67. Day separators are hairlines that fade out, in small mono caps.
68. The find-in-chat bar is glass, with 26 px buttons.
69. Style, queue and attachment chips share one height.
70. Style chips are violet plates in Forgeheart 2.
71. The pinned-message strip is glass with a gold edge.
72. Callouts are squared to match the forge.
73. Highlights are gold.
74. "Show all" on a folded code block is a forged plate.
75. Token badges are small gold plates.
76. Chat header buttons and the model picker are one height (28 px, docked 26 px).
77. Chat list rows are at least 28 px and their token counts use even-width digits.
78. The chat list's filter chip is a cut plate.
79. Unread dots are ember diamonds with a soft glow.
80. With `/motion calm` the busy dot in the chat list stays still.

## Materials where they add delight (Forgeheart 2)
81. 🎲 Shuffle is polished chrome next to Save's molten gold: a matched pair.
82. Shuffle's ‹ › ▾ caps are chrome too.
83. Shuffle sweeps light on hover.
84. The 🎲 rolls when you press the big Shuffle button (it only rolled on a bare 🎲 before), and only the die turns.
85. Tap is a forged pad with a gold rim.
86. Tap turns gold chrome once the tempo is set.
87. Each tap also sweeps light across the pad.
88. Freeze is frosted glass with an ice edge.
89. Freeze brightens on hover.
90. Frozen, it turns to ice chrome with a cold glow.
91. Run matches the toolbar's height.
92. Export, render and record buttons show a molten edge on hover.
93. The dashboard's range control (Today · 7 days · 30 days · All) is a recessed track with gold chrome selection.
94. Code ⇄ Nodes is the same segmented control.
95. Review · Director · Toolkit is the same, with a glow on the selection.
96. The frame-size pill (Fit · 9:16 · 16:9 · 4:5 · 1:1) is the same.
97. Segmented buttons are at least 24 px tall.

## Three.js Lab
98. Toolbar groups are slimmer.
99. Toolbar buttons share one 26 px height.
100. The sketch picker is 28 px, like the buttons.
101. Less empty space above the sketch.
102. In a narrow Lab (director docked) toolbar groups wrap cleanly; Run is never clipped or split over two lines.
103. In a narrow Lab the toolbar padding shrinks.
104. 🧰 Tools ▾ is a real forged button with a light sweep, not a caps label.
105. "◭ Sketch" (back from a tool) matches it.
106. The open tool's tab is a gold plate.
107. The fps / render numbers moved to the bottom-left of the preview, so they never hide under the frame-size pill.
108. They stay on one line and fade at the edge when the preview is narrow.
109. They have a glass edge.
110. The frame-size pill is tighter.
111. "More…" frame sizes is a compact select.
112. A narrow preview keeps the frame-size pill on one row; the extras show on hover.
113. Its labels shrink a little when space is tight.
114. When the Lab stacks (narrow, sliders open), the picture comes first.
115. Fix: in a short sliders panel the head no longer squashes into the A / B / C slots row.
116. Shuffle gets the wider half of the row; long labels end with an ellipsis.
117. The ‹ › ▾ buttons are narrower.
118. Save's ▾ has a clean divider.
119. "+ Layer" and other small primary buttons fit the panel heads.
120. Slider group chips fade at the edge when they scroll.
121. Group chips are forged plates; the chosen one is gold chrome.
122. The "Changed" chip is cyan chrome when on.
123. Filled slots (A / B / C) are cyan chrome; a peeked slot is gold.
124. Numbers in sliders and the timeline use even-width digits (no jitter while they change).
125. A changed slider row gets a soft gold wash.
126. The "named sliders" tip is a forged box.
127. The timeline's main row groups share one height.
128. The loop chip is a cut plate.
129. Quantize and timeline size toggles are gold chrome when on.
130. A narrow timeline wraps its groups instead of overflowing.
131. The console head wraps instead of running off the edge; "Errors only" stays on one line.
132. Present: the key hint is a single line of glass with a gold edge.
133. Present: the info line (I) matches it.
134. Key-hint badges use the look's colors.
135. The director dock's divider is a hairline that lights on hover (it was a grey bar).
136. The director dock is brushed iron like the other panels.
137. Node preset cards, reference cards and sketch cards are forged plates.
138. References and Sketches titles match every other dialog title.
139. Their thumbnails sit in wells.
140. The open sketch is lit gold.
141. Reference action buttons are 24 px.

## Node editor
142. Nodes, frames, notes, menus and the minimap follow `/corners`.
143. HUD buttons have a 28 px target.
144. HUD buttons hover gold.
145. Node headers are forged chrome tinted by the node's color.
146. Node titles use Oxanium.
147. A light sweep crosses a node header when you point at it.
148. The selected node's glow follows `/glow`.
149. The HUD (＋, ⋯, zoom) is glass.
150. ＋ is gold chrome.
151. The node picker, menus, minimap and the "This layer is code" card are glass.
152. The node picker has a molten hairline on top and an Oxanium search.
153. Node menu items hover with a gold wash and notch.
154. Picker and menu section labels are mono gold.
155. Ports are framed in the look's iron.
156. "On" toggles in nodes use dark ink on the lit color.
157. The empty-graph card fits a narrow Lab.
158. The Code ⇄ Nodes switch is glass.

## Video Review and the AE toolkit
159. Toolbar icons are 28 px.
160. Cards, notes, the stage, the timeline and badges follow `/corners`.
161. The selected render's name turns bright.
162. Filter chips are at least 22 px.
163. The timecode field lights gold when focused.
164. Play is molten gold chrome with a sweep on hover.
165. The library and notes columns are brushed iron.
166. The selected render has a gold notch.
167. Thumbnails are framed.
168. Filter chips are forged plates; the chosen one is gold chrome.
169. Filter chips stay on one row and scroll sideways with a fade (they took three rows).
170. The stage frame follows `/glow`.
171. The video title uses Oxanium.
172. The timecode is gold.
173. Toggled tools (safe zones, guides, scopes…) are gold plates.
174. Notes are forged plates tinted by their category.
175. The note composer is a gold-edged plate with grain.
176. Scopes are glass.
177. Hover labels on the timeline and stage are glass.
178. The timeline is recessed.
179. The Toolkit drawer is brushed iron with a glass edge.
180. Its header has a molten hairline and a glowing Oxanium title.
181. Its tabs scroll without a scrollbar and fade at the edge.
182. After Effects expression and script lists show one item per line (short names used to pair up on one line).
183. List items are 28 px and end with an ellipsis.
184. The chosen expression has a gold wash and notch.
185. Category labels are mono gold.
186. Calculators fit the drawer (fields hung off the right edge).
187. Calculator titles use Oxanium.

## Token meter
188. The strip is brushed metal from the look's own iron (light looks get a light strip; it was always dark).
189. It has a bevel on top.
190. Its live line uses the preset's colors.
191. Cells hover gold.
192. Numbers use even-width digits.
193. The collapse button is 24 px.
194. The rail pill is a bevelled plate.
195. It hovers gold.
196. While a reply streams it glows violet.
197. Its bar is molten.
198. Dashboard KPI tiles are brushed plates.
199. KPI numbers are Oxanium gold with a glow.
200. Dashboard tabs have a gold underline with an ember glow.
201. Dashboard tabs never show a scrollbar track.
202. The close button is 28 px.
203. The Claude / Astra split labels stay readable on light looks.

## Prompt library, notes, memory, Kit, presets
204. Prompt rows are at least 28 px.
205. The selected prompt has a gold wash and notch.
206. Category heads stay readable while they stick.
207. Note tags and link chips are cut plates.
208. The active tag, the open note and the pin are gold chrome.
209. Notes header controls are 28 px.
210. Memory cost pills are forged plates.
211. A pinned fact has a gold edge.
212. Memory row controls are 28 px.
213. Agent preset icons are cut and chrome-lit like the rail.
214. Kit tabs fit without a scrollbar track.
215. The Kit swatch, easing canvas and palette strip follow `/corners`; the swatch glows softly.
216. The easing canvas is a well with a gold dot.
217. The contrast ratio uses Oxanium gold.
218. Kit chips lift a little on hover.
219. The Forge Debug stat watch is glass.
220. The memory "heavy" pill and the Kit pass / fail badges use the look's colors.

## Dialogs, toasts, palette, Appearance
221. Dialogs are denser in Forgeheart 2 (smaller gaps and padding).
222. Dialog inputs are 34 px instead of 38.
223. Dialog buttons are 34 px.
224. Small buttons in dialogs keep a 28 px target.
225. Notifications sit above the composer's Send button instead of on top of it.
226. Notifications have one height; long ones stop after three lines.
227. The × on a notification is 22 px.
228. Palette rows are a little shorter, so more fit.
229. Pointing at a palette row gives a soft wash (the keyboard selection stays the bright one).
230. Appearance tiles are forged plates with a light sweep on hover.
231. The chosen look glows gold.
232. Appearance group labels are mono gold.
233. Click sparks on notifications use the look's colors (error red, info gold).

## Light looks (Forge Light, Chrome Light, Parchment, Frost Light)
234. The Lab preview, video stage, thumbnails, FX thumbnails and the timeline stay dark "islands", so their badges, overlays and labels keep contrast.
235. The song timeline is a dark well (lane labels and the waveform were drawn for dark).
236. Freeze keeps its ice blue on the dark preview.
237. Menus, pickers, toasts and nodes cast softer shadows.
238. The node canvas uses the light iron.
239. Green "ok" text is darker for contrast; dark ink on lit fills stays readable.

## Density
240. `/density compact` also tightens the FX picker, Video Review cards, slider rows, KPI tiles, menus and lists, the timeline, the Lab pane and the meter strip.
241. `/density comfortable` adds air to the FX picker, slider rows and lists.

## Chat commands
242. `/appearance` (also `/appear`, `/ui-look`) opens the Appearance picker. The Lab's `/look` (saved slider looks) had taken the name, so the picker could not be opened from chat; all hints now say `/appearance`.

Total: 242.

## Notes
- Tested with `node dev/smoke.js --script dev/checks/polish.js` (tokens, /appearance, menu keys, /corners, /motion calm, full-text tooltips, Shuffle die: ok, no page errors) and screenshots of every surface in Forgeheart, Classic, Forge Light and Neon Anvil at 1280×800, plus 1024×700 with the director docked.
- Not changed: Classic's colors and materials. Layout fixes (composer, code blocks, menus, toasts) apply in every look.
