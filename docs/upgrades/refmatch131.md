# Make a layer like this picture (round 131, refmatch131)

The owner asked: "I drop or pick a picture (from the moodboard, the Lab's references or the computer) and say: make a
layer like this." The director studies the picture once and builds ONE new layer in its spirit, with sliders, in the
picture's colours. It's one undo step, and Closer / Looser asks for one more pass.

## What existed (and what each does today)

- **🎨 Look match** (lookmatch, `tools/three-lookmatch*.js`, round 28): it reads a picture or clip here (no AI) with the
  board's vibe reader and `LookCore`: palette, light, contrast, saturation, warmth, grain, vignette and bars. It writes
  the gap into the scene's ◐ Grade and Film & lens layers, so it changes the colours and light of the whole scene, but
  it adds no shapes. Its **✦ Ask the director** sends a small picture and the numbers, with the cost first, and asks
  the director to "adapt shapes, light and motion" across the scene. That's an open-ended request, so it doesn't make
  one new layer, give it sliders or offer one undo. Ways in: a board item's "🎨 Use this look in the Lab", a picture
  dropped on the preview, the preview's ✦ More › Look & motion, the director's ◎ mission, `/look-match`. Its picker
  (`LookMatch.pick()`) already offers a file, the moodboard and recent renders.
