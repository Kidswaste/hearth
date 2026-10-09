# Declutter stream (round 7): less in your face, more under the pointer

You asked for "less info directly in my face and more submenus, while keeping a high amount of customisability",
for buttons hidden behind Alt and Ctrl with a keys button bottom left, and for more right-click. This pass does that
across the chats, the chat panel, the rail, the Three.js Lab, the director dock, notes, memory and the menus
themselves. **Nothing was deleted.** Every control that left the screen still works: hold **Alt** (⌥) and it comes
back in place with a dashed outline, point at its area, right-click the area, use its key, the palette (Ctrl/⌘+K)
or a `/command`. Your most-used controls stay one click away: Lab **Save**, **Shuffle**, **Tap**, **Freeze**, the
**frame sizes**, **Live sound**, **Run**, **Sliders**, **Console**, **Edit**, **Present**, and the director chat.

How to use it, in four lines:
- **Hold Alt (⌥)**: the tucked buttons show where they were. **Tap Alt twice**: they stay until Esc (or two more taps).
- **Hold Ctrl (⌘)**: every button that has a key shows it in a small badge.
- **Right-click** anything: its menu, short, with `›` rows that open into the detail. Every menu ends with
  **Customise this…**: pin a tucked button back on screen, tuck it again, hide a button, or show everything.
- **The keys button** (bottom left, the small keyboard, or Ctrl/⌘+/): every key, reveal and right-click menu,
  what applies where you are first, searchable; click a line to do it.

Chat commands: `/shortcuts [word]` (aliases `/keysheet`, `/cheatsheet`), `/reveal [on|off]`, `/calm [on|off]`,
`/customise [area]` (`/customize`), `/pin-control <name>`, `/unpin-control <name>`, `/rightclick [lab|chat|rail|…]`.
`/calm off` brings the old, full screen back at once.

Counting: one line per thing you can see or use. Section F lists every line of the keys sheet I registered (the
existing keys of the app, now findable and clickable in one place); those are real, working lines, but if you'd
rather count them as groups, F has 17 groups.

## Before / after: visible controls per surface
Counted by `node dev/smoke.js --fake-engines --script dev/checks/clutter.js` (the round 4 counter) on a fresh
install, before this stream and after. A control that only shows while you point at its area counts as hidden here
(the counter checks `visibility`); the composer counts its ⚇ / 📎 because the chat box has the focus in the test.


| Surface | Before | After |
|---|---:|---:|
| Rail (besides agents / tools) | 6 | 5 (with the new keys button) |
| Chats panel | 2 | 1 (⏷ filter shows when you point at the search) |
| Chat header (empty / with a chat) | 1 / 2 | 1 / 1 (context size on hover) |
| Composer | 4 | 4 while you type in it, 2 otherwise (⚇ and 📎 on hover / focus) |
| Message actions (a reply / your message) | 2 / 2 | 2 / 0 (older messages: on hover; the last one keeps Copy and ⋯) |
| Message ⋯ menu | 7 | 5 (Copy, Read aloud, Reply ›, Mark ›, Copy & save ›) |
| Chat ⋯ menu | 8 | 7 (New chat, Compact, Model ›, View ›, Organise ›, Copy & export ›, Delete) |
| Lab toolbar | 12 | 9 |
| Lab preview pill | 9 | 9 (your frame sizes, Freeze, Still stay) |
| Lab timeline | 9 | 6 (Tap / Live / Presets / Auto bars / Triggers stay) |
| Lab layers | 5 | 4 |
| Lab sliders panel | 10 | 4 (Shuffle and Save stay big) |
| Lab ⋯ menu / preview ⋯ menu | 9 / 8 | 6 / 6 |
| Video Review | 38 | 25 |
| Director dock | 13 | 5 |
| Settings, Appearance, FX picker, nodes | 11, 7, 6, 7 | unchanged |
| **Total (clutter.js)** | **183** | **136** |

`dev/checks/declutter-count.js` counts the same surfaces with everything out (`/calm off`) and tidy, in one run:
rail 7 → 5, chats panel 6 → 3, chat header 2 → 1, older message feet 8 → 0, Lab toolbar row 24 → 18, Lab preview 10 → 10,
Lab timeline 9 → 6, layers 5 → 4, sliders head 10 → 4, console head 5 → 1, director dock 13 → 5: **99 → 57**.


## A. Menus that branch (the app menu, #menu, renderer.js)

1. Submenus open in place with a "‹ back" row that names where you came from (any menu item with `items`).
2. Point at a `›` row for a moment: its items open beside the menu (a flyout); click there to run one directly.
3. The flyout flips to the left near the window edge.
4. Submenus slide in from the right, going back slides in from the left; the flyout eases in.
5. ↑ / ↓ move a gold highlight through any menu (it never steals the chat box’s focus).
6. Home / End jump to the first / last item.
7. Enter (or Space on a highlighted row) runs it.
8. → opens the highlighted submenu.
9. ← or Backspace goes back out of a submenu.
10. Esc closes the menu and nothing else (it no longer also stops a reply or a jam behind it).
11. Short menus: typing a letter jumps to the first item that starts with it (again: the next one).
12. Long menus (9+ items) get a "Type to filter…" field; typing anywhere goes into it.
13. The filter also finds the items of the submenus, shown as "Reply › Quote in my message".
14. Enter runs the first match; "Nothing matches" says so.
15. Esc in the filter clears it first, then closes.
16. ✓ on checked items (model, sort order, frame size, guides, chips on screen…).
17. A quiet hint after a label (the current model, a count, "free" for local quick asks).
18. Keys on the right of an item come from a `key` field as well as "Label  Key".
19. Thin separators and small headings inside #menu.
20. Disabled rows look disabled.
21. "More…" is now a submenu with its count and a way back (it used to replace the menu).
22. Menus open over modal dialogs (Settings, Memory, /help…): they live in the top layer and move into the open dialog so they can be clicked (the memory expiry menu was hidden under its dialog before).
23. A menu near the top / left edge stays on screen.
24. Resizing the window closes an open menu instead of leaving it floating.
25. An item that fails shows the error as a toast instead of failing silently.
26. Lab menus (the two-column ones): `[label, hint, [...]]` opens a submenu in place with ‹ back.
27. Long Lab menus fold every section after the first into one "Section ›" row (the slider, layer, sliders ⋯, Live, Presets… menus).
28. A folded section of one item stays inline.
29. Long Lab menus get the filter field too.
30. Lab menus: ↑ ↓ Enter → ← Esc like the app menu.
31. Lab menus open over dialogs too (the sketch browser’s card menu).

## B. Menus regrouped: fewer, more open entries (each item’s new home)

