# Motion design kit (round 9, "motion"): Hearth's own UI, kinetic type, camera moves and brand reveals in the Lab

For your motion-design intro of Hearth for socials, made with Claude and Astra jamming in the Three.js Lab. One open
entry: **X → Motion** in the Lab (or **Alt+X**, or `/motion-kit`) lists everything below in the effects picker you already
use; each item becomes an ordinary Lab layer. Every motion layer is **one node** in the Nodes view (Alt+N), its knobs
are the Lab's sliders (Save, Shuffle, looks, slider keyframes all work), it moves on its **own time** (from its start on
the timeline or in the sequence; the preview loops it when there's nothing to follow) and never reacts to the music
unless you ask. Nothing new on screen besides one tab in the picker.

## One entry, few choices
1. **Motion tab in the effects picker** (X → Motion, Tab to reach it): every motion preset below, searchable, with favorites ★, recent and 🎲 like the other tabs.
2. **Alt+X** in the Lab opens the picker straight on Motion (in the keys button under "Lab"; also `/motion-kit` with no words, Ctrl+K → "Lab: Motion design kit").
3. **▶ Put Hearth on screen** (first row of the Motion tab, `/hearth-on-screen`, Ctrl+K): a whole shot in a new sketch — Forge gradient backdrop, Hearth's screens in 3D (your newest ◉ captures, or a fresh screenshot of Hearth, plus Hearth drawn), a cursor clicking, a title and a dolly-in. Nothing of your current scene changes.
4. **▶ A motion intro (sequence)** (Motion tab, `/motion-intro [9:16|16:9|1:1|4:5] [title]`): a ready Lab sequence — logo reveal → Hearth on screen with UI cards, cursor, kinetic type and a camera move → end card — with dissolves; ⇪ renders it.
5. **▶ Shot list** (Motion tab, `/shot-list`, Ctrl+K "Lab: Shot list"): the camera moves alone, as a mini list (Enter adds the move).
6. **Shift+Enter** on a motion row while the Lab sequence shows: adds it over the sequence at the playhead (an overlay) instead of as a layer.
7. **A thumbnail per family** in the picker (type, 3D type, Hearth UI, cursor, camera, logo, brand, end card) so the long list reads at a glance.
8. Motion layers are named **◭ …** in the layers list, so you tell them apart from your own.

## How every motion layer behaves
9. **Time first**: each counts from its own start on the timeline (its in point) or in the sequence (its clip / overlay), frame-exact when seeking or rendering; with no song and no in point the preview loops the animation.
10. **Words land on your music only when there is a song**: "Words land on" = auto (your Hit markers, else the song's beats, else seconds), markers, beats or seconds; "Beats per word".
11. **Fits the frame by itself**: type, logos and end cards size and place themselves inside the safe zone of the frame shape — 9:16 keeps clear of the app buttons and captions, 4:5, 1:1, 16:9 title-safe — "Fits in" safe / title / full.
12. **Entrance, hold, exit** knobs on every family (starts at, each takes, gap between, holds, leaves at); 0 = stays until the layer's out point.
13. **Six ways to leave** for type: fade up, fade, reverse (the entrance backwards), drop (letters fall), blur, none.
14. **One node per layer**: the Nodes view shows a motion layer as a "Motion design" node (8 node types, in the node picker under Motion design) whose knobs you can wire to Time, LFO or Keys nodes.
15. **Plain slider groups**: Text, Look, Timing, Screens, Motion, Camera, Move, Brand, Card — with plain labels ("Animation", "Fits in", "Leaves at").
16. **The Oxanium font** reaches the preview with the first motion layer (fallback: bold system fonts).
17. `layer.clock` in sketch code: the timeline's own time (the sequence's, the song's or the page's), next to `layer.time`.

