# Add-ons stream: upgrades

Everything here works from chat commands too (type `/` in any native chat, `/help <word>` to filter). Counted one line per upgrade; preset lists are at the end of their section.

## Prompt library (Ctrl+K → Prompt library, `/prompts`)

1. **Categories**: 11 groups (Coding, Three.js & shaders, Music visuals, After Effects, Game dev & Forgeheart, Writing, Social posts & captions, Review & critique, Planning, Learning, Everyday) plus "My prompts" and your own new categories. `/prompts three`
2. **Search** across names and text in the library window; Enter opens the first hit.
3. **Category picker** with counts, plus "★ Favorites" and "Most used" views.
4. **Blanks with defaults**: `{{tone=friendly}}` comes prefilled.
5. **Blanks with choices**: `{{tone|friendly,bold,dry}}` becomes a dropdown (first choice is the default).
6. **Remembered answers**: short blanks (track, artist, title…) offer what you typed last time.
7. **Favorites** (☆ in the editor): favorites come first in the `/` menu of every chat. `/prompt-fav <name>`
8. **Use counts** shown next to prompts you use; "Most used" sorts by them.
9. **Token estimate** of a prompt and a list of its blanks under the editor.
10. **Double-click a prompt** to fill it in and put it in the open chat's message box.
11. **Presets never overwrite your prompts**: editing a preset saves your own copy, deleting one hides it, new presets appear on their own; your 10 old prompts are kept as they are (no duplicates).
12. **Reset to preset** for a preset you edited, and **Show hidden presets** to bring hidden ones back.
13. **Duplicate** a prompt as a starting point for a variant.
14. **Import** prompts from a Hearth export, a JSON list, or Markdown / text files (one prompt per file); same name + same text is skipped, a clash gets "(imported)". `/prompt-import`
15. **Export** your prompts (right-click Export for everything, presets included). `/prompt-export [all]`
16. `/prompts [search|category]` opens the library there.
17. `/prompt-new [name]` starts a new prompt.
18. `/prompt-save-last [name]` saves the last message you sent in this chat as a prompt.
19. `/prompt-list [category]` lists categories (with counts) or one category's prompts in the chat.
20. `/prompt-show <name>` prints a prompt's text and its blanks.
21. `/prompt-random [category]`: a random prompt from a category, ready to fill in (when you need a spark).

### New prompt presets (159, in 11 categories)

**Coding**

22. Prompt preset "Refactor for readability" (blanks: language, code)
23. Prompt preset "Write tests" (blanks: style, code)
24. Prompt preset "Add error handling" (blanks: code)
25. Prompt preset "Make it faster" (blanks: code)
26. Prompt preset "Regex builder" (blanks: flavor, what)
27. Prompt preset "Convert code" (blanks: from, to, code)
28. Prompt preset "Explain an error message" (blanks: error, context)
29. Prompt preset "Write a function" (blanks: language, task)
30. Prompt preset "Code golf to clarity" (blanks: code)
31. Prompt preset "Electron IPC handler" (blanks: task)
32. Prompt preset "Debounce / throttle this" (blanks: situation, code)
33. Prompt preset "Name things better" (blanks: code)
34. Prompt preset "Find edge cases" (blanks: code)
35. Prompt preset "Write a CLI script" (blanks: task)
36. Prompt preset "JSON shape → code" (blanks: language, fields, json)
37. Prompt preset "Git help" (blanks: task)
38. Prompt preset "CSS layout fix" (blanks: problem, code)
39. Prompt preset "Commit message" (blanks: diff)
40. Prompt preset "Memory leak hunt" (blanks: code)

**Three.js & shaders**

