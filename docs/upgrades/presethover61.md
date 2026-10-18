# presethover61: ✦ Preset hover (round 61)

Owner: "have the prompting chat to write a preset be seamlessly integrated as a hover window."

## What shipped
1. **✦ Preset window over the Sound desk.** Creative Playground › Serum 2 & Vital: a small floating chat sits over the
   desk. Type "dark reese bass with slow movement", press Enter: the AI writes the patch and the open Serum 2 / Vital
   plays it right away (the same live `patch` action the desk's sliders use).
2. **Follow-ups.** After the first answer the box asks for a tweak: "brighter", "less reverb", "slower LFO". Each one
   changes the current sound, with the earlier requests named in one line.
3. **↶ / ↷ for every AI step.** Undo and redo walk through each change exactly (the values it replaced are kept).
4. **Save as a named preset.** Save asks for a name (the AI's suggestion filled in) and keeps the plugin's own state in
   the desk's preset bank (Keep a patch › Recall), with the bank's usual limits (12 presets, 9 MB).
5. **Claude or Astra.** The button in the window's title switches who writes (remembered).
6. **Drag, fold, remembered.** Drag it by its title; "–" folds it to a ✦ Preset pill (drag the pill too); where it
   sits and whether it's folded are remembered.
7. **Never on the instrument's controls.** It moves off the keyboard, the live transport and the instrument picker by
   itself (after a drop, a resize, the desk redrawing); with no free spot it folds to the pill.
8. **Every change is checked.** The patch is checked against the plugin's real parameter list: unknown controls are
   skipped, values a little out of range are kept in range, values far off a control's scale (Hz for a 0–1 control)
   or not one of its choices are skipped; the reply line says what was skipped and how many tokens it cost.
9. **Token-frugal.** Only the controls the words need are sent (grouped by section: osc, filter, env, lfo, effects…;
   48 at most; the mod matrix and MIDI CC lanes never), one short line each (`key=now [min..max]`), never the plugin
   state. A lean, toolless turn (no files, no hub tools, no memory, no web), one fixed persona line.
10. **Chat:** `/preset <description>` (from any chat; in the Lab, `/preset techno` stays the Lab's trigger presets),
    `/preset astra: <description>` or `/preset claude: …`, `/preset tweak <words>`, `/preset undo|redo`,
    `/preset save [name]`, `/preset show|hide`, `/preset engine astra|claude`; `/vst-preset` (alias `/sound-preset`)
    always means this. Ctrl/⌘+K: "Sound desk: write a preset with AI".

## Token cost per request
Measured from the prompt builder on a Vital-sized list (327 controls): the reese request sends 48 controls, ≈ 600
tokens of message + a 35-token persona; the reply is one JSON object (≈ 100–300 tokens for up to 40 changes). With
the CLI's own lean baseline (≈ 760 input tokens for a plain Claude turn, mostly cached) a request is roughly 1.4–1.7k
input + ≤ 300 output. A follow-up is the same size (the earlier requests are one line; no chat history is resent).
The fake engine counted 1,029 input tokens for the first request in the check.

## How it works (for Codex)
- `tools/preset-hover-core.js` (pure, Node-testable): `pick(parameters, request, { touched })` (sections from the
  words, capped), `prompt()`, `parse()` (first JSON object, fences / prose tolerated), `validate()` (real list,
  rejected / clamped lists, unchanged dropped, ≤ 40), `history()` (undo / redo steps).
- `tools/preset-hover.js`: the window, the helper turn (the quest-review pattern: `hub.send` with
  `{ questReview: true, lean: true, helper: true, persona }`, so engines.js gives it no tools / files / memory / web),
  the host adapter `host()` and the commands. Usage goes to `hearth:usage` with `source: 'preset-hover'`.
- `tools/preset-hover-cmd.js` (eager, ~1 KB): registers `/preset` at start, because a lazy stand-in's `when` says no
  until its group loads and the name is shared with the Lab's trigger presets.
- Host adapter: `{ current() → { name, parameters }, apply(values), snapshot() → state, keep(label, state) }`. It uses
  `WorkbenchVST.live` first when that exists with `current` / `apply` (the live parameter API vstlive61 is building),
  otherwise `WorkbenchVST.door`. vstlive61's branch had not landed when this was finished (claude/intelligent-galileo-yaiqem
  was still at round 60), so the door is what runs today.

## For Codex: touches of your files
- `tools/workbench-vst.js` (additive): `PresetHover.attach(out, door)` at the top of `mount`, `PresetHover.detach()` at
  the end of `pause`; two closure hooks (`refreshControls` so an AI change shows on the desk's sliders, `redraw` so a
  kept preset shows in "Keep a patch"); and an exported `door` = { current, apply (WorkbenchCore.patch + flushPatch,
  the same path as `chat_sound apply`), snapshot, keep (same bank limits as "Save bank preset") }.
- `lazy-data.js`: the creative group also loads `tools/preset-hover-core.js`, `tools/preset-hover.js` and
  `tools/preset-hover.css`; META regenerated with `node dev/lazy-manifest.js`.
- `dev/fake-common.js`: `presetPlan()` answers "PATCH FOR …" prompts with a JSON patch (one unknown key and one value
  past its max on purpose).
- `index.html`: one script tag (`tools/preset-hover-cmd.js`). `dev/run-checks.js`: `presethover61-test` in UNIT.

## Tests
- `node dev/presethover61-test.js` (unit:presethover61-test): 32 checks (picking, prompt size, parsing, validation incl.
  normalized 0–1, undo / redo).
- `dev/checks/presethover61.js` (fake Vital in the page + fake engines): `/preset` before the group loads, window over
  the desk, steps off the keys, drag + remembered + drop on the keys, fold / unfold, a description → validated patch
  applied, follow-up, undo / redo, save with a name, `/preset` on Claude and Astra, tweak / undo / save by command,
  window leaves with the desk.

## Risks
- Real Serum 2 / Vital parameter names weren't available here (no runtime): section words are generic; a plugin whose
  keys use other words falls back to matching the request's words and the first oscillator / filter / envelope.
- The helper reuses engines.js' `questReview` flag as "toolless run" rather than adding a new flag (no engines.js edit).

## For the patch notes
- **✦ Write a synth preset by describing it.** In the Sound desk (Serum 2 & Vital), a small ✦ Preset window floats over
  the instrument: type "dark reese bass with slow movement" and Claude or Astra sets the sound live. Then ask for
  "brighter" or "less reverb", step back and forth with ↶ ↷, and Save it as a named preset. Drag it anywhere or fold
  it to a pill; it never covers the keys. From any chat: `/preset <description>`.
- It's cheap: only the few dozen controls your words need are sent, never the whole plugin.
