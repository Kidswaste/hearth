# Scene versions, compared side by side (round 132, versions132)

The owner works with AI directors that change his scenes a lot, and wants to go back and compare. This round gives a
scene **named versions** (saved on demand, or automatic at the moments that matter), one compact list of them, and
**2–4 versions playing live side by side** in step with the song, with **Use this one** and **Take only…** as one Undo.

## What existed (and what each does today)

- **⏱ Time machine** (round 23, `tools/three-history*.js`, kv `three-tm-<scene>`): every meaningful change of a scene is
  a version with who (you / Claude / Astra / crew), a one-line label and a 120 px picture. Stored as deltas against a few
  full states, thinned (all of today, hourly for the week, daily after, at most 160), merged by id across computers. It
  already bookmarks the start of each director turn (`v.mark`), restores (undoable), picks a layer / the colors / the
  sliders from a version, branches, and compares **two pictures** in a split wipe. No names; nothing live.
- **🕘 Earlier versions** (versions75, `versions*.js`): one timeline per thing gathered from every safety copy (`.prev`,
  automatic copies, sync's base, conflicts, backups…), with a plain difference and a safe Restore, plus Deleted things.
  It answers "what did this look like before?" from copies, not named versions of a scene.
- **Lab history** (Sketch ▾ › History › Earlier versions and deleted sketches): the selected layer's code versions and
  the deleted sketches (kv `three-history`).
- **aiundo / undoall** (rounds 28, 41): one timeline of what AIs changed, and one Ctrl/⌘+Z log for the app. Each uses
  the place's own undo (for scenes, the time machine).
- **LabTxn** (`tools/three-txn.js`): a snapshot before / after each AI tool call; one AI reply = one undo step (the
  dock's ↶, Alt+Shift+Z, `/undo-edit`); `LabTxn.step` (round 130) notes any other change as one undo step.
- **◧ Before / after** (abcompare): hold B or a split view against the state before the last change. Two states.
- **scenesafe**: a scenes read that failed is never "empty"; recovery of lost scenes.
- **✦ 3 takes** (takes130): three AI takes on backstage stages (`ThreeBackstage.make`), live and in step with the Lab's
  song, keep one as one Undo.

So the time machine already had the versions, the deltas, the thinning and the sync; the takes had the live stages and
the clock sync; LabTxn had the one-step undo. This round **extends those** instead of adding another store of scene
copies.

## What's new, and where the owner clicks

- **Sketch ▾ › History › 🕘 Scene versions…** (also the time machine's ⋯, `/scene-versions`, Ctrl/⌘+K "Lab: Scene
  versions"). A compact panel opens over the top right of the Lab preview. No new toolbar button.
  Each row: a tick box, a small picture, the name, when and who (● you / ✳ Claude / A Astra), ★ for named, "auto" for
  automatic. "Now" is the first row so a version can be compared with the scene as it is.
- **Save a version…** (in the panel's head, or Sketch ▾ › History › Save a version…, or `/scene-versions save <name>`):
  the scene as it is now, with a name. Named versions are never thinned out.
- **Automatic versions**, all from what the Lab already noted:
  - **before an AI reply that changed things**: the time machine's director-turn bookmark, listed as "Before Claude's
    reply: “…”" when that AI's edits followed it. It now also covers a chat that works on a scene without being a Three
    Director (a project's chat), and the bookmark gets its picture right away;
  - **before a first draft** (draft129): "Before the first draft";
  - **when a take is kept** (takes130): "Before take B: “…”" and "Kept take B: “…”".
- **Compare**: tick 2–4 rows, click **Compare N**. A card shows the versions oldest → newest, each **playing live** on its
  own backstage stage (480 px, 30 fps, the scene's song, silent) laid over its panel and kept on the Lab's clock (as the
  takes are). Under each: its name, when, who and **one line of what differs** from the oldest one, e.g. "1 slider
  changed, 1 layer added (Glow ring), keyframes on Drop". ✕ or Esc closes it and frees the stages.
- **Use this one** (on a panel, or a row's ⋯): the scene becomes that version, **one undo step** (the toast's Undo, the
  dock's ↶, Alt+Shift+Z, `/undo-edit`).
- **Take only…** (on a panel, or a row's ⋯): pick one of that version's layers; it comes back into the scene as it is
  (replaced, or put back where it was), also **one undo step**.
- **Delete** (a row's ⋯): the version goes to the **Trash** (kv `three-versions-trash`, 30 days, at most 40), with its whole
  state. The toast's Undo or the panel's ⋯ › Trash puts it back.

## Storage

- Versions stay in the time machine's history (kv `three-tm-<scene>`): a named version is a version with `name`, an
  automatic one has `auto: { why, label, by }`. Deltas against a few full states, so a version costs only what changed.
- Pruning: the existing thinning, except that **named versions are never thinned and never count against the cap**
  (160 unnamed). Automatic versions are kept for the week like the director bookmarks, then the last of each day.
- Sync: unchanged. The history syncs as before and merges by version id, so names and tags travel with their versions,
  and a deleted version stays deleted.
- **A read that failed is never "empty"**: the time machine's history is now read with the store's status. If it can't
  be read, the list says so, and nothing is saved over the file; once it reads again, the two are merged
  (`TMCore.mergeDocs`). Deleting a version reads the Trash for sure first: if it can't be read, nothing is deleted.

## Files

- `tools/three-versions-core.js` (new, pure, loads in Node, global `SceneVersCore`): the listed versions, the one-line
  diff, the Trash.
- `tools/three-versions.js` (new, `LabVersions`): the panel, save / use / take only / delete / put back, the compare
  card with live stages and clock sync, `/scene-versions`.
- `tools/three-versions.css` (new).
- `tools/three-history.js` (marked): `saveVersion`, `autoVersion`, `removeVersion`, `putBack`, `readable`; tags in
  `record`; a bookmark on a named version gets its own version; listed versions get their picture at once
  (`thumbNow`); the status read and merge-on-heal; linked chats are bookmarked.
- `tools/three-history-core.js` (marked): thinning keeps named versions, automatic ones for the week; `mergeDocs`.
- `tools/three-history-ui.js` (marked): the ⋯ row. `tools/three.js` (marked): the two Sketch ▾ › History rows.
- `tools/three-takes.js` (marked): the two automatic versions when a take is kept.
- `projectbrief-draft.js` (marked): the automatic version before a first draft.
- `lazy-data.js`: the new **scenevers** group (tier `use`, after `lab`), manifest regenerated; `index.html`'s lazy-at
  tag; `docs/lazy-groups.md`.
- `dev/checks/versions132.js` and the `versions132` group in `dev/run-checks.js`.

No prompt, MCP tool or guide changed. The first screen is unchanged (boot-test: 62 scripts, 1580 KB, budget 1586 KB).

## Tests

One app check, **dev/checks/versions132.js** (group `versions132`, `--fake-engines`), on its own temp data, by clicks:
1. Sketch ▾ › History has the two rows; the panel opens over the preview; **Save a version…** with a name; then a fake
   Claude reply (real MCP calls: a layer "Glow ring" added, a slider moved): the list has "Before Claude's reply" with
   the state from before it.
2. The list: name, when, who, pictures, Now.
3. Tick 2 + **Compare 2**: two live panels (each stage over its box, running, drawing different pictures), one clock,
   and the diff line "1 slider changed, 1 layer added (Glow ring)". The scene is untouched.
4. **Use this one**: the scene equals the version exactly (the time machine's signature); one undo step; one
   `/undo-edit` restores LabTxn's signature exactly.
5. **Take only…** the main layer from the older version: that layer as it was, Glow ring stays; one undo step.
6. Thinning 40 days ahead keeps every named version and drops the old automatic ones; on a copy, the cap of 100 keeps all
   6 named of 300.
7. **Delete** from a row's ⋯: off the list, in the Trash with its state, and back from it.

Run (`HEARTH_THREE_DIR` set, through `dev/run-checks.js --exact`): `versions132` ✓, `takes130` ✓, `draft129` ✓,
`labchat92` ✓, `versions75` ✓, `timemachine` ✓, `unit:timemachine-test` ✓, `unit:versions75-test` ✓,
`unit:lazymanifest-test` ✓, `node dev/boot-test.js` ✓ (2962), plus `slim116-test` and `selfmap118-test` ✓.

## Risks / not done

- A version is the time machine's state: layers (code, props, keyframes, looks), unsaved slider values and the palette.
  The song's cues / markers and references are not part of a version (as before for the time machine).
- Compare runs up to four extra WebGL pages while the card is open; they go when it closes.
- References (pictures, videos) aren't loaded on the compare stages, as for the takes.
- The Trash is the Lab's own (like deleted sketches and projects' Recently deleted), not the computer's Trash; it is not
  yet listed in versions75's Deleted things.
- The diff line compares each version with the oldest one picked, not with "now" (pick Now to compare with the scene).

## For the patch notes

- **🕘 Scene versions**: in the Lab, Sketch ▾ › History › Scene versions. One small list of your scene's versions,
  each with a picture, when, and who made it (you, Claude or Astra).
- **Save a version…** with a name whenever you like. Named versions are kept for good.
- Hearth also saves one by itself before an AI reply changes your scene, before a first draft, and when you keep a take.
- **Compare**: tick 2 to 4 and click Compare. They play side by side, live and in time with your song, each with one
  line saying what's different ("1 layer added (Glow ring), 3 sliders changed").
- **Use this one** puts that version back. **Take only…** brings back just one layer from it. Either way, one Undo
  undoes it.
- Deleting a version puts it in the Trash for 30 days, and you can bring it back.

## For Codex

No Codex-owned file was edited. `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged. (`projectbrief-draft.js` got one marked line; it is
not in the Codex list.) The new kv store `three-versions-trash` and the new version fields (`name`, `auto`) sync through
the existing kv sync and its by-id merge; nothing in sync needed to change.
