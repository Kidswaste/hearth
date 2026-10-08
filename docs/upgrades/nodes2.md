# Nodes, round 2: everything that can be visual code gets nodes

Three new node views on the shared editor (`nodes.js`): **Shader nodes** (GLSL as nodes, live preview, into the
playground or the Lab), **Video flows** (Video Review's render → review → notes → export pipeline as runnable
nodes) and the **Code flow** view (any JS / TS / Python / GLSL from a chat as functions and calls). All of them are
chat-command driven and live behind existing controls (a small button or segment, ⋯ menus, Ctrl+K, chat).

## The editor (nodes.js), shared by every node view
1. Fixed: the chat's code blocks now really show their **Nodes** button and ⋯ → "Open in the node view" (the editor was not reachable as `window.NodeView`), and `/code <n> nodes` works.
2. Run status on nodes: queued ◌, running ◐ (spinning), done ✓, warning !, failed ✕, skipped –, waiting ⏸, each with its own outline color.
3. A one-line result under each node after a run (output file, time, error).
4. A progress bar along the bottom of a running node (exports report their percentage).
5. Wires into the step that is running flow, so you see where the run is.
6. Bypass a node (M or right-click → Bypass): it is skipped and its input passes straight through (works in the Lab's nodes too).
7. Bypassed nodes look switched off (striped, dimmed, a "skip" tag).
8. Hover a node: its wires light up and the rest dim.
9. `[` selects everything that feeds the selection, `]` everything it feeds (also in the right-click menu).
10. Node badges in the header (the operation, preset, line range…).
11. New widget: chips (choose several options).
12. New widget: from–to range (drag either end, click to type).
13. New widget: text with a ▾ list of suggestions (recent renders, AE projects, scripts, templates).
14. New widget: a button inside a node.
15. New widget: read-only text / code excerpt.
16. New widget: color list (gradients and palettes: click a swatch, ＋ adds, right-click removes).
17. Adapters can add buttons next to ＋ ⋯ (▶ Run / ■ Stop in video flows).
18. A "read-only" pill on read-only graphs.
19. Read-only graphs can still be arranged by dragging (code flow).
20. Read-only graphs: double-click or Enter opens what a node stands for.
21. Read-only graphs get their own right-click menu (open, select what feeds it / what it feeds, collapse, fit).
22. Read-only keys: H collapse, F fit the selection, 1 / + / − zoom, ? keys sheet (its own list).
23. Adapters add their own items to a node's right-click menu (Run up to here, Copy its code…).
24. One shared, searchable preset picker for every node view: arrow keys + Enter, multi-word search, a tag (filter) and the chat command on each card. The Lab's node presets use it too.
25. Node dialogs can carry a side panel (shader preview, code panel).
26. Node dialogs always clean up when closed (no invisible dialogs left behind).
27. Opening code as nodes reports errors in a toast instead of failing silently; node views are asked in order (a catch-all comes last).
28. The ⚡ "slider" marks and menu items only show where knobs really become sliders.
29. Lab: a layer made with Shader nodes shows "This layer was made with Shader nodes · Open in Shader nodes" in the Lab's Nodes view (Apply writes back to that layer).

## Shader nodes (nodes-shader.js) — GLSL fragment shaders as nodes
Open: the playground's new **◇ Nodes** button, `/shader-nodes`, Ctrl+K → "Shader nodes".
30. A node editor with a live preview on the right (its own WebGL2 canvas).
31. Preview at 16:9, 9:16, 1:1 or 4:5.
32. Pause / play the preview.
33. Simulated music in the preview (kick on every beat, snare on 2 and 4, hats on 8ths) at a tempo you set.
34. "Lab still": preview filters on a still of the Three.js Lab instead of the test card.
35. "Code": the GLSL (or Lab code) the graph makes, live, under the preview.
36. Compile errors land on the node that caused them (red) and in the status line.
37. Status line: nodes, wires, sliders.
38. Dragging a knob updates the preview instantly (uniforms, no recompile).
39. Apply: writes the shader where it came from (the playground or a Lab layer).
40. Send to…: playground, new Lab filter layer, new Lab layer, new Lab sketch, Shadertoy, copy.
41. "Apply as you edit" (⋯): the linked playground / layer follows every change.
42. The playground's own hand-written shader is kept: replacing it shows an Undo.
43. Copy the GLSL for the playground.
44. Copy for Shadertoy (`mainImage`, iTime, iResolution, iMouse, iChannel0).
45. Copy the graph as JSON.
46. Save a preview picture (PNG).
47. Presets are also in the node picker (Tab).
48. Compiles to the shader playground (GLSL ES 3.0, music simulated at 120 bpm).
49. Compiles to a **Lab filter layer**: restyles every layer below it with the song's kick / snare / hats / hit / beat / bass / level / drop (the sandbox gained `filter.define`).
50. Compiles to a **Lab layer**: a full-screen shader that follows the song.
51. Compiles to a new Lab sketch.
52. Every knob becomes a Lab slider (Save, Shuffle, looks, keyframes work), grouped "Shader Music / Shapes / Color…" or by your frames.
53. The graph rides in the code's last line: the playground's ◇ Nodes, the Lab layer card and `NodeView.openCode` reopen it.
54. The preview follows the mouse (Mouse node).
55. Ctrl+K → "Shader nodes: open the editor" and "Shader nodes: presets…".

### Shader node types (91)
56–64. Input (9): UV (0..1, centered, pixels), Polar, Time (time, sine, loop), Mouse, Resolution / aspect, Number, Color, Position, Random per pixel.
65–70. Music (6): Hits (kick, snare, hats, hit), Music levels (bass, level, beat), Beat phase (+ pulse), Drop, Music → number (source × amount + base), Hit shape.
71–86. Math (16): Math (+ − × ÷ min max pow mod atan2 step), Function (sin, cos, abs, fract, sqrt, exp, log, one minus, 0..1 ↔ -1..1…), Mix numbers, Remap, Clamp, Smooth step (either direction), Threshold, Oscillator (sine / triangle / saw / square), Curve (power, smooth, gain, bias), Steps, Distance, Split position, Make position, Position math, Random (hash), Expression (your own GLSL with a, b, uv, p, t).
87–99. UV & distort (13): Move · scale · rotate (+ spin), Tile (+ tile id), Mirror (4 ways), Kaleidoscope, Twirl, Wave warp, Noise warp (domain warp), Polar UV (+ tunnel UV), Pixelate, Zoom pulse (on the kick), Bulge · pinch, Ripple, Centered → UV.
100–106. Noise (7): Value noise, Simplex noise, Fractal noise / fbm (3–7 octaves, value or simplex), Voronoi cells (distance, edges, cell id), Ridged noise, Turbulence, Grain.
107–121. Shapes (15): Circle, Ring, Box (rounded), Polygon, Star, Heart, Line, Combine shapes (smooth union, union, cut out, overlap), Fill, Glow · outline (neon), Stripes, Checker, Grid lines, Dot grid, Gradient (linear, radial, angular, diamond).
122–136. Color (15): Palette (10 cosine palettes: rainbow, sunset, ocean, neon, fire, ice, vapor, forgeheart, acid, candy), Color ramp (your own colors, smooth or steps), Hue · saturation · value, Shift hue (+ cycle), Brightness · contrast · saturation, Invert, Posterize, Gamma, Brightness of, Make color, Split color, Duotone, Vignette, Tone map (ACES), Colorize.
137–140. Mix & blend (4): Mix colors, Blend (normal, add, multiply, screen, overlay, difference, lighten, darken, soft light, subtract), Add glow, Mask.
141–145. Picture (5): Picture below, RGB split, Blur, Edges (Sobel), Previous frame (trails / feedback in filter layers).
146. Output (color + opacity).

### Shader presets (22)
147. Plasma waves · 148. Kick tunnel · 149. Voronoi beat cells · 150. Nebula clouds · 151. Kaleido mandala · 152. Neon ring pulse · 153. Synthwave sun · 154. Liquid chrome · 155. Disco checker · 156. Starburst · 157. Ripple pond · 158. Heartbeat · 159. LED wall · 160. Retro grid · 161. Fire · 162. RGB glitch filter · 163. VHS wobble filter · 164. Duotone pulse filter · 165. Kaleidoscope filter · 166. Edge glow filter · 167. Echo trails filter · 168. Empty graph.

### Shader chat commands (area "Shader nodes")
169. `/shader-nodes [playground]` — open the editor (linked to the playground).
170. `/shader-nodes-new <preset>` — start from a preset (suggestions while you type).
171. `/shader-nodes-presets [filter]`.
172. `/shader-nodes-types [filter]` — node types (with a filter: inputs and outputs).
173. `/shader-nodes-list` — nodes, changed values, wires.
174. `/shader-nodes-add <type> [field=value…] [to=node.input]`.
175. `/shader-nodes-link <node.output> <node.input>`.
176. `/shader-nodes-unlink <node.input>`.
177. `/shader-nodes-set <node> field=value…`.
178. `/shader-nodes-rm <node…>`.
179. `/shader-nodes-bypass <node…>`.
180. `/shader-nodes-layout`.
181. `/shader-nodes-undo`.
182. `/shader-nodes-apply`.
183. `/shader-nodes-to playground|filter|layer|sketch|shadertoy|copy` (reports Lab errors back in the chat).
184. `/shader-nodes-code [playground|filter|layer|shadertoy]` — the generated code in the chat.

## Video flows (nodes-video.js) — the Video Director pipeline as runnable nodes
Open: Video Review's slim segmented control → **Flow** (next to Review · Director · Toolkit), `/video-nodes`.
185. A Flow view in Video Review: sources → steps → exports as nodes and wires.
186. ▶ Run executes the steps in order through Video Review's own API (the same code as its chat commands).
187. Live status on every step while it runs, and its result after (file name, timecode, error).
188. ■ Stop (cancels an export in progress).
189. "Wait for me" steps hand you the player with a bar: Continue · Stop · Flow (or `/video-flow-continue`).
190. Run up to here (a step and what feeds it).
191. Run from here (with the last run's results).
192. Steps that can't run (a failed or missing input) are skipped with the reason.
193. Bypass a step (M) to skip it on purpose.
194. Export progress shows on the export node.
195. "Only if notes" gates: the steps after it are skipped (not failed) when there's nothing to send.
196. ⋯ → As chat commands: the same flow as the chat commands that do each step.
197. Right-click a step → Copy its chat command.
198. Save a flow under a name; Saved flows… picker.
199. The flow you were building comes back next time.
200. The library steps aside while the flow shows (more room); Review in the segment goes back to the player.
201. Keys typed in the flow stay with the nodes (Space doesn't play the video).
202. New steps added from chat wire themselves to the last step that fits.
203. Ctrl+K → "Video: flow view (nodes)", "Video: flow presets…", "Video: run the flow".

### Video flow steps (35)
204–209. Sources (6): Open video, From the library (latest, latest Lab recording, latest favorite, #tag, by name), Lab recording, Other version (previous, newest, first), Video file, AE project (+ comp).
210–226. Review (17): Open in Review, Trim / loop (range, first N seconds, N beats, from the drop, off), Crop to format (+ offset), Safe-zone check (any platform, "Ask me"), Guide overlay, Wait for me, Add note (at a time, category), Open notes, Only if notes, Resolve notes, Carry notes over, Notes to a file (md / csv / json), Favorite, Tag, Contact sheet (+ attach to the director chat), Grab frame, Compare A / B (wipe, side, onion, difference…).
227–230. Export (4): Export preset (any of the 18 presets, crop / fit / blur, loop or all), Export all socials, Make a proxy, Show in folder.
231–233. After Effects (3): Render comp (aerender into your watched folder, output template), Run AE script, New AE comp (9:16 / 4:5 / 1:1 / 16:9).
234–238. Agents & chat (5): Send notes to an agent (director, Claude, Astra; + contact sheet; send right away), Ask an agent (a message about the video), Chat command (any /command as a step), Note in the chat, Pause.

### Video flow presets (18)
239. Export all 4 socials · 240. Review + send notes to director · 241. Render AE comp → compare with previous · 242. Lab recording → Reels · 243. Safe-zone pass · 244. Render → review → export · 245. 16:9 → verticals (blurred fill) · 246. Second opinion from Astra · 247. Carry notes to the newest version · 248. GIF + WebM loop for the web · 249. YouTube pack · 250. Proxy + review · 251. Crop 9:16 → feed 4:5 · 252. Notes → Markdown file · 253. Lab recording → ask the director · 254. Reels + feed pair · 255. Keep it (★ + tag + YouTube) · 256. Empty flow.

### Video flow chat commands (area "Video")
257. `/video-nodes [on|off]` · 258. `/video-flow <preset>` · 259. `/video-flow-run [node]` · 260. `/video-flow-stop` · 261. `/video-flow-continue` · 262. `/video-flow-presets [filter]` · 263. `/video-flow-list` (with the last run's status) · 264. `/video-flow-types [filter]` · 265. `/video-flow-add <type> [field=value…] [to=node.input]` · 266. `/video-flow-link` · 267. `/video-flow-set` · 268. `/video-flow-rm` · 269. `/video-flow-skip` · 270. `/video-flow-commands` · 271. `/video-flow-save <name>` · 272. `/video-flow-load <name>` · 273. `/video-flow-saved`.

## Code flow (nodes-code.js) — chat code as functions and calls
Open: a code block's **Nodes** button or ⋯ → "Open in the node view", `/code-nodes [n]`.
274. JavaScript, 275. TypeScript, 276. Python, 277. GLSL, read by a small hand-written tokenizer and parser (no libraries), robust to partial code (a reply still streaming, a cut snippet).
278. Functions, arrow functions and methods as nodes; calls as wires.
279. Classes as a node plus a frame around their methods; `new Class()` and `extends` wire to the class.
280. Module patterns (`const X = (() => { … })()`) and outer functions frame what's inside them.
281. Callbacks named by what registers them: "on resize", "every frame", "repeatedly", ".then(…)", "get /route"…
282. Top-level statements as a sequence down the left (short neighbouring statements grouped, named by what they declare).
283. `this.x()` / `self.x()` resolve to the method of the same class; a function passed along (`setTimeout(tick)`) counts as a call.
284. Imports (and GLSL uniforms / defines) in their own node.
285. TypeScript interfaces, types and enums as nodes.
286. GLSL: `main` / `mainImage` as the entry point, and which built-ins each function uses.
287. Recursion marked ↻.
288. Layout: columns by how far a function is from the top-level code; frames keep classes together.
289. Big files keep the top level and the biggest functions (it says how many were hidden).
290. Side panel: the selected node's code (highlighted), what it calls and what calls it (click to jump).
291. Light edit: Edit (or double-click / Enter) rewrites one function; Apply (Ctrl+Enter) updates the whole code and the graph.
292. Copy code (with your edits) · 293. Insert in my message · 294. Open in the Lab (three.js code) · 295. Shader playground (GLSL).
296. ⋯ → Copy the outline (Markdown) · 297. ⋯ → Statements only / everything.
298. Right-click a node → Copy its code / Edit it.
299. three.js code that carries a Lab node graph still opens in the Lab's Nodes; other code opens here.
300. `/code-nodes [n]` — the nth last code block of this chat as nodes.
301. `/code-nodes-paste` — the clipboard as nodes.
302. `/code-nodes-file <path>` — a code file as nodes.
303. `/code-outline [n]` — a code block as a text outline in the chat.
304. Ctrl+K → "Code: the clipboard as a flow of nodes".

## Tests
- `node dev/code-flow-test.js` — the parser on JS / TS / Python / GLSL samples, partial code and every app file.
- `node dev/smoke.js --script dev/checks/nodes-shader.js` — all 91 shader node types and 22 presets compile for the preview, the playground, Lab filter layers and Lab layers (WebGL1 + WebGL2); the editor and its commands.
- `node dev/smoke.js --eval "window.VIDS='<folder>'" --script dev/checks/nodes-video.js` (after `sh dev/make-test-videos.sh <folder>`) — flows built from chat run for real: open, loop, ffmpeg export, previous version → A/B compare, wait-for-me continued from chat, a gate.
- `node dev/smoke.js --fake-engines --script dev/checks/nodes-code.js` — the chat's Nodes buttons, the code flow view, side panel, light edit.
- `node dev/smoke.js --script dev/checks/nodes-lab.js` — Lab nodes, bypass, shader graphs as Lab layer + filter layer.

**Total: 304 upgrades.**
