# Round 140 · dropmedia140: drop media straight onto the timeline

The owner wanted to drag pictures, clips and songs onto the Lab timeline, so that each one lands at the right time
as a layer. Before, a drop on the preview added a layer that played for the whole song, and its time then had to be
set by hand. Now a file dropped on the timeline lands where it was let go, on the beat grid, as one undo step. No AI
is involved.

## What existed (and what each does today)

| Piece | What it does | Used here? |
| --- | --- | --- |
| **dragdrop** (round 38: `dragdrop.js`, `dragdrop-core.js`, `dev/checks/dragdrop.js`) | One window-level handler for drops from Finder / Explorer: chats attach, the **Lab preview** takes songs (the song), videos (the footage, or a looping video layer when a song plays), pictures (a picture layer: a reference + `pictureLayer(key)` with Fit / Zoom / Slow drift), models, packs. An overlay says what will happen. It only handles chats, the preview, template slots and the board, so a drop on the timeline did nothing. | **Reused:** the picture layer's code (`DragDropCore.pictureLayer`) and the way checks simulate drops. dragdrop itself is unchanged. |
| **Dropping on the preview** (lookmatch / refmatch131) | Alt+drop a picture on the preview opens 🎨 Match this look and ✦ Make a layer like this (the director). | Not touched: the preview keeps its drops. The timeline is a new drop spot next to it. |
| **Lab references** (`tools/three.js`, 🖼 References) | The scene's files. `addRef` copies each file into the scene's references (`hub.importRef`), and `refTexture('key')` uses it in code. Cards: Copy code, Ask director, ✦ Like this, 🎨 Palette… | **Reused as is:** every dropped file becomes a reference through `ThreeLab.addReference`. It copies, as references always have, and no other copies are made. Picture and clip cards can now also be **dragged onto the timeline**. |
| **Footage loading** (`tools/three-media.js` `load`, `tools/three-frames*.js`) | A video loaded as the timeline itself (frame-exact). | Not used. A clip dropped on the timeline becomes a **layer** that plays its own video in time with the song, and the song stays. |
| **The song loader** (`ThreeLab.cmd().loadSong`) | Puts a song (or a video) on the scene's timeline. | **Reused** for a dropped song, after the question. |
| **The sequence** (`tools/three-seq.js`, round 8) | Its own tracks already take dropped files, tiles and board vibes as **clips**. | Not touched. That is the ▤ Sequence view. This round's drop is the scene's own timeline, where each file becomes a **layer**. |
| **Layer times** (`L.in / L.out / fadeIn / fadeOut`, the timeline's layer tracks) | A layer can play from a time to a time, with fades. Its bar on the timeline already drags (the middle moves it, the edges trim it). | **Reused:** the dropped layers get their times and fades there, so they can be moved and resized like any layer. |
| **inspodrop65** (`board-drop.js`) | Dragging a moodboard tile into a chat attaches the real picture or clip. A web picture is downloaded once into attachments (`intoAttachments`). | **Reused:** a moodboard tile dragged onto the timeline gives its own file, or its web picture through `BoardDrop._.intoAttachments`. |
| **The board's drop** (`board-drawer.js`, `application/x-hearth-ref`) | Tiles drag out with `{ boardId, itemIds }`. | **Read:** the same drag data, so tiles drop onto the timeline too. |
| **Groups** (outline136, `LayerGroups`) | `L.group = { id, name, color }`, colour tags. | **Reused:** dropped layers go into a **"Dropped"** group. |
| **LabDirect** | The Lab's own Ctrl/⌘+Z steps (inside the timeline's undo when a song is loaded). | **Reused:** each drop is one step. |

## What's new, and where the owner clicks

Nothing new sits on screen. **Drag onto the Lab timeline** (the song's waveform):
- **files from Finder / Explorer**;
- a **moodboard tile** from the board drawer (▦, Ctrl+Shift+M);
- a **picture or clip card** from the Lab's **🖼 References** (the dialog fades while you drag, so the timeline behind
  it can take the drop).

While you drag, a **thin ghost bar** shows where each item will land, with its name. Moodboard and reference drags
show their real names. A drag from the computer shows "picture" or "clip", because the system only gives names on
the drop.

- **A picture** becomes a picture layer that starts at the drop and ends at the next cue, or at the end of its
  section if that comes first. It fades in and out. Drag its bar to move it, or drag its edges to change the length.
- **A video clip** becomes a footage layer at the drop, as long as the clip. The clip plays in time with the timeline
  and starts at the layer's start. Its "Starts at" slider follows when you move the bar.
- **A song** becomes the scene's song. If the scene already has one, Hearth first asks **"Use as the scene's song?"**.
- **Several files** land one after another from the drop. Each starts on a bar, and each picture lasts one bar. Hold
  **Alt** to lay them out on beats instead.
- **Snapping:** one item lands on the nearest beat. Hold **Alt** to put it exactly where you let go.
- New layers go into the **"Dropped"** group. The group is created on the first drop and gets a colour tag close to
  the project's palette (or the scene's). Each layer's colour also comes from that palette.
