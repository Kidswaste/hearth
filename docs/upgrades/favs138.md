# Round 138 · favs138: ★ Favourite controls, the few knobs he uses, in one folded panel

The owner's scenes have many layers, each with its own sliders, plus 🎛 mood dials. He uses only a few of them, and they
sit on different layers. This round adds **★ Favourites**. He pins the sliders and dials he uses, from any layer. They
show in one small panel that stays folded to a single ★ button until he clicks it.

## What existed (and what this round does with it)

| Piece | What it does | This round |
| --- | --- | --- |
| **Sliders panel** (`tools/three-tweaks.js`, one controller per layer) | The selected layer's sliders: knobs or sliders, groups, search, right-click menu (lock, Follow the music, keys, history, MIDI…). Its own ↶ / Ctrl/⌘+Z per gesture. | **Extended:** a small ★ in its head opens the panel, and the right-click's "★ Add to Favorites" became **★ Pin to favourites** for named sliders. |
| **★ Favorites group** (per layer, in that layer's extras `favs`) | Puts some of ONE layer's sliders in a "★ Favorites" group at the top of its panel. Shuffle can be limited to it. | **Kept and synced:** pinning a slider also puts it in its layer's ★ Favorites group, and unpinning takes it out. The group header's "★ Add all to Favorites" still works on that layer only. Nothing showed favourites from several layers at once. |
| **Slots A / B / C, looks** | Stored value sets per layer, the A↔B morph, named looks. | Not touched. They are sets of values, not a few live knobs. |
| **🎛 Mood dials** (mooddial135, `tools/three-dials.js`) | Up to 4 scene-wide knobs that each move many sliders, with one undo per release. They live in a card opened from ⋯. | **Extended:** a dial's ⋯ has **★ Pin to favourites**. A pinned dial in the panel turns through `LabDials.turn`, the same live move and one undo, and its ◆ is `LabDials.keyHere`. |
| **◉ Perform strip** (perform131) | One row on the owner's screen: cues, looks, freeze, black-out, Rec. ↑ / ↓ turn the selected dial. Nothing is saved. | **Extended:** a **★** on the strip (only when the scene has pins). It opens the panel there, folded until clicked. Moves are live only and are put back when Perform ends, like the dials. |
| **labkeys** (`tools/three-keys.js`) | The ease card for a keyframe diamond on the timeline. | Not touched. The panel's ◆ uses the Lab's own `toggleKeyFor`, the same as a slider's "◆ Keyframe at the playhead". |
| **Floating cards** (dials, Follow the music, Scene versions, …) | Small `position: fixed` cards with ✕ / Esc. | The ★ panel is one more of them (250 px). |
| **Time machine** (`tools/three-history*.js`) | Every meaningful change is a version: yours, the directors', shuffles, saved sliders. | **Read for ✦ Suggest favourites:** `TMCore.changes` between versions counts how often each slider changed. |
| **Phone remote** (`remote.js`) | The selected layer's sliders as faders, grouped like the Sliders panel. | **Extended:** the pins come first as one more group, "★ Favourites". Each fader moves its own layer's slider. The phone page is unchanged. |
| **The director's outline** (`three_layers` / `three_do layers`) | One line per layer, with its slider names. | **Extended:** a pinned slider's name ends in ★ ("Glow★"), and the legend line adds "★ = the owner's favourite" only when there is one. |

## What's new, and where the owner clicks

No toolbar row was added. The panel is folded by default every time a scene opens.

- **Pin a slider:** right-click it (knob or slider) › **★ Pin to favourites**. Right-click again for ☆ Unpin.
- **Pin a dial:** in 🎛 Dials, its **⋯ › ★ Pin to favourites**.
- **Open the panel:** the small **★** in the Sliders panel's head (next to ⋯), or Ctrl/⌘+K "Lab: ★ Favourite controls".
  ✕ or Esc folds it again.
- **The panel** is a compact column (250 px). Each row has:
  - its layer's name in small type ("Main", "Back", "🎛 Dial");
  - the control's name, its own control (slider with its own range, colour, on / off or choice) and its value;
  - its own marks: ♪ when it follows the music (〰 on a dial), 🔒 / 🔓 (click to lock or unlock), ◆ (a key at the
    playhead, lit when the slider is animated), and ✕ to unpin;
  - a ⋮⋮ grip: **drag it onto another row to reorder.**
- **Moving a control** moves the real slider on its layer, live. Letting go is **one undo step**, the slider's own (its
  layer's ↶ takes it back). It is also one step of the Lab's Ctrl/⌘+Z, and Ctrl/⌘+Z inside the panel undoes it. An
  animated slider gets a key at the playhead, as in its own panel. A locked one doesn't move.
- **Pin, unpin and reorder** are each one undo step too.
- **✦ Suggest** (in the panel's head) runs on this computer, with no AI and no tokens. It reads the scene's time machine
  and lists the sliders that changed in the most versions, best first, plus up to 2 dials whose sliders changed most.
  Each has ★ (pin it), and there is **Pin all**. Sliders that never changed are left out.
- **◉ Perform:** the strip shows **★** when the scene has pins. A click opens the column on the Perform screen. Moves
  there are live only, and Perform puts them back when it ends.
- **Phone remote:** if the phone remote is on, its group chips get **★ Favourites** with the pinned sliders from every
  layer.
- **Saved with the scene:** `sketch.favs` = `{ v: 1, list: [{ t: 's', layer, key } | { t: 'd', dial }] }` in kv
  `three-sketches`, in his order. A pin whose layer is gone shows as "gone" until he unpins it, so an undo of the layer
  delete brings it back.
- **The AI:** the director's layer outline marks pinned sliders with ★, so "turn up my favourites" points at real
  sliders. That is in the tool result only. The prompt and tool list are unchanged (promptdiet full 7782 / 7940, lean
  2060 / 2100; three_do 186 / 190).

## Files
- `tools/three-favs-core.js` (new, pure, loads in Node): `FavsCore`, the pins (`norm`, `add`, `remove`, `move`) and the
  suggestion (`counts`, `suggest`).
- `tools/three-favs.js` + `tools/three-favs.css` (new): `LabFavs`, the panel, its moves and undo, drag, ✦ Suggest,
  Perform's put-back, and the Ctrl/⌘+K line. Lazy group **favs** (`tier: 'use'`, after `lab`) in `lazy-data.js` (the
  manifest was re-run). Also `index.html`'s `lazy-at.js#…dials,favs,…` and `docs/lazy-groups.md`.
- `tools/three-tweaks.js` (marked): the `pins` option, the ★ in the head, and the right-click row.
- `tools/three.js` (marked): `pins` for each controller, `stageHooks.favs / setFavs / keyState / toggleKey`, and the ★
  on pinned slider names in the layers summary.
- `tools/three-dials.js` (marked): the ⋯ row.
- `tools/three-perform.js` (marked): the strip's ★, and the put-back when Perform ends.
- `tools/three-director.js` (marked): the "★ = the owner's favourite" legend.
- `tools/three-lab.css`: the ★ button's colour.
- `remote.js` (marked): the "★ Favourites" group.
- `dev/checks/favs138.js` and the `favs138` group in `dev/run-checks.js`.

## Tests
One app check, **`dev/checks/favs138.js`** (group `favs138`). It runs on its own temp data, with a two-layer scene it
makes (Main: Speed, Glow, Noise; Back: Contrast, Brightness) and a fixture time-machine history it writes. All 15 steps
pass (44 s):
1. Folded by default: no panel, only the ★ in the Sliders panel's head. A click opens the compact panel (≤ 270 px).
2. ✦ Suggest from the fixture history gives Glow (3 versions), Contrast (2), Noise (1). Speed and Brightness never
   changed and are left out.
3. Glow (Main) and Contrast (Back) are pinned from their real right-click menus, and Energy from its dial's ⋯. The
   panel stays folded. Opened, it shows "Main", "Back" and "🎛 Dial", each slider's own range, 🔒 and ◆.
4. Moving the pinned Glow moves the real slider live, with no undo step. The release is one step (the slider's own and
   the Lab's), and one Ctrl/⌘+Z in the panel puts it back exactly.
5. A real drag of the dial's grip onto the first row moves it to the top. ✕ unpins Contrast.
6. The pins are in kv `three-sketches`. Another scene has none, and back on this scene the same two are there in order.
7. ◉ Perform's strip shows ★ with the panel folded. A click opens it on the Perform screen. A move there is live and is
   put back when Perform ends.

Also run (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`), all passing:
`mooddial135`, `perform131`, `labchat92`, `outline136`, `unit:promptdiet-test` (7782 / 7940, 2060 / 2100, unchanged),
`unit:director-mcp-test`, `unit:boot-test`, `unit:lazymanifest-test`, `unit:selfmap118-test`, and `node dev/boot-test.js`
(3113 checks; first screen 62 scripts, 1585 KB of 1586).
`unit:slim116-test` reports one problem, and it was there before this round: a line in `dev/checks/tour137.js` (round
137) that it reads as a removed IPC channel. This round didn't touch that file.

## Risks / not done
- Suggest reads the time machine's versions in time order. Slider moves he never saved or kept are not versions, so
  they don't count. Across branches, two versions next to each other in time are compared as one step.
- LabTxn's reply records (kv `labtxn-replies`) were not read. That area belongs to the sectionmood138 stream this
  round. The directors' changes still count, because each one is a time-machine version.
- The phone remote shows pinned sliders, not pinned dials (its faders are slider moves).
- In Perform, a slider with keys of its own, or a keyed dial, isn't moved from the panel (a toast says so), the same
  as Perform's dial keys.

## For the patch notes
- **★ Favourites:** the few sliders you really use, from any layer, in one small panel.
- Right-click a slider and choose **★ Pin to favourites**. For a mood dial, use its ⋯.
- Click the small **★** in the Sliders panel to open your favourites. Each one shows which layer it's on, and keeps its
  lock, its keyframe ◆ and its music mark.
- Moving a favourite moves the real slider. One Undo (Ctrl/⌘+Z) takes it back.
- Drag the ⋮⋮ to put them in your order, and ✕ to remove one. They're saved with the scene.
- **✦ Suggest** picks the sliders you've changed most in this scene. It runs on your computer and costs nothing.
- In **◉ Perform**, a ★ on the strip opens them on the show screen. Nothing you move there is saved.
- On the **phone remote**, your favourites show as their own group.
- The director sees which sliders are your favourites, so "turn up my favourites" works.

## For Codex
No Codex-owned file was edited: `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged. There is nothing to merge on your side.
- **Data:** the pins live on the scene (`sketch.favs` in kv `three-sketches`). It is a new additive field that syncs
  with the scene, with no new store and no new sync kind.
- **Astra:** Astra's directors see the same ★ marks in the layer outline as Claude's do, through the same bridge. No
  prompt or tool text changed.
