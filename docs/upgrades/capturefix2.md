# capturefix2 (round 44): silent check failures found and fixed at the root

Round 43 made `dev/run-checks.js` fail a check whose result has a non-empty top-level `"errors"` list. Two capture
checks turned out to have been failing on `main` without anyone seeing it. This stream:
1. ran those 13 checks and fixed what they found;
2. made the runner read every result shape the checks use;
3. ran the whole suite (361 checks) to find other silent failures, and fixed the real ones.

The machine was very busy most of the day: load average 20–40 on 4 CPUs with the other streams running checks, and
the page managed about 4 frames a second in its first second. A check that failed was run again alone before it
was called a bug. A **load flake** below means it failed under load and passed when run again, or failed each time
at a different step on a timing or frame-rate budget. Each one lists its evidence.

## The 13 "errors"-style checks
- **capture-record**: the 9:16 take came out 528×940 (fix 1). Passes in full (alone and in the final pass). Under
  heavy load it missed timing steps that change from run to run: "a steady 30 fps" (29–37 of 40 frames), "one frame
  on" and "player steps to frame 20".
- **capture-extras**: the click zoom (fix 2). Passes alone and in the full pass.
- **qa-sweep**: /still threw (fix 7a, from the coordinator's run). It passed in 310–423 s. It timed out once at 600 s
  under load average 30.
- **trim-drive**: timed out twice under load. It passes in 439 s at lower load. Its coverage file used to land in a
  file named `--script` at the repository root (fix 3).
- capture-frames, capture-lab, capture-more, capture-pack, capture-shots, chat-cmds, cmdbar, qa-keys, qa-stream:
  real failures none. Under load: capture-lab ("the moving Lab sends frames": 3 frames in 2.1 s, while the encoder got
  6 of 63), capture-frames (rVFC 38 vs 120), capture-pack (largest gap 0.303 s against a 0.3 s limit) and qa-keys
  (a different dead key each run: "|", Shift+Esc, Ctrl+Shift+S). Each passed when run again.

## 1. A 9:16 take came out 528×940 (capture-record)
**Symptom:** recording a tool in 9:16 with MP4 off saved a 528×940 WebM. The check wants an exact 1080×1920 MP4
("even with MP4 off: the size needs it").

**Cause:** the recorder never upscales the window's pixels. It records the target in the final shape at the size the
window has, and the MP4 step scales that to the social size (`r.final`). Round 9's "sharper recordings" change
replaced `mp4: Boolean(r.opts.mp4 || r.final)` with `mp4: r.opts.mp4 !== false` when finishing a take. Since then a
take with MP4 off skipped the MP4 step and kept the window's size. Mac and Windows takes (already MP4) were only scaled
when MP4 was asked for, so they had the same problem.

**Fix** (capture.js `stop()`): a take that needs a size (a social frame, 1080p / 720p) gets its MP4 even with MP4
off, and the WebM you asked for is kept beside it. A take that needs no scaling is unchanged. After: 1080×1920, 1.4 s,
42 frames.

## 2. A click while recording didn't zoom in (capture-extras)
**Symptom:** "a click zoomed the view in (1.6×)": the page's transform was still empty 0.9 s after the click.

**Cause:** the zoom did start (the view state said 1.6×). `CaptureTour.setView` wrote the end transform on the page
only once the move had finished. While recording, the move is a main-thread animation, and on a busy machine it
started a few hundred ms late (probe: 483 ms into a 650 ms move, 0.9 s after the click). Until then the page said "not
zoomed". A move cut short also left the old view in the page's style under it.

**Fix** (capture-tour.js `setView`): the end state goes on the page at once and the move plays over it. Nothing changes
on screen, because an animation shows its first frame while it waits to start.

## 3. The runner and the harness
**Symptom:** most result shapes passed whatever they said: `"fail": [...]`, `"problems": [...]`, `"bad": [...]`,
`"dups"`, `"missing"`, `missingCommands`, `badTypes`, `"ok": false` at the end of a one-line JSON result, and text
results with JSON inside (declutter, fastboot).

**Cause:** the runner only matched `"ok": false` / `"pass": false` at the start of a line, a top-level `"errors"` list
(by its indentation), ✖ steps and FAIL lines.

**Fix** (dev/run-checks.js `verdictOf`): each value smoke.js prints after its `▶` line is read as JSON, or as the `{…}`
inside a text result, and judged by its top-level fields:
- An explicit `ok` / `pass` boolean is the check's own verdict. Report modes keep their lists and say true.
- Otherwise the check fails on any of these: a non-empty `errors`, `problems`, `fail(s)`, `failures`, `failed`, `bad`
  or `dups` list; a non-empty `missing…` or `bad…` list or map; a `bad` / `failed` count over 0.

The reason column names the first failing field, and a FAIL line from a check is shown too. Shapes that were caught
before still are. The scan of `dev/checks` found these shapes: `errors` (13 checks), `problems` (22), `ok` + `bad`
(7), `fail` (polish8, qa-mac, board*), `dups` (qa-commands), `badTypes` / `missingCommands` (nodes-shader), and
one-line JSON (labadapt, nativefeel).

Also:
- `--coverage <file>` keeps its file. It used to be dropped, and smoke.js wrote trim-drive's 485 KB coverage into a
  file named `--script` at the repository root.
- `--names <group…>` lists the checks. `--exact` runs names as checks, never as groups: `a11y`, `lazy`, `board` and
  others are both a check and a group, and a part of `all` ran whole groups again.
- smoke.js waits up to 30 s before a check runs, until the page is up and every lazy group that loads by itself (every
  tier but `use`) is in. On a loaded machine, `Capture` was still a stand-in after `--wait` and capture-record died at
  its first line. chatcalm once ran into a page still loading ("H is not defined"). The coordinator's labsearch
  "reading 'cmd'" was the same race. `--no-lazy-wait` keeps the old timing, and held groups (`lazy.hold`) aren't waited for.

## 4. Lab helpers couldn't read layers or sliders (assets, lab3d-models)
**Symptom:** assets: "three_do asset use: a shader file → a ◇ layer ({"ok":false,"error":"v?.layers?.find is not a
function"})" and "an HDR card dropped → the sky lighting the model". lab3d-models: "/model material chrome" said nothing.

**Cause:** round 37 (directorlean) made `three_layers` and `three_sliders` answer with lean text for the AI. Hearth's
own helpers call the same tools through `HubBridge.call` and expected rows: ◇ shader, ✦ particles, 🅰 type, physics,
🧊 models and the asset library. Since then their layer lookups threw or found nothing. /model material, light and the
other model commands lost their answer. The asset library saved slider presets with no values.

**Fix:** `report: 'full'` (the flag `three_add_layer` / `three_set_code` already have) makes both tools return the raw
rows. The helpers ask for it (13 calls), and the AI still gets the lean text. On merge, round 45's kinetictype had
fixed three-type its own way (`layerRows`, reading the Lab on screen). That code is kept, and its call for a chat's
scene off screen now asks for `report: 'full'` too.

## 5. /ref from the mood board was gone (board-chat, silent: `"fail"`, `missing`)
**Cause:** round 24's chat-refs registered `/ref <kind> <name>` (the @ references) and took the name whole. The mood
board's `/ref <words> [| focus]` was then skipped at load ("Board: command names already taken").

**Fix:** the two share the name the way commands already can (`when`). `/ref` alone or with a kind first (chat, scene,
board, file, render, project) is the @ reference. Any other words attach the vibe of matching board references. The
lazy manifest was regenerated.

## 6. Board (board, board-links, silent: `"fail"`)
- **A wheel zoom went the wrong way first** (0.66 → 0.64): a frame's timestamp can be earlier than the moment a smooth
  zoom began, so the first step had negative progress. It's clamped at 0 now (board.js `animateTo`).
- **Alt+wheel opacity did nothing on the first open of the board**: its listener was attached on a view change or at
  load, but the board mounts after both. board.js now announces `hearth:board-mounted` and board-links listens for it.
- **Asked-for clip plays were dropped while the view settled** ("play clips in view", "loop this shot (0,2)"):
  `startPreview` refused while the view was "moving" (140 ms + two frames after any move). So ▶ Play, /board-play, a
  tour stop or Ask about a clip right after a zoom said "Played 1" with nothing playing. Hovers check that themselves.

## 7. Smaller real bugs found on the way
- **/still threw** "Cannot read properties of null (reading 'postMessage')" (qa-sweep): a library file loaded for the
  preview arrived after its frame was taken off the page. Now it goes nowhere (tools/three.js `deliver`).
- **Lab search's layer flash went out at once** (labsearch, 2 of 3 runs): the layers list is rebuilt whole when the
  preview answers. A rebuilt row now takes over the flash where it was (tools/three-search.js).
- **Removing the last connection didn't stick** (connections): the round-43 save guard keeps any top-level part of
  config.json a save leaves out, and `Connections.remove` deleted `connections` when it was empty. It keeps an empty
  list now, and clears both agent objects (the live one can be another object after a reload).
- **Delete sat below Customise this…** (polish8, silent: `"fail"`, 12 items): `menuTidy` moved danger rows to the very
  end, past declutter's closing "Customise this…". Delete now goes right above it (board items, the Boards chip,
  capture cards).