41. Prompt preset "New visualizer sketch" (blanks: idea, mood, frame)
42. Prompt preset "Write a fragment shader" (blanks: effect, extra_uniforms)
43. Prompt preset "Explain this shader" (blanks: shader)
44. Prompt preset "ShaderMaterial from GLSL" (blanks: shader)
45. Prompt preset "Post-processing stack" (blanks: effects)
46. Prompt preset "Particle system" (blanks: count, behavior)
47. Prompt preset "Instanced mesh field" (blanks: count, shape)
48. Prompt preset "Camera choreography" (blanks: move)
49. Prompt preset "Raymarching scene" (blanks: scene)
50. Prompt preset "Noise flow field"
51. Prompt preset "Material look-dev" (blanks: look)
52. Prompt preset "Fix black screen" (blanks: code)
53. Prompt preset "GLSL noise toolbox"
54. Prompt preset "Port Shadertoy" (blanks: shader)
55. Prompt preset "Text in 3D" (blanks: text, style)
56. Prompt preset "Optimize for 60 fps" (blanks: code)
57. Prompt preset "Color grading in shader" (blanks: grade)
58. Prompt preset "Feedback / trails effect"
59. Prompt preset "Audio-reactive mapping ideas" (blanks: genre)
60. Prompt preset "Scene from a reference picture" (blanks: describe)
61. Prompt preset "Load and style a GLTF" (blanks: look)

**Music visuals**

62. Prompt preset "Visual concept for a track" (blanks: track, genre)
63. Prompt preset "Drop moment ideas" (blanks: time)
64. Prompt preset "Beat-sync plan" (blanks: structure)
65. Prompt preset "Palette for a mood" (blanks: mood)
66. Prompt preset "Loop-friendly idea" (blanks: bars, bpm, fps)
67. Prompt preset "Lyric video style" (blanks: lyrics)
68. Prompt preset "Album cover → visual" (blanks: cover)
69. Prompt preset "Genre visual language" (blanks: genre)
70. Prompt preset "Spectrum design alternatives"
71. Prompt preset "Build-up tension tricks"
72. Prompt preset "Shorts hook (first 2 s)" (blanks: track, platform)
73. Prompt preset "Visualizer series plan" (blanks: count)
74. Prompt preset "Map drums to motion" (blanks: bpm)
75. Prompt preset "Ambient / no-beat visual" (blanks: genre)
76. Prompt preset "Transitions between scenes" (blanks: count)
77. Prompt preset "Live set visual cues"
78. Prompt preset "Title card for a track" (blanks: track, artist, seconds, frame)
79. Prompt preset "Describe this sound visually" (blanks: sound)

**After Effects**

80. Prompt preset "Audio-driven expression" (blanks: property, channel)
81. Prompt preset "Wiggle with control" (blanks: property)
82. Prompt preset "Loop keyframes" (blanks: property, mode)
83. Prompt preset "Bounce / overshoot" (blanks: property)
84. Prompt preset "Text animator recipe" (blanks: effect)
85. Prompt preset "Render settings for platform" (blanks: platform)
86. Prompt preset "Batch rename layers script" (blanks: pattern)
87. Prompt preset "Beat markers script" (blanks: bpm, offset)
88. Prompt preset "Shape layer recipe" (blanks: shape)
89. Prompt preset "Fix slow comp" (blanks: details)
90. Prompt preset "Camera shake expression"
91. Prompt preset "Kinetic typography plan" (blanks: text, bpm)
92. Prompt preset "Color match two shots" (blanks: a, b)

**Game dev & Forgeheart**

93. Prompt preset "Design a new enemy" (blanks: role)
94. Prompt preset "Design a unique item" (blanks: slot)
95. Prompt preset "Balance pass on numbers" (blanks: numbers, problem)
96. Prompt preset "Boss fight design" (blanks: stage)
97. Prompt preset "Progression curve check" (blanks: data)
98. Prompt preset "Game feel juice list" (blanks: action)
99. Prompt preset "Playtest questions" (blanks: feature)
100. Prompt preset "Bug report → fix plan" (blanks: report)
101. Prompt preset "Tutorial text" (blanks: steps)
102. Prompt preset "Achievement ideas"
103. Prompt preset "Factory system idea" (blanks: goal)
104. Prompt preset "Affix brainstorm" (blanks: slot)
105. Prompt preset "Store page copy"
106. Prompt preset "Save-data migration" (blanks: change)
107. Prompt preset "Performance in the game loop" (blanks: count, code)
108. Prompt preset "Debug-patch request" (blanks: change, name)

**Writing**

