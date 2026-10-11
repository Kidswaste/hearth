# Studio (round 15): one-click pipelines that chain what Hearth can do

You said "keep packing upgrades" and "feel free to make me discover things". Hearth now has a lot of parts (the board's
eyes, Pinterest, the Three Director, the Lab's song analysis, the sequence, the render queue, Meshy, Poly Haven, Adobe,
deploy, Suno). **Studio** chains them into named pipelines you start with one click. Each pipeline:
- becomes a **make**: one name and mark, its rooms made at once (a board frame, a "<Name> · Lab" Three Director chat,
  a Video room…), its other steps as parts with progress bars, grouped at the top of your chats list;
- runs as a **flow run**: its questions come first (only the ones it needs), then it moves on by itself. It shows on the
  Commands page under "Going now", as a live card in the Lab room's chat, and in `/studio status`. If a step gets stuck,
  **Pick up here** continues from that step, and **↻ Again** runs the whole thing again;
- **never spends or publishes without asking**: Meshy shows its cost and your balance and waits for your yes, and
  Deploy asks before anything goes public.

Where: **one entry**: ⌘/Ctrl+K "Studio…", a **✦ Studio** section on the Commands page, and `/studio` in any chat.
Each pipeline shows a one-line pitch, its chain of steps, what it may cost (tokens / Meshy credits), and anything
missing on this computer (ffmpeg, Photoshop, a publishing CLI, a Meshy key…) with a **Fix** button.

Tokens: nothing is added to any prompt until you start a pipeline. Its one director step is a two-line ask (the board's
vibe capped at 600 characters; about 270 characters for a song). Chats only learn about Studio when they look it up
(the "studio" topic in the app map).

Counted honestly: one line per thing you can see or use.

