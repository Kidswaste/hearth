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
## Progress bars: how far along everything being made seems to be (progress stream, round 11, 59 upgrades: docs/upgrades/progress.md)
- ✓ A slim bar on the thing itself: the reply being written (with "about 55 % · writing · about 20 s left"), its chat row, the rail icon of the agent / tool at work, the `/dispatch` card (the comp and each part), the video project card, a flow's card, the Commands page run, the jam card and badge, a board card loading its website, the sync dot.
- ✓ One quiet indicator at the bottom of the rail (hidden when nothing runs): click for the list (parts under their comp), a click on a row jumps there, ■ stops, ↻ Pick up here on a hung flow; `/progress [learned | tags on|off | forget]`.
- ✓ Honest: measured where Hearth can count (ffmpeg's own progress, frames, steps, rounds, a take's seconds), estimated otherwise from how long the same kind of work took here before (tool calls and text streamed against the usual, a plan's steps, the agent's own hidden `<progress>` tag), shown softer with "about"; never backwards, never stuck at 99 % (almost there → waiting on the agent → no news), a time left only when steady. Directors' tag line is opt-in (`/progress tags on`, ≈ 30 tokens a message).
- ○ Tested headless with the fake engines (slow replies with tags, a real ffmpeg export, a Commands-page chain, a two-part dispatch, a hung run picked up); smoothness measured bars off / on during a streaming reply (same painted area and layout).
## Pack 11: the editor, the mood board and capture packed further (pack11 stream, round 11, 42 upgrades: docs/upgrades/pack11.md)
- ✓ The editor's preview plays the music and voice-overs on audio tracks and the clips' sound effects (live twins of the render's filters; pitch / gate / denoise stay render-only), reversed clips are heard backwards and play backwards in real time (a reversed copy made once); the real-time WebM knows its length and carries the sound.
- ✓ ⋯ › Pro tools (and chat): `/duck` (the music dips where the voice speaks, as volume keys), `/lut <file.cube>` (exact render, close preview), `/adjustment-layer`, `/multicam` + Alt+1…9 / `/angle`, `/edit-proxy`, `/render-queue`, `/cut-to-vibe` (cuts paced like the board's clips), `/chapters-to-markers`; `video_edit` ops for Claude and Astra.
- ✓ Board menu (and chat): `/board-collection` (live saved searches + the board's moods), `/board-groups` (alike references framed and named), `/board-lab-look` (palette → Lab look), `/board-timeline` (the clips' shots and pace); copied items paste after a restart; `example.com` and lists of links become website cards; `board_do` for the agents.
- ✓ Capture: a smoothed drawn cursor, click sounds in the take, auto-zoom without bounce, a busy computer slows the take to fewer fps instead of losing it, tour previews with timing (◌ Preview, `/tour preview`, `capture_record` dry).
- ○ Tested headless (software GPU, Web Audio measured in the headless copy, ffmpeg 6.1); no local speech model, so auto-captions weren't built.
## Makes: one name and mark for everything Hearth creates, rooms made ahead (makes stream, round 11, 62 upgrades: docs/upgrades/makes.md)
- ✓ `/makes plan a three.js animation that cuts into a video` (or ⌘/Ctrl+K, the Commands page, the directors' `three_do make`) makes the Three Director chat "<Name> · Lab" (its own scene in the make's color) and the Video Director chat "<Name> · Video" at once, grouped under the make at the top of the chats list, same name, mark and color; each opens before anything is made in it ("planned · waiting for Lab", what it will hold, ✎ Start here) and ⇢ hands off to the next room with what was made.
- ✓ `/dispatch` comps, `/intro` video projects, jams, Commands-page / Flows runs that render or record, and screenshots / recordings made in a room join the same model (file names carry the make's name); the Makes list on the Commands page shows every make with its rooms, parts, outputs and status; right-click: open a room, rename the whole make (every room follows), plan another room, dismiss to the trash / restore.
- ✓ A room's agent gets one short line about its make only on its first message or when you mention the other rooms; `Makes.progress(make, part, { pct, label, eta })` + `Makes.onChange` for the progress bars. ○ Tested headless with the fake engines.
## Renders: one render queue for everything rendered, recorded or exported (renders stream, round 13, 67 upgrades: docs/upgrades/renders.md)
- ✓ Video Review / editor exports, `/intro` renders, Lab sequence and comp renders, recordings and preset renders share one queue: one ffmpeg render at a time (1–3 with `/renders parallel`), the Lab's one at a time in the preview, each with a bar and time left, pause / resume (suspended on the Mac; restarted on Windows), cancel, retry, its make's mark, name and output; a ⇪ at the bottom of the rail only while something renders.
- ✓ One place for presets (⇪ Render…, Video Review › Export, the sequence's "More formats…", `/renders render …`): Reels / TikTok / Shorts 9:16, Story, Feed 4:5, Square, YouTube 1080p / 4K, GIF, WebM, ProRes master (H.264 master without ProRes), audio only; ✦ All socials; frame rate / quality / size / reshape; last choices remembered.
- ✓ Done: a quiet note with Open · Reveal in Finder (Show in Explorer) · Copy path · Open in Video Review; failures in plain words with the fix (also in `/habits errors`) and ↻ Retry; a history with re-render (same settings) and Trash. All from chat with `/renders`.
- ○ Tested headless with real ffmpeg renders of every preset (ffprobe-checked) and the Lab sequence in the software GPU; the Windows pause path (stop + restart) isn't run here.
## Seqguard: the Lab sequence survives frame swaps and edits like a video editor (seqguard stream, round 13, 60 upgrades: docs/upgrades/seqguard.md)
- ✓ Seven frame-swap bugs found and fixed (swapping through Fit stopped playback or jumped to the music timeline's time, scrubbing through a swap landed on the frame before, black flashes on footage, footage that stayed black after a reload…); a swap while the sequence shows sets its shape (one undo step), Fit only the preview; the scene keeps its own frame size.
- ✓ A watchdog repairs the preview by itself (stalled clock, lost sequence, missing files, a clip that can't show, a page that stops answering) with a small "Preview restored" note; ↻ Reload stays; `/sequence health`.
- ✓ Nudge (, . Shift: a beat), key trims ([ ] { }), per-clip speed (a scene's own clock runs at it), clip colors, named markers / jump / rename, Shift+S snapping, ⌘/Ctrl+A / A selection, Z zoom to selection, ⋯ → History, Shift+Space play around, an In–Out range (I / Shift+I: loop it, render just it), close every gap; all in `/sequence …` and the directors' ops.
- ○ Tested headless (seqguard-swap, seqguard-edit and the sequence checks).
## Access: chats read, write, delete and run things, and ask first (access stream, round 14, 41 upgrades: docs/upgrades/access.md)
- ✓ One setting per chat (⋯ → Access, `/access off|read|write|full`): its own project folder by default, more by picker, `/access add` or dropping a folder on the chat; a badge after the title while on; nothing added to the prompt while off, one line when on.
- ✓ Claude's permission requests come to Hearth (`--permission-prompt-tool` → `mcp/access-mcp.js`, an optional flag an older Claude Code drops): safe things inside the folders pass silently; deletes, moves, installs, network, publishing / git push, system and app control, secrets and anything outside the folders show a card in the chat (Allow once · Allow for this chat · Deny + a note to the AI; 3 min without an answer denies); sudo / ssh and other password prompts are refused (run them in a terminal).
- ✓ A chat's `rm` goes to the Trash (done by Hearth), Astra's `.hearth-trash/` too; a copy before each edit for Undo; an activity log per chat (`/access log`, `/access undo`) and a 🔐 line under replies that touched files. Astra maps to Codex's sandbox (read-only / workspace-write on the folders, no network). `Access.ask({ agentId, action, target, risk, detail })` gives other features the same card.
- ○ Tested with the fake CLIs (the permission flow emulated like the real one) and headless Electron; real CLIs and the desktop Trash on Mac / Windows not run here.
## Adobe + publishing: your Adobe suite and agentic deployment (adobe stream, round 14, 78 upgrades: docs/upgrades/adobe.md)
- ✓ Photoshop, Illustrator, Premiere Pro, Media Encoder, InDesign (and After Effects through its bridge) found with their versions on the Mac and Windows and driven through their own scripting (AppleScript / COM; a small "Hearth bridge" panel for Premiere and Media Encoder): the Lab still or the whole board as a layered PSD, your actions, social sizes, the front document back into a chat / the board / the Lab, Illustrator → SVG for the Lab, the editor's cut → FCP XML into Premiere, a render queued in Media Encoder, InDesign → PDF; files sent out come back when saved; Adobe Express / Firefly in windows. `/adobe`, `/photoshop`, `/premiere`, `/illustrator`, `/media-encoder`, `/indesign`; Video Review ⋯ → Send to, board right-click → Adobe, Sketch ▾ → Publish & Adobe.
- ✓ `/deploy` (`/publish`): a Lab scene (a self-contained page: the Lab's player + three.js next to it), a video, a folder or a project on Vercel, Netlify, Cloudflare Pages or GitHub Pages with their own CLIs (install line when missing, sign-in in their own page via a visible terminal): local preview, a hidden-window check that it draws, always asks before going public, progress bar, the address, history with rollback / remove.
- ✓ `adobe_do` / `deploy_do` for Claude and Astra (opt-in: `/adobe-tools on`, `/deploy-tools on`); their scripts and publishes ask you first.
- ○ Tested with fake osascript / cscript / CEP panel and fake vercel / netlify / wrangler / gh (real git); the published scene page rendered for real in a hidden window. Real Adobe apps, sign-ins and uploads aren't reachable here.
## Apps: your services in their own windows, Meshy 3D models and Suno prompts from chat (apps stream, round 14, 141 upgrades: docs/upgrades/apps.md)
- ✓ One "Apps" entry (rail ⋯, ⌘/Ctrl+K, the Lab's 🧰 Tools, `/apps`): Meshy, Suno, Figma, Spline, Sketchfab, Mixamo, Poly Haven, Unsplash, Coolors, Google Fonts, Runway, ElevenLabs, YouTube Studio, Instagram, TikTok, Pinterest, each in its own window and sign-in (Hearth never sees a password) with a slim bar: back, reload, open in browser, 💬 send to chat, ⤓ downloads; hidden windows are parked.
- ✓ Downloads land in Downloads/Hearth/<App> and go where they fit in one click: .glb → a 🧊 Lab model layer, .hdr → a 🌅 Lab sky, songs → the Lab's song, clips → Video Review, pictures → the board.
- ✓ Meshy from chat (`/meshy <words>`, `draft`, `image` (a board picture), `texture`, `remesh`, `models`): the cost and balance shown and asked first every time (Access.ask when present), the key pasted once (safeStorage, main process only), jobs survive restarts, a progress bar, a library, into the Lab or onto the board; `meshy_generate` for chats with `/apps-tools on`. Suno: `/suno prompt` writes style tags + structure from the scene's vibe and types them into Suno's boxes; `/suno use` makes the newest Suno download the Lab's song. Free Poly Haven skies: `/polyhaven`.
- ✓ 40+ AI apps in the same picker (Midjourney, Ideogram, Krea, Leonardo, Recraft, Pika, Luma, Kling, Tripo, Genie, CSM, Udio, Stable Audio, ChatGPT, Gemini, Perplexity, NotebookLM, v0, Bolt, Lovable, Descript, CapCut…), search and ★ favorites; ✨ Discover suggests apps you haven't opened that fit where you are (learns from what you open or dismiss; a "Try this" note at most once a day, `/apps discover off`); `/apps send-to <app> board|lab|render` puts a picture on the clipboard and opens the app.
- ○ Tested headless against fake services (dev/fake-meshy.js: Meshy's API shapes, Poly Haven, Suno-like pages); the real Meshy API, Suno's real page and real sign-ins aren't run here.
## Board eyes: chats see the mood board, Pinterest finds more (eyes stream, round 14, 66 upgrades: docs/upgrades/eyes.md)
- ✓ With the board tools on, Claude and Astra get real pictures: `board_look` (the whole board with item ids, an item, a close-up region, the selection, a frame, 2–4 side by side with vibe differences) and `board_watch` (a clip or gif as a timestamped contact sheet: evenly, at exact times, or one frame per shot); small by default (512 px, the board 768), medium / large on request; each result says what it sent (pictures, size, ≈ tokens). `board_do` find (by description), caption (one line kept for later reads), pinterest; `board_add` keeps a found picture's source and credit.
- ✓ In the reply: a quiet card per look (thumbnail, items as links, what was sent; three or more fold into one line); item ids in the text link to the board (click: jump, select, pulse).
- ✓ You show things yourself: right-click › Show to a chat (Ask about it…, a clip's frames, one per shot, side by side, bigger), the board menu, the drawer (right-click, Alt+drop), drag an item onto a chat beside the board; `/board look · watch · compare · find · pinterest`, `/board-show`, `/board-watch`, `/board-find`, `/board-pinterest`, `/board-alt`.
- ✓ Pinterest: searches from the board's vibe (mood, colors, light, texture, tags, fonts) or one of 24 aesthetics; a Hearth window with its own signed-in session where ＋ Board (or a drag) adds the pin's largest picture with its pin link as the source; chats suggest searches as buttons; an app in the Apps registry when it exists.
- ○ Tested headless with the fake engines (real MCP image results) and a local Pinterest-like page clicked with real input events; real Pinterest (sign-in, its markup) isn't reachable here.

## Tour: discover what Hearth can do (tour stream, round 15, 65 upgrades: docs/upgrades/tour.md)
- ✓ After an ⬆ Update, one small What's new card: only the new lines of the upgrade notes the update changed, the 5 that fit your habits first, ▶ Show me (rings the control, runs a safe command or puts it in the chat box, or starts its tour), × Not for me; `/whats-new` (round N, history, show / skip N).
- ✓ Guided tours: a pulse ring on the real control + one small draggable card, never blocking, Esc / × pauses and the same command picks up there: `/tour renders · studio · eyes · apps · access · sequence · keys · discover`, `/spotlight`.
- ✓ At most one "Did you know?" a day for something never used, where you are (Try it · Later · Stop tips, `/tip`); ☰ Commands › ✦ Discover: feature map (used vs never tried per area) with ✦ Surprise me (`/feature-map`, `/surprise-me`); `/ideas` for tonight from your boards, songs, scenes and apps. All local, no tokens.
## Studio: one-click pipelines (studio stream, round 15, 43 upgrades: docs/upgrades/studio.md)
- ✓ Six pipelines that chain Hearth's parts: Board → video, Song → visualizer, Idea → 3D hero (Meshy + Poly Haven), Scene → website, Still → Photoshop, Vibe → song (Suno); each is a make (rooms made at once, a progress bar per part) walked as a Flows run (questions first, then by itself; Going now, hung → pick up here, ↻ Again).
- ✓ One entry: ⌘/Ctrl+K "Studio…", a ✦ Studio section on the Commands page, `/studio [pipeline] [words] | list | status | needs`; each pipeline shows its pitch, cost (tokens / Meshy credits) and what's missing on this computer with a Fix.
- ✓ Never spends or publishes without asking (Meshy's cost dialog, Deploy's publish question); a declined run ends with nothing spent.
- ○ Tested headless with the fake engines and fake Meshy / Poly Haven (Song → visualizer and Idea → 3D hero end to end); Board → video, Scene → website, Still → Photoshop and Vibe → song reuse tested parts but weren't run end to end here (no Photoshop, no real deploy / Suno).
## 3D models in the Lab: library, materials, clips, lights, skies, camera moves (lab3d stream, round 15, 72 upgrades: docs/upgrades/lab3d.md)
- ✓ A model (Meshy, Sketchfab, Mixamo, Spline / Blender exports, .glb .gltf .fbx .obj .stl .ply) is a 🧊 layer drawn by `lab3d.model(…)`: loading bar, clear errors for bad files, fitted and standing on a shadow; every knob is a slider (Save, Shuffle, looks, keyframes).
- ✓ A floating model library with pictures of each model (drag onto the preview, Shift = replace in place), right-click the preview → 🧊 3D model, `/model <verb>` / `/3d`, `three_do model` for Claude and Astra.
- ✓ 12 materials, 8 light presets, 8 studio looks, Poly Haven HDRI skies, shadow / mirror / gloss grounds, fog, bloom, depth of field, clips with speed / loop / blend (+ Mixamo files), turntable, explode, gizmo (W / E / R), kick reactions at 0 until asked.
- ✓ 15 camera moves (orbit, dolly, crane, hero reveal…) as keyframes on the scene's clock with a 🎥 cue: they play in renders and the Lab sequence.
- ○ Tested headless with a generated animated GLB (`sh dev/run-checks.sh lab3d-models`); real Meshy / Sketchfab downloads and huge models aren't run here.

## Video, lighter (round 16, videoperf)
- ✓ Filmstrips, card thumbnails, hover strips, clip thumbnails and waveforms / beats are made by ffmpeg in the background (low priority) and kept on disk: opening a video went from ≈10 s to ≈2 s here, reopening is instant, and the window's thread does no picture work (`/video-cache`).
- ✓ Smoother scrubbing (one seek at a time), clip tracks draw only what's on screen, automatic proxies for 4K / HEVC / ProRes clips in the editor (`/edit-proxy auto`), decoders let go while Video Review is hidden.
- ✓ Recording draws its frames in a worker; renders, exports and proxies run below normal priority (`/renders rush` for full speed).
- ○ Measured headless (`dev/checks/videoperf.js`, docs/upgrades/videoperf.md); real 4K footage and the Windows priority class aren't run here.

## Tidy: one app, fewer visible choices (round 18, tidy, 41 upgrades: docs/upgrades/tidy.md)
- ✓ Settings has a search (`/settings <words>`) and every on / off from commands and menus, each with its cost (tokens a message, GPU, free); rare ones under More settings.
- ✓ Every menu ends with its delete in red; files read Open · Reveal in Finder / Show in Explorer · Copy path · Send to… everywhere.
- ✓ Commands page: Principal first, Studio + Discover one row of chips; Ctrl/⌘+K with nothing typed is a short list; Ctrl/⌘+1…9 walk the whole rail.
- ○ Tested headless (`dev/checks/tidy.js`); the Mac's ⌘ labels are converted by the same code as before.

## Reach (round 19): open what a chat made, on either computer
The chats' workspace syncs (no dependencies, caches or huge files); a Mac path on Windows (and the reverse) resolves to this computer's data folder in replies, links, access folders and tool calls; a page a reply makes shows as a card (▶ Open · Preview in a sandboxed window · Reveal), a file still on its way says so and opens up when it arrives; both engines have `chat_open` (Astra: that tool alone); `/open-file`, `/open-tool`. Sync conflicts name both computers, when each changed, what it is and the difference, with Keep theirs / Keep this one / Keep both / Merge, a summary before Apply, and undo from Deleted files; the big-change guard lists files by name (`/sync review`). See docs/upgrades/reach.md.
## Loading screen + lighter start (round 19, splash, 26 upgrades: docs/upgrades/splash.md)
- ✓ Hearth opens on a loading screen in its own look (mark, bar, status), drawn in the first frame; no white flash; the bar follows real steps and fades as soon as the first screen is usable; a hairline shows features still arriving.
- ✓ A slow start says what it waits for (sync pass, engine check, a read…), offers Open anyway; reduce motion respected; `/startup` shows every step of the last start.
- ✓ Cloud sync no longer holds the window back; tray / hotkey / rarely used modules after the window; no git fetch or engine doctor while the first screen builds; 2 stylesheets off the start.
- ○ Measured headless (`dev/coldstart-report.js`: first frame on screen 815 → 467 ms); the Mac's ready-to-show timing is not run here.

## Jank watch (round 20, jankwatch, 36 upgrades: docs/upgrades/jankwatch.md)
- ✓ Always on, nearly free (≈ 2 µs a key, nothing at idle): long frames, input → paint, frames dropped while something moves, the Lab preview's real fps, main-process lag, GPU crashes / context losses, per area (chat, Lab, board, menus…) and cause; a week of hourly numbers on this computer only.
- ✓ When long frames keep coming, a short profile names the code (file:line, function, what started it): Chromium can't name Hearth's file:// scripts by itself.
- ✓ While you type, drag or scroll, background work (feature loads, tidy, board pictures, thumbnails, engine check, sync passes) waits; the Lab suggests Light mode once if it keeps dropping frames.
- ✓ `/smooth` (day / week): p50 / p95 input delay and long frames per area, the 5 worst culprits, what was adapted, 📋 Copy for Claude; `/smooth profile`, `/smooth reset`, `/smooth off`.
- ○ Tested headless (`dev/checks/jankwatch.js`); the real numbers come from the owner's Mac and PC.
## Off the main threads (round 20, offmain, 21 upgrades: docs/upgrades/offmain.md)
- ✓ Long chats: ↑ Show earlier on a 300-message chat no longer freezes (a 131 ms task → none; cached date formatters); code-heavy chats are rendered on a Markdown worker first.
- ✓ A store thread in the main process saves chats / scenes / kv stores (identical saves skipped), keeps the chats index (list 23 → 5 ms) and searches every chat (the app answers in 1.7 ms instead of 28 ms while you search); quitting waits for the last saves.
- ✓ Folder search and cloud sync's big-store hashing run on a files thread; Lab and director screenshots encode in pieces (no long task).
- ○ Measured headless (`dev/checks/offmain.js`, `dev/store-thread-test.js`); the owner's own data sizes and a real cloud drive aren't run here.
## Long sessions stay light (round 20, soak, 21 upgrades: docs/upgrades/soak.md)
- ✓ Switching between long chats no longer leaks (a hidden "Show earlier" watcher kept each drawing's messages alive): after 20 minutes 23k page nodes instead of 37k, detached nodes +500/h instead of +31,000/h; only the last 12 opened chats stay in memory; the engine log rotates at 2 MB.
- ✓ Freshen: after hours, if the window grew a lot, a quiet toast offers a reload that keeps everything (screen, open chats, drafts, scroll, Lab scene + sequence); never while you're busy; `/freshen`, `/freshen status`, Ctrl/⌘+K.
- ✓ `node dev/soak.js`: a 20-minute realistic session with real input, sampled every minute (heaps, DOM, listeners, observers, GPU, main-process handles), trends + where things grow, retainer paths.
- ○ Measured headless with software GL; hours-long runs on the owner's Mac / PC are not run here.
## Long tasks say what they are doing (round 21, liveness, 30 upgrades: docs/upgrades/liveness.md)
- ✓ Under a running reply: the phase (thinking · writing · running *tool* on *what* · agents working), time, steps, "last news N s ago" and why (still in a tool, CPU %, idle, process gone); after 2 min without news: Wait · Stop · Stop & retry from here (`/unstick`).
- ✓ Deployed agents (Claude Task / Agent subagents, Codex spawned agents) as a live tree with status, current tool, time and result, kept out of the reply; "🤖 Deployed 3 agents · 2 done · 1 failed" after; folded Activity list of every step; `/activity`, `/subagents on|off` (opt-in: adds a tool per message).
- ✓ Freeze causes fixed: long thinking re-laid out on every paint (1.6–1.9 s → 0.14–0.39 s of layout on a long task), huge tool results blocking the main process (722 → 47 ms), an engine that exited with its output held open hung the reply forever (→ 2 s), a killed engine looked "stopped" (→ clear error, partial kept), 19× fewer IPC messages.
- ○ Tested with fake engines emitting real-shaped stream-json / exec-json (`sh dev/run-checks.sh liveness`); the real CLIs' subagent lines may differ slightly by version.
## The Lab's hub side, instant (round 21, labhub, 27 upgrades: docs/upgrades/labhub.md)
- ✓ Long sketches type like short ones: only the lines on screen are highlighted, in their own shadow root (2,000 lines: 345 → 6 ms a key); Ctrl+Enter runs only the layers you changed, in place.
- ✓ Sliders reach the preview a frame sooner (51 → 6 ms); rebuild sliders no longer queue seconds behind; the sliders panel isn't rebuilt while you type or (its music panels) on every switch.
- ✓ ▦ Your sketches and New sketch open in ~20 ms (were ~500: no modal restyle of the whole app); the effects picker builds rows as they scroll in (Browse all 195 → 16–60 ms) and keeps its thumbnails for the same scene.
- ✓ The Lab behind a chat costs nothing: the timeline, key timer and node probes stop (12 frames + 10 DOM writes a second → 0).
- ○ Measured headless (`dev/checks/labhub.js`); the preview's own frame time is labgpu's side.

## Report to the developer (round 21, devreport, 33 upgrades: docs/upgrades/devreport.md)
- ✓ ⚑ on error notifications, Report on failed replies, ⚑ on stalled replies and in `/smooth`, an offer after page errors and crashes; `/report <what went wrong>`, `/report last`, `/report list`.
- ✓ The whole report is shown for review and editing first: title, what you were doing, the error with app file:line stack, ~50 log lines, version (git HEAD), OS / Electron / engine versions, the chat's tool names; keys / tokens / passwords masked, home as ~, no chat text unless ticked.
- ✓ Sent as a `hearth-report` issue in kidswaste/hearth with gh when signed in, else a prefilled github.com link (full text on the clipboard when cut); deduped per day; "Your report #N is fixed in this update" after ⬆ Update; `/report auto on` sends crashes by themselves (≤ 3 a day).
- ✓ Chats can draft one with `chat_report_problem` (a card you send; `/report tool off` drops it, ≈ 45 tokens).
- ○ Tested with a fake gh and a stubbed browser (`sh dev/run-checks.sh devreport`); not against github.com.

## Lab live stage (round 22, labstage, 65 upgrades: docs/upgrades/labstage.md)
- ✓ MIDI controllers: learn (touch or point at a slider, turn a knob), knobs per scene or for every scene by name, soft takeover, pads / buttons / keys for GO, cut, scenes, shuffle, freeze, tap, black-out…, a MIDI crossfader, MIDI clock in; applied once a frame (500 messages → 1 update).
- ✓ Set list + cue monitor: the cued scene runs live in a corner; GO crossfades (both live), cuts or dips to black over 1 beat–4 bars, landing on the next beat or bar; the next scene cues itself.
- ✓ Output: the Stage window fullscreen on the other screen at its own resolution / frame rate; black-out, freeze and crossfades reach it.
- ✓ Show mode: editing chrome hidden, a one-row show bar, frame rate locked, reloads blocked, a scene error holds the last good frame and the set moves on at the bar, Light mode when frames keep dropping; beat LFOs on any slider ride the song, MIDI clock or taps.
- ✓ Right-click the preview → 🎚 Live (VJ), `/stage` (`/vj`), Ctrl/⌘+K "Lab: Live …".
- ○ The cued scene hears the demo beat until it takes over; tested with a fake MIDI controller (`dev/checks/labstage.js`).
## Lab export (round 22, labexport, 63 upgrades: docs/upgrades/labexport.md)
- ✓ Every Lab render runs in a hidden export page (own process + GPU context): the preview keeps its size and plays, the sequence stays editable, 0 long tasks on the app's thread; the sequence's own ⇪ Render uses it too.
- ✓ Frame-exact on the scene's clock, seeded randomness (same render = same pixels); any size up to 8K (16K stills), any fps, 2–4× supersampling, 4–64 sub-frame motion blur, GPU memory cap.
- ✓ MP4, HEVC 10-bit, ProRes 4444 + alpha, WebM VP9 + alpha, PNG sequence + alpha, perfect-loop GIF / MP4 (on the bars with a cross-fade, or found in the frames), stills (PNG, 16-bit); GLB, one-file web page, slider preset (+ load), contact sheet.
- ✓ Right-click the preview › ⇪ Make & export, the Render panel › Export…, Ctrl/⌘+K, `/lab-export` (`/lx`); directors via `three_do run`; render queue rows with time left, pause / resume / cancel.
- ○ Measured headless on SwiftShader (1080p 6.4 frames/s, 4K 2.2); not on a real GPU.

## Voice (round 23, voice, 53 upgrades: docs/upgrades/voice.md)
- ✓ Hold Ctrl+Space (or ＋ › 🎙 Talk, `/talk`) and speak: a live waveform pill, then your words in the chat box (or sent when you let go); a short tap listens hands-free until you stop talking (voice activity detection); in the Lab the words go to the docked director.
- ✓ Local speech-to-text: whisper.cpp (`whisper-cli`) or faster-whisper in a child process, partial text as it decodes; `/voice install` gives the Mac (Homebrew) / Windows steps and asks before downloading the model into the data folder; without it, the system's dictation (Fn Fn / Win+H) is pointed at.
- ✓ Voice commands, no tokens: "freeze", "save", "next scene", "shuffle", "play", "stop"…, "director, make it pinker" → the Three Director, your own phrases (`/voice word`), `/voice words`.
- ✓ Replies to what you said are read aloud without code; any key stops; `/voice speak system` uses macOS `say` / Windows voices.
- ○ Tested with a fake whisper-cli and an oscillator as the microphone (`sh dev/run-checks.sh voice`); not with a real whisper or mic.
## Projects and Home (round 23, projects, 66 upgrades: docs/upgrades/projects.md)
- ✓ A project groups chats (any agent), Lab scenes / sequences, boards, renders, captures, workspace files, downloads and deploys, with a name, mark and color (the makes' palette), a cover, notes and a status; synced and merged item by item between your computers.
- ✓ Made by hand (`/project new`, Home ＋, right-click a chat or a sketch › Project), from a make automatically, or suggested without tokens from names, links and timing ("3 chats and 2 scenes are about “Stoop Ronin”"); a project's chat brings its scene, and captures / renders made in front of it join.
- ✓ Home (⌂, `/home`): cards with covers and "continue where you left off" (last chat, scene, render), a project's page (notes, status, everything by kind); drawn in chunks, lazy pictures.
- ✓ Search everything (Ctrl/⌘+Shift+K, `/everything`): projects, chats and their messages, scenes (code, sliders), board items, renders, files, commands; kinds as chips, keys, results open where they live.
- ✓ The chats list groups chats by project (collapsible, ⏷ only one project, on / off); the Lab's sketch picker groups scenes by project.
- ○ Tested headless with fake engines (`sh dev/run-checks.sh projects`); not on the owner's real data or two real computers.
## Lab time machine (round 23, timemachine, 52 upgrades: docs/upgrades/timemachine.md)
- ✓ Every meaningful change to a scene (code run, layer added / removed, sliders saved, shuffle kept, director / crew edits) is a version with a tiny picture, who made it and a one-line label; deltas, thinned (today all, hourly for the week, daily after), one kv per scene, merges by id.
- ✓ Sketch ▾ → ⏱ Time machine, Alt+H, `/history`: scrub on the preview (← →, live, nothing saved), compare (split wipe + what changed), restore (undoable), branch, pick the colors / sliders / one layer.
- ✓ Each director turn's start is bookmarked: ⋯ → Back before the director, `/back n [claude|astra]`, `/back undo`; `/branch` in the Lab.
- ○ Tested headless with the fake engines (`sh dev/run-checks.sh timemachine timemachine-test`).
## Shader workbench (round 23, labshader, 103 upgrades: docs/upgrades/labshader.md)
- ✓ ◇ shader layers: Shadertoy-style GLSL (or main() / ISF) as a Lab layer on the scene's clock, with music uniforms (uKick, uBass, uBeat…), the audio texture, feedback (self), Buffers A–D, the layers below / other layers / references as textures, a resolution scale.
- ✓ `uniform float uGlow; // [Look] 0..2, 1 Glow` lines become sliders (colors, toggles, choices, XY pads) and follow the code on each run; errors show inline on their line while the last good shader keeps drawing.
- ✓ 38 starters (noise, patterns, raymarch, music, feedback, filters), Shadertoy import (tab, tabs, JSON) and ISF import, copy back to Shadertoy; workbench card with channels per pass, resolution, alpha, + Buffer.
- ✓ `/shader`, `/shadertoy`, right-click a layer › ◇ Shader, the preview › ＋ Add › ◇ Shaders, the FX picker's Shaders, Ctrl/⌘+K; directors: `three_do shader` (help on demand, no prompt growth).
- ○ No TSL / node-material layers; ISF vertex shaders aren't run; tested on SwiftShader only.
## Lab audio reactivity (round 23, labaudio, 87 upgrades: docs/upgrades/labaudio.md)
- ✓ Live input analysed in an AudioWorklet (86 frames/s, one 3.3 KB buffer per frame to the preview); input picker for mics / interfaces / line-ins, loopback devices (BlackHole, Loopback, VB-Cable, Stereo Mix) found and listed first with a how-to, monitoring off by default (`/audio-in`, `/loopback`).
- ✓ Same analysis for songs and live: 8 bands + per-band hits, kick / snare / hat / vocal hits, LUFS-ish loudness, centroid / flux / flatness, beat + bar phase with a confidence, chroma, key (+ a hue); songs: builds and drops over the whole song in a Worker, cached. Sketches: `audio.feat.<name>`, `audio.env()`, `onHit('kickOn')` (`/audio`, `/song-features`).
- ✓ Any slider follows any sound through a curve (amount, threshold, punch, attack / release, invert) with a live meter on the slider; 16 presets (pump on kick, glow on hats, zoom on drops…): right-click a slider, its ♪ panel, `/react-to`, `/react-preset`, `/react-curve`.
- ○ Nothing is computed until a sketch or a slider reads a feature. Tested on generated songs and a stubbed getUserMedia (`node dev/audio-test.js`, `sh dev/run-checks.sh labaudio`), not on a real BlackHole install.

## Phone remote (round 24, remote, 51 upgrades: docs/upgrades/remote.md)
- ✓ `/remote on` (or 🎚 Live (VJ) › 📱 Phone remote…): a LAN-only server shows a QR code + address + 6-digit pairing code; paired phones are remembered (own key, HMAC challenge each time, revocable: `/remote devices · kick · forget`), off by default and off again after 10 min alone
- ✓ The phone page (no framework, one WebSocket): grouped multi-touch faders with music meters and soft takeover, an XY pad, shuffle / back / freeze / tap / save / black-out / next look / play, the set list with GO / cut / next / cue, scenes, BPM tap, a ≈ 4 fps preview; two phones at once, the computer's 📱 card shows who's connected and kicks them
- ○ Plain HTTP on the LAN (no certificate): pair on a trusted Wi-Fi. Tested with the page in a hidden window on 127.0.0.1 (`sh dev/run-checks.sh remote`), not on a real phone
## Context (round 24, context, 50 upgrades: docs/upgrades/context.md)
- ✓ Type @ in a chat box to attach exactly what a message needs, cost shown first: @chat (a summary, not the history), @scene (layers + sliders, no code: ≈ 108 vs 2,001 tokens), @board, @file, @render, @project (`/ref`).
- ✓ Memory only when it matters: a chat's pinned facts and a project's key facts go along only with messages about them (🧠, running count); `/memory here|pin|project|forget|edit`, `/memory relevant on` (20 facts: 222 → ≈ 21 tokens a message), `/memory approve on`.
- ✓ A bar under each reply splits what the message sent (system prompt, tools, history, attachments, memory); expensive chats get one cheapest-fix tip; `/context`, `/context fix`.
- ✓ `/fresh`: a new chat from a free, editable summary (goal, decisions, open tasks, key files): a 60-message chat's next message 9.8k → 4.4k tokens, measured after the first reply; `/fresh auto on` opt-in.
- ○ Tested with the fake engines (`sh dev/run-checks.sh context`, `node dev/context-cost.js`); not on real Claude / Codex sessions.
## GPU particles (round 24, particles, 119 upgrades: docs/upgrades/particles.md)
- ✓ ✦ particle layers: `particles(P, opts)` simulated on the GPU (float textures, 60 steps a second of the scene's clock: pause holds, renders are the same every time), 100k–2M on a real GPU, fewer in the preview when frames drop.
- ✓ Emitters (point… spiral, text, a reference picture, a 🧊 model layer's surface, another layer's bright pixels), forces (curl flow, attractors, vortex, gravity, drag, turbulence, boids-lite, hold the shape / dissolve), points / streaks / instanced meshes, trails, add / alpha.
- ✓ Music sliders: burst on kick, explode on kick, forces × bass, hue on brightness; `/particles react` adds the preset's react-to links.
- ✓ 30 presets in one picker (`/particles`, right-click › ✦ Particles, Ctrl/⌘+K, FX picker); directors: `three_do particles` (help on demand).
- ○ Tested on SwiftShader at 16k particles only (`sh dev/run-checks.sh particles`).
## Asset library (round 24, assets, 77 upgrades: docs/upgrades/assets.md)
- ✓ One library (Ctrl/⌘+Shift+A, `/assets`) of textures, HDRIs, 3D models, fonts, sounds, LUTs, shaders, presets and videos from watched folders, app downloads, renders and captures; by reference, deduplicated by content hash, tags, favorites, projects; a small kv index, nothing scanned at startup.
- ✓ Free CC0 assets built in: Poly Haven (HDRIs, textures with their maps, models packed into a GLB) and ambientCG (PBR materials, HDRIs) through their public APIs: search, cached previews, size choice, downloads with a bar.
- ✓ Pictures of every card made off the main thread and cached on disk (pictures, HDR skies, GLB textures / the Lab's model pictures, font samples with their real names, waveforms, LUT sweeps, video frames); a virtualized grid (3,000 cards ≈ 1 ms per screenful).
- ✓ Drag a card onto the Lab (picture layer or shader input, sky, model layer, text layer in the font, song, grade, shader layer, preset), the board, a chat or the sequence; right-click › Use in…; the directors' `three_do asset` (find / use / free / get).
- ○ Tested against fake Poly Haven / ambientCG servers and a fixtures folder (`sh dev/run-checks.sh assets`); not against the real services or very large real folders.
## Lab grade (round 24, grade, 115 upgrades: docs/upgrades/grade.md)
- ✓ ◐ Grade + ◐ Film & lens filter layers drawn as one GPU pass (free at amount 0): ACES / AgX / Filmic / Reinhard / Neutral tone mapping, exposure, white balance, lift / gamma / gain wheels, RGB + luma curves, an HSL qualifier, saturation / vibrance, split toning, LUT strength, vignette, grain (luma response), letterbox per format; bloom with threshold, halation, anamorphic streaks, chromatic aberration, lens distortion.
- ✓ LUTs: 14 procedural starters, .cube import (1D / 3D, kept, sent to every Lab page incl. the export page), the current grade exported as a 33³ .cube for Premiere / Resolve; 19 presets.
- ✓ One compact panel (right-click the preview › ✨ Look & motion › ◐ Grade, `/grade`): tabs, wheels, curves, hue strip, LUT grid, scopes (waveform, vectorscope, histogram from a small read, only while open).
- ✓ Per-clip and whole-sequence grades in the Lab sequence (right-click a clip › ◐ Grade, `/grade clip 2 noir`): the same shader in the preview and the render.
- ○ Tested headless on SwiftShader (`sh dev/run-checks.sh grade`); imported LUTs aren't packed into a one-file web page export.
## Interop (round 25, interop, 88 upgrades: docs/upgrades/interop.md)
- ✓ `/osc`: OSC in / out over UDP (off by default, this computer only unless `/osc lan`): TouchDesigner, Ableton (Max for Live, AbletonOSC tempo + beat bridge), Resolume, TouchOSC and phone-sensor presets move sliders, fire pads, cue / GO scenes and the set list; learn like MIDI; Hearth sends beat / bar / tempo, kick · snare · hat, audio features, slider values and the scene name.
- ✓ `/midi-out`: clock at the stage's tempo (scheduled ahead, phase-locked), notes on beats / bars / hits / scene changes (lights, drum machine, click presets), sliders as CC with a learn wiggle, program change per scene, panic.
- ✓ `/obs`: the Lab as a transparent OBS Browser Source (a 127.0.0.1 page, WebP frames with alpha only while OBS shows it); obs-websocket 5: OBS scenes follow the Lab and the set list, record, stream (asks first every time), add the Lab as a source; the password typed once in a masked field and kept encrypted.
- ✓ `/link`: follows Ableton Link's session tempo (listen only); everything is in 🎚 Live (VJ) → 🔌 Connect.
- ○ Tested with stubs and fakes (`node dev/interop-test.js`, `sh dev/run-checks.sh interop`: fake obs-websocket, stubbed Web MIDI, UDP on 127.0.0.1), not with the real apps; Link is tempo only.
## Kinetic type and lyrics (round 25, type, 154 upgrades: docs/upgrades/type.md)
- ✓ 🅰 type layers: `textLayer(P, opts)`, crisp SDF text at any size (outline, glow, softness from one distance field; system, Google or asset-library fonts) or 3D extruded letters with a bevel in the 12 lab3d materials (outlines traced from the font itself).
- ✓ 26 in / out animations (typewriter, wave, scatter, glitch, slides, scale-pop, blur-in, split-flap, decode, neon…) by glyph / word / line with stagger, order and easing; text on a circle, arc, wave, spiral or your points; one letter's own look; scale / glow / jitter / bounce on the kick, color on the bass, per letter.
- ✓ Lyrics: paste them or load .lrc / .srt; untimed lines aligned to the song (starts on onsets near the beat, words inside the lines), timed ones tightened; 🎤 tap-along (Space at each line) fixes them; six looks (karaoke fill, one word big, scrolling, centered fades, typed, 3D lines); export .lrc / .srt, or onto the sequence's Captions track.
- ✓ 32 presets in one picker (`/text`, right-click › 🅰 Type, Ctrl/⌘+K, FX picker); `/lyrics`; words into ✦ particles; renders the same frame every time; directors: `three_do type` (help on demand).
- ○ Tested headless on SwiftShader (`sh dev/run-checks.sh type`, `node dev/type-test.js`); alignment follows onsets and beats, not the voice.
## Camera in (round 25, motion, 84 upgrades: docs/upgrades/motion-in.md)
- ✓ A webcam, capture card or video file as a live Lab input (`/webcam`, right-click the preview › 📷 Camera): device picker, resolution, mirror; off by default, a red ● Camera pill while on, paused (light off) while the Lab is off screen, nothing recorded or sent, the director's pictures pixelated unless shared, a director asks first.
- ✓ Tracking on this computer in the preview's Worker: a light tracker (movement overall / by region / 3×3, where and which way it moves, colour blob, motion mask) always; MediaPipe hands, pose, face and the person's mask after a one-time ≈ 27 MB download you say yes to, each loaded when something reads it.
- ✓ Features (handX, pinch, headTurn, mouthOpen, camMotion, maskArea…) follow into any slider (♪ react-to curve editor, `/webcam follow`), sketches (`webcam.feat`, `webcam.layer`, `webcam.texture()`), particles (emitters on hands or the silhouette); 15 looks (particles follow my hands, silhouette glow, motion trails, head turns the camera, mouth opens the bloom…); `three_do motion { op: camera | track | follow | look }` + `help webcam`.
- ○ Tested with a fake camera, a stub and the real MediaPipe files loading headless (SwiftShader); not with a real camera or on a real Mac / PC GPU; the Stage window doesn't get the camera yet.
## Light physics (round 25, physics, 91 upgrades: docs/upgrades/physics.md)
- ✓ ⚛ Physics layers (`physics(P, opts)`): a compact position-based solver written for Hearth (no download, offline) for rigid boxes / letters / dominoes / model hulls, balls, ragdolls, cloth, ropes, jelly and water; 27 presets (bouncing balls on beat, falling letters, domino run, Newton's cradle, flag in the wind, curtain that falls on the drop, jelly, ragdolls down the stairs, dam break, Plinko…); `/physics`, right-click › ⚛ Physics, `three_do physics` for the directors.
- ✓ Deterministic: 60 fixed steps a second of the scene's clock, seeded; renders land on the same pixels, scrubbing back re-simulates from cached states to the same state; bodies at rest sleep; the preview's solver runs in a Worker; instanced drawing.
- ✓ Music: an impulse on each kick (jump / push / blast / spin / gust), bass lightens gravity or blows wind, a blast at the drop; only the Music presets react at first (`/physics react` for the rest).
- ○ Tested headless (`node dev/physics-test.js`, `sh dev/run-checks.sh physics`); not measured on a real Mac GPU / CPU; box contacts are corner-against-box, model hulls are their boxes.

## ⋯ AI setup (round 26)
Commands are hidden: typing "/" in a chat opens no menu any more (a full command typed still runs; the Ctrl+; bar keeps its menu). Instead, **⋯** in a chat's header (or a window's header, or **⚙ AI setup** in the rail) opens one short panel about what that AI can use. Everything there is saved on the AI itself (its system prompt and tools), never tucked into your next message, and applies from its next message. Chips on top switch which AI you're setting up.
- **Personality**: Plain, one of the personas, or your own words.
- **Instructions**: a list of rules it always follows; add one with Enter, untick to pause, × to remove, double-click to edit.
- **What it can use**: files on this computer (Off / Read / Read & write / Full, and which folders), Hearth's tools (your chats, the Lab, the mood board, screenshots and recordings, app windows like Meshy and Suno, Adobe, publishing, the Forgeheart game), web search for Astra, and claude.ai connected apps (Gmail, Drive, Notion…: off / read only / full).
- **Memory**: whether it remembers what you tell it, and what it remembers.
- **Habits**: checks its own work, suggests next steps, shows its thinking, shrinks long chats.
- **How hard it thinks**: Quick, Smart, Deep.
Right-click ⋯ in a chat for the old quick menu (rename, export, delete…).

### ◎ Missions
The ◎ button by the chat box (and the top of ⋯) picks what your next message becomes: Just answer · Split it up (it deploys helper agents) · Swarm (several AIs answer, a chair merges; in the Lab, a crew of 4 explores variations) · Answer, then review (the other AI checks it) · Debate · Side by side (Claude and Astra) · Jam (a music visual in the Lab, taking turns) · Pair on code · Ask everyone. A click is for the next message only; 📌 keeps it from now on; right-click ◎ goes back to a normal reply. Your words go out as written.

## Sync conflicts settle themselves (round 26)
After each sync, conflicts settle by themselves: chats, scenes and settings merge (everything from both computers, the newer one winning where a field differs); pictures and files keep the newer version. A calm toast says how many, with Deleted files one click away (every other version waits there 30 days). The conflicts view has **✓ Settle all for me**, **Newest wins, all**, **This computer's, all**, **↻ Refresh**, and the switch "Settle new conflicts by themselves". Right-click the sync dot: **Settle all conflicts for me**.
## Connections (round 26, connections, 38 upgrades: docs/upgrades/connections.md)
- ✓ ⋯ AI setup → What it can use → **＋ Add a connection**: any MCP server you have (a command line, or the address of a remote HTTP server, with optional settings), or one of 8 free ready-made ones in one click (files in a folder, web pages, git, SQLite, a web browser, memory, time, step-by-step thinking; marked needs Node / Python).
- ✓ Per AI Off / Read only / Full (Off / On when a server has only one kind of tool), for Claude and Astra; **Test** starts it, lists its tools, measures its ≈ tokens a message, and says clearly why when it doesn't start. Right-click a row: Test, Edit, Remove.
- ✓ Settings you type (keys, tokens) stay in Hearth's config and go only to that server, never to the AI or a prompt; nothing is added to the system prompt.
- ○ Tested with a fake stdio server, a local HTTP server and the fake engines (`sh dev/run-checks.sh connections`); the ready-made servers weren't started for real here (no network).
### ⚡ Hooks (round 26, hooks: docs/upgrades/hooks.md)
In ⋯ AI setup, **⚡ Hooks: when… then…** gives each AI a short list of rules: *when* a render or export finishes, the Lab scene shows an error, a file appears in a folder you pick, a time of day / every few hours, Hearth updates, another AI finishes a reply, or the mood board gets new things → *then* it gets your message (or runs a mission with it). Your words go out as written, under one visible line from Hearth saying what happened (the render's path, the error…), marked ⚡ hook. Once a minute at most, never while it answers (it waits its turn), the same news told once, a looping hook pauses itself, no ping-pong between AIs, ❚❚ Pause all; risky actions still ask as usual.
## ◎ Missions, finished (round 26, missions2, 34 upgrades: docs/upgrades/missions2.md)
- ✓ One calm result card for Swarm, Debate, Side by side, Pair on code, Ask everyone, Research and Second opinion only: small avatars of who took part with a live status each, the final answer up front, the rest folded, Use this one / Merge where they apply, tokens small.
- ✓ New missions: 📝 Plan first (▶ Go ahead under the plan), 🌐 Research (Astra searches the web and cites; from Claude, Astra answers it), 🎓 Explain like a teacher, 👁 Second opinion only; rarer ones under More; missions that can't run here are greyed with the reason.
- ✓ Your message keeps a chip of the mission it was sent with ("🐝 Swarm") with ↻ to run it again; its tooltip shows any note the mission added.
- ✓ Split it up: the helper agents show as tidy live rows under the reply (pip, task, what it's on, time), kept after it ends.
- ○ Tested with the fake engines (`sh dev/run-checks.sh missions`); Research's web search only runs on a real Astra.
## The Lab without commands (round 26, labeasy, 63 upgrades: docs/upgrades/labeasy.md)
- ✓ Audit of all 206 Lab commands (`dev/labeasy-audit.js`): the 22 that had no button now have one; the rest already had a home, are answered by just asking the director, or stay power commands.
- ✓ Right-click the picture › **✦ More**: ♪ Music (make it react, next drop / cue, click track, song info…), ✨ Look & motion (surprise, Hearth on screen, motion intro, cursor tour, fade to black), ⇪ Make (4 variations, render again), ℹ what the Lab shows / hears.
- ✓ Toolbar ⋯ › **Director** (what it's making, did, costs, its last picture, undo); **right-click a layer** (hide, solo, rename, duplicate, react to the music, a filter above, a look; blend / animate / ease / reset / save behind More…).
- ✓ Lab missions in the director's ◎: Make 4 variations, Make it react to the music, Make a 9:16 version, Polish the look, Render it (`Missions.add`).
- ✓ No "/command" in the Lab's visible hints, tooltips, placeholders and menus (checked by `dev/checks/labeasy.js`).
## Smoothness after rounds 25–26 (round 26, smooth26, 12 upgrades: docs/upgrades/smooth26.md)
- ✓ The Lab costs nothing off screen: its preview's stats timer and song report sleep while it's parked / paused (idle after visiting the tools 9.1 → 2.9 ms busy/s, 0 preview wake-ups).
- ✓ No forced layout per click anywhere once the Lab has loaded (40 → 0 per 20 clicks); ⋯ AI setup opens with 69 % less forced style / layout time and is preloaded when you point at ⋯; ◎ Missions places itself before it paints and closes cleanly; switching windows forces 45 % less.
- ✓ "↑ Show earlier" brings 60 messages at a time (41 ms frame → 15–26 ms per step); the usage highlights and the jank watch stay out of busy frames.
- ○ Measured headless on a shared CPU with software GL (`sh dev/run-checks.sh smooth26`, hz240, labperf, perf-report); long-chat wheel tasks here are the software compositor's commit, to check with `/smooth` on a real Mac.
## Activity (round 27, activity, 28 upgrades: docs/upgrades/activity.md)
- ✓ **◉ at the bottom of the rail**, only while something runs or waits for you (a count; ember when it's you). Click it for one calm panel: **Waiting for you** (permission asks with Allow once / Deny, questions, "plan is ready" ▶ Go ahead, sync conflicts, failures while you were away), **Now running** (each chat's reply: what it's doing, for how long, its helper agents, Open / ■ Stop; missions, renders and other bars), **Last 24 h** (hooks fired, missions done, long replies, renders, updates), each one clickable.
- ✓ **Looks stuck**: a reply with no news for 2 min (chat-live's own reading) offers Wait / Stop & retry from here.
- ✓ **Desktop notifications** (Mac + Windows) only while Hearth is in the background and only for what needs you or long jobs finishing, one at most every 20 s, under the existing switch (Settings › General, `/notify`); right-click ◉ for stop all / notifications / clear.
- ○ Tested with the fake engines (`sh dev/run-checks.sh activity`); real OS notifications not seen headless.
## Calmer, plainer (round 27, simplify2, 23 upgrades: docs/upgrades/simplify2.md)
- ✓ Settings reads like ⋯ AI setup: Look, Sync, Updates, Keys, then Advanced folded; every row explained on hover; no command names (34 → 21 controls at first sight, 7 → 4 open sections).
- ✓ What belongs to an AI is in ⋯ AI setup only (its tools; for a Lab director: nodes, progress bar, a picture per edit); Settings has one link to it.
- ✓ No "/command" on screen outside the Lab: keys sheet, command bar, Ctrl+K, Discover tips and tours, tooltips, toasts.
- ✓ ⚇ Work with Astra waits behind Alt (◎ Missions does the same; right-click the chat box has it); AI setup's rail icon is ❖, not a second ⚙.
- ○ Checked by `dev/checks/simplify2.js` (chat group) and the updated `tidy` check.
## 🎬 Drop a song, get a music video (round 27, autoedit, 33 upgrades: docs/upgrades/autoedit.md)
- ✓ 🎬 next to the song in the Lab timeline (also right-click the preview › ⇪ Make & export, the director's ◎ mission "Make a music video from this song", or just asking the director): a plan of the whole video by section (intro / build / drop / break / outro) as one strip, nothing made yet.
- ✓ Each section: a scene (the one on screen, your others, or a new one the director makes), its length in bars, the transition into it on the beat, an intensity from the song's energy (faster cuts, bolder variations, a stronger look), a look from the song's key, lyrics on / off; click a block to change any of it.
- ✓ Make it: new scenes go to the crew (cost first, your Start), then a Lab sequence with every cut on a bar, the song under it, section markers and the lyrics as captions (one undo step); ⇪ Render 9:16 / 16:9 / 1:1 or all three.
- ○ Tested with the fake engines and a generated song (`sh dev/run-checks.sh autoedit unit:autoedit-test`); real crew-made scenes and real renders need a real engine and GPU.
## 📮 Ready to post (round 27, publishkit, 52 upgrades: docs/upgrades/publishkit.md)
- ✓ After a render: **📮 Post** on its note, 📮 in the renders list, or the ◎ mission **Get it ready to post** (`/post` too). One panel for YouTube Shorts, TikTok, Instagram Reels, YouTube 16:9 or Instagram square (guessed from the video, remembered).
- ✓ The video framed like the app frames it, with **▦ the app's buttons drawn over it** (red where text or the subject sits under them); plain-word checks for shape, size, length limit, frame rate, bitrate, codec, sound, loudness (near -14 LUFS) and the seamless loop; fixes run in the render queue (a 9:16 copy, -14 LUFS, blend the end into the start, cut to the limit) and the new copy is checked again by itself.
- ✓ Cover ideas (sharp, well lit, strong moments), scrub to any frame, optional words on it, saved at the app's cover size; title / description / hashtags in plain words at first, **✍ Write it with** this chat's AI (one lean question, tokens shown), Copy all.
- ✓ **📁 Make the post folder**: the video, the cover and post.txt in `posts/<date> <title> (<app>)` next to the video; Show in Finder / Explorer. Hearth never uploads or signs in.
- ○ Tested with a generated video, ffmpeg and the fake engines (`sh dev/run-checks.sh publishkit`); the apps' button positions are approximate (they move them).
## The Lab gallery: start from something like… (round 27, gallery, 58 upgrades: docs/upgrades/gallery.md)
- ✓ The Lab's **New** opens a gallery of picture cards grouped by mood (Neon & retro, Chrome & glossy, Soft & dreamy, Dark & hypnotic, Club energy, Type openers) with a search: 26 new built-in music scenes (outrun sunset, hyper tunnel, chrome blob, molten gold, liquid gradient, beat burst, kinetic opener…), your own scenes, history (deleted scenes, how your scenes began) and the whole library (backgrounds, 3D, shaders, particles, physics, type, node presets, code sketches).
- ✓ Hover a card: it plays; click: a new scene from it at your frame size; **＋ Layer**: on top of your scene. Every starting point has plainly named sliders and something that follows the music.
- ✓ Also from a new chat's starter ("🖼 Start from something like…") and the director's ◎ mission of that name (your words search, you pick, the director gets your words).
- ✓ Light: loads on first use; pictures drawn one at a time in one hidden preview page, only for cards in view, kept on disk.
- ○ Checked with the fake engines (`sh dev/run-checks.sh gallery`: every starting point runs without errors); its look on a real GPU wasn't seen here.
## Smart picks the model and effort per message (round 28, router, 26 upgrades: docs/upgrades/router.md)
- ✓ ⋯ AI setup → How hard it thinks → **Smart** now decides per message, from local rules (no extra model call): chit-chat → Haiku · low (Astra: Luna · minimal), short questions → Sonnet · low (Sol · low), everyday asks → the chat's own model · medium, code / Lab builds / analyses → its own model · high. Quick and Deep stay fixed.
- ✓ The pick shows small on the reply ("Sonnet · low"; hover: why); one click **asks again, thinking harder** (own model, high; xhigh after high).
- ✓ Never routes away from a model or effort you picked for the chat, never picks a stronger model than the chat's own, and a chat with a big context never steps down (it would lose its prompt cache).
- ○ About −17% cost vs the old Smart and −32% vs Deep on a typical mix (estimate: `node dev/router-test.js`); checked with the fake engines reporting what each run got (`sh dev/run-checks.sh router`).
## Check this computer (round 28, firstrun, 31 upgrades: docs/upgrades/firstrun.md)
- ✓ A new computer ready in two minutes: the first launch on a fresh computer opens one calm list (Settings › Advanced › **Check this computer…** any time; Ctrl/⌘+K; skippable, never back by itself). Claude + sign-in, Codex for Astra, ffmpeg, the sync folder (**Use this Hearth** joins the copy from your other computer), folders chats use from the other computer, Mac screen recording / camera / microphone, Windows long paths + the SmartScreen note, updates.
- ✓ Each line: its state in plain words and one button. Installs, updates and sign-ins show their exact command first and run only after your click in a visible Terminal / PowerShell window; the official page is one click away. Mac permissions open the right System Settings pane.
- ✓ A chat's folder that only exists on the other computer: **Show where it is…** once, and every chat uses this computer's folder from then on (kept per computer).
- ✓ Live: a line re-checks itself after its button and when Hearth gets the focus back. Reuses the existing doctor, ffmpeg, sync, reach and updater checks; loads on first use.
- ○ Tested with the fake engines (`sh dev/run-checks.sh firstrun`); the Mac panes and Windows' long-path switch weren't seen on a real Mac / PC here.
## 🎨 Make it look like this (round 28, lookmatch, 51 upgrades: docs/upgrades/lookmatch.md)
- ✓ Give the Lab a picture, a video, a mood-board item or a render: its palette, light, contrast, saturation, warmth (in kelvin), grain, vignette, glow and bars land on the scene's ◐ Grade / ◐ Film & lens layers (as sliders) and its colors become the palette, at once and with no tokens; measured against your scene's own picture, then checked and corrected once ("≈82 % close").
- ✓ A small card: Strength, hold for Before, ↶ Undo, ◐ Fine-tune; your matched looks come back in one click.
- ✓ ✦ Ask the director: a small picture of the reference + the numbers (cost shown first) so it matches shapes, light and motion.
- ✓ Ways in: the director's ◎ mission "Make it look like this", right-click the preview › ✨ Look & motion, a board item's right-click "🎨 Use this look in the Lab", dropping a picture on the Lab preview.
- ○ Checked with generated pictures, a recorded clip and the fake engines (`sh dev/run-checks.sh lookmatch unit:lookmatch-test`); how close a match gets on real footage depends on the scene.
## One undo for what the AIs did (round 28, aiundo, 32 upgrades: docs/upgrades/aiundo.md)
- ✓ Every change an AI makes (Lab scenes through the director, the mood board, files through chat access, settings through the commands it runs) lands in **one timeline**: who (the AI, the chat, the reply, a hook or mission that started it), what in plain words, when.
- ✓ A reply that changed something has **"↶ Undo what it did"** in its actions; **Activity › Changes by AIs** (Ctrl/⌘+K) has ↶ per change and ⋯ / right-click for **Undo everything it did since then**, the whole reply, Show it.
- ✓ Safe: later changes to the same thing go first (newest first), a scene / file goes back in one step, and the confirm warns when **you** changed it after. Each place's own undo does the work (the time machine, a board edit, chat access's copies, the old setting), so it can be taken back there too; a file a chat deleted now keeps a copy.
- ○ Tested with the fake engines' real tool calls (`sh dev/run-checks.sh aiundo`: Lab, board, files, a setting, each undone) and a unit test of the timeline logic.
## ⇪ Packs: share a scene as one file (round 28, packs, 42 upgrades: docs/upgrades/packs.md)
- ✓ **Sketch ▾ › Share › Save as a pack…** (also the preview's ✦ More › ⇪ Share, the gallery's right-click on any card, and "Save its sequence as a pack…"): the scene with every layer, its sliders, saved looks, keyframes and palette, plus everything it uses (textures, HDRIs, models, fonts, LUTs, footage; the song if you tick it) as one `.hearthpack` (a plain zip). A card shows what's inside and the size first.
- ✓ **Drop a .hearthpack anywhere on Hearth** (or Share › Open a pack…, or open it with Hearth): a card first (its picture, name, what's inside, size, where it came from, and that its layers are code running only in the Lab's sandboxed preview); nothing is added until **Add as a new scene**. Then a new scene opens, its files in `data/assets/packs/<name>/` and the asset library, paths rewritten, LUTs in the grade, its sequence back.
- ✓ Safe by construction: no zip-slip (only `files/<plain name>`, every target checked inside Hearth's folder), size and zip-bomb caps, CRC checks, never overwrites, a newer-format pack says "update Hearth".
- ○ Tested headless (`sh dev/run-checks.sh packs`: unit + a scene and a sequence round trip through the buttons); real Finder / Explorer "Open with" wasn't tried here.

## 📰 Patch notes (round 29)
One short, plain-words page per round (docs/patch-notes/round-NN.md): what each new thing is, where to find it, and what's good to know. The ⬆ Update dialog now leads with the patch notes of the rounds you don't have yet (the commit list folds under Details); after an update the note has a **📰 Patch notes** button; any time: Settings › Updates › **Patch notes…** or Ctrl/⌘+K.
## Hearth never loses work (round 29, safetynet, 22 upgrades: docs/upgrades/safetynet.md)
- ✓ A small journal keeps what isn't saved yet a moment after each change (Lab code, layers, keyframes and unsaved slider moves, chat drafts and queued messages, board edits, AI setup / dialog text); nothing runs while you do nothing.
- ✓ After a crash, a forced quit or a power cut (or the window's page crashing: it now reloads by itself), one card: **"Hearth closed unexpectedly — here's what was restored"** with Open per line: Lab work as a time-machine version, the draft back in its box, queued messages back in the box (not sent), board edits put back, typed text as a note. Never over newer data. Again: Ctrl/⌘+K or `/restored`.
- ✓ Saves no longer wait for a pause (long typing is written every couple of seconds and on reload / update / close); `config.json` and every store are written whole-or-old and flushed to the disk; an unreadable store opens its previous version.
- ○ A real renderer crash tested end to end headless (`sh dev/run-checks.sh safetynet`); a real power cut / macOS force-quit wasn't tried here.
## ✦ Describe it: a scene from your words, 0 tokens (round 29, instantscene, 50 upgrades: docs/upgrades/instantscene.md)
- ✓ Write a sentence ("dreamy pink chrome tunnel that pulses on the kick, slow"). A small hand-written vocabulary matches it on this computer, with no model call, against the gallery's starting points, the library, particles / physics / type presets, ◐ looks, palettes and music reactions.
- ✓ 3 different picks as cards (a picture of each as it will open, what it understood, why). One click opens a new scene with colors, speed, intensity and the music reaction set from the words, and the look on top.
- ✓ Ways in: the gallery's search ("✦ Make it from my words"), an empty scene / a new chat's starter, the director's ◎ mission "Make it from my words", right-click the preview › ✨ Look & motion. "✦ Ask the director to take it further" shows the cost first.
- ○ Tested with the fake engines (`sh dev/run-checks.sh instantscene unit:instantscene-test`); the picks' look on a real GPU wasn't seen here.
## A Lab sequence that doesn't bug out (round 29, seqsolid: docs/upgrades/seqsolid.md)
- ✓ Fast scrubbing across cuts no longer leaves the preview black: code from clips you scrubbed past no longer makes WebGL contexts, logs or errors.
- ✓ A clip that is still loading (after a seek, or at a cut while playing) holds the last picture instead of going black. A scene edited while it plays cross-fades to its new version.
- ✓ Quick scene switches always land on that scene's own sequence. A scene that throws gets a ⚠ on its clip (right-click shows the message).
- ○ Stress-tested headless (`dev/checks/seqsolid.js`: scrubs, switches, size swaps, re-runs, a throwing scene, 🎬 auto-edit, export vs preview); not tried on a real Mac GPU.
## Google sign-in in your real Chrome (round 30, chrome, 32 upgrades: docs/upgrades/chrome.md)
- ✓ Google refuses sign-in inside embedded browsers ("Couldn't sign you in"), so where it's needed the page opens in **your real Google Chrome** (Edge / Brave as fallbacks), in **a Chrome profile of Hearth's own**: sign in once on Google's page, it stays signed in; your everyday Chrome isn't touched. Hearth drives it over Chrome's DevTools protocol (127.0.0.1 only, no dependency).
- ✓ Ways in: Google-only sites (Gemini, NotebookLM, YouTube Studio…) go there by themselves; an app window's **⋯ › Open in Chrome (for Google sign-in)** / **my everyday Chrome**; right-click a website chat › **Open in Chrome**; and when Google's refusal page shows anywhere, a one-click **Sign in with Chrome instead**. **⋯ AI setup › What it can use › Chrome**: found or not, Open, Sign in…, what opens there (✕ back inside Hearth).
- ✓ The AIs work the same there: `apps_page` reads / clicks / types / takes pictures / waits on an app's page in Hearth's window or in Chrome, apps_open paste fills Chrome pages, asking everyone types into a website chat in Chrome. The cheap fix is kept too: the user agent names the real system and Google's sites get "Google Chrome" client hints.
- ○ Tested with Playwright's Chromium as "Chrome" and a fake refusal page (`sh dev/run-checks.sh chrome`) and a unit test against a fake DevTools server; a real Google account / real Chrome on a Mac or Windows wasn't available here.
## A faster start (round 29, fastboot, 13 upgrades: docs/upgrades/fastboot.md)
- ✓ The window's first picture no longer waits for the Lab (it was being loaded in front of the first frame by mistake): first paint after a reload ≈ 808 → 469 ms, long tasks during the start −74 %.
- ✓ The main process makes the window first and sets up the rest right after (36 → 7 ms before the window); renders, the updater, the asset library and hooks load on first use.
- ✓ The command bar and Flows load just after the first screen (−205 KB of JS); Ctrl/⌘+;, F1 and Ctrl/⌘+Shift+F work from the first moment. Pressing the Lab's button starts building it before the click lands.
- ○ Measured interleaved on a shared machine with software GL (`sh dev/run-checks.sh fastboot`, dev/checks/fastboot-lab.js); the Lab's own first run (GPU context + shaders) is unchanged.
## Spending: a weekly guard per AI (round 30, budget, 30 upgrades: docs/upgrades/budget.md)
- ✓ ⋯ AI setup → **Spending**: this week's use in plain words (≈ tokens, ≈ $ where the engine reports prices), a weekly limit (or none), and what happens near it (80 %): warn me · use cheaper answers (Smart steps down, never below what pictures / Lab builds need, never your own picks) · ask before each message.
- ✓ Calm warnings at 80 % and 100 % (toast + ◉ Activity line, once a week); costly confirms (crew, ✦ take it further, look match) say "this would pass your weekly limit". Nothing is blocked.
- ✓ **This week at a glance**: biggest chats, where it went, tools sent with every message, one-click fixes ("Turn off Board tools for Claude: saves ≈ 70k a week"). `/spending` from chat.
- ○ Tested with the fake engines (`sh dev/run-checks.sh budget`); real prices only show for engines that report them.
## Recall: "what did we decide about X?" (round 30, recall, 20 upgrades: docs/upgrades/recall.md)
- ✓ Ask in plain words in the chats panel's search box (**🔎 Find the answer**) or with ◎ Missions › More › **Remind me what we decided**: every chat on this computer is searched for free, and the answers come as short quotes grouped into **decisions**, **open questions** and other mentions, each with its chat, date and **Jump to it**.
- ✓ Ranked by the words that matter, recency, pinned chats, bookmarked messages and decision phrasing; the index lives on the store thread, is built only in idle moments (never at startup) and costs nothing once caught up.
- ✓ **Ask the AI to sum these up** shows its token cost first and sends only the quotes, never whole chats.
- ○ Tested with seeded chats (`sh dev/run-checks.sh recall`: smoke with fake engines + a ranking unit test with 24,000 messages); decisions phrased unusually land under "Also mentioned".
## ✨ Make it look finished (round 30, autopolish, 35 upgrades: docs/upgrades/autopolish.md)
- ✓ One click, 0 tokens: the Lab measures its own picture (levels, black / white, contrast, glow, color harmony, detail under the 9:16 apps' buttons), a few frames of motion, what follows the music and the frame rate, then fixes what's off with ◐ Grade and slider changes, as one undo step.
- ✓ The card shows the measured numbers before → after, a finish score, Before / After pictures; untick any fix, hold Before, ↶ Undo all, ✦ ask the director for what's left (cost first).
- ✓ Ways in: right-click the preview › ✨ Look & motion › ✨ Make it look finished, right-click the preview › ✨ Look & motion, the director's ◎ "Polish the look" (local pass first, then the director), ⌘/Ctrl+K.
- ○ Tested on a generated bad scene with the fake engines (`sh dev/run-checks.sh autopolish unit:autopolish-test`); not seen on the owner's real scenes / GPU.
## 🥁 React to the drums, the bass, the voice (round 30, stems, 26 upgrades: docs/upgrades/stems.md)
- ✓ The Lab splits the loaded song into its parts once, on this computer, no AI model (harmonic / percussive separation + bands + onsets, in a Worker, kept on disk): **the drums** (kick, snare, hats), **the bass**, **the voice**, **everything else**, smooth 0..1 at the playhead, so renders match the preview.
- ✓ Sliders: the ♪ panel's **The drums / The bass / The voice**, the curve editor's "The song's parts", `/react-to size the drums`, presets Pump with the drums · Throb with the bass · Glow with the voice · Drift with everything else; the ◎ mission "React to the drums, bass and voice"; sketches read `audio.stems.drums` / `.bass` / `.vocals`…; `/stems`.
- ✓ Costs nothing until a sketch or a slider reads a part; a small bar on the Lab icon the first time (a few seconds a minute of song).
- ○ Tested on generated songs (`node dev/stems-test.js`, `sh dev/run-checks.sh stems`); an approximation (a plucky bass nudges the drums a little), not tried on real songs on a Mac.
## 📌 Find images like this (round 30, pinboard, 28 upgrades: docs/upgrades/pinboard.md)
- ✓ From the mood board (⋯ or right-click › **Find images like this…**, right-click references, Add › Images like this board…) or the ◎ mission **Find images for this vibe**: Hearth turns the board's vibe (or your words) into a search, opens **Pinterest in the Hearth Chrome** where you're signed in (or the board's Pinterest window inside Hearth, if you prefer), reads only the pictures on screen with their links and titles, and shows them in a picker. Unsplash, Are.na and Cosmos work the same through their app windows.
- ✓ Logos, avatars, ads and shopping links are left out; each picture and each pin shows once; what's already on the board is left out. **More ↓** reads one more screen (a modest scroll, 6 at most). Pick → **Add N to <board>**: only the picks are downloaded (the biggest version), saved like a dropped picture, with their link as the source and the site as credit.
- ✓ The AIs with board tools: `board_do pins {query?}` returns a short numbered list and the owner confirms in a picker card under the reply (≈ 20 more tokens on the board tools only). Hearth never handles a password: a sign-in page is only noticed.
- ○ Tested with Playwright's Chromium as "Chrome" on local Pinterest-like / Unsplash-like pages (`sh dev/run-checks.sh pinboard`) and a unit test of the page reading against saved pages; the real Pinterest / Unsplash / Are.na / Cosmos pages weren't reachable here.
## Bug bash (round 29, bugbash: docs/upgrades/bugbash.md)
- ✓ The Lab no longer starts twice when a command or the director opens it before its tab was ever shown (two previews, keys doing nothing).
- ✓ Switching director chats always fades from the old scene's picture, even while a heavy scene draws (the preview's quick picture or the window's own).
- ✓ Sync: a file changed in the very same millisecond no longer waits an extra sync.
- ✓ The flaky self-checks (sync journal, keys, tooltips, die, Commands page count, music undo, sequence help / render, frame card) fixed at their cause; each reason is in the doc.
- ○ `remote`'s fader step still fails now and then under heavy load (passes alone); listed in the doc.
## 🫥 Chrome out of sight, its pages inside Hearth (round 31, chromeview, 35 upgrades: docs/upgrades/chromeview.md)
- ✓ The Hearth Chrome (Google sign-in) runs with every window far off-screen; its pages show in Hearth's own windows as a **Chrome view**: an app set to Chrome opens in its usual app window, a website chat in Chrome shows its page in place (‹ Back · Forward › · ↻ · the address).
- ✓ Mouse, wheel, keys (⌘ editing commands on a Mac, input methods), pastes, the page's cursor, right-click (the page's menu or Hearth's), popups as another view, downloads → Downloads/Hearth/<App>, file pickers → Hearth's dialog. ≤ 30 frames a second, none while the view can't be seen.
- ✓ Chrome's own window only for signing in: **Sign in (opens Chrome once)** puts that page's window on screen and back out of sight when the page leaves the sign-in page (or "I'm signed in"). AI setup › Chrome › **Show Chrome** (off) for fixing things. The AI's page tools are unchanged.
- ○ Tested with Playwright's Chromium as "Chrome" (`sh dev/run-checks.sh chromeview`, `node dev/chromeview-test.js`); real Chrome on a Mac / Windows and a real Google sign-in weren't available here (on a Mac, Chrome's Dock icon stays while it runs).
## 🪶 Token saver (round 31, tokensaver, 16 upgrades: docs/upgrades/tokensaver.md)
- ✓ The fixed part every message carries, measured per kind of AI and cut: plain Claude chat 869 → 572 tokens, Three Director 2930 → 2826, Claude with board tools 1977 → 1444, capture 1419 → 1057, apps 1501 → 1069, with a connection 1010 → 713.
- ✓ Plain chats get a lean chat tool list (`chat_do` for the rarer abilities); board / capture / apps tools give their details on demand (`help`); one "You are…" line for the director; shorter habit lines.
- ✓ Memory goes where it costs least: in the prompt while small, only with the messages it's about once big (`/memory relevant on|off|auto`), each fact at most once per chat.
- ✓ `node dev/tokens-test.js` (unit group) fails when any of these per-message totals grows past its budget. ≈ 147k fewer tokens in a typical week (before tool steps).
## 🖥 Mac + Windows polish (round 31, winmac, 30 upgrades: docs/upgrades/winmac.md)
- ✓ Files named with `#`, `?`, `%` or accents show everywhere (one `WinMac.fileUrl` in `winmac.js`); exports use one slash kind; Forge Debug works on the Mac.
- ✓ Mac: a Dock launch finds Homebrew / npm / nvm programs (claude, codex, gh, ffmpeg); the Dock click brings back a hidden window; toasts, search hints, menu rows say ⌘; the hotkey shows as ⌃⌥H.
- ✓ Windows: shortcuts carry Hearth's app id (notifications) and land on the real (OneDrive) Desktop.
- ○ `node dev/winmac-scan.js` keeps the patterns out (0 hits, checked by `dev/winmac-test.js`); no real Mac / PC here, and npm's `claude.cmd` on Windows is still not picked up.
## ✦ What can I do here? (round 31, quickstart, 53 upgrades: docs/upgrades/quickstart.md)
- ✓ One calm card per window (a chat, the Lab, the board) with 3–5 things worth trying there now, each one click that opens the feature; picked on this computer from what you haven't used yet and what's on screen (a song → React to the drums, an empty scene → Describe it, pictures → Find images like this, a long chat → What did we decide?). Free: nothing is sent.
- ✓ By itself only the first time each kind of window opens (× = gone for good); then the window's ⋯ › ✦ What can I do here? (the chat: the ? in AI setup, or right-click), Ctrl/⌘+K. Used or tried things drop off; right-click › Not for me.
- ✓ One place for things to try: Discover's daily tip no longer pops up by itself; the Lab's starter chips step aside while the card is up; an empty chat's "◎…" line became the one link.
- ○ Tested with fake engines (`sh dev/run-checks.sh quickstart`) and a unit test of the picking (`node dev/quickstart-test.js`).
## ∞ Make it loop (round 31, perfectloop, 35 upgrades: docs/upgrades/perfectloop.md)
- ✓ Right-click the preview › ⇪ Make & export › **∞ Make it loop** (or the ◎ mission, or just asking the director): the scene loops over N bars of the song (or N seconds of its own timeline). The preview's clock and renders' wrap with it, keyframes come back round, music reactions loop with the bars.
- ✓ Code that loops by itself: `loopT()`, `loopSin(n)`, `loopCos(n)`, `loopWave(n)`, `loopAngle(n)`, `loopNoise(x, y)` (noise on a circle), `loop.len`; the director reads them with `help loop`, on demand.
- ✓ The seamless check compares the loop's last frame with its first (publishkit's loop check): **≈ seamless** or **a visible jump**, with one click to fix it (blend the last beat into the first: the preview fades its seam, renders cross-fade it), or the director (cost first).
- ✓ ⇪ Render the loop: a perfect-loop MP4 (or GIF) of exactly the loop, with its bars of the song. Ready to post's loop fix renders a Lab render's scene again as a perfect loop.
- ○ Tested with fake engines on a software GPU (`sh dev/run-checks.sh perfectloop`, `node dev/perfectloop-test.js`); `Date.now()` and live sound don't follow the loop.
## 🪶 The Lab preview stays smooth on any machine (round 31, labadapt, 20 upgrades: docs/upgrades/labadapt.md)
- ✓ When frames drop, the preview lightens itself in steps (resolution 1 → 0.85 → 0.7 → 0.5, then filters at half / a third, smaller shadow maps, fewer GPU particles), skips steps the scene doesn't use, and climbs back with headroom, with hysteresis (no flicker).
- ✓ A layer fully under an opaque one skips drawing (its code still runs) and draws again the frame it can be seen.
- ✓ A quiet corner note while lighter ("lighter to stay smooth · full quality in renders"); right-click › View › Lighten to stay smooth turns it off. Light mode stays the manual option.
- ✓ Stills, freezes, exports and recordings are full quality: pixel-identical to adapting off (`sh dev/run-checks.sh labadapt`). Heavy test scene on SwiftShader: 5.3 → 12.2 fps.
## 🔓 File access per AI (round 32, access2: docs/upgrades/access2.md)
- ✓ Fixed "chats are read only even with Full": ⋯ AI setup → Files on this computer is now the AI's own setting, used by every chat with it (it used to change only the open chat). A chat can still set its own (right-click ⋯ → Access; "As in AI setup" goes back).
- ✓ AI setup lists the folders it may use: ＋ Add a folder…, ✕, and My home folder (with a clear warning). Full = files and commands there; deletes to the Trash; risky things still ask (Claude).
- ✓ A refused change says why in one line in the chat (outside its folders · read only · no commands · Astra's sandbox) with Allow this folder / Allow edits / Allow commands / Open AI setup.
- ○ Tested with fake engines (`sh dev/run-checks.sh access-chat options access-astra`, `node dev/access-test.js`); Astra can't ask, so outside its folders it is blocked, not asked.
## 🪟 Commands on Windows (round 32, winshell: docs/upgrades/winshell.md)
- ✓ Fixed "the command tool is blocked by policy" on Windows: at Full, Claude also gets Claude Code's **PowerShell** tool (Windows runs commands through it; it used to be left out, so the CLI refused it before Hearth's check). PowerShell commands get the same check as Bash (Get-ChildItem / Remove-Item → the Trash / Copy-Item…).
- ✓ Astra on Windows: when its sandbox blocks every command, the chat says so in one line with **Run without its sandbox…** (a warned opt-in, also in ⋯ AI setup → Files on this computer; Read keeps the sandbox).
- ✓ Any command an engine refuses by its own policy now gets that one line with the right fix (never silent).
- ○ Tested with fake engines simulating Windows (`FAKE_WINDOWS` / fake-switches `windows`: `sh dev/run-checks.sh access-chat options`, `node dev/access-test.js`); the real Windows confirmation is the owner's next try.
## 🩺 Check this AI (round 32, aicheck: docs/upgrades/aicheck.md)
- ✓ ⋯ AI setup → What it can use → **Check this AI**: one short real test through the AI's engine (a few tokens: one tiny message, the cheapest model, no Hearth tools), then a checklist: found · version · signed in · answers · reads its folder · writes a file there (then to the Trash) · runs a command. Each failing line has its fix: Install / Update / Sign in, Allow edits, Allow commands, Run without its sandbox… (Astra on Windows), Open AI setup.
- ✓ The last result and its time stay on the row; a chat's one-line refusal note offers **Check this AI** too; `/check-ai` runs it.
- ○ Tested with fake engines (`sh dev/run-checks.sh aicheck access-chat`), including a simulated Windows PC; not yet on a real Windows install.
## ⚡ Cache-wise chats (round 32, cachewise: docs/upgrades/cachewise.md)
- ✓ The same chat sends the same prompt and flags message after message: a fact saved mid-chat or a picture no longer resets the engines' prompt cache; the parts you change (personality, instructions, files, memory) sit at the end of the prompt. A 20-message chat: 4 → 1 full-price re-reads.
- ✓ What the cache saved: a reply's ⚡ hover, the meter, `/cache`, ⋯ AI setup → Spending and the week at a glance.
- ✓ A change made mid-chat (personality, instructions, tools, model, effort) shows one calm line, once: the next message re-reads the chat once without the cache. Never blocks.
- ○ Tested with `node dev/cache-test.js` and fake engines (`sh dev/run-checks.sh budget`); real engines' cache numbers not seen here.
## 🪟 Windows, solid (round 32, winpolish, 37 upgrades: docs/upgrades/winpolish.md)
- ✓ Fixed "Claude installed with npm isn't found on Windows": Hearth finds `claude.cmd` / `codex.cmd` (npm's folder and prefix, nvm-windows, Volta, scoop, winget, pnpm, Bun, the installer, the desktop apps) and starts them through their Node script (no cmd.exe; a `.cmd` it can't read goes through cmd.exe with every argument quoted).
- ✓ Deletes stay recoverable: a file on a network share or USB drive (no Recycle Bin, Windows would delete it for good) is left alone with a plain reason.
- ✓ Windows' own errors (no Node.js, a half-removed npm install, a refused `.cmd`, the antivirus, a too-long command line) read as one plain sentence with the fixing button; stack traces never show.
- ○ Simulated Windows only (`node dev/winpolish-test.js`, `sh dev/run-checks.sh winpolish`); the real check is the owner's next start on the PC.
## Simpler AI setup (round 33, simplify3: docs/upgrades/simplify3.md)
- ✓ ⋯ AI setup reads who → Personality → Instructions → What it can use (files, Hearth's tools, Connections, Hooks, Check this AI) → How hard it thinks; Memory, Habits, Spending and Missions folded at the end, each fold with a one-line state (48 → 18 controls at first sight, 1871 → 841 px).
- ✓ Plain words: Files it can use, Everything it can do…, Your own connections; no /command left in the chat menus; Settings › Updates has one What's new…, the Meshy key moved to Advanced.
- ○ Checked by `dev/checks/simplify3.js` (chat group).
## 🩺 Fix my scene (round 34, scenedoctor, 30 upgrades: docs/upgrades/scenedoctor.md)
- ✓ A free local check of the Lab scene (✦ More first row, the toolbar's ⋯, ⌘K): layer errors, a blank / dark / blown-out frame, the subject off-screen / tiny / camera inside it, NaN values, slow frames, music layers with nothing playing, missing files; one plain sentence each.
- ✓ One-click fixes, one undo step each (hide the layer, show layers, frame the subject with the layer's camera placement, autopolish's exposure, reset / halve a slider, Light mode, live sound); "✦ Ask the director" fills its box with a short request, never sent.
- ✓ A calm hint by itself on a blank frame or a layer error, once per problem.
- ○ Checked by `dev/checks/scenedoctor.js` (lab group) and `node dev/scenedoctor-test.js` on generated scenes.
## 🗜 Continue lighter (round 34, autocompact, 26 upgrades: docs/upgrades/autocompact.md)
- ✓ One calm line under the reply when a long chat would clearly cost less compacted ("This chat re-reads ≈ 48k tokens each message. Continue lighter? (keeps a summary, ≈ 3k)"), decided from the real context, the prompt cache, how much history still matters and topic changes; one button, never silent.
- ✓ The cheapest model at low effort writes a structured summary; the last 2 exchanges go word for word; every message stays (and in recall); byte-stable prompt. ⋯ AI setup → Spending → "Offer to continue lighter" (default about 40k), `/lighter`.
- ○ Fake engines: a 30-message chat re-reads 1,434k → 739k tokens (`sh dev/run-checks.sh budget`); real summaries' quality not seen here.
## 📶 Calm when things go wrong outside Hearth (round 34, offline, 30 upgrades: docs/upgrades/offline.md)
- ✓ No internet, a busy or rate-limited AI, a usage limit (reset shown in local time), signed out, a VPN or proxy, a reply cut off: each is one plain line with its one action (waits and sends once back · retrying in 20 s with Cancel and Ask Astra instead · Switch · Sign in · Continue).
- ✓ Waiting messages (and the chat's own queue) survive a restart and are never sent twice. A cut-off reply resumes on the same session and is stitched in without repeats. `/offline` lists what waits.
- ○ Tested with fake engines and a simulated internet (`sh dev/run-checks.sh offline`), not against a real outage.
## ✂ Shorter answers (round 35, concise: docs/upgrades/concise.md)
- ✓ ⋯ AI setup → How hard it thinks → **How long its answers are**: Short · Normal · Detailed (one fixed line at the end of Claude's instructions; Astra uses its engine's own verbosity; Normal adds nothing). `/answers`.
- ✓ A reply's token hover splits the output (written · thinking · tool calls) and names the length; plain chats answer without preamble or recap by default; the Three Director is pointed at targeted edits when it rewrites a mostly unchanged layer.
- ○ Measured on a labelled sample (`node dev/concise-measure.js`: Short drops ≈ 24 % of output if followed; an edit ≈ 47 tokens vs a rewrite ≈ 1,161); fake engines `sh dev/run-checks.sh concise`.
## 📐 My templates (round 35, labtemplates, 22 upgrades: docs/upgrades/labtemplates.md)
- ✓ Any Lab scene saved as your own starting point (✦ More › 📐 My templates, the toolbar's ⋯, Sketch ▾): name, a picture, and which parts become fields (all sliders, the palette, text layers' words, picture / video / sound slots by default). Files in data/templates/ (synced), shared as a .hearthpack, deleted to the Trash.
- ✓ New from my template…: a picker (pictures, search, newest first) → a short form with a live preview → Create makes a new scene (one Undo, its own time-machine entry). 0 tokens. The AI: `/my-template list | fields | use <name> {values}` through three_do run.
- ○ Checked by `dev/checks/labtemplates.js` (lab group) and `node dev/labtemplates-test.js` on generated scenes.
## 🔎 Where its tokens go (round 36, tokenaudit, 21 upgrades: docs/upgrades/tokenaudit.md)
- ✓ ⋯ AI setup → Spending → Where its tokens go: the fixed part of each message to that AI, line by line (instructions, personality, memory, habits, each tool set / connector / connection, hooks at 0), measured from what the engine really gets (`engines.js promptParts`, `tokenauditmain.js`), with "used N times this week" and what the cache usually covers.
- ✓ One-click trims, never silent: "Turn off — not used in 30 days" (toast with Undo; a director's own tools never), "Shorten" opens an over-long instruction / personality / memory; savings per message and per week at your use; one nudge line, once, in the Spending summary. `/token-audit`.
- ○ `node dev/tokenaudit-test.js` (unit), `dev/checks/tokenaudit.js` (budget group: a trim shrinks the next prompt by exactly the amount shown).
## 🪟 Native feel on the Mac and Windows (round 36, nativefeel, 40 upgrades: docs/upgrades/nativefeel.md)
- ✓ The window opens where it was on this computer and this set of screens, never off-screen (a monitor gone → back on one that's there); maximised / full screen remembered.
- ✓ Mac: traffic lights in the rail (hidden-inset title bar), headers move the window, double-click per System Settings, full Mac menus (Settings… ⌘,, Hide, Quit, Edit, Window, Help), the Dock's count of replies finished while away. Windows: native title bar dark / light with the look, a clean Alt menu bar, taskbar flash + a number on the icon, slim scrollbars.
- ✓ ◐ Match my computer (Appearance, `/lightdark`): the look follows the system's light / dark mode live. Crisp Lab preview / wave / timeline when the screen scale changes; tray icon drawn per scale.
- ○ Unit-tested with injected screens and platforms (`sh dev/run-checks.sh nativefeel`); not yet tried on a real Mac / PC.
## 🔎 Lab search (round 36, labsearch, 26 upgrades: docs/upgrades/labsearch.md)
- ✓ / in the Lab (or the toolbar's small 🔎): one box, one ranked list over every row of the Lab's menus (preview right-click with ✦ More, the toolbar's ⋯, Sketch ▾, the selected layer's right-click, read from the menus themselves), effects / looks / palettes with their small pictures, layers, sliders, My templates, gallery starting points, recent scenes, help and keys. Enter does what the menu row does.
- ✓ Plain words and typos ("glow" → bloom, "make it brighter", "slow motion", "vertical video" → ▦ All formats, "blom", "glwo"); nothing found → "Ask the director: <your words>" fills its box, not sent. The AI: `/lab-search <words>` through three_do run.
- ○ Checked by `dev/checks/labsearch.js` (lab group) and `node dev/labsearch-test.js` (unit); ≈ 1–5 ms per keystroke on ≈ 1 900 rows.
## ⬆ Safe updates (round 37, updatesafe, 32 upgrades: docs/upgrades/updatesafe.md)
- ✓ Hand edits go into named stashes and come back; hand-added files with a new file's name are kept aside, named; `data/` is never touched.
- ✓ Every failure is one plain sentence + one button (Install Git, Connect to Hearth on GitHub, Go back onto main, Keep mine aside and update, Allow long paths, Fix the folder's owner, Restart and finish the update, Try again); password / admin commands are shown first and run only in a visible window after a click.
- ✓ Windows files held open: staged and swapped in at the next start; an update cut short: Finish / Go back to how it was; after updating the same screen and chats come back; ↶ Go back to the previous version (note, Settings › Updates, ⌘K, `/update back`).
- ○ Real git in temp folders, Windows simulated (`sh dev/run-checks.sh updatesafe`); the first real Windows lock / proxy is the owner's.
## 🔎 Find anything (round 37, appsearch, 19 upgrades: docs/upgrades/appsearch.md)
- ✓ Ctrl/⌘+K ranks with Lab search's engine (now shared: tools/three-search-core.js vocabularies) over every Settings row and look, every ⋯ AI setup row (Enter opens it there, its fold opened, the row lit), the right-click menus on screen (run in place), missions, chats and what was said in them (recall), the Lab (Lab search's index when it's open), patch-notes parts and "how do I…" answers.
- ✓ Plain words and typos ("dark mode" → Match my computer, "cheaper" → Spending / Short answers / Continue lighter, "permissions" → Files it can use, "computer" → Check this AI / Check this computer); no "/command" shown; ≈ 1 ms a key; lazy groups searchcore + appsearch.
- ○ `node dev/appsearch-test.js` (unit), `dev/checks/appsearch.js` (chat group).
## ◧ Before / after in the Lab (round 37, abcompare, 25 upgrades: docs/upgrades/abcompare.md)
- ✓ After any change to the look (director edit, 🎲 variation, 🩺 fix, ✨ polish, 🎨 look match, a look, shuffle, slider session, undo): hold B = before, tap B = split view (drag the line, double-click swaps), a chip "Before: Claude's edit · 2 min ago" with ⟲ Keep before (= undo to it) / ✓ Keep now; right-click › View › ◧ Before / after, Lab search, the keys sheet. `/before-after`.
- ✓ One renderer: values / palette show live on the preview itself, code changes as the preview's own picture of before; a still scene keeps not drawing; gestures remake the before side.
- ○ `dev/checks/abcompare.js` (lab group, fake engines) and `node dev/abcompare-test.js` (unit).
## ⛶ Big screen (round 38, bigscreen, 24 upgrades: docs/upgrades/bigscreen.md)
- ✓ ⛶ Full screen in the rail (under ☰), Ctrl/⌘+K, `/fullscreen`, plus F11 / ⌃⌘F / the green button; remembered per screen (the big monitor full screen, the laptop windowed); Esc never leaves it; a hint the first time; the chats list peeks in from the rail when hidden in full screen.
- ✓ Size of everything (Appearance: Auto · 100 · 125 · 150 · 175 · 200) per screen; Auto from the screen's size (a 4K at 100 % → 150 %), set before the first frame; Ctrl/⌘ + / − / 0 per screen; the Lab crisp at every size and quicker to lighten a huge preview.
- ○ `node dev/bigscreen-test.js` (unit), `sh dev/run-checks.sh bigscreen` (4K at 100 % and 200 %, ultrawide, pictures in /tmp/hearth-bigscreen); real Mac / Windows full screen untested here.
## 🧹 Tidy memory (round 38, memorytidy, 20 upgrades: docs/upgrades/memorytidy.md)
- ✓ ⋯ AI setup → Memory → Tidy memory…: a before / after list (merge facts said twice, the newest fact replaces what it contradicts, shorter wording, Lab facts to a Lab scope only the Three Directors read, stale ones dropped), sure changes ticked, Apply, one Undo; ✦ Smarter tidy (lightest model, cost shown first); `/tidy-memory`.
- ✓ `<remember>` replaces the fact it repeats or contradicts instead of appending (the chat's frozen prompt stays byte-stable); one quiet line in the Memory fold past ≈ 800 tokens.
- ○ `node dev/memorytidy-test.js` (unit), `sh dev/run-checks.sh memorytidy` (fake engines).
## ♪ Move with the music (round 38, beatlink, 31 upgrades: docs/upgrades/beatlink.md)
- ✓ Right-click any Lab slider (or its ♪) › ♪ Move with the music…: what drives it (beat, bar, kick, snare, hi-hats, bass, mids, highs, vocals, drums, loudness), how (pulse, follow, step, random), the range as two handles on the slider / around the knob, a live meter; ♪ badge; one undo per change; `/move-with`, right-click the preview › ♪ Music, Ctrl/⌘+K, Lab search / Find anything ("pulse on kick").
- ✓ The same music link as before with a "how" and a range: saved with the scene, templates and packs; computed from the song's time, so renders / exports / the Lab sequence match the preview frame for frame; live sound too.
- ○ `node dev/beatlink-test.js` (unit), `sh dev/run-checks.sh beatlink` (fixture song, playback, two renders, live loopback stub, undo, save / reload); not yet on the owner's real songs.
## 🧭 Smart learns from you (round 39, routerlearn, 18 upgrades: docs/upgrades/routerlearn.md)
- ✓ Smart (⋯ AI setup → How hard it thinks) learns per AI and kind of message from what you already do: "think harder" / a stronger model right after, "that's wrong / try again", early stops, fixing the Lab right after the director (wanted more); keeping going (fine); choosing a lighter model (lighter). Local, no tokens, the prompt unchanged.
- ✓ Careful rules: a change test before a step up, one rung at most (top: the chat's own model at xhigh), lighter rungs only after a long clean run and on trial, 45-day locks; a big chat never steps down and a learned step up says it re-reads the chat once. One calm line the first time; "Smart has learned: code fixes → Deepest ✕" in AI setup; `/route learned | forget`.
- ○ `node dev/routerlearn-test.js` (rules + a 6-week simulation: a picky owner's bad answers −51 %, an over-served owner's cost −21 %), `sh dev/run-checks.sh routerlearn` (fake engines).
## 📜 Recipes (round 39, labrecipes, 36 upgrades: docs/upgrades/labrecipes.md)
- ✓ ✦ More › 📜 Recipes › ● Record a recipe (also the toolbar's ⋯, Lab search, ⌘/Ctrl+K): a red chip counts the steps (effects / filters with their settings, looks, palettes, presets, slider moves and ♪ links by name or role, frame size, All formats picks, ✨ polish, 🎨 look match, gallery layers, export settings); ■ Stop names it → data/recipes/ (synced).
- ✓ Use a recipe…: its steps with what fits this scene and what's skipped (with why); ▶ Use = one undo step (◧ names it); edit (↑ ↓ ✕, rename), several scenes at once, ⇪ pack (kind recipe), delete to the Trash; `/recipe` for the director via three_do run.
- ○ `node dev/labrecipes-test.js` (unit), `sh dev/run-checks.sh labrecipes`; not yet on the owner's real scenes.
## 🎥 Camera moves (round 40, labcamera, 35 upgrades: docs/upgrades/labcamera.md)
- ✓ Right-click the preview › ✨ Look & motion › 🎥 Camera moves: push in, pull out, orbit left / right ¼ ½ full, dolly zoom, crane up / down, handheld shake, whip pan, slow drift, punch-in on each kick / beat / bar, from this view to that view (look around, set start and end); on scenes with a 3D camera only, as an offset on the scene's own camera.
- ✓ Cyan bars under the waveform (drag ends, beat snap; right-click the waveform › from here), 🎥 Your moves… (6 easings, intensity, remove); one undo per change; saved with the scene / templates / packs; renders and the Lab sequence match the preview; a 📜 recipe step; Lab search, ⌘/Ctrl+K, `/camera-moves`.
- ○ `node dev/labcamera-test.js` (unit), `sh dev/run-checks.sh labcamera`; not yet on a real Mac / PC GPU.
## ♿ Keyboard and screen readers (round 40, a11y, 24 upgrades: docs/upgrades/a11y.md)
- ✓ The whole app works from the keyboard: "Skip to the chat" as the first Tab stop, a focus ring on every control in all 31 looks, Esc closes the top-most thing and focus returns to what opened it (AI setup, missions, Find anything, menus, the Lab's pickers, dialogs), menus get a real focus with the arrow keys, the chats list is one Tab stop with ↑ / ↓. The keys sheet lists these under "Keyboard".
- ✓ VoiceOver / Narrator: icon-only buttons are named from their tooltips (138 unnamed → 0), Find anything is a combobox and listbox, Lab knobs are sliders and On/Off pills are switches, and finished replies, toasts and tips are read out once and politely. Light-look contrast is fixed, and Windows High Contrast (forced colors) and `prefers-contrast: more` are supported.
- ○ `sh dev/run-checks.sh a11y` (dev/checks/a11y.js: 290 problems before → 0). Forced colors and reduced motion are emulated; not yet tried with a real screen reader.
## ⚡ First screen (round 40, firstscreen, 5 upgrades: docs/upgrades/firstscreen.md)
- ✓ The first picture ≈ 10 % sooner (cold start and reload): light / dark set before the window instead of re-theming it during the start (main-process IPC work in the first 5 s 88 → 38 ms); ten files the first screen doesn't need load right after it (82 → 72 scripts, −253 KB); feature loads wait until the first frame is on screen.
- ○ Budgets: `node dev/boot-test.js` (72 scripts / 2,350 KB JS / 29 sheets / 450 KB CSS), `dev/checks/fastboot.js` (stall guard 3 s); `dev/perf-report.js` reports the work before the first screen. Not measured on the owner's Mac.
## ✂ Slimmer tool lists (round 41, toolslim, 23 upgrades: docs/upgrades/toolslim.md)
- ✓ Shorter tool definitions everywhere, same abilities: plain Claude chats 571 → 483 tokens a message, the Three Director 2,829 → 2,554 a step (chat_ask + chat_progress + chat_do), board 785 → 479, screens 485 → 325, apps 455 → 231, Adobe 301 → 151; merged tools reach the hub by their old names; details via help.
- ✓ Opt-in sets (board, screens, Adobe, publishing, apps) sleep until needed: used this week, just switched on, or named in the message; sticky per chat session (cache-safe). toolwake.js, data/tool-wake.json.
- ○ `node dev/tokens-test.js --table` (wire + asleep columns), `sh dev/run-checks.sh toolslim`; not yet measured on the owner's real chats.
## 🔁 Keep going (round 41, routines, 28 upgrades: docs/upgrades/routines.md)
- ✓ A chat keeps improving its work by itself after each reply: for a time (30 min · 1 h · 3 h · until a time), a number of extra rounds, or until you stop it. From ◎ › More › 🔁 Keep going… (your message first), a reply's ⋯ › Reply › Keep going from here…, Ctrl/⌘+K, `/keepgoing`. Claude, Astra and the Lab director.
- ✓ Your words each round (remembered per chat), marked 🔁 with each round's cost; the header chip "🔁 3 of 5 · ≈ 42k tokens so far · ❚❚ ■"; pauses between rounds (1 min, idle 10 min, not written for an hour); you writing pauses it (or it goes on after a quiet time).
- ✓ A spending cap (required for long ones, from the weekly limit); stops on the same error twice, usage limits (or waits for the reset), "done / stuck" twice; never answers a permission card (pauses); continue lighter between rounds; awake only while a round runs; resume prompt after a restart; ◉ Activity and ⋯ AI setup (■ Stop).
- ○ `sh dev/run-checks.sh routines` (fake engines) + `node dev/routines-test.js`; not run against real engines.
## ↶ One undo for everything (round 41, undoall, 35 upgrades: docs/upgrades/undoall.md)
- ✓ Ctrl/⌘+Z outside text boxes / the Lab / the board undoes your last change (a setting, an AI's setup, a chat deleted / renamed / moved, Tidy memory, a recipe or template deleted, the newest AI change via Changes by AIs); Ctrl/⌘+Shift+Z redoes; toast "Undid: … · Redo"; Activity › Recent changes with ↶ / ↷; Find anything "undo"; `/undo-change`, `/redo-change`.
- ○ `node dev/undoall-test.js`, `sh dev/run-checks.sh undoall` (real key presses); ⌘Z not tried on a real Mac.
## 🗂 A fast chats list (round 42, chatlistfast, 8 upgrades: docs/upgrades/chatlistfast.md)
- ✓ With 3,000 chats: a redraw ≈ 14 → 3 ms, one chat changing redraws only its row (≈ 30 → 5 ms), a search letter's key handlers ≈ 45 → 1 ms (the list follows once per frame, narrowing the last matches), a long "Show more" list keeps only the rows near the screen (2,968 → 303 elements), wheeling through it ≈ 415 → 175 ms busy per second. Nothing looks different.
- ✓ Drag a chat onto a 📁 folder (onto its AI's name: out of the folder), Ctrl/⌘+Z puts it back; a rename in progress survives a reply arriving.
- ○ `sh dev/run-checks.sh chatlistfast` (dev/checks/chatlistfast.js on a made-up 3,000-chat history: dev/make-chatlist-fixture.js); not measured on the owner's real history.
## 👀 Files changed outside Hearth (round 42, filewatch, 32 upgrades: docs/upgrades/filewatch.md)
- ✓ One watcher service (filewatchmain.js; sync's folders use it too): one system watch per folder (FSEvents / ReadDirectoryChangesW, Linux recursive only for small trees), temp / swap / placeholder files ignored, a burst → one update, nothing running while idle, a slow check only when a watch fails; survives renames, unplugged disks and sleep / wake.
- ✓ Lab: a picture / video reference or the song saved again in another app is swapped into the preview in place (one quiet "↻ logo.png updated from disk"); renamed → followed; deleted → Find this file. AI changes edited outside Hearth say "changed outside Hearth since: not safely undoable"; a chat box's file saved again before sending is read again. `/watching`.
- ○ `node dev/filewatch-test.js` (simulated Mac / Windows plans + the service on real folders), `sh dev/run-checks.sh filewatch`; real FSEvents / Windows not tried here.
## ⧉ Make a batch (round 42, labbatch, 35 upgrades: docs/upgrades/labbatch.md)
- ✓ Right-click the preview › ⇪ Make & export › ⧉ Make a batch… (also the toolbar's ⋯, My templates' picker and cards, Lab search, ⌘/Ctrl+K): one of My templates (or this scene) → one video per row and format; rows from typed lines, a CSV / TSV naming the fields (Mac / Windows paths, relative to the CSV), every song or picture in a folder; a recipe on each; names like "{title} {format}".
- ✓ Stills of the first 4 before it starts; one render-queue row (cancel, pause, time left for the batch), kept awake; one folder + "Batch summary.csv"; `/batch` for the director via three_do run. Exported frames now wait for reference pictures.
- ○ `node dev/labbatch-test.js` (unit), `sh dev/run-checks.sh labbatch` (real ffmpeg); not yet on the owner's real songs / Mac.
## 🛟 Data safety everywhere (round 43, datasafe, 31 upgrades: docs/upgrades/datasafe.md)
- ✓ A read that failed is never "empty": every kv store, chats, memory, website history, usage, settings (config.json), sync's state, app keys and the undo log are read again when held, fall back to their copies, are merged (never written over) when saved after a failed read, and keep rotating copies (data/.history, data/kv/.history). Chats never vanish from the list; sync never reads a folder it couldn't list as "deleted".
- ✓ A calm card says what couldn't be read ("nothing was changed", Retry); 🛟 Recover… (Settings › Backups, Ctrl/⌘+K, /recover) brings back chats, memory lines, AIs / settings, tool data and Lab scenes from every copy, by merging.
- ○ `node dev/datasafe-test.js`, `node dev/datasafe-scan.js` (lint), `sh dev/run-checks.sh datasafe`; Windows locks / placeholders simulated, not yet on the owner's PC.
## ☰ Calm menus (round 43, menucalm, 31 upgrades: docs/upgrades/menucalm.md)
- ✓ The Lab picture's right-click 23 → 11 rows, most used first (Freeze, Frame size, Sliders, ♪ Music, Capture, View · ＋ Add, ✨ Look & motion, ⇪ Make & export, ✦ More); the toolbar ⋯ 17 → 11; Sketch ▾ shows all 9 rows (History ›, ⇪ Share & export ›); Board ▾ 20 → 12; the waveform's right-click 7 + More.
- ✓ Pointing opens a submenu inside a flyout too (#menu-fly2); one name and icon per action in every menu, no command names, one-sentence tooltips where a hint is cut; rows that mean nothing now stay hidden; nothing removed.
- ○ `sh dev/run-checks.sh menucalm` (dev/checks/menucalm.js: 17 menus, budgets, ≤ 2 clicks, nothing gone + the checks that read the moved rows).
## 💡 Answered by Hearth (round 45, localanswers, 20 upgrades: docs/upgrades/localanswers.md)
- ✓ A question about Hearth itself typed in a chat ("how do I make a 9:16 version?", "where's the spending limit?", "what changed today?") gets Hearth's own answer in a card above the chat box instead of an AI turn: Show me (the row lit, the Lab row run, the menu opened, the notes), Ask the AI anyway (sends it; that question stops triggering). 0 tokens.
- ✓ Never for the owner's work (code, scenes, writing, "can you…"), only Lab-UI questions in a director chat; ⋯ AI setup › Habits switch; `/hearth-answer`.
- ○ `node dev/localanswers-test.js` (40 / 40 Hearth questions, 0 / 40 work questions), `sh dev/run-checks.sh localanswers`; not yet tried on the owner's real questions.
## 🔔 Tell me when… (round 44, notify, 28 upgrades: docs/upgrades/notify.md)
- ✓ While you're in another app: the computer's own notifications (Hearth's name / icon) for a long reply (> ~20 s), a render / batch / All formats done or failed, a 🔁 Keep going round or its stop (and why), an AI waiting for your OK or answer, a waiting message sent (back online / usage limit reset), an update ready; each with its action (Open the chat · Show in Finder / Explorer · Allow… opens the card, never approves).
- ✓ One per chat (replaced, never stacked), a burst → one summary, Focus / Do Not Disturb kept; Settings › Advanced › Tell me when… (Replies · Renders · Keep going · When an AI needs me · Updates), Ctrl/⌘+K, /notify-when; Windows: the Start-menu shortcut carries the app id.
- ○ `sh dev/run-checks.sh notify` (recorder in place of the OS); not yet seen on the owner's Mac / PC.