## Kinetic type: per-letter animation
18. **Fills**: solid, gradient, gold, chrome, molten, outline.
19. **Behind the words**: none, pill, box or underline (a plate for busy pictures, with its color and opacity).
20. **Six fonts** (Oxanium, System, Impact, Serif, Mono, Rounded), five weights, UPPER / as typed / lower, left / center / right, letter and line spacing, glow.
21. **"/" or a new line** splits lines; the size shrinks until the longest line fits.

## Hearth on screen: your UI as 3D material
22. **Captures become screens**: your capture shots (◉ Capture / `/shot`) are added as the sketch's references (`hearth-1`…) and drawn on the cards; a capture *recording* plays on its card.
23. **Hearth drawn** when there's no capture: `mock:chat`, `mock:lab`, `mock:board`, `mock:editor`, `mock:nodes`, `mock:jam` and a phone layout, in the Forgeheart colors, each in four parts (background, panels, content, accents) so a screen can explode into its layers.
24. **Device frames**: glass panel (frosted edge, gold rim, sheen), browser window (title bar, traffic lights, address pill), laptop (keyboard deck, the lid opens on entry), phone (bezel, notch), tablet, none.
25. **Depth**: each screen has a thickness (an extruded rounded slab with a metal edge), a soft shadow, rounded corners (Corner radius), lit by a key, a fill and an ember rim light.
26. **Depth of field** knobs (Depth of field, Focus depth) on the 3D layers: screens out of focus go soft.
27. **Layout knobs**: screens, size, tilt, spread, depth between, drift, float, easing (back, out, expo, in-out, elastic, bounce, smooth, linear).
28. **Pictures knob**: any list of reference names and mocks ("hearth-1, mock:lab").

## Camera language
29. **Camera layers move the 3D layers** (screens, 3D type, 3D logos) as a real camera rig (dolly, orbit, crane, roll, field of view, rack focus, motion blur), whatever order the layers are in.
30. **…or the whole picture**: with no 3D layer under it, the same move pans / zooms / rolls / blurs everything below it (a filter, mirror-edged so no black borders); Moves = auto, 3D stage, whole picture, both.
31. **Keyframe me** knobs on every move: pan X / Y, push in, zoom, roll and handheld on top, so the move can be shaped or keyed like After Effects.
32. **Motion blur** on fast moves (whip pan), with its amount.
33. 3D layers have **Follows the camera layer** on / off.

## Brand
34. **Logo marks drawn from Hearth's own icons**: the Hearth flame (with its inner flame), the Forgeheart anvil (with its sparks), both side by side, or Astra's star; line drawing with the true path length, true 3D extrusion with bevels in molten gold.
35. **Wordmark and line** under every logo (Name, Line under it), letter-spacing tightening in.

