# Round 131 · perform131: ◉ Perform, the Lab live while the song plays

The Lab could already put a scene on a second screen, freeze it, black it out, tap a tempo and learn MIDI pads. Those
tools were spread over Present, the Stage window and the 🎚 Live (VJ) menu, and they were built for switching between
**scenes**. ◉ Perform is for switching **inside one scene** while the song (or live sound) plays: cues on the number
keys, saved looks on Q W E…, landing on the next beat or bar. Nothing in the scene is saved unless you ask for it.

## What existed (and is reused, not duplicated)
- **▣ Present** (`tools/three.js` `togglePresent`, round 52 `tools/three-ready.js`): the preview full screen in Hearth's
  window. P, Esc, Space play / pause, F freeze, B black-out (`.lab-blackout`, a 0.6 s fade), I info, PgUp / PgDn
  scenes, 1–9 jump to cues **at once** (the timeline's own keys, not quantised). Right-click: from the top, the loop,
  bake, Stage window.
- **▶ Play / gamemode** (`gamemode.js`, `gamemodemain.js`): the scene as a game in its own window at max fidelity,
  its layers merged into one canvas. It runs a scene standalone, without the Lab's cues, looks or MIDI. A scene that
  needs the Lab while it plays (MIDI, live sound) already plays live **through the Stage window**. So the Stage window
  is how live output works, and Perform uses it.
- **The Stage window** (`stage:open` / `stage:place` in `main.js`): the Lab's sandbox page in its own window and process,
  `backgroundThrottling: false`, placed full screen on another screen with the hub keeping the keyboard.
- **🎚 Live (VJ) / show mode** (`tools/three-stage.js`, round 22): set list of scenes, GO with cut / fade / dip on the
  beat or bar, a tempo clock (the song's grid while it plays, else MIDI clock in, else taps), `output()` on the other
  screen, `blackout(on, ms)` that reaches the output, beat LFOs, show-mode safety.
- **MIDI** (`tools/three-stage-midi.js`): learn knobs per slider (soft takeover), learn a pad or a key for an action
  (`ThreeStage.act`), MIDI clock in. `interop-midi.js` is MIDI **out** (clock, notes, CC to lights and synths); it isn't
  needed here.
- **⚡ Triggers** (`tools/three-triggers.js`): the kick / bass / snare / hats / hit bands the sketch reacts to.
- **🎧 Live input** (`tools/three.js` `liveKind`): computer sound or a mic instead of a song, with a BPM read.
- **Cues with looks** (`tools/three-media.js` `onCue`): a cue can carry `looks: [{ layer, name }]`; playback plays
  them with `playLook` (morphed in, **never saved**). Round 130's ✦ Map to the song makes these per section.
- **Beat links** (round 38) and the **frame tools**: ▮ framebar (`tools/framebar*.js`), gameperf, and the sandbox's
  frame recorder `window.__labHitch` (round 89).

## What's new, and where the owner clicks
**◉ Perform** is a row in **▣ Present's right-click menu** (no new toolbar button). Also **`/perform`** (`/perform here`,
`/perform off`, `/perform undo`) and Ctrl/⌘+K "Lab: ◉ Perform live".

- **The screen.** With a second screen, the scene goes full screen there in the Stage window, at the screen's own rate
  ("Max fps": 240 on a 240 Hz screen). Hearth stays on your screen with a small strip under the preview. With one
  screen, the Lab's preview goes full screen here and the strip sits on top. You can hide the strip with **H**. The
  strip's ⋯ › Screen picks: Automatic, This screen, or a named screen.
- **The strip** (one small row): tempo (click = tap), **Now / Beat / Bar** (when switches land), the cue chips
  (1 Intro, 2 Build…), the look chips (Q Calm, W Hype…), **next: <cue>** with its picture, ▶♪ play / pause,
  ❚❚ freeze, ■ black-out, **● Rec**, 🎛 MIDI learn, ⋯, ▾ hide, ✕ leave. A chip waiting for its beat blinks yellow.
- **Keys while performing**

  | Key | What |
  |---|---|
  | 1–9 | Jump to that cue (the section cues from ✦ Map to the song, or any cues), with its looks |
  | Q W E R Y U I O P | Play that saved look on the selected layer (T is skipped: it's Tap) |
  | 0 | Switches land: now → next beat → next bar |
  | Space | Freeze / unfreeze |
  | B | Black-out with a fade (the output too) / back |
  | T | Tap tempo (for live sound, when no song plays) |
  | Enter | Play / pause the song |
  | H | Hide / show the strip |
  | Esc | Leave |

- **Quantised.** While the song plays, a switch lands on the song's next beat or bar. Without a song, it lands on the
  tap tempo or MIDI clock. Without any tempo, it happens at once.
- **MIDI.** 🎛 on the strip lists every cue, look and action. Pick one, then hit a pad or press a key. It's the stage's
  own learn, so the mappings sit with the others and "Everything learned…" can forget them.
- **The next cue's picture.** It's taken when Perform starts and the song is paused: a quick look at each cue, then
  the playhead goes back. It's never taken during the show, so it costs no frame. ⋯ › Cue pictures again redoes it.
- **Safety.** A look switch *plays* the look, the way cue looks play, so your sliders are never changed. Freeze,
  black-out and the frame rate are put back when you leave. A cue jump moves the playhead (like Present's 1–9).
  **Nothing in the saved scene changes.**
- **● Rec (Record this performance).** Tick it, and your cue jumps and look switches are written to the timeline as
  cues at the times they happened when you stop (leave, or untick). A cue jump keeps its cue's name and looks; a look
  switch is a cue "◐ Hype" carrying that look. It's **one undo step**: the toast's Undo, Ctrl/⌘+Z in the Lab, or
  `/perform undo`.
- **The AI can prepare a set.** `three_do perform { setup: { cues: [names] | {"1": name}, looks: [names] | {q: name},
  layer, quant, note } }` checks the names against the scene and shows the set to the owner: a toast with Review, and
  **✦ Set** on the strip. Nothing is used until **Use this set**. ⋯ › Back to the default keys undoes it. With no args,
  it says what's on the keys. The help line is in `three_do help perform`. The `three_do` description gained one word
  (two were trimmed): 199 ≤ 200 tokens, the lean director stays 2159.

## Speed
A switch is a seek and a few slider messages to the page that is already running. Nothing reloads and nothing
compiles. Each switch's own work is timed (`ThreePerform.stats.switches`). The check measured 12 switches in 2.6 s
while the song played: the worst one took 0.5 ms of work. The preview's frame work rose from p95 0.2 ms to 0.5 ms
(+0.3 ms), with 0 shader compiles and the same 16.7 ms frame gap. One 240 Hz frame is 4.17 ms.

## Files
- `tools/three-perform-core.js` (new, pure, loads in Node): the key map (defaults or the scene's set), the AI's setup
  checked, the recorded switches → cues, the next cue, compact text.
- `tools/three-perform.js` + `tools/three-perform.css` (new): the mode, the strip, the keys, quantising, record with
  one undo, cue pictures, MIDI learn actions, the review dialog, `/perform`, Ctrl/⌘+K, the AI's op. Lazy group
  **perform** (`tier: 'use'`, after `lab`), in `lazy-data.js` (+ manifest, `node dev/lazy-manifest.js`), `lazy-meta.js`,
  the `lazy-at.js#…songmap,perform` tag in `index.html` and `docs/lazy-groups.md`.
- `tools/three.js` (marked): the ◉ Perform row in Present's menu; `onCue` leaves alone a layer whose look Perform
  holds; preview messages to `ThreePerform.preview`; `stageHooks.layers()`.
- `tools/three-stage.js` (marked): `act('perform:…')` loads the group and hands over (learned pads and keys).
- `tools/three-director.js` (marked): `three_perform` → `ThreePerform.op`.
- `tools/three-txn.js` (marked): `perform` counts as beyond the scene (no snapshot: it never changes it).
- `mcp/three-mcp.js` (marked): `perform` in `DO_CMDS`, its help line, the word in `three_do`'s Time line.
- `dev/checks/perform131.js` (new) and the `perform131` group in `dev/run-checks.js`.

Settings live in the app's store, not in the scene: `three.perform.sets` / `.pending` (per scene id), `.quant`,
`.screen`. Learned pads are in the stage's `three.stage.midi`.

## Tests
One app check, **`dev/checks/perform131.js`** (group `perform131`), with its own temp data and the fixture song
`/tmp/hearth-autoedit-song.wav` (128 BPM, made by run-checks):
1. ▣ Present › ◉ Perform enters: the strip with the cue and look chips, the frame rate at Max, the next cue's name and
   its picture.
2. With the song playing and Bar chosen, the Drop's number key arms (blinks) and lands on the next bar line (measured
   2 ms off the bar). The playhead is at the cue and its look (Hype) plays.
3. Q plays Calm on the beat, W plays Hype now, and a MIDI pad learned through the stage's learn plays Calm.
4. B fades to black and back; Space freezes and unfreezes.
5. No extra frame cost on a switch (load-aware): each switch's own work stays under one 240 Hz frame; the trace's CPU
   time judges any that aren't, like `dev/loadwait.js` does for Node. The preview's frame work while switching stays
   under steady + one frame, with no compiles.
6. Esc leaves: the saved scene (the sketch store and the song's cues) and the live sliders are exactly as before.
7. ● Rec: a cue jump and a look switch become two cues; ONE Ctrl/⌘+Z puts the cues back exactly.
8. `three_do perform { setup }` is shown for review, and the keys change only on "Use this set". The saved scene is
   still unchanged at the end.

Run: `perform131` ✓ (57 s), `beat108`, `songmap130`, `gameinput`, `unit:promptdiet-test`, `unit:director-mcp-test`,
`node dev/boot-test.js`:
- `perform131` ✓ (57 s);
- `songmap130` ✓, `gameinput` ✓;
- `beat108`: ✓ on its own rerun. The first run, together with others, failed on a 0.95 ms before/after timing difference in the frame gate's kick trigger at 60 Hz. That check never loads Perform;
- `unit:promptdiet-test` ✓ (lean 2159 ≤ 2170, full 9223 ≤ 9225), `unit:director-mcp-test` ✓ (`three_do` 199 ≤ 200);
- `node dev/boot-test.js` ✓ (2930 checks: first screen 62 scripts, 1578 KB of 1586 KB);
- `node dev/lazy-manifest.js`: names, actions, keys, apps and tools match the lazy build.

## For the patch notes
- **◉ Perform: play your visuals live.** Right-click **▣ Present** and choose **◉ Perform** (or type `/perform`).
  The scene fills your second screen at full speed, and a small strip stays on yours.
- **Number keys 1–9 jump to the song's parts** (the cues from ✦ Map to the song). They land on the next bar, or the
  next beat, or right away: press 0 to choose.
- **Q, W, E… switch your saved looks** on the selected layer, also on the beat.
- **Space** freezes the picture, **B** fades to black, **T** taps a tempo for live sound, **Esc** leaves.
- **Got a MIDI controller?** Click 🎛 on the strip, pick a cue or look, and hit a pad.
- The strip shows **what's next**, with a little picture of it.
- **Your scene is safe.** Nothing you do in Perform is saved, unless you tick **● Rec**. Then your switches go on the
  timeline as cues when you stop, and one Undo takes them back.
- **The AI can set it up for you.** Ask the director to "prepare a set for my show". You see the keys it picked and
  click **Use this set** if you like them.

## For Codex
No Codex-owned file was edited. `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `astra*`,
`codex-*`, `workbench-*` and `engine-watch.js` are unchanged. Astra's directors get `three_do perform` exactly as
Claude's do, through the same bridge.