- **Focus went back to a box you had clicked away from** (journey-lab "look applied"): closing the X effects picker put
  the focus in the director's chat box, because a11y.js remembered it as "the last focus outside". The next X typed
  "x" in the chat instead of opening the picker. Focus that moves to nothing (a click on the preview, empty space) now
  forgets the box (a11y.js).
- **The Mac keys sheet said "Ctrl/⌘+Z"** (qa-mac): a line's text written for both computers ("Ctrl/⌘+Z" in the chats
  panel's drag line, "Ctrl/⌘+G" in round 44's layer groups) now reads ⌘Z on a Mac (keys-ui.js `whatText`).
- **A removed frame of cut footage reached the sketch** (labframes: "the sketch never sees a removed frame (f24–47)",
  f24 in 3 runs of 3): the jump over a removed part is timed for just before its first frame, and when the timer
  came late the decoder had already shown f24. The frame callback now holds a removed frame back. The sketch, the
  texture and the frame number keep the last kept frame, and the jump happens then (tools/three-sandbox.html).
- **A board fly / zoom ended late on slow frames** (board-links "fly to a saved view", 4 of 5 runs once clips really
  played): the last step waited for the next paint. A timer now ends the move on time (board.js `animateTo`).

## 8. Checks that had gone stale (the app changed on purpose; each still checks the same thing)
- **unit:whatsnew-test**: hard-coded the newest patch-notes round (41). Its digest numbers now read rounds 33–41, the
  notes they were written against. A new test checks that the newest round from `index.txt` is in the digest.