## Type (33)
36. **Type: Type on**: Letters appear one by one behind a blinking caret, like typing. `/kinetic type-on <words>`
37. **Type: Cascade**: Letters drop in from above one after another and settle with a little overshoot. `/kinetic cascade <words>`
38. **Type: Split**: The words split open from the middle: each half slides in from its side. `/kinetic split <words>`
39. **Type: Slam**: Each word slams in from huge with a short shake. `/kinetic slam <words>`
40. **Type: Wave**: Letters rise in a wave and keep swaying gently. `/kinetic wave <words>`
41. **Type: Scramble**: Random glyphs flicker and resolve into the letters (decode). `/kinetic scramble <words>`
42. **Type: Kerning breathe**: The letters start wide apart, close in and keep breathing their spacing. `/kinetic breathe <words>`
43. **Type: Pop**: Letters pop up from nothing with a bounce. `/kinetic pop <words>`
44. **Type: Blur in**: Letters come into focus from a blur. `/kinetic blur-in <words>`
45. **Type: Rise (mask)**: Each line rises from behind an invisible edge. `/kinetic rise <words>`
46. **Type: Flip**: Letters flip open like cards. `/kinetic flip <words>`
47. **Type: Tracking in**: Wide letters slide together into the word. `/kinetic tracking-in <words>`
48. **Type: Glitch**: Letters jitter in with an RGB split, then hold still. `/kinetic glitch <words>`
49. **Type: Stagger fade**: Words fade up one after another. `/kinetic stagger-fade <words>`
50. **Type: Bounce**: Letters fall and bounce into place. `/kinetic bounce <words>`
51. **Type: Elastic**: Letters spring in sideways. `/kinetic elastic <words>`
52. **Type: Spin in**: Letters spin into place. `/kinetic spin-in <words>`
53. **Type: Word by word**: One word at a time, big in the middle (lands on the beats with a song). `/kinetic word-by-word <words>`
54. **Type: Highlight**: Words appear with a marker sweeping behind them. `/kinetic highlight <words>`
55. **Type: Stretch**: Letters stretch tall and snap back. `/kinetic stretch <words>`
56. **Type: Outline to fill**: Outlines draw first, then fill in. `/kinetic outline-fill <words>`
57. **Type: Neon flicker**: Letters flicker on like neon tubes. `/kinetic neon <words>`
58. **Type: Zoom through**: Words fly at you from the distance, one after another. `/kinetic zoom-through <words>`
59. **Type: Stack**: One word per line, sliding in from alternating sides. `/kinetic stack <words>`
60. **Type: Count up**: The numbers in the words roll up from 0 (write "8,746 upgrades"). `/kinetic count <words>`
61. **Type: Marquee**: The words scroll across the frame in a loop. `/kinetic marquee <words>`
62. **Type: Circle**: The words go round a slowly turning circle. `/kinetic circle <words>`
63. **Type: Wipe reveal**: Each line is wiped in from the left. `/kinetic wipe <words>`
64. **Type: Drop in**: Words drop from above with a tilt. `/kinetic drop-in <words>`
65. **Type: Slide up**: Lines slide up and fade in. `/kinetic slide-up <words>`
66. **Type: Scale down**: The words shrink from huge into place. `/kinetic scale-down <words>`
67. **Type: Shimmer**: A gold glint keeps running across the letters. `/kinetic shimmer <words>`
68. **Type: Jitter (boil)**: Hand-made boil: the letters wobble a little, eight times a second. `/kinetic jitter <words>`

## 3D type (6)
69. **3D type: Spin in**: 3D letters with depth spin into place one by one. `/type-3d spin-in <words>`
70. **3D type: Tumble**: 3D letters tumble down and bounce. `/type-3d tumble <words>`
71. **3D type: Fly through**: 3D letters fly in from the distance. `/type-3d fly-through <words>`
72. **3D type: Swing down**: 3D letters swing down like signs on a hinge. `/type-3d swing <words>`
73. **3D type: Domino**: 3D letters tip up like dominoes. `/type-3d domino <words>`
74. **3D type: Orbit in**: 3D letters spiral in from an orbit. `/type-3d orbit <words>`

## Hearth UI (19)
75. **Floating card**: One screen of Hearth floating in 3D, glass edge and soft shadow. `/hearth-ui single`
76. **Laptop**: Hearth on a laptop whose lid opens. `/hearth-ui laptop`
77. **Phone**: Hearth on a phone. `/hearth-ui phone`
78. **Browser window**: Hearth in a window with its title bar. `/hearth-ui browser`
79. **Tablet**: Hearth on a tablet. `/hearth-ui tablet`
80. **Glass panels**: Rounded frosted panels stacked with depth. `/hearth-ui glass`
81. **Stack**: Three screens stacked diagonally with depth. `/hearth-ui stack`
82. **Parallax depth**: Five screens at different depths drifting past (parallax). `/hearth-ui parallax`
83. **Explode into layers**: One screen comes apart into its layers: background, panels, content, highlights. `/hearth-ui explode`
84. **Fly in**: Screens fly in from the sides and fan out. `/hearth-ui fly-in`
85. **Carousel**: Screens turn on a carousel. `/hearth-ui carousel`
86. **Screen wall**: A tilted wall of screens. `/hearth-ui wall`
87. **Hero tilt**: One big screen rises from a steep tilt to face you. `/hearth-ui hero`
88. **Zoom into the screen**: The camera pushes into a screen until it fills the frame. `/hearth-ui zoom`
89. **Fan**: Screens fan out like a hand of cards. `/hearth-ui fan`
90. **Phone feed**: Phones scrolling up like a social feed. `/hearth-ui feed`
91. **Side by side**: Two screens slide apart (Claude | Astra). `/hearth-ui split`
92. **Turntable**: A phone turning on a turntable. `/hearth-ui turntable`
93. **UI elements fly in**: Hearth's pieces (chat bubbles, buttons, a slider, a node, swatches, a toast) fly in and float. `/hearth-ui elements`