- **Lab references** (`tools/three.js`, 🖼 References): the scene's files (pictures, clips, models, sounds) with
  `refTexture('name')` in code. Each picture's card has Copy code, Ask director (a draft that attaches the picture),
  Show, 🎨 Palette (the picture's colours become the sketch palette, `paletteFrom`) and 🗑.
- **`Kit.paletteFromImage`** (kit.js): k-means dominant colours of any picture, already used by the ◆ Project look
  strip (looks129) and the new-project wizard.
- **The moodboard** (board.js / board-menus.js): items with a right-click menu, and the "Use this look in the Lab" row.
  The ◆ Project look strip (`tools/three-projlook.js`) holds the project's palette (the owner's pick, the moodboard's or
  the brief's): `LabProjLook.paletteOf(project)`.
- **The critique's contact sheet** (critique130): pictures of the scene's own frames for one AI look. It isn't a
  reference source, so it is unchanged.
- **`three_references`** (three_do references): list (with pictures), add, rename, remove, palette.
- **draft129's run pattern** (`projectbrief-draft.js`): cost from director-cost, one director message, the reply is one
  LabTxn step, and undo through `LabTxn.undoTurn` or `restore`. The new flow reuses this pattern.

Nothing made one new layer from a picture. The new flow is built on the pieces above: lookmatch's reader and picker,
Kit's palette, the projlook palette, the references' card and draft129's run and undo.

## What's new, and where the owner clicks

- **✦ Like this** on a picture's card in **🖼 References** (in the Lab).
- **✦ Make a layer like this** in a **moodboard** item's right-click menu (pictures, GIFs and web pages), just under
  "🎨 Use this look in the Lab".
- **✦ Make a layer like this** in the menu that opens when a picture is **dropped on the Lab preview** (next to Match
  this look).
- **`/like <reference name>`**, `/like <picture file>`, or **`/like` alone**, which opens lookmatch's picker: a file,
  the moodboard or a render. Also `/like closer | looser | undo | status`.
- **Ctrl/⌘+K:** "Lab: Make a layer like a picture…".
- **The director's own op:** `three_do references {action: "like", name}`. It returns the picture (small), the palette
  read from it and a short brief, so when the owner types "make a layer like sunset" in the chat, the director can do
  it itself. The op only reads: it is no undo step.

Each way in opens **one small card over the bottom left of the Lab preview**. No toolbar row is added. The card shows:
- the picture, its palette (read here with `Kit.paletteFromImage`) and its look in words (lookmatch's reader);
- **☐ Use the project's palette**, only when the scene belongs to a project that has a palette. Ticked, the project's
  colours replace the picture's;
- **☐ Put the picture itself in the layer**, only for a Lab reference. It's off by default: the layer borrows the
  picture's feel and never shows the picture itself;
- an optional "Anything to add?" line;
- **the cost line before anything runs**, for example "About 12k tokens in (1 picture, most re-read from the cache) and
  2k out · Claude";
- **✦ Make the layer** and Cancel.

**Nothing is sent until ✦ Make the layer.** Even the small picture (≤ 512 px JPEG) is saved only on that click. The
docked director (Claude or Astra) then gets one message and that one picture. The message asks it to study the
composition, shapes, motion cues, palette, texture and light, then build ONE new layer named "Like <picture>" with the
Lab's tools. It uses the palette, adds `tweak()` sliders for the key parameters (colours, size or density, speed,
glow), leaves the other layers alone and checks the result with one small screenshot.

When the reply ends, the card shows **✓ "Like sunset" · 6 sliders** and its palette, with these buttons:
- **↶ Undo**: puts the scene back exactly as it was before that pass (it's one LabTxn step; the dock's ↶ does the
  same).
- **Closer**: one more pass on the same layer, closer to the picture. The picture goes again.
- **Looser**: one more pass, freer: the same mood and palette, its own shapes and motion. No picture is sent.
- **Keep**: closes the card.

Each pass is its own undo step, so ↶ Undo after Looser brings back the Closer version. **■ Stop** works while it builds.

## Files

- `tools/three-refmatch-core.js` (new, pure, loads in Node): the layer's name, the palette choice, the message, the
  Closer / Looser follow-up, the tool's brief, the picture size and its tokens, the estimate and cost line, which
  layers a reply added, and `/like`'s arguments.
- `tools/three-refmatch.js` (new, `LabRefMatch`): the card, the local reads, the cost (`hub.directorCost`), the run
  (`Native.ensureChat` + `Native.send(…, { chatId, images })`), finish, undo, Closer / Looser, `/like`, Ctrl/⌘+K and
  `op()` for three_do.
- `tools/three-refmatch.css` (new).
- `lazy-data.js`: the new `refmatch` group (use tier, after `lab`), with the manifest regenerated; `index.html`'s
  `lazy-at.js#refmatch` tag; `docs/lazy-groups.md`.
- `tools/three.js` (marked): ✦ Like this on a picture's reference card, and `three_references` action `like`.
- `tools/three-lookmatch.js` (marked): the dropped picture's menu row.
- `board-menus.js` (marked): the moodboard item's row.
- `tools/three-txn.js` (marked): `three_references {action: "like"}` counts as a read.
- `mcp/three-mcp.js`: `| like (name): build ONE layer like it.` in three_references' description. To stay within the
  full director's budget (9225 ≤ 9225), the same description was trimmed in a few words. The lean list and `three_do`'s
  description are unchanged.
- `dev/fake-common.js`: the fake director's answer (`likePlan`).
- `dev/checks/refmatch131.js`, and the `refmatch131` group in `dev/run-checks.js`.

### Budgets

- promptdiet: full director 9225 ≤ 9225 (unchanged budget), lean 2159 ≤ 2170 (unchanged). Nothing was added to the
  guide or to any prompt part. The message is the owner's message, paid only on the click.
- First screen: unchanged apart from the manifest lines (boot-test: 62 scripts, 1578 KB of a 1586 KB budget).

## Tests

One app check, **dev/checks/refmatch131.js** (group `refmatch131`, `--fake-engines`), on the check's own temp data and
a picture it draws itself (three colour blocks), by clicks:
1. The menu row: 🖼 References › the picture's card has **✦ Like this**, and a click opens the card.
2. The cost first: the card's line names tokens and Claude. After 2 s nothing has been sent: no message, no picture
   saved and the scene unchanged. The palette is read from the picture here (its three colours).
3. **✦ Make the layer**: ONE director message with ONE picture and the picture's palette. "Like sunset" is built with
   6 sliders in those colours and no `refTexture`, and the owner's layer is untouched. The fake director says it saw 1
   picture.
4. One **↶ Undo**: the scene is exactly as before (LabTxn's signature).
5. **Closer** (the picture again) and **Looser** (no picture) rework the same layer, and no second layer appears. One
   ↶ Undo takes back only the last pass.
6. `/like sunset` opens the same card and sends nothing. `three_do references like` returns the picture, the palette
   and the brief as a read (no undo step). The project palette wins only when ticked. Astra's cost line names Astra.

Run: `refmatch131` ✓ (1 min), `labchat92` ✓, `looks129` ✓, `unit:promptdiet-test` ✓, `unit:director-mcp-test` ✓,
`unit:lazymanifest-test` ✓, `unit:slim116-test` ✓, `unit:selfmap118-test` ✓, `node dev/boot-test.js` ✓ (2930). The card was checked by eye in a screenshot.

## Risks / not done

- The director could add more than one layer. The card names any extra layer ("It also added …"), and ↶ Undo takes all
  of it back.
- When the director's chat works on another scene (a chat linked backstage), the layer lands on that chat's scene.
  Undo follows the same scene.
- Clips aren't taken (a still picture only). Lookmatch still matches a clip's look and pacing.

## For the patch notes

- **Make a layer like a picture.** Pick a picture and the director builds one new layer in its spirit: similar shapes,
  motion and light, in the picture's colours, with sliders to tune it. It borrows the feel and never pastes the picture
  in, unless you tick that.
- Where: **✦ Like this** on a picture in the Lab's 🖼 References, **✦ Make a layer like this** when you right-click a
  moodboard picture or drop a picture on the Lab preview, or type `/like` (alone, it lets you pick a file).
- Before anything is sent you see roughly how many tokens it will use. Nothing goes to the AI, not even the picture,
  until you click **✦ Make the layer**.
- In a project, tick **Use the project's palette** to keep your project's colours instead of the picture's.
- **↶ Undo** puts your scene back in one step. **Closer** and **Looser** ask for one more pass, closer to the picture or
  freer from it, and each can be undone.
- Works with Claude and Astra.

## For Codex

No Codex-owned file was edited: `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `astra*`,
`codex-*`, `workbench-*`, `engine-watch` and `visual-feedback.js` are unchanged. The flow uses only public calls:
- `Projects.ofItem('scene', id)` and `LabProjLook.paletteOf(project)` (read only) for the project's palette;
- `Native.ensureChat` and `Native.send(agentId, text, { chatId, images })` to send to the docked director, Claude or
  Astra alike. An Astra director gets the same message and picture (engines.js lists it as an attached image file).
No store was added, so nothing new syncs.
