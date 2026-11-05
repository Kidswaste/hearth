# Round 129 · next129: a next step after each director reply, and projects saved as templates

The owner asked for two upgrades to the Lab work:
1. a small next-step suggestion under each director reply;
2. a way to save a project as a template and start new projects from it.

## 1. "Next: <step>" under a director's reply

### What it does
Under the last finished reply in a **project's Lab chat** or any **Three Director** chat there is one small chip:
**Next: <short step>** and a **✕**.

The step comes from the first of these that has one:
1. **The brief's next unticked step** (`ProjectBrief.get(id)`: `steps` / `done`, aiprep128).
2. **The reply's own suggestions.** When the AI ends a reply with `<suggest>` buttons (native.js keeps them as
   `m.suggest`), the first one that isn't a `/command` is used.
3. **A quick local rule** from the scene and the chat:
   - the scene has a song but no layer follows it (no ♪ link on a slider, no keyframes, and no layer code that reads
     the sound) → "Key the main layer to the drop";
   - the AI edited the scene and hasn't taken a screenshot since → "Check it on screen".

The local rule reads the scene only when the Lab is already loaded. Nothing loads for it.

Rules for the chip:
- No AI call is ever made for it.
- **A click sends it as your message.** A brief step goes through `ProjectBrief.start`, which also ticks the step.
  Nothing is sent without the click.
- **One chip at a time**, on the last reply only. ✕ hides it for that reply. **Typing in the chat box hides it**, and
  sending a message removes it. The next finished reply gets a new one.

### Where the owner clicks
- The chip is under the reply, in the project's Lab chat (the Desk's chat) and in the Three Director dock.
- **Turning it off:** ⋯ AI setup › Habits › **Shows a "Next:" step under the last reply**. It is on by default, and
  the setting is kept on this computer (`store` key `nextstep.on`).

### Files
- `nextstep-core.js` holds the pure rules (`pick`, `keyed`, `unchecked`, `short`) and loads in Node.
- `nextstep.js` and `nextstep.css` draw the chip through `Native.hooks.render` and `hooks.send`. They are in the lazy
  group **nextstep** (after `projects`, loaded in an idle moment).
- `options.js` gets the switch: one row in Habits.

## 2. Save a project as a template

### What it does
In the project menu, **Share & keep › Save as a template…** opens a small card with:
- **Name** (it starts as the project's name);
- a **Cover picture**: the scene's still if there is one, or **📷 Use a frame from the Lab** (it opens the main scene
  if needed). With no frame, the cover is a picture of the palette with the name;
- **Include the song** (off by default). When ticked, the song or footage is copied into the template;
- **Include the moodboard's notes and pictures** (off by default).

A template keeps:
- the **main scene**: its layers, sliders and music links;
- its **palette**, **size** and **frame rate** (the project's own settings first, then the scene's);
- the **brief's look and steps**;
- the song or footage and the moodboard, only when ticked.

**Where it's stored:** it is a Lab template, so it is stored, synced and trashed the way Lab templates already are:
- `data/templates/<id>/template.json`, with `thumb.jpg` and `files/`. It has an extra `project` part:
  `{ v, from, palette, frame, fps, song, brief: { look, steps }, board: { notes, pictures } }`.
- It is written by labtemplates' own writer, which copies its media into `files/`.
- It syncs like the Lab's templates (`templates/` is a synced, needed folder in sync-kinds.js).
- It also shows in the Lab's 📐 My templates.

**Starting from it:** ＋ New project › **Start from** › **My templates** shows each template as a card with its cover.
- Picking one fills in the card's palette, size and frame rate. You can still change them.
- Create makes a **new project with fresh ids**: a new project, chat, scene and moodboard. Layers get new ids (the main
  layer stays "main") and their per-layer music links move with them.
- The new scene gets the template's layers, palette, size and frame rate.
- If the template kept a song, it is copied next to the chats' attachments, so the project keeps it even if the
  template is deleted.
- The moodboard gets the template's notes and pictures. The pictures are copied in, as a drop does.
- The scene's references are added once the scene is on screen.
- The brief's look and steps go to `ProjectBrief.seed(id, { look, steps })` when ProjectBrief has it. Until then they
  go into the project's notes, which the brief reads as your intent when it is prepared.

**Deleting:** each card's **✕** asks first ("Delete this template?" · Move to Trash). The folder then goes to the
Trash, and Ctrl/⌘+Z brings it back through UndoAll, the same as the Lab's template delete.

