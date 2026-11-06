# 🧩 Effect building blocks (round 134, blocks134)

The owner wants to put a look together from ready-made pieces: a noise field, then a glow, then trails, then grain,
by hand or by asking the AI for a mood. Almost every piece was already in the Lab, spread over the FX picker's 660
items. This round adds one small card that names 12 of them as **blocks**, shows each one live, builds a chain of
them with one undo per change, lets the AI combine them for a mood, and lets the owner save a chain as a block of
their own.

## What existed (and what each does)

| Piece | What it does | Used here? |
| --- | --- | --- |
| **FX pack** (`tools/three-fx*.js`, round FX) | One searchable picker (X, ＋ Layer) with 660 items: layer templates, filters, looks, palettes, triggers, animations, eases and blends. It has favourites, recents and live **filter** thumbnails rendered from your own picture. | Its filter layers and templates *are* the blocks. Its add pattern ("a filter goes right above the selected layer") is the one used here. |
| **Filter layers** (`three-fx-filters.js` + the originals in `three-layers.js`) | About 120 full-frame effects (`filter(type, P)`), each a layer that changes everything below it, with sliders and "Reacts to". Bloom, trails, kaleido, displace, RGB split, grain, pixelate, mirror, gradient map and strobe are all there. | **10 of the 12 blocks.** Nothing new was written for them. |
| **Shader templates** (`three-shader*.js`, round 23) | 38 ◇ GLSL starters (noise, pattern, raymarch, music, feedback), each a layer whose uniforms become sliders. | **Noise field** = the "Liquid marble" starter. Thumbnails are drawn over the "Plasma" starter. |
| **Particles** (`three-particles*.js`, round 24) | 30 ✦ GPU particle presets as layers. | **Particles** = the "Embers" preset. |
| **Lab recipes** (`three-recipes*.js`, round 39) | Records finishing steps on one scene and replays them on another as one undo step. Saved as files in `data/recipes/`. | Not changed. A recipe can still replay blocks because they are ordinary layers. Saved blocks are a different thing: a chain of pieces, not a list of steps. |
| **Visualizer toolkit** (`three-vis*.js`, round 50) | 17 music visualizer looks as layers, with a picker of live previews. | Not a block. It keeps its own picker. |
| **Materials** (`three-materials*.js`, round 50) | ◉ Looks for 3D things (chrome, glass…). | Not a block, because it changes objects, not the frame. |
| **Kinetic type** (`three-kinetic*.js`, round 45) | 🅰 Text that moves: 22 presets with live previews. | Not a block. |
| **Gallery starts** (`three-gallery*.js`, round 27) | Whole starting scenes. | Not touched (the starters134 stream works there). |
| **Nodes** (`three-nodes.js`, `nodes.js`) | Visual coding: a graph compiles to a layer, and a graph ending in a filter node compiles to a filter layer. | Not touched. Blocks are the "no wires" version: whole layers in a stack. |
| **◆ Project look** (`three-projlook*.js`, round 129) | The project's palette on the scene's colour sliders. | **Reused:** a new block's colour sliders take the project's palette (or else the scene's). |
| **LabTxn / LabDirect** | One AI reply is one undo step (the dock's ↶, `/undo-edit`). The Lab's Ctrl/⌘+Z steps. | **Reused** for every undo here: a scene snapshot before, `LabTxn.restore` back. |
| **Backstage stages** (`ThreeBackstage.make`) | Hidden sandboxes for crews, takes, templates and versions. `thumb()` returns a small picture. | **Reused** for the live thumbnails: one small stage while the card is open, closed with it. |

So **no block had to be built**. All 12 map to an existing filter, shader starter or particle preset. What was
missing was a short list of them, live previews of the generators, a chain view, mood-to-blocks, and saved chains.

## What's new, and where the owner clicks

- **🧩 Blocks** is a row in the Lab toolbar's **⋯** (beside ⚡ Speed check) and in **✦ More** (the preview's
  right-click). There is also `/blocks [list | add <block> | combine <mood> | undo]`. **No new toolbar row.**
- **The card** (360 px, over the top right of the preview) folds away with ✕ or Esc:
  - **12 blocks**, each with a **live thumbnail** and one line: Noise field, Bloom / glow, Feedback trails,
    Kaleidoscope, Particles, Displacement, Chromatic split, Grain / film, Pixelate, Mirror, Colour ramp, Beat strobe.
    An effect is drawn over a plasma picture and a generator is drawn on its own, in the project's palette. While the
    card is open the tiles are redrawn one after another, so they move. When it closes, its stage closes too.
  - **Click a block** to add it **right above the selected layer**. A generator becomes its own layer and an effect
    becomes a filter layer, both named "🧩 …", with their sliders. The new layer is selected, so the next click lands
    above it and clicks build a chain from the bottom up. Colour sliders take the project's palette (◆ Project look),
    or else the scene's. **Each add is one undo step** (Ctrl/⌘+Z in the Lab, or the toast's Undo).
  - **The chain** lists the scene's 🧩 layers, top first. **Drag a row** to reorder it. Only the 🧩 layers move,
    each into another 🧩 layer's place. Each reorder is one undo step.
  - **💾 Save as my block** saves the chain, with its blocks, order and current slider values, as your own block. It
    is listed under **Mine** with its own live thumbnail, and a click adds the whole chain as one undo step. ✕ on its
    tile removes it, with an Undo in the toast.
  - **✦ Combine for me…** opens a row: type a mood ("dreamy underwater pulse"). The button already shows the cost
    ("✦ Combine · ≈2,436 tokens"), and a confirm repeats it. Nothing is sent before OK. The Three Director gets the 12
    blocks with their sliders, your own blocks and the palette. It answers with **one** `three_do blocks` call that
    names 3–5 blocks, their order and slider values. Its whole reply is **one undo step**: Ctrl/⌘+Z in the Lab, or
    ↶ in the dock or `/undo-edit`.