109. Prompt preset "Rewrite clearer" (blanks: tone, text)
110. Prompt preset "Fix grammar only" (blanks: text)
111. Prompt preset "Translate" (blanks: language, text)
112. Prompt preset "TL;DR + key points" (blanks: text)
113. Prompt preset "Write an email" (blanks: to, subject, goal, tone)
114. Prompt preset "Reply to this message" (blanks: intent, tone, message)
115. Prompt preset "Make it more vivid" (blanks: words, text)
116. Prompt preset "Outline an article" (blanks: topic, audience)
117. Prompt preset "Bio in three lengths" (blanks: role, facts)
118. Prompt preset "Explain like I'm 12" (blanks: topic)
119. Prompt preset "Tone check" (blanks: target, text)
120. Prompt preset "Headline variations" (blanks: topic)

**Social posts & captions**

121. Prompt preset "Caption for a visual" (blanks: count, title, vibe)
122. Prompt preset "YouTube Shorts title + description" (blanks: track, artist)
123. Prompt preset "TikTok caption + hook text" (blanks: title)
124. Prompt preset "Instagram carousel text" (blanks: count, title)
125. Prompt preset "Hashtag set" (blanks: topic)
126. Prompt preset "Credit the artist" (blanks: track, artist)
127. Prompt preset "Behind the scenes post" (blanks: title)
128. Prompt preset "Thread about a technique" (blanks: technique)
129. Prompt preset "Reply to a comment" (blanks: tone, comment)
130. Prompt preset "Weekly content plan" (blanks: platforms)
131. Prompt preset "Repurpose one visual" (blanks: title)
132. Prompt preset "Profile bio" (blanks: what)
133. Prompt preset "Collab pitch to an artist" (blanks: artist, track, style)
134. Prompt preset "Thumbnail text ideas" (blanks: topic)
135. Prompt preset "itch.io / devlog social blurb" (blanks: devlog)
136. Prompt preset "Post-performance review" (blanks: title, stats)
137. Prompt preset "Alt text for a frame" (blanks: describe)
138. Prompt preset "Caption in two languages" (blanks: title)

**Review & critique**

139. Prompt preset "Critique my visual" (blanks: describe)
140. Prompt preset "Code review" (blanks: code)
141. Prompt preset "Second opinion on a plan" (blanks: plan)
142. Prompt preset "Review my writing" (blanks: text)
143. Prompt preset "UI / UX review" (blanks: describe)
144. Prompt preset "Compare two options" (blanks: a, b, goal)
145. Prompt preset "Red team this idea" (blanks: idea)
146. Prompt preset "Check my math" (blanks: math)
147. Prompt preset "Thumbnail critique" (blanks: describe)
148. Prompt preset "Game design review" (blanks: mechanic)
149. Prompt preset "Accessibility check" (blanks: describe)
150. Prompt preset "Rate it 1–10 with reasons" (blanks: criteria, thing)

**Planning**

151. Prompt preset "Break into tasks" (blanks: project)
152. Prompt preset "Plan my day" (blanks: must, nice, hours)
153. Prompt preset "Weekly review" (blanks: shipped, slipped)
154. Prompt preset "Release checklist" (blanks: what)
155. Prompt preset "Decide between options" (blanks: options)
156. Prompt preset "Project kickoff" (blanks: project)
157. Prompt preset "Estimate effort" (blanks: task)
158. Prompt preset "Roadmap for a month" (blanks: project)
159. Prompt preset "Learning plan" (blanks: weeks, skill)
160. Prompt preset "Meeting / call prep" (blanks: topic, who)
161. Prompt preset "Unblock me" (blanks: problem, tried)
162. Prompt preset "Turn notes into actions" (blanks: notes)

**Learning**

163. Prompt preset "Teach me a concept" (blanks: concept)
164. Prompt preset "Quiz me" (blanks: topic)
165. Prompt preset "Explain the math" (blanks: thing)
166. Prompt preset "Cheat sheet" (blanks: topic)
167. Prompt preset "Compare concepts" (blanks: a, b)
168. Prompt preset "Reverse-engineer an effect" (blanks: describe)
169. Prompt preset "Glossary" (blanks: field)
170. Prompt preset "Exercises" (blanks: skill)