## The pipelines
1. **Board → video** (`/studio board-video`): your board's vibe → Pinterest searches for missing references → a Lab scene from the vibe (Three Director) → a 15 s sequence → the render queue (asks: Reels / YouTube / both) → Video Review opens with the first finished render.
2. **Song → visualizer** (`/studio song <file | suno>`): a song (a file, your newest Suno download, or the Lab's song) → loaded and analysed in the Lab room's scene (tempo, sections) → a scene that reacts to it → a sequence cut on its sections → every social size rendered.
3. **Idea → 3D hero** (`/studio idea-3d a chrome dragon skull`, or `board` for the newest board picture): Meshy makes the model (cost shown, asked first) → it lands in the Lab → a free Poly Haven sky matched to your words → an orbit camera move → a 6 s loop → rendered 9:16.
4. **Scene → website** (`/studio scene-web`): the open Lab scene is built, previewed and published on your service (it asks first); the link is copied.
5. **Still → Photoshop** (`/studio still-ps`): a still of the Lab → opened in Photoshop (social sizes 9:16 / 4:5 / 1:1 if you say yes) → the still lands on the board. What you save in Photoshop comes back to Hearth.
6. **Vibe → song** (`/studio vibe-song [words]`): Suno style tags and lyrics written from your scene and board (no tokens), typed into Suno → it waits for your download → the song becomes the Lab's song (then try Song → visualizer).

## The Studio picker
7. **One dialog with one card per pipeline**: icon, name, pitch, its chain of steps ("Board → Lab → Sequence → Render → Video"), and ▶ Start.
8. **What it costs** on every card: "one Three Director reply (≈ 4–8k tokens)", "Meshy ≈ 30 credits (shown and asked first)", or "no tokens".
9. **What's missing on this computer**, per card: ⚠ for what a step needs (ffmpeg, Photoshop, a publishing CLI, a Meshy key, a Claude engine), ○ for what makes it better (references on the board, Suno).
10. **Fix** next to each missing part runs its fix (`/ffmpeg install`, `/meshy key`, `/doctor`, `/deploy status`, `/adobe`, `/board`, `/suno`) and says how.
11. **Starting with something missing still works**: the step that needs it stops with the reason, and **Pick up here** continues after you fix it.
12. **Search box**: type to filter the pipelines; Enter starts the first one.
13. **♪ Pick a song…** on the Song → visualizer card: choose the file now, so there's no question later.
14. **Right-click a card**: Start, copy its `/studio` command, or open its steps as a flow in the node view.

## Entries (one each, no new buttons)
15. **⌘/Ctrl+K → "Studio: one-click pipelines…"** opens the picker.
16. **✦ Studio on the Commands page**: one row per pipeline (the page's search finds them too).
17. **Click a Studio row**: its pitch, chain, numbered steps (✎ questions, ✦ the director step), cost, what's missing, ▶ Start, its `/studio` command and its last runs (click one to follow it).
18. **Right-click a Studio row**: Start, or copy its command.

## Chat commands
19. `/studio` opens the picker.
20. `/studio <pipeline> [words]` starts one from any chat. Names are forgiving (`song`, `3d`, `photoshop`, `website`, `board video`), and the words become its input: a song path or `suno`, the hero idea, vibe words.
21. `/studio list`: every pipeline with its chain, cost, what's missing and its command.
22. `/studio status`: the Studio runs and where each one is.
23. `/studio needs`: what this computer has and doesn't (with fixes).
24. `/recipes` is a short name for `/studio`.
25. **Directors can start one when you ask**: `three_do { cmd: "run", command: "/studio song" }`. This adds no tokens. The app map has a **studio** topic they read on demand.

## Makes, rooms and progress
26. **The make is named from your words** ("a chrome dragon skull" → **Chrome Dragon Skull**, a song → its title), otherwise a generated name.
27. **Rooms ahead of time**: the Lab room (Three Director chat with its own scene), a board frame, a Video room. They are all made before any step runs, and the Lab room opens.
28. **The other steps are parts of the make** with their own names (Song, Sequence, Render, Model, Publish, Link, Still, Photoshop, Prompt).
29. **Each part's bar moves with the run**: working while its steps run, done when they are, stuck (orange) when a step hung.
30. **Renders keep the make up to date after the run ends**: the Render part fills with the render queue's progress, finished files become the make's outputs, a toast says "N renders ready" with Show, and a render with no output marks the part stuck.
31. **Meshy's progress** shows on the Model part while the model is generated.
32. **Stills, social sizes and renders** become the make's outputs (Open / show in folder from the make).
33. **After a restart**, renders that were still going keep updating their make.

## The run (Flows)
34. **The questions come first**, then the run moves on by itself. A question is skipped when you already gave its answer (`/studio song track.mp3`) or when it isn't needed (Board → video asks for vibe words only when the board is empty).
35. **A live card in the Lab room's chat**: steps done, the question waiting with its options as buttons, Pick up here, ↻ Again, ✎ Refine.
36. **"Going now" on the Commands page** lists it while it runs. Click it to follow step by step.
37. **Pinterest searches as buttons in the room's chat** (Board → video). The run carries on meanwhile, and a click opens Pinterest's own search page.
38. **The director step is one lean ask in the Lab room's own chat**: you see it and its reply, and the run waits for it (up to 20 min before it counts as hung).
39. **Long steps wait as long as they need**: Meshy's model (30 min), Suno's download (30 min), publishing (15 min), Photoshop (10 min). They can be picked up if Hearth closes in the middle.
40. **Declining costs nothing**: say no to Meshy's cost (or to publishing) and the run ends with "Nothing was made and nothing was spent."
41. **Photoshop missing**: Still → Photoshop still puts the still on the board and says why Photoshop wasn't reached.
42. **Sky matched to your words** (night, sunset, forest, city, studio…), otherwise studio light.
43. **The sequence uses only the pipeline's own scene**, so it doesn't pick up your other scenes: on the song's bars when there is one, a 15 s teaser or a 6 s loop when there isn't.

Tested: `dev/checks/studio-recipes.js` (fake engines, fake Meshy and Poly Haven) runs Song → visualizer and Idea → 3D hero end to end, plus a declined Meshy run (nothing spent). It also checks the picker, the Commands-page section, the palette entry and /studio list | status | needs. `qa-commands`: no duplicate names.
