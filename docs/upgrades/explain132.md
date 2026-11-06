# Round 132 · explain132: "Explain this layer", then tweak it in plain words

The owner asked for a way to understand a Lab layer without reading its code, and then change it by saying what he
wants ("slower and more blurry on the breaks").

## What existed (and what this round does with it)

| Piece | What it does today | Used here? |
| --- | --- | --- |
| **The code view's tools** (`tools/three.js` `codeOrOutline`, `three_read_code` / `three_search_code` / `three_edit_code` in `tools/three-director.js`) | For the AI, not the owner: the whole code of a small layer, or an outline with line numbers for a big one (350+ lines); read parts, find text, exact find → replace edits. A code edit goes through the director's handler and LabTxn, so it is one undo step. | **Reused as is:** "Turn into a slider" is a `three_edit_code` call through `HubBridge.call` (the same path the AI's edits take), so it gets LabTxn's one undo step, the director's code history and the `safe` put-back if the edit broke the layer. |
| **Ask Claude about this layer** (Sketch ▾ › More, `askAbout` in `tools/three.js`; `tools/three-chatlink.js`, round 92) | Starts a draft in a Claude chat linked to the scene ("About the layer … read it with three_read_code"), with any errors. Nothing is sent until the owner sends it, and it opens a full chat. | **Left alone.** It's the open conversation. The new card is the one-click, cheap explanation that stays in the Lab. |
| **The Sliders panel** (`tools/three-tweaks.js`) | Live tweak() sliders, 🎲 Shuffle, looks and slots. Its folded "Ask the director" chips send fixed wishes ("Calmer", "More energy", "Add a slider for…") to the director. "Ask for named sliders" asks the director to turn raw values into named ones. Its ⋯ menu has reset, copy / paste, layout and show options. | **Extended:** ⋯ gets **✦ Explain this layer** (a new optional `explain` hook on the controller, set by `tools/three.js`). The quick-ask chips stay as they are. They always go to the director, while "Make it…" first tries the sliders here, for free undo and no director turn. |
| **🩺 scenedoctor** (`tools/three-doctor*.js`, round 34) | A free, local check for errors, a blank or dark frame, a camera inside an object, NaN sliders and slow frames, with one-click fixes. | Not called. It says what's *wrong*, while the explanation says what the layer *is*. |
| **✦ Critique** (critique130) | One AI look at the whole scene (a contact sheet, the outline, the brief), then 3 chips. A slider fix lands here as one undo step; anything else goes to the director. | **Its pattern is followed:** the cost is shown first, nothing is sent before the click, `HubBridge.call` under one chat id makes the change one LabTxn step, `Native.send` sends the rest to the director, and kv reads are safe. The critique itself is unchanged. |
| **The brief's helper run** (`projectbrief.js`) | `hub.askOnce` on the cheapest model (`Autocompact.CHEAP`), lean, with no tools. | **Same call:** both passes here use it, on the dock's AI (Claude or Astra). |

Nothing explained a layer in plain words, said which sliders matter, or turned a fixed number into a slider for the
owner.

## What's new, and where the owner clicks

- **Ways in:**
  - **✦ Explain this layer** in a layer's **right-click** menu (Layers panel).
  - **✦ Explain this layer** in the **Sliders panel's ⋯** menu.
  - `/explain-layer` (alias `/explain-this-layer`; `run`, `make it …`, `close`).
  - Ctrl/⌘+K: "Lab: Explain this layer".
  No toolbar row or button was added.
- **The card** is a small fold-away card at the top of the Sliders column, just above the panel. Its head ("✦ About ·
  layer name · Claude") folds it to one line, and ✕ closes it.
  - **Cost first:** "About 1.4k tokens in and 550 out · Claude · <model> (the cheapest helper)". Nothing is sent until
    **✦ Explain it** is clicked.
  - **One lean helper pass** reads the layer's numbered code and its sliders. It gives back:
    - 2–4 plain lines on what the layer draws and how it moves;
    - **Sliders that matter** (2–4, each with a few words);
    - **Could be a slider:** up to 4 hard-coded numbers or colours, each a **+ Turn into a slider: sphere count (12)**
      chip;
    - a folded **What each part does** list (line ranges, one line each).
  - **The cache:** the explanation is kept per layer by a hash of its code (kv `three-explain`, the last 3 codes of a
    layer). Reopening it costs nothing ("From the cache · 0 tokens") until the code changes.
- **Make it…** is a text box on the card. The owner types "slower and more blurry on the breaks" and clicks ✦ Tweak or
  presses Enter. One more small helper pass gets the sliders with their ranges, the keyframeable properties and the
  song's sections. It answers in one of two ways:
  - **A plan** of slider values and keyframes (on sliders, or on opacity, x, y, scale, rotate). Hearth checks and
    clamps it: unknown sliders are dropped, values are kept in range, and times stay within the song. It is applied
    here as **one undo step**: the dock's ↶, the card's ↶ Undo and the toast's Undo all put it back exactly.
  - **A message for the director**, for anything the sliders can't do (new shapes, code, other layers). It is sent as
    the owner's message: `About the layer "Ring": make it twice as many rings with sparks. (…) Keep the rest of the
    scene as it is.` If the director is busy, it goes into the chat box instead.
- **Turn into a slider:** one click puts the value into the layer's `tweak()`:
  - `const COUNT = 12;` becomes `const COUNT = P.count;` with `count: { value: 12, min: 1, max: 36, label: "sphere
    count" }`. A new `const P = tweak({ … })` goes after the imports when the layer has none.
  - Colours become `'#rrggbb'` values.
  - The edit goes through `three_edit_code` (`safe`: a broken edit is put back), so it is **one undo step**.
  - Because the edit is Hearth's own, the explanation carries over to the new code at no cost, with that chip marked
    ✓. Any other code change asks again (cost first).
- **Engines:** Claude and Astra. Both passes run on the dock's AI (or the Claude agent) with `hub.askOnce`, lean and
  helper, on `Autocompact.CHEAP`'s model and effort, plus `verbosity: low` for Codex.
- **No new MCP tool, guide line or prompt part.** The director's prompt budget is unchanged. Everything is UI-side.

### Files
- `tools/three-explain-core.js` (new, pure, loads in Node): `hash`, `explainPrompt` / `parseExplain` (a hard-coded value
  must really be on its line or one or two lines away, and not already inside `tweak()`), `sliderEdit`, `tweakPrompt` /
  `parsePlan` (clamping), `planWords`, `directorMessage`, the cache helpers, `estimate` / `costLine`.
- `tools/three-explain.js` and `tools/three-explain.css` (new): `LabExplain` (the card, the runs, apply, undo, the chips,
  `/explain-layer`, Ctrl/⌘+K).
- `lazy-data.js`: the new lazy group **explain** (`tier: 'use'`, after `lab`), with the manifest regenerated
  (`lazy-meta.js`). Also `index.html`'s `lazy-at.js#explain` tag and `docs/lazy-groups.md`'s line.
- `tools/three-easy.js`: the layer right-click row and `LabEasy.explainLayer(id)`, which loads the group on first use.
- `tools/three-tweaks.js`: the optional `explain` hook and its ⋯ row. `tools/three.js`: passes the hook per layer.
- `dev/fake-common.js` (the fake answers to both passes), `dev/fake-liveness.js` (the two prompts are no long-task
  scenario), `dev/checks/explain132.js`, and the `explain132` group in `dev/run-checks.js`.

First screen unchanged apart from the manifest lines: boot-test 62 scripts, 1580 KB of 1586, 27 stylesheets.

## Tests

One app check, **`dev/checks/explain132.js`** (group **explain132**, `--fake-engines`), runs by clicks on its own temp
data and a scene it makes itself: a ring of 12 spheres with `glow` and `speed` sliders, `const COUNT = 12` and a
quoted colour.
1. **Cost first, nothing sent:**
   - A layer's right-click › ✦ Explain this layer opens the card beside the Sliders panel with the cost line (tokens ·
     Claude). After 1.5 s, no AI call has been made.
   - The Sliders ⋯ row opens the same card, still with nothing sent.
2. **The card:** ✦ Explain it makes ONE lean helper pass, which reads the numbered code and `glow 0.4 (0–1)`. The card
   shows what the layer draws, 2 sliders that matter and 2 "Turn into a slider" chips.
3. **The cache:** reopening is a hit with no second call ("From the cache · 0 tokens"), and kv holds the code's hash.
4. **A plain-words tweak:** "slower and more blurry on the breaks" sets speed 1 → 0.5 and 3 keyframes on glow. The
   0.4 → 5 → 0.4 answer is clamped to 1, and the unknown key is dropped. The dock's ↶ puts the scene back exactly
   (LabTxn's signature).
5. **Turn into a slider:**
   - `COUNT` becomes `P.count` in the layer's tweak(). The slider is there at 12, it works (set to 20), and the layer
     runs with no errors.
   - Reopening is still free, with the chip marked done.
   - One ↶ takes it back exactly.
   - Another code edit is a cache miss: Astra's cost line names Astra, and nothing is sent.
6. **A bigger wish** ("twice as many rings with sparks") goes to the director as the owner's message.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`): `explain132` ✓
(48 s), `labchat92` ✓ (120 s), `critique130` ✓ (60 s). `node dev/boot-test.js` ✓ (2964 checks, first screen within
budget). Also `dev/lazymanifest-test.js` ✓, `dev/slim116-test.js` ✓ and `dev/selfmap118-test.js` ✓. The card was
checked by eye in the check's screenshot.

## Risks / not done

- "Turn into a slider" on a value used once at setup (a count, a geometry size) makes a slider that rebuilds the layer
  when moved. The Sliders panel marks it ↻ as usual, and it isn't live.
- A layer longer than about 14,000 characters is cut in the explain prompt, with a note. The explanation then covers
  the start of it.
- The explanation's line ranges aren't clickable yet.

## For the patch notes

- **Ask what a layer does.** Right-click a layer (or open ⋯ in the Sliders panel) and pick **✦ Explain this layer**.
  - You see roughly what it costs first. Nothing is sent until you click **✦ Explain it**.
  - A small card says, in plain words, what the layer draws and how it moves, which sliders matter most, and which
    fixed numbers or colours could become sliders.
  - Opening it again is free until the layer's code changes.
- **Change it by saying what you want.** Type in the card's **Make it…** box, e.g. "slower and more blurry on the
  breaks".
  - If the sliders can do it, it happens right away. One Undo takes it back.
  - If it needs more (new shapes, code), it goes to the director as your message.
- **Turn into a slider.** Click a "+ Turn into a slider" chip and that number or colour gets its own slider. One Undo
  takes it back.
- Works with Claude and Astra, on the cheapest helper.

## For Codex

- **No Codex-owned file was edited:** `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
  `cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged.
- **Astra:** both passes run through `hub.askOnce` on the dock's agent, the same lean helper path the brief and the
  critique use: `Autocompact.CHEAP.codex` model and effort, plus `verbosity: 'low'`. No images and no tools.
- **The new kv store `three-explain`** (`{ v: 1, list: [{ id: <layer id>, hash, at, by, name, data }] }`, at most 3
  codes per layer and 90 in all) is in the "Projects & scenes" kind through sync-kinds.js's `three-[^/]+` rule. No sync
  change was needed. It's declared with StoreAck, and a read that failed is never saved over.
- No MCP tool, guide line or prompt part was added (`mcp/three-mcp.js` and `three-guide.js` are untouched), so the
  director's prompt budget is as promptroom132 leaves it.