**Everyday**

171. Prompt preset "Continue"
172. Prompt preset "Shorter answer" (blanks: lines)
173. Prompt preset "Step by step"
174. Prompt preset "Give me options" (blanks: count, thing)
175. Prompt preset "Pros and cons" (blanks: thing)
176. Prompt preset "Make a table" (blanks: text)
177. Prompt preset "Extract to JSON" (blanks: fields, text)
178. Prompt preset "What am I missing?"
179. Prompt preset "Check before you answer" (blanks: topic)
180. Prompt preset "Recap this chat"

## Agent presets & personas (＋ in the rail, `/agent-new`)

181. **Grouped preset list** in the add-agent dialog: Agents, Personas (42), Websites.
182. **Browse…** button: a searchable card picker for every preset (name, instructions, site).
183. `/agent-new [preset]` opens the add-agent dialog already filled from a preset (or the picker when nothing matches).
184. `/agent-presets [search]` (also `/personas`) lists presets and personas with their instructions.
185. Ctrl+K → "Agent presets & personas…" opens the picker.
186. Personas are short (one or two sentences, sent with each message) and only set model / effort where it clearly helps (haiku + low effort for quick jobs, opus + high for "Deep thinker").

### Personas (42)

187. Persona "Shader guru": You are a GLSL and three.js shader expert. Answer with working shader code first, then a short note on the key uniforms. Prefer cheap, good-looking techniques.
188. Persona "Beat-sync director": You plan music visuals that hit on the beat: song sections, what reacts to kick, snare and highs, drops and transitions. Be concrete (bars, ms, values).
189. Persona "Caption writer": You write short social captions, titles and hashtags for music visuals (Shorts, TikTok, Reels). No cringe, max one emoji, always offer 3–5 options.
190. Persona "Code reviewer": You review code like a senior engineer: bugs first, then risks, then style. Be brief; show fixes as small diffs.
191. Persona "Game designer": You are a game designer for a browser survivor game with loot forging and drones (Forgeheart). Give concrete mechanics, numbers and counterplay.
192. Persona "Debugger": You debug methodically: restate the symptom, list likely causes ranked, give the fastest check for each, then the fix. Ask for the error text if missing.
193. Persona "Three.js mentor": You teach three.js by building: small runnable snippets, one concept at a time, explaining why. The user makes music visualizers and is not a programmer.
194. Persona "After Effects expert": You are an After Effects expert: expressions, ExtendScript, shape layers, render settings. Give exact property paths and values.
195. Persona "Palette advisor": You are a color designer. Answer with palettes as hex codes (role of each: background, main, accent, highlight) and why they work. Check contrast.
196. Persona "Devlog writer": You write friendly itch.io devlogs and patch notes for Forgeheart: short intro, bullets players care about, one line on what's next.
197. Persona "Balance analyst": You analyze game balance numbers: find outliers, power spikes and dead zones, then propose exact new values and what to playtest.
198. Persona "Translator FR ↔ EN": Translate between French and English naturally, keeping tone and formatting. Only output the translation unless asked.
199. Persona "Proofreader": Fix spelling, grammar and clarity without changing the author's voice. Output the corrected text, then a very short list of changes.
200. Persona "Brainstormer": You generate many varied ideas fast: lists of 10–20, mixing safe and wild ones, then mark your top 3. No long explanations.
201. Persona "Producer / planner": You turn goals into small ordered tasks (under 2 h each), spot risks and keep scope small. End with the next action.
202. Persona "Rubber duck": Help the user think by asking one short, sharp question at a time. Don't give the answer unless they ask for it.
203. Persona "Explainer": Explain things simply, like to a curious 12-year-old: one everyday analogy, no jargon, then one line of the real term.
204. Persona "Social strategist": You plan content for a music-visuals account: hooks for the first 2 seconds, formats, posting rhythm, what to test next. Data-minded, concise.
205. Persona "Art director": You critique visuals like an art director: composition, color, motion, rhythm, readability on a phone. Give the 3 changes with the biggest impact.
206. Persona "Music theory helper": You explain music structure for visual timing: BPM, bars, sections, keys, energy curve. Give timings in bars and seconds.
207. Persona "Script smith": You write small, dependency-free scripts (Node.js, PowerShell, bash, ExtendScript) that just work. Add a usage line and handle errors.
208. Persona "Electron helper": You help with a plain-JS Electron app (no npm, contextBridge preload, IPC). Keep changes small, safe and in the existing style.
209. Persona "Performance doctor": You find and fix performance problems (render loops, allocations, draw calls, layout thrash). Measure first, then the biggest win.
210. Persona "Store page writer": You write store pages and pitches (itch.io, Steam-style): a hook line, short description, feature bullets, tags. Punchy and honest.
211. Persona "Namer": You name things: tracks, visuals, items, features, projects. Give 15 options in mixed styles and mark your top 3.
212. Persona "Summarizer": Summarize what you are given: a one-line TL;DR, then key points, then action items. Never add facts that are not there.
213. Persona "Email writer": You write clear, friendly emails and DMs under 150 words, with a subject line. Match the requested tone.
214. Persona "Learning coach": You teach by quizzing: one question at a time, wait for the answer, explain mistakes kindly, adapt the difficulty.
215. Persona "Devil's advocate": Argue against the user's idea or plan as strongly as possible, then say which objections really matter and how to address them.
216. Persona "UX reviewer": Review interfaces for clarity, clutter, discoverability and accessibility. List fixes by impact; keep the app compact.
217. Persona "Lore writer": You write game lore, item flavor text and names for Forgeheart (forges, drones, rifts). Short, evocative, consistent.
218. Persona "Sound design advisor": You advise on sound design and mixing for games and visuals: layers, envelopes, EQ, impact. Practical and specific.
219. Persona "Motion designer": You design motion: easing, timing, anticipation, overshoot, staggering. Give curves as cubic-bezier values and durations in ms or frames.
220. Persona "Prompt engineer": You write prompts for image, video and music AIs (Midjourney, Runway, Suno…) and for chat agents. Give the prompt, then 2 variations.
221. Persona "Commit & PR writer": Write clear commit messages (subject of 60 chars max + short body) and pull request descriptions from the diff or notes you are given.
222. Persona "Data analyst": You analyze CSV / JSON data: describe it, find patterns and outliers, and answer with small tables. Say when the data can't support a claim.
223. Persona "Video editor": You advise on editing and pacing: cut points on the beat, hook, length per platform, transitions, export settings.
224. Persona "Quick answers": Answer in as few words as possible. No preamble.
225. Persona "Deep thinker": Think carefully and thoroughly before answering. Consider alternatives, state assumptions, then give a clear recommendation.
226. Persona "Forge playtester": You playtest the live Forgeheart debug game: set up situations, check numbers with forge_status, take screenshots, and report what feels off with exact values.
227. Persona "Astra coder": You are a careful coding assistant. Give complete, working code and a one-line summary of what changed.
228. Persona "Astra second opinion": Give an independent second opinion on what you are shown: what is right, what is wrong, what you would do differently. Be direct.

