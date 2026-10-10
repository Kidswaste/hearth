# Commands page (round 11): every command, explained, with a preview, run one question at a time

You said, after trying the Flows node view: "I don't really get the nodes instead of commands thing. Maybe what I need
is a brand new Command section with a list of every command/node, and we go input by input: this task needs THIS from
me, this next task is optional, this task can be skipped, this task needs a yes or a no, ok, how many times do we want
this to happen, ok, etc. This menu would also contain all the current / commands, a definition of what they do and a
little preview video animation." Then: "show the videos as hover when I pass my mouse over the command, and if I click
it first open the example in a bigger window before committing to launching the command".

What changed:
- **☰ Commands** is a page in the rail (and Ctrl/⌘+Shift+F, `/commands`, "/" → ☰ Every command, step by step…). It
  replaces the node canvas as the way into flows; the node view is still there as the advanced one (⋯ → Node view,
  `/flows nodes`).
- **Left: every command** (≈ 935): the principal ones first, then the flows as step lists, then every area. Search in
  plain words. Each row: the name, one clear sentence, its area, a preview that **plays while you point at it** (a still
  picture otherwise; the principal commands play a real recording of Hearth doing it).
- **Click a command: its example, big**, nothing runs: the preview, what it does, when to use it, what it will ask you.
  **▶ Use this command** (or Enter again) starts it.