## Cursor (3)
94. **Cursor tour**: A cursor glides along a path and clicks (ripples). `/cursor-path arrow`
95. **Hand cursor**: A pointing hand that taps along a path. `/cursor-path hand`
96. **Touch dot**: A glowing dot for phone taps. `/cursor-path dot`

## Camera (23)
97. **Camera: Dolly in**: The camera moves in · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move dolly-in`
98. **Camera: Dolly out**: The camera pulls back · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move dolly-out`
99. **Camera: Slow push (Ken Burns)**: A slow, steady push · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move push-in`
100. **Camera: Orbit**: The camera circles the subject · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move orbit`
101. **Camera: Orbit all the way**: A full turn around · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move orbit-360`
102. **Camera: Arc in**: Arcs round while moving in · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move arc`
103. **Camera: Crane up**: Rises and looks down · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move crane-up`
104. **Camera: Crane down**: Comes down to eye level · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move crane-down`
105. **Camera: Truck left**: Slides sideways to the left · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move truck-left`
106. **Camera: Truck right**: Slides sideways to the right · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move truck-right`
107. **Camera: Tilt up**: Looks up onto the subject · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move tilt-up`
108. **Camera: Tilt down**: Looks down onto the subject · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move tilt-down`
109. **Camera: Whip pan**: A fast pan with motion blur that lands on the subject · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move whip-pan`
110. **Camera: Rack focus**: The focus pulls from the back to the front (depth of field) · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move rack-focus`
111. **Camera: Handheld**: A gentle hand-held wobble · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move handheld`
112. **Camera: Zoom punch**: A quick punch-in with a kick of shake · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move zoom-punch`
113. **Camera: Snap zoom**: An instant crash zoom · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move snap-zoom`
114. **Camera: Dutch push**: Pushes in while the horizon tilts · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move dutch-push`
115. **Camera: Vertigo (dolly zoom)**: Pulls back while zooming in: the background stretches · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move vertigo`
116. **Camera: Drift**: Floats slowly · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move drift`
117. **Camera: Pull back reveal**: Starts very close and pulls back to reveal · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move reveal`
118. **Camera: Shake hit**: A short burst of shake · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move shake-hit`
119. **Camera: Roll in**: Rolls into level · moves the 3D layers, or the whole picture when there's no 3D layer under it. `/camera-move roll-in`

## Logo (10)
120. **Flame line draw**: The Hearth flame draws itself as a line, fills and the name appears. `/logo-reveal line draw flame`
121. **Flame 3D spin**: The Hearth flame in 3D gold, spinning in. `/logo-reveal extrude flame`
122. **Anvil slam**: The Forgeheart anvil slams down in 3D with sparks. `/logo-reveal slam anvil`
123. **Flame burst**: The flame bursts out with light rays and a flash. `/logo-reveal burst flame`
124. **Flame glitch**: The flame glitches in with an RGB split. `/logo-reveal glitch flame`
125. **Flame from particles**: Sparks fly together into the flame. `/logo-reveal particles flame`
126. **Molten flame**: The flame outline fills up with molten metal. `/logo-reveal molten flame`
127. **Anvil stamp**: The anvil stamps down. `/logo-reveal stamp anvil`
128. **Anvil 3D spin**: The Forgeheart anvil in 3D, spinning in. `/logo-reveal extrude anvil`
129. **Flame + anvil**: Both marks draw themselves side by side. `/logo-reveal line draw both`

