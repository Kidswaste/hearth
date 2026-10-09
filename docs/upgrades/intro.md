# Video projects (round 8, "intro"): your Hearth intro for socials, end to end

You've been making a motion-design intro for Hearth for social media, jamming with the chats. Until now the pieces lived
apart: the mood board, the Lab and its jams, capture tours, the editor and its templates, the directors. A **video
project** puts them in one flow that Claude and Astra run and you steer with few choices:

**plan → vibe → scenes → captures → edit → review → render**

1. **`/intro`** (or ⋯ in the rail → **🎬 Make a video…**, or ⌘/Ctrl+Alt+I) proposes a plan in one card: the beats, the
   length, the formats (9:16 · 16:9 · 1:1). **▶ Make it** accepts it. **✦ Astra decides** lets Astra pick the details
   (template, hook, end words, titles, cuts) in one small question. `/intro a 15 s teaser for the board` guesses the
   template and the length from your words.
2. **Vibe**: the mood board linked to the chat gives the palette, light, motion and moods (never its footage): they pick
   the cuts, the titles, the grade and the colors when you didn't.
3. **Scenes**: for each Lab beat, Claude and Astra **jam** a Lab scene (Claude builds, Astra directs, the best round is
   kept), each its own sketch, from the beat's idea plus the vibe.
4. **Captures**: Hearth films itself. Each "Hearth on screen" beat runs a ready **tour recipe** (the chats, the Lab, the
   board, the editor, a jam…) that only looks, hovers and zooms; each Lab beat is recorded straight from the Lab at the
   main format.
5. **Edit**: one sequence in the video editor, built in one undo step: the captures on the main track, words on colored
   backdrops, titles in the chosen look, the cut style's transitions, the grade, glows and rings on the end card and the
   numbers, your song **cut on the bars**, a colored marker per beat. Optionally the **Video Director polishes it** with the
   editor and capture tools (for that run only).
6. **Review**: every beat is checked **frame-exact** (the source frame each layer shows is read back), black frames and
   titles outside the safe zones are flagged, a contact sheet is made, and Astra (or Claude) adds up to three notes as
   markers on the timeline.
7. **Render**: every format with ffmpeg (the main one as edited, the others reframed with a blurred fill so nothing is
   cut off), and a cover per format from the most striking frame.

Then **✂ 15 s + 6 s** makes the short cuts from the same captures (nothing filmed again) and **⤴ Post text** copies the
words for under the video. Every step is an undo point (right-click it › ↺), any beat can be redone alone (right-click
it › ↻ or R), and Claude and Astra take over each other's step (⇄). Projects are listed in one place
(`/video-projects`, `/intro list`) and reopen in any chat (`/intro open <name>`).

What it costs: planning, words, cuts on the music, covers, checks and the edit are local (no tokens). Model turns happen
only for the jams (as `/jam`), Astra's decisions and the review (one lean question each, the review with one small
contact sheet), and the director pass when you turn it on. The card shows each engine's tokens.

## The flow: one open entry, one plan, one click
1. **`/intro`**: a new video project, its plan proposed in a card in the chat you're in (nothing runs until you say so).
2. **`/intro <your words>`**: the template guessed from them (loop, speedrun, nodes, drop, question, week, teaser, changelog, launch, how-to, before / after, music, jam, board, numbers, trailer, countdown, tip, behind the scenes, bumper, hook, thanks, dev log, Lab only, screenshots, features, spotlight), the length too ("15 s", "6 second"), and the formats ("vertical", "16:9").
3. **`/intro` with nothing in a chat that has an unfinished project** brings that project's card back instead of starting another.
4. **🎬 Make a video…** in the rail's ⋯ menu: the one entry on screen, with submenus (Intro for Hearth, Go on with the last one, From a template ›, Your video projects ›, Film one Hearth moment ›, Cut-downs ›, How it works).
5. **⌘/Ctrl+Alt+I** opens the same menu from anywhere.
6. **Ctrl/⌘+K**: "Make a video…", "Video project: intro for Hearth", "Video projects: the list", "make the 15 s and 6 s cuts", "stop".
7. **The plan**: beats (each a kind, a length and its words), the total length, the formats, the title look, the cut style, the grade, the colors.
8. **The proposal line**: how many beats of each kind, the length, the formats, the titles and the cuts, the template's idea in one line, and the vibe it will use.
9. **▶ Make it**: accepts the plan and runs every step to the end.
10. **✦ Astra decides**: one lean question (no tools); Astra answers in up to five lines (template, hook, end words, titles, cuts) and the plan follows. Missing or failing Astra → Claude; neither → the plan stays.
11. **The plan keeps your changes** when a decision keeps the template (the beats keep their words and what they made).
12. **The board linked to the chat is the vibe** (or any board you pick; or none: Hearth's own Forgeheart colors).
13. **Reference ≠ footage**: the board's media never goes into the video; only its palette, light, color, motion and moods.
14. **The vibe picks what you didn't**: the cut style from its motion and pace, the titles from its light and saturation, the grade from its light and warmth, the backdrop from its darkest color, the accent from its most vivid one. A choice you made stays (it's locked).
15. **Scenes per Lab beat**: a jam (`/jam`) Claude ⇄ Astra on the beat's idea + the vibe (palette, moods, length, format), 2 rounds by default; each beat gets its own sketch, kept with the project.
16. **Scenes chain**: each jam starts from the Lab's open sketch, so the visuals of a video grow from one another.
17. **Quick scenes** (⋯ › Claude ⇄ Astra › Quick scenes, `/intro quick on`): the open sketch, no jam, no tokens.
18. **Jam rounds per scene** 1–4 (⋯ › Claude ⇄ Astra, `/intro rounds 3`).
19. **Captures of Lab beats**: the scene opened in the Lab at the main format and recorded from the Lab's own picture for the beat's length (plus a little for the transition), silent (the music comes in the edit).
20. **Captures of "Hearth on screen" beats**: the beat's tour recipe runs as a capture tour at the main format, padded with a wait so the take lasts the beat.
21. **Screenshot beats**: the area's screen opened, a clean screenshot cropped to the main format, played with a slow push.
22. **Word, number and end beats** need nothing filmed.
23. **A tour opens its screen before the recording starts**, so a take begins on what it films.
24. **A Lab take that comes out too short** (a busy machine whose encoder fell behind) is taken again once; then the scene's still with a slow push stands in, said on the card.
25. **The Lab comes back as it was** after a run (the sketch you had open, its frame size).
26. **The edit**: one sequence named after the project, built from the plan and the captures as one undo step in the video editor.
27. **Transitions keep the plan's timing**: each clip is made longer by the transition into the next, so every beat starts exactly where the plan says.
28. **Short takes still fill their beat** (they play a touch slower instead of leaving a gap).
29. **A take's first frames are skipped** (a tour settling).
30. **Fades**: the video fades in at the start and out at the end (a loop doesn't).
31. **Loops end where they start**: the "Loop for socials" template ends on a dissolve back into its first shot.
32. **Titles in the look**: the hook and the word / number beats in its hook style, words on footage in its caption style, the end card in its end style, each with its in animation and a fade out.
33. **End cards glow** (a glow in the accent color under the words) and **numbers pulse** (a ring).
34. **The grade** on every clip of the main track.
35. **Your song**: on its own audio track, its first beat at 0:00, faded out at the end.
36. **A marker per beat**, named after its kind and words, colored by kind (words gold, Lab violet, Hearth blue, screenshot green, number orange, end pink).
37. **The edit lasts the plan** (checked to 0.1 s).
38. **The review checks every beat frame-exact**: two frames per beat, and the source frame each layer really shows is compared with the one it should (requestVideoFrameCallback).
39. **Black frames are flagged** (a beat whose middle frame is black).
40. **Words fitted into the safe zone**: titles that reach into the apps' buttons or captions (every vertical app for 9:16, the profile grid for 4:5, YouTube's player for 16:9) get smaller and move toward the middle, one undo step, said on the card.
41. **Titles still outside the safe zone** are listed.
42. **A contact sheet** of one frame per beat, labelled with its time.
43. **Astra's review notes** (one lean question with the sheet; Claude if Astra is missing): up to three "m:ss | note" fixes, added to the timeline as markers with notes.
44. **No AI review** when you'd rather not spend tokens (⋯ › Claude ⇄ Astra › Review by › No AI review): the checks still run.
45. **Renders in every format**: the main format as edited, the others reframed from that render with a blurred fill in one quick ffmpeg pass (nothing drawn twice) (Reels / TikTok 1080×1920, YouTube 1920×1080, square 1080×1080, feed 1080×1350), in the project's own folder.
46. **Checked after rendering**: each file is read back with ffprobe (size, length, frame rate, sound).
47. **Covers**: the chosen frame as a PNG at the main format, and fitted (blurred fill) to every other format.
48. **No ffmpeg**: the main format is recorded in real time as WebM, said on the card.
49. **A toast and a notification when it's done** (with ▶ Open), and the chat's row lights up like a reply.

