# Round 141 · cmdbar141: ⌁ Say it in plain words, in the Lab's command bar

The owner wanted to make quick edits in the Lab by typing what he wants ("glow 0.8 on the drop", "add bloom", "jump
to drop") instead of finding the slider, the layer, the cue or the menu. The words are read **on his computer**: a small
grammar plus fuzzy names. No AI is used and nothing is sent. Words it doesn't know can go to the director, but only when
he clicks.

## What existed (and what this round does with it)

| Piece | What it does | Used here? |
| --- | --- | --- |
| **The command bar** (`cmdbar.js`, Ctrl/⌘+; anywhere, lazy group `cmdbar`) | A one-line bar over any tool. It runs `/commands` where you are (in the Lab, Lab commands), with ↑ / ↓ history, Ctrl+R search, `?` / F1 help, pins (Alt+1…9), timers, macros and an output card. Plain words only get "Commands for that" guesses (`Commands.suggest`) and a "➤ Send to <chat>" row. | **Extended, not duplicated.** Over the Lab it gets a **Lab mode**: it sits on the preview, shows Lab examples as ghost text, a line under the bar says what Enter will do, Enter applies it as one undo step, `?` lists the Lab words. The key (Ctrl/⌘+;) and its first-screen stand-in already existed, so **no new key** was added. Ctrl/⌘+L is the bar's own "clear the card", and `;` alone would type into fields. |
| **Ctrl/⌘+K** (`AppUI.palette`, the "Find anything" palette) | Settings, menus, chats, and ~1400 named actions, including the Lab's ("Lab: 🎛 Mood dials", "Lab: Explain this layer"…). It finds actions by their names and doesn't take values. | One new line: **"Lab: ⌁ Say it in plain words"** opens the bar over the Lab. |
| **The Lab's `/commands`** (`tools/three-cmds.js` and each feature: `/move-with`, `/camera-moves`, `/map-song`, `/blocks`, `/explain-layer`, `/sliders`…) | Exact commands with arguments, typed in a director chat or the bar. | Left alone. A line starting with `/` in the bar still runs a command. The plain words reach the same parts underneath (below). |
| **The director chat** (docked beside the Lab) | The AI that writes and changes scenes through the `three_*` tools. Each reply is one undo step (LabTxn). | **✦ Ask the director** sends the owner's words there as his own message, only on that click. Everything else goes through the director's own tool paths (`HubBridge.call`), without the AI. |
| **Plain words elsewhere** | explain132's "Make it…" (an AI pass that turns a wish into slider values and keys), `Commands.suggest` (plain words → a `/command` line), `/move-with`'s band names (`BeatLinkCore.parseDriver`), the dials' `find`, the 🧩 blocks' names. | Same spirit, but local and instant. `BeatLinkCore.parseDriver` names the bands; the blocks' and render presets' own lists name those. |
| **🎛 Dials** (mooddial135), **🧩 Blocks** (blocks134), **♪ / 🎚 Follow the music** (beatlink, audiomap134), **solo / eyes** (layergroups), **cues** (the timeline), **render presets** (renderpre131) | The things the words drive. | Reused as they are: `three_sliders { dial }`, `three_do blocks`, `BeatLink.fresh` + the slider's link, `ThreeLab.cmd().solo`, `three_update_layer { visible }`, the player's cues and `seek`, `LabExport.panel({ preset })`. |

## What's new, and where the owner clicks

- **Open it:** **Ctrl/⌘+;** while the Lab is on screen (or Ctrl/⌘+K › "Lab: ⌁ Say it in plain words"). The bar sits on
  top of the preview. While it is empty it shows an example as ghost text, a new one every few seconds ("Try “glow 0.8
  on the drop”").
- **Type plain words.** A line under the bar says what Enter will do, before anything changes:
  - `glow 0.8` → **Glow ring · Glow 0.4 → 0.8** (the selected layer's slider first, else the best match in the scene;
    "ring glow" names the layer too);
  - `set glow to 80%`, `glow max`, `more glow`, `speed down` (more / less moves 15 % of the slider's range);
  - `glow 0.8 on the drop` → **Glow ring · Glow → 0.8 at Drop 1 (0:32) · a key**. Also `at 1:20`, `on the second
    drop`, `on the last break`. A slider with no keys yet gets one more key just before, at its value now, so only
    the drop changes;
  - `add bloom`, `add particles`, `add kaleidoscope` → a 🧩 block above the selected layer;
  - `hide sparks`, `show sparks`, `solo ring`, `solo off`;
  - `energy up`, `darkness down`, `energy 80%` → turns a 🎛 dial;
  - `follow bass`, `glow follows the kick` → ♪ the slider follows the music. Without a name it's the slider you moved
    last, or the one you named in the bar last;
  - `jump to drop`, `go to the chorus`, `jump to 1:20` → moves the playhead;
  - `render reel`, `render square`, `render 4k` → opens ⇪ Render on that preset (nothing renders until ⇪ Export).
- **Enter** applies it as **one undo step**: Ctrl/⌘+Z in the Lab, the dock's ↶, or the card's ↶ Undo. The bar stays
  open for the next line, and a small card says what was done.
- **↑ / ↓** go through what you typed before (the bar's own history, shared with its `/commands`).
- **`?`** (typed, or the bar's ? button while it's empty) lists what it understands, with examples. F1 still lists
  every command.
- **Words it doesn't know** ("make it feel like a rainy night"): the line offers **✦ Ask the director: …**. Enter
  shows the same offer in the card, with any matching `/commands`. **Nothing is sent until that button is clicked.**
  The click sends the words to the docked director as your message, or puts them in its chat box while it is busy.
- **Keys sheet:** a "Command bar · Type in the Lab" line with the examples.

### Files
- `tools/three-say-core.js` (new, pure, loads in Node): the grammar, fuzzy names (word match, prefixes, one typo),
  values (0.8, 80 %, max, half), times and cues ("the second drop", 1:20, the song's own drops and sections when no
  cue is named so), blocks, presets, bands, the preview line, `EXAMPLES` / `HELP`.
- `tools/three-say.js` (new): `LabSay`, which gathers the scene's names, previews, applies (one LabTxn step through
  `LabTxn.reserve`), undoes, asks the director, and holds the Ctrl/⌘+K line. New lazy group **labsay** (`tier: 'use'`,
  after `lab`, `cmdbar`, `blocks`) in `lazy-data.js` (manifest re-run), `index.html`'s `lazy-at.js#labsay` and
  `docs/lazy-groups.md`.
- `cmdbar.js` (marked): a small hook for a place that reads plain words itself (`addPlain`). It loads `labsay` when
  the bar opens over the Lab, places the bar on the preview, shows the line under the bar, sends Enter and `?` to
  the Lab's reading, and keeps history. `cmdbar.css`: the line's look.
- `tools/three.js` (marked): `stageHooks.lastSlider()`, the slider moved last, for "follow bass".
- `keys-lines.js`: the keys-sheet line. `dev/checks/cmdbar141.js` and the `cmdbar141` group in `dev/run-checks.js`.

The first screen holds: the bar's key stand-in already existed, and only the group's manifest line was added
(boot-test below).

## Tests

One app check, **`dev/checks/cmdbar141.js`** (group `cmdbar141`, `--fake-engines`), on its own temp data, a
three-layer scene it makes (Back, Glow ring, Sparks), the fixture song and its sections:
1. Ctrl/⌘+; opens the bar on the preview, with the Lab words loaded and an example as ghost text.
2. "glow 0.8": the preview line reads "Glow ring · Glow 0.4 → 0.8 … Enter" and nothing changes before Enter. Enter
   sets it, and ONE Ctrl/⌘+Z puts it back exactly.
3. "glow 0.8 on the drop": a key at the Drop cue (the line names it). One Ctrl/⌘+Z takes it away.
4. "add bloom": the 🧩 Bloom block is added. One Ctrl/⌘+Z takes it away.
5. "hide sparks", "solo ring", then "solo off" and "show sparks".
6. "energy up" turns the 🎛 Energy dial. "follow bass" makes the slider named last (Glow) follow the bass.
7. "jump to drop" moves the playhead to the cue.
8. ↑ / ↓ go through what was typed.
9. Unknown words: the line offers "✦ Ask the director" and nothing is sent, Enter included (the card offers it
   too). The click sends ONE message to the docked director, word for word.

Run (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`):
- `cmdbar141` ✓ (54 s, 22 steps);
- `qa-keys` ✓ (no new conflict: the Lab line sits under "Command bar" as "Type in the Lab", not as a second Ctrl+;);
- `blocks134` ✓, `mooddial135` ✓, `labchat92` ✓;
- `node dev/boot-test.js` ✓ (3190 checks: first screen 62 scripts, 1538 KB of 1547);
- `dev/lazy-manifest.js` re-run (✓ names, actions, keys), `dev/slim116-test.js` ✓, `dev/selfmap118-test.js` ✓.

## Risks / not done
- The words are English only, and the grammar is small on purpose. Anything beyond it goes to the director (on
  the click).
- "glow 0.8 on the drop" replaces a key that was already at that exact time. It keeps the slider's other keys.
- A block added by words also leaves the 🧩 card's own undo entry under the bar's step. A second Ctrl/⌘+Z then
  finds the scene already as it was and changes nothing.
- "follow bass" with no slider named uses the slider moved last in the Sliders panel or named last in the bar.
  Without either, the line asks for a name.

## For the patch notes
- **Type what you want in the Lab.** Press **Ctrl+;** (⌘; on a Mac) and type plain words: "glow 0.8", "more glow",
  "glow 0.8 on the drop", "add bloom", "hide sparks", "solo ring", "energy up", "follow bass", "jump to drop", "render
  reel".
- **See it before it happens.** A line under the bar says what Enter will do ("Glow ring · Glow → 0.8 at Drop 1").
- **One Undo.** Enter does it, and Ctrl+Z takes it back.
- **Free and instant.** It's read on your computer. No AI and no tokens.
- **Not sure what to type?** Type **?**, or watch the examples in the empty bar. ↑ brings back what you typed before.
- **Something bigger?** For words it doesn't know, click **✦ Ask the director** to send them to the director as your
  message. Nothing is sent before you click.

## For Codex
No Codex-owned file was edited: `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged. There is nothing to merge on your side.
- **Astra:** ✦ Ask the director sends to whichever AI is docked as the Lab's director (Claude or Astra), as an
  ordinary owner message. The local words call the same `three_*` handlers the directors use (`HubBridge.call`), with
  no new tool, guide line or prompt part, so both engines' prompt budgets are unchanged.
- **Data:** no new store. The bar's history is the command bar's existing `commands.history` (localStorage). Changes
  land in the scene (kv `three-sketches`, the scene's extras) as any Lab edit does.
