# Agent Hub feature pack (October 2026)

125 features. Status: **✓** = tested end to end in the running app · **○** = built and code-checked, but not exercised live
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