32. Message ⋯ / right-click a message: **Copy** and **Read aloud** stay first.
33. Message: Quote in my message → Reply ›.
34. Message: Edit and resend → Reply › (↑ still edits your last message).
35. Message: Branch: new chat from here → Reply ›.
36. Message: Retry → Reply ›.
37. Message: Retry with another model → Reply › (a submenu of models).
38. Message: Review (check its own result) → Reply ›.
39. Message: Second opinion from Astra → Reply › (with its key, Ctrl+Alt+O).
40. Message: Pin → Mark › (✓ when pinned).
41. Message: Bookmark → Mark › (✓ when bookmarked).
42. Message: React → Mark › React › (✓ on your reaction).
43. Message: Feedback note → Mark ›.
44. Message: Copy as plain text → Copy & save ›.
45. Message: Copy its thinking → Copy & save ›.
46. Message: Copy "/jump n" → Copy & save ›.
47. Message: Save as a Markdown file → Copy & save ›.
48. Message: Save to notes → Copy & save ›.
49. Message: Show the Markdown source → Copy & save ›.
50. Chat ⋯ / right-click the header: **New chat** and **Compact context** stay first.
51. Chat: the model list is a Model › submenu with ✓ on the current one and the current model as a hint.
52. Chat: Find in this chat → View › (Alt+F).
53. Chat: Open / close all thinking → View › (Alt+T).
54. Chat: Fold all long replies → View ›.
55. Chat: Unfold all replies → View ›.
56. Chat: Jump to the first message → View ›.
57. Chat: Read the last reply aloud → View › (Alt+R).
58. Chat: Chat stats → View ›.
59. Chat: Chat commands… → View ›.
60. Chat: Rename… → Organise ›.
61. Chat: Pin to top → Organise › (✓).
62. Chat: Tags and folder → Organise ›.
63. Chat: Duplicate this chat → Organise ›.
64. Chat: Continue with another agent → Organise ›.
65. Chat: Copy as Markdown → Copy & export ›.
66. Chat: Copy the last reply → Copy & export ›.
67. Chat: Export as Markdown file → Copy & export ›.
68. Chat: Export as JSON → Copy & export ›.
69. A chat in the list (right-click): **Open**, **Pin to top** (✓) and **Rename** (F2) first.
70. Chat row: Tag… → Organise ›.
71. Chat row: Move to folder… → Organise › (the current folder as a hint).
72. Chat row: Archive / Unarchive → Organise ›.
73. Chat row: Mark as read / unread → Organise ›.
74. Chat row: Copy as Markdown → Copy & export ›.
75. Chat row: Duplicate → Copy & export ›.
76. Chat row: Export… → Copy & export ›.
77. Chat row: Continue with Astra / Claude → Continue with ›.
78. Agent in the rail (right-click): Open (with its Ctrl+n), New chat, then Recent chats › (its last 10 chats, newest first).
79. Agent: Move up / down → Move ›, which also has To the top and To the bottom.
80. Tool in the rail (right-click): Open, its director chat, Move › (up / down), Hide from the rail.
81. Lab ⋯: Screenshot and Copy a screenshot → Capture › (with Contact sheet).
82. Lab ⋯: the console mode is a Console › submenu with ✓ (it cycled before).
83. Lab ⋯: Insert snippet, three.js version and Live code → Code › (the version and "live" as a hint).
84. Lab ⋯: Key hints on hover is a ✓ item.
85. Lab ⋯: Lab keys opens the keys sheet.
86. Preview ⋯: the frame rate is a Frame rate › submenu (the current rate as a hint).
87. Right-click the Lab picture: Freeze first, then Frame size › (Fit, 9:16, 16:9, 4:5, 1:1 with ✓ and Shift+n, safe zones).
88. Picture: Capture › (still at the frame size, copy this frame, screenshot, pin to compare, contact sheet, note).
89. Picture: Sliders › (Shuffle, the shuffle before, save into the code, save as a look, next look).
90. Picture: View › (Present, Stage window, Focus, Guides › with each guide by name).
91. Picture: Restart and Lab keys at the end.
92. A layer’s right-click menu: Opacity › and Blend › (they were two long sections).
93. A layer: Plays › (the whole song / only during the loop), the actions of the two timing buttons that are now behind Alt.
94. A slider’s right-click menu: History › and Moves › when it gets long.
95. Sliders ⋯: the display options fold into Show ›.
96. The dock’s ✦ menu: the quick asks first (local ones marked "free"), then Undo / Redo with their keys.
97. Dock ✦: Quick chips › (show them on screen ✓, add one, remove your own).
98. Dock ✦: Dock › (Width › with ✓, Collapse with Alt+Shift+D).

## C. Right-click on what you point at (declutter.js), each ending with Customise this…

99. A message: its menu (above) at the pointer.
100. A code block in a reply: Copy the code.
101. Code block: Save as a file / Open in Three.js Lab / Shader playground / Run in After Effects / Nodes, whichever apply.
102. Code block: Insert in my message (fenced).
103. Code block: Show every line (folded code).
104. Code block: More › Copy as a quote, the code’s own ⋯.
105. A link in a reply: Open, Copy the link, Copy its text.
106. A picture in a reply: Open, Copy the picture, Copy its address.
107. A thinking block: Open / close it, open / close every thinking block (Alt+T), Copy the thinking.
108. The ↓ jump button: Latest message, First message, how to jump between your own messages.
109. The chat header and the chat’s empty space: the chat menu (above) at the pointer.
110. Around the chat box: 📎 Attach files…
111. Chat box: Paste (from the clipboard).
112. Chat box: Commands › (your recent ones, All commands).
113. Chat box: Prompt library…
114. Chat box: ⚇ Work with Astra…
115. Chat box: ■ Stop the reply (while one is being written).
116. Chat box: Clear the message (when there is one).
117. An attachment waiting in the chat box: Remove it, Remove every attachment, Attach more.
118. The rail’s empty space (and ☰ ⋯ ⚙): Add an agent or website.
119. Rail: Command palette (Ctrl+K), Command bar (Ctrl+;).
120. Rail: Panels › Chats panel ✓, Notes, Memory, All side by side ✓, Ask-all bar ✓.
121. Rail: Your usage, Import past chats, Settings.
122. A group in the chats list: New chat, Collapse / expand, the agent › (Open, Edit, Move up / down).
123. The chats list’s empty space: Search chats, Filter…, Sort › (newest, oldest, by title ✓), Import, Hide the panel.
124. The Lab toolbar: ▶ Run.
125. Lab toolbar: Sketch › (Your sketches, New from a template, Next / Previous sketch, Copy all the code, Restart).
126. Lab toolbar: Show › (Code, Console, Present, Stage window, Palettes, References, Tools drawer).
127. Lab toolbar: Capture › (screenshot, copy, contact sheet, snapshot the window into the chat).
128. Lab toolbar: Effects & layers… (X), Lab keys (?).
129. The sliders panel: 💾 Save into the code (Ctrl+S), 🎲 Shuffle (R).
130. Sliders: Shuffle › (the shuffle before, options).
131. Sliders: Looks › (save as a look, next look, your saved looks by name).
132. Sliders: Slots › (recall A / B / C, store in A / B / C).
133. Sliders: Values › (undo, back to the code, copy the values, find a slider).
134. Sliders: Ask the director › (named sliders, the asks).
135. The layers panel: Add a layer, the effects picker (X), everything in it (Shift+X), how to hide layer n.
136. The console: Ask the director to fix it, Copy everything, Clear, Errors only ✓, Shows › (✓), Hide.
137. The timeline’s buttons: Play / pause, Load audio / video, Live sound on / off, Triggers, Trigger presets, Auto bars, Note.
138. Timeline: Song › (mark the sections, loop this bar, click track, quantize taps, next snap, mute, all controls).
139. Timeline: Timeline size › (full ✓, compact, strip).
140. The director dock (strip, chips, thin bar, empty space): the ✦ menu at the pointer.
141. A row of the director’s tool-call list: Copy this line, Copy what it said, Clear the list.
142. A tool’s header: its director chat, Snapshot the window, Move in the rail ›, Hide from the rail.
143. A notification: Copy the text, Dismiss, Dismiss all.
144. Notes: Send to Claude, Copy the note, Pin, Save as a file, New, Today’s note, Export all, Close, Delete.
145. A memory fact: Pin / Unpin, Edit, Copy the fact, Expires…, Forget.
146. The keys button: the sheet, Show the tucked buttons ✓, Key badges while Ctrl is held ✓, Customise ›, Show everything ✓.
147. The Lab picture over sketches with OrbitControls: a still right-click now opens the menu (a right-drag still pans).
148. On a Mac / Linux, where the menu event comes on the way down, the picture’s menu waits for the button to come up, so a right-drag never opens it.
149. Customise this… (every menu above): pin each tucked control of that area back on screen (✓), or tuck it again (with Undo).
150. Customise this…: Hide “this button” everywhere (the button you right-clicked, in the bars Usage watches), with Undo.
151. Customise this…: Bring back hidden buttons › (each one you hid, by name).
152. Customise this…: Show the tucked buttons for now (like tapping Alt twice).
153. Customise this…: Show everything, always / Tidy again (/calm).
154. Customise this…: Keys and hidden buttons… (the sheet).
155. /rightclick [chat | rail | lab | preview | sliders | layers | console | timeline | dock | panel] opens that menu from a chat command (aliases /context-menu).

