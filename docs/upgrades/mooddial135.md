# Round 135 · mooddial135: 🎛 Mood dials, a few knobs that move many sliders

The owner's scenes have many layers, each with its own sliders. To make a scene "more intense" he had to move a dozen
of them by hand, on several layers. This round adds **🎛 Dials**: up to 4 scene-wide knobs (Energy, Darkness, Chaos,
Warmth…). Each one moves many sliders across layers, and each slider has its own range and curve on the dial. Turning a
dial moves them all live, and a release is one undo step.

## What existed (and what this round does with it)

| Piece | What it does | Used here? |
| --- | --- | --- |
| **Saved looks** (`three_looks`, the looks bar in Sliders) | Named sets of one layer's slider values. Apply, morph into one, play one on a cue. | Not reused as the engine: a look is one layer and all-or-nothing, while a dial is continuous and spans layers. Left alone. |
| **Slots A / B / C and the A↔B morph** (`tools/three-tweaks.js`) | Three stored value sets per layer, a crossfader that lerps between two of them, auto-morph on the bars. | Closest in spirit: a dial is a scene-wide, multi-layer A↔B with a curve per slider. The slots are per layer (`slots` in each layer's extras) and lerp linearly, so the dial keeps its own maps instead of bending the slots. The same controller calls (`setMany` with `remember: false` while moving, one undo on release) are used. |
| **◆ Project look** (looks129, `tools/three-projlook.js`) | The project's palette on every color slider, one click, one undo (`LabDirect.push`). | **Its pattern is followed:** read every layer's controller (`stageHooks.ctlOf`), set with `setMany`, one undo step in the Lab's Ctrl/⌘+Z. |
| **🎲 Variations** (labvariations) | 6 random takes of the whole scene, grouped by names (colors, motion, camera, look). | Its idea of reading the slider names is reused for the free suggestions (new rules: Energy, Darkness, Chaos, Warmth). |
| **🎚 Follow the music** (audiomap134) | A slider follows a band, with a live meter; writes a ♪ beat link that renders replay exactly. | **Reused whole:** 〰 Follow the music on a dial opens that same card on the dial. Its link is spread as a beat link onto each mapped number slider, on that slider's range. |
| **◉ Perform** (perform131) | Live mode: cues on 1–9, looks on Q W E…, nothing saved. | **Extended:** ↑ / ↓ turn the selected dial, [ / ] pick another. Live only, put back when Perform ends. |
| **Layer groups** (layergroups) | Folders of layers, eyes, solo. | Not needed: a dial maps sliders on any layer, grouped or not. |
| **Slider keyframes** (`L.keys['s:<key>']`, played by the preview page and the export page) | Keys on a slider, with ease. | **The dial's keys are baked onto them**, so renders, the sequence and backstage scenes play a keyed dial with no new code. |

Nothing turned many sliders across layers at once.

## What's new, and where the owner clicks

- **Ways in** (no toolbar row was added):
  - the **Sliders panel's ⋯ › 🎛 Dials…**;
  - the **Lab toolbar's ⋯ › 🎛 Dials** (next to 🎲 Variations);
  - Ctrl/⌘+K: "Lab: 🎛 Mood dials".
- **The card** (300 px, ✕ or Esc closes it). Each dial is one row: its name, the knob, the %, **◆** and **⋯**.
  - **Turn the knob:** every mapped slider moves live, on every layer. Letting go is **one undo step** (Ctrl/⌘+Z in the
    Lab puts every slider and the dial back).
  - **Click a name** to select it (◉ Perform's ↑ / ↓ turn that one). **Double-click** it to rename.
  - **⋯** has **● Learn…**, **〰 Follow the music…**, **Its sliders** (each one's range, its curve: linear, ease, in,
    out; swap the ends; drop it), **Remove its keys**, **Rename…** and **Remove the dial**.
- **Making a dial:**
  - **Suggest (free):** guesses from the slider names, on this computer, no AI. For example:
    - **Energy:** speed, intensity, glow, bloom and brightness go up;
    - **Darkness:** brightness and glow go down, contrast and vignette go up, background colors darken;
    - **Chaos:** noise, distortion, jitter and glitch go up;
    - **Warmth:** colors move toward orange, "warm" / "temperature" go up.

    The scene as it is sits in the middle of each dial (50 %). Each suggestion has **Keep** and **✕**.
  - **✦ Suggest dials:** one small AI pass reads the slider names and ranges and proposes 3–4 dials. **The cost shows
    first** ("About 1.1k tokens in and 450 out · Claude · the cheapest helper"), and nothing is sent until **✦ Suggest**
    is clicked. Unknown sliders are dropped and values are clamped to each slider's range. Each dial has **Keep** and
    **✕**. It runs on the dock's AI (Claude or Astra), lean and helper, on the cheapest model, like ✦ Explain this layer.
  - **＋ / ● Learn:** turn the dial to one end, set the sliders the way you want them there, press **✓ This end**.
    Then turn it to the other end, set the sliders, press **✓ This end · done**. Hearth records both ends. Every slider
    that differs between them is on the dial, and Learn on an existing dial updates its ends.
- **Keys (a dial lane):** **◆** puts a key at the playhead. Once a dial has keys, turning it sets a key at the playhead,
  like an animated slider. The keys show as a thin lane under the dial in the card: click a key to go there,
  right-click it to remove it. The keys are baked onto each mapped slider's own keys (tagged with the dial), so the
  layer's track shows them and **renders, the Lab sequence and backstage scenes play them**. A slider that has keys of
  the owner's own is left alone by a keyed dial, and a toast says which.
- **〰 Follow the music:** the 🎚 Follow the music card opens on the dial (band, spectrum, live meter, range, response,
  Invert, Keep = one undo). Every mapped number slider then follows that band on its own part of the range, as a ♪ beat
  link, so the preview and renders match.
- **◉ Perform:** **↑ / ↓** turn the selected dial by 10 %, **[ / ]** pick another dial. It is live only. Perform puts
  the sliders back when it ends, so nothing in the saved scene changes.
- **Saved with the scene:** `sketch.dials` (`{ v, sel, list: [{ id, name, value, maps, keys, baked, follow }] }`) in
  kv `three-sketches`, so it goes along with copies, packs and sync like the rest of the scene.
- **The AI can turn dials:** `three_sliders { dial, value: 0–1 }` (or `three_do sliders {dial, value}`). It is one undo
  step of its reply, and `{dial: ""}` lists the dials. That is one sentence in `three_sliders`' long description, which
  is only read through `help`. The tool list sent with each message is unchanged.

## Files
- `tools/three-dials-core.js` (new, pure, loads in Node): maps, curves, the estimate (where a dial sits from the
  sliders), Learn, the free suggestions, the ✦ prompt / parse / clamp, the cost line, the keys and their baking.
- `tools/three-dials.js` + `tools/three-dials.css` (new): `LabDials`, the card, turning, one undo per release, Learn,
  suggestions, the AI pass, keys, Follow the music, Perform's keys, the AI's op, Ctrl/⌘+K. Lazy group **dials**
  (`tier: 'use'`, after `lab`) in `lazy-data.js` (manifest re-run), `index.html`'s `lazy-at.js#…audiomap,dials,…` tag
  and `docs/lazy-groups.md`. The first screen is unchanged (boot-test: 62 scripts, 1583 KB of 1586).
- `tools/three.js` (marked): `stageHooks.dials()` / `setDials(v)`.
- `tools/three-tweaks.js` (marked): the ⋯ row.
- `tools/three-easy.js` (marked): the Lab toolbar ⋯ row.
- `tools/three-perform.js` (marked): ↑ / ↓ / [ / ], and the put-back when it ends.
- `tools/three-director.js` (marked): `three_sliders { dial }` → `LabDials.op`.
- `tools/three-txn.js` (marked): a dial turned counts as a change, so it is one undo step of the reply.
- `mcp/three-mcp.js` (marked): the sentence in `three_sliders`' help.
- `dev/fake-common.js` (the fake ✦ answer), `dev/fake-liveness.js` (that prompt is no long-task scenario),
  `dev/checks/mooddial135.js`, the `mooddial135` group in `dev/run-checks.js`.

## Tests
One app check, **`dev/checks/mooddial135.js`** (group `mooddial135`, `--fake-engines`). It runs on its own temp data,
a two-layer scene it makes itself (Main: Speed, Glow, Noise; Back: Contrast, Brightness) and the fixture song:
1. The Sliders ⋯ › 🎛 Dials… opens the card. Suggest (free) gives Energy (Speed, Glow up) and Darkness (Brightness
   down, Contrast up, on the other layer).
2. Keep Energy. Turning it moves every slider it maps, on both layers, live, with no undo step while it moves.
3. The release is one undo step, and one Ctrl/⌘+Z in the Lab puts every slider and the dial back exactly.
4. Learn: ＋ starts Learn. The 0 end, then the 100 % end, record Noise 0.05 → 0.8 and Contrast 0.6 → 1.7 and nothing
   else, and the dial then drives them.
5. ◆ at 2 s, a turn to 100 % at 6 s: two keys, baked onto Glow's own keys. A render frame from the hidden export page
   matches the keyed dial at 1, 3, 4 and 8 s (the red channel, within 8 of 255).
6. ✦ Suggest dials: the cost line first, nothing sent for a second, then ONE lean helper pass that read the sliders.
   3 dials come back, the unknown slider is dropped and the past-max value clamped. ✕ drops Chaos, Keep adds Darkness,
   and the dials are in kv `three-sketches`.
7. The AI's `three_do sliders { dial: "Darkness", value: 1 }` through the fake engine turns the learned dial, and
   `/undo-edit` puts it back (one undo step of its reply).

Step 7 ends with the card open again: its keyed dial shows its lane with 2 keys (in the check's picture).

Run (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`):
- `mooddial135` ✓ (52 s, 22 steps);
- `looks129` ✓, `audiomap134` ✓, `perform131` ✓, `labchat92` ✓;
- `unit:promptdiet-test` ✓: full 7782 ≤ 7940, lean 2060 ≤ 2100, unchanged;
- `unit:director-mcp-test` ✓: `three_do` 186 ≤ 190, unchanged;
- `node dev/boot-test.js` ✓ (3054 checks: first screen 62 scripts, 1583 KB of 1586);
- `dev/lazymanifest-test.js` ✓, `dev/slim116-test.js` ✓, `dev/selfmap118-test.js` ✓.

## Risks / not done
- The dial lane is in the card, not as a row of its own on the main timeline: the timeline (`tools/three-media.js`) was
  the seekfix135 stream's area this round. The baked keys do show on each layer's track.
- Follow the music spreads one link on each slider's range linearly, so a slider with an "in" / "out" curve follows the
  band linearly between its two ends.
- A slider on two keyed dials plays the first dial's keys. The second leaves it alone, and the toast names it.
- An AI turn of a dial that isn't on screen sets the sliders through the backstage route, but the dial's own stored
  position is then only re-read from the sliders when the scene opens.

## For the patch notes
- **🎛 Mood dials.** A few big knobs for the whole scene, like Energy, Darkness, Chaos or Warmth. Each one moves many
  sliders at once, on every layer. Open it from the Sliders panel's ⋯ or the Lab's ⋯ › 🎛 Dials.
- **Turn a dial and everything moves together.** One Undo (Ctrl/⌘+Z) takes the whole turn back.
- **Get dials for free:** "Suggest (free)" reads your slider names. Energy speeds things up and makes them glow,
  Darkness dims them and adds contrast. Keep the ones you like.
- **Or ask the AI:** "✦ Suggest dials" shows what it costs first and sends nothing until you click. It proposes 3–4
  dials; keep or ✕ each one.
- **Teach a dial:** press Learn, turn it to one end and set your sliders, then to the other end and set them again.
  Hearth remembers both ends.
- **Animate it:** ◆ puts a key on the dial at the playhead, so the dial can rise into the drop. Renders follow.
- **Let the music turn it:** ⋯ › 〰 Follow the music, the same card as for a single slider.
- **In ◉ Perform:** ↑ and ↓ turn the selected dial, [ and ] pick another. Nothing is saved.
- **Chats can turn them too** ("put Energy at 80 %").

## For Codex
No Codex-owned file was edited: `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged. There is nothing to merge on your side.
- **Astra:** ✦ Suggest dials runs through `hub.askOnce` on the dock's agent, the same lean helper path as ✦ Explain
  this layer (`Autocompact.CHEAP.codex` model and effort, plus `verbosity: 'low'`), with no images and no tools.
  Astra's directors get `three_sliders { dial, value }` / `three_do sliders` exactly as Claude's do, through the same
  bridge.
- **Data:** the dials live on the scene (`sketch.dials` in kv `three-sketches`), a new additive field. Sync carries it
  with the scene and needs no change.