### More website presets (16)

229. Website preset Poe (https://poe.com/)
230. Website preset HuggingChat (https://huggingface.co/chat/)
231. Website preset Meta AI (https://www.meta.ai/)
232. Website preset Pi (https://pi.ai/)
233. Website preset Phind (https://www.phind.com/)
234. Website preset You.com (https://you.com/)
235. Website preset NotebookLM (https://notebooklm.google.com/)
236. Website preset Google AI Studio (https://aistudio.google.com/)
237. Website preset Suno (https://suno.com/)
238. Website preset Midjourney (https://www.midjourney.com/)
239. Website preset Runway (https://app.runwayml.com/)
240. Website preset Shadertoy (https://www.shadertoy.com/)
241. Website preset three.js docs (https://threejs.org/docs/)
242. Website preset YouTube Studio (https://studio.youtube.com/)
243. Website preset itch.io dashboard (https://itch.io/dashboard)
244. Website preset GitHub (https://github.com/)

## Notes (Ctrl+J, `/note`)

245. **Search** notes (words or `#tag`) from the box in the Notes header.
246. **#tags** anywhere in a note's text; tag chips under the list filter by tag.
247. **Pin** (📌) notes to the front of the list.
248. **Checklists**: `- [ ]` items become checkboxes in Preview; ticking one updates the note.
249. **Ctrl+Enter** in the editor ticks / unticks the checklist item on the cursor's line (or turns the line into one).
250. **Checklist progress** (☑ done/total) in the footer next to the word count (the word count now also updates while you type).
251. **[[Note links]]**: `[[Title]]` in a note opens that note from Preview (or creates it).
252. **Templates** behind ＋ New (12, listed below).
253. **Daily note**: ⋯ → Today's daily note, made from the Daily template once a day. `/daily-note`
254. **Link the open chat** to a note (⋯ menu); the link chip under the note brings you back to the chat. `/note-link`
255. **Link a Lab sketch** to a note (⋯ menu); the chip opens the Lab.
256. **Duplicate** a note (⋯ menu).
257. **Save a note as a prompt** (⋯ menu).
258. **Send a note to the open chat** as a draft (⋯ menu). `/note-send [note]`
259. **Export all notes** to one Markdown file, and **import** Markdown / text files (an export splits back into its notes; duplicates skipped). `/note-export`, `/note-import`
260. **Undo** after deleting a note.
261. **Right-click a note chip** for its ⋯ menu.
262. **Inbox quick capture**: `/note <text>` adds a timestamped line to a pinned "Inbox" note.
263. `/todo <text>` adds a checklist item to the Inbox.
264. `/notes [search|#tag]` opens Notes on the first match.
265. `/note-new [template]` makes a note from a template.
266. `/note-find <words|#tag>` lists matching notes with a snippet in the chat.
267. `/note-pin [note]` pins / unpins.
268. `/note-reply` saves the last reply of this chat to your notes.
269. `/note-chat` saves the whole chat as a new Markdown note.

### Note templates

270. Daily note (today, notes, ideas, #daily)
271. Visual idea (track, mood, palette, frame, what reacts to what)
272. Track breakdown (BPM, key, section table with bars)
273. Shot list (formats checklist, thumbnail, loop)
274. Bug report (where, build, steps, expected / actual)
275. Devlog draft (new, changes, fixes, next)
276. Call / meeting (notes, decisions, action checklist)
277. Checklist
278. Weekly review (shipped, slipped, next week)
279. Social post plan (platform, hook, caption, hashtags, export checklist)
280. Release notes (highlights, balance, fixes, release checklist)

## Memory (🧠, `/memory`)

281. **Fact view**: every memory line is a fact you can edit in place (Enter saves).
282. **Categories** (Preference, Project, Style, Tools & setup, People, Fact), guessed from the words when a fact is added, changeable per fact.
283. **Search, category filter and "who remembers it" filter**.
284. **Pin** a fact: pinned facts go first in what the agent reads and never expire. `/memory-pin <words>`
285. **Expiry**: forget a fact tomorrow, in a week, a month, 3 months or on a date. `/memory-expire <words> <days>`
286. **Expired facts are dropped at start-up**, with an Undo toast.
287. **Move a fact** between "all agents" and one agent.
288. **Forget with Undo** (× on a fact).
289. **Cost preview**: pills show the tokens memory adds to every message for each agent (shared + its own + the auto-memory instruction), amber when heavy, with today's total in the tooltip. `/memory-cost`
290. **Token count per group** (all agents / each agent) in the fact list.
291. **The 🧠 button's tooltip** shows the per-message cost.
292. **Add a fact** from the bottom row, for all agents or one.
293. **Import** an export or a plain text list (merges, duplicates skipped) and **export** with categories, pins and expiry. `/memory-import`, `/memory-export`
294. `/remember [all:] <fact> [--pin] [--days N]` (registered only if the chat stream hasn't taken the name).
295. `/forget <words>` (asks first when several facts match; same name rule).
296. `/memory-list [search]` lists facts with who, category, pin and expiry.

## Kit window (Ctrl+K → Kit…, `/kit [tab]`)

297. **One Kit window** with every tool in tabs: Color, Palette, Harmony, Contrast, Gradient, Easing, BPM ↔ ms, Frames, Timecode.
298. **Palette from a picture** (k-means on the image, 4–8 colors).
299. **Palette from the clipboard** (a copied picture or hex codes).
300. **Palette from the Lab frame** (what the Three.js Lab shows now).
301. **Paste hex codes / a Coolors link** to make a palette.
302. **Sort light → dark** and **smooth OKLab ramp** for any palette.
303. **Copy as** hex list, JS array or CSS variables.
304. **Save to the Lab's 🎨 palettes** (they show up under the Lab's saved palettes). `/lab-palette <name> [hex…]`
305. **Harmony tool** with 9 schemes: complementary, analogous, triadic, split complementary, tetradic, rectangle, monochrome, muted, neon pop. `/harmony <color>`
306. **Harmony → Lab** in one click per scheme.
307. **Contrast checker**: ratio, AA / AAA badges for text and large text, live sample. `/contrast <text> <bg>`
308. **Nearest readable color** suggestion when contrast fails, with "Use it".
309. **Gradient tool**: linear / radial / conic, angle, live preview. `/gradient <colors…>`
310. **OKLab smoothing** for gradients (no muddy middle).
311. **Gradient as GLSL** function, **three.js CanvasTexture** code and CSS.
312. **Easing: closest GSAP built-in** ease named for any curve, with how close it is.
313. **Easing as GLSL** function and as a **three.js keyframe track** snippet.
314. **Save your own easing curves** ("＋ Save this curve…", listed under "Yours").
315. **BPM ↔ ms**: note lengths (bar to 1/32) straight, dotted and triplet, in ms, frames at 30/60 fps and Hz. `/bpm 128`
316. **Tap tempo** (button, or T while the tab is open).
317. **ms → BPM** for a beat or any note length. `/bpm 469ms`
318. **Frames tool**: social and video formats with UI safe zones drawn (red bands) and rule-of-thirds lines. `/frame tiktok`
319. **Ratio solver**: "16:9 1280", "9:16 h1920", "2.39:1". `/frame 16:9 1280`
320. **Frame info**: ratio, megapixels, odd-size warning, formats of the same shape, safe area per platform, three.js `setSize` code.
321. **Timecode calculator**: hh:mm:ss:ff, m:ss, seconds, ms, frames, bars and beats joined with + and −. `/tc 00:01:00:00 + 12f - 2s`
322. **Drop-frame timecode** for 29.97 / 59.94.
323. **Bars / beats in time math** at your BPM (`8 bars @128bpm`), with the result in beats and bars too.
324. `/color <any color>` prints every format (hex, three.js, GLSL, AE…).
325. `/palette [hex…|picture path]` makes a palette in the chat (or opens the tab).
326. `/ease <preset|x1,y1,x2,y2>` prints CSS, GSAP and AE influence for a curve.
327. Ctrl+K: "Kit: color, palette…", "Kit: easing curves", "Kit: BPM ↔ ms", "Kit: frame sizes & safe zones", "Kit: timecode calculator".

### Easing presets (new)

328. In / Out / In-out sine
329. In / Out / In-out quad
330. In / Out cubic
331. In / Out / In-out quart
332. In / Out quint
333. In expo, In-out expo
334. In / Out / In-out circ
335. In-out back
336. Material standard, decelerate, accelerate, emphasized
337. Whip (fast middle)
338. Beat hit (instant attack)
339. Lazy drift
340. Slam in (drop)

### Frame formats (with safe zones)

341. YouTube Shorts 1080×1920
342. TikTok 1080×1920
343. Instagram Reels 1080×1920
344. Instagram / FB Story 1080×1920
345. Instagram feed 4:5 1080×1350 (with the 3:4 profile-grid crop)
346. Square 1:1
347. YouTube 1080p (title-safe)
348. YouTube 4K
349. X / Bluesky 16:9
350. YouTube thumbnail (duration badge corner)
351. Cinemascope 2.39:1
352. itch.io cover 630×500

## Forge Debug (live game) and Forgeheart

353. **⋯ menu** in the game bar: start, heal, kill all, boss, spawn (type, count, strength), +1M gold, next stage, go to stage, stat watch, watch an expression, snapshots, patch sets, run code, export / import patches.
354. **Stat watch overlay** on the game (stage, gold, HP, enemies, DPS), refreshed every second while visible; remembered on/off.
355. **Watch any expression** (`S.inv.length`, `C.boss?.hp`…); right-click a row to remove it. `/forge-watch [expr|on|off|reset]`
356. **Snapshots**: keep the debug game's whole save under a name and come back to it later (only the debug partition, never your normal game). `/forge-snap [name]`, `/forge-restore [name]`, `/forge-snaps`
357. **Patch sets**: save the enabled patches as a named set and switch sets in one go (the game reloads). `/forge-set save|use <name>`
358. **Turn one patch on / off** from the chat (on applies it right away). `/forge-patch <name> [on|off]`
359. **Export / import patches** (with their sets) as JSON; imported ones start off.
360. **Run code** in the game from the ⋯ menu, result in the log. `/forge-eval <code>`
361. **The log says who did it**: "You:" for your actions, "Claude:" for the agent's.
362. **Commands open Forge Debug and wait for the game** when it isn't loaded yet.
363. `/forge-status` (stage, gold, HP, enemies, gear…)
364. `/forge-spawn [type|boss] [count]` (enemy types complete from the game)
365. `/forge-heal`, `/forge-kill`, `/forge-boss`, `/forge-next`, `/forge-start`
366. `/forge-god [on|off]`, `/forge-oneshot [on|off]`, `/forge-pause`
367. `/forge-speed <x>`, `/forge-stage <n>`, `/forge-gold <amount>` (accepts 5k / 2m)
368. `/forge-reload`, `/forge-patches`
369. `/forge-shot`: a screenshot of the game attached to your next message.
370. `/forge [tab]` opens the Forgeheart workspace on a tab.
371. `/forge-chat [question]` starts a Forgeheart chat with the project brief.
372. `/forge-task <task> [#tag] [!1-3]` adds a task (tag and priority parsed); with no text it lists open tasks.
373. `/forge-devlog start|stop <what you did>|status` drives the devlog timer.
374. New persona "Forge playtester" (game tools on) in the presets.

## Backups, restore, trash, downloads, import

375. **Back up now** in one click to a backup folder (default Documents/Hearth backups), no dialog. `/backup`
376. **Keeps the last 10** backups; older ones go to the Recycle Bin / Trash.
377. **Backups window**: list, Show, Restore…, change the folder, "Save a copy as…". `/backups`
378. **Automatic backups** (Off / Daily / Weekly / Monthly) in the Backups window, done quietly a little after start-up.
379. **Restore that merges**: shows what a backup would add first (chats, tool data, memory lines, attachments), adds what's missing and never deletes anything of yours. `/restore [zip]`
380. **Replace with newer** (optional): chats the backup has a newer version of replace yours, which are kept in data/trash first.
381. **Agents in the backup that you don't have** are listed (config is never overwritten).
382. **Recently deleted chats**: search, Peek (first messages), Restore, Restore all, delete for good and Empty (to the Recycle Bin / Trash), days left per chat. `/trash [search]`, `/trash restore <title>`
383. **Downloads**: a searchable list that survives restarts (last 100), progress bars, Open / Show, "Try again" in the browser for failed ones, copy link, open the folder, clear the list; updates live. `/downloads [search]`
384. **Import checks first**: what's new, duplicates inside the export, chats already imported, empty ones, date range and examples, before anything is saved. `/import [path]`
385. **Import progress** in a toast (n / total).
386. **claude.ai variants**: content blocks (text, thinking skipped, tool use noted), pasted text / attachments (their text, cut at 4,000 characters) and file names.
387. **ChatGPT variants**: trees without a current node (newest branch), images / voice parts, code blocks, quotes, hidden system messages and tool calls skipped.
388. **Export shapes**: split files (conversations-000.json…), a wrapped `{ conversations: [...] }`, a single conversation, and generic / Hearth chat JSON files.
389. **One broken conversation no longer stops an import** (counted as unreadable).
390. The **Import past chats…** button uses the same check-then-import flow.
391. Ctrl+K: "Backups…", "Back up now", "Restore from a backup…".

---
**Total: 391 upgrades.**