## D. Tucked away (each still one Alt, one pointer or one right-click away)

156. Rail: ＋ Add an agent or website → hold Alt; also in the area’s right-click menu and Customise this… (`rail-add`).
157. Rail: ⌘ Command palette (Ctrl+K) → hold Alt; also in the area’s right-click menu and Customise this… (`rail-palette`).
158. Chats panel: ⏷ Filter chats → point at its area; also in the area’s right-click menu and Customise this… (`panel-filter`).
159. Chats panel: ＋ New chat in each group → point at its area; also in the area’s right-click menu and Customise this… (`panel-add`).
160. Chats panel: NATIVE / DOCKED labels → point at its area; also in the area’s right-click menu and Customise this… (`panel-kind`).
161. Chats panel: #tags on chat rows → point at its area; also in the area’s right-click menu and Customise this… (`panel-tags`).
162. Chats panel: Token counts on chat rows → point at its area; also in the area’s right-click menu and Customise this… (`panel-tokens`).
163. Chat: Tokens-this-chat note in the header → point at its area; also in the area’s right-click menu and Customise this… (`chat-meta`).
164. Chat: Context size in the header → point at its area; also in the area’s right-click menu and Customise this… (`chat-ctx`).
165. Chat: 📎 Attach → point at its area; also in the area’s right-click menu and Customise this… (`chat-attach`).
166. Chat: ⚇ Work with Astra → point at its area; also in the area’s right-click menu and Customise this… (`chat-collab`).
167. Chat: Copy / ⋯ under older messages → point at its area; also in the area’s right-click menu and Customise this… (`msg-actions`).
168. Chat: Time and number under messages → point at its area; also in the area’s right-click menu and Customise this… (`msg-meta`).
169. Chat: Token badges under older replies → point at its area; also in the area’s right-click menu and Customise this… (`msg-tokens`).
170. Director dock: ＋ New chat (Ctrl+N) → hold Alt; also in the area’s right-click menu and Customise this… (`dock-new`).
171. Director dock: ⇥ Collapse the chat → hold Alt; also in the area’s right-click menu and Customise this… (`dock-fold`).
172. Director dock: Quick chips above the chat box → hold Alt; also in the area’s right-click menu and Customise this… (`dock-chips`).
173. Director dock: Tool-call summary text → point at its area; also in the area’s right-click menu and Customise this… (`dock-sum`).
174. Lab: 🎨 Palettes → hold Alt; also in the area’s right-click menu and Customise this… (`lab-palette`).
175. Lab: 🖼 References → hold Alt; also in the area’s right-click menu and Customise this… (`lab-refs`).
176. Lab: 🖥 Stage window → hold Alt; also in the area’s right-click menu and Customise this… (`lab-stage`).
177. Lab: Live code checkbox → hold Alt; also in the area’s right-click menu and Customise this… (`lab-livecode`).
178. Lab preview: fps / draw-call line → point at its area; also in the area’s right-click menu and Customise this… (`lab-stats`).
179. Lab preview: Pixel size readout → point at its area; also in the area’s right-click menu and Customise this… (`lab-size`).
180. Lab timeline: ▤ ▭ ▁ timeline sizes → hold Alt; also in the area’s right-click menu and Customise this… (`tl-sizes`).
181. Lab timeline: 📌 Note (N) → hold Alt; also in the area’s right-click menu and Customise this… (`tl-note`).
182. Lab timeline: "No music loaded" line → point at its area; also in the area’s right-click menu and Customise this… (`tl-empty`).
183. Lab layers: ◇ Keyframe buttons (until a layer is animated) → point at its area; also in the area’s right-click menu and Customise this… (`ly-key`).
184. Lab layers: Whole song / Loop only (layer timing) → hold Alt; also in the area’s right-click menu and Customise this… (`ly-timebtns`).
185. Lab layers: "Load a song to time layers" row → hold Alt; also in the area’s right-click menu and Customise this… (`ly-notime`).
186. Lab sliders: ‹ › Shuffle steps (Shift+R) → hold Alt; also in the area’s right-click menu and Customise this… (`tw-steps`).
187. Lab sliders: ▾ Shuffle options (right-click Shuffle) → hold Alt; also in the area’s right-click menu and Customise this… (`tw-shuffle-opts`).
188. Lab sliders: ▾ Save options (right-click Save) → hold Alt; also in the area’s right-click menu and Customise this… (`tw-save-opts`).
189. Lab sliders: Ask for named sliders → hold Alt; also in the area’s right-click menu and Customise this… (`tw-tip`).
190. Lab sliders: Ask the director → hold Alt; also in the area’s right-click menu and Customise this… (`tw-asks`).
191. Lab console: When the console shows → hold Alt; also in the area’s right-click menu and Customise this… (`tc-mode`).
192. Lab console: Errors only → hold Alt; also in the area’s right-click menu and Customise this… (`tc-errors`).
193. Lab console: Copy / Clear → hold Alt; also in the area’s right-click menu and Customise this… (`tc-copy`).
194. Notes: 📌 Pin the note → hold Alt; also in the area’s right-click menu and Customise this… (`notes-pin`).
195. Notes: Copy / Save as file / Delete under a note → hold Alt; also in the area’s right-click menu and Customise this… (`notes-foot`).
196. Video Review: 4:5 / 1:1 / open notes / Lab filters → hold Alt; also in the area’s right-click menu and Customise this… (`vr-chips`).
197. Video Review: ⟳ Rescan → hold Alt; also in the area’s right-click menu and Customise this… (`vr-rescan`).
198. Video Review: Folders… (also in ⋯) → hold Alt; also in the area’s right-click menu and Customise this… (`vr-folders`).
199. Video Review: ⏮ ⏭ start / end (Home / End) → hold Alt; also in the area’s right-click menu and Customise this… (`vr-skip`).
200. Video Review: fps readout → hold Alt; also in the area’s right-click menu and Customise this… (`vr-fps`).
201. Video Review: ◐ view (V) · ◉ color picker (P) · ▤ scopes (Y) · ⧉ copy frame (Ctrl+C) → hold Alt; also in the area’s right-click menu and Customise this… (`vr-tools`).
202. Memory: Category, expiry and who-remembers per fact → point at its area; also in the area’s right-click menu and Customise this… (`mem-row`).
203. The rail’s ⋯ lists ⌘ Command palette and ＋ Add an agent at the top, now that they left the rail.

