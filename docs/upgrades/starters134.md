# Round 134 · starters134: ★ start from my own work

The owner asked to reuse their own past work in a couple of clicks: past scenes, layers and looks. This round adds a
**★ My work** library. You open it from the new-project card, from the Lab's ＋ Add menu and from the sketch browser.
There is no new toolbar row.

## What existed (and what each does)
- **＋ New project › Start from** (projcreate128, `projcreate.js`) offered:
  - the Lab's six starting points;
  - **⧉ Copy one of my scenes…**, a drop-down of scene names with no pictures (`ProjectWorkspace.create({ sceneId })`
    makes the copy);
  - **📐 One of my Lab templates…**, a drop-down;
  - **⎘ Duplicate a project…**;
  - **📜 Then play one of my recipes…**.
- **My templates** (next129, `projtemplates.js`): projects saved as templates, shown as cards with covers in Start from.
  Picking one starts a new project with fresh ids.
- **Lab templates** (labtemplates, `tools/three-templates.js`): 📐 My templates in the Lab. `LabTemplates.create()` makes
  a new scene from one, with a fill-in form.
- **The gallery** (`tools/three-gallery.js`): the Lab's built-in starting points and *your own scenes*.
  - "Use as a new scene" on your own scene is `scenes.duplicate()`. It keeps the **same layer ids**.
  - "Add its layers" puts all of a starting point's layers on top. It has no undo step of its own.
- **Saved looks**: these are slider looks, one set per layer (`tools/three-tweaks.js`, the looks bar). Each scene keeps
  its own in kv `three-lab-extras`. There is also **◆ Project look** (looks129, `tools/three-projlook.js`), which puts a
  project's palette on the color sliders as one undo step.
- **The sketch browser** (▦, `tools/three.js` `browseSketches`): every scene as a picture, with search, sort and pins.
  It has right-click Duplicate (same layer ids). It has no layers or looks.
- **Lab recipes** (labrecipes): recorded Lab steps that can be played again. A recipe holds steps, not a scene, so it is
  left as it is (the card still offers it).
- **Scene versions** (versions132): "Take only…" brings back one layer from a version **of the same scene** as one
  undo step. This round uses the same undo pattern (`LabTxn.snap` / `LabTxn.step`).

What was missing was one place that collects all of this with pictures, finds the layers worth keeping, and offers
copies with fresh ids, a single layer from another scene, and an AI that looks over it. ★ My work adds these. It
extends what exists: templates still start through the projtemplates and labtemplates paths, and palettes go through
◆ Project look's recolor.

## What's new, and where the owner clicks
**★ My work** is a card with search, filters, a grid of thumbnails, and a bar at the bottom for the item you click.
- **What it shows**:
  - **Scenes**: every past project's main scene, plus your other scenes that have a picture.
  - **Templates**: project templates and Lab templates, each with its cover.
  - **Standout layers**: picked by a local score. Each card says why, e.g. "rendered 1× · kept 40 days".
  - **Looks**: each palette you used (from projects, scenes and templates), and the slider looks saved on layers.
  - Each card has the scene's still, or the palette's swatches.
- **Search** covers names, projects, kinds (shader, particles, type…) and colors.
- **Filters**:
  - by kind: **All · Scenes · Layers · Looks**;
  - by project: a drop-down;
  - by look: **◆ Look** unfolds a row of the palettes you used, and clicking one keeps only work in those colors.

**How a layer is scored** (`MyWorkCore.score`, on this computer, nothing sent):
- 3 points for each render of its scene made after the layer was created. A render counts when its title or file
  names the scene, or when it is one of the project's renders and this is the project's main scene.
- 1 point for every 15 days the layer was kept, up to 90 days. The age comes from the time in the layer's id; the end
  date is the scene's last save.
- ½ point for each edit, up to 12. Edits are keyframes, saved looks (each counts twice), music links, locks and
  overrides.