## Brand (13)
130. **Forge gradient**: A slowly turning gradient: night, violet, ember, gold. `/brand-look forge gradient`
131. **Molten**: Flowing molten metal. `/brand-look molten`
132. **Gold aurora**: Gold and ember aurora curtains. `/brand-look aurora`
133. **Glow orb**: A breathing ember glow on night. `/brand-look glow orb`
134. **Neon grid floor**: A Forgeheart neon grid rushing to the horizon. `/brand-look grid`
135. **Chrome bands**: Moving chrome bands. `/brand-look chrome`
136. **Embers**: Embers rising over everything. `/brand-look embers`
137. **Film grain**: Fine moving grain over everything. `/brand-look grain`
138. **Light sweep**: A glint sweeping across every few seconds. `/brand-look light sweep`
139. **Vignette**: Darker edges. `/brand-look vignette`
140. **Spotlight**: A warm spotlight from above. `/brand-look spotlight`
141. **Lens flare**: A lens flare passing by. `/brand-look flare`
142. **Bokeh glow**: Soft out-of-focus lights. `/brand-look bokeh`

## End card (5)
143. **End card: Try Hearth**: Flame, the name in gold, a line and a "Try Hearth" button. `/end-card forge`
144. **End card: Follow**: Molten name, "Follow for more". `/end-card molten`
145. **End card: Link in bio**: Light paper card, "Link in bio". `/end-card light`
146. **End card: Claude × Astra**: Claude × Astra marks, "Two AIs, one app". `/end-card duo`
147. **End card: Minimal**: Just the name and the button. `/end-card minimal`

## In the Lab sequence
148. **Motion layers as overlays** over a range of the sequence: `/motion-seq <preset> [words] [at 4.5] [for 3 s]`, Shift+Enter in the Motion tab, or the director's `seq` op; they run on the overlay's own clock (frame-exact seeks and renders).
149. **Motion scenes as clips**: "Put Hearth on screen" and `/motion-intro` make ordinary sketches, so they drop on the main track like any scene (dissolves, lengths, looks).
150. **Rendered frame by frame** with the sequence's ⇪ (9:16 · 16:9 · 1:1 · 4:5): the animations step exactly with the render clock.

## Chat commands (area "Three.js Lab"; `/help motion`)
151. `/motion-kit [preset] [words]`: no words opens the Motion tab; otherwise adds that preset (any family) with your words.
152. `/hearth-on-screen [layout] [laptop|phone|browser|tablet|glass] [here] [title words]` (also `/on-screen`): the whole shot.
153. `/kinetic <preset> <words>` (also `/kinetic-type`): kinetic type.
154. `/type-3d <preset> <words>`: 3D type.
155. `/camera-move <move> [amount 1.5] [for 4 s] [at 2]` (also `/cam-move`): a camera move layer.
156. `/shot-list`: the camera moves in the picker.
157. `/logo-reveal [style] [flame|anvil|both]`: a logo reveal.
158. `/end-card [style] [button text]` (also `/endcard`): an end card.
159. `/brand-look [style]`: a backdrop or overlay.
160. `/cursor-path [arrow|hand|dot] [x,y,click; …]`: a cursor on your own path.
161. `/hearth-ui [layout or device]`: one layer of Hearth's screens.
162. `/motion-words <words>`: new words for the selected motion layer (its animation stays).
163. `/motion-seq <preset> [words] [at s] [for s]`: an overlay on the Lab sequence.
164. `/motion-intro [format] [title]`: the sample motion intro sequence.
165. `/motion-list [family]`: every preset by family.