## E. Alt / Ctrl reveal (keys-ui.js)

204. Hold Alt (⌥ on a Mac): the tucked buttons come back in place.
205. They pop in with a short spring (nothing when /motion is off).
206. A dashed gold outline marks what is normally tucked away.
207. Alt + a key (Alt+1, Alt+T, Alt+N…) is a shortcut: it shows nothing (a 150 ms hold first).
208. Holding Alt (key repeat) keeps one steady reveal.
209. Leaving the window (blur) puts everything away.
210. Hiding the app (another app on top) puts everything away.
211. A missed key-up (let go in another window) is noticed on the next pointer move or click.
212. Tap Alt twice: the tucked buttons stay out (latched).
213. Esc (or two more taps) tucks them away again.
214. The keys button lights up while they are latched out.
215. Windows: a lone Alt no longer pops the window’s hidden menu bar.
216. Hold Ctrl (⌘): a key badge under every visible button that has a key.
217. Ctrl + a key (Ctrl+K, Ctrl+S…) shows no badges (a short hold first).
218. Clicking or dragging with Ctrl held never shows badges (Ctrl+drag in the timeline lanes).
219. Badges come from the buttons’ own keys (data-key, their titles) and a table for the rest; one per spot, at most 90.
220. Badges are short (⇧ for Shift) and stay inside the window.
221. On a Mac the badges say ⌘ ⌥ ⇧.
222. Badges disappear on scroll and resize (placed once, nothing follows the frame).
223. Right-click the keys button → Key badges while Ctrl is held: turn them off or on.

## F0. The keys button and its sheet (bottom left)

224. A small, calm keyboard button at the bottom of the rail (dim until you point at it).
225. Its tooltip says how to reveal: hold Alt for tucked buttons, Ctrl for key badges.
226. Click: the keys sheet slides up from the bottom-left corner.
227. Ctrl/⌘+/ opens it too (it opened the old table before; the table is one click away in the sheet).
228. What applies where you are comes first ("Chat box · Claude", "Lab · Three.js Lab"…).
229. Then Hidden buttons, Right-click, Everywhere and Menus; other places dimmed below.
230. Lines that don’t apply where you are are dimmed until you point at them.
231. Search box: words match the keys, what they do and the area.
232. Click a line: it runs (Notes, palette, Freeze, frame sizes, shuffle, save…).
233. A line without its own action presses its key for you where it applies (the chat box, the Lab, Video Review).
234. A right-click line opens that very menu on the thing on screen (pointing at it first).
235. Other lines point at the control they are about with a short gold pulse.
236. Keys are drawn as key caps; on a Mac with ⌘ ⌥ ⇧ ↩ ⌫.
237. Three tips at the top, each clickable: hold Alt (shows them), hold Ctrl (shows the badges), Right-click (lists the menus).
238. "Show tucked buttons" in the header (same as tapping Alt twice).
239. Footer: Customise… (every area’s tucked controls in one menu), /help, Table (the printable list).
240. ↑ / ↓ and Enter in the sheet; Esc clears the search, then closes.
241. It closes when you click elsewhere, with a short fade.
242. The palette (Ctrl+K) has "Keys & hidden buttons".
243. /shortcuts [word] opens it filtered (aliases /keysheet, /cheatsheet).
244. Other features add their own lines with Keys.add({ area, keys, what, when, run, sel }) (`run` and `sel` are new).

## F. Every line of the keys sheet (251 lines in 19 groups)