- **Your blocks sync**: they are kept in `kv three-blocks` (`data/kv/three-blocks.json`), which is in the "Projects &
  scenes" sync kind like the Lab's other stores. If the file can't be read, nothing is saved over it.

### The AI's op (budgets kept)
- `three_do blocks {chain: [{block, values}]}`, bottom → top. A chain step can name one of the owner's blocks
  (`my-…`), which expands into its chain. Values are clamped to each slider's range, and unknown blocks are skipped
  and named. With no chain it returns the list of blocks and their sliders.
- `mcp/three-mcp.js`: `blocks` in `DO_CMDS`, one `DO_HELP` line, and the word "blocks" in three_do's Make line.
  - three_do: 185 → **186** tokens (≤ 190).
  - Lean Director: 2059 → **2060** / 2100.
  - Full Director: **7782** / 7940, unchanged.

### Files
- `tools/three-blocks-core.js` (new, pure, loads in Node): `BlocksCore` holds the 12 blocks, values (clamp, palette),
  the chain plan, reorder, the ask text and its estimate, and saved blocks.
- `tools/three-blocks.js` + `tools/three-blocks.css` (new): `LabBlocks` holds the card, live thumbnails, add / build,
  reorder, save / remove, ✦ Combine and `op` for `three_do blocks`. They are the new lazy group **blocks** (tier
  `use`, after `lab`), with the `lazy-at.js#blocks` tag in `index.html`, `docs/lazy-groups.md` and the regenerated
  `lazy-meta.js`.
- `tools/three-blocks-hook.js` (new, in the `lab` group, small): `LabBlocksHook` holds the ⋯ / ✦ More rows and
  `/blocks`.
- `tools/three-easy.js` (marked): the two menu rows. `tools/three-director.js` (marked): `three_blocks` goes to
  `LabBlocks.op`. `mcp/three-mcp.js` (marked): the command and its help line.
- `dev/fake-common.js` (marked): the fake director's answer to "✦ Combine blocks" (noise → displace → bloom → strobe,
  each one's first slider at 70 %). `dev/fake-liveness.js` (marked): a mood never starts a long-task scenario.
