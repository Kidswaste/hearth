# Agent Hub feature pack (October 2026)

133 features. Status: **✓** = tested end to end in the running app · **○** = built and code-checked, but not exercised live
(it needs something I didn't trigger on your PC, like a real After Effects run, a tray click or a Windows notification).

## App-wide (31)
1. ✓ **Command palette** (Ctrl+K): jump to any agent, tool, tool action, chat (native and website) or app action, fuzzy matched.
2. ✓ **Search inside messages**: type `?word` in the palette (or use the panel's "Search inside messages") to search every native chat's text.
3. ✓ **Tools in the rail**: Forgeheart, Three.js Lab and After Effects sit under your agents; right-click to reorder or hide, re-enable in Settings.
4. ✓ **Settings dialog** (⚙ / Ctrl+,): start-up view, tray, startup, notifications, hotkey, theme, spellcheck, tools, folders, app actions.
5. ✓ **Theme presets**: Midnight, Graphite, Forge, Light, High contrast (Settings or palette "Theme: …").
6. ✓ **Global show/hide hotkey** (default Ctrl+Alt+H, configurable; warns if another app owns the key).
7. ○ **Tray icon** with Show, New chat with Claude, Command palette, Quit.
8. ○ **Close to tray** option.
9. ○ **Start with Windows** option.
10. ○ **App icon + Start menu / desktop shortcuts** (Settings → App).
11. ○ **Window memory**: size, position and maximized state come back on launch.
12. ✓ **Single instance**: launching again focuses the open window.
13. ✓ **Text size** Ctrl + / Ctrl − / Ctrl 0, remembered.
14. ✓ **Find in page** (Ctrl+F) for chats, websites and tool web views, with match count and next/previous.
15. ○ **Right-click editing menu** with spellcheck suggestions and "Add to dictionary".
16. ○ **Right-click selection actions**: Ask Claude about this, Save to notes, search the web, open/copy link, copy image.
17. ○ **Spellcheck languages** (English US/UK, French, Spanish, German).
18. ✓ **Shortcut cheat sheet** (Ctrl+/).
19. ✓ **Recent switcher** (Ctrl+Tab, press again to go further back).
20. ○ **Resizable chats panel** (drag the edge; double-click resets).
21. ✓ **Toasts and error catcher**: actions confirm themselves; unexpected errors show with "Copy details".
22. ○ **Reply notifications**: desktop notification + taskbar flash when a reply lands while you're elsewhere.
23. ○ **Unread badges** on agents whose replies you haven't seen.
24. ○ **Downloads** from website agents go to Downloads with progress toasts and a Downloads list (palette).
25. ✓ **Back up hub data** to a zip (chats, notes, tasks, settings; never website logins).
26. ✓ **Token usage dashboard**: tokens and replies per agent per day, 14 days (palette → Token usage).
27. ✓ **Notes** (Ctrl+J): several Markdown notes, preview, autosave, copy, save as file, send to Claude.
28. ✓ **Prompt library** with `{{blanks}}` (palette → Prompt library), 10 starters included.
29. ✓ **Slash prompts**: type `/` in a chat box to insert a saved prompt.
30. ○ **Website toolbar**: back, forward, reload, home, address (click to copy), zoom, open in browser.
31. ✓ **Recently deleted chats**: deleting moves chats to a 30-day trash with an Undo toast; restore from the palette.

## Native chats (19)
32. ✓ **Edit & resend** any of your messages (Up arrow edits the last one).
33. ✓ **Retry** the last reply (also on errors).
34. ○ **Quote** a message into your next one.
35. ✓ **Attach text files** by dropping, pasting or 📎 (code, Markdown, CSV, JSON…).
36. ✓ **Attach images** (paste a screenshot or drop it): Claude opens them with its Read tool, ChatGPT gets them directly.
37. ○ **Attach other files** (PDF etc.) for agents with file access.
38. ✓ **Per-chat model** switch in the chat header.
39. ✓ **Pin chats** to the top of their agent.
40. ✓ **Copy chat as Markdown**.
41. ○ **Export chat** to a .md file.
42. ○ **Continue a chat with another agent** (history goes along as context).
43. ○ **Drafts autosave** per chat.
44. ○ **Smart scrolling** + "jump to latest" button.
45. ○ **Long replies fold** with "Show full reply".
46. ○ **Message times** on hover.
47. ✓ **Syntax highlighting** in code blocks.
48. ○ **Save a code block** as a file.
49. ○ **Code block actions**: Open in Three.js Lab, Shader playground, Run in After Effects (shown when the code fits).
50. ○ **Composer counter** (characters and approximate tokens) and **Esc stops** a reply; palette "Stop all replies".

## Three.js Lab (28)
51. ✓ **Live sketch sandbox**: ES modules with `three` and `three/addons/` import map, isolated from the hub.
52. ✓ **three.js version switcher** (r186, r180, r175, r170, r160).
53. ✓ **Console** with errors linked to their line, and **red error lines** in the editor gutter.
54. ✓ **Performance overlay**: fps, render ms, draw calls, triangles, points, geometries, textures, shader programs.
55. ✓ **Sketch manager**: new, rename, duplicate, delete, autosave.
56. ✓ **Sketch history**: a version saved on every run (40 per sketch) plus deleted-sketch restore.
57. ✓ **12 starter templates** (PBR, instancing 10k, particles, bloom, raycasting, ShaderMaterial, shadows, glTF+animation…).
58. ✓ **18 insertable snippets** (OrbitControls, GLTF+Draco, mixer, raycaster, lil-gui, dispose, bloom, fit camera…).
59. ○ **Export as standalone HTML**.
60. ○ **Screenshots** of the canvas (sketch, viewer, shader).
61. ○ **Ask Claude** with the code and current errors (sketch and shader).
62. ✓ **Code editor**: line numbers, highlighting, smart indent, Tab/Shift+Tab, Ctrl+/ comments, Ctrl+D duplicate, bracket pairing, Ctrl+Enter run (also used for AE scripts).
63. ✓ **Model viewer** (tested with OBJ): GLB, glTF (+.bin/textures), FBX, OBJ, STL, PLY; Draco and Meshopt supported.
64. ✓ **Model stats**: triangles, vertices, meshes, draw calls, materials, textures + GPU memory, size, skinning.
65. ✓ **Performance audit** with concrete fixes (triangle budget, heavy meshes, draw calls, big/non-POT textures, compression).
66. ○ **Animation player**: pick clip, pause, speed, scrub.
67. ○ **Display toggles**: wireframe, bounding box, grid, axes, environment light, vertex normals, auto-rotate, background color.
68. ○ **Live material tweaking**: color, emissive, roughness, metalness, opacity.
69. ○ **Scene tree** with visibility toggles and click-to-highlight.
70. ○ **Loader code** for the loaded model (copies GLTFLoader + mixer code with its clip names).
71. ✓ **Shader playground**: live compile, uTime/uResolution/uMouse/uFrame, Shadertoy `mainImage()` works.
72. ✓ **Shader errors** mapped to your own line numbers.
73. ○ **5 shader presets** (gradient, fbm clouds, raymarched sphere, Shadertoy style, mouse ripple).
74. ○ **Copy as ShaderMaterial** code.
75. ✓ **Texture inspector**: size, power-of-two, alpha, file size, GPU memory, advice, tiling preview.
76. ○ **Resize textures** to power-of-two and save as PNG/JPG/WebP.
77. ✓ **Docs browser**: live class index from threejs.org (300+ classes) with search, plus manual/examples/forum.
78. ✓ **Color converter** (shared with AE): 10 formats incl. three.js linear/sRGB, After Effects arrays and GLSL, tints/shades, contrast check, recent colors.

## Shared creative kit (1)
79. ✓ **Easing curve editor**: drag the bezier, 12 presets, live preview; outputs CSS, GSAP, a JS/three.js function, an After Effects expression and keyframe influence values.

## After Effects (16)
80. ✓ **Expression builder**: 30 expressions with fill-in fields and live code (wiggle variants, loops, inertial bounce, squash, counter, typewriter, auto box behind text, look-at, path follow, beat pulse, fades…).
81. ○ **Favorites and your own saved expressions**.
82. ○ **Ask Claude to write an expression** from a description.
83. ✓ **14 ExtendScript tools** with options (rename/sequence/precompose layers, center anchors, null controller, markers every N frames, grid, randomize, render-queue batch, incremental save, report…).
84. ○ **Run in After Effects**: scripts run in your open AE as a single undo step, errors shown in AE.
85. ○ **My scripts**: write, save and run your own .jsx with the code editor, or ask Claude to fix them.
86. ○ **Install into AE's File → Scripts menu**.
87. ✓ **Render queue with aerender**: your AE output-module templates, frame range, multi-frame rendering, live progress/ETA, cancel, full log (failure path tested; a real render was not run).
88. ○ **Render history** (show file, render again) and a notification when a render finishes.
89. ✓ **Timecode calculator**: 9 frame rates incl. 29.97/59.94 drop-frame, add/subtract, frames ↔ seconds.
90. ✓ **Retime calculator**: speed ↔ duration, fit-to-length, high-fps footage conform.
91. ✓ **Bitrate & file-size calculator** with platform presets.
92. ○ **Comp presets** (19: YouTube, Shorts, Instagram, Steam capsules/trailer, itch.io…) with one-click "Create in AE" and custom sizes.
93. ○ **Palette from an image** (k-means): copy HEX/AE/CSS or create swatch solids in AE.
94. ✓ **Project finder**: every .aep in Documents/Desktop/Videos (configurable), open in AE or send to the render queue.
95. ✓ **Shortcut reference**: ~75 AE shortcuts, searchable.

## Forgeheart (24)
96. ✓ **Dashboard**: main build, latest release, tasks, docs, backups, devlog, brief.
97. ○ **Forgeheart chat**: one click starts a Claude chat with your editable project brief.
98. ✓ **Play builds in the hub** with DevTools and screenshots.
99. ○ **Live reload** when the build file changes on disk.
100. ○ **Viewport presets**: itch.io embed 960×600, 1080p, 720p, phone, tablet.
101. ✓ **Docs library** with full-text search across all notes.
102. ○ **Markdown editor**: edit, preview, save, create new docs.
103. ○ **Send selected docs to Claude** with the brief.
104. ○ **Checklists → tasks**: finds `- [ ]` items in docs and imports them.
105. ✓ **Miro boards** tab with your 3 Forgeheart boards, add/remove, persistent login.
106. ○ **Board → Claude**: summarize, turn into a task list, check build vs. manual (switches on Miro read-only for Claude if needed).
107. ✓ **Task board** (kanban): drag-drop, quick add with `#tag`, tags, priority, due dates, notes, right-click menu.
108. ○ **Paste a checklist** (e.g. from a Claude reply) to create tasks.
109. ○ **Patch notes composer**: docs changed + tasks done since the last release → editable draft → copy, save, preview, Polish with Claude.
110. ○ **Release packager**: zips a build as `index.html` for itch.io, named like your past releases.
111. ✓ **Release checklist** (editable, with progress) and **past releases** list.
112. ○ **Balance CSV editor**: sort, filter, inline edit, add/delete rows, per-column min/max/avg, save/revert, ask Claude.
113. ○ **Backup cleaner**: keep the newest N per build, move the rest to the Recycle Bin (frees ~3.3 GB today; not run).
114. ○ **Restore a backup** over the current build (current file goes to the Recycle Bin first).
115. ✓ **Compare builds/backups**: line diff with change counts (fast even on 32 MB builds).
116. ○ **File search** by name or inside files.
117. ✓ **Screenshot gallery** with lightbox.
118. ○ **Devlog timer** that survives restarts, with "what did you do?" logging.
119. ○ **Devlog export** to Markdown and **itch devlog draft** with Claude.

## Forge Debug: live game Claude can control (added Oct 4, evening)
120. ✓ **Forge Debug agent**: your latest Forgeheart build (`forgeheart_music_test5.html` from the Desktop, the music version) runs permanently beside a Claude chat, in its own save slot so your real save is untouched.
121. ✓ **Claude drives the game** with 9 tools: status, spawn enemies (any type, count, strength, or the boss), debug switches (god, one-shot, pause, speed, gold, jump to stage, kill all, heal, start from the title screen, open the Debug Deck), run any code in the game, screenshots it can look at, reload. Tested: "Spawn me 8 raiders and make me invincible" → done in 8 s.
122. ✓ **Patches**: on-the-fly changes Claude (or you) save by name; they re-apply after every reload and hub restart, with a Patches list to switch them off.
123. ✓ **Game toolbar + activity log**: build picker, reload, Debug Deck, pause, speed, god, 1-shot, +10 foes, screenshot, DevTools; a log line for everything Claude does to the game.
124. ✓ **Bigger chat box** that starts at three lines and grows with your text up to ~45% of the window.
125. ✓ **Forgeheart workspace points at the live project** (`Documents\Codex\2026-09-08\…\outputs`, the folder GitHub `Kidswaste/forgeheart` main is built into).

## Forgeheart look + Video Review (added Oct 4, night)
126. ✓ **Forgeheart skin** (Settings → Theme → Forgeheart, now the default): the game's console palette and Oxanium font, parchment primary buttons, cut-corner HUD panels with corner brackets, small-caps labels.
127. ✓ **Importance by rarity color**: gold = active/selected, orange = unread or needs attention, violet = AI working, red = stop or error, blue = info. A living rainbow edge marks what's live (a reply being written, the focused chat box, the ask-all bar).
128. ✓ **Motion**: views slide in, tab underlines grow, buttons get a light sweep on hover, dialogs and the palette open like HUD panels; everything stops if Windows asks for reduced motion.
129. ✓ **Video Review** replaces the After Effects screen: a library of renders from your Desktop and Documents\Codex (new renders pop up automatically), thumbnails, version chips, a large frame-accurate player with filmstrip scrubbing, J/K/L, frame stepping, loop in/out, speed and timecodes.
130. ○ **A/B compare** with a wipe slider or side by side, synced playback.
131. ○ **Guides** (title/action safe, thirds, 9:16, 4:5, 1:1 crops), **color picker** from the video, save or copy the current frame.
132. ✓ **Timecoded notes with frame grabs** and **Send feedback to Claude**: one click writes the notes, file and frames into a Claude chat so the scripts can be changed.
133. ✓ **Toolkit drawer**: expressions, scripts, render queue, calculators, presets, palette, projects and shortcuts are still there, behind "⋯ Toolkit" in the Video Review header (closed by default).

## Directors: chats built into the tools (added Oct 4, late night)
134. ✓ **Docked chats**: an agent with a `dock` setting lives inside a tool instead of the rail. Its chat sits on the right of that tool (drag the edge to resize, "💬 Name" in the tool header to hide or show it), and its chat list stays in the side panel.
135. ✓ **Video Director** (in Video Review): you describe what you want the render to look like; it browses the library, opens videos, looks at contact sheets and single frames, compares versions, adds timecoded notes, and can render with aerender or run AE scripts on its own. It can read and edit files in `Documents\Codex`. Tested: "give me 3 visual critiques of the latest render" → contact sheet + critiques in 11 s.
136. ✓ **Three Director** (in Three.js Lab): you describe a scene, not code. It writes the sketch, runs it, reads errors and fps, looks at screenshots and keeps fixing until it looks right. Code stays hidden unless you press "</> Code". Tested: "a slowly spinning neon torus with bloom" → working sketch after 5 self-checked passes, 86 s.
137. ✓ **Safe sketch edits**: director edits wait until your saved sketches are loaded, so they never land on a placeholder or the wrong sketch, and every change keeps a version in History.
138. ✓ **Tools keep rendering while a director works** even if you're on another view, so its screenshots and fps are real.
139. ✓ **Numbered lists keep counting** (2., 3., …) when items are split by paragraphs, and contact sheets are labeled in plain seconds.

## Three.js Lab sliders (added Oct 5)
140. ✓ **Sliders panel** ("🎚 Sliders" in the Lab toolbar, on by default): every number and color in the sketch gets a slider, number box or color picker, with readable names ("camera.position.z", "MeshStandardMaterial · roughness", "PointLight · intensity") or the code snippet around it, and a jump-to-line link.
141. ✓ **Live where possible**: values the scene re-reads every frame change instantly (⚡); values only used while building the scene re-run it when you let go (↻), keeping your other unsaved slider values. Values the sketch never reads are hidden (tick "Unused" to see them).
142. ✓ **Save to code** writes the changed values back into the code (the old version goes to History); **Reset** goes back to the code's values; double-click a slider to reset just that one. Switching sketches with unsaved values offers "Save them".
143. ✓ **Named controls** with `tweak()`: `const P = tweak({ speed: [1, 0, 5], tint: '#ff3cac', wire: false })` shows a Controls group with those ranges; `{ value, min, max, onChange }` for settings that must be applied when changed. Export HTML keeps working (the values are frozen).
144. ✓ **Three Director builds sliders in**: every scene it makes comes with 4–8 named live controls, and it sees (and keeps) any slider values you haven't saved yet. Sketches without named controls show "Ask the Three Director" to add some. Tested: "glowing orbs over dark water" → 7 controls, 6 live.

## Visualizer toolkit in the Three.js Lab (added Oct 5)
145. ✓ **Music and video input**: "🎵 Load audio / video…" (or drop a file on the preview) loads an mp3, wav, m4a, flac, ogg, mp4, mov or webm. Play/pause (Space), a clickable overview of the track to jump around, loop, volume. The last file comes back next time.
146. ✓ **Track analysis** in about a second: tempo, every beat, drops, quiet/medium/loud sections and bass/mids/highs energy. The overview shows loud sections, energy curves, beats and drops (red markers); hovering shows the time and section.
147. ✓ **Audio for sketches**: `audio.bass / mid / treble / level / beat`, `audio.spectrum`, `audio.waveform`, `audio.band(lo, hi)`, `audio.analysis` (the whole track), and `media.texture()` for an mp4 as a video texture. With no file loaded, a demo 120 bpm beat keeps sketches moving.
148. ✓ **Exact frame sizes**: Fit, 9:16 (1080×1920), 16:9, 1:1 and 4:5 buttons on the preview render at those exact pixels and scale to fit, with a Shorts/Reels/TikTok safe-zone overlay for 9:16.
149. ✓ **Record to video**: "⏺ Record" saves the preview with its music as an MP4 (H.264 + AAC) at the frame size: the whole track or from the playhead until Stop. Slider moves during recording are recorded too.
150. ✓ **Everything live**: sliders that only matter when the scene is built now rebuild it while you drag (in place, without reloading or restarting the music), and code edits apply live ("Live code", on by default). Save is only for keeping changes.
151. ✓ **Understandable sliders**: named controls show plain labels, groups (Music, Motion, Color…), one-line hints and dropdowns for styles; the raw numbers in the code sit in a collapsed "All values in the code" section.
152. ✓ **Make any slider follow the music**: ♪ on a slider → Bass, Mids, Highs, Loudness or Beat, with an amount (negative works the other way). Saved per sketch.
153. ✓ **Looks**: "＋ Save look" remembers the current slider values; click a look to switch back to it. Saved per sketch.
154. ✓ **🎲 Shuffle and ↶ Undo**: nudge every control to a random nearby value, step back through slider changes.
155. ✓ **Ask the director with one click**: More energy, Calmer, New colors, Hit harder on beats, Simpler, More detail, Add a slider for…
156. ✓ **Three Director makes visualizers**: it reads the track (three_media_info), designs for the frame size, gives every sketch 6–12 labeled, grouped sliders with hints, and checks its work at a loud part (three_media_control). It can also load files (three_load_media) and switch the frame (three_set_frame). Tested: "Eclipse visualizer" → 14 sliders in 5 groups, all live.

## Song timeline + layout fix (added Oct 5)
157. ✓ **Lab fits any width**: the preview and sliders shrink instead of being pushed off-screen by a wide chat; under ~760 px the sliders stack below the preview; the docked chat can't take more than ~55% of a tool.
158. ✓ **Zoom into the song**: mouse wheel or ＋/－ on the timeline, "Whole song" to zoom out, Shift+wheel or the bar underneath to move along. Zoomed in, the timeline shows the real waveform with beat lines (brighter every 4 beats) and a time ruler. While playing, the view follows the playhead.
159. ✓ **Loop points**: drag along the top strip of the timeline to draw a loop (drag its edges or the middle to adjust), "[ Start" / "End ]" at the playhead, or double-click a part of the song to loop that section. Points snap to beats (switchable). Shows the loop length in seconds and beats. Remembered per file.
160. ✓ **🔒 Lock**: freezes the loop points and the view on the loop, and turns looping on. The director can't change a locked loop either.
161. ○ **Tight looping and "Record → The loop"**: the loop is checked every frame inside the preview, and a loop recording stops exactly at the loop end (built; playback wrap and loop recording not yet run end to end).

## Beat grid, precise points and hit markers (added Oct 5)
162. ✓ **Exact loop points**: type the start and end (m:ss.mmm or seconds), ‹ › nudge 10 ms, arrow keys move the selected point 10 ms (Alt 1 ms, Shift one grid step), [ and ] set them at the playhead.
163. ✓ **Zoom to single samples**: below 3 s on screen the timeline draws the raw audio; the ruler goes down to milliseconds. Jumping somewhere off-screen brings the view along.
164. ✓ **Your BPM**: type it (2 decimals), Tap (4+ taps), ×2 / ½, or Auto to go back to the detected tempo.
165. ✓ **Beat grid like rekordbox**: "Set 1 here" puts the downbeat at the playhead, ◂ ▸ shift the whole grid 5 ms, meter 4/4, 3/4 or 6/8. Downbeats are red with bar numbers; beats white; subdivisions faint at 1/8 and finer.
166. ✓ **Snap**: Off, Bar, Beat, 1/8, 1/16, 1/32 for loop points, markers and tapped hits.
167. ✓ **Kick / Snare / Hit lanes**: press K, S or H while the song plays (quantized to the snap), click in a lane to add, drag to move, double-click / right-click / Delete to remove. Fill: kick on every beat, kick on 1 and 3, snare on 2 and 4, hit on every bar's 1, or clear a lane, in the loop or the whole song. ↶ / Ctrl+Z undo grid and marker changes. Saved per song.
168. ✓ **Sketches use your hits**: `audio.kick / snare / hit` (1 exactly on your markers), `audio.hits`, `audio.since('kick')`, `audio.next('snare')`, `audio.beatInBar`, `audio.bar`, `audio.beatPhase`, `audio.barPhase`; the ♪ slider links can follow Kick, Snare or Hit. The Three Director reads your grid and markers and cuts on them.
169. ✓ **Each sketch has its own song**: switching sketches swaps in that sketch's music (or none), where you were in it, and its frame size (9:16…). The song's BPM, grid, kick/snare/hit markers and loop come with it (they're saved per song, so two sketches using the same song share them). Loading a song (button, drop, or the director) gives it to the open sketch; × removes it from that sketch. Switching fast never lets an older load win.

## Layers and timeline (added Oct 5)
170. ✓ **Layers like Photoshop**: each sketch is a stack of layers, each its own 3D scene with its own code and sliders. The Layers panel (top of the right column) selects a layer (the code and sliders follow it), shows/hides it (👁), reorders by dragging, renames (double-click), duplicates and deletes (with Undo). Every existing sketch is simply one layer.
171. ✓ **Add a layer** with ＋ Layer: Shape, Pulse rings, Particle field, a copy of the selected layer, or "Ask the Three Director…". New layers are transparent so the ones below show through; adding one doesn't restart the others or the music.
172. ✓ **Layer settings**: opacity, blend mode (Normal, Add, Screen, Lighten, Overlay, Soft light, Multiply, Darken, Difference, Exclusion, Color dodge), position X/Y, scale and rotation, and when it plays (start/end typed, "here", "Whole song", "Loop only") with fade in/out.
173. ✓ **A track per layer** under the song timeline (like After Effects): drag the bar to move the layer in time, drag its ends to trim (snaps to your grid), double-click to fit it to the loop (again: whole song), click to select. Fades show as ramps. A layer that's hidden or outside its time stops drawing.
174. ✓ **Overview strip** under the timeline (like FL Studio's playlist): the whole song with every layer's bar, loud parts, drops, the loop and the playhead; drag the box to move the zoomed view, click to jump.
175. ✓ **Prompt it**: "add another layer with…", "only from the drop to 0:30, fading in", "make the top layer softer", "put it behind", "remove that layer". The Three Director has tools to list, add, change, reorder, time, select and remove layers. Tested: one sentence → a "Snare sparks" layer on top with add blending, a 2 s fade-in and an end time, plus 10 sliders.
176. ✓ **Recording and screenshots merge all layers** (opacity, blend, transform, timing) with the music.
177. ✓ **Fix**: with no song loaded, the play bar no longer stretches and squashes the preview.

## Keyframes (added Oct 5)
178. ✓ **Keyframes like After Effects**: a layer's opacity, position X/Y, scale and rotation, and any of its named sliders (numbers and colors) can change over the song. ◆ next to a setting or slider adds a keyframe at the playhead (◆ filled = on a keyframe, ◇ = animated, click again to remove). Once something is animated, moving it adds or updates a keyframe at the playhead.
179. ✓ **Keyframes on the layer's track**: diamonds on its bar. Click to jump there, drag to move (snaps to the grid), double-click to delete, right-click for Ease (smooth, default), Linear or Hold. While the song plays the sliders show the animated values.
180. ✓ **Prompt it**: "fade the sparks in over the first 4 seconds", "grow the rings into the drop", "turn it red on the drop": the Three Director's three_keyframes tool animates the right property at the right time. Recordings include the animation.

## Filter layers (added Oct 5)
181. ✓ **Filter layers** (like adjustment layers): ＋ Layer → Filters adds a layer that restyles everything below it: ASCII, Datamosh, Found footage (VHS with REC timecode and date), Glitch, CRT, Pixelate, Halftone, Film, Kaleidoscope, Edge glow, Thermal, Duotone, Glow. Marked "FX" in the layers list.
182. ✓ **Filters are normal layers**: their settings are named sliders (so ◆ keyframes, ♪ music links, looks and shuffle work), opacity mixes the effect with the original, the timeline bar limits it to part of the song (e.g. glitch only on the drop), and its position in the stack decides what it affects. Datamosh and Glitch burst on your kick/snare markers (or the beat).
183. ✓ **Prompt it**: "add an ASCII filter on top", "VHS look only on the intro", "glitch harder on the drop": the Three Director adds and times filter layers.

## Automation lanes, notes, focus (added Oct 5)
184. ✓ **Automation lanes** (Ableton placement, FL Studio curves): the ▾ chip at the right of a layer's track picks which setting shows in a lane right below it: opacity, move X/Y, scale, rotate or any of the layer's sliders (● = already animated). Click the lane to add a point (snaps in time), drag points, drag the small handle between two points to bend the curve, double-click a point to delete it, right-click for Smooth / Linear / Hold, or to clear or hide the lane.
185. ✓ **Animation presets**: Animate ▾ (layer settings, or the ▾ chip): Fade in, Fade out, Pop in, Slide in from the left / right / below / above, Zoom through, Spin, Pulse on beats, Shake on kicks, Blink on snares. They write points over the layer's time (or the loop, or the whole song) that you then edit in the lane.
186. ✓ **Timeline sizes**: drag the grip at the top of the timeline (or ▤ ▭ ▁): full, compact (no grid / hits row) or just the overview strip with play and time.
187. ✓ **Focus** (⛶ Focus or F, Esc to leave): hides the chat, side panels, toolbar, sliders and console and shrinks the timeline to the strip, so the animation fills almost the whole window.
188. ✓ **Notes on moments**: 📌 Note (or N) saves a screenshot of the frame plus what you want changed at that song time; green pins on the timeline (grey when done); the Notes list jumps to them, marks them done, deletes them and sends the open ones (with screenshots) to the Three Director.
189. ✓ **The director works the timeline**: three_timeline (grid, markers, loop, zoom, layer times, keyframes, lanes, notes), three_timeline_edit (grid, markers, loop, zoom, which lane shows), three_animate (presets) and three_notes (reads your notes with their screenshots, marks them done, adds its own).
190. ✓ **Fix**: the preview could stay blank until you pressed Run (a frame being replaced answered "ready" first); now only the current load counts.
191. ✓ **Lane headers outside the timeline**: the ▾ chooser and each lane's name, value at the playhead, range and ✕ sit in a column right of the timeline, so they never cover it and are always clickable.
192. ✓ **Several curves at once** (Ableton-style): tick as many settings as you like in a layer's ▾; click a lane's name to switch it to another setting; double-click its header for a taller lane; A shows every animated setting of every layer (again hides them).
193. ✓ **Curve editing**: Shift+drag to select points (Shift+click adds one), drag a selected point to move them all, Alt+drag to stretch their swing, arrows nudge them, Delete, Ctrl+C / Ctrl+V (at the playhead, into another setting too), Ctrl+D (repeats them right after, bar-aligned), Ctrl+A, Ctrl+drag draws with a pencil, the value shows while dragging, Ctrl+Z undoes curve edits.
194. ✓ **Shapes** (right-click a lane): pulse on every beat / kicks / snares / hits, ramps, a wave per bar, square, random steps, over the loop (or the visible part, or the layer's time).
195. ✓ **Console options**: show it always, only with the code (default), or only when you open it (Console button in the Lab toolbar). Hidden, the button counts new errors / warnings (red ●). Copy, Clear and ✕ in its header.
196. ✓ **Present** (▣ Present or P): the preview alone, fullscreen, for showing it off or a second monitor; Space, arrows and cue keys still work; Esc leaves.
197. ✓ **Playback speed**: 1×, ¾, ½, ¼ next to the time, for placing points and markers precisely (recording switches back to 1×).
198. ✓ **Hot cues** (like rekordbox): C drops a named cue at the playhead, 1–9 jump to them, drag a flag to move it, right-click to rename / move / loop to the next cue / delete. Saved per song with the grid; the director can read and set them (three_timeline_edit cues) and change the speed.
199. ✓ **Window snapshot → chat** (Ctrl+Shift+S, anywhere): a picture of the whole window is attached to the chat you're using (the docked director in a tool, the agent you're on, or Claude), ready to send with a message.
200. ✓ **Keep Hearth on top** (Ctrl+Shift+T or the palette): stays above other windows; a 📌 shows at the bottom of the rail.
201. ✓ **Shortcut sheet** (Ctrl+/) now has a second column with every Three.js Lab key; the palette has Lab entries for Present, Focus, cues, console mode and speed.
202. ✓ **References**: 🖼 References in the Lab toolbar holds this sketch's pictures, logos, video clips, 3D models, sounds, fonts and data files (add or drop them; copies live in data/refs). Each has a name used in code: refTexture('name') for images / videos, refs.name (a URL) for the rest. Copy code, ask the director about it, show, remove.
203. ✓ **References from the chat**: files dropped in the Three Director's chat that aren't pictures (clips, .glb, sounds…) become references automatically, with a note telling the director their name; pictures you attach are shown to it and it can add them (three_references add). three_references list lets it see every reference (pictures included).
204. ✓ **Follow the music** (right-click a lane): curves that ride the loudness, bass, mids or highs over the loop / view / layer time.
205. ✓ **RGB waveform** like rekordbox (red bass, green mids, blue highs; the RGB button switches back to band lines).
206. ✓ **Snap: Hits**: points, markers and loop edges snap to your kick / snare / hit markers and cues.
207. ✓ **M / S per layer** in the timeline's header column: mute (hide) and solo (only this layer while you work; not saved).
208. ✓ **Sketch browser** (▦ next to the sketch list): every sketch as a picture (thumbnails taken automatically after it runs), with layers, date and song; search; open; new.
209. ✓ **Reply heads-up**: when a chat you can't see (another tool, or the director hidden by Focus) finishes, a small note with Open appears.
210. ✓ **Write mode** (⏺ Write or W, like a DAW's automation write): while the song plays, moving a slider, a layer setting (opacity, move, scale, rotate) or a MIDI knob records it as a curve at the playhead, replacing the points it passes over.
211. ✓ **MIDI controllers** (🎛 MIDI): learn a knob / fader for any slider or a layer's opacity (move the slider, then turn the knob); learn pads for kick / snare / hit markers, play / pause, Write on / off or a note. Knob maps are saved per sketch, pads for the whole Lab. With Write on, knob moves become curves.
212. ✓ **Palettes**: 🎨 Palette on a picture reference takes its main colors as the sketch's palette (swatches in the toolbar: click to copy, Recolor puts them into the selected layer's color sliders). Sketches get them as the global `palette`; the director can read and set it (three_references palette).

## Chats that talk back
213. ✓ **Live thinking**: Claude agents stream a readable summary of their thinking while they work (purple "Thinking…" panel, folds away when the answer starts; kept on the reply as "Thought for N s"). Astra's reasoning shows the same way. Switch off per agent ("Show its thinking").
214. ✓ **Questions for you** (chat_ask, mcp/chat-mcp.js): an agent can stop and ask you something; a card with its options appears in the chat (click one, pick several, type your own, or Skip). A toast / notification tells you when you're elsewhere. The Q&A stays on the reply.
215. ✓ **Second opinions from Astra**: agents can ask Astra (Codex) to judge their work with chat_second_opinion, with a screenshot of what you see (the Lab preview for the Three Director); its critique shows as a card in the reply. The 👁 Second opinion button on the last reply does the same on demand and adds Astra's answer to the chat, with "Ask Claude to use it".
216. ✓ **Self-review**: 🔍 Review on the last reply makes the agent check its result critically (fresh screenshot for visual work) and fix what's wrong. Directors also check their own work before answering (agent setting "Checks its own work").
217. ✓ **Suggested next steps**: agents end replies with up to 3 short follow-ups shown as buttons; one click sends it.
218. ✓ **Queue while it works**: type and press Enter while an agent is answering and the message waits in line (⏳ chip, × to drop it), sent when the reply ends. Empty box + the button = Stop.
219. ✓ **Coolors palettes**: 🎨 in the Lab toolbar imports a Coolors link (coolors.co/palette/…), a Coolors export (CSS / array / JSON) or any hex codes (it reads your clipboard), opens coolors.co, takes one from a picture, saves palettes to a library and applies saved ones. The director can set one from a Coolors link too.
220. ✓ **Live plan**: for multi-step work an agent posts its plan as a checklist in the chat (chat_progress) and ticks steps off as it goes, with a progress bar; it stays on the reply.
221. ✓ **Pictures in the chat**: agents can show you what's on screen (chat_show, e.g. "Variant A" then "Variant B", then ask which you prefer); click a picture for full size.
222. ✓ **Contact sheet** (🎞 Sheet in the timeline, or the palette): one image with a frame at every cue (or across the loop / song; a few seconds of frames without a song), numbered and labeled. Send it to the director or save it. The director has three_contact_sheet to review the whole piece instead of one frame.
223. ✓ **Long chats**: past ~80k tokens per message, a banner offers "Summarize & continue fresh": the agent writes a short summary and a new chat continues from it (much cheaper); "Keep going" hides it.
224. ✓ **Open any sketch from Ctrl+K**: the palette lists "Open sketch: …" for every sketch.
225. ✓ **Compact context** (like Claude Code's /compact): the agent summarizes the conversation and the same chat continues from that summary, so each message stops resending the whole history. Every message stays visible; a "🗜 Context compacted here" divider holds the summary. From the context meter in the chat header, the chat ⋯ menu or the long-chat banner. Tested: a code word survived the compaction.
226. ✓ **Auto-compact on long tasks**: once a reply sends over ~110k tokens of context, the chat compacts itself right after (agent setting "Compacts long tasks on its own", on by default).
227. ✓ **Context meter**: the chat header shows how much context each message sends now (green → yellow at 60k → red at 110k); click to compact.
228. ✓ **Branch**: "Branch" on any reply starts a new chat with everything up to there, to try another direction without losing the original.

## UI by use
229. ✓ **Usage tracking** (usage.js, local only: data/kv/ui-usage.json): which buttons, menu items, palette actions, shortcuts, agents / tools and agent tool calls you use, how often and when.
230. ✓ **Importance from use**: your most used buttons get a gold outline, regular ones a warm border; after two weeks of tracking, buttons you never touch (or haven't for a month) fade until you hover. The agents / tools you open most get a ring in the rail.
231. ✓ **Importance from meaning**: gold = main actions, violet = AI (Ask the director, Review, Second opinion…), red = live / recording (Record, Write), orange = capture (Note, Sheet, 📷).
232. ✓ **Categories**: the Lab toolbar is grouped (View · Sketch · Code · Assets) and the timeline too (Song · Play · Zoom · Loop · Capture · Live). Rename / Duplicate / History / Export HTML / Ask Claude / Delete moved into "Sketch ▾".
233. ✓ **Your usage** (Ctrl+K → "Your usage"): most used features with counts, usage by area, features not used for 3+ weeks and ones seen but never used; Hide removes a button everywhere (Show brings it back).

## Sliders panel, round 2
234. ✓ **Knobs**: number controls show as rotary knobs in a grid (Auto: decimals and small whole-number ranges; switch to Knobs / Sliders in the panel). Drag up / down or sideways, Shift for fine, wheel or arrow keys to step, click the value to type one.
235. ✓ **Detents, like physical knobs**: a blue notch marks the value in the code; knobs click into it as you pass and hold there until you turn clearly past; sliders snap to it too and show it as a tick. The arc turns blue when you're on it. Double-click goes back to it.
236. ✓ **Lock**: 🔒 a control at its value (or Reset and lock) so dragging, 🎲 shuffle, looks, Reset and MIDI leave it alone.
237. ✓ **★ Favorites**: right-click → Add to Favorites puts a control in a ★ group at the top.
238. ✓ **Foldable groups**: each group folds (remembered), shows how many you changed, and has its own 🎲 shuffle and ↺ reset. A dropdown shows one group at a time; "Changed" shows only what you moved.
239. ✓ **Hold A/B**: hold to see the sketch with the code's values, let go for yours.
240. ✓ **Right-click menu** on any control: back to the code's value, lock, reset and lock, favorites, follow the music, keyframe, show in code.
241. ✓ **More room**: "Ask the director" folds to one line (remembered) and the status line only shows when there's something to save.
242. ✓ **One-click choices** (choice dropdowns were your most-used control): up to 5 short options show as segmented buttons; longer lists keep the dropdown with ‹ › arrows; the mouse wheel cycles both. On/off settings are a single On / Off pill.
243. ✓ **Director tunes with sliders**: three_sliders moves a layer's sliders without touching the code (shows as your unsaved changes: Save, ↶ or A/B), three_looks saves / applies / deletes looks.
244. ✓ **"3 variations to pick from"** (Ask the director): it makes three slider-only variations, saves each as a look (Variation A / B / C), shows each in the chat and asks which you want, then applies it.
245. ✓ **Sketch browser**: ★ pin sketches to the top, sort by recent / name / most layers, ♪ badge on sketches with a song, right-click a card to open, pin, rename, duplicate or delete.
246. ✓ **Director code tools for big sketches**: three_read_code (line ranges with numbers), three_search_code (across all layers, with context) and three_edit_code (exact find → replace or a line range, then re-run). Layers over 350 lines come back from three_get_code / three_select_layer as an outline with line numbers instead of the whole code, so the director reads only what it needs and edits in place instead of rewriting.
247. ✓ **Director looks inside the running sketch** (three_eval): runs JavaScript in the live preview and returns the result, with three.js objects summarized; __scenes['Layer'] gives each layer's scene / camera / renderer, window.game whatever the sketch exposes. For games: real values ("wall health is 1") instead of guesses.
248. ✓ **Director play-tests** (three_input): holds keys, clicks and moves the mouse in the preview, then screenshots.

## Scene editor
249. ✓ **✥ Edit scene** (View group, or E): fly around the selected layer's 3D scene (drag to orbit, right-drag to pan, wheel to zoom), click an object to select it (Alt+click its group, or pick from "Objects ▾"), and move / rotate / scale it with gizmo arrows (W / E / R, Q for world / local, Snap for 0.25 / 15° / 0.1 steps, F to focus). Other layers fade back while you edit.
250. ✓ **Placements stay**: what you move is kept with the layer and re-applied every frame, so it holds even when the code rebuilds or animates the scene; only what you changed is pinned (moving a spinning object keeps it spinning). Exact values, Hide / Show, Parent, Reset per object, ↶ undo, Clear all.
251. ✓ **📷 Use this view**: the angle you framed becomes the sketch's camera (Reset camera undoes it).
252. ✓ **Bake into code…**: asks the Three Director to write the placements into the code; the director also sees them in three_layers (placedByUser).

## Hearth on a Mac
253. ○ **Runs on macOS** (code ready, not yet run on a real Mac): Claude / Codex found where the Mac apps install them (or set in Settings → Engines), Mac menu bar so ⌘C / ⌘V / ⌘Q work, ⌘ works wherever Hearth says Ctrl (and the shortcut sheet shows ⌘), dock icon and bounce, After Effects in /Applications (scripts via osascript, aerender).
254. ✓ **Pack Hearth for a Mac** (Settings → App, or Ctrl+K): one zip with the app, chats, sketches, notes, references, palettes, memory, settings and usage data (tested: packs ~10 MB here without the Windows runtime).
255. ✓ **Moves cleanly**: on first start in a new place, saved locations of attachments, references and note screenshots are pointed at the new data folder (tested by unzipping elsewhere).
256. ○ **mac/setup-mac.sh**: one Terminal command downloads Electron for the Mac (Apple silicon or Intel), makes ~/Applications/Hearth.app with the flame icon (opens it, or restarts it when open) and starts Hearth. Steps in mac/README.md.

## Smooth playback
257. ✓ **🖥 Stage window** (Lab toolbar → View): the sketch runs in its own window with its own process and GPU context, away from the busy hub window, for steady frames when recording or on a second monitor (F11 there = fullscreen). Exact frame sizes render at full size (e.g. a real 1080×1920 canvas) scaled to fit. Music, sliders, timeline, keyframes, recording, screenshots, contact sheets, the scene editor and the director's tools all keep working through it; the preview here sleeps meanwhile ("Bring it back here" or closing the window returns it).
258. ✓ **Honest FPS**: counts displayed frames (layers used to multiply it) and shows the **worst frame gap** of the last half second, the number that shows stutter.
259. ✓ **Lighter timeline**: the waveform is drawn once into an offscreen canvas and reused while playing, instead of being re-colored pixel by pixel every frame.
260. ✓ **Lighter timeline**: while the song plays, only the playhead lines move each frame; the timeline and overview redraw ~10 times a second instead of every screen refresh (up to 240 a second on a 240 Hz screen). Measured: main-window work during playback 550 → 200 ms per second, timeline redraws 615 → 51 in 3 s.
261. ✓ **Preview frame rate** (Lab toolbar → View: Max / 60 / 30 fps): caps the sketch's frames; on a 240 Hz screen 60 fps does a quarter of the GPU work and gives steadier recordings. Works in the Stage window too.
262. ✓ **Lighter streaming chats**: replies (and thinking) repaint at most every 60 ms instead of on every word.
263. ✓ **Lighter usage tracking**: ignores clock ticks, streaming text and other constant small updates.
264. ○ **Unload idle websites** (Settings → General, off by default): website agents you haven't opened for 10 / 30 / 60 minutes are unloaded to free memory and CPU, and load again when you open them (ask-all wakes them first). Logins stay.

## From your usage (Tap was your most-used control)
265. ✓ **Sharper tempo detection**: the BPM is refined from the detected beats (the old 10 ms steps gave 127.7 or 130.4 instead of 128) and rounds to a whole number when it's that close; the song's other likely tempos show as one-click buttons next to the BPM (the current one highlighted).
266. ✓ **Better tap tempo**: press T (or the button), the live BPM shows on the button, stray taps are ignored (median of the last 16), near-whole tempos round; while the song plays the grid's beats also line up with your taps.
267. ✓ **Hits land on the hit**: K / S / H taps move onto the real attack in the audio (lows for kicks, highs for snares / hits), within 150 ms before to 60 ms after, which removes the delay of tapping by ear; "on the hit" can switch it off. Tested: a K pressed 70 ms late landed exactly on the kick.
268. ✓ **Auto-save sliders** (Sliders → Auto-save): values are written into the code a moment after you let go.
269. ✓ **One group at a time** (Sliders → One group): opening a slider group folds the others.

## Live sound and Spotify
270. ✓ **🎧 Live** (timeline → Song): sketches react to what the computer plays (System sound: Spotify, YouTube, Suno, anything) or a microphone, instead of a loaded song; kicks / snares / beats are detected live, so audio-reactive sketches work unchanged. Inside the Lab the hub page captures and forwards the analysis (the isolated preview can't capture); the 🖥 Stage window captures by itself and its ⏺ recordings include the live sound.
271. ✓ **Now playing** (no Spotify login): title, artist, cover, position and ⏮ ⏯ ⏭ for Spotify through Windows' media controls (or the current media app, e.g. a browser tab), Spotify's AppleScript on a Mac. 🎨 makes a palette from the album cover, 🖼 adds the cover to the sketch's references.
(Loading Spotify songs as audio files isn't possible: Spotify's streams are encrypted and extracting them would break its terms.)
272. ✓ **Live tempo**: the BPM is found from the kicks after a few seconds (shown on the 🎧 button; "?" while it's still listening), and audio.bpm / beat / beatPhase / beatInBar then follow a steady beat clock locked to the music (it keeps going through breaks, and lets go after ~6 s of silence).
273. ✓ **Live sensitivity**: Auto level (quiet or loud playback moves the sketch about the same) and Calm / Normal / Wild, in the 🎧 menu; remembered.
274. ✓ **Palette follows the cover**: each new song sets the sketch palette from its album cover.
275. ✓ The director sees live sound: three_media_info → live { input, bpm, what's playing (title / artist / album) }.

## Triggers, calmer timeline, restart
276. ✓ **⚡ Triggers** (timeline → Song, or 🎧 Live ▾): an EQ-style view of the sound (like Pro-Q) where Kick / Bass / Snare / Hats / Hit are each a band with a bar. A trigger fires when its band rises over the bar, at most every N ms. Drag a dot (sideways = which sound, up / down = the bar), drag the edges or wheel on the dot for the width; each band shows its live level and flashes when it fires (with a per-minute count). **Auto bars** sets every bar from the last seconds of sound (done once by itself the first time). Live sensitivity (Auto level, Calm / Normal / Wild) moved here from the Live menu.
277. ✓ Sketches: audio.trigger('kick' | 'bass' | 'snare' | 'hats' | 'hit'), audio.hats, audio.triggers. Kick / snare / hit still use hand-placed markers when a song has them; otherwise (and with live sound) the triggers. Director tool three_triggers reads / changes them.
278. ✓ **Fewer timeline controls by default**: ⋯ shows the rest (zoom buttons, loop points and lock, ×2 ½ / tempo candidates / meter / auto / snap / fill / undo, speed, Notes list, Sheet, Write, MIDI). Record moved into Capture. Code-only controls (snippets, three.js version, Live code) hide with the code. Now Playing shows its time and 🎨 🖼 on hover.
279. ✓ **⟲ Restart from scratch** (next to Run, Sketch ▾, or Ctrl+Shift+Enter): a brand-new page, GPU context and sound (the Stage window is recreated). A banner offers it when the preview stops responding or loses its GPU.
280. ✓ **⚡ Triggers → Timeline**: scans the whole song (or the loop) offline with the same analyser as the sketch, in well under a second, and writes what Kick / Snare / Hit find as timeline markers snapped to the real attacks. They're then normal markers you can move, delete or undo (↶).
281. ✓ **Fade** per trigger (how long a hit glows, 20–2000 ms); it also applies to hand-placed markers.
282. ✓ Slider music links can follow **Hats** and **Bass hit** too (audio.hats, audio.bassHit).
283. ✓ **Layers, faster** (you hide / show layers a lot): Alt+1…9 hides / shows the layer at that spot in the list (1 = top), Alt+Shift+1…9 shows only that one, Alt+click an eye = only that layer (again: all).
284. ✓ **Ctrl+R in the Lab** restarts the simulation from scratch (it used to do nothing there); elsewhere it still reloads the website.
285. ✓ Long chat replies you unfold with "Show full reply" stay unfolded (they used to fold again when the chat refreshed).
286. ✓ **Bass and Hats rows** on the timeline: ⚡ Triggers → Timeline now writes all five triggers. The two extra rows only appear once they have markers (the timeline grows by their height), and their markers then drive audio.bassHit / audio.hats.
287. ✓ **Triggers per song**: each song keeps its own bands and bars; switching songs brings them back. The last ones you set are the starting point for a new song.
288. ✓ **✦ Cue looks**: right-click a cue → ✦ Look at this cue… and pick a saved slider look (per layer). While the song plays, each layer morphs (~0.45 s) into the look of the last cue that set one for it, and stays until another cue changes it. Your own slider values are untouched (nothing to save, nothing marked changed); pausing goes back to them. Cues with looks show ✦. Only values that change live follow (ones that rebuild the scene don't). The director can set cue looks too (three_timeline_edit cues add with looks).
289. ✓ three_eval helper: __slider('key') gives a named slider's live value (with music links / looks applied).

## Look
290. ✓ **Forgeheart Swirl** theme (optional, in Settings → Theme; Forgeheart stays the default): rounded / pill-shaped controls instead of cut corners, slow-turning spiral galaxies behind the app (assets/swirl.svg) and behind empty screens, a swirl ring around the active agent and on the chat list's current item, a flowing wavy underline under the active tab, a swirl rim on important buttons when hovered, soft chat bubbles, orbiting "typing" dots and a swirl spine while a reply streams, soft swirl-in for views and toasts. Only transforms animate; Windows' "reduce motion" stills it. Forge skin selectors now use [data-skin~="forge"] so skins can stack.
291. ✓ **Forgeheart juice**: little diamond sparks burst from presses (gold from important buttons, the agent's color on the rail, cyan elsewhere) and from new notifications (red for errors); buttons squash slightly when pressed; important buttons twinkle (✦) while hovered; the active agent glows in its color; empty screens get twinkling star dust and a floating icon; window headers catch a passing glint now and then; the lit tab has a twinkling spark; notifications glow on their edge. Off with Windows' "reduce motion".

## The big pack (≈70)
292. ✓ Sketch helpers: audio.energy (loudness over ~1 s), audio.cue ({ name, index, start, end, progress } of your named section), audio.untilDrop / sinceDrop, onHit(kind, fn) (once per kick / snare / hit / hats / bass / beat), damp() frame-rate-independent smoothing, ease.* (11 curves), noise(x, y, z) Perlin noise, seeded(n) repeatable random. The director is told about them.
293. ✓ ❚❚ Freeze the picture (preview pill, or \) while the music goes on; . steps one frame; a frozen badge on the preview.
294. ✓ More frame sizes in the preview's "More…": 21:9, 4:3, 2:3, 4K, vertical 4K.
295. ✓ Timeline keys: Home / End (start / end, of the loop when there is one), M mutes the music (the sketch still reacts), Esc also forgets tap-tempo taps; double-click the overview strip = whole song.
296. ✓ Shift+click 📷 copies the screenshot to the clipboard; click the stats readout for just fps; ? shows every Lab key.
297. ✓ 18 Lab actions in the command palette (Ctrl+K → "Lab: …"): restart, freeze, keys, triggers, write triggers to the timeline, live sound on / off, now playing, present, stage, code, load music, screenshot (save / copy), contact sheet, new sketch, all timeline controls, mute.
298. ✓ ⚡ Triggers: Presets ▾ (techno / house, hip-hop / trap, drum & bass, rock / live drums, ambient; your bars stay and are re-fitted when there's sound), save your own presets / delete them, a crosshair readout (Hz · level) under the mouse, right-click a band to turn it off, 1–5 picks a trigger.
299. ✓ Looks: right-click → update with the current values, rename, duplicate, delete.
300. ✓ Chat: 🔊 read a reply aloud, Save a reply as Markdown, chat menu → copy the last reply, fold / unfold all long replies, jump to the first message, duplicate the chat, chat stats; Ctrl+Shift+C copies the last reply.
301. ✓ Notifications stay while hovered; Shift+Esc (or Ctrl+K → Clear all notifications) clears them; Ctrl+K → Sparkle effects on / off (turns off the Forgeheart sparkles), copy last reply, fold long replies.

## Pack 2 (≈55)
302. ✓ Fix: menus opened by a click (⚡ Triggers → Presets, Sketch → Cycle looks…, the chat menu…) closed instantly because the same click counted as "outside"; menus are also above the Lab now.
303. ✓ Sketch helpers: clamp, mix, map, smoothstep, fract, pingpong, snap, wave; hsl() and paletteAt(t) colors; beatPulse(div); onBar, onCue, everyBeats(n); audio.peak (loudest of the last 3 s), audio.section ('quiet' | 'medium' | 'loud').
304. ✓ Right-click the preview: screenshot (save / copy), freeze, guides, note, restart, present, Stage window, keys. (A sketch that uses right-click itself keeps it.)
305. ✓ ⌗ Composition guides on the preview (thirds, golden ratio, center cross): over the picture only, never in screenshots or videos.
306. ✓ Present hides the mouse after 2 s still.
307. ✓ Timeline: L loops the bar under the playhead (again: off), G cycles the snap setting; Fill ▾ → Quantize the markers to the snap grid, Remove doubles (closer than 80 ms).
308. ✓ Sketch ▾ → Copy all the code (every layer), Cycle looks… (every 1 / 2 / 4 / 8 bars while it plays, each layer moves to its next look, morphing; off stops).
309. ✓ Ctrl+S saves the selected layer's sliders into its code (your most-clicked button), Ctrl+Shift+S saves them as a look.
310. ✓ ⚡ Triggers → Presets also lists "♪ From <song>": copy another song's whole setup.
311. ✓ Now playing: click the song name to copy it. Stage window: Ctrl+K → "always on top / normal".
312. ✓ 10 more Lab actions in Ctrl+K (guides, loop this bar, snap, quantize, remove doubles, cycle looks, copy all code, save sliders, save as look, Stage on top): 32 in all.
313. ✓ Chat: Ctrl+↑ / Ctrl+↓ jump between your own messages (they flash); select text in a reply → ❝ Quote puts it in your message.
314. ✓ App: Ctrl+K → Recent notifications (the last 40), middle-click an agent on the rail = a new chat with it, the window title shows what you're looking at.

## Token meter (meter stream, 157 upgrades: docs/upgrades/meter.md)
- ✓ Live meter strip at the bottom (or a pill in the rail): tokens ticking while replies stream, then snapped to the real count; this chat, today, Claude vs Astra, cache hits, context fill (click → compact), replies, average per reply, today's feature clicks.
- ✓ Dashboard (Ctrl+Shift+U, `/usage`): day / week / month / all charts, per agent / model / tool, most expensive chats, features used / hot / cold / never used with Hide, budgets & alerts (opt-in), CSV / JSON export. Data in `data/kv/token-stats.json`, built from your chats on first run.
- ✓ Token line under every reply with cache % and speed, token totals per chat in the panel, 55 `/` commands (`/help meter`).

## Look: Forgeheart 2 (look stream, details in docs/upgrades/look.md)
- ✓ Forgeheart is bolder by default: deeper forge blacks, molten gold, ember, electric violet for the AI, brushed metal, glass overlays, chrome slider knobs, molten-gold primary buttons. **Forgeheart Classic** keeps the old look exactly (`/classic`).
- ✓ 31 looks (25 new, light ones included) in Settings → Appearance (a compact swatch picker), Ctrl+Shift+L, Ctrl+K, and `/theme <name>`, `/themes`. Save your own with `/appearance save <name>` (`/look …` outside the Lab).
- ✓ Toggles: textures, glow 0–100, motion (full / calm / off), density (compact / normal / roomy), corners (cut / round / square), your own accent, chat font, forged tooltips (`/texture`, `/glow`, `/motion`, `/density`, `/corners`, `/accent`, `/chatfont`, `/tips`, `/sparkles`).
- ✓ Micro-interactions: chrome glint on press, a molten ring and sparks when you send, embers on Save, Tap rings, Shuffle die rolls, Freeze frost, notifications pop or shake, violet shimmer while the AI writes. Everything pauses while the window is hidden.

## Chat core (night build, ≈300; full list in docs/upgrades/chat.md)
315. ✓ Every chat feature is a chat command (144 of them: chats, messages, compose, agents, style, memory, export, view, app); `/help` lists them, the `/` menu groups them with your recent ones first, Ctrl+K has them all, `/alias` makes your own and `/run` chains them. Agents' `<suggest>/command</suggest>` chips run commands.
316. ✓ Messages: ⋯ menu (rare actions tucked away), token badges, pins with a sticky strip, bookmarks across chats, reactions with notes, day lines, an unread "New" line, live status while streaming, scroll lock, thinking peek / duration / Alt+T, read aloud with highlight, rate, voice and auto-read, selection bar, raw Markdown view.
317. ✓ Code blocks fold, show language and lines, have a ⋯ menu (insert, wrap, notes, Lab, node view hook). Markdown: task lists, nested lists, callouts, aligned tables, light math, highlights, keycaps, https pictures.
318. ✓ Message box: draft history (Alt+↑↓), smart paste, Tab in code fences, Ctrl+Enter mode, style chips (/tone /persona /lang ride along once, never in the system prompt), typo guard for commands, Alt+R/B/P/M/F shortcuts.
319. ✓ Chats panel: filters (pinned, today, unread, busy, archived, tags, folders, agent), unread dots and counts, tags, folders, archive, sort, keyboard navigation.

## Three.js Lab, reworked around your habits (lab stream, ~306 upgrades: docs/upgrades/lab.md)
- ✓ **Sketch first**: the tabs moved into the header; Model viewer, Shaders, Textures, Docs, Color and Easing live in a 🧰 Tools drawer. One-row toolbar in workflow order; never-used controls (Focus, Screenshot, snippets, three.js version, loop buttons, Record, Write, MIDI, layer ⧉ / 🗑) moved into ⋯ / right-click menus. Key hints on hover.
- ✓ **Sliders**: big Save and 🎲 Shuffle; shuffle amounts, scopes, groups, seeds and a ‹ › history; slots A / B / C with peek, morph and auto-morph; group chips; scrub by dragging a name (Shift / Alt fine); per-slider history, copy / paste, save just one, MIDI learn; sliders that move by themselves (LFO, walk, beat steps, pulse, song sections).
- ✓ **Preview**: segmented frame sizes (Shift+1…5) + your own size; safe zones for TikTok / Reels / Shorts, Instagram's 3:4 crop and title-safe frames; F freezes (on the beat / bar / kick too); ◐ compare a pinned frame (onion, wipe, difference); 📷 exact-size stills, folders of stills per cue or in all four sizes; Present info line, blackout and sketch switching.
- ✓ **Timeline**: bigger Tap with BPM readout and confidence, Shift+T = the 1, Q quantize, marker / waveform right-click menus, Shift+drag loops, loop chip, hover time, smooth zoom, grid view options, beat light and click track, sections that looks follow, quick trigger Presets / Auto bars, live input / gain / latency, record formats, fps, quality, countdown, N bars / seconds.
- ✓ **Chat commands** for everything (tools/three-cmds.js, `/help lab`): /size, /freeze, /shuffle, /save-sliders, /slot, /morph, /look, /tap, /bpm, /live, /loop, /record, /still, /present, /sketch, /console, /preset, /marker… (84 commands).

## Video Review reworked (video stream)
- ✓ **One review surface** (library · player · notes) with a **Review · Director · Toolkit** switch; the AE toolkit is a slide-over drawer; fits beside the Director chat.
- ✓ **Library**: 9:16 / 16:9 / 4:5 / 1:1 chips, favorites, tags, date/length/project filters, versions grouped, hover scrub, live folder watching, Lab recordings and exports included.
- ✓ **Player**: frame-accurate stepping with the file's real fps, J/K/L, loop by dragging, waveform + beats + drops, zoom/pan, color picker, histogram + luma waveform, channel/luma/negative/mirror views.
- ✓ **A/B**: wipe, side by side, onion, difference, flip, swap, offset. **Safe zones** for TikTok, Reels, Shorts, Facebook, Snapchat, IG grid, YouTube; crop previews between the four formats.
- ✓ **Notes**: categories, drawings on the frame, must-fix, resolve, carry to the next version, Markdown/CSV/JSON, inbox; feedback to the Director, Claude or Astra with frame grabs.
- ✓ **Export for socials** with ffmpeg (18 presets, crop / fit / blurred fill, loop range, all formats at once). ○ **After Effects on a Mac** (AppleScript, permission errors explained; tested with a fake AE).
- ✓ **54 chat commands** (`/help video`). Full list: `docs/upgrades/video.md`.
## Lab FX pack (fx stream)
One searchable **FX picker** in the Three.js Lab (**X**, the Layers **＋ Layer** button, Ctrl+K, `/fx-picker`) with tabs, favorites, recent, 🎲 surprise and live filter thumbnails of your own picture: 156 new filter layers (109 new shaders: glitch, datamosh, film, color/LUT, stylize, distort, light, feedback, beat-reactive, frames), 85 music-reactive layer templates (shader backgrounds, visualizers, text/HUD/social overlays, 3D scenes), 154 looks (incl. Forgeheart), 104 palettes, 62 trigger presets, 28 keyframe eases, 13 eased animations, 22 blend presets and 6 more blend modes. Chat: `/fx`, `/fx-list`, `/layer-add`, `/look-apply`, `/fx-palette`, `/trigger-preset`, `/animate`, `/ease`, `/blend`, `/surprise`. Full list: `docs/upgrades/fx.md`.
## Nodes (visual coding)
- ✓ Three.js Lab: a **Code | Nodes** switch on the code pane (Alt+N, `/nodes`). Build music visuals with nodes and wires (127 node types: shapes, materials, particles, tunnels, spectrum bars, blobs, lights, motion, camera, music bands / hits / beat / drops, triggers, LFOs, math, palettes, post effects, filter layers). A graph compiles to a normal readable sketch; its knobs are the Lab sliders (Save, Shuffle, looks, keyframes keep working) and the graph is kept in the code's last line.
- ✓ 29 presets (beat particles, audio tunnel, kick-flash grid, spectrum circle, morphing blob, synthwave terrain, filter layers…) via the picker, `/nodes-new`, `/nodes-layer`, `/nodes-preset`.
- ✓ Editor: pan / zoom, minimap, typed colored ports, flowing live wires with live values, drop-a-wire node picker, box select, copy / paste / duplicate, undo, frames (= slider groups), notes, reroute dots, collapse, inline widgets (slider, knob, color, toggle, select, text, ease curve, vector), auto layout, find, snap. `NodeView.openCode(code, lang)` opens any code as nodes (or a read-only outline).
- ✓ Chat: `/nodes-…` commands (add, link, set, rm, list, types, presets, layout, frame, rebuild, from-code); the Three Director edits graphs with `three_nodes`. Full list: docs/upgrades/nodes.md.
## Nodes, round 2 (nodes2 stream, 304 upgrades: docs/upgrades/nodes2.md)
- ✓ **Shader nodes** (playground → ◇ Nodes, `/shader-nodes`): GLSL fragment shaders as 91 node types (uv, time, music hits / levels / beat, math, value / simplex / fbm / voronoi noise, SDF shapes, palettes and ramps, distortions, blends, the picture below) with a live preview; 22 presets. Compiles to the playground, a Lab filter layer, a Lab layer that follows the song, a new sketch or Shadertoy; knobs become Lab sliders. `/shader-nodes-new <preset>`, `/shader-nodes-to filter`.
- ✓ **Video flows** (Video Review → Flow, `/video-nodes`): the render → review → notes → export pipeline as 35 runnable steps (library / Lab recordings / AE projects, loop, crop, safe-zone checks, notes, contact sheets, A/B, aerender, ffmpeg exports, feedback to an agent, any chat command), live status on the nodes, "wait for me" checkpoints, 18 presets (all 4 socials, review + notes to the director, render → compare…). `/video-flow <preset>`, `/video-flow-run`.
- ✓ **Code flow**: any JS / TS / Python / GLSL in a chat as functions and calls (code block → Nodes, `/code-nodes [n]`): classes and modules framed, callbacks named, top-level code as a sequence, a side panel with the code and a light edit.
- ✓ Editor: run status badges, bypass (M), hover-to-trace wires, `[` / `]` chain selection, new widgets (chips, ranges, pick lists, buttons, code, color lists), a shared searchable preset picker, read-only niceties.
## Add-ons & presets (addons stream, 391 upgrades: docs/upgrades/addons.md)
- ✓ Prompt library with 169 presets in 11 categories (159 new), search, favorites, most used, blanks with defaults and dropdowns (`{{tone|warm,dry}}`), import / export; presets merge without touching your prompts. `/library` (also /prompts), `/prompt-new`, `/prompt-save-last`.
- ✓ 42 short personas + 16 more website presets in a searchable picker (add-agent → Browse…, `/agent-new <preset>`).
- ✓ Notes: search, #tags, pins, clickable checklists, [[links]], 11 templates, daily note, links to chats / sketches, Inbox capture (`/inbox`, `/todo`, `/daily-note`).
- ✓ Memory: facts with categories, pins, expiry, search, import / export and its token cost per message (`/memory`, `/remember`, `/forget`, `/memory-cost`).
- ✓ Kit window (`/kit`): palettes from pictures / clipboard / the Lab frame → Lab palettes, harmonies, contrast checker, gradients (CSS / GLSL / three), 27 more easings + GSAP / GLSL output, BPM ↔ ms with tap tempo, social frame sizes with safe zones, timecode calculator (`/kit-palette`, `/easing`, `/kit-bpm`, `/aspect`, `/tc`, `/save-palette`: the Lab owns /palette, /ease, /bpm, /size).
- ✓ Forge Debug: ⋯ quick actions, stat watch overlay, snapshots / restore, patch sets, 27 `/forge-*` commands (tested against a fake build, dev/fake-forgeheart.html).
- ✓ One-click and automatic backups with a merging restore, searchable trash and downloads, import that checks first (claude.ai / ChatGPT export variants, dedupe report, progress). `/backup`, `/restore-backup`, `/trash`, `/downloads`, `/import-chats`.
## Astra × Claude (astra stream)
- Astra (Codex / ChatGPT) is a full chat agent: per-chat model, effort (minimal…xhigh), web search, answer length, personas (14 presets + your own), opt-in sandboxed file access, opt-in talk-back tools, `/astra-doctor` diagnostics. Commands: `/help astra`.
- Claude and Astra work together from one chat: the ⚇ chip in the composer or `/duo`, `/relay a→b N`, `/critique`, `/debate N`, `/council seats`, `/compare-agents seats`, `/handoff`, `/opinion` (both ways), 17 ready-made `/collab-preset`s. Results land in one compact card with per-participant token totals. Commands: `/help collab`.
- Directors (Three / Video) can run on either engine: `/director-engine three astra`. Full list: docs/upgrades/astra.md.
- ✓ One-click and automatic backups with a merging restore, searchable trash and downloads, import that checks first (claude.ai / ChatGPT export variants, dedupe report, progress). `/backup`, `/restore`, `/trash`, `/downloads`, `/import`.
## Polish: one designed product (polish stream, 242 upgrades: docs/upgrades/polish.md)
- ✓ Shared tokens (corners, motion, importance colors, control heights) so the Lab, FX picker, nodes, Video Review, meter and add-ons follow every look, `/corners`, `/motion` and `/density`.
- ✓ Materials on the favorites: chrome 🎲 Shuffle beside gold Save, a forged Tap that turns gold, ice-glass Freeze, gold segmented controls, chrome node headers, molten Play.
- ✓ Compact: slimmer composer and dialogs, code blocks without the empty foot, one-row chips, a Lab that fits beside the docked director, long menus that scroll and fade.
- ✓ Calm: no idle loops (rainbows rest until something is live), reduced motion everywhere, one focus ring, full text on hover for anything cut short. `/appearance` opens the look picker.
## Directors, round 2 (director stream: docs/upgrades/director.md)
- ✓ Cheaper every message: the Three Director's fixed cost went from ≈ 8.7k to ≈ 2.8k tokens (lean tool list: everyday tools + one `three_do` multi-command tool, guide topics on demand with `three_do help`); Video Director 2.1k → 1.6k, Forge Debug 2.6k → 1.5k. `/director-cost`, `/director-tools`, `/director-mode full` (opt-in, everything every message).
- ✓ Faster loops: `three_edit_code` returns a short diff + errors (with their code line) + fps and, with `shot: true`, a small preview; batches over several layers (all or nothing); screenshots with size / region / at "drop" / compare / frame strips, unchanged pictures and re-reads not sent twice; eval truncation and `samples`; search / read as trimmed text.
- ✓ Docked chat: activity strip (tool icons, tokens read this reply, failures), thumbnail of what it saw, ↶ one-click undo of its code edits (`/undo-edit`, Alt+Shift+Z), quick chips (some run locally for free), collapse to a thin bar (Alt+Shift+D, double-click the divider), width presets (`/dock-width`).
- ○ Astra as a director: `/director-engine astra` gives Codex the same hub tools over MCP (`-c mcp_servers.*`); tested with the fake Codex only.
## Command bar & command search (cmdbar stream, 152 upgrades: docs/upgrades/cmdbar.md)
- ✓ **Ctrl/⌘+;** anywhere: a slim command line over the Lab, Video Review, Forge or a chat. Commands run in what's on screen (the docked director's chat, so Lab versions of shared names apply); output shows in a small card (↻ again, ↶ undo, copy, → draft, 📝). Ctrl+K then "/" also opens it.
- ✓ Your own words: "make it 9 by 16" → `/size 9:16`, "dark theme" → `/theme midnight`, "every 5 minutes shuffle colors" → `/every 5m /shuffle colors`; "did you mean" in every chat box; argument hints while typing; `/help` is a searchable view with examples (166 commands), try buttons, pins and undo notes. `/how`, `/what`, `/discover`, `/where`.
- ✓ Power: ↑ history, `!!`, `/repeat`, `/macro rec … stop`, `/every` / `/at` / `/after` / `/remind` timers (kept across a reload), pipes (`| draft`, `| copy`, `| note`, `| grep x`…), ★ pinned commands (Alt+1…9), recent per tool, `/undo-report`. All local, zero tokens.
- ✓ Commands written in agents' replies (`/size 9:16`) run when clicked; code blocks of commands get "▶ Run these".
## Jam: Claude × Astra make a visual (jam stream, round 4: docs/upgrades/jam.md)
- ✓ One action: the 🎛 Jam chip above the Three Director's chat box, or `/jam [rounds] [idea]`. Claude builds in the Lab, Astra looks at a small picture (3 frames over the song when it plays) and directs in ≤3 lines, Claude applies it; the lead swaps when Astra is a director with Lab tools. 4 rounds by default; Esc / `/jam stop` stops it.
- ✓ Calm and safe: one folding card in the director's chat (thumbnail + one line per round, tokens per agent) and a small Lab badge; the jam works on a copy of your sketch, every round is an undo point (↺, `/jam keep 2`), broken builds are fixed first or reverted, and it never ends broken.
- ✓ The end: both name the best round (Astra settles a disagreement), it goes back into the Lab with its sliders saved and a look. `/jam again` adds 2 rounds.
- ✓ Frugal: every turn is a fresh session with a one-line summary; Astra gets a 512 px JPEG and 3 lines; builds keep only the Lab tools. ○ Tested with the fake engines only.
## Scenes: one scene per chat (scenes stream, round 4: docs/upgrades/scenes.md)
- ✓ Each Three Director chat owns its Lab sketch (layers, sliders, looks, song, frame size): switching chats switches the scene; a new chat starts from a calm starter named after it; older chats link the first time you use them (nothing migrated or lost). No settings; `/scene`, `/scene link`, `/scene new`, `/scene unlink` for power use.
- ✓ Which is which: every director chat has its own color + mark on its row, in the dock header and as a frame + corner tag on the Lab preview (with Claude / Astra / both, glowing while working); working background chats show a dot in their color.
- ✓ Directors edit only their own chat's scene: calls carry their chat; a scene that isn't on screen runs backstage (hidden sandbox: edits, screenshots, eval, console), undo included. Video Director chats come back to their own video.
## Simplify (round 4, docs/upgrades/simplify.md)
- ✓ Less on screen: short menus (rare items behind More…), messages show Copy + ⋯, the header only ⋯, the rail one ⋯, the meter a rail pill, the ask-all bar hidden, Settings → More settings, Appearance with 3 looks (+ More looks, Advanced), the FX picker opens on Suggested, a lighter Lab toolbar and sliders. Everything stays reachable by menu, shortcut or command.
- ✓ `/decide [look|effect|palette|template|size|theme]` (and ✦ buttons in Appearance, the FX picker and the preview ⋯): Astra picks with one small question (Claude, then a local default as fallbacks), applied with Undo; `/decide log` shows the cost.
## Scenes 2 + Jam polish (scenes2 stream, round 5: docs/upgrades/scenes2.md)
- ✓ Every Three Director chat row shows a small still of its own scene (refreshed only when the scene changes); switching chats cross-fades from the old scene to the new one; Claude / Astra icons on the scene tag; the chat's color + mark on the sketch picker and its notifications.
- ✓ Jam: a filmstrip timeline in the card (who led each round, scrub to preview, click to keep), a one-line recap at the end (no extra model call), ⤴ Share (still to the clipboard + a 10-second clip, `/jam share`), `/jam` reuses the idea of your last jam on the same song.
- ✓ Robust: a jam keeps going backstage when you switch chats, never touching the scene on screen; ten switches in two seconds end on the right scene with no cover left.
## Music side of the Lab (music stream, round 5, 51 upgrades: docs/upgrades/music.md)
- ✓ The app analyses each song in a background Worker: exact tempo, bar 1, kick / snare / hat hits, sections (intro / build / drop / break / outro, with confidence), drops and a style that picks the trigger preset; one note says what it found and offers **✦ Make it react** (sliders follow kick / bass / loudness by their names, undoable). `/analyze`, `/drops`, `/auto-preset`, `/make-it-react`.
- ✓ Mark kicks for me: found hits show as ghosts in empty K / S rows, one click keeps them (`/mark-kicks all`). Tap locks to the song's grid, fixes half / double time, learns how late you tap; Shift+T keeps the phase; `,` `.` nudge the grid by ear (`/downbeat`, `/tap-latency`).
- ✓ 3-band waveform with section bands, bars readable at every zoom, the loop stands out; the timeline no longer redraws or forces layouts while a song plays. Live sound: auto gain, a beat-lock light, latency set from your taps (`/live-status`, `/live calibrate`).
## Brain: both AIs drive Hearth your way (brain stream, round 6, 63 upgrades: docs/upgrades/brain.md)
- ✓ An app map Claude and Astra read on demand (`three_do help app|lab|nodes|react|commands|handoff|habits`, `hearth_help` for the Video Director); one short line in the prompt. Directors can run Lab / music / nodes / video commands themselves (`three_do run`, e.g. `/make-it-react`).
- ✓ Your rules in the guide and the tools: a new effect = a new layer (`three_add_layer` is an everyday tool, compact results), visual layers as node graphs (node tool on by default, works backstage too, `/nodes-director off`), time first like After Effects (Keyframes node, 5 timeline presets, calm layer templates) and music reactivity only when you ask.
- ✓ Claude ⇄ Astra in the same chat and scene: Hearth keeps each director chat's task state (goal, done, layers, todos, last look; `/task`) and hands it to whichever engine runs next after `/director-engine`, `/handoff` or the ⚇ menu's "Continue on …". ○ Tested with the fake engines.
## Cut: clip editing (cut stream, round 6, 93 upgrades: docs/upgrades/cut.md)
- ✓ **E** (or ✂) in Video Review turns the timeline into a clip track: S split, Del / Shift+Del (lift / ripple), drag edges to trim (snaps to beats, cuts, markers, notes, playhead), drag to reorder, Q / W, D, A mute, [ ] speed 0.25–4× (pitch kept), fade handles, I / O, M markers, Shift+F freeze frame, Shift+T title card, ⌘Z. Drop videos or library cards on the track to add them. Saved per video; files untouched.
- ✓ The player plays the edit seamlessly (next clip preloaded in a second decoder); **⇪ Export** renders it with ffmpeg as the next version next to the video (shows in the library) or in the social presets / all 4 socials / GIF / PNG stills.
- ✓ Auto-cut on the music as a suggestion you accept (every bar / 2 / 4 bars / beats / drops / sections / markers). The Lab's timeline trims the song ({ }), saves the loop as a file and sends a Lab video's loop to Video Review as a clip. 26 commands (`/split`, `/ripple-delete`, `/cut-auto bars`, `/cut-export reels`…), 2 flow steps, 3 Ctrl+K entries.
## Live Lab edits (live stream, round 6, 26 upgrades: docs/upgrades/live.md)
- ✓ The Lab view and its docked chat no longer blank out (dropped behind the window) during every director tool call.
- ✓ No whole-preview reloads for director / chat changes: edits re-run one layer, jam rounds and undo only the changed layers, scene switches and ▶ Run swap the stack in the same page (three.js, music and live sound keep going). 9 → 3 page reloads over the 24 measured actions; the 3 left are the truly global ones (pixel ratio ×2, Restart).
- ✓ Things build in front of you: code changes cross-fade from the layer's old picture, new layers wipe in, removed ones fade out, a "building…" pill on the preview corner and a shimmer on the layer row while the director works.
- ✓ Unavoidable reloads hold a picture of your scene and cross-fade once the new page has drawn (no black flash). 30 edits in a row leave no GPU contexts, listeners or timers behind (`dev/checks/live.js`).
## Declutter: less in your face, more under the pointer (declutter stream, round 7: docs/upgrades/declutter.md)
- ✓ Hold **Alt (⌥)**: tucked buttons come back in place (dashed outline); tap Alt twice to keep them out. Hold **Ctrl (⌘)**: key badges on every button that has a key. Robust to window blur, key repeat and Alt / Ctrl shortcuts.
- ✓ The **keys button** bottom left (Ctrl/⌘+/, `/shortcuts`): every key, reveal and right-click menu (the `Keys` registry), what applies where you are first, searchable; click a line to run it, press it, or open that right-click menu on screen.
- ✓ Right-click everywhere (messages, code, chat header / box, chat rows, rail, Lab toolbar / picture / sliders / layers / console / timeline / effects, dock, Settings, dashboard, command bar, notes, memory, tab bars, toasts), short menus with `›` submenus (hover flyouts, keyboard, type-to-filter, top layer over dialogs). Every menu ends with **Customise this…**: pin a tucked control back, tuck any button behind Alt, tuck what you never use, `/calm off` for everything.
- ✓ Visible controls on the main surfaces 183 → 136 (clutter.js); Lab Save / Shuffle / Tap / Freeze / frame sizes / Live sound and the director chat stay one click away. `/calm`, `/reveal`, `/customise`, `/pin-control`, `/unpin-control`, `/tucked`, `/rightclick`.
## Mood board (board stream, round 7, 1309 upgrades: docs/upgrades/board.md)
- ✓ **Board** (▦ in the rail): an infinite canvas of pictures, clips, websites (live snapshots, offline-safe), notes, colors, shapes, connectors and frames; pan / zoom 2 %–3200 % as one compositor transform, culling and small / medium / full pictures by size on screen, clips play only on hover. One visible action (+ Add); everything else in right-click submenus, Alt / Ctrl reveals and `/board-*` commands.
- ✓ **Vibe, not footage**: Hearth reads each reference locally (palette, light, contrast, saturation, warmth, texture, grain, composition, motion energy, cuts and pacing, fonts, mood words) and chats get a short vibe text; the file only goes along when you allow it (`/board-footage`).
- ✓ **From any chat**: Ctrl+Shift+M drawer, drag a reference into the message box, `/board-use [focus]`, `/ref <words>`, `/vibe`, `/board-ask`; a board can be linked to a chat; Claude and Astra get `board_*` tools when you opt in (`/board-tools on | directors`).
- ✓ 70 layouts, 110 templates, 42 vibe lenses, 70 looks, 178 palettes, presentation with 16 transitions, compare, 18 exports, versions, undo / redo. ○ Tested headless with local files, a local web page and fake engines (no network, no real Claude / Codex).

## Capture: Hearth screenshots and records itself, reads any video exactly (capture stream, round 7: docs/upgrades/capture.md)
- ✓ One entry: ⋯ in the rail → ◉ Capture (or ⌘/Ctrl+Alt+S, `/capture`). Screenshots of the window, a tool, the chat (or the whole chat as one tall picture), the Lab at its exact frame size, a region or thing you pick; clean UI, Retina pixels, 23 social frames, beautified post shots (15 looks, 59 backgrounds), annotation (arrows, boxes, text, badges, blur). `/shot tool 9:16 clean`, `/shot transcript`, `/beautify`.
- ✓ Recording of Hearth itself (`/record`, ⌘/Ctrl+Alt+R): the page records its own frame at a steady rate, its own sound (+ mic), countdown, pause, markers, max length, cursor / clicks / keys / zoom-on-click / camera bubble; the REC light is a separate window, never in the picture; WebM + MP4 (ffmpeg), social sizes; opens in Video Review, the editor or the Lab in one click. 17 presets.
- ✓ Tours: hands-free scripted takes for your intro video (`/tour intro`, 21 tours, 48 steps incl. tilt, push, whip, letterbox, captions, titles, beats), or tape one by doing it once (`/tour tape`).
- ✓ Frame reader for any video (`/frames`, `/scenes`, `/contact`, `/pacing`): exact frames by time / frame / timecode (VFR-safe, verified against burned-in frame numbers), every N, scenes, contact sheets, motion, palette, loudness, letterbox, a vibe card for references; `/make` GIF / trim / timelapse / PNG frames / 9:16 copies.
- ✓ For the chats: `/capture-tools on` gives a chat's Claude or Astra capture_shot / _record / _frames / _list (opt-in, ≈ 550 tokens a message while on); pictures come back inline for both engines.

## Video editor (editor stream, round 7, 1389 upgrades: docs/upgrades/editor.md)
- ✓ The clip track (E / ✂ in Video Review) is now a whole editor for any footage, with or without sound. It is frame-exact: ←/→ (Shift: 10), `,` `.`, J K L, HH:MM:SS:FF timecode and a frame counter, and every seek is checked with requestVideoFrameCallback. It has video / overlay / text / audio tracks, split / razor / roll / slip / slide / lift / extract / insert / overwrite, markers with notes and in–out.
- ✓ Clips and layers take keyframes with 63 easing curves, plus 131 transitions, 197 looks, 56 clip effects, 39 sound effects, 117 title styles, 110 title animations, 36 lower thirds, 70 shapes and motion graphics, 90 motion presets and 22 speed ramps. They can also be frozen, reversed, blended, nested and given social formats with safe zones. 48 templates are available (start from ⋯ › Template › Hearth intro 20 s).
- ✓ The compositor plays the edit gaplessly. The ffmpeg render matches the preview, and the edit is recorded in real time as WebM when ffmpeg isn't installed. Undo / redo, snapshots and EDL export are included.
- ✓ There are 95 editor chat commands on top of the clip-track ones (`/help editor`), and Claude and Astra get three lean MCP tools (`video_edit_read`, `video_edit_frame` gives an exact frame's picture, `video_edit`).

## Polish 8: one calm app across the board, the editor and capture (polish8 stream, round 8, 244 upgrades: docs/upgrades/polish8.md)
- ✓ One menu shape on the board, the editor's track, captures and the Lab ⋯: main action, arrange, look, send / export, More…, Delete, then **Customise this…** (it now ends every menu of these surfaces); the editor's keys sit in the key column like everywhere else.
- ✓ The app's SVG icons replace emoji in the capture menu and the rail ⋯; the shared verbs (Look, Arrange, Send to a chat, Export, Present, Customise this…) carry the same icon everywhere; new icons for capture, the editor, video projects, tours and frames.
- ✓ Less on screen: the board drawer 9 → 4 controls, the editor bar 6 → 5 (Alt / pointing brings them back, `/tidy`); right-click the board chips and the editor bar for their menus; the keys sheet lists the editor's and capture's keys (capture's ≈60 never reached it) with an icon per area, and its new lines run when clicked.
- ✓ Fixed: the editor's program monitor painted over other tools after editing; the captures library's selected tab was unreadable; menus over playing media and the capture viewer no longer re-blur moving pictures. Tested in Forgeheart 2, Classic, Forge Light and Parchment (`dev/checks/polish8*.js`).
## Video projects: your intro for socials, end to end (intro stream, round 8: docs/upgrades/intro.md)
- ✓ One entry: `/intro` (or ⋯ in the rail → 🎬 Make a video…, ⌘/Ctrl+Alt+I) proposes a plan in one card (beats, length, 9:16 · 16:9 · 1:1); **▶ Make it** accepts it, **✦ Astra decides** picks the details. 29 beat templates (product intro, feature tour, teaser, changelog, loop, launch, speedrun…).
- ✓ The flow, one live card in the chat: the linked board's vibe (never its footage) → Claude ⇄ Astra jam a Lab scene per beat → Hearth filmed by 28 tour recipes → one sequence in the editor (titles, transitions, grade, music cut on the bars, markers) → frame-exact review with Astra's notes as markers → every format rendered with a cover each. Undo per step, redo one beat, Claude ⇄ Astra take over a step.
- ✓ ✂ The 15 s and 6 s cuts from the same captures, post text for 6 platforms, GIF / boomerang / frames / SRT / EDL; projects listed in one place (`/video-projects`) and reopened in any chat. The Video Director drives it with `video_edit { op: "project" }` and gets the capture tools for its pass only. ○ Tested headless with fake engines (software WebGL: Lab takes fall back to a still).
## Lab frames: the Lab timeline frame by frame on footage (labframes stream, round 8, 284 upgrades: docs/upgrades/labframes.md)
- ✓ Load a video in the Three.js Lab (no song needed): true fps from ffprobe (VFR and 29.97 exact; measured from the decoder without ffmpeg), the time box becomes a timecode · frame counter confirmed with requestVideoFrameCallback, ← → (Shift 10), `,` `.`, J K L, Home / End, ↑ ↓ edit points; scrubbing, loops, cues, markers and keyframes land on frames; a filmstrip under the timeline. Silent footage tucks the music controls away.
- ✓ Cut it in the Lab (S, Delete, drag a cut line, speeds, held frames, repeat / reorder, cut at shots / cues / markers / bars): the sketch plays only the parts and never shows a removed frame. The cut *is* the video's edit in Video Review's editor (one model): open it there, render it, sequences in and back, EDL.
- ✓ Sketches read the exact frame: `media.frame`, `media.onFrame`, `media.part`, `media.timecode`…; 21 footage layers (fill, timecode burn-in, echo, on twos, time RGB, motion glow, flash / punch / shake / glitch on cuts, luma / green-screen keys, blurred-fill reframe, slit scan, frame wall…).
- ✓ Reference clips (Lab references, board clips) read exactly (sheets, scenes, motion, pacing) and lend their rhythm, never their footage: `/match-pacing` (fit, own shot lengths, on the beat, as hits, cut to it), `/pace-check`, `/ref-motion`.
- ✓ Chats: `/footage …` and 22 more commands (plus 7 of the editor's frame commands working on the Lab footage), 10 Ctrl+K actions, keys in the keys button; Claude and Astra step / read / cut frames through `three_media_control` (frame, step, read) and `three_do footage` (≈58 more tokens on the director's tool list).

## Lab sequence: a video timeline right in the Three.js Lab (sequence stream, round 8: docs/upgrades/sequence.md)
- ✓ **▤ Sequence** on the Lab timeline's strip (or `/sequence`) turns it into tracks: scenes (sketches, chat scenes, saved looks, a board vibe) and footage on the main track with the editor's transitions (a dissolve by default), Titles (the editor's styles + animations), Overlays (a Lab layer or filter over a range), Sound (the song still drives what reacts). No questions to start: the scene on screen, its song, your frame size.
- ✓ Build by dragging from ＋ (tiles), files, Video Review cards or board references (vibe only), or right-click the preview → Add this scene; S / Delete / Shift+Delete / D / Q / W / Alt-slip / J K L / ← → like the editor, snapping to bars, beats, markers and edges; new scenes last 4 bars and land on bars.
- ✓ The preview plays it in place: scenes switch and cross-fade without reloads, any frame of any scene is exact (each scene runs on its own clock from its clip), keyframes move with the clip; the playhead runs on the compositor.
- ✓ One model with the editor: ✂ Finish in the video editor opens the same sequence there (scene clips render through the Lab), ◭ Back to the Lab sequence brings it back. ⇪ renders frame by frame at 9:16 · 16:9 · 1:1 · 4:5 with the sound (ffmpeg; real-time recording without it) into Video Review.
- ✓ Chats: `/sequence …`, `/add-scene`, `/sequence-render`; Claude and Astra use `three_do { cmd: "sequence", op }` (help topic `sequence`); `/intro` renders its Lab beats frame-exact through it.

## Robust: your real Claude Code and Codex, just working (robust stream, round 9, 35 upgrades: docs/upgrades/robust.md)
- ✓ At startup Hearth reads every Claude Code / Codex copy on the computer (PATH, Homebrew, npm / nvm / Volta / Bun, `~/.local/bin`, the Claude app's bundled one, Codex.app, the Windows app folders), uses the newest working one by itself (Settings → Engines still wins) and checks sign-in. A too-old, missing or signed-out engine gets **one calm notice** with a one-click fix.
- ✓ Fixes run in a window you can see (Terminal on a Mac, PowerShell on Windows, a terminal on Linux): the right update for how it was installed (`claude update`, `brew upgrade claude-code`, `npm i -g …@latest`, the official installer) or the sign-in. Hearth checks again when it's done ("Claude Code 2.1.400 is ready ✓") and never sees a password.
- ✓ Runs heal themselves: "version X or newer is required" continues on a newer copy (or offers Update under the error), a missing tool file is rewritten, Codex cancelling Hearth's tools is re-run with approvals off, a dropped connection gets one more try. Unknown options are still dropped as before.
- ✓ `/doctor` puts both engines in one card (versions, every copy, signed in, minimum, tool servers, prompt sizes) with the fixes and "Test both" as buttons. `/astra-doctor` is the same card, `/engines` lists copies, `/engine-update` updates.
- ✓ Fixed: the Lab preview went black after `/director-engine astra`. Any setting change used to restart the Lab's page empty; now nothing moves, and a page restarted by the browser runs its sketch again.
## Chats at the core: everything meets in the chat (chatcore stream, round 9, 90 upgrades: docs/upgrades/chatcore.md)
- ✓ What a reply makes shows inside it as small cards: captures, the Lab frame a director looked at, renders, board items, the scene it changed, a Lab sequence, a video project (live while it works). Video cards play while pointed at and scrub frame by frame along their bottom edge (← → step); click opens the tool, drag a card to the board, the editor, another chat or Finder, right-click for Send to › and the capture tools. `/things`, `/open-last`. Nothing of it reaches the engines.
- ✓ ＋ in the chat box (Alt+A) is one menu: files, the board's vibe, captures, the Lab's frame / scene, a screen region, recent renders; videos attach as their contact sheet, Video Review / Lab sequence / card drops and pasted paths land in the box; `/attach-board`, `/attach-capture`, `/attach-frame`, `/attach-scene`, `/attach-region`, `/attach-render`.
- ✓ The `/` menu is short: pinned, recent (here first), a few for where you are (the Lab's habits in the Lab), then one row per area that opens in place; typed words rank the place's commands first.
- ✓ A chat remembers its board, scene, sequence, video project, captures and renders: a quiet line over the chat box (point or type to see it, Alt for details) whose chips attach / open / render again; "use the board", "render it again", "the last capture" add one short line naming them (`/chat-context auto off`: never); continuing on the other engine keeps it. `/chat-context`, `/render-again`.
- ✓ Calmer: tool calls fold to "⚙ 3 steps · three", secondary info fades until pointed at, every part of a message has its own right-click menu. ○ Tested headless with the fake engines (a real capture_shot and real Three Director MCP calls).
## Lab sequence 2 (seq2 stream, round 9: docs/upgrades/seq2.md)
- ✓ Each Lab scene owns its sequence: ▤ Sequence opens the scene's own (made without asking), switching director chats / scenes switches it in the same page, duplicates bring theirs along, old sequences go to the scene they start with; directors act on their chat's scene (`of` for another).
- ✓ ✦ Arrange (`/arrange`, ⋯): your scenes on the song's sections, cuts on bars, transitions chosen per section change, a scene coming back in another look; 10 templates (music video, product intro, teaser, bumper, loop, lyric, changelog, reel, mood, drop showcase), ✦ Again, Astra picks (`/decide arrangement`), 15 s / 6 s versions, fill a gap (G), re-time to a song.
- ✓ 10 Lab transitions (camera fly-through / pull-back moving each scene's own camera, morph keeping shared layers, depth wipes, datamosh, stutter, match cut on the shape, flash on the beat, bloom), also in the video editor (baked through the Lab when only the Lab can draw them).
- ✓ V variations per clip, copy / paste / swap looks, roll (Shift+edge), slide (Shift+clip), nested sequences, a clipboard across sequences, named markers, zoom presets, clip pictures, the song's waveform; a scene's own hits and cue looks move with its clip; footage sound and sound clips in the preview and real-time takes; the editor's export of a Lab sequence tested end to end.

## Motion design kit: Hearth on screen, kinetic type, camera moves, brand reveals (motion stream, round 9: docs/upgrades/motion.md)
- ✓ One entry: **X → Motion** in the Lab (or **Alt+X**, `/motion-kit`) lists 112 motion presets plus **▶ Put Hearth on screen** (a whole shot in a new sketch: your newest captures — or a fresh screenshot, or Hearth drawn — as 3D screens, a clicking cursor, a title, a dolly-in), **▶ A motion intro** (a ready 9:16 Lab sequence: logo reveal → Hearth on screen → end card) and **▶ Shot list**.
- ✓ Families: Hearth's UI as 3D material (19: glass panels, laptop with an opening lid, phone, browser, tablet, stack, parallax, explode into layers, fly-in, carousel, wall, hero tilt, zoom into the screen, fan, feed, side by side, turntable, UI elements flying in), cursors (3), kinetic type (33 per-letter animations fitted to the frame's safe zone, words on your hit markers / beats when there's a song), 3D type (6), camera moves (23: a rig the 3D layers follow or a move of the whole picture, rack focus by depth of field, whip-pan blur), logo reveals of the Hearth flame / Forgeheart anvil (10, line draw or extruded 3D), brand looks (13 Forgeheart backdrops and overlays), end cards (5).
- ✓ Every motion layer is one node in the Nodes view, its knobs are Lab sliders (Save, Shuffle, keyframes), it runs on its own time (frame-exact in the sequence and its renders) and only reacts to music when asked; `/motion-seq` puts one over a range of the Lab sequence.
- ✓ Chats: `/hearth-on-screen`, `/kinetic`, `/type-3d`, `/camera-move`, `/shot-list`, `/logo-reveal`, `/end-card`, `/brand-look`, `/cursor-path`, `/hearth-ui`, `/motion-words`, `/motion-seq`, `/motion-intro`, `/motion-list`; Claude and Astra use `three_do { cmd: "motion", op }` (help topic `motion`, read on demand).

## The orb: a new chat's scene, one clock per scene (orb stream, round 10, 52 upgrades: docs/upgrades/orb.md)
- ✓ "＋ New chat" opens a glowing orb (noise-flowing surface, bright rim, halo, ring of motes, gradient backdrop) built as node graphs in two layers (Backdrop, Orb), every knob a Lab slider, in the chat's color; it moves on time, not on the music, until you ask ("make it react").
- ✓ Every scene has one clock: its song, else its own timeline (10 s, frame-exact at 30 fps, counter `00:02:15 · f75`, ← / → frames, click its name for the length), with keyframes already on it (the orb breathes, the glow swells, the camera drifts); keyframing / timeline edits on a scene with no song make its timeline instead of asking for a song.
- ✓ A song loaded on the scene keeps every keyframe and cue at its seconds, shows its bars and offers ✦ Snap them to bars (one click, Undo); taking the song out brings the scene's own timeline back. Scene, timeline and sequence switch together with the chat; the scene's sequence starts with the scene; Duplicate / jams / handoffs keep it all.
- ✓ Chats: `/scene-timeline [length | go f120 | play | pause | snap]`; directors: `three_do timeline_edit { length, snapToBars }`, timeline tools working with no song, new nodes Glowing orb / Orb halo / Backdrop / Timeline. ○ Tested headless (SwiftShader, fake engines).

## Flows: fewer commands, more you can click through (flows stream, round 10, 114 upgrades: docs/upgrades/flows.md)
- ✓ The "/" menu lists 40 principal commands (your Lab habits, the chats, Doctor, board, capture, editor, `/flows`), then **⇢ Flows ›**; the other ≈ 890 are tucked, not removed: typed by name (and by chats, timers, macros) they run as before, typing still finds them under "In flows", `/principal` changes the list, `/flow-where` says where one went.
- ✓ A flow is nodes with connecting dots (Ctrl/⌘+Shift+F, `/flow doctor`): run a command, a choice, your words, an AI step (Claude or Astra), a wait, a result; the step it's on is lit, past steps show what was chosen / typed / made, options are buttons on the node, Validate ✓ moves on (Hearth pre-picks what it can tell).
- ✓ Every run is kept on disk with its steps, answers, outputs and times; hung steps (too long, a stopped engine, Hearth closed) get ↻ Pick up here; ↻ Again (same answers, new result), ✎ change an answer (a branch), ✎ Refine (keep it, say what to change). A live card in the chat answers from there; chats hear about the run only when your message is about it and can move it (`<flow answer>`, `/flow-status`, `/flow-step`).
- ✓ 10 journeys (Doctor, Make a video, Record Hearth, Lab scene, Sequence, Mood board, Export, Astra & Claude, Look, Memory) and 31 flows made from the commands by area; edit any as nodes and save it as yours, or `/flow-make <what>` lets Claude write one. ○ Tested headless with the fake engines (Doctor and Make a video driven like a user).
## Sync: one Hearth on the Mac and the PC, through your cloud drive (sync stream, round 10, 75 upgrades: docs/upgrades/sync.md)
- ✓ `/sync` (or Settings → Sync) finds your iCloud Drive / Google Drive / Dropbox / OneDrive folder and turns sync on in one click; the second computer sees the Hearth already there and offers "Use this Hearth" (merged, nothing overwritten).
- ✓ Local first: Hearth runs from its own folder (offline is normal) and mirrors changes to `<drive>/Hearth/` and back; chats, scenes, sketches, sequences, boards + media, video projects, notes, memory, prompts, portable settings, captures and renders (engine paths, folders and window stay per computer).
- ✓ Three-way merges (messages from both computers kept in time order, scenes / settings field by field, counters added), true conflicts keep both versions (conflicts view), deletes go to a synced trash (restore), renames are moves, big videos copy in resumable pieces ("Sync big videos"), online-only placeholders respected, paths fixed between Mac and Windows.
- ✓ A calm dot at the bottom of the rail (synced / syncing / offline / conflict / paused) with a right-click menu; `/sync status` answers "is everything synced?" with no tokens.
- ○ Tested with two simulated computers and a temp "cloud" folder (102 unit checks incl. a randomized run, a 26-step smoke check); the real cloud clients were not available here.
## Comp: layers made of scenes, parts made by several chats at once (comp stream, round 10, 70 upgrades: docs/upgrades/comp.md)
- ✓ A precomp: a layer whose content is another scene (another chat's, a sketch, a Lab sequence), live inside this one: its own clock (start, speed, offset, loop / hold, time-remap keys, frame-exact with the scene), transform / opacity / blend / in-out / keyframes, crop, masks, soft edge, effects (blur, brightness, contrast, saturation, hue, B&W, invert, sepia), filters above it, its own automatic resolution; nestable, with a cycle guard. One preview page, its look applied on the compositor; one node in the Nodes view.
- ✓ Alt+C in the Lab, right-click a layer → ◫ Precomp ›, right-click the preview → ◫ Comp ›, `/comp [add | set | key | open | remove | render]`; the Lab sequence and its frame-by-frame render play precomps; `/comp render 9:16`.
- ✓ `/dispatch a | astra: b | c` (or the main director: `three_do comp dispatch`): each part gets its own director chat and scene (Claude or Astra each), all working at once with only their brief; the main scene shows them one after the other (or side by side / stacked), updating live; a card follows each part (working / waiting / done / stuck) with ↗ jump in, ⟳ again, ⇄ swap Claude ⇄ Astra, feedback.
- ○ Tested headless with the fake engines building the parts through the real MCP tools on a software GPU; real engines and a real GPU's performance not measured.
## Commands page: every command explained, one question at a time (commands-page stream, round 11: docs/upgrades/commands-page.md)
- ✓ **☰ Commands** in the rail (Ctrl/⌘+Shift+F, `/commands [name]`, "/" → ☰ Every command, step by step…): every command (≈ 935), principal ones first, then the flows as step lists, then by area; plain-word search; each row has a clear sentence and a little preview that plays while you point at it (the principal commands play a real recording of Hearth doing it).
- ✓ A click opens the command's example, big (preview, what it does, when to use it, what it will ask); nothing runs until ▶ Use this command (Enter again).
- ✓ Then one question at a time: needed / optional (Skip) / yes or no / how many / which value (its own suggestions as big buttons), how many times (once, n times, every N), then… another command fed by the result, a summary, ▶ Run. Runs are Flows runs (step N of M, pick up after a restart, Again, Refine, change an answer, the same chat card); the node view stays as the advanced one (`/flows nodes`).
- ○ Tested headless with the fake engines; the clips were recorded in the headless copy (software GPU).
