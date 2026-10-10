# Apps (round 14): your services and 40+ AI apps in their own windows, Meshy 3D models from chat, Suno prompts from your scene, Discover

You asked for "a bunch of app integrations with their own windows that could help me", Meshy and Suno first (you're
subscribed to both). Now every service you use opens in **its own window** with a slim bar on top (back, reload,
open in your browser, send this page to the chat, downloads), signed in on the service's own page: Hearth never sees
a password. What you download there lands in **Downloads/Hearth/<App>** and goes where it fits with one click: a
3D model becomes a Lab layer, a sky lights the Lab, a song becomes the Lab's song, a clip opens in Video Review, a
picture goes on the board. **Meshy** also works straight from chat (`/meshy a chrome dragon skull`): Hearth shows
what it will cost and asks you first, every time. **Suno** gets a prompt written from your scene's vibe, typed into
its boxes for you.

Where it is (no new row of buttons): the rail's **⋯ → Apps**, **⌘/Ctrl+K** ("App: Figma"…), the Lab's **🧰 Tools**
drawer, and `/apps` in any chat. Every app is drivable by chat command.

Counted honestly: one line per thing you can see or use.

## The Apps entry
1. **Apps in the rail's ⋯ menu**: one entry for every app, no new button on screen.
2. **The Apps menu**: the apps you opened lately first, then by kind (3D, Sound, Make, Design, Assets, Social) in submenus; type to filter.
3. **⌘/Ctrl+K**: "Apps: open an app" and one "App: <name>" line per app.
4. **The Lab's 🧰 Tools drawer** lists Apps (free skies and models, Meshy) next to "Open a 3D model".
5. `/apps` opens the menu; `/apps list` says what each app does and which are open.
6. `/apps <app>` opens one (`/apps figma`); names are forgiving (`/apps poly`, `/apps google fonts`).
7. `/apps <app> <action>` runs one of its actions (`/apps coolors palette`).
8. `/apps <app> reload | back | forward | send | hide | home`: drive its window from the chat.
9. `/apps <app> download <link>`: fetch a file in that app's own signed-in session.
10. `/apps downloads`: everything you downloaded from apps, as cards with where-to buttons.
11. `/apps folder` shows the downloads folder.
12. `/apps windows`: what's open, hidden or still playing sound.
13. `/apps close <app>` / `/apps close all` (sign-ins are kept).

## App windows
14. **One window per app**: opening it again brings the same window forward.
15. **Its own sign-in**, kept between restarts, separate from every other app and from your agents' websites.
16. **Sign-in popups** (Google, Apple, Microsoft, GitHub, Discord, Adobe…) open inside, in the app's session.
17. **The service's own links stay in its window**; links to other sites open in your normal browser.
18. **‹ Back** (right-click it: forward) and **↻ Reload**.
19. **The app's name** at the left: click it to open another app.
20. **The page's title and address** in the bar; click to copy the address.
21. **A small spinner** while a page loads.
22. **↗ Open in your browser**.
23. **💬 Send to chat**: the page's title and address, a picture of the page and what you selected land in the chat's composer, ready to send (the chat on screen, else your last one).
24. **⤓ Downloads tray** in each window: a count badge, progress, and per file "→ Lab / Board / Video Review / Show".
25. **⋯ menu**: the app's own actions, copy the address, forward, back to its start page, zoom in / out / actual size, the downloads folder.
26. **Sign out of an app here**: clears only that app's login and site data (asks first).
27. **Keys in an app window**: ⌘/Ctrl+R reload, Alt+← / ⌘[ back, Alt+→ / ⌘] forward, ⌘/Ctrl+L copy the address, ⌘/Ctrl+Shift+Enter send to chat, ⌘/Ctrl+W hide (all in the keys sheet, bottom left).
28. Hearth's own shortcuts (⌘K, ⌘R…) no longer fire from inside an app's page.
29. **Windows remember** their size, place and last page.
30. **Closing only hides** the window: your sign-in and page stay; videos / songs on it pause.
31. **Parked when hidden**: a window hidden for 5 minutes is freed (memory, CPU) and comes back at the same page; one still playing sound waits.
32. **Your Hearth colors** in the window bar.
33. **Offline / a page that doesn't load** says so, with ↻ to try again.