## The card (one per project, live, in the chat)
50. **One card per project** in the chat, updated live; the same project can show in several chats (all its cards update).
51. **Head**: 🎬 the name, the template and length, the formats (the main one lit), the state, Claude's and Astra's tokens.
52. **Live state**: the step, its progress, the beat being worked on (e.g. "◉ Captures 2/4 · beat 3").
53. **The seven steps as pills**: ✓ done, n/m with a progress line while running, ⚠ failed, ↻ stale (needs doing again after a change), ■ stopped.
54. **Click a step**: run from there to the end. **Alt+click**: only that step.
55. **Right-click a step**: run from / only it, ↺ undo it, ⇄ the other AI does it, open its result (the edit, the contact sheet, the outputs).
56. **The beats as a filmstrip**, each as wide as it is long, with its thumbnail (the jam's kept round, then the review's frame) or its kind's icon on its color.
57. **Hover a beat**: its number, kind, length, what it films, its words, the jam round kept, whether it's frame-exact, its error.
58. **Click a beat**: its detail row (↻ Redo · ✎ words · ⋯); **Shift+click**: go to it in the editor.
59. **The beat being worked on pulses** while the project runs.
60. **One primary action at a time**: ▶ Make it (a plan) → ■ (running) → ▶ Go on / Retry from <step> (stopped, failed or stale) → ✂ Open the edit · ⤴ Post text · ✂ 15 s + 6 s (done).
61. **Outputs as chips**: ▶ 9:16 · 10 s… click to play, drag into a chat or another app, right-click to open in Video Review, show in the folder, copy the path, attach to the chat, read its frames.
62. **The cover** as a small picture next to them.
63. **Notes** on the card: what was skipped or failed, the director's pass in one line, the review in one line (frame-exact count, black frames, safe zones, the AI's notes).
64. **The chat's context reads the card** as one short line (the project, its steps, its renders), so your next message to the agent knows where the video stands.
65. **The top edge flows Claude → accent → Astra** while it runs (still with reduced motion).
66. **The card takes the project's accent color** (from the board).
67. **A removed project's cards say so** (its files and sequence stay).

## Every step is an undo point; any beat again
68. **↺ Undo a step** (right-click it, ⋯ › Run › Undo a step, `/intro undo [step]`): the project goes back to before that step ran — the plan, the steps, the vibe, the review, the outputs and the edit (a sequence the step made is removed; an edit it changed goes back). Files it made stay in the captures / exports folders.
69. **Changes make later steps stale** instead of throwing them away (a new length restales the captures, new words only the edit…).
70. **↻ Redo this beat** (right-click it, R, `/intro redo <n>`): its scene (a new jam) and its capture, then the edit and the review; the render goes stale.
71. **◉ Capture it again** (same scene, a new take).
72. **■ Stop** (Esc, the card, `/intro stop`, the palette): stops the jam, the tour, the recording and the engines at once; the steps say where it stopped.
73. **▶ Go on from** the first step that isn't done.

