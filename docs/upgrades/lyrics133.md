# Round 133 · lyrics133: lyrics synced to the song

The owner wants song lyrics on screen, in time with the music, styled like the rest of a Lab scene. Most of the parts
already existed (round 25's type layers, round 45's text that moves). What was missing was one place to bring the
lyrics in, time them against the song's bars, see and drag them on the timeline, and style them per section. This
round adds that place.

## What existed (and is reused, not duplicated)

| Piece | What it does | Used here? |
| --- | --- | --- |
| **🅰 type layers** (`tools/three-type.js`, `three-type-data.js`, the sandbox's `textLayer`, round 25) | A layer whose code is `tweak({…})` + `textLayer(P, opts)`. `opts.lyrics = [[start, end, "line", [word starts]]…]` shows timed lyrics in 6 looks (fades, karaoke, one word, scroll, typed, 3D lines). The sliders include size, position, kick scale / glow, in / out animations. `/lyrics`, `Lyrics…` and `Lyrics from a file…` in ＋ Add › 🅰 Type. | **Reused as is.** The new lyrics layer is `LabType.codeFor` of the karaoke preset with a style's slider values. Edits go through `LabType.setOpts / setValue` and `three_update_layer`. |
| **Lyric parsing and alignment** (`tools/three-type-lyrics.js`, `TypeLyrics`) | Reads plain text, .lrc (also word-timed), .srt / .vtt. `align` spreads untimed lines over the singing span by syllables and snaps them to drum onsets. `tap` is the tap-along correction. `wordTimes`, `pack / unpack`. | **Reused:** `parse`, `lineSyl`, `wordTimes`, `tap`, `span`, `pack / unpack`. The new ✦ Auto-time uses bars and sections instead of onsets, and tap to time snaps to the beat grid instead of onsets. |
| **🎤 Tap along** (`LabType.tapMode`) | Space at each line, snapped to an onset within 80 ms, written to the layer as you go. | Left alone. The new tap to time snaps to the **beat grid**, works before there is a layer, and keeps everything as **one** undo step. |
| **Text that moves** (`tools/three-kinetic*.js`, round 45) | 22 presets that step words in on the beat / kick, with live previews. A "Lyric line" preset. Lyric lines on your markers. | **Reused:** the "Word on the beat" style uses its sliders (`kSync: beat`, `kFx: punch`). Its picker is unchanged. |
| **The song analysis** (`tools/three-music-core.js`, the player) | BPM, beat grid, downbeat, sections (Intro / Build / Drop / Break / Outro with energy). `LabType.music()` collects them. | **Reused:** the grid and the sections drive auto-time, tap snapping, the per-section styles and the AI prompt. |
| **Timeline, cues and keyframes** (`tools/three-media.js`, `three.js`) | Cues with looks; slider keyframes `L.keys['s:<key>']` that the preview page evaluates (so renders match); `addHooks` to draw on the timeline; `LabDirect.push` for one Ctrl/⌘+Z step. | **Reused:** the lane reads the timeline's view through `addHooks`. Per-section styles are `hold` keyframes on the layer's own sliders. Every change is one `LabDirect.push` step. |
| **✦ Map to the song** (`tools/three-songmap*.js`, round 130) | Cues, drop moves, looks and beat links per section, as ghosts. The AI refine is shown with its cost first. | **Its pattern is followed:** free and local first, the AI only on a click with its cost shown, one undo. The section naming ("Drop 2") is the same. |
| **Text templates** (`three-templates*.js`) | Scenes saved as templates with fields. | Not touched. A lyrics layer is an ordinary type layer, so templates keep it. |

## What's new, and where the owner clicks

- **Ways in** (no new toolbar row):
  - **Sections ▾ › 🎤 Lyrics synced to the song…** in the Lab timeline.
  - **＋ Add › 🅰 Type › 🎤 Lyrics synced to the song…**
  - A lyrics layer's right-click › 🅰 Type › **🎤 Lyrics card…**
  - The **🎤** at the left of the lyrics lane.
  - `/lyrics-sync` (`paste`, `open`, `auto`, `tap`, `add [style]`, `style <style>`, `sections`, `ai`, `close`).
  - Ctrl/⌘+K: "Lab: 🎤 Lyrics synced to the song".
- **The card** is small (330 px) and folds away with ✕ or Esc. It shows only what makes sense now:
  - **Paste…** (one line of the song per line; an .lrc pasted keeps its times) and **Open file…** (.lrc, .txt, .srt).
    The lyrics are **stored with the scene** (`sketch.lyrics`), and in the lyrics layer's code when there is one.
    `[Verse]`-style tags and blank lines are dropped.
  - **✦ Auto-time** (free, on this computer). The sung sections (not the intro or outro) share the lines by their
    length in bars. A section's bars go to its lines by syllable count. Each line starts on a bar line, or on a beat
    when a section has more lines than bars. The words spread inside the line. Pasting plain text auto-times it at
    once, so the lane has blocks to show.
  - **🎤 Tap to time.** The song plays. Press Space at each line start; the press snaps to the nearest beat of the
    grid. Backspace goes back, Enter keeps (one undo step), Esc cancels.
  - **＋ Add a lyrics layer** in the picked style, coloured from the scene's palette (the accent and glow colours).
  - **Style**: a compact list of 7 styles, each with a live preview of the first lyric line: Karaoke, Word on the beat,
    Soft fade, Calm, Punchy, Typed, Scroll. A click restyles the layer (one undo).
  - **Sliders**: Size, Left / right, Up / down, Kick. They're live while dragging and saved on release (one undo).
  - **Per section** (free): calm where it's quiet, word-on-the-beat on builds, punchy on the drops. These are `hold`
    keyframes on the layer's own sliders (look, size, glow, kick, moves on, hit effect), so renders match.
  - **✦ Style the lyrics** (the AI). The cost is shown first ("≈2,300 tokens with its reply"), and nothing is sent
    before OK. The director gets the sections, the styles' slider values and a suggestion. It picks per section and
    applies them with the existing `three_keyframes` (`three_do keyframes`). Its whole reply is one undo step
    (LabTxn: the dock's ↶ or `/undo-edit`).
- **The lane**: a thin row under the song's waveform, shown when the scene has lyrics. Each line is a small block.
  The sung line lights up. Drag a block to move the line (on the beat; Alt: free). Each drag is one Ctrl/⌘+Z. Click a
  block to jump the playhead to its line.
- **No new MCP tool, help line or prompt part.** The prompt budgets are unchanged.

### Files
- `tools/three-lyrics-core.js` (new, pure, loads in Node): `read`, `grid`, `sectionsOf`, `autoTime`, `tapAt`, `move`,
  `lineAt`, `STYLES` / `styleValues` / `pick` / `sectionPlan`, `askText`, `estimate`.
- `tools/three-lyrics.js` + `tools/three-lyrics.css` (new): `LabLyrics` (the card, the lane, tap to time, the
  layer, styles, per section, ✦ Style the lyrics, `/lyrics-sync`, Ctrl/⌘+K). Lazy group **lyrics** (`tier: 'use'`,
  after `lab`) in `lazy-data.js` with the regenerated manifest (`lazy-meta.js`), `index.html`'s
  `lazy-at.js#…,lyrics` tag and `docs/lazy-groups.md`.
- `tools/three.js` (marked): `stageHooks.lyrics()` / `setLyrics(v)`, the scene's lyrics read and saved.
- `tools/three-media.js` (marked): the Sections ▾ row.
- `tools/three-type.js` (marked): the ＋ Add › 🅰 Type row and the lyrics layer's "🎤 Lyrics card…" row.
- `dev/fake-common.js` (marked): the fake director's answer to ✦ Style the lyrics (its suggestion, as hold keyframes).
  `dev/fake-liveness.js` (marked): that message never starts a long-task scenario.
- `dev/checks/lyrics133.js` (new) and the `lyrics133` group in `dev/run-checks.js`.

The first screen is unchanged apart from the manifest lines (boot-test: 62 scripts, 1581 KB of 1586 KB).

## Tests

One app check, **`dev/checks/lyrics133.js`** (group **lyrics133**, `--fake-engines`). It uses its own temp data, a
scene it makes itself and the fixture song `/tmp/hearth-autoedit-song.wav` (128 BPM, intro / build / drop / break /
drop / outro, made by run-checks as for songmap130):
1. Sections ▾ › 🎤 Lyrics synced… opens the card. **Paste…** of 8 lines (plus a `[Verse]` tag and a blank line) is
   kept with the scene. **✦ Auto-time** puts every line on a bar line, in the sung sections, in order. The lane shows 8
   blocks.
2. **Dragging** a block moves that line onto a beat, and its neighbours stay. **One Ctrl/⌘+Z** puts the lines back
   exactly.
3. **Tap to time:** Space at three moments between beats lands each line on the nearest beat. Enter keeps them, and
   one Ctrl/⌘+Z puts them back.
4. An **.lrc** keeps its own times (12.40, 16.85, 21.10, 25.73).
5. **＋ Add a lyrics layer.** The preview page shows line 2 inside its time, line 3 after it, and none before the
   first (read from the page). **Punchy** from the style list sets its sliders (7 live previews drawn), and one Ctrl/⌘+Z
   puts the layer back.
6. **Nothing was sent** to any AI through all of that. **✦ Style the lyrics** shows the token cost, and Cancel sends
   nothing. OK sends one message. The fake director keyframes the styles per section (fades on the quiet parts, one
   big word on the drops). **`/undo-edit`** puts the layer back exactly.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`):
- `lyrics133` ✓, `songmap130` ✓, `labchat92` ✓, `kinetictype` ✓, `unit:kinetictype-test` ✓, `unit:type-test` ✓
  (6/6 in 5 min);
- `node dev/boot-test.js` ✓ (2988 checks; first screen 62 scripts, 1581 KB of 1586 KB);
- also `dev/lazymanifest-test.js`, `dev/slim116-test.js`, `dev/selfmap118-test.js`, `dev/promptdiet-test.js` and
  `dev/director-mcp-test.js` ✓ (no prompt or tool text changed).

`dev/fake-liveness.js` (marked) treats a "✦ Style the lyrics" message like the brief and the critique. Without that,
the word "quiet" in a section's description started its long-task scenario.

## Risks / not done

- The lane shows once the lyrics group has loaded (any of the ways in). A scene with lyrics opened right after the
  app starts shows its lane after the first 🎤 click. The lyrics layer plays the lyrics either way.
- Auto-time is a good first guess, not speech recognition. Sections with no singing in them can still get lines.
  Dragging or tapping fixes them.
- Per-section styles are keyframes on the layer's sliders. Changing the style from the list afterwards sets the
  sliders, but the keyframes still win at playback. Remove them from the timeline's lanes, or use Ctrl/⌘+Z.

## For the patch notes

- **Lyrics that follow the song.** In the Lab timeline, open **Sections ▾ › 🎤 Lyrics synced to the song…**.
  - **Paste** the lyrics (one line of the song per line) or **open** an .lrc, .txt or .srt file. They're saved with
    the scene.
  - An .lrc keeps its own times. Plain lyrics are placed on the song's bars for you, section by section, longer lines
    getting more time (**✦ Auto-time**, free, no AI).
  - Or **🎤 Tap to time**: the song plays, and you press Space as each line starts. Your taps land on the beat.
- **See them on the timeline.** Each line is a small block under the song, and the line being sung lights up. Drag a
  block to move a line; it lands on the beat. Ctrl/⌘+Z undoes each move.
- **Put them on screen.** **＋ Add a lyrics layer** and pick a style from the small list with moving previews:
  Karaoke, Word on the beat, Soft fade, Calm, Punchy, Typed or Scroll. It uses your scene's colours. Sliders set the
  size, the position and how much it hits on the kick.
- **Different styles for different parts.** **Per section** makes the verses calm and the drops punchy, for free.
  **✦ Style the lyrics** lets the AI choose per section. It shows what it costs first and sends nothing until you
  say OK; one Undo takes its changes back.

## For Codex

No Codex-owned file was edited. `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged. A scene's lyrics are a new optional field on the
sketch (`lyrics: { kind, lines: [[a, b, "text", [word starts]]…] }`) in kv `three-sketches`, which syncs as part of
the scene like its other fields. Astra's directors get ✦ Style the lyrics exactly as Claude's do: the same message
and the existing `three_keyframes` / `three_do keyframes`, through the same bridge and LabTxn undo.