245. Hidden buttons · **Hold Alt**: Show the tucked buttons in place (dashed outline) while it is held (click: runs it)
246. Hidden buttons · **Alt, Alt**: Tap Alt twice: keep them showing (Esc or tap twice again hides them) (click: runs it)
247. Hidden buttons · **Hold Ctrl**: Key badges on every button that has a key (click: runs it)
248. Hidden buttons · **Right-click anything**: … → Customise this…: pin a tucked button back on screen, hide one, or show everything (click: runs it)
249. Hidden buttons · **/calm off**: Show everything, always (/calm on tidies again) (click: runs it)
250. Hidden buttons · **Hold Alt in the rail**: ＋ Add an agent or website · ⌘ Command palette (Ctrl+K) (click: runs it)
251. Hidden buttons · **Point at the chats list**: ⏷ Filter chats · ＋ New chat in each group · NATIVE / DOCKED labels · #tags on chat rows · Token counts on chat rows show (click: opens / points at it)
252. Hidden buttons · **Point at a chat**: Tokens-this-chat note in the header · Context size in the header · 📎 Attach · ⚇ Work with Astra · Copy / ⋯ under older messages · Time and number under messages · Token badges under older replies show (click: opens / points at it)
253. Hidden buttons · **Hold Alt in the dock**: ＋ New chat (Ctrl+N) · ⇥ Collapse the chat · Quick chips above the chat box (click: runs it)
254. Hidden buttons · **Point at the dock**: Tool-call summary text show (click: opens / points at it)
255. Hidden buttons · **Hold Alt in the Lab**: 🎨 Palettes · 🖼 References · 🖥 Stage window · Live code checkbox (click: runs it)
256. Hidden buttons · **Point at the picture**: fps / draw-call line · Pixel size readout show (click: opens / points at it)
257. Hidden buttons · **Hold Alt in the timeline**: ▤ ▭ ▁ timeline sizes · 📌 Note (N) (click: runs it)
258. Hidden buttons · **Point at the timeline**: "No music loaded" line show (click: opens / points at it)
259. Hidden buttons · **Hold Alt in a layer**: Whole song / Loop only (layer timing) · "Load a song to time layers" row (click: runs it)
260. Hidden buttons · **Point at a layer**: ◇ Keyframe buttons (until a layer is animated) show (click: opens / points at it)
261. Hidden buttons · **Hold Alt in the sliders**: ‹ › Shuffle steps (Shift+R) · ▾ Shuffle options (right-click Shuffle) · ▾ Save options (right-click Save) · Ask for named sliders · Ask the director (click: runs it)
262. Hidden buttons · **Hold Alt in the console**: When the console shows · Errors only · Copy / Clear (click: runs it)
263. Hidden buttons · **Hold Alt in Notes**: 📌 Pin the note · Copy / Save as file / Delete under a note (click: runs it)
264. Hidden buttons · **Hold Alt in Video Review**: 4:5 / 1:1 / open notes / Lab filters · ⟳ Rescan · Folders… (also in ⋯) · ⏮ ⏭ start / end (Home / End) · fps readout · ◐ view (V) · ◉ color picker (P) · ▤ scopes (Y) · ⧉ copy frame (Ctrl+C) (click: runs it)
265. Hidden buttons · **Point at a memory fact**: Category, expiry and who-remembers per fact show (click: opens / points at it)
266. Everywhere · **Ctrl+K**: Command palette (? searches messages, / chat commands) (click: runs it)
267. Everywhere · **Ctrl+;**: Command bar over any tool: plain words work ("make it 9 by 16") (click: runs it)
268. Everywhere · **F1**: Every chat command, searchable (click: runs it)
269. Everywhere · **Ctrl+/**: This sheet (the keys button, bottom left) (click: shows it)
270. Everywhere · **Ctrl+1…9**: Switch to agent 1…9 in the rail (click: shows it)
271. Everywhere · **Ctrl+Tab**: The agent or tool before (again: further back) (click: runs it)
272. Everywhere · **Ctrl+N**: New chat (click: runs it)
273. Everywhere · **Ctrl+F**: Find in the current view (click: runs it)
274. Everywhere · **Ctrl+J**: Notes (click: runs it)
275. Everywhere · **Ctrl+\**: Show / hide the chats panel (click: runs it)
276. Everywhere · **Ctrl+G**: All agents side by side (click: runs it)
277. Everywhere · **Ctrl+B**: Show / hide the ask-all bar (click: runs it)
278. Everywhere · **Ctrl+Shift+Space**: Ask all agents at once (click: runs it)
279. Everywhere · **Ctrl+= / Ctrl+- / Ctrl+0**: Text size bigger / smaller / normal (click: runs it)
280. Everywhere · **Ctrl+,**: Settings (click: runs it)
281. Everywhere · **Ctrl+Shift+L**: Appearance: looks, textures, glow, motion (click: runs it)
282. Everywhere · **Ctrl+Shift+U**: Token & usage dashboard (click: shows it)
283. Everywhere · **Ctrl+Shift+S**: Snapshot the window into the chat you are using (click: runs it)
284. Everywhere · **Ctrl+Shift+T**: Keep Hearth on top of other windows (click: runs it)
285. Everywhere · **Ctrl+R**: Reload a website agent · restart the Lab picture (click: shows it)
286. Everywhere · **Ctrl+Shift+R**: Reload Hearth itself (click: shows it)
287. Everywhere · **Ctrl+Alt+H**: Show / hide Hearth from any app (Settings → More settings changes it) (click: shows it)
288. Everywhere · **Shift+Esc**: Dismiss every notification (click: runs it)
289. Everywhere · **Esc**: Close a menu or dialog · stop a jam (click: shows it)
290. Menus · **↑ / ↓**: Move in a menu (Home / End: first / last) (click: shows it)
291. Menus · **Enter**: Run the highlighted item (click: shows it)
292. Menus · **→**: Open a submenu (the rows with ›) (click: shows it)
293. Menus · **← / Backspace**: Back out of a submenu (click: shows it)
294. Menus · **Type**: Filter a long menu (its submenus too) · jump to a letter in a short one (click: shows it)
295. Menus · **Point at ›**: A submenu opens beside the menu; click there to run an item directly (click: shows it)
296. Chat box · **Enter / Shift+Enter**: Send / new line (click: shows it)
297. Chat box · **/**: Chat commands (at the start of the message box) (click: opens / points at it)
298. Chat box · **Esc**: Stop the reply being written (or reading aloud) (click: shows it)
299. Chat box · **Alt+T**: Open / close every thinking block (click: shows it)
300. Chat box · **Alt+R**: Read the last reply aloud (again: stop) (click: shows it)
301. Chat box · **Alt+B**: Bookmark the last reply (click: shows it)
302. Chat box · **Alt+P**: Pin the last reply (click: shows it)
303. Chat box · **Alt+M**: The last reply’s menu (click: shows it)
304. Chat box · **Alt+F**: Find in this chat (click: shows it)
305. Chat box · **Alt+↑ / Alt+↓**: Messages you sent before (click: shows it)
306. Chat box · **Alt+Home / Alt+End**: Top / bottom of the chat (click: shows it)
307. Chat box · **Ctrl+↑ / Ctrl+↓**: Jump between your own messages (click: shows it)
308. Chat box · **Ctrl+Shift+C**: Copy the last reply (click: shows it)
309. Chat box · **Ctrl+V**: Paste a screenshot or file: it is attached (click: shows it)
310. Chat box · **Tab**: Indent inside a ``` code block (click: shows it)
311. Chat box · **Ctrl+Alt+C**: ⚇ Work with Astra: the collab menu (click: shows it)
312. Chat box · **Ctrl+Alt+D**: Duo with Astra on / off (click: shows it)
313. Chat box · **Ctrl+Alt+M**: Next model for this chat (click: shows it)
314. Chat box · **Ctrl+Alt+O**: A second opinion from the other agent (click: shows it)
315. Chat box · **Ctrl+Alt+H**: Hand the chat to the other agent (click: shows it)
316. Chat box · **Ctrl+Alt+S**: Stop a Claude × Astra collaboration (click: shows it)
317. Chat box · **↑ / ↓**: In the / menu: move (Enter runs, Esc closes) (click: shows it)
318. Chats panel · **↑ / ↓**: Move through the chats (from the search box: ↓) (click: opens / points at it)
319. Chats panel · **Enter**: Open the chat (click: opens / points at it)
320. Chats panel · **F2**: Rename the chat (click: opens / points at it)
321. Chats panel · **Delete**: Delete the chat (30 days in Recently deleted) (click: opens / points at it)
322. Chats panel · **Shift+F10**: The chat’s menu (like a right-click) (click: opens / points at it)
323. Lab · **Space**: Play / pause (click: shows it)
324. Lab · **F**: Freeze the picture (\ too) · . steps one frame while frozen (click: runs it)
325. Lab · **Shift+1**: Frame size: Fit (click: runs it)
326. Lab · **Shift+2**: Frame size: 9:16 (1080×1920) (click: runs it)
327. Lab · **Shift+3**: Frame size: 16:9 (1920×1080) (click: runs it)
328. Lab · **Shift+4**: Frame size: 4:5 (1080×1350) (click: runs it)
329. Lab · **Shift+5**: Frame size: 1:1 (1080×1080) (click: runs it)
330. Lab · **T**: Tap the tempo (live sound too) · Shift+T: this tap is the 1 (click: shows it)
331. Lab · **Shift+L**: Live sound on / off (click: runs it)
332. Lab · **R**: Shuffle the sliders (click: runs it)
333. Lab · **Shift+R**: The shuffle before (click: runs it)
334. Lab · **Ctrl+S**: Save the sliders into the code (click: runs it)
335. Lab · **Ctrl+Shift+S**: Save the sliders as a look (click: runs it)
336. Lab · **Shift+A / Shift+B / Shift+C**: Recall slider slot A, B, C (click: runs it)
337. Lab · **P**: Present: just the picture, fullscreen (click: runs it)
338. Lab · **X**: Effects & layers picker (Shift+X: everything) (click: runs it)
339. Lab · **O**: Your sketches, as pictures (click: shows it)
340. Lab · **`**: Show / hide the console (click: shows it)
341. Lab · **E**: Edit scene: move the selected layer’s 3D scene (click: shows it)
342. Lab · **N**: A note with a screenshot at this moment (click: shows it)
343. Lab · **W**: Write: record slider moves as curves while it plays (click: shows it)
344. Lab · **|**: Pin this frame to compare with what comes next (click: runs it)
345. Lab · **Shift+F**: Focus: almost fullscreen (Esc leaves) (click: shows it)
346. Lab · **Alt+N**: Code ⇄ nodes (in the code view) (click: shows it)
347. Lab · **?**: Every Lab key in one dialog (click: runs it)
348. Lab · **Ctrl+Enter**: Run every layer again (click: shows it)
349. Lab · **Ctrl+Shift+Enter**: Restart from scratch (fresh page, GPU and sound) (click: runs it)
350. Lab · **Ctrl+PgDn / Ctrl+PgUp**: Next / previous sketch (click: runs it)
351. Lab · **Ctrl+Z**: Undo a grid, marker, cue or curve change (click: shows it)
352. Lab · **Esc**: From a Lab tool tab (model viewer, shaders…): back to the sketch (click: shows it)
353. Lab · **.**: While frozen: one frame forward (click: shows it)
354. Lab · **\**: Freeze / unfreeze (like F) (click: runs it)
355. Lab timeline · **← / →**: Nudge 10 ms (Alt: 1 ms, Shift: a grid step) (click: shows it)
356. Lab timeline · **, / .**: Nudge by ear (click: shows it)
357. Lab timeline · **Home / End**: Start / end (of the loop) (click: shows it)
358. Lab timeline · **[ / ]**: Loop start / end at the playhead (click: shows it)
359. Lab timeline · **{ / }**: Trim the song’s start / end at the playhead (click: shows it)
360. Lab timeline · **K / S / H**: Kick / snare / hit marker at the playhead (click: shows it)
361. Lab timeline · **C**: Drop a hot cue (click: shows it)
362. Lab timeline · **1…9**: Jump to cue 1…9 (PgUp / PgDn: previous / next cue) (click: shows it)
363. Lab timeline · **A**: Show / hide every animated curve (click: shows it)
364. Lab timeline · **L**: Loop this bar (click: runs it)
365. Lab timeline · **G**: Next snap setting (click: runs it)
366. Lab timeline · **Q**: Quantize taps on / off (click: runs it)
367. Lab timeline · **M**: Mute / unmute (click: runs it)
368. Lab timeline · **= / - / 0**: Zoom the timeline in / out / whole song (click: shows it)
369. Lab timeline · **Delete**: Delete the selected points or marker (click: shows it)
370. Lab timeline · **Esc**: Clear the taps / the selection (click: shows it)
371. Lab timeline · **Shift+drag**: Select points in a curve lane (click: shows it)
372. Lab timeline · **Ctrl+drag**: Draw points in a curve lane (click: shows it)
373. Lab timeline · **Alt+drag**: Stretch the swing of a selection (click: shows it)
374. Lab timeline · **Ctrl+C / V / D / A**: Copy, paste at the playhead, duplicate, select all points (click: shows it)
375. Lab timeline · **Double-click**: Delete a marker (click: shows it)
376. Lab sliders & layers · **/**: Find a slider (click: opens / points at it)
377. Lab sliders & layers · **Alt+1…9**: Hide / show layer 1…9 (Alt+Shift: only that one) (click: shows it)
378. Lab sliders & layers · **Alt+click**: A layer’s eye: show only that layer · a look: morph into it (click: opens / points at it)
379. Lab sliders & layers · **Double-click**: A slider’s value: back to the code’s value · a layer’s name: rename (click: shows it)
380. Lab sliders & layers · **Shift+click**: ▶ Run: restart from scratch · 📷: copy the still (click: shows it)
381. Lab sliders & layers · **Shift+C**: Recall slider slot C (click: runs it)
382. Lab sliders & layers · **1…9**: In the Triggers panel: pick trigger 1…9 (click: shows it)
383. Present · **Esc**: Leave Present (click: shows it)
384. Present · **B**: Fade to black and back (click: shows it)
385. Present · **I**: The info line (sketch, time, BPM) (click: shows it)
386. Present · **PgUp / PgDn**: Previous / next sketch (click: shows it)
387. Present · **Space / F / 1…9**: Play / pause, freeze and cues still work while presenting (click: shows it)
388. Director dock · **Alt+Shift+Z**: Undo the director’s last code edit (click: runs it)
389. Director dock · **Alt+Shift+Y**: Redo it (click: runs it)
390. Director dock · **Alt+Shift+D**: Collapse / open the docked chat (click: shows it)
391. Director dock · **Double-click**: The divider: collapse / expand the chat (click: opens / points at it)
392. Nodes · **Space+drag**: Pan the graph (click: shows it)
393. Nodes · **Ctrl+F**: Find a node (click: shows it)
394. Nodes · **Ctrl+Z / Ctrl+Shift+Z**: Undo / redo (click: shows it)
395. Nodes · **Ctrl+C / X / V / D**: Copy, cut, paste, duplicate nodes (click: shows it)
396. Nodes · **Ctrl+G**: Frame the selection (click: shows it)
397. Nodes · **Ctrl+A**: Select every node (click: shows it)
398. Nodes · **[ / ]**: Select what feeds / what it feeds (click: shows it)
399. Nodes · **M**: Bypass the selected nodes (click: shows it)
400. Nodes · **Delete**: Delete the selection (or the selected wire) (click: shows it)
401. Nodes · **F / Home**: Fit the graph (read-only views) (click: shows it)
402. Nodes · **?**: The node editor’s help (click: shows it)
403. Nodes · **Double-click**: Empty space: add a node there (the picker: ↑ ↓ Enter, Esc) (click: shows it)
404. Nodes · **← → ↑ ↓**: In the presets grid: move · Enter: use it (click: shows it)
405. Video Review · **Space**: Play / pause (click: shows it)
406. Video Review · **J / K / L**: Back / stop / forward (Shift+L: loop) (click: shows it)
407. Video Review · **← / →**: One frame (Shift: 10) (click: shows it)
408. Video Review · **↑ / ↓**: Previous / next note (click: shows it)
409. Video Review · **, / .**: Previous / next beat (click: shows it)
410. Video Review · **< / >**: Previous / next section or drop (click: shows it)
411. Video Review · **I / O / X**: Loop in / out / clear (click: shows it)
412. Video Review · **N**: New note at the playhead (click: shows it)
413. Video Review · **D**: Draw on the frame (click: shows it)
414. Video Review · **P**: Color picker (click: shows it)
415. Video Review · **Y**: Scopes (click: shows it)
416. Video Review · **C / \**: Compare / swap A and B (click: shows it)
417. Video Review · **G / S**: Guides / safe zones (click: shows it)
418. Video Review · **V / H**: View (channels, luma…) / mirror (click: shows it)
419. Video Review · **Z**: Zoom 100 % / fit (click: shows it)
420. Video Review · **F**: Fullscreen review (click: shows it)
421. Video Review · **B**: Show / hide the library (click: shows it)
422. Video Review · **E**: Cut clips (click: shows it)
423. Video Review · **[ / ]**: Slower / faster (click: shows it)
424. Video Review · **- / =**: Volume down / up · M: mute (click: shows it)
425. Video Review · **T**: Time as timecode / seconds / frames (click: shows it)
426. Video Review · **Ctrl+C / Ctrl+S**: Copy the frame / save it as a PNG (click: shows it)
427. Video Review · **?**: Every Video Review key (click: shows it)
428. Command bar · **Enter**: Run the line and keep the bar for the next one (click: runs it)
429. Command bar · **Ctrl+Enter**: Run it and close the bar (click: shows it)
430. Command bar · **Alt+Enter**: Run it and keep the text (click: shows it)
431. Command bar · **↑ / ↓**: Commands you ran before (click: shows it)
432. Command bar · **Tab**: In an empty bar: your last command again (click: shows it)
433. Command bar · **Ctrl+R**: Search your command history (click: shows it)
434. Command bar · **Ctrl+Z**: In an empty bar: take back the last command (when it can be undone) (click: shows it)
435. Command bar · **Ctrl+L**: Clear the result card (click: shows it)
436. Command bar · **Alt+1…9**: Run your pinned command 1…9 (☆ in the / menu pins one) (click: shows it)
437. Command bar · **Esc**: Clear the line, then close (click: shows it)
438. Command bar · **F1**: Every command, searchable (click: runs it)
439. Command palette · **↑ / ↓ / Enter**: Pick an action (click: runs it)
440. Command palette · **?**: Typed first: search the messages of every chat (click: shows it)
441. Command palette · **/**: Typed first: hands over to the command bar (click: shows it)
442. Effects picker · **↑ / ↓ / PgUp / PgDn**: Move through the list (click: shows it)
443. Effects picker · **Enter**: Add it (Shift+Enter: replace the selected layer’s look) (click: shows it)
444. Effects picker · **Tab / Shift+Tab**: Browse all · next / previous tab (click: shows it)
445. Effects picker · **Ctrl+D**: ★ Favorite the highlighted one (click: shows it)
446. Effects picker · **Alt+R**: Surprise me: a random one (click: shows it)
447. Effects picker · **Esc**: Close the picker (click: shows it)
448. Notes · **Ctrl+Enter**: Tick / untick the checklist line under the cursor (or make it one) (click: opens / points at it)
449. Notes · **Ctrl+J**: Open / close Notes (click: runs it)
450. Find · **Enter / Shift+Enter**: Next / previous match (Ctrl+F opens it) (click: runs it)
451. Find · **Esc**: Close find (click: shows it)
452. Kit · **T**: Tap tempo (in the Kit’s BPM tool) (click: shows it)
453. Kit · **Enter**: Read a color / palette / frame size you typed (click: shows it)
454. Right-click · **Right-click a message**: A message: Copy, Read aloud, Reply ›, Mark ›, Copy & save › (click: opens / points at it)
455. Right-click · **Right-click a code block**: A code block: copy, save, open in the Lab / nodes, insert (click: opens / points at it)
456. Right-click · **Right-click the chat header**: The chat header or empty chat: New chat, Model ›, View ›, Organise ›… (click: opens / points at it)
457. Right-click · **Right-click around the chat box**: Around the chat box: attach, paste, commands, prompts, Astra (click: opens / points at it)
458. Right-click · **Right-click a chat in the list**: A chat in the list: pin, rename, tag, export, delete… (click: opens / points at it)
459. Right-click · **Right-click a chat group**: A group in the chats list: new chat, collapse, the agent (click: opens / points at it)
460. Right-click · **Right-click an agent**: An agent in the rail: open, recent chats ›, edit, move › (click: opens / points at it)
461. Right-click · **Right-click a tool in the rail**: A tool in the rail: open, its director chat, move ›, hide (click: opens / points at it)
462. Right-click · **Right-click the rail**: The rail’s empty space: add, palette, panels ›, settings (click: opens / points at it)
463. Right-click · **Right-click the token pill**: The token pill: dashboard, strip, budgets (click: opens / points at it)
464. Right-click · **Right-click the Lab picture**: The Lab picture: Freeze, Frame size ›, Capture ›, Sliders ›, View › (click: opens / points at it)
465. Right-click · **Right-click the Lab toolbar**: The Lab toolbar: Run, Sketch ›, Show ›, Capture ›, effects (click: opens / points at it)
466. Right-click · **Right-click a frame size**: A frame size button: a still / recording / Stage window at that size (click: opens / points at it)
467. Right-click · **Right-click Freeze**: Freeze: on the next beat / bar / kick, pin, still (click: opens / points at it)
468. Right-click · **Right-click a slider**: A slider: reset, lock, favorite, shuffle one, type, copy / paste, history ›, moves ›, keyframe, MIDI (click: opens / points at it)
469. Right-click · **Right-click the sliders panel**: The sliders panel: Save, Shuffle ›, Looks ›, Slots ›, Values › (click: opens / points at it)
470. Right-click · **Right-click Shuffle / Save**: Shuffle / Save: their options (click: opens / points at it)
471. Right-click · **Right-click a layer**: A layer: hide, solo, rename, duplicate, move, Opacity ›, Blend ›, delete (click: opens / points at it)
472. Right-click · **Right-click the timeline**: The timeline buttons: play, load, live, triggers, Song ›, Timeline size › (click: opens / points at it)
473. Right-click · **Right-click the waveform**: The waveform, a marker or a loop: their own options (click: opens / points at it)
474. Right-click · **Right-click Tap / Play / Live**: Tap, Play, Live: tempo, speeds, straight on / off (click: opens / points at it)
475. Right-click · **Right-click the console**: The console: fix, copy, clear, errors only, Shows › (click: opens / points at it)
476. Right-click · **Right-click Console / Present**: Console / Present buttons: modes and options (click: opens / points at it)
477. Right-click · **Right-click the dock**: The director dock: quick asks, undo / redo, Quick chips ›, Dock › (click: opens / points at it)
478. Right-click · **Right-click the dock divider**: The dock’s divider: widths (click: opens / points at it)
479. Right-click · **Right-click ⚇**: ⚇: every way to work with Astra (duo, relay, debate, council…) (click: opens / points at it)
480. Right-click · **Right-click a tool header**: A tool’s header: its director chat, snapshot, move, hide (click: opens / points at it)
481. Right-click · **Right-click a notification**: A notification: copy, dismiss, dismiss all (click: opens / points at it)
482. Right-click · **Right-click Notes**: Notes: a note’s options · empty space: new, today, export (click: opens / points at it)
483. Right-click · **Right-click a memory fact**: A memory fact: pin, edit, copy, expires, forget (click: opens / points at it)
484. Right-click · **Right-click in Video Review**: Video Review: a render card, a note, the picture (click: opens / points at it)
485. Right-click · **Right-click in the nodes**: Nodes: add a node here, a node’s options (click: opens / points at it)
486. Right-click · **Right-click a link**: In a reply: open, copy the link, copy its text (click: opens / points at it)
487. Right-click · **Right-click a picture**: In a reply: open, copy the picture, copy its address (click: opens / points at it)
488. Right-click · **Right-click a look**: A saved look chip: morph into it, update it, store in a slot (click: opens / points at it)
489. Right-click · **Right-click a slot**: Slider slot A / B / C: store, recall, clear (click: opens / points at it)
490. Right-click · **Right-click a group**: A slider group: shuffle it by an amount, reset, lock, favorite, make it breathe (click: opens / points at it)
491. Right-click · **Right-click a sketch card**: In Your sketches: open, pin, duplicate, rename, delete (click: opens / points at it)
492. Right-click · **Right-click Still**: A still at 9:16 / 16:9 / 4:5 / 1:1, copy this frame (click: opens / points at it)
493. Right-click · **Right-click New**: In the Lab: new sketch from a template list (click: opens / points at it)
494. Right-click · **Right-click a quick chip**: Your own director chip: remove it (click: opens / points at it)
495. Right-click · **Right-click a command**: In /help: pin it, copy it, try it (click: opens / points at it)