- `dev/checks/blocks134.js` (new) and the `blocks134` group in `dev/run-checks.js`.

The first screen didn't change: 62 scripts, 1582 KB of 1586 KB.

## Tests

One check, **`dev/checks/blocks134.js`** (group **blocks134**, `--fake-engines`), on a scene it makes in its own temp
data with a three-colour palette:
1. **⋯ › 🧩 Blocks** opens the card. All 12 tiles get a data-URL thumbnail and a one-line description, and at least
   one tile is drawn a second time (live).
2. **Noise field**: a click adds "🧩 Noise field" above Base, its code in the palette's darkest and lightest colours.
   **One Ctrl/⌘+Z** takes it away. **Bloom**: a filter layer above Base. **One Ctrl/⌘+Z** takes it away.
3. Three clicks build a chain (noise, bloom, grain). **Dragging** the Grain row onto Noise field moves Grain to the
   bottom of the chain. **One Ctrl/⌘+Z** puts the order back.
4. **💾 Save as my block** ("Glow chain"): it is in kv `three-blocks` as noise → bloom → grain, listed under **Mine**
   with a thumbnail. A click adds the 3 layers, and **one Ctrl/⌘+Z** takes them away.
5. Nothing was sent to any AI up to here. **✦ Combine for me**: the button and the confirm show "≈N tokens", and
   Cancel sends nothing. OK sends **one** message. The fake director makes **one** `three_do blocks` call: 4 🧩
   layers, with Displacement's amount at 2.1. **One Ctrl/⌘+Z** takes all 4 away. Closing the card ends its stage.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`):
- `blocks134` ✓ (14/14 steps, about 70 s).
- `labchat92` ✓, `looks129` ✓, `labrecipes` ✓, `unit:promptdiet-test` ✓, `unit:director-mcp-test` ✓ (6/6 in 5 min).
- `node dev/boot-test.js` ✓ (3026 checks; first screen 62 scripts, 1582 KB of 1586 KB).
- Also ✓: `node dev/lazy-manifest.js --check`, `dev/slim116-test.js`, `dev/selfmap118-test.js` and
  `dev/promptroom132-test.js`.

## Risks / not done

- The live thumbnails run one small WebGL page while the card is open, redrawing one tile about every half second.
  On a slow computer the first pass takes a few seconds. The page closes with the card.
- A block's add is one step after its layers have run (the Lab waits about a second per layer). A Ctrl/⌘+Z pressed
  before that undoes the step before it.
- The chain is the scene's 🧩 layers, recognised by name. A 🧩 layer renamed by hand leaves the chain, but stays a
  normal layer.
- ✦ Combine on a scene that isn't on screen (a chat's scene backstage) builds there too, and its undo is the reply's
  (↶ in the dock). Ctrl/⌘+Z only applies to the scene on screen.
- Recipes don't record a block click as its own step. The layers it adds are recorded as "a layer added".

## For the patch notes

- **Lab: 🧩 Blocks.** Pick **🧩 Blocks** in the Lab's ⋯ menu (or ✦ More on the preview) for a small card of 12
  ready-made pieces, each with a moving preview: noise field, glow, trails, kaleidoscope, particles, warp, colour
  split, film grain, pixels, mirror, colour ramp and a beat strobe.
- Click one to add it above the selected layer, already in your project's colours. Keep clicking to stack a look,
  and drag the list to change the order. Every change has one Undo.
- **✦ Combine for me**: type a mood, like "dreamy underwater pulse", and the AI picks 3–5 pieces, their order and
  their settings. You see the cost before anything is sent, and the whole result is one Undo.
- **💾 Save as my block** keeps a stack you like as your own piece. It shows up under "Mine" and syncs to your other
  computer.

## For Codex

Nothing. No Codex-owned file was touched (no astra*, codex-*, projects*, project-workspace*, sync-engine.js,
cloud-files.js, workbench-* or engine-watch). Saved blocks use an ordinary kv store (`three-blocks`), which the
existing "Projects & scenes" sync kind (`kv/three-*.json`) already covers. No sync code changed.
