# The Three Director in fewer steps (round 49, directorfrugal)

Every tool step of a director reply is one model inference that re-reads the whole context: the fixed part (prompt +
tool lists, ≈ 2.1k tokens since promptdiet) plus everything the reply already holds. Earlier rounds made each step
lighter (tokensaver, diet, directorlean, toolslim, promptdiet). This stream cut the **number of steps**: a result now
carries what the next step used to fetch (the picture of the change, the error's fix and its lines, every layer's
colours, a help topic it already has as one line), so the director gets the same tasks right in fewer calls. The
fixed part did not grow (2,128 → 2,127 tokens a step) and every prompt stays byte-stable.

## Measured
`node dev/directorfrugal-measure.js` scripts six tasks the owner gives the director all day, as ONE chat (one
message each), on the fake Lab of directorlean (`dev/directorlean-lab.js`: tunnel, sparkles, glow, a 3:12 song, a
scene at "fit"). The **before** scripts run on the round 48 base (`40a5550`: its `tools/three-director.js` and its
`mcp/`), the **after** scripts on this tree. An after script drops a call only when a result it already got holds
what that call was for; `dev/directorfrugal-test.js` checks exactly that on the real results (e.g. the console result
has the error's fix and its lines, the edit result has "errors: none" and a picture, get_code lists every layer's
colours). Tokens = input over the task's steps: (fixed part + what the reply holds so far) per step, the calls'
arguments counted like their results (they stay in the session too); text ≈ chars / 4 as the MCP server formats it,
pictures ≈ w × h / 750; the fixed part measured on each tree with `dev/promptdiet-measure.js` (tokenaudit's
`promptParts` + `mcp/cost.js` wire lists).

| task | calls before → after | steps | tokens (input over its steps) | saved |
|---|---|---:|---:|---:|
| add a layer that moves with the beat | help · add_layer · screenshot → help · add_layer | 4 → 3 | 12,488 → 8,846 | 29 % |
| fix a scene with a console error | console · read_code · edit · console · screenshot → console · edit | 6 → 3 | 15,306 → 6,937 | 55 % |
| change colours to a palette | get_code · read ×3 · edit · screenshot → get_code · edit | 7 → 3 | 24,218 → 6,916 | 71 % |
| add a camera move | help camera · help lab · run · screenshot → help camera · batch [run, strip] | 5 → 3 | 19,352 → 6,894 | 64 % |
| make a 9:16 variant | set_frame · screenshot · edit · screenshot → set_frame · edit | 5 → 3 | 11,581 → 6,806 | 41 % |
| tweak a slider and render a still | sliders · screenshot · help · run → help · batch [sliders, run] | 5 → 3 | 12,065 → 7,196 | 40 % |
| **all six** | 26 → 12 calls | **32 → 18** | **95,010 → 43,595** | **54 %** |

The same six asks again later in the chat (help topics it has are one line now): 32 → 18 steps, **86,381 → 41,323
tokens (−52 %)**. The whole 12-message chat: **64 → 36 steps**; its input over all steps (fixed part + the chat's
whole history, before the cache discount) **697,967 → 203,682 (−71 %)**; its history ends at 15,814 → 6,017 tokens.
On a real engine each step saved is also a round trip of seconds.

## Upgrades
### Results that already hold the next step
1. **A change that shows brings its own small picture**: an edit, a new layer, a rewrite, layer settings (order,
   opacity…), a slider move and a new frame size answer with a 384 px picture (≈ 110 tokens) — the separate screenshot
   step (≈ 2.1k fixed + a 512 px picture) is gone. On by default; `shot: false` skips it, `shot: true` forces it.