## G. Chat commands and the palette

496. /calm [on | off]: tuck the secondary buttons away (default) or show everything.
497. /reveal [on | off]: show the tucked buttons until Esc or /reveal off.
498. /customise [area] (/customize): what is tucked away where, and what you pinned.
499. /pin-control <name>: keep a tucked control on screen (suggestions list them).
500. /unpin-control <name>: tuck it away again.
501. /rightclick [where]: open a right-click menu from the chat (see C).
502. /shortcuts [word]: the keys sheet (see F0).
503. Palette (Ctrl+K): Show the tucked buttons (like holding Alt).
504. Palette: Show every button, always / tidy again.
505. Palette: Customise: what is tucked away, what is pinned.
506. Palette: Right-click menu of this view.

## H. For testing

507. `dev/checks/declutter.js`: the keys button and sheet (search, a line that runs, Ctrl+/ and Esc), Alt hold / Alt+key / key repeat / blur / double-tap / Esc, Ctrl badges and Ctrl+K, right-click on a message (flyout, submenu, ← back, ↑ ↓, Esc), a thinking block, the chat header, the chat box, Customise this… (pin and unpin), the rail and an agent, a long menu’s filter reaching a submenu item, a menu over a modal dialog (a real click), the Lab (tucked / Alt / Ctrl badges, toolbar, sliders, console, timeline, a slider row, a layer’s folded menu, a real right-click on the picture and Frame size ›), Video Review tucks, the dock, and the commands. Set window.DC_SHOTS for pictures. 61 checks, all passing.
508. `dev/checks/declutter-count.js`: visible controls per surface with everything out vs tidy, and the top level of the main menus.