- A layer with 3 points or more counts as a standout. The library shows the top 40.

**Where it opens:**
- **＋ New project › Start from › ★ My work…**. Pick something, then **Start from this**:
  - **A scene**: the new project's scene gets a copy of its layers with **fresh ids**. Its per-layer looks and music
    links move to the new ids. You get its song if you haven't picked one, and its palette.
  - **A layer**: the new scene is that one layer.
  - **A template**: the existing My templates or Lab template start.
  - **A look**: it sets the card's palette.
  - The card's own palette, size and frame rate still apply. If you pick a palette in the card, the copied layers'
    color sliders are recolored to it.
- **The Lab's ＋ Add › ★ From my work…** (right-click the preview) opens on **Layers**.
- **The sketch browser's ★ My work** button opens on **Scenes**.

**Reuse in the Lab:**
- **Start a new scene from this** (a scene): a new scene with fresh layer ids, its frame size, timeline, song and
  palette, opened at once. The original is never changed.
- **Start a new scene from this** (a template): `LabTemplates.create()`, as 📐 does.
- **Add this layer here** (a layer): a copy of that layer goes on top of the scene on screen.
  - **"Recolor to this project's palette"** is ticked by default and shows the swatches. It recolors the layer's
    color sliders with the same recolor a new project's starting point uses (`InstantCore.tune`).
  - It is **one undo step**: the toast's Undo, or the dock's ↶ / Alt+Shift+Z / `/undo-edit`.
- **Use this look**:
  - **a palette**: ◆ Project look's recolor on every layer's color sliders;
  - **a saved slider look**: its values go onto the layers that have those sliders.
  - Either way it is **one undo step**.

**✦ Like my past work** (in the card's filter row). It runs only when you click:
1. The first click only shows **the cost and what will be read**. For example: "Reads a short summary of 8 things in
   your library (titles, palettes, layer kinds; no code or pictures)… About 1.2k tokens in and 350 out · Claude (the
   cheapest helper)". Then you choose **✦ Suggest 3** or **Cancel**.
2. **✦ Suggest 3** makes one lean helper call on the cheapest model, on the project's AI (in the card: "Who directs").
   It sends the summary (at most 36 lines) and the brief: in the card, the name and "What are you making?"; in the Lab,
   the project's notes and its brief's look.
3. Three ideas come back, each with a title, a reason and **Start from this**. That button does the item's action (in
   the card it fills Start from).

## Files
- `mywork-core.js` (new, pure, loads in Node): `gather` (the library from projects, scenes, stills, renders, extras and
  templates), `score` / `editsOf` / `bornOf` / `rendersOf`, `filter` / `near` / `looks` / `projectsOf`, `freshLayers` /
  `layerCopy`, and `summary` / `prompt` / `parse` / `estimate` / `costLine`.