- **eyes-look**: a clip points to `board_do watch` (round 41 toolslim merged board_watch into board_do).
- **jankwatch** (silent: `bad`): round 21's devreport adds "⚑ Report to the developer" after Copy for Claude and Last week.
- **live** (silent: `problems`): fit → 9:16 switches its pixel ratio in place since round 37 (labboot retune, 0
  reloads). There is no reload to cover, so the old-picture cover is only asked of real reloads.
- **nodes-shader** (silent: `missingCommands`): /video-nodes and /video-flow… went with Video Review in round 17.
- **quickstart**: "✦ What can I do here?" sits one level down since round 43's menus (Lab ⋯ › View & help, the
  board's ⋯ › More…). The check opens them like a person would.

## Full suite
**How it ran:** 361 checks (`all`, split with `--names` into parts under the 2-hour limit). The first parts used
group names, which re-ran whole groups (427 runs in all). `--exact` was added for the rest. About 7 hours on a machine
at load 5–40.

**First pass:** 42 checks failed at least once. Of those:
- **Real bugs, fixed:** run-checks shapes (§3), 9:16 size (§1), click zoom (§2), Lab helpers (§4: assets, lab3d-models),
  /ref (§5: board-chat), board zoom / Alt+wheel / plays / fly (§6: board, board-links), /still, Lab search flash,
  connections, menu order (polish8), focus return (journey-lab), Mac keys text (qa-mac), cut footage (labframes).
