# Time machine (round 23): a visual history of every Lab scene

You asked for "at least 5 major changes"; this one is the Lab's memory. Every meaningful change to a scene is now a
version with a tiny picture, who made it (you, Claude, Astra or a crew helper) and a one-line label. Scrub through
them on the preview, compare two, restore one, branch from one, or take just the colors / the sliders / one layer
back. Each director turn's start is bookmarked, so "go back to before Claude's last 3 edits" is one step.

Open it from **Sketch ▾ → ⏱ Time machine…**, **Alt+H** (⌥H) in the Lab, Ctrl/⌘+K "Lab: Time machine", or `/history`.
No new button on screen: it's a strip that sits over the bottom of the preview while it's open.

## Measured (headless, SwiftShader, `dev/checks/timemachine.js`)

| | |
|---|---|
| Recording a version (state, diff, label) | 0.5–0.7 ms of the app's time, after the change, never during a drag |
| 105 versions of a scene (20 runs, 20 layer adds/removes, 20 slider saves, 21 shuffles, 22 director edits, a crew pick) | 67 KB on disk (5 full states + deltas) |
| Deltas vs full copies (120 random edits, `dev/timemachine-test.js`) | 26 % of the size |
| A version's picture | ≈ 5.5 KB (120 px JPEG from the preview's own thumbnail channel), in its own file |
| Scrubbing to a version (it's on the preview) | 5–29 ms of the app's work; only layers whose code differs re-run, in place |
| Compare (renders both versions, two pictures) | ≈ 1.8 s here (software GPU) |
| At start / scene switch | nothing loaded: a scene's history is read the first time it changes, 2.5 s after it opens (idle) |

## What becomes a version
1. **Code you run** (▶ Run, Ctrl+Enter, live code): a version when the code really changed ("Code run · Orb +3 −1").
2. **Layers**: added, removed, moved, or a layer's opacity / blend / position / timing changed ("Layer added · Glow").
3. **Sliders saved** into the code (the panel's Save) ("Sliders saved · spin, size").
4. **A shuffle you keep**: a shuffle left alone for 5 s ("Shuffle kept · spin, tint"); shuffling on through them doesn't fill the history.
5. **Director edits** (Claude or Astra), recorded the moment their call ends, so your next move is never counted as theirs.
6. **Crew picks**: a crew helper's variation you pick is marked as the crew's.
7. **Scenes changed backstage** (a chat working on a scene that isn't on screen) get their versions too.
8. Slider drags you don't save aren't versions on their own; their values ride along in the next version (and come back when you scrub to it).
9. **A first version** when a scene is first opened, and "what changed meanwhile" when it changed elsewhere.
10. **Who made it** on every card: ● you, ✳ Claude, A Astra, ✦ a crew helper (in their colors).
11. **One-line labels** written from what changed (layers, lines, slider names, palette).
12. **A tiny picture of each version**, made by the preview off its frames once the change is drawn (the thumbnail channel the director's pictures use).
13. Versions made too quickly for a picture get one **as you scrub to them**.

## Light and sync-friendly
14. **Compact**: each version is a line diff + changed props against one of a few full states (never a long chain).
15. **Thinning**: every version from today, the last of each hour for the week (director bookmarks of the week kept), the last of each day after that; at most 160 per scene; the newest always stays. `/history thin` runs it now.
16. **One file per scene** (`kv/three-tm-<scene>.json`), pictures apart (`…-t.json`), read only when the time machine opens.
17. **Cloud sync**: two computers' versions merge by id and every version still rebuilds (tested with sync's own three-way merge); versions arriving while the Lab is open are merged in.

## The strip (scrub)
18. **⏱ Time machine**: one row of tiny pictures over the preview, oldest → newest, **NOW** at the end.
19. **Click a card: that version is on the preview, live** (its code, layers and slider values, in place; nothing saved).
20. **← / →** older / newer, **Home / End** first / now.
21. **Esc or NOW** puts the scene back exactly as it was (in memory and on disk).
22. **G**: all versions as a grid.
23. Day separators (Today, Oct 10…).
24. **⚑ on the cards where a director turn began**, with what you asked in the tooltip.
25. The tooltip of a card: who, when, the label; the head line shows the one on screen.
26. **Change the version on screen** (type, move a layer…) and it becomes the scene with your change; nothing is lost (the one before is in the history).
27. **Right-click a card** for its menu (the same as ⋯).

## Compare
28. **C: compare with now**: both versions rendered, shown as a split wipe you drag across.
29. **⋯ → Compare with…** any of the last versions.
30. **D: what changed** since that version: layers added / removed, props, slider values (with color swatches), and the code diff (+ / − lines with context). The compare view shows it beside the pictures.

## Restore, branch, pick
31. **Restore** (Enter, the Restore button): that version becomes the scene, as a new version; **Undo** in the toast or `/back undo`.
32. **Branch** (B, `/branch [name]`): a new scene from that version (or from now), with the scene's song, frame size and looks; unsaved slider values are written into its code; its history starts with "Branched from …". The scene on screen stays.
33. **Pick the colors** from a version: its color sliders and palette only (undoable).
34. **Pick the slider values** from a version: every slider as it was, your code otherwise untouched (undoable).
35. **Pick one layer** from a version: replaced, or put back where it was if you deleted it (undoable).

## Before the director
36. **Every director turn's start is bookmarked** (Claude's and Astra's), with what you asked.
37. **⋯ → Back before the director → the last 1 / 2 / 3 / 5 turns**: one click.
38. **`/back n`**: back to before the director's last n turns that changed this scene.
39. **`/back n claude|astra`**: only that agent's turns.
40. **`/back undo`** takes the last restore / pick / back from a command back.

## Commands and finding it
41. **`/history`** opens the time machine and lists the last versions (in the Lab; `/history` elsewhere is still your recent chats).
42. `/history list [n]`.
43. `/history show <n>` (n versions back; shows it on the preview).
44. `/history compare <a> [b]` (default: with now).
45. `/history restore <n>`.
46. `/history pick colors|sliders <n>` · `/history pick layer <name> <n>`.
47. `/history thin`.
48. `/history close`.
49. **`/branch [name]`** in the Lab (from the version on screen in the time machine, else from now); outside the Lab `/branch` still branches a chat (`/fork` always does).
50. **Alt+H** and the strip's keys in the keys sheet (bottom left), "Lab time machine".
51. Ctrl/⌘+K: "Lab: Time machine".
52. The app map the chats read on demand (`mcp/hearth-map.js`) knows `/history`, `/back`, `/branch` (no per-message tokens).

Count: **52** upgrades.

## Tests
- `dev/timemachine-test.js` (unit, Node): diff / patch round-trips (300 random edits + a rewrite), 120 versions rebuild exactly, compact size, thinning (today / hourly / daily / cap), two computers merged with sync's three-way merge, code diff.
- `dev/checks/timemachine.js` (lab group, fake engines): ~20 changes of each kind (code runs, layer add / remove, sliders saved, shuffles kept, director edits through the real HubBridge handler, a crew pick) → 105 versions with the right authors / kinds / labels; a picture; scrubbing 6 versions (the layers the preview runs, the code and slider values match each); ← key; Esc restores memory and disk; compare (two pictures + diff); restore + undo; pick colors / sliders / layer + undo; branch; three fake-engine director turns bookmarked + `/back 3` + `/back undo`; thinning over two months of times; kv saved; `/history`, `/history list 3`, `/branch`.
- Ran: timemachine-test, timemachine, lazy, qa-commands, labdirector, labhub, director-mcp-test (pass); scenes: all pass but "switching cross-fades from a picture of the old scene" (707 ms vs its 700 ms limit), the step labdirector's round-21 notes record as failing the same way on the base commit under load.

## Notes / risks
- Scrubbing swaps the scene's layers in memory without saving; if Hearth is killed mid-scrub and something else saved the sketch meanwhile, the scene on disk is the version on screen. The live state is always the newest version, so it's one Restore away.
- Changes you make while a director call is running on the same scene are counted as the director's.
- Versions of backstage scenes have no picture until you scrub to them.
- Outside this lane (small, additive): `tools/three.js` (one hook in run, touch, the sliders' commit and scenes.changed; `api.tm` state/show block; snapshot skips while a version is shown; the HubBridge handler wrapped; one Sketch ▾ item; a `tm` getter), `tools/three-tweaks.js` (a hook in shuffle and shuffle step), `tools/three-crew.js` (one line marks crew picks), `lazy-data.js` (lab group + manifest), `mcp/hearth-map.js` (one line), `dev/run-checks.js` (lab group, unit list).
