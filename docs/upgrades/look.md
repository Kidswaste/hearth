# Look stream: Forgeheart 2, materials, presets, micro-interactions

How to get to all of it: **Settings → Appearance** (a compact picker with swatches), **Ctrl+Shift+L** (⌘⇧L), **Ctrl+K → "Appearance" / "Theme: …"**,
or type in any chat: `/theme <name>`, `/themes`, `/look`, `/texture`, `/glow`, `/motion`, `/density`, `/corners`, `/accent`, `/chatfont`, `/tips`, `/sparkles`, `/classic`.
**Forgeheart Classic** (`/classic`) is the previous look, unchanged pixel for pixel (checked against a screenshot from before the change).

Files: `look.css` (new: materials, Forgeheart 2, toggles, picker), `look.js` (new: presets applied, picker, commands), `juice.js` (micro-interactions),
`appui.js` (preset list + Settings hook), `forge-skin.css` (one bug fix), `index.html` (one link + one script tag).

## Forgeheart 2: the new default (`/theme forgeheart`)
1. Forgeheart is bolder by default. If you were on Forgeheart with its first colors, you move to the new one once; Classic keeps the old colors.
2. Deeper forge-black ground that darkens toward the bottom.
3. Warm molten light falling from the top of the window (follows `/glow`).
4. A faint violet ember glow in the lower right corner.
5. Fine film grain over the app in place of the scanlines (`/texture off` removes it).
6. Molten gold (#ffc23d) is the "active" color, richer than before.
7. The importance colors are one variable each: gold active, ember orange attention, electric violet AI working, hot red stop, blue info (`--fh-gold`, `--fh-ember`, `--fh-ai`, `--fh-stop`, `--fh-info`).
8. A signature molten gradient (magenta → ember → gold), used sparingly: the composer focus edge, the palette's top bar, progress bars and the send burst.
9. Rainbow still means "live" and now uses the preset's own colors.
10. Borders have a faint gold tint, so they read as warm metal.
11. Muted text is worked out from each preset's text and background, so contrast stays even.
12. Text selection is translucent gold with bright text.

## Typography
13. Oxanium for headers everywhere: tool titles, chat title, dialog titles, settings sections, slider panel head, video title, palette entries.
14. Headings inside replies use Oxanium with letter spacing. H1 and H2 are gold.
15. Bold text in replies is full white.
16. Tool titles have a soft gold glow.
17. The chat title is bold and bright.
18. Chat text can be Oxanium or a clean system font for long replies (`/chatfont clean`, or in the picker).

## Material system (`look.css`, reusable by every stream)
19. Polished chrome (`.m-chrome`), with a specular sweep on hover.
20. Molten gold chrome (`.m-gold`).
21. Frosted glass (`.m-glass`): backdrop blur, edge highlight and grain.
22. Forged metal (`.m-forged`): brushed hairlines and a bevel.
23. Molten glow (`.m-molten`): ember gradient with bloom.
24. Bevel utility (`.m-bevel`).
25. Hover sheen utility (`.m-sheen`).
26. "AI working" violet shimmer utility (`.m-working`), for any panel.
27. A tiny SVG grain texture, drawn once and tiled. It needs no image files.
28. Horizontal and vertical brushed-metal textures made from CSS gradients.
29. Material variables (`--m-chrome`, `--m-gold`, `--m-glass-bg`, `--m-bevel`, `--tx-noise`…) so other streams' UI picks up every preset.
30. Presets can switch the primary buttons to polished silver (`--m-primary`). Chrome Forge, Frost Steel, Chrome Light and Frost Light do.

## Rail
31. Brushed forged steel with a warm molten edge.
32. The live rainbow strip on top is wider and has a violet glow.
33. Agent buttons are beveled metal tiles, tinted and framed in the agent's color.
34. The active agent has a molten-gold chrome frame and an inner gold glow.
35. Hovering an agent sweeps light across it and brightens it.
36. Hovering a tool button lights a gold plate with a bevel.
37. The open tool shows a gold notch on the left and a gold icon.
38. Rail separators are molten hairlines.
39. Agent letters have a subtle engraved shadow.

## Chats panel
40. Dark brushed iron background.
41. The open chat has a molten gold → ember marker bar that glows.
42. The open chat row has a gold-to-ember wash.
43. The current agent's group name glows gold.
44. The "busy" diamond glows violet while the AI is working.
45. Rows hover with a warm gold tint.
46. Group type labels are toned down.

## Inputs and controls
47. Text fields are deep wells with an inner bevel.
48. Focused fields get a gold border, an ember halo and a glow.
49. Placeholders are softer.
50. Checkboxes are forged sockets with a gold check that springs in.
51. Hovering a checkbox lights its rim.
52. Checked boxes glow gold.
53. Disabled checkboxes dim.
54. Radio buttons are gold.
55. Sliders sit in a dark groove with a faint gold start.
56. Slider knobs are polished chrome balls with a gold ring, including every Lab slider.
57. Hovering a knob makes its ring glow.
58. Dragging a knob gives it a brighter, wider halo.
59. Disabled sliders dim.
60. Color inputs are framed like wells.
61. Keyboard focus rings look forged: a gold line with an ember inner ring, drawn inside the cut corners so they never get clipped.

## Buttons
62. Primary buttons (Send, Run, Save, Done, + Layer…) are molten-gold chrome with a horizon band.
63. Hovering a primary button brightens and saturates it, with a wider specular sweep.
64. Pressing a primary button sinks it 1px with an inset shadow.
65. Disabled primary buttons fade out instead of turning dark brown.
66. Stop is hot red metal that pulses from the inside.
67. Fix: the Stop button is red again in Classic too. The "Send to all" rule had been outranking it.
68. Danger-filled buttons are red metal.
69. Ghost buttons are brushed dark plates with a bevel.
70. Hovering a ghost button gives it a gold rim, gold text, an inner glow and a light sweep.
71. Pressing a ghost button shows an inset shadow.
72. Toggled ghost buttons (the "on" state) are gold-lit plates.
73. Danger ghost buttons hover in red.
74. Website toolbar buttons hover in gold.
75. Chips, frame-size buttons and suggestion chips squash a little when pressed.

## Toggles and segmented controls
76. Tab bars sit in a recessed dark strip.
77. The tab underline is a molten ember → gold gradient with a glow.
78. The active tab has a gold wash and bright text.
79. Tabs brighten on hover.
80. The preview's frame-size pill (9:16, 16:9…) is frosted glass.
81. The selected frame size is molten gold chrome.
82. Frame sizes hover in gold.
83. Lab chips, version chips, trigger chips and question options are beveled plates.
84. Chips hover in gold.
85. A selected chip is gold chrome.
86. "+ add" chips stay dashed and light.
87. Suggestion chips are cut plates tinted by the agent, with a sweep on hover.
88. Queued messages are violet chips, because they are waiting on the AI.
89. Media bar buttons that are on glow gold.
90. Lab toolbar groups (VIEW, CODE, ASSETS…) are cut forged plates.
91. Toolbar group labels use a mono font with a gold tint.
92. A segmented control (`.seg`) with gold chrome selection, used in the picker and reusable anywhere.

## Headers
93. Tool and chat headers are brushed steel.
94. A molten hairline runs under every header.
95. The occasional header glint is warm gold now.
96. Tool icons have a chrome frame.
97. The tool description diamond is gold.
98. Website and game bars are brushed steel.

## Cards and data
99. Cards are forged plates: dashboard, calculators, presets, gallery, kanban columns, render rows, stats.
100. Gold corner brackets light up on hover.
101. Settings sections are framed plates with gold headings.
102. Progress bars use the molten gradient with an ember glow.
103. Progress tracks are recessed.
104. Kanban cards are beveled.
105. Table headers are iron.
106. Table rows hover in gold.
107. Keyboard keys (`kbd`) are beveled keycaps with gold letters.

## Lab
108. The director dock, slider panel and layers panel are brushed iron.
109. The slider panel head has a soft metal gradient.
110. Unsaved slider changes show an ember line under the panel head.
111. Slider and layer rows hover in gold.
112. The selected layer has a gold wash and a gold notch.
113. Changed slider names turn gold.
114. The media bar is a beveled forged plate.
115. Media bar menus are frosted glass.
116. The preview has a hairline frame and a shadow.
117. Shuffle 🎲: the die rolls and throws violet, magenta and blue sparks.
118. Tap: a molten ring pulses from the button on every tap.
119. Freeze: a frost-blue ring and a glint.
120. Save (and any Save button): embers drift up from the button.

## Video Review
121. The selected render card is gold.
122. The player stage has a gold-edged frame that follows `/glow`.
123. Note markers on the scrub bar glow gold.

## Chat
124. Your messages are forged plates tinted by the agent, with grain and a bevel.
125. The live rainbow spine of a streaming reply glows violet.
126. A violet shimmer runs through the reply while it's being written (AI working).
127. The typing bars glow violet.
128. Tool chips are a violet gradient tag.
129. Tool chips shimmer while the reply streams.
130. The "Thinking" summary is violet.
131. Plan / progress cards are violet-tinted iron.
132. Question cards are an ember plate with an inner glow.
133. Command notes in the chat are a blue info plate.
134. Error messages are a red plate with a red edge, and shake briefly when they appear.
135. Code blocks are the deepest black well with a blue top edge.
136. Inline code has a gold tint.
137. Links are info blue with a soft offset underline.
138. Quotes have a gold edge and a warm wash.
139. Horizontal rules are molten hairlines.
140. Table headers inside replies are gold.
141. The empty-chat icon has a gold chrome frame.
142. The empty-chat title is bright.
143. The composer is a deep well.
144. Focusing the composer lights a gold rim and a molten underline with an ember glow. The rainbow now only means "live".
145. Attachment chips are beveled plates.
146. "Jump to bottom" is frosted glass with a gold arrow.
147. Message actions hover in gold.
148. The ask-all bar is brushed steel.
149. The model picker text is gold.
150. Opinion cards are squared to match.

## Overlays
151. Dialogs are frosted glass with grain and an edge highlight.
152. A molten hairline runs along the top of every dialog.
153. The dialog backdrop has a warm vignette and a light blur.
154. Dialog titles glow gold.
155. The command palette is a frosted glass card.
156. The palette backdrop has a warm light.
157. The palette's top bar is the molten gradient.
158. The palette search uses Oxanium and has no border.
159. The selected palette row has a gold wash and notch, and its kind label turns gold.
160. Right-click menus, the slash menu, the find bar, the Notes panel and Lab popovers are frosted glass.
161. Menu items hover with a gold wash and notch.
162. The slash menu selection has a gold wash and notch.
163. Notifications are frosted glass.
164. Info notifications have a blue edge and glow. Error notifications have a red one.
165. Notification buttons are gold.
166. New notifications pop in with a gold edge.
167. Error notifications shake.

## Code views
168. Code editors, consoles and logs use the deepest well color.
169. The Lab stats overlay is glass.
170. Syntax colors follow the importance palette (keywords violet, functions blue, numbers ember, types gold) and change with each preset.

## Scrollbars and tooltips
171. Scrollbar thumbs are forged metal.
172. A scrollbar thumb turns molten gold on hover.
173. Scrollbar corners are transparent.
174. Forged tooltips: glass with a gold edge, shown after 0.4 s above or below the element and always on screen (`/tips off` brings back the system ones).
175. Tooltips never lose an element's title. It always comes back.

## Micro-interactions (`juice.js`, presentation only)
176. A chrome streak crosses any button you press.
177. Click sparks use the preset's colors: gold for important buttons, the agent's color, otherwise info blue.
178. Sending rolls a molten ring out of the Send button.
179. Sending also bursts hot magenta sparks, from Enter or a click, in chats and the ask-all bar.
180. When the window is hidden, every animation pauses, which saves GPU and battery.
181. The window title updater skips its work while the window is hidden.
182. All effects respect the OS "reduce motion" setting, `/motion off` and `/sparkles off`. Nothing loops while idle: each effect is a one-shot element.

## Presets (each reachable with `/theme <id>`, the picker and Ctrl+K → "Theme: …")
183. Forgeheart (new default) — `forgeheart`
184. Forgeheart Classic, the previous look exactly — `classic` (also `/classic`)
185. Chrome Forge: cool steel with polished silver buttons — `chrome-forge`
186. Glass Ember: ember orange with rounded glass corners — `glass-ember`
187. Obsidian: pure black with old gold and a violet ambient light — `obsidian`
188. Ironclad: low glow, calm motion, muted steel — `ironclad`
189. High Contrast Forge: pure black and white with bright gold, no textures — `hc-forge`
190. Molten: lava-brown metal with orange gold and hot pink — `molten`
191. Neon Anvil: magenta active color with cyan highlights on violet black — `neon-anvil`
192. Synth Forge: sunset orange and pink on purple — `synth-forge`
193. Frost Steel: icy blue with chrome buttons — `frost-steel`
194. Gold Leaf: warm brown-black with rich gold — `gold-leaf`
195. Midnight Violet: deep indigo with gold — `midnight-violet`
196. Ash & Copper: grey ash with copper — `ash-copper`
197. Verdigris: teal patina on bronze — `verdigris`
198. Jade Furnace: green jade fire — `jade-furnace`
199. Blood Moon: crimson ambient light with amber — `bloodmoon`
200. Rose Gold: rose metal with rounded corners — `rose-gold`
201. Aurora: mint and violet on dark teal — `aurora`
202. Abyss: navy and cyan — `abyss`
203. Sunforge: bright amber with strong glow — `sunforge`
204. Dusk: soft, muted mauve and apricot, low glow — `dusk`
205. Forge Light: a light parchment version of Forgeheart — `forge-light`
206. Chrome Light: light silver and blue with chrome buttons — `chrome-light`
207. Parchment: warm paper and copper, low glow — `parchment`
208. Frost Light: light icy blue — `frost-light`
209. Each preset can carry its own default glow, motion, corners and textures (Ironclad is calm, Glass Ember is round…). Your own toggles always win.
210. Presets are grouped into Forgeheart, Bold, Light and Plain in the picker and in `/themes`.

## Appearance toggles (picker or chat)
211. Textures on / off: brushed metal, grain and glass tint (`/texture on|off`).
212. Glow intensity from 0 (flat) to 100 (blazing) for every bloom, halo and ambient light (`/glow 0-100`, `/glow +`, `/glow -`).
213. Motion "calm": hover and press feedback stays, ambient loops stop (`/motion calm`).
214. Motion "off": no animation at all (`/motion off`).
215. Density "compact": smaller rail, tighter rows, headers, messages and composer (`/density compact`).
216. Density "comfortable": more air and bigger text for long reading (`/density comfortable`, or `roomy`).
217. Corners "round": every forge surface rounded consistently, including inputs and pills (`/corners round`).
218. Corners "square": no cut corners (`/corners square`).
219. With rounded corners the bold look gets its outer bloom back on primary buttons and the active agent.
220. Your own accent: replaces the "active" gold everywhere, from a color picker or `/accent #hex`.
221. Named accents: gold, ember, orange, violet, magenta, pink, red, cyan, blue, mint, green, lime, silver, white, copper, rose (`/accent mint`). `/accent reset` restores the preset's.
222. Chat font: Oxanium or clean (`/chatfont`).
223. Forged tooltips on / off (`/tips`).
224. Sparkles on / off from chat (`/sparkles on|off`). Before, this was palette-only.
225. Toggles apply to every preset and survive switching presets. `/look reset` clears them.

## Saved looks (yours)
226. Save the current preset and your tweaks under a name: `/look save Night session`, or **Save as…** in the Appearance dialog.
227. Load one: `/look load Night session`, or simply `/theme night session`.
228. Delete one: `/look delete <name>`, or right-click its tile.
229. A "Yours" group at the top of the picker, with dashed tiles.
230. `/themes` lists your saved looks too.
231. Saved looks live in config.json (`theme.saved`) with the rest of your settings and hot-reload like them.

## Appearance picker
232. Settings → Appearance is now a compact picker instead of a dropdown.
233. Every look has a three-color swatch (ground, accent, ambient).
234. A search box filters looks as you type.
235. A "Now:" label shows the current look.
236. Looks apply instantly, with no Save needed.
237. The picker scrolls to the current look when it opens.
238. Each tile's tooltip shows its chat command.
239. A standalone Appearance dialog (`/look`, Ctrl+K → "Appearance…").
240. **Ctrl+Shift+L** (⌘⇧L) opens and closes it, and it is listed in Keyboard shortcuts (Ctrl+/).
241. The picker updates live when a chat command changes something.

## Chat commands (area "Look" in `/help`)
242. `/theme <name>` with forgiving names ("chrome", "Chrome Forge", "neon" all work). Alias `/skin`.
243. `/theme next` and `/theme prev` step through the presets.
244. `/theme random` picks a random look.
245. `/theme` with no name shows the current status.
246. `/themes` lists every look grouped, with ▸ on the current one. Alias `/looks`.
247. `/look` opens the picker. Alias `/appearance`.
248. `/look status` gives a one-line summary of everything that is set.
249. `/look reset` returns the toggles to the preset's.
250. `/classic` and `/classic off` switch between Classic and Forgeheart 2 in one word, and warn when your tweaks still apply.
251. `/motion`, `/density` and `/corners` with no argument cycle to the next choice.
252. Argument suggestions in the composer narrow as you type (e.g. `/theme ne` → neon-anvil).
253. `/texture` has the alias `/textures`, and `/tips` has the alias `/tooltips`.

## Command palette (Ctrl+K)
254. "Appearance: looks, textures, glow, motion…"
255. "Theme: next look"
256. "Theme: random look"
257. "Textures on / off"
258. "Motion: full → calm → off"
259. "Density: compact → normal → roomy"
260. "Corners: cut → round → square"
261. "Theme: <name>" for all 31 looks (it was 6).

## Under the hood (for other streams)
262. Every Forgeheart 2 color is a CSS variable on `<html>`, set per preset. New UI that uses `var(--surface)`, `var(--line)`, `var(--fh-gold)`, `var(--m-glass-bg)` or the `.m-*` classes follows every preset, light ones included.
263. Light presets use the same rules as the dark ones: the shine, shade and text tokens flip, so there are no hard-coded dark colors to fight.

Total: 263.
