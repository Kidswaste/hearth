# Round 129 · looks129: the project's look, applied to the scene in one click

Projects now hold a palette (picked at creation, or taken from the moodboard) and a brief with a palette. This round
puts that palette on the Lab scene: one click, one undo, no code rewritten.

## What it does, and where the owner clicks
**The ◆ Project look strip.** When the scene open in the Lab belongs to a project that has a palette, the Lab's
toolbar shows a small strip next to 🎨 (top right, before 🔎): ◆, the palette's swatches, **Apply**, and **⋯**. A
swatch click copies its color, as with 🎨. The palette is the project's own (picked in ＋ New project, or taken from
the moodboard); if the project has none, the brief's. A project with no palette but a moodboard shows
**🖼 From the moodboard** instead of Apply.

- **Apply**: every color slider of the scene's layers (the `tweak()` sliders whose values are colors) gets a palette
  color, and each ◉ material look (chrome, glass…) gets a palette tint. Inside a layer the colors keep their order from
  dark to light, so a dark background takes the palette's darkest color and a highlight its lightest; a layer with one
  color gets a vivid one, a different one per layer. The values are slider values, like moving the sliders by hand
  (Save in Sliders writes them into the code, as always): **no code is rewritten**.
- **Point at Apply** and the preview shows the result at once; move away and it goes back. Nothing is kept until you
  click.
- **One undo step**: the toast's **Undo**, the strip's **↶**, or **Ctrl/⌘+Z** in the Lab puts every layer's colors and
  looks back at once.
- **⋯** has the options (remembered on this computer):
  - **All layers** (default) or **The selected layer only**;
  - **Keep my locked sliders** (on by default): 🔒 sliders stay as they are; off, they are recolored too and stay locked;
  - **Subtle** (halfway from each color to the palette) or **Full** (the palette's own colors, default);
  - which palette, when the project has both its own and the brief's;
  - **🖼 Take the palette from the moodboard**: the moodboard's pictures (up to 8) and swatches are read on this
    computer with the Kit's color reader (`Kit.paletteFromImage`), merged to 5 colors, and become **the project's
    palette** (`p.workspace.palette`, synced with the project). No AI, nothing sent anywhere. The strip's swatches
    change at once;
  - **💾 Save as a look…**: the recolored layers' slider values become a saved look of that name on each layer (the
    same looks as Sliders › looks and `three_looks`), so you can switch between the project look and your own;
  - **↶ Undo the project look**.

**The AI uses it too.** A director can call `three_do looks { action: "project", strength: "subtle" | "full", layer,
keepLocked }` (or `three_looks` with `action: "project"` in full mode). On screen it is the same Apply; backstage the
color sliders are set through the usual slider route. It is one undo step of the AI's reply (the dock's ↶ /
`/undo-edit`). The details are in `three_do help looks`, which costs nothing until asked; the full-mode tool list grows
by about 8 tokens (9215 → 9223, within the 9225 budget), the lean list not at all.

## Files
- `tools/three-projlook-core.js` (new, pure, loads in Node): the palettes a project has, the recolor plan (dark to
  light, vivid for one color, subtle = 45 % of the way, locked kept), the merge of several pictures' colors.
- `tools/three-projlook.js` + `tools/three-projlook.css` (new): the strip, the hover preview, Apply and its undo, the
  moodboard, Save as a look, the AI's op. Lazy group **projlook** (`tier: 'use'`, after `lab`): loaded when a project's
  scene opens in the Lab, or on an AI's first call. `lazy-data.js` (group + manifest via `node dev/lazy-manifest.js`),
  `index.html`'s `lazy-at.js#…labmaterials,projlook,…` tag and `docs/lazy-groups.md` have its line. The first screen
  is unchanged (boot-test: 62 scripts / 1576 KB, budget 1586 KB).
- `tools/three.js` (marked): the strip's place in the toolbar's Assets group, filled from `renderPalette()` (each scene
  that opens). The strip has its own class: the 🎨 palette (`.lab-palette`) is tucked away until Alt by declutter.js,
  this one stays in sight.
- `tools/three-tweaks.js` (marked): `locked(key)` on a slider controller, so the project look can keep 🔒 sliders (or
  lift them for a moment when "Keep my locked sliders" is off).
- `tools/three-director.js` (marked): `three_looks { action: "project" }` (and `three_look { apply: "project" }`)
  goes to the project look, on screen and backstage.
- `mcp/three-mcp.js` (marked): `project` in `three_looks`' actions and a `looks` help line.

## Tests
One app check, **dev/checks/looks129.js** (group `looks129` in dev/run-checks.js), on the check's own temp data and
pictures it draws itself:
1. a project with a palette and a two-layer scene in it: the strip is in the Lab's toolbar, visible, with 5 swatches;
2. pointing at Apply moves the sliders, moving away puts them back;
3. Apply: every unlocked color slider has a palette color (read back from the sliders), the background the darkest;
   the 🔒 slider is kept;
4. one Ctrl/⌘+Z in the Lab puts both layers back;
5. a moodboard with two pictures (red / navy, yellow): its palette has the three colors and becomes the project's, the
   strip shows it; Save as a look gives a "Project look" on both layers;
6. a director's `three_do looks { action: "project", strength: "subtle" }` through the fake engine (real MCP route)
   recolors the scene halfway; `/undo-edit` puts every color back.

Run: `looks129` ✓ (40 s), `labchat92` ✓, `labmaterials` ✓, `unit:promptdiet-test` ✓ (full director 9223 ≤ 9225),
`unit:director-mcp-test` ✓, `node dev/boot-test.js` ✓ (2863), `slim116-test` ✓, `selfmap118-test` ✓.

## For the patch notes
- **Your project's colors on your scene, in one click.** When a Lab scene belongs to a project with a palette, a small
  ◆ strip by 🎨 shows its colors. Point at **Apply** to see the scene in them, click to keep it. One Undo (or Ctrl/⌘+Z)
  puts your colors back.
- It changes your color sliders and material looks, never your code. Locked sliders stay as they are. ⋯ lets you
  recolor only the selected layer, go **Subtle** instead of **Full**, and **Save as a look** so you can switch back and
  forth.
- **🖼 Take the palette from the moodboard** reads your moodboard's pictures on your computer (no AI) and makes their
  colors the project's palette.
- The director can do the same when you ask for "the project's colors".

## For Codex
No Codex-owned file was edited. `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `astra*`,
`codex-*`, `workbench-*` and `engine-watch.js` are unchanged. The project look uses only public calls:
- `Projects.ofItem('scene', id)`, `Projects.projectOfChat(chatId)`, `Projects.onChange(fn)`, `Projects.get(id)`;
- `Projects.setWorkspace(p, { palette })` when the owner takes the palette from the moodboard: the same additive
  `p.workspace.palette` field projcreate128 writes (16 colors at most there, 5 here). `p.workspace.boardId` (or the
  project's newest board item) names the moodboard;
- `ProjectBrief.get(id).palette` and `ProjectBrief.onChange(fn)` when the brief's group is loaded.
Astra's directors get the op exactly as Claude's (`three_do looks`), through the same bridge.