## Ctrl+K (each also through `/do`)
166. "Lab: Motion design kit (Alt+X)"
167. "Lab: Put Hearth on screen"
168. "Lab: Shot list (camera moves)"
169. "Lab: Kinetic type… (the picker on the type presets)"
170. "Lab: Logo reveal (the flame drawing itself)"
171. "Lab: End card (Try Hearth)"
172. "Lab: Motion intro sequence"

## Claude and Astra
173. `three_do { cmd: "motion", op }` for both engines (lean: one short line on the tool's description): list { family } · add { preset, words, pics, values, in, out } (a new layer, through three_add_layer so it reaches the chat's own scene, backstage too) · hearth { layout, frame, words } · words { layer, text } · set { layer, values } · seq { preset, at, secs } · intro.
174. `three_motion` in the full tool list (`/director-mode full`).
175. Help topic `motion` in the app map (also kinetic, typography, ui, mockup, devices, logo, brand, camera, shots, end card), read on demand: no extra prompt tokens.
176. Templates also work through the existing paths: `three_add_layer { template: "mo-type-cascade" }`, node graphs with `three_nodes` (the Motion design node types).

## How it's built
- The drawing is one self-contained module in the Lab's sandbox page (`tools/three-sandbox.html`, "the motion-design kit": `motion.type / type3d / ui / cursor / camera / logo / brand / endcard`), next to `filter()`: layer code stays short (a node graph that compiles to one `motion.<kind>({ knobs })` call), so directors read little.
- `tools/three-motion.js`: the knob table per family (node fields, slider groups, plain tweak() fallback), 112 templates in `ThreeLayers.TEMPLATES` (pack `motion`, code built lazily), the 8 node types, the Motion tab (`ThreeFX.extend`), Put Hearth on screen, the sequence glue, the director's `three_do motion`. `tools/three-motion-cmds.js`: commands, Ctrl+K.
- Small additive edits elsewhere: `ThreeFX.extend` (a pack can add a tab), `tools/three-nodes.js` (a node can be the whole layer: `shared.layerCall`), `nodes.js` (a field may carry its own slider group), the sandbox's `layer.clock`, `tools/three.js` (routes `three_motion`), `mcp/three-mcp.js` (one `three_do` line, `three_motion` in full mode), `mcp/hearth-map.js` (topic `motion`), `dev/run-checks.js` (group `motion`), `dev/checks/qa-keys.js` (closes the effects picker between keys), the full-mode tool count in `dev/director-mcp-test.js` and the three_do list in `dev/sequence-test.js`.

## Tested
- `dev/checks/motion.js`: every one of the 112 templates added in the sandbox (SwiftShader WebGL), drawing pixels in its own layer with no console / shader errors; the node graph read back; Alt+X → Motion tab, search, Enter; the commands; `three_do motion`; Put Hearth on screen with a fresh capture as the sketch's reference.
- Results: `motion` 31/31 steps, `motion-render` 9/9 (270 frames, 1080×1920, 5.8 min in software WebGL); `sh dev/run-checks.sh lab sequence sequence-render nodes qa smooth-lab` all pass (qa-keys after its picker fix below); unit tests pass.
- `dev/checks/motion-render.js`: `/motion-intro` + `/motion-seq` in the Lab sequence, frame-exact preview seeks, a 9:16 render (1080×1920) read back with ffmpeg: frames from every scene have a picture and the picture moves; a contact sheet to look at.

## Notes
- Software WebGL in the test machine runs at a few frames a second with several 3D motion layers; on a real GPU each motion layer is light (2D canvases for type, cursor, brand, end cards; one small WebGL scene for screens, 3D type and 3D logos).
- Words land on your hit markers / beats only when the layer follows a song; the preview without a song loops every motion layer so you can watch it.

**Total: 176 upgrades.**
