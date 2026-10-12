# Diet (round 25): a lighter Three Director and a lighter Lab page

The Three Director's lean tool list had reached 1,687 of its 1,700-token budget after rounds 22–24 (crew, particles,
shader, grade, assets). The app had also put on some weight. This stream cut both without removing any feature.

## Numbers (before → after)

| What | Before | After |
|---|---|---|
| Three Director lean tool list (sent with every message) | **1,687 tokens** | **1,177 tokens (−30 %)** |
| `three_do` description | 370 | 154 |
| Biggest everyday tool (`three_edit_code` / `three_screenshot`) | 157 / 157 | 111 / 108 |
| `three_nodes` (on by default) | 103 | 93 |
| Director guide core (system prompt) | 857 | 827 |
| **Fixed cost per Three Director message** (tools + prompt, with nodes and chat tools) | **3,222** | **2,672 (−550, −17 %)** |
| Three Director without nodes / with /crew on | 3,064 / 3,314 | 2,525 / 2,765 |
| Crew helper (per step, per helper) | 910 | 704 |
| Budget assertion in `dev/director-mcp-test.js` | ≤ 1,700 | **≤ 1,300**, plus `three_do` ≤ 200 and every other tool ≤ 130 |
| Lab preview page (`tools/three-sandbox.html`) parsed before its first frame | 581 KB | **429 KB (−152 KB, −26 %)** |
| First-screen JS (index.html; after merging interop) | 2,300 KB | 2,291 KB (lazy manifest −9 KB) |
| First-screen CSS | 425.9 KB | 425.9 KB (unchanged: nothing crept back) |
| Lazy groups | 20 groups, 4,822 KB before interop | unchanged apart from interop (all new files of rounds 22–24 were already lazy) |
| Startup (perf-report --startup-only, median of 3) | ready 304 ms · FCP 359 ms · interactive 1,081 ms · script 72 ms · 2 long tasks (106 ms) | ready 278 ms · FCP 302 ms · interactive 319 ms · script 69 ms · 1 long task (51 ms) (shared CPU: within the noise) |
| Idle (5 s window, app open) | 2.2 ms busy/s, 3 one-shot timers, 0 rAF, 0 style recalcs | 3.2 ms busy/s, the same 3 timers, 0 rAF, 0 style recalcs, 0 paints (noise: nothing new runs) |
| Lab first frame (open the Lab → the preview answers after a frame; noisy on this shared CPU) | 2,166 / 2,234 / 2,657 ms | 2,071 / 2,014 / 2,773 ms |

Round 21's first-screen JS was 2,274 KB with the same 76 files: rounds 22–24 added only ≈ 23 KB to it, almost all of it the
generated lazy manifest (lazy-data.js) describing the new lazy groups. Every new feature file of those rounds was
already in a lazy group, so nothing had to move.

## Upgrades

### Three Director: cheaper on every message
1. **Lean tool list 1,687 → 1,177 tokens** (−510 per message of every Three Director chat), with all tools and every
   option still there.
2. **One compact `three_do`**: its commands are named once, in groups (Layers · Time · Make), with `batch`, `undo` and
   `run` (any chat command, e.g. `/grade noir`) up front. `particles` and `shader` are now listed (they worked, but
   the director had to guess them).
3. **`three_do help <cmd>`** gives any command's full arguments (the long descriptions full mode uses), followed by
   the guide topic of the same name when there is one: `help update_layer`, `help keyframes`, `help particles`,
   `help crew`, `help asset`, `help batch`…
4. **`three_do help <tool>`** does the same for the everyday tools (`help edit_code`, `help screenshot`,
   `help eval`, `help nodes`…): the short descriptions keep what a typical turn needs, the rest is one call away,
   answered by the tool server itself (no hub trip).
5. **Shorter everyday tools**: `three_add_layer`, `three_eval`, `three_edit_code`, `three_screenshot`,
   `three_read_code`, `three_search_code`, `three_sliders`, `three_set_code`, `three_get_code`, `three_console`,
   `three_media_control`, `three_input`, `three_contact_sheet` say the same in fewer words; long enums (templates,
   actions) became words in the description; the layer reference is explained once (in `three_do`).
