# Round 67 plan: direction, taste, honesty

Status: stream 1 built (see `astrafix67.md`); streams 3-5 in their own sessions; stream 2 next. Stays clear of round 66 (map pin, weekend plan, music
session log, map buttons and layers, startup fix).

What the code research found, in short: most of the building blocks already exist. The trouble
is wiring. Agents get the scene's tools only in some modes, the moodboard sends the picture
instead of the qualities it already measures, and history has no real branches.

---

## Stream 1: Astra and Swarm repair (first)

Bugs found, with the fix for each:

| # | What goes wrong today | Fix |
|---|---|---|
| 1 | **Council throws away round 2.** The seats critique each other, but the chair is handed the round-1 answers (`astra.js` ~303-310). | Pass the critiques to the chair. One small additive change, documented under "For Codex". |
| 2 | **Collaborations are blind.** Every duo, debate or council seat runs "lean", with no tools, no files and no scene (`astra.js:123`, `engines.js:1145`). | Give every seat the same **eyes packet**: a fresh frame of *its own chat's* scene, a 6-10 line scene summary (layers, the selected layer and the object picked in 3D) and attached pictures sent as real images. It costs no tools and few tokens. |
| 3 | **The second-opinion screenshot can show the wrong scene.** It shoots whatever is on screen (`native.js:2160`). | Shoot the asking chat's own scene (backstage if hidden). |
| 4 | **Astra silently loses its Lab tools.** On the default Codex transport a blocked tool call becomes a "thinking" line, with no retry and no error (`codex-server.js:133`). | Same handling as the other transport: retry with approvals off, then show a plain error ("Astra couldn't reach the Lab") with a "Try with Claude" button. |
| 5 | **"Astra tools on" doesn't give the scene tools.** For Codex it only turns on chat tools (`engines.js:217`). | In a Lab chat it also turns on the scene tools. The label says what it does. |
| 6 | **Astra can't open pictures handed over as a file path** (`view_image` is off). | Every picture handed to Astra goes as image input, never as a path. |
| 7 | **Astra on Windows at "Read" level is blocked by its sandbox**, yet Hearth trims attachments assuming it can read them (`attachlean.js:22`). | Treat that case as "can't read": inline the text instead of trimming it. |
| 8 | **Idle Codex helpers pile up.** Each council, crew or jam turn leaves a Codex process running for 5 minutes (`codex-server.js:124`). That's a lag risk. | Close them as soon as the turn ends. |
| 9 | **Swarm won't start in the Lab without a partner agent** and then only opens a plan (`missions.js:23`, `three-crew.js:153`). | No partner needed in the Lab. The button reads "Start 4 helpers", one clear click to go. |
| 10 | **After Effects:** no code path freezes Hearth while AE runs. But AE runs at full priority and Hearth never hears back when a job ends. | Run AE at lower priority. Add a "job done" signal (the script writes a small result file; Hearth checks it only while a job is running, with no timers when idle) and a jobs chip with status. **Needs Quentin's answer:** see question 1. |

Done when: an Astra seat in a council can say what's in the scene; a crew of 4 runs from one
click; a failed tool call shows up as a plain message; checks in `dev/checks/` cover 1, 2, 4 and 9
with fake engines.

## Stream 2: Try 4, then commit (needs stream 1)

- **Try 4.** One button, "Try 4 ways". It runs 4 crew helpers on 4 backstage copies, each pushed
  toward a different direction. It reuses the Variations grid: hover to peek, click to keep. A
  "this one, with that one's…" menu reuses the time machine's "pick layer / colours / sliders".
- **Real branches.** Time-machine versions get a `parent`. Going back to an earlier version and
  working from it makes a branch in the same scene instead of a new scene. The strip shows branches.
- **Point at it.** A "Mark it up" button on the preview opens the existing drawing tool (circle,
  arrow, pen). Each mark gets a choice: **more of this** / **wrong**. The marked picture and the
  regions go to the director.
- **Plain sliders.** Calmer ↔ busier, warmer ↔ colder, softer ↔ harsher. They drive the grouped
  scene values that already exist (`VarCore.groupOf` / `steer`), and each is measured back on the frame.
- **Vision anchor card.** 3 frames + a few words + one "should feel like" sentence per scene. Every
  new version gets a drift score against it (the moodboard's existing `distance` / look-match
  maths). The card turns orange before drift piles up.

## Stream 3: Moodboard qualities instead of copies (can run in parallel)

- The board already measures each tile: palette, light, contrast, warmth, grain, composition and
  motion (`BoardVibe.fromPixels`). New: "Use qualities" sends those numbers in plain words, not the picture.
- A **"What I like about this"** line on each tile. It is the strongest signal and goes first.
- A **distance slider** from "close to it" to "only its spirit". It sets which qualities are sent and
  how strict the instruction is.
- **Mix 2-3 tiles.** A blend card shows the merged qualities before sending.
- **Needs Quentin's answer:** see question 2.

## Stream 4: Credit log and process reel (can run in parallel)

- The time machine already marks every version **you / Claude / Codex / crew**. New: a credit log
  that also counts what it misses today: unsaved slider tuning, and Sound desk knob moves (it listens
  to the desk's existing events and is stored in Hearth's own file, with no edits to Codex's files).
- **Credits** per piece: plain text, e.g. "Code: AI-drafted, hand-tuned (34 edits by Quentin) ·
  Sound: made by hand in Serum 2 · Visual direction: Quentin". A Copy button. Nothing is uploaded.
- **"How it was made" reel**: version stills stitched with title cards (existing cut tools), 10-20 s, 9:16 or 16:9.

## Stream 5: Finish lines (can run in parallel)

- Each piece gets a **size** (10 s / 30 s / full) and a **"done when"** checklist on the scene.
- **"Polish this"** turns into a quest with 3 concrete steps tied to the scene, through the existing
  quest HUD and guide (`QuestHud.write` + quest guide); only quest-file edits allowed are additive.

---

## Questions for Quentin

1. **After Effects:** when you say you can't set up AE while three.js works, what actually happens?
   Does Hearth freeze, does AE freeze, or do you just never find out whether the job finished?
2. **Moodboard drag:** should dragging a tile into the chat send its *qualities* by default, with
   "send the actual picture" as a choice on the tile?
3. Streams 3, 4 and 5 don't depend on each other. Should they run as **separate sessions** in parallel
   while this one does stream 1?

## House rules this plan keeps

Everything is reachable by clicking, with visible labels. Nothing is uploaded automatically.
Deletes go to the Trash. Nothing runs loops or timers while hidden. Tests use throwaway data, never
his chats, scenes or game files. Edits to Codex-owned files are minimal, additive and listed under
"For Codex".