### Files
- `projtemplates.js` and `projtemplates.css`: lazy group **projtemplates** (`tier: 'use'`, after `projects`).
- `projmenu.js`: one row, `template`.
- `projcreate.js`:
  - My templates in Start from;
  - `fromProjTemplate()` in `prepare()`;
  - the song copy in `make()`;
  - the references in `after()`.
- `projcreate-core.js`: the summary line for a template start.
- `tools/three-templates.js`: a new `LabTemplates.saveMade(t, thumb)` that writes a template made elsewhere.
- `tools/three-templates-core.js`: `mediaPaths()` also lists a project template's moodboard pictures, so they are
  copied into `files/`.
- `lazy-data.js`, `index.html` (the `lazy-at.js` tag) and `docs/lazy-groups.md`: the two groups. The manifest was
  regenerated (`node dev/lazy-manifest.js`): neither group registers anything at the first screen.
- `dev/checks/projmenu128.js`: one expectation for the new row (it opens its card).

The first screen is unchanged: 62 scripts, 1,576 KB (budget 1,586).

## Tests
One app check, **dev/checks/next129.js** (group **next129** in dev/run-checks.js, with projcreate128, projmenu128,
labchat92 and boot-test). It uses fake engines and makes no real AI calls. Everything is done by clicks.

1. **The chip, after a fake director reply** in a project's Lab chat:
   - with a brief, it shows the next unticked step (a stand-in ProjectBrief);
   - with no brief, the reply's suggestion;
   - with neither, a song and no keyed layer, "Key the main layer to the drop";
   - with no song and an edit with no screenshot since, "Check it on screen";
   - after a screenshot, no chip at all.
2. **Clicking, typing and the setting:**
   - nothing is sent before the click;
   - the click sends the step as the owner's message, and the chip goes;
   - typing in the chat box hides it;
   - ⋯ AI setup's switch turns it off (a new reply gets none) and on again.
3. **Save as a template, then Start from it:**
   - Share & keep › Save as a template… with the moodboard ticked writes the project part (palette, 9:16, 60 fps, the
     note, no song);
   - the new-project card lists it under My templates with its cover, and picking it fills in 9:16 · 60 fps and the
     colours;
   - Create gives a new project with fresh ids, the scene's layers (the second layer with a new id), the palette,
     9:16, 60 fps and the moodboard's note. The source project is unchanged.
4. **Delete asks first:** Cancel keeps the template, and Move to Trash removes its folder and its card.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1`, `flock … run-checks.js --exact`):
`next129` ✓ (50 s), `projcreate128` ✓ (72 s), `projmenu128` ✓ (74 s), `labchat92` ✓ (119 s), `unit:boot-test` ✓: **5/5 passed** (5 min).
`node dev/boot-test.js` passed (2,871 checks, first screen within budget).

## For the patch notes
- **A next step after each reply.** In a project's Lab chat and in the Three Director, the AI's last reply now has a
  small "Next: …" button.
  - It suggests the next step of the project's plan, or the AI's own suggestion, or a quick tip such as "Check it on
    screen".
  - Click it to send it. It disappears when you start typing, and ✕ hides it.
  - You can turn it off in ⋯ AI setup › Habits.
- **Save a project as a template.** In a project's menu, Share & keep › **Save as a template…** keeps the project's
  main scene, its colours, size and frame rate, and its plan's look and steps, under a name and a cover picture taken
  from the Lab. You can tick "include the song" and "include the moodboard's notes and pictures".
  - Your templates show under **My templates** when you start a new project. A click starts a fresh project from one.
  - Deleting a template asks first and puts it in the Trash.

## For Codex
- **No Codex-owned file was changed** this round. `projects*`, `project-workspace*`, `sync-engine.js`,
  `cloud-files.js`, `astra*`, `codex-*`, `workbench-*` and `engine-watch.js` are untouched.
- A project started from a template uses `ProjectWorkspace.create()` as before, through projcreate128's
  `options.prepare(p)`.
- It writes two additive workspace fields: `p.workspace.start = 'projtemplate'` and `p.workspace.template = <its
  name>`. `ProjectWorkspaceCore.workspace()` keeps them as they are.
- Project templates live in `data/templates/` (the Lab's templates folder). They sync and back up the way that folder
  already does. No new kv store.
- **For draft129 (projectbrief\*.js):** please add `ProjectBrief.seed(projectId, { look, steps })`. It would set a
  project's brief from a template (no AI pass) as the brief's look and steps. `projtemplates.js` `fillBrief()` already
  calls it when it exists. Until then the look and steps go into the new project's notes.
- **For looks129:** no Lab look or palette code was touched. A template keeps `scene.palette` as it is, and the new
  scene gets it as `x.palette`.