6. **Crew helpers are cheaper too**: each helper step carries the short tools (910 → 704 tokens per step).
7. **Shorter node tool** (`three_nodes`, on by default): 103 → 93 tokens.
8. **Shorter guide core** in the director's prompt (sliders example, help line): −30 tokens per message, same rules.
9. **Full mode unchanged** (`/director mode full`): every tool on its own with the long descriptions, as before.
10. **A budget that can't silently regrow**: `dev/director-mcp-test.js` now fails above 1,300 tokens for the lean list,
    above 200 for `three_do` and above 130 for any other tool, checks that `three_do` still names every command, and
    that `help` answers for commands and tools (edit_code, update_layer, particles, batch, screenshot, nodes). Later
    streams add ops behind `three_do` + a `help` line (`DO_HELP` in mcp/three-mcp.js), never in descriptions.

### Lab preview: lighter page
11. **The Lab preview parses 152 KB less before its first frame**: the motion-design kit (`motion.<kind>()`, 119 KB)
    and the 3D-model runtime (`lab3d.model()`, 37 KB) moved out of tools/three-sandbox.html into
    tools/sandbox-motion.js and tools/sandbox-lab3d.js. Every Lab page benefits: the preview, each reload, the Stage
    window, export pages and crew backstage pages.
12. **Loaded when needed**: a layer whose code uses `motion.` or `lab3d.` waits for its kit before it runs; otherwise
    both arrive once the page is idle (not on export pages), so everything that reads them later still works. The
    preview is a sandboxed iframe that can't read files: it asks the hub (`lib-need`), which loads the file once and
    sends the code (tools/three.js `sandboxLib`); nothing of it runs in the hub.
13. **Published scenes keep working**: Deploy inlines both kits back into the published `lab.html` (deploymain.js).

### App weight
14. **Lazy manifest −9 KB on the first screen**: each lazy group's usual command / keys area is written once
    (dev/lazy-manifest.js), and lazy.js puts it back on each entry; commands without an area keep none.
15. **Every lazy group has its place again** (`lazy-at.js` tags for projects, jankwatch, devreport, assets, context,
    voice, remote and interop): their commands, aliases and menu entries come out in their old order instead of last,
    and `node dev/boot-test.js` passes again (it failed on main with "jankwatch: no lazy-at.js tag").

Count: 15 upgrades.

## Findings (not changed)
- Duplicated helpers across rounds 22–24 (debounce in assets.js, hex/HSL math in board-data.js and appshell.js, image
  shrinkers in chat-scenes.js / assist.js / jam.js, clamp / lerp one-liners) are each a few hundred bytes; merging them
  would save under 2 KB and touch five streams' files, so they stay. ui.js already has the shared off-thread encoder
  (`canvasDataUrl`) for new code.
- The largest remaining parts of the Lab preview page are the GPU particles runtime (60 KB), the shader layers
  (25 KB), the grade (25 KB) and the export frames (24 KB). They live inside the page's main module and share its
  state, so moving them needs an API between them: a later round's job.
- chat-cost.js (round 24) re-joins `/context` with three one-shot timers up to 15 s after start; harmless (no loop).

## Tests
- `node dev/director-mcp-test.js`: all passed (lean list 1,177 tokens).
- `node dev/director-cost.js`: numbers above.
- Fake-engine checks: labdirector ✓, crew ✓, particles ✓, labshader ✓, grade ✓, assets ✓ (+ unit assets-test ✓).
- Lab preview split: motion-render ✓ (743 s), lab3d-models ✓, `node dev/deploy-test.js` 12/12, motion ✓ ("the sandbox has motion.<kind>()" now waits for the idle-loaded kit).
- lazy ✓, qa-commands ✓, `node dev/perf-report.js --startup-only` (numbers above).
- `node dev/boot-test.js`: 494 checks passed. `node dev/lazy-manifest.js`: names, aliases, actions, keys, apps, tools,
  dups all the same in the lazy build.