- **Each drop is one Ctrl/⌘+Z**, even when it brings several files.
- A short note says what landed where. The keys sheet has one line about it.

## Files
- `tools/three-dropmedia-core.js` (new, pure, loads in Node): which kinds the timeline takes, the beat grid, the
  next cue or section end, the plan (where each item lands, its length and fades), the group colour tag, and the
  footage layer's code.
- `tools/three-dropmedia.js` (new, `LabDropMedia`): what is being dragged (files, moodboard tiles, references), the
  ghost bars (drawn on the timeline through `addHooks`), the drop, the references (`ThreeLab.addReference`), the
  "Dropped" group, the song question, the one undo step, and a moved clip's "Starts at".
- Lazy group **dropmedia** (`tier: 'use'`, after `lab` and `dragdrop`) in `lazy-data.js`, with the manifest re-run
  (`lazy-meta.js`), `index.html`'s `lazy-at.js#dropmedia` and `docs/lazy-groups.md`. The timeline loads it on the
  first drag over it.
- `tools/three-media.js` (marked): the timeline's drop zone (dragover / dragleave / drop on the waveform), which hands
  each event to the group.
- `tools/three.js` (marked): `stageHooks.addLayers` (layers with their times, fades, colour and group, in one go),
  `stageHooks.dropUndo`, `removeLayers(…, { quiet })` (the undo takes them away with no toast and no step of its own),
  the track's `onChange` telling a moved clip, and draggable picture / clip cards in 🖼 References.
- `dev/checks/dropmedia140.js` (new), and in `dev/run-checks.js` the `dropmedia140` group and the fixture clip
  `/tmp/hearth-dropmedia140-clip.webm` (160×90, 3 s, made with ffmpeg).

First screen: unchanged (boot-test: 62 scripts, 1537 KB of 1547 KB). Nothing was added to any prompt or tool.

## Tests
One app check, **`dev/checks/dropmedia140.js`** (group `dropmedia140`). It uses its own temp data, pictures it
draws itself, the fixture song and the tiny fixture clip. The drops are synthetic OS drops (DataTransfer files, the
way `dev/checks/dragdrop.js` does them) on the timeline's canvas, at a known time:
1. Dragging a picture shows one ghost bar named "sunset", from the bar to the cue, and nothing is added. Three
   pictures show three ghosts, one per bar. Leaving the timeline clears them.
2. A picture dropped at a bar becomes a picture layer from that bar to the next cue, with fades, in the "Dropped"
   group. Its file is one of the scene's references, and the drop is one undo step.
3. A 3 s clip dropped becomes a footage layer on a beat, 3 s long, with its "Starts at" there.
4. Three pictures land one after another, each on a bar and one bar long, in the same group, as one undo step.
5. Alt+drop lands exactly where the picture was let go (to the pixel), off the grid.
6. Ctrl/⌘+Z four times: the Alt drop goes, then the three pictures together, then the clip, then the first picture.
   The scene is back as it was.
7. A song dropped while one is loaded asks "Use as the scene's song?". Cancel keeps the song and the layers.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`): `dropmedia140` ✓,
`dragdrop` ✓, `refmatch131` ✓, `outline136` ✓, `labchat92` ✓, `unit:boot-test` ✓, `unit:lazymanifest-test` ✓,
`unit:dragdrop-test` ✓, `unit:slim116-test` ✓, `unit:selfmap118-test` ✓ (10/10), and `node dev/boot-test.js` ✓ (3168).

## Risks / not done
- A drag from the computer can't show file names before the drop: its ghosts say "picture" or "clip", and an unknown
  clip's ghost is 4 bars long. The real names and lengths are used on the drop.
- The very first moodboard drag after the app starts may show generic ghost names, because the group loads on that
  first drag. The drop itself is right.
- A song drop is not part of the layer undo: the song loader works as it always has.
- The footage layer seeks its video to follow the timeline, so a render follows it frame by frame. A very long or
  heavy clip can lag a little while scrubbing.
- Not covered by the check: moodboard and reference-card drags (they use the same plan and placement as the file
  drops).

## For the patch notes
- **Drop pictures, clips and songs straight onto the Lab timeline.** Drag them from your computer, the moodboard
  drawer or the Lab's References.
- A thin bar shows where each one will land before you let go.
- **A picture** plays from where you drop it to the next cue (or the end of that part of the song), and fades in and
  out. **A clip** plays from there for its own length. Drag its bar to move it or change its length.
- **A song** becomes the scene's song. If the scene already has one, Hearth asks first.
- **Drop several at once** and they line up one after another, one per bar. Hold Alt to line them up on beats.
- Drops land on the beat. Hold Alt to place one exactly where you let go.
- New layers go into a "Dropped" group, coloured to match your project. **One Undo takes back a whole drop.**

## For Codex
No Codex-owned file was edited. `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged. The project's palette is only read, through
`Projects.ofItem('scene', id)` and `LabProjLook.paletteOf(project)`. No store was added. Dropped layers are ordinary
layers of the scene (kv `three-sketches`) with `in`, `out`, `fadeIn`, `fadeOut`, `color` and `group`, and the files are
ordinary scene references, so they sync as before.