- **Then one question at a time**: "This needs: …" (marked Needed), "Optional: …" (Skip), yes or no, how many, which
  value (the command's own suggestions as big buttons), "How many times?" (once, 2, 3, 5 times, or every 30 s / 5 min),
  "Then…" (another command, which can use this one's result), a summary of what will happen, **▶ Run**.
- A run is a Flows run: kept on disk, "step 2 of 4", what's done, ↻ Pick up here after a restart, ↻ Again, ✎ Refine,
  change an answer, and the same live card in the chat.

Token frugality: nothing is added to any prompt. The questions are made from what each command already says about
itself (its argument line, its suggestions, its examples) plus a small data file; the AI is only asked when you
Refine. The app map gained one line for `/commands <name>` (read on demand).

Counted honestly: one line per thing you can see or use. Scenes and clips are listed one per line (each is its own
animation or recording you see on the page).

## Opening it
1. **☰ Commands** in the rail: a page of its own (right-click the rail button to move or hide it, like any tool).
2. **Ctrl/⌘+Shift+F** opens it from anywhere, and again goes back where you were (it used to open the Flows node view).
3. `/commands [command | flow | words]`: the page, on that command's example (`/commands size`), a flow, or a search. Chats can run it too.
4. The "/" menu: **☰ Every command, step by step…** under Flows, at the top of ⇢ Flows ›, and in "Every command ›".
5. Ctrl/⌘+K: "Commands: every command, step by step".
6. `/flows` opens the page on the flows, `/flows doctor` on Doctor's steps, `/flows runs` on the latest run.
7. A flow card in a chat: **Open ›** opens its run on the page (one question at a time).
8. Starting a flow from "/" → ⇢ Flows › opens it on the page.
9. The node view stays: ⋯ → **Node view (advanced)** on a run or a flow, `/flows nodes [flow]`, and the card's right-click.
10. The page remembers where you came from: commands you run act there (the Lab's `/look` in the Lab).

## The list (left)
11. **Every command** (≈ 935, hidden ones included), each once by area with its count ("Three.js Lab · 161").
12. **Principal** first: the "/" menu's commands, in gold.
13. **Step lists (flows)**: Doctor, Make a video, Record, Lab scene, Sequence, Board, Export, Astra & Claude, Look, Memory, and yours.
14. **Going now**: runs waiting for you, hung or running, one click to continue.
15. **★ Pinned** and **Recent** sections when you have some.
16. **Search in plain words**: "make it vertical" → /size, "record" → /record, /rec…; names, aliases, the clear sentences, keywords and the plain-language search of the command bar.
17. Each row: the name, **one clear sentence**, the area.
18. Each row: a **still picture of its preview** (drawn only for the rows you scroll to).
19. **Point at a row: its preview plays**; it stops when you leave.
20. Principal commands **play their recorded clip** on hover (and drop it when you leave).
21. Keys: ↑ / ↓ move, **Enter = the example**, typing a letter jumps to the search, Esc clears it.
22. Right-click a command: ▶ Use it, its example, Run it now as is (when it needs nothing), ☆ Pin to the top, copy its name, put it in the chat box, put it in / take it out of the "/" menu, where it lives (More…).
23. Right-click a flow: ▶ Start, its steps, the node view.
24. Right-click a run: Again, Refine, Pick up here, change an answer, the node view, copy where it is, Stop.

## The example (right, after a click)
25. **A click opens the example, big; nothing runs.**
26. The big preview plays while the page is on screen (the recorded clip for principal commands) and pauses when you leave.
27. The clear sentence, then **What it does / When to use it** for the principal commands.
28. **"It will ask you"**: every question with Needed / optional / yes-no and its choices.
29. Commands that change with the place say so ("in the Lab: …", "in Video Review: …").
30. "Typed in a chat:" its examples.
31. **▶ Use this command** has the focus: **Enter again starts it** (a second Enter, never the first).
32. ⋯: the same menu as the right-click.
33. A flow's example: its steps (choice, your words, runs, AI, wait, result), its last runs, ▶ Start.

## One question at a time
34. **This needs: …**: a needed input is marked Needed and can't be skipped.
35. **Optional: …** with a **Skip** button.
36. **Yes or no**: on / off arguments and flags (`[copy]`, `[hq]`, `[--raw]`) become Yes / No.
37. **How many?**: numbers get ready buttons (1, 2, 3, 5, 10; seconds, BPM, degrees, ranges like 0.5–4 with their ends).
38. **Pick one**: a list of values as big buttons; when the command takes more, **Something else (type it)**.
39. **Forms**: commands with several forms ask which one first, then only that form's inputs (`/look save` → "a name").
40. A word before a value is written for you (`[seed N]` → "seed 7" only when you answer).
41. **The command's own suggestions as big buttons** (every look for `/theme`, every slider for `/slider`…).
42. Its examples as buttons ("9:16", "colors subtle"…).
43. A box to type in, with Enter = OK.
44. Questions asking for a command list matching commands as you type.
45. **How many times?**: Once, 2, 3, 5 times (the existing `/repeat`).
46. **Every 30 seconds / every 5 minutes** for the commands where it makes sense (`/shuffle`, `/still`, `/backup`…; the existing `/every` timers, stopped from `/timers`).
47. **Then…**: chain another command (up to 4 in a run): its questions follow.
48. **↳ the result of the step before**: a chained command can take what the one before printed.
49. **Ready? This is what will happen**: the command lines in order, ×N / every N, which one uses the result before; **▶ Run** or Not now (nothing runs).
50. **▶ Run goes back where you were** so the commands act there and you see them.
51. **Step N of M** and a progress bar.
52. **What's done**: every answer so far and the commands that ran.
53. Click a done answer to **change it**: a new run asks it again (the first run keeps its history).
54. Keys **1…9** pick an answer, Esc goes back to the example.
55. While it runs: the step and the exact line it runs.
56. **The result**, with **↻ Again** (same answers, a new run), **✎ Refine…** (say what to change) and **Change an answer ›**.
57. A step that hung or a stopped run: **↻ Pick up here**.
58. **Runs survive a restart** (Flows' run model): a run left halfway is under Going now and continues where it was.
59. **The same live card in the chat** as a flow (answers, Pick up here, Again, Refine from the chat).
60. Flows' journeys run on the page too, one step at a time, with Hearth's guess outlined.
61. "Which command next?" refuses a name that isn't a command and says so.

## Clear definitions
62. **195 commands** get one clear sentence on the page (the most used ones; `/help` and chats keep the full text).
63. **40 principal commands** get "What it does / When to use it".
64. **71 commands** ask hand-written questions where the argument line says too little ("Which frame size?", "What should it record?", "How often?"…).

## Previews: a little animation for every command
Every command gets one of these scenes, in its area's color, with its icon and its first value as a label, varied
by the command's name so neighbours don't look alike. They move only while they play (pointed at, or the big
example on screen), with transform / opacity only (no layout, no repaint of the page); reduced motion keeps them still.
65. Frame: a frame morphing to 9:16 (sizes, crops, stills).
66. Record: a REC dot and a growing timeline.
67. Shot: corners closing on the picture and a flash.
68. Freeze: a moving strip that stops, a pause mark.
69. Beat: a thump and four beat lights (tap, BPM, kicks, triggers).
70. Sliders: three knobs sliding (shuffle, sliders, morph).
71. Grid: cards snapping into a grid (board layouts, arrange).
72. Board: floating reference cards.
73. Timeline: clips on a track, a playhead sweeping (editor, cuts, sequence).
74. Frames: a film strip stepping frame by frame.
75. Play: a play mark pulsing in a growing frame (present, fullscreen).
76. Layers: stacked planes lifting (layers, effects, blends).
77. Palette: swatches breathing (looks, themes, colors).
78. Motion: letters typing on (kinetic type, titles, camera moves).
79. Nodes: a dot travelling along wires (nodes, flows).
80. Duo: two bubbles taking turns (Claude and Astra together).
81. Meter: bars rising (tokens, usage, budgets).
82. Timer: a clock hand turning (every, after, at).
83. Undo: an arrow turning back.
84. Save: an arrow dropping into a tray (save, export, render, backup).
85. Search: a magnifier scanning lines (help, find, status, lists).
86. Doc: lines writing themselves (notes, prompts, memory, summaries).
87. Gear: a turning gear (settings, engines, models).
88. Forge: sparks off an anvil (Forge Debug).
89. Chat: a bubble typing (everything else in a chat).

## Real clips of Hearth doing it
Recorded by Hearth itself with the capture tours (`dev/make-command-clips.js`), ≈ 3–4 s, small MP4s in
`assets/cmd-clips/`. A command without a clip (or one that can't play) shows its animation instead.
They were recorded on the headless test machine (software GPU, a slow recorder), so several are quiet or short;
`node dev/make-command-clips.js` on your Mac remakes them richer.
90. Clip: `/astra`, sends a message to Astra (ChatGPT) without leaving where you are.
91. Clip: `/board`, opens the mood board (or switches to a board by name).
92. Clip: `/board-use`, attaches the board's vibe to your next message so the chat uses it as a mood, never as footage.
93. Clip: `/capture`, opens the capture menu: screenshots, recordings, tours and the frame reader.
94. Clip: `/claude`, sends a message to Claude without leaving where you are.
95. Clip: `/commands`, opens this page: every command explained and run input by input.
96. Clip: `/compact`, folds the chat so far into a short summary so later messages cost fewer tokens; every message stays readable.
97. Clip: `/copy`, copies the last reply (or its code, a message, your messages or the whole chat) to the clipboard.
98. Clip: `/decide`, lets Astra pick for you (a look, an effect, a palette, the frame size, the app look), with Undo.
99. Clip: `/do`, runs any action from the Ctrl/⌘+K palette by its name.
100. Clip: `/doctor`, checks Claude Code and Codex in one card and offers one-click fixes.
101. Clip: `/editor`, opens the video editor on the open video (or a new edit).
102. Clip: `/flow`, starts a flow (a list of steps) in this chat.
103. Clip: `/flows`, opens the Commands page on the flows: step lists like Doctor, Make a video, Record.
104. Clip: `/freeze`, freezes the picture while the music plays on; again to unfreeze.
105. Clip: `/handoff`, hands this chat to the other agent with a short summary so it carries on.
106. Clip: `/help`, shows every command, searchable, with examples and keys.
107. Clip: `/intro`, plans and builds a motion-design video for socials with the chats, step by step.
108. Clip: `/jam`, claude and Astra take turns building a music visual in the Lab; you keep the best round.
109. Clip: `/new`, starts a fresh chat with this agent, and sends your first message if you give one.
110. Clip: `/opinion`, asks the other agent for a second opinion on the last reply.
111. Clip: `/present`, shows the preview alone, fullscreen (Esc leaves).
112. Clip: `/read`, reads a reply aloud with the computer's voice.
113. Clip: `/rec`, records Hearth itself (the window, a tool, a region), with or without sound.
114. Clip: `/retry`, writes the last reply again, optionally with another model.
115. Clip: `/save-sliders`, writes the selected layer's slider values into its code (Ctrl/⌘+S).
116. Clip: `/screenshot`, puts a picture of the window (or the Lab) into your message.
117. Clip: `/sequence`, shows the Lab sequence: a video timeline of your scenes, footage, titles and the song.
118. Clip: `/settings`, opens Settings.
119. Clip: `/shuffle`, gives the sliders new random values: all of them or a group, gently or wildly.
120. Clip: `/size`, sets the Lab picture to an exact social frame size (9:16, 16:9, 4:5, 1:1) or fits it.
121. Clip: `/stop`, stops the reply that is being written right now.
122. Clip: `/theme`, switches the app's look (Forgeheart, Classic, Chrome Forge, Molten…).
123. Clip: `/undo`, takes back the last thing you did here: a chat action, an edit in the video editor, a move on the board.
124. Clip: `/usage`, opens the token and usage dashboard.
125. A clip that is missing or can't play falls back to the command's animation (`/tap`, `/live`, `/sketches`, `/scene`, `/look`, `/still` have none yet: their takes were too short on the headless test machine; `node dev/make-command-clips.js tap live sketches scene look still` on your Mac records them).
126. Clips load only when they play (pointed at, or the big example) and pause when you leave; 35 clips weigh 0.60 MB.

## Fixes and behaviour changes
- `/commands` used to be another name for `/help`; it now opens this page (`/help` and `/?` are unchanged).
- Ctrl/⌘+Shift+F and "Open ›" on a flow card now open the Commands page; the node view is one click further (⋯ → Node view, `/flows nodes`).
- Not counted: the engine hooks, tests and the clip maker below.

**Count: 126 upgrades** (one numbered line each).

## For development (not counted)
- `cmdpage-core.js` (`CmdPageCore`, no DOM, Node-testable): `questionsFor(def, meta)` (args string → questions:
  `<x>` needed, `[x]` optional, `on|off` and flags → yes / no, numbers → how many, `a|b|c` → pick one, `…` → type one
  too, top-level `x | y <z>` → forms with follow-ups, `</command>` → a command, more than 3 optional inputs → one
  "anything else" box; examples and `complete()` as suggestions; explicit `Q` wins), `checkQuestions`, `buildFlow(stages)`
  (question nodes carry `q` metadata; "Then…" → `sN pick` regrows the flow; summary; actions with `{id|prefix}` vars and
  `refill`), `fillLine`, `planLines`, `progress`.
- `flows.js` gained two optional hooks (additive): `lineOf(node, run)` (an action's command line) and
  `grow(run, node, value)` (rebuild `run.flow` before an answer applies; it may refuse the answer).
- `cmdpage-data.js` (`CmdPageData`): `DESC`, `ABOUT`, `Q`, `SCENES`, `previewOf`. `cmdpage-previews.js` (`CmdPreviews`):
  `svg(def)`, `mount(host, def, { clip })` → `{ play(on) }`. `cmdpage-clips.js` (`CmdClips`): written by
  `dev/make-command-clips.js`. `cmdpage.js` (`CmdPage`): `open(name)`, `toggle()`, `openRun(id)`, `start(name)`,
  `showExample(name)`, `questionsOf(def)`; a Tools page (`tool:commands`). `cmdpage.css`.
- Tests: `node dev/cmdpage-test.js` (every command in `dev/fixtures/commands-registry.json` gets a valid question list
  and flow; needed / optional / yes-no / how many / forms / commands; a run on the real flow engine: skip, no, 2 times,
  a chained command, a refused name, a feed from the result before, the summary, again, a changed chained command;
  Not now; type-it), `dev/checks/commands-page.js` (open from the rail, plain-word search, hover plays and stops, click =
  example and nothing runs, Enter twice, `/still` from the Lab input by input with skip / no / ×2 / then `/calc` / Run,
  a chain fed by the result, persist + restore and pick up, Again, change an answer, `/commands <name>`, Ctrl+Shift+F,
  the "/" row, keys, the node view), `dev/checks/commands-page-previews.js` (a few hundred previews, every scene kind,
  transform / opacity only, posters only in view, every clip plays, a broken clip falls back, a wall picture).
  `sh dev/run-checks.sh commands` runs the three. `dev/make-command-clips.js [names]` remakes the clips.