## Downloads land in the right place
34. **Downloads/Hearth/<App>**: no Save dialog, a name already there gets " (1)" instead of being overwritten.
35. **A note for each finished download** with the best place in one click ("Use as the Lab's song", "Load into the Lab"…).
36. **.glb / .gltf → a model layer in the Lab** (see below).
37. **.fbx / .obj / .stl → the Lab's references** (the director and the model viewer read them).
38. **.hdr / .exr → the Lab's sky** (a bottom layer that lights and backs the scene).
39. **Songs → the Lab's song** (the timeline, beats and analysis as if you loaded it).
40. **Clips → Video Review** (opened, and kept in its library).
41. **Pictures → the board.**
42. **Fonts → the Lab's references.**
43. **Anything → attached to the chat.**
44. **A picture → a Meshy 3D model of it.**
45. **→ the make in progress** (its outputs), from the downloads picker.
46. **Each app picks its own first choice** (Suno: the Lab's song; Runway: Video Review; Unsplash: the board…).

## In the Lab
47. **🧊 Model layers**: a model arrives centred, sized to the view, lit by a soft studio light and turning slowly; its own animation plays.
48. Model sliders: **Size, Height, Spin, Tilt, Light** (and Kick punch at 0 until you want it).
49. **🌅 Sky layers** (HDRIs) at the bottom: sliders **Blur, Light, Turn, Lens**.
50. Both arrive as references of the open sketch, so the director can reuse them in code (`refs.<name>`).

## Meshy
51. **Meshy's website in its own window** (`/apps meshy`, `/meshy open`).
52. `/meshy <what to make>`: a **textured model from words** (Meshy's shape, then its texture pass).
53. `/meshy draft <words>`: **shape only**, cheaper.
54. `/meshy image`: **a 3D model from a picture**: the board picture you selected (else the newest), or a file (`/meshy image ~/pic.png`); WebP / GIF are converted.
55. `/meshy texture <#n | last> <style>`: **a new texture** on a model ("rusted bronze").
56. `/meshy remesh <#n | last> [polycount]`: **a cleaner, lighter mesh**.
57. **The cost first, every time**: what it makes, each step's credits, the total and your balance, then Yes / Cancel (your permission prompts when that feature is on, else a confirm). Nothing is spent until you say yes.
58. `/meshy cost [draft | image | texture | remesh]`: the estimate without starting anything.
59. `/meshy balance`: your credits left.
60. **Your API key, pasted once** (`/meshy key`, a password box): encrypted with your system keychain on this computer, used only by Hearth's background process: never shown to a chat, an engine, a log, a backup or your other computer.
61. **"Use Meshy's test key"** in that box (or `/meshy key test`): the whole flow with Meshy's sample models, no credits.
62. `/meshy key forget`.
63. **A progress bar** from Meshy's own percentage (shape, then texture), with **your place in Meshy's queue** while it waits.
64. **Jobs survive** a reload or a restart: Hearth picks up where Meshy is, without spending twice.
65. `/meshy status` (key, running jobs, failures), `/meshy stop`, `/meshy resume`.
66. **Your Meshy models** (`/meshy models`, the Apps menu, the Meshy window's ⋯): cards with their picture, **◭ Lab, ▦ Board, Texture…, Show**, plus "New from words", "From a board picture" and the website.
67. **Made from the Lab (or its director's chat) → it lands as a Lab layer**; made from the board → on the board; otherwise a note in the chat with Lab / Board buttons.
68. `/meshy lab <#n | last>` and `/meshy board <#n | last>`.
69. **On the board**: the model's picture with its name and prompt; right-click it → **"Load its 3D model into the Lab"**.
70. **Right-click a board picture → "Make a 3D model of it (Meshy)…"**.
71. **Part of a make**: a model made in a make's chat is added to its outputs.
72. **Models downloaded from Meshy's website join the library** too.
73. **Errors in plain words**: a refused key, not enough credits, Meshy busy, an expired task, offline.
74. `/meshy` alone: a small menu (from words, from a board picture, from a file, your models, the website, credits, key).
75. **Chats can ask Meshy** (`meshy_generate`, `meshy_status`, after `/apps-tools on`): you still approve each one, with its cost, and see which chat asked.

## Suno
76. **Suno in its own window** (`/suno`).
77. `/suno prompt [words]`: **style tags and a song structure written from your scene's vibe**: the Lab sketch's name, layers and palette, your board's moods, your words (locally: no tokens).
78. **→ Paste into Suno**: Title, Style and Lyrics typed into Suno's own boxes; you press Create.
79. **Suno's simple mode** gets the description box instead; if the page changed, the text is copied for ⌘/Ctrl+V.
80. **Copy style / Copy lyrics** buttons.
81. **✍ Lyrics by Claude (or Astra)**: one click asks this chat's agent for real lyrics in Suno's format; `/suno paste reply` pastes its answer.
82. `/suno paste [style | lyrics]`: paste the last prompt again.
83. `/suno use`: **your newest Suno download becomes the Lab's song** (`/suno use review`, `/suno use board`).
84. **Suno downloads offer "Use as the Lab's song" first.**
85. Suno's window ⋯: use my newest song in the Lab · write a prompt from the scene and paste it · paste my last prompt.
86. **Chats can type a Suno prompt** into the window for you (`apps_open` with `paste`); the Create button stays yours.

## More apps (each its own window and sign-in)
87. **Figma** (design files); ⋯ puts the file's link on the board.
88. **Spline** (3D in the browser): exported GLBs load into the Lab.
89. **Sketchfab** (opens on free downloadable models): GLBs go straight into the Lab.
90. **Mixamo** (rig and animate a character, a Meshy one too): FBX files go to the Lab's references.
91. **Poly Haven** (free CC0 skies and textures).
92. `/polyhaven <words>` (or `/hdri`): **a picker of free skies** with pictures, **◭ Sky in the Lab** or **2K**; no account.
93. `/polyhaven <words> textures`: free textures → the Lab's references or the board.
94. `/hdri get <id> [2k]`: a sky by name, straight in.
95. **Unsplash** (free photos): ⋯ puts the photo page on the board.
96. **Coolors**: ⋯ **"Use this palette in the Lab"** (the sketch's palette) or **"Put this palette on the board"**, read from the page's address.
97. **Google Fonts**: ⋯ "Use this font" tells the chat (name + link); downloaded fonts go to the Lab's references.
98. **Runway** (AI video): clips open in Video Review.
99. **ElevenLabs** (voices, sound effects): downloads become the Lab's sound.
100. **YouTube Studio**, **Instagram**, **TikTok Studio**: ⋯ **"Show my newest render"** (its file shown and its path copied, ready to drop into the upload box).
101. **Pinterest** (a stand-in until the board stream's own Pinterest window replaces it): pins onto the board.

## More AI apps (you asked: "pack other AI in Apps, make me discover things")
Each is light: its own window and sign-in, one line on what it's good for, free / paid, where its downloads go.
106. **Midjourney** (painterly, cinematic stills; paid).
107. **Ideogram** (images with readable text: posters, titles, logos; free tier).
108. **Krea** (real-time images, upscaling, video; free tier).
109. **Leonardo** (images and game-style textures; free tier).
110. **Recraft** (vector art, icons, brand illustration; free tier).
111. **Adobe Firefly** with your Adobe sign-in (a stand-in the Adobe stream's own Firefly replaces).
112. **Pika** (short playful clips and effects from a picture; free tier).
113. **Luma Dream Machine** (smooth realistic camera moves; free tier).
114. **Kling** (long physical video shots; free daily credits).
115. **Tripo** (fast 3D from a picture or words: GLB into the Lab; free tier).
116. **Luma Genie** (quick 3D objects from a sentence; free).
117. **CSM** (image / sketch to 3D; free tier).
118. **Udio** (songs with strong vocals: a second take next to Suno; free tier).
119. **Stable Audio** (loops, textures, sound design by length and bpm; free tier).
120. **ChatGPT**, **Claude.ai**, **Gemini**, **Perplexity**, **NotebookLM**, **Grok** as windows (their own apps, research with sources, docs → podcast…).
121. **v0**, **Bolt**, **Lovable**, **Replit**, **Framer** (a page, an app or a portfolio site from a description).
122. **Shadertoy** (shaders to learn from, for the Lab's shader playground; free).
123. **Descript** (edit video by its transcript), **CapCut** (quick social edits, auto captions), **Captions** (animated captions).
124. **New kinds in the picker**: Edit, Chat, Code (next to 3D, Sound, Make, Design, Assets, Social); each app shows free / paid.
125. **🔎 Search every app** (the Apps menu, `/apps search <words>`): every app as a card, favorites and recents first, filter as you type.
126. **★ Favorites** (the ☆ on a card, `/apps fav <app>`): first in the Apps menu.

## Discover
127. **✨ Discover** at the top of the Apps menu: three apps you haven't opened yet that fit what you're doing now, each with why.
128. **It follows you**: in the Lab → 3D and video AI; a song in the Lab → music AI; on the board → picture AI; in the editor → video editing AI; in a chat → research and site builders.
129. **A new three each day**, never the same ones on repeat.
130. **It learns**: an app you've opened stops being suggested; "Not for me" twice and it's never suggested again (kept in kv apps-habits, synced like the rest).
131. **A quiet "Try this" note, at most once a day**, never while Hearth is starting; its × counts as "not for me".
132. `/apps discover` (a picker with Open, ☆, Not for me), `/apps discover off` / `on`, `/apps discover now`.
133. **Chats can suggest an app**: `/apps suggest <app> [why]` or the `apps_open` tool (suggest) puts a card in the chat with **Open** and **Not for me**; `apps_open { op: discover }` lets them read what fits.

## Send to app
134. `/apps send-to <app> [board | lab | render | file]`: a board picture (the selected one, else the newest), a still of the Lab, your newest render or any file goes on the clipboard (a picture as a picture; a video / sound as its path, its folder shown), the app's window opens and says "paste here (⌘V)" / "drag it in".
135. **Right-click a board picture → "✨ Send to an AI app ›"** (every app that takes a picture).
136. Chats can do it too (`apps_open` with `send`).
137. Fixed on the way: copying a picture to the clipboard (Capture's "Copy" and this) failed on Electron 44 ("clipboard.write expects an array of ClipboardItem").

## For your chats
138. `/apps-tools on | off | directors`: give a chat's agent the app tools (open an app, type a prompt, ask Meshy). Off by default: they add a few tool definitions to each message.
139. **`apps_open`**: list the apps, open one (at an address), type into its page, run one of its actions.
140. **The app map** knows the apps (`hearth_help apps`): what goes where, that Meshy costs credits and needs your yes, that Suno has no API.

## For other parts of Hearth (and the other streams)
141. `Apps.register({ id, name, icon, url?, open(), describe(), commands?, actions?, routes?, partition?, group? })`: any feature adds an app (Adobe and deploy apps, the board's Pinterest), sharing one sign-in between apps when they set the same `partition`; `Apps.route(file, 'lab-model' | 'board' | …)`, `Apps.ask(…)`, `Apps.grid(…)` for card pickers.

## Behaviour worth knowing
- Hearth never calls a Suno API (there is no public one); it only types into Suno's page, and you press Create.
- Meshy's credit numbers are Meshy's published prices as an estimate; Meshy's own count is what you're billed.
- On a computer without a keychain (rare on Mac / Windows), the Meshy key is kept only until Hearth quits, and Hearth says so.
- Downloads from app windows don't show Hearth's usual download toast: the app's own note replaces it.

## Tested here (fake services, no network)
`sh dev/run-checks.sh apps`: `dev/fake-meshy.js` fakes Meshy's API (tasks, polling, a real tiny GLB), Poly Haven's API
and the web pages (a Suno-like page with Title / Style / Lyrics boxes, a song download, a Meshy page with a GLB, a
Coolors address). `apps-windows` drives the windows, downloads, routes, Suno paste, Coolors, Poly Haven, parking;
`apps-discover` the AI catalog, Discover by place, learning, the daily note, favorites, search, suggest cards and send-to; `apps-meshy` the key, the cost question (yes and no), text / image / agent / retexture / failure, Access.ask, the
library, a reload; `dev/apps-unit-test.js` the adapter against the fake server. Not verified: the real Meshy API
(the adapter follows Meshy's documented v1 / v2 shapes in one file, `apps-meshy-api.js`, easy to fix), the real
Suno page's boxes (found by their labels; falls back to the clipboard), real sign-ins, Mac windows.