- **Stale checks, updated (§8):** unit:whatsnew-test, eyes-look, jankwatch, live, nodes-shader, quickstart.
- **Silent before this round** (now caught): board, board-chat, board-links, polish8 (`fail`), jankwatch (`bad`),
  live (`problems`), nodes-shader (`missingCommands`), labadapt and nativefeel (one-line `"ok":false`), and the 13
  `errors` checks.
- **Load flakes** (each passed when run again, or failed at a different timing step each run): a11y (a WebGL
  "VALIDATE_STATUS false" with an empty log), appsearch / labsearch / inputlatency (per-keystroke and frame budgets: p95
  58.8 ms at load 30), qa-keys, access-chat (a 5 s permission card expired while a screenshot was taken), apps-meshy,
  dragdrop (a frame shot took 11.6 s), bgperf, bigscreen, capture-frames, capture-lab, capture-pack, capture-record's
  timing steps, chatcalm (menus at 4 frames a second), comp (a different step each run), gallery (240 s timeout: each
  starting point took 4–15 s in software WebGL), glrecover, labadapt / renderfast (speed comparisons: the fast render
  path was 22–30 % slower only while the CPUs were saturated, and passed at load 3), labpace, lab3d-models (an eval
  that answered null, at a different step each run), motion-in, motion-render (895 s of 900), nativefeel (adaptive
  quality cut the preview's scale to 0.85), particles, physics, type, seqguard-swap, journey-lab's tap tempo (115 vs 120
  BPM).

**Final pass after merging the branch tip (d8db75b):** the 13 `errors` checks, every check fixed or updated here,
and every check that failed in the first pass (53 runs): 47 passed. The 6 that didn't, rerun alone:
- passed: capture-pack, particles, renderfast, qa-mac (after the keys-ui fix for round 44's layer-groups line);
- fixed after this pass: labframes (passes), board-links (3 passes in a row).

**Out of scope, for the owners of these checks:** the speed budgets (renderfast, labadapt, inputlatency, appsearch,
labsearch) and the long drives (gallery 240 s, motion-render 900 s, qa-sweep 600 s) are tight on a shared 4-CPU machine.
They pass at normal load. The round-43 config save guard (datasafe-core `guardConfig`) brings back **any** top-level
key a save leaves out. Connections now keeps an empty list. Anything else that deletes a top-level config key will
see it come back.

## For the patch notes
- Screen recordings in a social size (9:16, 4:5, 1:1…) come out at the exact size (1080×1920 for 9:16) even with MP4
  turned off. Before, they kept the window's own size (about 528×940). The WebM you asked for stays beside the MP4.
- Zoom on clicks while recording takes hold at once.
- The mood board's `/ref` (attach the vibe of matching references) works again next to the chat's @ references.
- On the board: a mouse-wheel zoom no longer jerks the wrong way first, and Alt+wheel opacity works the first time.
  ▶ Play on clips right after a zoom really plays them, and flying to a saved view ends on time.
- Shader, particle, type, physics and model layers are found again right after they're added. /model material, light
  and the other model commands answer again, an HDR dropped on a model lights it, and slider presets saved to the
  asset library keep their values.
- Cut footage in the Lab never shows a removed frame while it plays, even on a busy computer.
- Removing your last AI connection sticks (it used to come back). In menus, Delete sits right above "Customise this…"
  again.
- Closing the X effects picker no longer drops your cursor into the director's chat box, so pressing X again opens the
  picker.
- Small fixes: Lab search's layer highlight stays lit for its full flash. /still no longer shows "Something went wrong"
  when the Lab preview was closed meanwhile. The Mac keys sheet says ⌘Z and ⌘G.
- Behind the scenes: the test runner now catches every way a check reports a failure, so silent failures can't hide again.
