# Nodes stream: visual coding with nodes and wires

A node-graph editor (`nodes.js`, `nodes.css`) and its first adapter, the Three.js Lab (`tools/three-nodes.js`).
In the Lab, the code pane has a small **Code | Nodes** switch (top right of the code pane, or Alt+N). A graph
compiles to an ordinary, readable sketch layer; its knobs are the Lab's sliders, so **Save, Shuffle, looks,
keyframes and music links keep working**. The graph rides in the code's last line, so it comes back every time.

## The Lab: Nodes ⇄ Code
1. Code | Nodes switch on the Lab's code pane (remembers your choice; Alt+N toggles; `/nodes`, `/nodes code`).
2. A graph compiles to normal sketch code (renderer, scene, camera implied), one commented block per node, readable and editable.
3. The graph is kept in the code's last line (`// @nodes:v1 {…}`): switching back to Nodes, reopening the sketch or the app brings it back.
4. Node knobs are Lab sliders (`tweak()`), grouped like your favourite groups (Music, Particles, Formation, Material, Colors, Camera, Post…).
5. Helpers (math, triggers, time) join the slider group of what they feed ("Bass → jitter" sits with the filter's sliders).
6. A frame drawn around nodes becomes their slider group (its title); presets set groups for you.
7. Right-click a knob → "Show as a Lab slider" on / off, per knob ("All sliders on / off" per node).
8. Dragging a knob that is a Lab slider moves the slider live (no rebuild while you drag); the code is written when you let go.
9. Save / Shuffle + Save in the sliders panel flow back into the node knobs (no conflict, no "edited" state).
10. Moving nodes, frames and notes saves the layout without re-running the sketch.
11. Code changed outside the nodes (by hand or by the director) → the nodes go read-only with a banner: "Rebuild code from nodes" or "Keep the code".
12. If the director rewrote a nodes layer from a shortened read, the graph is restored from memory (read-only until you choose).
13. Live values: every output that carries music / time / slider values shows its current value and a level bar while the sketch plays.
14. Flowing wires: wires that carry live values animate (toggle in ⋯ → Flowing wires).
15. Errors from the compiler mark the node red and show in the status line; the status line also counts nodes, wires and sliders.
16. The code pane gets wider while it shows nodes.
17. A code layer in Nodes shows a card: Presets…, Empty graph, New layer from a preset…, Outline.
18. Searchable preset picker (dialog with all presets; each card shows its chat command).
19. Presets are also in the node picker (Tab) under "Presets".
20. Graphs whose output is a filter node compile to a **filter layer** (`filter(type, …)`): restyles every layer below it, with music-driven settings.
21. Director reads (three_get_code) see the graph line shortened to one short comment (saves tokens).

## The node editor (generic, for every tool)
22. Pan: right / middle drag, trackpad scroll, Shift+wheel.
23. Zoom around the mouse: wheel, pinch, + / − / 1 (100%); click the zoom label for 100%, double-click to fit.
24. Minimap (click / drag to move the view; toggle in ⋯).
25. Typed ports with colors (number, hit, on/off, color, vector, shape, material, object, picture, post effect, camera), tooltips with the type.
26. Bezier wires colored by type.
27. Drag a dot to connect; type checks (with automatic conversions number ↔ hit ↔ on/off, number → vector) and loop prevention.
28. Drop a wire on empty space → the node picker filtered to nodes that fit, and the new node is wired in.
29. Grab a connected input to pick its wire up (move it or drop it to disconnect).
30. Searchable node picker (Tab, Shift+A, double-click the background, or ＋) with categories, descriptions and keyboard navigation.
31. Multi-select (Shift / Ctrl click), Ctrl+A.
32. Box select by dragging the background (Shift adds).
33. Copy / cut / paste (also through the system clipboard, between tabs and sketches).
34. Duplicate (Ctrl+D); Alt+drag duplicates while moving.
35. Delete nodes, wires or frames (Delete / Backspace).
36. Undo / redo (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y), 120 steps.
37. Frames: group nodes (Ctrl+G) under a title and color; drag the title to move them together, resize from the corner, double-click to rename.
38. Notes (C): sticky comments on the canvas.
39. Reroute dots: Alt+click (or double-click) a wire, or right-click → Add a reroute dot.
40. Collapse nodes (H or ▾).
41. Rename nodes (double-click the title).
42. Node colors (right-click → Color).
43. Number widgets: drag sideways (Shift = fine), click to type a value.
44. Knob widgets (drag up / down).
45. Color widgets.
46. On / off toggles.
47. Select menus.
48. Text fields.
49. Ease-curve widget with a live curve preview.
50. Vector (x, y, z) widget.
51. Auto layout (L): columns from inputs to output, rows ordered by their sources.
52. Fit (F / Home), center on a node.
53. Find a node (Ctrl+F; Enter jumps to the next match).
54. Snap to grid (toggle in ⋯).
55. Arrow keys nudge the selection (Shift = bigger steps).
56. Right-click menus for nodes, wires, frames, knobs and the background.
57. Knob menu: reset to default, random value, show as Lab slider.
58. Keys sheet (? or ⋯ → Keys).
59. Chrome / glass node headers, glowing selected nodes and ports in the Forgeheart look (theme variables, light / dark themes follow).
60. Zoomed far out, small print hides so the graph stays readable.
61. Read-only graphs in a dialog (outlines, previews).
62. `NodeView.openCode(code, lang)`: code with a graph opens in its tool's node view; three.js code opens in the Lab; any other code opens as a read-only outline.
63. Code outline: imports, functions, classes, values, slider sets, the animation loop, sections, music uses, and what uses what.

## Node types (127)
64. Output (objects, camera, post effects, background on/off + color, fog, exposure, tone mapping).
65–75. Shapes (11): Box, Sphere, Icosahedron, Torus, Torus knot, Plane, Cylinder, Cone, Flat ring, Capsule, Polyhedron.
76–84. Materials & pictures (9): Basic (with additive glow), Standard, Glass / physical, Rainbow normals, Toon, Rim glow (fresnel), Gradient, Reference picture (`refTexture`), Music video (`media.texture()`).
85–94. Objects (10): Mesh, Group, Tunnel, Grid of copies (wave / ripple / noise / spectrum), Ring of copies, Spectrum bars (line / circle / arc, mirror), Waveform line (line / circle), Morphing blob, Wave terrain, Picture plane.
95–96. Particles (2): Particles (sphere / shell / cube / galaxy / ring, pulse), Warp stars.
97–100. Lights (4): Ambient, Sun, Point, Sky.
101–111. Motion (11): Spin, Pulse, Move, Orbit, Bounce, Shake, Wobble, Tumble on hit, Show when, Face the camera, Place.
112. Camera (still / orbit / drift / fly, lens, shake and zoom punches).
113–121. Music (9): Music levels, Hits (kick / snare / hats / hit / bass hit), Beat (pulse per beat / 8th / 16th / bar, phases), Frequency band, Spectrum spot, Song (time, progress, bpm, playing, loud part), Song section (your cues), Drop (build-up + after), Every N beats.
122–128. Triggers (7): Hit envelope, Hit counter, Toggle on hit, Random on hit, Threshold, Step sequence, Hold after hit.
129–132. Time (4): Time, LFO wave (sine / triangle / saw / square, Hz or beats), Noise, Ramp.
133–150. Math (18): Random number, Number, Math (+ − × ÷ min max pow mod), Add, Multiply, Mix, Remap, Clamp, Function, Compare, Choose, Expression (your own formula), Smooth, Pump, Spring, Ease curve, Soft step, Snap to steps.
151–154. Vectors (4): Vector, Split vector, Circle path (circle / figure 8 / spiral), Vector math.
155–161. Colors (7): Color, Palette (12 palettes + the sketch palette + your own hex list), Hue / saturation / lightness, Mix colors, Shift hue, Rainbow cycle, Next color on hit.
162–164. Sliders (3): Slider, Color slider, Switch — your own named Lab sliders with your label, range and group.
165–175. Post effects (11): Bloom, Trails, RGB split, Film grain, Dot screen, Vignette, Kaleidoscope, Glitch burst, Hue / saturation, Brightness / contrast, Sepia.
176–177. Layer (2): Layer timing (time / progress / fade mix of this layer), Layer look (brightness, contrast, saturation, hue, blur, invert on the layer's picture).
178–190. Filter layer (13, made from the Lab's filter templates, so new filters appear automatically): ASCII, Datamosh, Found footage, Glitch, CRT, Pixelate, Halftone, Film, Kaleidoscope, Edge glow, Thermal, Duotone, Glow.

## Presets (29 starter graphs for music visuals)
191. Beat-pulsing particles · 192. Audio tunnel · 193. Kick-flash grid · 194. Spectrum circle · 195. Spectrum bars · 196. Morphing blob · 197. Waveform ring · 198. Warp speed · 199. Pulse rings · 200. Synthwave terrain · 201. Neon knot · 202. Snare strobe · 203. Orbiting lights · 204. Hue cubes · 205. Kaleido crystals · 206. Trails dancer · 207. Glitch on the drop · 208. Disco orbit · 209. Breathing sphere · 210. Lava lamp · 211. Particle galaxy · 212. Retro sun · 213. Step colors · 214. VHS filter layer · 215. Glitch filter layer · 216. Kaleidoscope filter layer · 217. Kick shape · 218. Video screen · 219. Empty graph.

## Chat commands (area "Nodes"; all work in any chat)
220. `/nodes [code]` — show the selected layer as nodes (or back to code).
221. `/nodes-new <preset>` — new sketch from a preset (suggestions while you type).
222. `/nodes-layer <preset>` — add a layer built from a preset.
223. `/nodes-preset <preset>` — replace the selected layer with a preset.
224. `/nodes-presets [filter]` — list presets.
225. `/nodes-types [filter]` — list node types (with a filter: their inputs and outputs).
226. `/nodes-list [all]` — the graph: nodes, changed values, wires.
227. `/nodes-add <type> [field=value…] [to=node.input]` — add (and wire) a node.
228. `/nodes-link <node.output> <node.input>` — connect.
229. `/nodes-unlink <node.input>` — disconnect.
230. `/nodes-set <node> field=value…` — set values (numbers, #colors, on/off, x,y,z).
231. `/nodes-rm <node…>` — delete nodes.
232. `/nodes-layout` — tidy into columns.
233. `/nodes-frame <title> [node…]` — frame nodes (their slider group).
234. `/nodes-from-code` — outline of the layer's code as nodes (read-only).
235. `/nodes-rebuild` — write the code from the nodes again.
236. `/nodes-undo` — undo the last node edit.
237. `/nodes-json` — the graph as compact JSON.

## Palette and director
238. Ctrl+K → "Lab: Nodes ⇄ Code".
239. Ctrl+K → "Lab: Node presets…".
240. Ctrl+K → "Lab: New layer from a node preset…".
241. The Three Director can build and edit node graphs with one short tool, `three_nodes` (same verbs as the chat commands: presets, types, list, preset / new / layer, add, link, unlink, set, rm, layout, rebuild).

**Total: 241 upgrades.**
