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