- `mywork.js`, `mywork.css` (new): the card, the reads (templates are read straight from `data/templates/`, so the Lab
  doesn't need to load), the Lab actions, the AI call, and `cardPatch` / `into` for the new-project card. It is the lazy
  group **mywork** (`tier: 'use'`, after `projects`), with a `lazy-at.js#mywork` tag in index.html and a line in
  docs/lazy-groups.md. The manifest was regenerated: the group registers nothing at the first screen.
- `projcreate.js`: the ★ My work… chip, the hint, a check in `make()`, and the `mywork` start in `prepare()` (all
  marked). `projcreate-core.js`: the summary line.
- `tools/three.js`: one row in ＋ Add and one button in the sketch browser (marked).
- `dev/fake-common.js`: the fake answer for ✦ Like my past work. `dev/fake-liveness.js`: that prompt is excluded from
  the long-task words (a project named "Quiet Bloom" triggered the "quiet" scenario).
- `dev/checks/starters134.js`, and `dev/run-checks.js`: the group `starters134`.

The first screen is unchanged: 62 scripts and 1,582 KB, within the 1,586 KB budget.

## Tests
One app check, **dev/checks/starters134.js** (group `starters134`). It runs on the check's own temp data with fake
engines, mostly by clicks. Its fixtures are two projects ("Neon Rain", with a rendered scene and a layer kept 40 days;
"Quiet Bloom", new) and a template written into the temp data's templates folder.
1. **The library**:
   - it lists both main scenes, the template, and the standout layers (Sparks: rendered and kept 40 days; Tunnel:
     rendered);
   - the new, unrendered Petals is left out;
   - the "why" line is right, and every card has a picture or swatches.
2. **Search and filters**:
   - "sparks" finds only that layer;
   - Looks and Scenes each show only their own kind;
   - the project filter shows one project's items;
   - the look swatches stay folded behind ◆ Look, and one palette filters to its colors (a second click clears it).
3. **✦ Like my past work**:
   - the cost shows first ("tokens · Claude"), and nothing is sent until the next click;
   - one call goes out, with the summary and the brief and no code;
   - 3 ideas come back, each with Start from this, which fills the card's Start from.
4. **A new scene from a past one**:
   - Start from › ★ My work › Neon Rain › Create: the new scene has Tunnel and Sparks, and Sparks has a fresh id. The
     original is untouched.
   - In the sketch browser, ★ My work › Quiet Bloom › Start a new scene from this: a new scene, a fresh copy, the
     palette, and the original untouched.
5. **Add this layer here and Use this look**:
   - Sparks goes onto Quiet Bloom recolored to its palette, and one Undo puts the scene back exactly;
   - unticked, the layer keeps its own colors;
   - Use this look puts Neon Rain's palette on the color sliders as one step, and one Undo takes it back;
   - the originals never change.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1`, `flock … run-checks.js --exact`):
`starters134` ✓ (64 s), `projcreate128` ✓ (75 s), `next129` ✓ (51 s), `projmenu128` ✓ (74 s), `unit:boot-test` ✓:
**5/5 passed** (4 min). `node dev/boot-test.js` passed (3,023 checks). `slim116-test` ✓ and `selfmap118-test` ✓.

## For the patch notes
- **Start from your own work.** A new **★ My work** library gathers your past projects' scenes, your templates, the
  layers you kept a long time or rendered, and the colour palettes you used, with pictures.
  - Search it, or filter by kind, by project or by colours.
  - It is in **＋ New project › Start from**, in the Lab's **＋ Add › ★ From my work…**, and in the sketch browser.
- **Reuse in a couple of clicks:**
  - **Start a new scene from this** makes a fresh copy. Your original is never changed.
  - **Add this layer here** puts one of your past layers into the scene, recoloured to this project's palette if you
    leave the tick on. One Undo takes it back.
  - **Use this look** puts one of your palettes or saved looks on the scene, also with one Undo.
- **✦ Like my past work** suggests 3 starting points from your library for the project you're starting.
  - It shows what it will read and what it costs first, and runs only when you click again.
  - Each idea has a "Start from this" button.

## For Codex
- **No Codex-owned file was changed** this round. `astra*`, `codex-*`, `projects*`, `project-workspace*`,
  `sync-engine.js`, `cloud-files.js`, `workbench-*` and `engine-watch.js` are untouched.
- The new-project card still makes projects through `ProjectWorkspace.create()` and projcreate128's `options.prepare(p)`.
  - The new start writes `p.workspace.start = 'mywork'`. This is an additive value of an existing field, and
    `ProjectWorkspaceCore.workspace()` keeps it as it is.
- ★ My work only **reads** these stores: kv `projects` (through `Projects.live()` / `Projects.Src`), `three-sketches`,
  `three-thumbs`, `renders`, `three-lab-extras`, and `data/templates/*/template.json`.
  - It writes nothing new. Its copies are new scenes made through the Lab's own `scenes.create` / `setExtras`.
  - There is no new kv store and nothing new to sync.