2. **No picture when it would say nothing**: a result with errors gets none (a broken layer's picture misleads), and
   one whose picture didn't visibly change since the last one this reply got says "picture: no visible change" in two
   words instead.
3. **A screenshot right after** an edit's picture of the same view is a one-line "no visible change since your
   previous picture" (directorlean's rule now covers the automatic pictures too).
4. **Code changes say "errors: none"** when they run clean, so the director doesn't spend a console call to check.
5. **Late errors are still caught**: the error state is read again after the picture is made; an error that arrived
   meanwhile (a slow module load) replaces "errors: none" and the picture is dropped.
6. **A batch that looks for itself** (`three_do batch` with a screenshot, play-test or contact sheet) gets no extra
   automatic pictures from its edits.
### Errors with their fix
7. **The usual fix next to each kind of error** (13 kinds: a missing name or `THREE`, a property of undefined, an
   addon class that isn't in core three, a renamed function, a duplicate declaration, a reassigned const, a bad import,
   a syntax slip, endless recursion, a shader compile error, a lost context / out of memory), once per kind.
8. **The lines around the first error** (±2, the line marked `>`), so the fix needs no read_code call first.
9. **three_console** gives errors the same way as edits: one line each with its code, the same error every frame as
   one line (×n), plus the fix and the lines around it (it repeated each error line raw before).
### Fewer lookups
10. **Every layer's colours in get_code's outline** (`colors #ff3cac l14, #2b86c5 l15`): a palette change is one
    edit_code over every layer (finding the colour itself), with no read of each layer first.
11. **Help once per chat**: a guide topic this chat's engine session already got is one line ("help audio: same as
    before (you got it 6 messages ago; force: true sends it again)"), also under another name of the same topic
    (music / audio). Same memory rules as the code it read: per chat session, forgotten on a new chat, a compact /
    continue lighter, a handover to the other engine or an error. Without the hub, the server remembers its own run.
12. **The server's "already have it?" question is quiet**: `three_seen` isn't logged as a tool call, counted in usage
    or shown in the dock's activity strip.
13. **help camera names the camera moves** (`/camera-moves push in…`, the options, list / undo / clear): it answered
    the motion kit, so a camera move took a second lookup; the motion kit stays on `help motion`, the webcam on
    `help webcam`.
### Words and switches (the fixed part didn't grow)
14. **The guide's work loop** says changes that show come with a small picture, state and code come once, no extra
    checks, batch steps — in fewer characters than before (2,128 → 2,127 tokens a step).
15. **edit_code's words** name the picture and `shot: false` instead of `shot: true` (same length).
16. **⋯ AI setup › Habits › "In the Lab: looks at a picture after each edit"** and `/director-autoshot` are on by
    default with the new rule (only changes that show; off = only when it asks with `shot: true`). An owner who had
    switched it off keeps it off.
### Measuring and guarding
17. `node dev/directorfrugal-measure.js` (`--calls`, `--json`, `--before <ref>`): the tables above.
18. `node dev/directorfrugal-test.js` (unit): step and token budgets per task, every after call works, what each
    dropped call was for is in the after results, the fixed part didn't grow, error hints / context / colours, the
    picture rules (errors, unchanged, batch with a screenshot, shot: false, the switch off), help once per chat (next
    message, force, another chat, after an error, short topics, no hub), byte-identical results for the same calls.
19. `dev/checks/directorfrugal.js` (fake engines, real MCP calls): a new layer with no errors and its picture in one
    result; help camera, then one line in the next message (and not logged); a broken edit with its error and no
    picture, its fix and lines; three_do undo; a batch with its own screenshot gets one picture.
20. Run group: `sh dev/run-checks.sh directorfrugal`.

20 upgrades.

## Files
`tools/three-director.js` (autoShot, errHint / errorContext / clean, codeColors, seen; three_console through
withErrorLines), `mcp/three-mcp.js` (helpOnce: help through the hub's per-chat memory; edit_code words),
`mcp/three-guide.js` (work-loop line; help camera), `bridge.js` (three_seen answered quietly; ctx.batch.shot for batch
ops), `director-cmds.js` + `options.js` (auto picture on by default, new words). New: `dev/directorfrugal-measure.js`,
`dev/directorfrugal-test.js`, `dev/checks/directorfrugal.js`; `dev/run-checks.js` (unit list, lab group,
`directorfrugal` group).

## Tested
- `node --check` on every touched file.
- Unit: directorfrugal-test, directorlean-test, director-mcp-test, promptdiet-test, cache-test, tokens-test,
  tokenaudit-test, concise-test, toolslim-test, director-cost: pass.
- Smoke: `sh dev/run-checks.sh directorfrugal` **14/14 passed** on the first run (directorfrugal 8/8 steps,
  directorfrugal-test, directorlean, director-tools, labdirector, directorlean-test, director-mcp-test, promptdiet-test,
  tokenaudit-test, tokenaudit, cachewise, cache-test, lazy, boot-test).

## Not done (on purpose) / risks
- **The scripts are scripted**: no real model ran here. The after scripts are what the director *can* do with the new
  results (and the test proves those results hold what the dropped calls fetched); a real model may still take an
  extra look now and then. The guide's work-loop line asks it not to.
- **Automatic pictures cost ≈ 110 tokens each** when the director wouldn't have looked (a pure refactor edit). They
  only come when the picture visibly changed, and `/director-autoshot off` or `shot: false` stops them.
- **"errors: none" is what the Lab knew when it answered**: an error that only appears later (on the next kick, after
  a few seconds) is not seen; the error state is read again after the picture, which catches slow module loads.
- **help "same as before" relies on the engine keeping its history** (directorlean's note): `force: true` re-sends,
  and anything older than 8 messages is sent again.
- Colours in the outline: at most 6 per layer, `'#rrggbb'` / `"#rgb"` strings and `0xrrggbb` numbers (not
  `rgb()` / `hsl()` strings or named colours).
- The before / after numbers use the same fake Lab and the round 48 base director; the per-call shapes are the real
  code's.

## For the patch notes
- The Three Director gets the same things done in fewer steps: on six typical asks (a beat layer, a fix, a palette,
  a camera move, a 9:16 version, a tweak + still) it went from 32 steps to 18, and about half the tokens.
- Changes it makes that show on screen come back with a small picture, so it no longer takes a separate screenshot
  step to look. If nothing changed visibly, or the change broke something, no picture is sent.
- When something breaks, it sees the error together with the usual fix and the lines around it, so fixes are often
  one step.
- A colour change across the whole scene is one edit: it sees every layer's colours at a glance.
- It doesn't re-read the same how-to in a chat: a topic it already looked up is one short line.
- "help camera" now points it straight to your 🎥 camera moves.
- You can turn the automatic pictures off in ⋯ AI setup › Habits ("looks at a picture after each edit").
