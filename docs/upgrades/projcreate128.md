# Round 128 · projcreate128: a richer new project, with the AI's help at the start

The owner asked: "give project creation more options and ai-helper features at start". The new-project card has a lot
more in it now, and it is still fast: **a name and Create project ↗ make the project in two clicks**, the same as
before. Everything else is optional.

## What the card asked before (the map)
`ProjectWorkspace.wizard()` (project-workspace.js) asked for a name, "The idea", the AI and its personality, a starting
scene (a copy of one of my scenes), a starting moodboard (a copy), starting files, and offered "Write the project
description with AI". `ProjectWorkspace.create()` then made **the project's chat** (`<agent>-project-<id>`), **its
scene** (a fresh one, or the copy), linked to the chat, and **its moodboard** (empty, or the copy). The starting files
went into the project's list: pictures and clips onto the moodboard, a song as the scene's song. There is no folder of
its own: a project's files stay where they are, and the project links to them.

## What's new, and where the owner clicks
**Projects › ＋ New project** (or the project name ▾ › ＋ New project) opens the new card. Under the name and "What are
you making?" are four parts, each a labelled row that opens with a click. Each row shows what's chosen, e.g. "Audio
visualizer" or "9:16 · vertical · 60 fps".

- **Start from**: Empty scene · Audio visualizer · Particles · Shader art · Kinetic type · 3D model showcase (with
  "🧊 Pick a 3D model…": it's shown on a turntable) · Footage + effects · ⧉ Copy one of my scenes… · 📐 One of my Lab
  templates… (shown when you have saved some) · ⎘ Duplicate a project…. These are the Lab's own starting points
  (the gallery's Spectrum crown, Beat burst, Fractal dive, Kinetic opener, Chrome knot, and the Footage and Film
  layers). With recipes saved, "📜 Then play one of my recipes…" plays one on the new scene.
- **Music & footage**: 🎵 Pick a song… · 🎞 Add footage… · or drop them on the card · or skip. The song becomes the
  scene's song, and the Lab analyses it when the project opens. With Footage + effects (or no song), the footage is
  the scene's video.
- **Look**: 🖼 Add pictures… (or drop them) for the moodboard · ⧉ Copy a moodboard… · a palette: click one, paste a
  Coolors link or hex codes, or **✦ Suggest a palette**, which reads the pictures' colors on this computer (no AI).
  Then **Size** (16:9 · 1080p, 9:16 · vertical, 1:1 · square, 4K) and **Frame rate** (24, 30, 60).
- **AI**: **Who directs** (Claude or Astra), the personality, and three ticks:
  - "Let the AI look at the moodboard": consent to send the moodboard's pictures to the AI. Off unless ticked.
  - "Let the AI prepare a brief": on by itself when there's a song or pictures.
  - "Write a short project description" (as before).
- **✦ Suggest a name** next to the name field: one small AI call made from "What are you making?" and the song. It runs
  only when clicked.

**After Create**, if "prepare a brief" is ticked, Hearth asks the brief from this round's ProjectBrief (aiprep128) with
`ProjectBrief.prepare(projectId, { moodboard: <the consent tick>, refs: true, song: true, scene: true, notes: <what
you're making> })`, then calls `ProjectBrief.open(projectId)`, which shows the plan card in the project's Lab chat. If
that part of Hearth isn't there, the project opens as usual and a note says the brief isn't available.

**Remembered on this computer**: the last size, frame rate and AI (`localStorage` `hub.projcreate.last`).

**The size and frame rate belong to the project** (`p.workspace.frame` / `fps`; the frame is also its scene's). The Lab's
Render card (tools/three-export.js `panel()`) uses them when the scene on screen is that project's; anywhere else it
uses the last render's settings as before. Picking a frame rate in the card never changes the global Render default
(`three.export`).

**Fixed on the way: "Lab frame" rendered at 1920×1080.** The Render card read the Lab's frame through the Lab
sequence's handle. Before the sequence had been opened that handle was missing, so "Lab frame" fell back to 1920×1080:
a 9:16 scene's still came out 1920×1080, and the card said so too (checked before the fix: 1920×1080 still). Now,
without that handle, "Lab frame" is the scene's own frame (`ThreeLab.scenes.frameOf`, which the project set), and the
label shows the true size (tools/three-export.js `frameNow`, marked).

Nothing is uploaded and nothing is installed. The only AI calls are ✦ Suggest a name (on click), the brief (with its
tick) and the description (with its tick).

## Files
- `projcreate-core.js`: the pure parts (starts, sizes, palettes, Coolors / hex reading, the pictures' colors merged,
  files sorted by kind, the remembered defaults, the brief's options, the name prompt). It loads in Node.
- `projcreate.js`, `projcreate.css`: the card. Lazy group **projcreate** (`tier: 'use'`, after `projects`), loaded on
  the first ＋ New project. Its tag is in index.html's `lazy-at.js#…projbundle,projcreate…`, and docs/lazy-groups.md
  has its line.
- `project-workspace.js` (Codex-owned): two marked lines. See "For Codex".

## Tests
One app check, **dev/checks/projcreate128.js** (group `projcreate128` in dev/run-checks.js), all by clicks:
1. Projects › ＋ New project, a name, Create project ↗: the project opens in two clicks with chat, scene and moodboard,
   the defaults (empty, 16:9, 30 fps) and no brief.
2. Audio visualizer, a song and two pictures dropped, ✦ Suggest a palette (colors read), then House clicked, 9:16,
   60 fps, Claude, the moodboard tick (the global Render default stays untouched; the Render card opened in that scene
   shows 60 fps and the Lab frame, not the last render's 25 fps / 4K; "Lab frame" reads 1080×1920 and a still
   renders at 1080×1920): the scene has the Spectrum crown's layers in House colors, 9:16, the song; the
   moodboard has the pictures. The brief goes to a stub ProjectBrief: `prepare(id, { moodboard: true, refs, song,
   scene, notes })`, then `open(id)`.
3. The card again: 9:16, 60 fps and Claude are remembered.
4. No ProjectBrief: the brief is ticked by hand, the project opens, and a note says the brief isn't available.

Run: `projcreate128` ✓ (58 s), `projects` ✓, `projaudit108` ✓, `projopen109` ✓, `labload94` ✓, `node dev/boot-test.js`
✓ (2832), slim116-test ✓, selfmap118-test ✓.

## For the patch notes
- **New projects have more ways to start.** ＋ New project still needs only a name and Create. You can also start from
  a template (audio visualizer, particles, shader art, kinetic type, a 3D model showcase, footage with effects), from a
  copy of one of your scenes or templates, or from a copy of a whole project.
- Add a song or footage, drop pictures for the moodboard, and pick a palette: click one, paste a Coolors link, or let
  Hearth suggest one from your pictures. Then choose the size (16:9, vertical, square, 4K) and the frame rate.
- Choose who directs, Claude or Astra. One tick lets the AI look at your moodboard. Another has it prepare a short
  brief as soon as the project opens. "✦ Suggest a name" finds a name from what you describe.
- Hearth remembers your last size, frame rate and AI on each computer. A project keeps its own size and frame rate, and
  Render uses them inside that project.
- Fixed: a vertical (or 4K) scene rendered on "Lab frame" came out 1920×1080 until the Lab's sequence had been
  opened once. It now renders at the scene's own size, and the Render card shows that size.

## For Codex
- `project-workspace.js` (round 128, projcreate128), two marked edits:
  - `wizard()`: it first loads the lazy group `projcreate` and hands over to `ProjCreate.wizard(defaults)`. Only if
    the group can't load does it draw the older card below (unchanged).
  - `create()`: a new optional `options.prepare(p)`, awaited after `ensure()`, the files and the song, before
    `P.flush()` and `open()`. The card uses it to set the scene's layers, palette, frame, timeline frame rate and
    footage before the scene first runs. Without it, nothing changes.
- The card saves `start`, `frame`, `fps`, `aiSeesMoodboard` and (when chosen) `palette` in `p.workspace`. These are
  additive fields; `ProjectWorkspaceCore.workspace()` keeps them as they are.
- `tools/three-export.js` (not Codex-owned) `panel()`: one marked line reads the open scene's project `fps` / `frame`
  (through `Projects.ofItem`) before falling back to `three.export`; `frameNow()` falls back to the scene's own frame
  (`ThreeLab.scenes.frameOf` → `ThreeMedia.SIZES`) before 1920×1080 when the sequence's handle is missing.
- Duplicate a project… uses `ProjBundle.duplicateProject()` (unchanged), then `Projects.rename()` and
  `ProjectWorkspace.open()`.