## Beats, words and the plan, from menus
74. **Right-click a beat**: Redo, Capture again, Words ›, Length ›, Kind ›, What it films ›, Scene idea…, Open its sketch, Play its capture, Go to it in the editor, and behind More…: Move earlier / later, Duplicate, Add a beat after ›, Remove.
75. **Words ›**: suggestions from the app for that beat (its area's lines, the hooks for the first beat, the numbers, the taglines and calls to action for the end), your own words…, no words, Astra rewrites every line.
76. **✦ Astra rewrites every line** (`/intro words`): one lean question, "n | words" lines back, one undo point.
77. **Length ›**: ±0.5 s or 1–6 s (also + / − on a picked beat).
78. **Kind ›**: words, Lab scene, Hearth on screen, screenshot, number, end card.
79. **What it films ›**: every tour recipe, by area.
80. **Scene idea…** for a Lab beat (what its jam starts from).
81. **⋯ › Plan**: Astra decides, Template ›, Length ›, Formats › (toggle each, and which one is filmed), Titles ›, Cuts ›, Grade ›, Colors › (backdrop, accent; with the board's colors), Words › (Astra rewrites, Hook ›, Tagline ›, Call to action ›, the name on screen…), the plan as text.
82. **⋯ › Vibe and music**: Board › (every board, none, open the board), Music › (pick a song…, the Lab's song, none, Volume ›, Fade out at the end, Cuts on the music ›), the vibe as text.
83. **⋯ › Run**: Make it, From a step ›, Only one step ›, Capture frame rate › (24 / 30 / 60), Undo a step ›.
84. **⋯ › Claude ⇄ Astra**: who leads, Review by ›, Jam rounds ›, Quick scenes, Director pass after the edit, Director pass now, Capture tools for this chat, the task text.
85. **⋯ › Output**: Open the edit, Cut-downs ›, Cover ›, Make from the render › (a GIF, a boomerang, PNG frames), Captions (SRT), Post text ›, Render one format ›, Show the folder; More…: an EDL, Pin the cover on the board.
86. **⋯ › More…**: Status, Duplicate (try another take), Rename…, Your video projects…, Remove from the list.

## Claude ⇄ Astra on one video
87. **Who leads** (⋯ › Claude ⇄ Astra, `/intro handoff [claude|astra]`): the lead starts the jams, decides and does the director pass; the other one reviews.
88. **⇄ The other AI does a step** (right-click a step): Astra decides instead of Claude (or back), Claude reviews instead of Astra, Astra does the director pass, the other leads the scenes again.
89. **The task text**: every AI turn of a project carries a short state of it (≈ 150 tokens: the plan in one line, what's done, each beat's state, the vibe, the sequence, the review's notes), the video version of the brain's handoff; ⋯ › Claude ⇄ Astra › the task text copies it.
90. **Tokens per engine** on the card, from the jams, decisions, review and director pass.

## The Video Director knows and drives it
91. **The director pass** (⋯ › Director pass after the edit, or now; `/intro director [claude|astra]`): the Video Director reads the edit, looks at frames and makes up to four small improvements with the editor tools; its line shows on the card.
92. **Editor + capture tools only for that run**: the pass runs with the Video Director's editor tools plus the capture tools; nothing is added to any other message.
93. **Astra can do the pass**: an Astra chat gets the editor and capture tools for that one run (engines.js `asDirector: 'video'`).
94. **No Video Director yet**: it's made on the spot (as `/director-setup video`).
95. **A project shown in the Video Director's chat** turns that chat's capture tools on while it works on the video (and off when it's done; ⋯ › Capture tools for this chat).
96. **`video_edit { op: "project", action }`** for both engines, through the tool they already have (no new tool definitions): status, plan, task, beat (words, length, what it films, the scene idea), redo a beat, run a step, cover, cut-downs, a note on the card; `action: "help"` lists them.
97. **`video_edit { op: "help" }`** lists the project op.
98. **The app map** has a topic **intro** (also project, social, promo, teaser, beats…): what a video project is, its steps, its beats and how to drive it (`hearth_help intro`, `three_do help intro`).

## More from one project
99. **✂ The 15 s and the 6 s cut** (the card, ⋯ › Output › Cut-downs, `/cut-downs`, the palette): each a sequence of its own built from the same captures, keeping the hook, the end card and the most important beats, cut on the music when there is one, rendered in the main format (`/cut-downs 15 6 all`: every format).
100. **A loop cut-down** (`/cut-downs loop`): 6 s that end where they start.
101. **Covers by mode** (⋯ › Output › Cover, `/intro cover <mode>`), saved for every format.
102. **A GIF for chats, a boomerang, PNG frames for After Effects** from the main render (⋯ › Output › Make from the render, `/intro make gif|boomerang|frames`).
103. **Captions (SRT)** from the on-screen words (`/intro make srt`) and **an EDL** (`/intro make edl`).
104. **Pin the cover on the board** (`/intro make board`): your own picture, so it may go there.
105. **Post text for 6 platforms** (`/post-text <platform>` puts it in the chat box).
106. **Render one format again** (⋯ › Output, `/intro render 16:9`): the other renders stay.
107. **Duplicate a project** (`/intro duplicate`): the same plan and vibe, nothing made yet, to try another take.
108. **Film one Hearth moment** without a project (`/film <recipe> [format]`, entry menu › Film one Hearth moment ›).

## Your video projects, in one place
109. **`/video-projects`**: the list as a menu (show one in this chat, play its render, open its edit, remove it).
110. **`/intro list`**: the list in the chat, with each one's plan, state and renders.
111. **`/intro open <name>`**: a project's card in this chat (any chat).
112. **Remove from the list** (`/intro remove <name>`, ⋯ › More…): the recordings, renders and sequence stay.
113. **`/intro status`**: every step, the beats, the vibe, the music, the renders, the cut-downs, the last notes, the tokens.
114. **`/intro folder`**: the project's files.
115. **Stored in `data/kv/video-projects.json`** (the 60 latest), with each step's undo points (the 24 latest).

## Chat commands (area "Video project", `/help intro`)
116. `/intro [idea]` — a new video project (its plan in a card); aliases `/make-video`, `/video-project`.
117. `/intro go` — make it (every step).
118. `/intro decide` — Astra decides the details.
119. `/intro status` · `/intro plan` — where it stands · the plan as text.
120. `/intro template <id>` · `/intro templates` — another template · the list.
121. `/intro length <s>` — rescale the beats.
122. `/intro formats <9:16 16:9 1:1 4:5>` — the first is filmed.
123. `/intro board <name|none>` — the board whose vibe it uses.
124. `/intro music <file|lab|none>` · `/intro cuts <bars|beats|2bars|half|drop|free>` · `/intro volume <0–100>`.
125. `/intro titles <look>` · `/intro trans <style>` · `/intro grade <look>` · `/intro colors <#backdrop> [#accent]`.
126. `/intro beat <n> words|secs|kind|films|idea <value>`.
127. `/intro redo <beat> [capture]` — the beat again (its scene and capture, or only the capture).
128. `/intro run <step>` · `/intro from <step>` · `/intro undo [step]` · `/intro stop`.
129. `/intro handoff [claude|astra]` · `/intro director [claude|astra]`.
130. `/intro words` · `/intro copy [area]` — Astra rewrites the words · suggestions from the app.
131. `/intro cover <mode>` · `/intro cut-downs 15 6 [all]` · `/intro post <platform>` · `/intro render [format]` · `/intro review` · `/intro edit`.
132. `/intro make gif|boomerang|frames|srt|edl|board` · `/intro duplicate` · `/intro fps <24|30|60>` · `/intro rounds <1–4>` · `/intro quick on|off`.
133. `/intro list` · `/intro open <name>` · `/intro rename <name>` · `/intro remove <name>` · `/intro folder` · `/intro tours` · `/intro help`.
134. `/video-projects` — your video projects as a menu.
135. `/cut-downs [15 6] [all] [loop]` (alias `/cutdowns`) — the short cuts.
136. `/post-text [platform]` — the words for under the video, in the chat box.
137. `/film <recipe> [format]` — film one Hearth moment now.
138. **Completions** for every sub-command and its values (templates, formats, lengths, cut modes, covers, platforms, steps, boards, projects, beats, title looks, cut styles, grades, extras).
139. **`/intro help`**: how it works in six lines.

## Keys, right-clicks (all in the keys button under "Video project"; each also in a menu or a command)
140. **⌘/Ctrl+Alt+I** — Make a video…
141. **Esc** — stops a running video project.
142. **Right-click the card** — Plan ›, Vibe and music ›, Run ›, Claude ⇄ Astra ›, Output ›.
143. **Right-click a step** — run from / only it, ↺ undo, ⇄ the other AI.
144. **Alt+click a step** — only that step.
145. **Right-click a beat** — its menu.
146. **Shift+click a beat** — go to it in the editor.
147. **← / →** on the beats — the beat before / after.
148. **R** — redo the picked beat.
149. **W** — its words.
150. **+ / −** — half a second longer / shorter.
151. **Enter** — open the edit at that beat.
152. **Drag a render** — into a chat or another app.


## Beat templates (29)
Whole videos in one click: ⋯ › Plan › Template, the entry menu › From a template, `/intro template <id>`, or guessed from your words (`/intro a 15 s teaser`). Each line: beats, length, formats.

153. **Product intro** (`product-intro`, 20 s, 9:16 · 16:9 · 1:1): The app in 20 s: a hook, a Lab visual, the chats, the board, the editor, the end card. 7 beats: words, lab scene, hearth on screen, hearth on screen, hearth on screen, lab scene, end card.
154. **Feature tour** (`feature-tour`, 30 s, 16:9 · 9:16): One feature per beat, calm pace, a word under each. 8 beats: words, hearth on screen, hearth on screen, hearth on screen, hearth on screen, hearth on screen, hearth on screen, end card.
155. **Teaser** (`teaser`, 10 s, 9:16 · 1:1): Fast cuts, few words, the name at the end. 6 beats: lab scene, words, hearth on screen, lab scene, hearth on screen, end card.
156. **Changelog clip** (`changelog`, 15 s, 9:16 · 16:9): What's new this week: one beat per change, a number to open. 5 beats: a number, hearth on screen, hearth on screen, hearth on screen, end card.
157. **Loop for socials** (`loop`, 6 s, 9:16 · 1:1): A seamless 6 s loop: the end flows back into the start. 2 beats: lab scene, lab scene.
158. **Launch day** (`launch`, 15 s, 9:16 · 16:9 · 1:1): Countdown energy, the hook, three features, out now. 6 beats: words, lab scene, hearth on screen, hearth on screen, hearth on screen, end card.
159. **How-to** (`tutorial`, 30 s, 16:9): Step by step, a number per step. 6 beats: words, hearth on screen, hearth on screen, hearth on screen, hearth on screen, end card.
160. **Before / after** (`before-after`, 12 s, 9:16 · 1:1): The old way, then the Hearth way. 5 beats: words, screenshot, words, hearth on screen, end card.
161. **Kinetic words (nothing to film)** (`kinetic`, 8 s, 9:16 · 1:1 · 16:9): Only words on color: renders in seconds. 4 beats: words, words, words, end card.
162. **Music visual** (`music-visual`, 15 s, 9:16): Lab scenes cut on the bars of your song, the name at the end. 4 beats: lab scene, lab scene, lab scene, end card.
163. **Claude ⇄ Astra jam story** (`jam-story`, 20 s, 9:16 · 16:9): How two AIs make one visual: the jam card, the rounds, the result. 6 beats: words, hearth on screen, lab scene, lab scene, hearth on screen, end card.
164. **One feature spotlight** (`one-feature`, 8 s, 9:16 · 1:1): One thing, shown well. 3 beats: words, hearth on screen, end card.
165. **From mood board to video** (`board-to-video`, 15 s, 9:16 · 16:9): References in, a visual out: the vibe, never the footage. 5 beats: hearth on screen, hearth on screen, lab scene, hearth on screen, end card.
166. **Numbers** (`stat-hype`, 10 s, 9:16 · 1:1): Big numbers counted from the app itself. 5 beats: a number, a number, a number, a number, end card.
167. **Cinematic** (`cinematic`, 25 s, 16:9 · 9:16): Slow, wide, dark: a trailer for the app. 6 beats: lab scene, words, hearth on screen, hearth on screen, lab scene, end card.
168. **Countdown** (`countdown`, 8 s, 9:16): 3 · 2 · 1, then the name. 5 beats: words, words, words, lab scene, end card.
169. **Daily tip** (`daily-tip`, 12 s, 9:16): One tip: a hook, the move on screen, the command. 3 beats: words, hearth on screen, end card.
170. **Behind the scenes** (`behind-scenes`, 20 s, 9:16 · 16:9): How the video you're watching was made, in Hearth. 6 beats: words, hearth on screen, hearth on screen, hearth on screen, hearth on screen, end card.
171. **Bumper 6 s** (`bumper`, 6 s, 16:9 · 9:16 · 1:1): The shortest ad: one visual, the name. 2 beats: lab scene, end card.
172. **Shorts hook** (`shorts-hook`, 15 s, 9:16): A question in the first second, the answer on screen. 5 beats: words, hearth on screen, lab scene, hearth on screen, end card.
173. **Milestone / thanks** (`milestone`, 10 s, 9:16 · 1:1): A big number, a thank you. 3 beats: a number, lab scene, end card.
174. **Dev log** (`dev-log`, 20 s, 16:9 · 9:16): What I built this week, terminal style. 5 beats: words, hearth on screen, hearth on screen, hearth on screen, end card.
175. **Lab showcase** (`lab-showcase`, 15 s, 9:16 · 1:1): Only Lab visuals, a word each. 5 beats: lab scene, lab scene, lab scene, hearth on screen, end card.
176. **Screenshot carousel** (`carousel`, 12 s, 4:5 · 1:1): Stills of each screen with a slow push: nothing to record. 5 beats: words, screenshot, screenshot, screenshot, end card.
177. **Speedrun (everything in 10 s)** (`speedrun`, 10 s, 9:16 · 1:1): Every screen for a second: chats, Lab, board, editor, jam. 8 beats: words, hearth on screen, hearth on screen, hearth on screen, hearth on screen, hearth on screen, hearth on screen, end card.
178. **Code as nodes** (`nodes-story`, 12 s, 9:16 · 16:9): A visual, then the node graph behind it. 4 beats: lab scene, hearth on screen, lab scene, end card.
179. **On the drop** (`drop`, 8 s, 9:16): Calm until the drop of your song, then everything at once (cuts: drop). 3 beats: lab scene, lab scene, end card.
180. **Question → answer** (`question`, 12 s, 9:16 · 1:1): Ask what everyone wonders, answer on screen. 5 beats: words, hearth on screen, lab scene, hearth on screen, end card.
181. **Week in Hearth** (`week-recap`, 20 s, 9:16 · 16:9): What you made this week: the board, the jams, the edits. 6 beats: words, hearth on screen, hearth on screen, lab scene, hearth on screen, end card.

## Tour recipes: one Hearth moment each (28)
What a "Hearth on screen" beat films (⋯ on a beat › What it films, `/intro beat <n> films <id>`), or film one now: entry menu › Film one Hearth moment, `/film <id> [format]`. They only look, hover and zoom: a recording never changes your work.

182. **The chats** (`chats`, Chats, ≈3 s).
183. **Astra's chat** (`chats-astra`, Chats, ≈3 s).
184. **The chat box** (`chats-composer`, Chats, ≈3 s).
185. **The command bar** (`palette`, Commands, ≈3 s).
186. **The palette (Ctrl+K)** (`palette-k`, Commands, ≈3 s).
187. **The Lab** (`lab`, Lab, ≈3 s).
188. **A slow push on the Lab picture** (`lab-push`, Lab, ≈3 s).
189. **The frame sizes** (`lab-sizes`, Lab, ≈3 s).
190. **The sliders** (`lab-sliders`, Lab, ≈3 s).
191. **The music timeline** (`lab-timeline`, Lab, ≈3 s).
192. **The layers** (`lab-layers`, Lab, ≈3 s).
193. **The Lab in 3D** (`lab-tilt`, Lab, ≈3 s).
194. **The Three Director** (`director`, Lab, ≈3 s).
195. **Claude and Astra jamming** (`jam`, Jam, ≈4 s).
196. **The jam card** (`jam-card`, Jam, ≈4 s).
197. **The mood board** (`board`, Board, ≈3 s).
198. **The board's vibe** (`board-vibe`, Board, ≈3 s).
199. **Drifting over the board** (`board-drift`, Board, ≈3 s).
200. **The video editor** (`editor`, Editor, ≈3 s).
201. **The program monitor** (`editor-stage`, Editor, ≈3 s).
202. **The timeline, close** (`editor-timeline`, Editor, ≈3 s).
203. **Video Review** (`review`, Editor, ≈3 s).
204. **Hearth filming itself** (`capture`, Capture, ≈3 s).
205. **A cinematic sweep** (`capture-cinema`, Capture, ≈4 s).
206. **Hearth's looks** (`looks`, Looks, ≈3 s).
207. **The rail** (`rail`, Looks, ≈3 s).
208. **The token meter** (`meter`, Looks, ≈3 s).
209. **The whole window, wide** (`whole`, Looks, ≈3 s).

## Cut styles (14)
The transitions the edit puts on its cuts, in turn (⋯ › Plan › Cuts, `/intro trans <id>`; from the board's motion when nobody chooses).

210. **Calm: dissolves and dips** (`calm`): dissolve, slow-dissolve, dip-black, 0.5 s.
211. **Bold: pushes and zooms** (`bold`): push-left, zoom-in, push-up, 0.35 s.
212. **Hype: flashes and glitches** (`hype`): flash-white, glitch, zoom-cross, whip-right, 0.25 s.
213. **Forge: gold dips and ember leaks** (`forge`): dip-gold, gold-edge-wipe, leak-ember, 0.4 s.
214. **Clean: straight cuts** (`clean`): cut.
215. **Cinema: dips to black and light leaks** (`cinema`): dip-black, light-leak, film-burn, 0.6 s.
216. **Tech: RGB splits and pixels** (`tech`): rgb-split, pixelate, blocks, 0.3 s.
217. **Soft: blur dissolves** (`soft`): blur-dissolve, blur-push-left, blur-push-up, 0.45 s.
218. **Violet: AI-violet flashes and leaks** (`violet`): flash-violet, leak-violet, edge-wipe-violet, 0.3 s.
219. **Rainbow: every Hearth color in turn** (`rainbow`): flash-gold, flash-violet, flash-cyan, flash-pink, 0.25 s.
220. **Geometric: irises, clocks and diagonals** (`geometric`): iris-open, clock, diag-tr, 0.4 s.
221. **Kinetic: spins, squeezes and ripples** (`kinetic`): spin, squeeze-h, ripple, 0.3 s.
222. **Graphic: shutters, slices and checkers** (`graphic`): shutter, slices-left, checker, 0.35 s.
223. **Reveal: doors, covers and reveals** (`reveal`): doors-open-h, cover-left, reveal-up, 0.4 s.

## Title looks (20)
The hook, the words on beats and the end card (⋯ › Plan › Titles, `/intro titles <id>`; from the board's light and color when nobody chooses).

224. **Giant words** (`giant`): hook intro-giant + words-rise, words caption-tiktok + pop-words, end hook-end-card + fade-up.
225. **Forge gold** (`forge`): hook big-gold + letters-rise, words caption-gold + words-rise, end intro-ember + fade-up.
226. **Chrome** (`chrome`): hook intro-chrome + tracking-in, words glass + fade-up, end chrome + zoom-out.
227. **Neon** (`neon`): hook neon + neon-flicker, words neon-white + fade-up, end neon-violet + neon-on.
228. **Kinetic** (`kinetic`): hook kinetic + kinetic, words huge-white + words-drop, end huge-gold + stamp.
229. **Minimal** (`minimal`): hook thin + fade-slow, words subtitle + fade, end display + fade-up.
230. **Terminal mono** (`mono`): hook intro-mono-tag + typewriter, words mono + type-fast, end tech-green + type-cursor.
231. **Editorial serif** (`serif`): hook intro-serif-big + blur-in, words serif + fade-up, end quote-gold + fade-up.
232. **Social hook** (`hook`): hook hook-yellow + pop, words caption-yellow + pop-words, end hook-end-card + pop.
233. **Outline** (`outline`): hook intro-giant-outline + zoom-through, words outline-white + words-rise, end intro-stroke-fill + fade-up.
234. **AI violet** (`violet`): hook big-violet + letters-rise-blur, words caption-violet + words-rise, end intro-violet + fade-up.
235. **Ember** (`ember`): hook huge-ember + letters-rise, words caption-ember + words-slide, end intro-ember + zoom-out.
236. **Retro** (`retro`): hook retro + letters-wave, words caption-yellow + words-flip, end retro + stamp.
237. **Glitch** (`glitch`): hook intro-wide + glitch-letters, words outline-cyan + scramble, end neon-cyan + glitch-letters.
238. **Question hook** (`question`): hook hook-question + pop, words caption-white-box + pop-words, end hook-end-card + pop.
239. **POV** (`pov`): hook hook-pov + typewriter, words caption-tiktok + words-elastic, end hook-end-card + fade-up.
240. **Stickers** (`sticker`): hook sticker + heartbeat, words boxed-gold + pop, end sticker + stamp.
241. **Editorial left** (`editorial`): hook headline-left + unfold, words headline-left + fade-up, end display + box-reveal.
242. **Gold on black** (`gold-black`): hook gold-on-black + tracking-blur, words outline-gold + rise-slow, end gold-on-black + zoom-through.
243. **Tilted** (`tilted`): hook intro-tilted + spin-zoom, words neon-pink + neon-on, end big-ember + highlight.

## Grades (24)
A color grade on the whole edit (⋯ › Plan › Grade, `/intro grade <look>` takes any of the editor's looks; from the board's light / warmth when nobody chooses).

244. **forgeheart**.
245. **molten**.
246. **punchy**.
247. **clean**.
248. **cyberpunk**.
249. **synthwave**.
250. **teal-orange**.
251. **moody**.
252. **airy**.
253. **noir-cine**.
254. **vivid**.
255. **forge-ai**.
256. **forge-gold-dark**.
257. **forge-steel**.
258. **forge-rainbow**.
259. **mv-chrome**.
260. **golden-hour**.
261. **blue-hour**.
262. **anamorphic**.
263. **80s**.
264. **hologram**.
265. **ice-neon**.
266. **dream**.
267. **kodachrome**.

## Backdrops (8)
Behind the word beats (⋯ › Plan › Colors › Backdrop, which also lists the board's colors; `/intro colors #hex [#accent]`).

268. **dark** #0b0710.
269. **ember** #1a0a05.
270. **violet** #130b24.
271. **gold** #1c1404.
272. **light** #f4efe6.
273. **ink** #05070c.
274. **red** #1d0507.
275. **teal** #03161a.

## Cuts on the music (6)
With a song (`/intro music <file|lab>`, ⋯ › Vibe and music › Music), every cut lands on its grid (`/intro cuts <mode>`).

276. **Cuts on the bars** (`bars`).
277. **Cuts on the beats** (`beats`).
278. **Cuts every 2 bars** (`2bars`).
279. **Cuts on half bars** (`half`).
280. **The hook ends on the drop** (`drop`).
281. **Free (no snapping)** (`free`).

## Covers (6)
The thumbnail frame, saved as a PNG per format (⋯ › Output › Cover, `/intro cover <mode>`).

282. **The most striking frame (contrast, color, words)** (`best`).
283. **The hook's words** (`hook`).
284. **The most colorful Lab frame** (`lab`).
285. **The end card** (`end`).
286. **The middle of the video** (`middle`).
287. **The frame at the playhead** (`playhead`).

## Cut-downs (6)
Shorter versions from the same captures, nothing filmed again (✂ 15 s + 6 s in the card, ⋯ › Output › Cut-downs, `/cut-downs 15 6 [all]`, `/cut-downs loop`).

288. **30 s (feeds, YouTube)**.
289. **15 s (Reels, Stories)**.
290. **10 s (teaser)**.
291. **6 s (bumper ad)**.
292. **3 s (sting)**.
293. **6 s loop (ends where it starts)**.

## Words: hooks (22)
Suggested for the first beat (✎ on a beat, W, ⋯ › Plan › Words › Hook).

294. “Meet {name}.”
295. “One window. Two minds.”
296. “Your AI studio, in one window.”
297. “Claude and Astra, jamming for you.”
298. “Stop switching tabs.”
299. “What if your AIs worked together?”
300. “Made in {name}, by {name}.”
301. “Ideas in. Videos out.”
302. “Two AIs. One visual.”
303. “Your references become a vibe.”
304. “Every frame, exactly.”
305. “The app that films itself.”
306. “Talk. Shape. Cut. Post.”
307. “From a mood to a motion.”
308. “Built for people who make things.”
309. “POV: your AIs finally talk.”
310. “Tabs: 0. Ideas: all of them.”
311. “Describe it. Watch it build.”
312. “Made in one evening.”
313. “This intro edited itself.”
314. “Claude builds. Astra directs.”
315. “Your studio has two brains now.”

## Words: taglines (6) and calls to action (7)
For the end card (⋯ › Plan › Words).

316. Tagline “one window for your AI agents”.
317. Tagline “your AI studio”.
318. Tagline “Claude and Astra, together”.
319. Tagline “visuals, chats and cuts in one place”.
320. Tagline “where the AIs jam”.
321. Tagline “made for makers”.
322. Call to action “Try it tonight.”.
323. Call to action “Link in bio.”.
324. Call to action “Coming soon.”.
325. Call to action “Made in Hearth.”.
326. Call to action “Follow for more.”.
327. Call to action “Out now.”.
328. Call to action “Your turn.”.

## Words for each area of the app (40)
Lines that say what each part of Hearth does, offered on the beats that show it (✎ / W on a beat, `/intro copy <area>`).

329. chats: “Claude and Astra, side by side”.
330. chats: “Two AIs, one conversation”.
331. chats: “Ask once, get two minds”.
332. chats: “Every chat action is a /command”.
333. chats: “Hand a task from Claude to Astra”.
334. lab: “Visuals you shape with sliders”.
335. lab: “Three.js, without writing code”.
336. lab: “Save. Shuffle. Freeze.”.
337. lab: “Every social frame size”.
338. lab: “A new layer for every idea”.
339. board: “Collect references on the board”.
340. board: “Your references become a vibe”.
341. board: “A vibe, never a copy”.
342. board: “Pictures, clips and sites in one place”.
343. board: “Drag a reference into any chat”.
344. editor: “A frame-exact video editor”.
345. editor: “Titles, transitions, keyframes”.
346. editor: “Cut it frame by frame”.
347. editor: “One edit, every format”.
348. editor: “131 transitions, no plug-ins”.
349. capture: “Hearth films itself”.
350. capture: “Screenshots of any screen”.
351. capture: “Hands-free tours”.
352. capture: “Every frame read exactly”.
353. jam: “Claude builds, Astra directs”.
354. jam: “Two AIs jam on one visual”.
355. jam: “Every round is an undo point”.
356. jam: “The best round is kept”.
357. palette: “Everything one command away”.
358. palette: “Plain words work too”.
359. palette: “Ctrl+; over any tool”.
360. looks: “31 looks, chrome and glass”.
361. looks: “Bold Forgeheart colors”.
362. looks: “Make it yours”.
363. nodes: “Code you can see as nodes”.
364. nodes: “Wire it, don't write it”.
365. nodes: “Every layer, a graph”.
366. music: “Cut on the beat”.
367. music: “Tap the tempo, it follows”.
368. music: “Visuals that hear the drop”.

## Numbers counted from the app (10)
A "number" beat shows a real count from the running app (the commands, the editor's presets…); `/intro copy` lists them as lines.

369. **chat commands** (`commands`).
370. **transitions** (`transitions`).
371. **color grades** (`looks`).
372. **title styles** (`titles`).
373. **video templates** (`templates`).
374. **Lab effects** (`effects`).
375. **tour steps** (`tours`).
376. **social formats** (`formats`).
377. **AI agents** (`agents`).
378. **motion graphics** (`shapes`).

## Post text (6)
The words to paste under the video, from its plan (⤴ Post text, ⋯ › Output › Post text, `/post-text <platform>` puts it in the chat box).

379. **Instagram** (with 5 hashtags).
380. **TikTok** (with 5 hashtags).
381. **YouTube Shorts** (with 3 hashtags).
382. **X**.
383. **LinkedIn**.
384. **Threads**.

## Formats (4)
One edit, rendered for every platform; the first is the one filmed and edited, the others reframe it with a blurred fill so nothing is cut off (⋯ › Plan › Formats, `/intro formats …`).

385. **Vertical 9:16** 1080×1920: Reels · TikTok · Shorts · Stories.
386. **Wide 16:9** 1920×1080: YouTube · X · LinkedIn · your site.
387. **Square 1:1** 1080×1080: Feed posts everywhere.
388. **Portrait 4:5** 1080×1350: Instagram / Facebook feed.

## Kinds of beat (6)
⋯ on a beat › Kind, or › Add a beat after.

389. **Aa Words** (`title`): kinetic words on a color: nothing to film.
390. **✦ Lab scene** (`lab`): a Three.js scene Claude and Astra jam on, recorded from the Lab.
391. **▶ Hearth on screen** (`tour`): Hearth itself, filmed hands-free by a capture tour.
392. **▣ Screenshot** (`shot`): a still of Hearth with a slow push in.
393. **# A number** (`stat`): a big number counted from the app itself.
394. **★ End card** (`end`): the name, one line and a call to action.


**Total: 394 upgrades.**

## How it's built
- `intro-data.js` (`IntroData`, loads in Node): formats, kinds of beat, the beat templates, the tour recipes, the cut
  styles, title looks, grades and backdrops, the words (hooks, taglines, calls to action, lines per area, numbers, post
  text), and the pure math: `makePlan`, `retime`, `fitToMusic`, `cutDown`, `coverScore`, `vibeStyle`, `sceneIdea`,
  `planText`, `parseDecision` / `parseWords` / `parseNotes` (Astra's replies), `tourText`.
- `intro.js` (`Intro`): the projects (kv `video-projects`), the runner and its steps, undo points, the engine turns
  (a director turn like jam.js's, lean questions through `askOnce`), the edit built as data with `CutData` and
  committed as one undo step, the review (`VideoComp.frameImage` + its frame checks), the renders (`VideoCut.exportCut`
  for the main format, `VideoData.ffmpegArgs` + `Review.startJob` to reframe it for the others), covers
  (`Capture.socialCrop`), cut-downs, extras (`FrameRead.edit`, captions, EDL).
- `intro-card.js` (`IntroCard`): the card (a `{ role: 'intro', pid }` chat message drawn by one line in `native.js`
  messageEl), every menu of a project, the keys. `intro-cmds.js` (`IntroCmds`): the commands, the palette, the rail ⋯
  entry and the agents' op. `intro.css`: the card.
- Small hooks elsewhere: `index.html` (4 scripts, 1 stylesheet), `native.js` (one line: the card), `engines.js`
  (`asDirector: 'video'`: the editor + capture tools for one run), `tools/video-edit-tools.js` (`op: "project"` and its
  help line), `mcp/video-mcp.js` (the op's name in `video_edit`'s description, "intro" in `hearth_help`'s topics: a few
  tokens), `mcp/hearth-map.js` (the **intro** topic and its aliases), `dev/fake-common.js` (the fake engines answer the intro turns, and know the capture
  and board MCP servers).

## Tested
- `node dev/intro-test.js`: 934 checks — every template makes a valid plan at 4 lengths with every word filled,
  every transition / title style / animation / grade / shape / export preset it uses exists in the editor, cuts land
  on a 120 bpm song's bars / beats / drop, cut-downs keep the hook and the end card at 15 / 6 / 3 s, Astra's replies
  parse, covers prefer contrast and color and never pick black, a dark neon board and an airy one pick different
  styles, recipes only look (no clicks, commands or typing).
- `node dev/smoke.js --fake-engines --script dev/checks/intro.js` (after `sh dev/board-fixtures.sh` and
  `node dev/make-test-song.js /tmp/hearth-intro-song.wav 120 30`): the whole flow for real — a board with two pictures and a palette linked to the chat gives the plan its vibe; `/intro decide` (fake Astra) switches to Launch day with forge titles and bold cuts; 10 s, three formats, a 120 bpm song cut on half bars (cuts at 1, 3, 4, 6, 8, 10 s); ▶ Make it runs everything in ≈ 3.5 min: a 2-round Claude ⇄ Astra jam with real MCP builds, three capture tours filming the chats, the Lab and Video Review, the edit (6 clips, 7 titles / shapes, the song, a marker per beat), the Video Director's pass through the real MCP server (video_edit_read, the project op, dissolves on every cut, capture_list), 6/6 beats frame-exact, 6 titles fitted into the safe zone, Astra's two notes as markers, renders read back with ffprobe: 9:16 1080×1920 10.5 s, 16:9 1920×1080 10.52 s, 1:1 1080×1080 10.52 s, H.264 + AAC, a cover per format. I looked at frames of the renders: the words over the right screens, the dissolves, the blurred fill in 16:9 and 1:1, the end card's glow. 0 failures.
- `dev/checks/intro-more.js`: the template and length guessed from "a 6 second loop", every menu (card, plan, template, kind, length, words, formats, titles, step, beat, entry, ⌘/Ctrl+Alt+I), Astra's words, local suggestions and numbers, a quick run in three formats, ↺ undo render then edit (the fresh sequence removed), ▶ from Edit by clicking its pill, ↻ redo beat 2 (a new take, render stale), handoff and Claude taking over the review, the 6 s cut-down (1080×1920, 6.0 s), the cover on the end card in every format, post text, the agents' op (status, beat, note, help, a bad action), the list, reopening in Astra's chat, ←/→ on the beats, `/film lab-push 1:1` (1080×1080), Esc stopping a run, removing the project (files kept, cards say so), 0 duplicate commands. 0 failures.
- Still green after the hooks: `dev/checks/qa-commands.js` (865 commands, 0 duplicates), `dev/checks/jam.js` (all rounds, picks, keeps, Astra down, stop), `dev/checks/editor-mcp.js` (14/14), `node dev/editor-mcp-test.js`, `node dev/director-mcp-test.js`. `dev/checks/capture-record.js` couldn't start a screen capture on the shared, overloaded test machine ("Timeout starting video source", load ≈ 15 on 4 CPUs), with or without this stream's changes; capture.js is unchanged here.

## Notes
- Real Claude / Codex CLIs weren't available here: the flow ran with the fake engines making real MCP calls (the jams'
  builds in the Lab, the director's pass in the editor), the same way the jam and editor checks do.
- On the test machine (software WebGL, heavily loaded) recordings of a mostly still screen came out far shorter than
  asked (the browser's encoder fell behind): Lab takes there fell back to the scene's still with a push (said on the
  card), tour takes were retried and played slower to fill their beat. On a real Mac / PC GPU this shouldn't happen,
  but the fallbacks stay.
- The other formats are reframed from the main render with a blurred fill (nothing is cut off, the words stay inside);
  if you want a format laid out on its own (titles placed for 16:9), make it the main format (⋯ › Plan › Formats ›
  Main format) and run from Captures.
- Undo puts the project back; the files a step made stay in the captures / exports folders (nothing is deleted).
- Scenes jam on copies of the open sketch, like `/jam`: your sketches are never changed; the Lab's open sketch and
  frame size come back after a run.