## Where things went
| Was on screen | Now |
|---|---|
| Rail ＋ and ⌘ | hold Alt · the rail’s ⋯ · right-click the rail · Ctrl+K |
| Chats panel ⏷ filter, ＋ per group, NATIVE / DOCKED labels, #tags and token counts on rows | point at them · right-click the list or a group · /filter |
| Chat header context size and tokens-this-chat | point at the header (a big context still shows: it turns orange / red) · right-click the header → Compact context |
| ⚇ and 📎 in the chat box | point at or type in the chat box · right-click around it · drop / paste files |
| Copy / ⋯ / time / number / tokens under older messages | point at the message · right-click it |
| Dock ＋ New chat, ⇥ collapse, quick chips, the tool-call summary | hold Alt · right-click the dock (✦ menu) · Ctrl+N · Alt+Shift+D · Customise this… → pin the chips back |
| Lab 🎨 palettes, 🖼 references, 🖥 Stage window, Live code | hold Alt · right-click the toolbar → Show › / Lab ⋯ → Code › |
| Lab fps line, pixel size readout | point at the picture / the size pill |
| Timeline ▭ ▁ sizes, 📌 Note, "No music loaded" | hold Alt · right-click the timeline → Timeline size › · N |
| Layer ◇ keyframe (until animated), Whole song / Loop only, "Load a song to time layers" | point at the field · hold Alt · right-click a layer → Plays › |
| Sliders ‹ › shuffle steps, both ▾ option menus, Ask for named sliders, Ask the director | hold Alt · Shift+R · right-click Shuffle / Save · right-click the panel → Shuffle › / Ask the director › |
| Console mode, Errors only, Copy, Clear | hold Alt · right-click the console |
| Notes 📌, Copy / Save as file / Delete | hold Alt · right-click the notes panel |
| Memory per-fact category / expiry / who | point at the fact · right-click it |
| Video Review 4:5 / 1:1 / notes / Lab filters, ⟳, Folders…, ⏮ ⏭, fps, ◐ ◉ ▤ ⧉ | hold Alt · their keys (Home, End, V, P, Y, Ctrl+C) · ⋯ |

## Files
New: `keys-ui.js` (reveal, badges, keys button and sheet, the registry lines), `declutter.js` (tucked controls, right-click
menus, Customise this…, commands), `dev/checks/declutter.js`, `dev/checks/declutter-count.js`. Styles in `polish.css`.
Small edits: `renderer.js` (menus, rail menus, Ctrl+/), `keys.js` (`run` / `sel` kept), `index.html` (two script tags),
`start.js` (the flyout counts as the menu), `native.js` (message and chat menus regrouped), `panel.js` (chat-row menu),
`director-dock.js` (✦ menu, two class names, `menu()`), `tools/three.js` (Lab ⋯, preview ⋯, picture menu, layer Plays ›,
Lab menus through popMenu), `tools/three-tweaks.js` (its menu through popMenu), `tools/three-sandbox.html` (a still
right-click), `usage.js` (exports keyOf).

