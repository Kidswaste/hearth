# Round 138 · sectionmood138: give each section its mood, and undo a reply right away

Two parts:
- **A.** One click gives every section of the song its mood: the 🎛 mood dials and a saved look per section, shown as
  ghosts first.
- **B.** Ctrl/⌘+Z pressed the moment an AI reply ends now undoes that reply exactly. It never undoes the step before it.

## What existed (and what this round does with it)

| Piece | What it does | Used here? |
| --- | --- | --- |
| **✦ Map to the song** (songmap130, `tools/three-songmap*.js`) | Cues per section on the downbeats ("Drop 2" for the second drop), a saved look on each cue (Hype on drops, Calm on quiet parts), drop jumps, kick / snare links. Shown as ghosts, kept item by item, one undo. | **Reused:** its sections (`SongMapCore.sectionsOf`), its section naming, its way of drawing ghosts (a timeline `addHooks` draw), its panel under the song's row, and its "a look rides on the cue". The mood is new: the map moves one slider on the drops, while a mood sets every dial per section. |
| **🎛 Mood dials** (mooddial135, `tools/three-dials*.js`) | Up to 4 scene-wide knobs (Energy, Darkness, Chaos, Warmth). A dial's keys are baked onto the mapped sliders' own keys, so renders, the sequence and backstage play them. "Suggest (free)" makes them from the slider names. | **Reused whole:** a section's mood is a key on each dial at the section's downbeat. The keys are baked with `DialsCore.bake` / `unbake`, the same as a keyed dial. With no dials yet, the panel offers `DialsCore.suggestLocal` first. `three-dials.js` is not edited (favs138's area). |
| **Saved looks** (`looksApi`, `three_looks`) | Named slider sets of one layer. Cues can play them. | **Reused:** a look that fits the mood goes on the section's cue (`editCues`, `undo: false`). |
| **The brief's tempo plan** (aiprep128, `ProjectBrief.get(id).tempo`) | `[{ section, plan }]`, for example "drop: punchy, glow surges". | **Read** the same way the song map reads it (`Projects.ofItem('scene', id)` → `ProjectBrief.get`). Mood words in a section's plan decide its mood. |
| **Per-section lyrics styles** (lyrics133) | Hold keyframes on the lyrics layer's own sliders, calm where it's quiet and punchy on drops. | Left alone. It works on the lyrics layer, and this works on the dials. Both use the same idea of "calm on quiet parts, punchy on drops". |
| **◉ Perform** (perform131) | 1–9 jump to the cues (with their looks), Q W E… play looks, ↑ / ↓ turn the selected dial. | **Follows the result** with no change: the moods' cues are its 1–9, their looks play, and the dial keys play at the playhead. |
| **LabTxn** (`tools/three-txn.js`) | One AI reply is one undo step: the dock's ↶, Alt+Shift+Z, `/undo-edit`. Its finish hook (replydiff137) keeps each reply's before / after for the review. | **Extended** for part B (below). |
| **The Lab's Ctrl/⌘+Z** (`LabDirect` in `tools/three-direct.js`, the timeline's own undo) | Undoes the Lab's own steps (✥ moves, looks, dials, song map keeps…). | **Extended** for part B: it now also knows about AI replies. |

## What's new, and where the owner clicks (A)

**Sections ▾** in the Lab timeline has a new row, **🎭 Give each section its mood…**, right under ✦ Map. It shows once a
song is loaded and analysed. No toolbar row was added.

A click proposes a mood for every section. It's worked out on this computer, with no AI and nothing to pay:
- **The mood:**
  - When the project's brief has a tempo plan that names the section, its words decide. "build: dark, low rumble" makes
    the build dark. Synonyms work: chorus or hook is a drop, a verse or bridge is a break, pre-chorus is a build.
  - Otherwise: intro and break are calm, build is rising, drop is punchy, outro is fading.
  - Moods are calm, rising, punchy, dark, fading, bright and dreamy.
- **The dials, per section:** a key on each dial at the section's downbeat.
  - Calm: Energy 20 %, Darkness 45 %.
  - Punchy: Energy 100 %, Chaos 75 %.
  - Dark: Darkness 90 %.
  - Rising moves over the section (Energy 30 → 85 % by its end), and so does fading (Energy 40 → 5 %).
  - A dial is matched by its name: Energy / Intensity, Darkness / Night, Chaos / Glitch, Warmth / Heat. A "Brightness"
    or "Calm" dial is turned the other way.
- **A saved look:** one whose name fits the section or its mood (Hype on a drop, Calm on a quiet part) goes on the
  section's cue. If there's no cue, a cue named after the section is made.
- **No dials yet:** the panel says so and offers **🎛 Suggest dials first (free)**. That adds Energy, Darkness, Chaos and
  Warmth from the slider names (one undo step), and the moods then use them.

The proposal shows as **ghosts**:
- on the timeline, per section: a dashed line at its start with "🎭 punchy", each dial's planned level as a dashed line
  with dashed diamonds at its keys, and "◐ Hype" for the look;
- in a small panel under the song's row, grouped by section. Each section has a **mood menu** (change it and that
  section is proposed again) and "from the brief" when the brief decided it.

**Nothing changes until you keep it.**
- **Keep all**, **Keep this section**, or **✕** on one item (its ghost goes).
- **Each keep is ONE undo step.** It works from the toast's Undo, the panel's ↶ or Ctrl/⌘+Z in the Lab, and puts the
  dials' keys, the sliders' keys and the cues back exactly.
- **✦ Ask the AI to refine:** one small helper pass on the cheapest model, the same path as ✦ Suggest dials. It gets the
  section names, their moods, the dial names and the looks, in words only. **The cost shows first** ("About 1.1k tokens
  in and 350 out · Claude"), and nothing is sent before OK. Its moods come back as ghosts, titled "(refined by the AI)".
- **Close** drops the proposal. Nothing is kept.

**Renders and Perform follow.** The dial keys are baked onto the sliders' own keys (tagged with the dial). So the
preview, renders, the Lab sequence and backstage scenes play them, and so does ◉ Perform at any playhead. Perform's 1–9
jump to the section cues and play their looks.

## The undo fix (B)

replydiff137 found that a reply's undo step could take about 0.2–3 s to be recorded while the scene settled. A
Ctrl/⌘+Z in that window undid the step before it. There were two holes:
1. The Lab's **Ctrl/⌘+Z** never knew about AI replies. It always took the Lab's own newest step (a ✥ move, a dial
   turn, a song map keep…), even when an AI reply had come after it.
2. Steps "recorded once the scene has settled" (the review's ↶ Undo this layer / Undo all / Keep some: up to 3 s of
   re-reads) didn't exist in that window, so an undo found the step before them.

What `tools/three-txn.js` does now:
- **Recorded at once, completed when it settles.**
  - When a reply ends (the finish hook), its step is already there. LabTxn now re-reads the scene until two reads agree
    (≤ 3 s), and the step's "after" becomes the settled scene, in the review's record too.
  - `LabTxn.reserve()` puts a step in at once and completes it later. The review's `stepTo` uses it, instead of waiting
    and then recording.
- **An undo waits for it.** `undoTurn` / `redoTurn` first wait for a step that is still settling. After 150 ms a toast
  says "Settling… the undo follows in a moment". The step before is never taken instead.
- **Ctrl/⌘+Z in the Lab takes the newest change, whatever kind it is.**
  - Each LabTxn step remembers what was on top of the Lab's own undo stacks (LabDirect's last step, and the timeline's
    undo top and depth: a new `player.undoMark()`).
  - When Ctrl/⌘+Z is pressed in the Lab and no Lab step came after the newest reply (or LabTxn step) on this scene, that
    reply is undone, exactly (`LabTxn.labKey`, called first in LabDirect's key handler).
  - If the scene changed after the reply in a way neither stack knows about (a slider moved, say), nothing is undone.
    A toast points to the dock's ↶ (or `/undo-edit force`), and the next Ctrl/⌘+Z goes back to the Lab's own steps.
  - ↷ in the dock redoes it, as with the dock's ↶.

## Files
- `tools/three-sectionmood-core.js` (new, pure, loads in Node): moods from words, the defaults, the tempo plan's
  section matching, dial kinds from names, keys per section, looks per mood, the plan, key merging, the words, the AI
  prompt / parse / cost.
- `tools/three-sectionmood.js` + `tools/three-sectionmood.css` (new): the ghosts, the panel, keep / ✕ / one undo, the
  dial baking (via `DialsCore`), "Suggest dials first", the AI refine.
- `lazy-data.js`: the new lazy group **sectionmood** (`tier: 'use'`, after `lab`, `songmap`, `dials`). There are no
  commands, so the manifest (`node dev/lazy-manifest.js`) only gains an empty `"sectionmood":{}`. `index.html` (its lazy-at place) and `docs/lazy-groups.md` have its
  line.
- `tools/three-media.js` (marked): the Sections ▾ row, and `player.undoMark()`.
- `tools/three-txn.js` (marked): `reserve`, `settling`, `settled`, `labKey`, the settle after a reply ends, undo /
  redo waiting, and the Lab-stack marks on each step.
- `tools/three-direct.js` (marked): Ctrl/⌘+Z asks `LabTxn.labKey` first.
- `tools/three-replydiff.js` (marked): `stepTo` records its step at once (`LabTxn.reserve`).
- `dev/checks/sectionmood138.js` (new) and the `sectionmood138` group in `dev/run-checks.js`.

No MCP tool, prompt or first-screen change. The AIs see nothing new.

## Tests
One app check, **`dev/checks/sectionmood138.js`** (group `sectionmood138`, `--fake-engines`). It runs on its own temp
data, a two-layer scene it makes itself (Main: Speed, Glow, Noise, with saved looks Calm and Hype; Back: Contrast,
Brightness) and the fixture song. That song's analysis is Build, Drop, Build 2, Drop 2, Outro.
- **A1.** Sections ▾ › 🎭 gives the default moods (build rising, drop punchy, outro fading) and looks per section (Hype
  on the drops, Calm on the outro). With no dials it offers to suggest them. After that, each section has dial keys:
  Energy 30 → 85 % in the build, 100 % in the drop, 40 → 5 % in the outro.
- **A2.** The ghosts change nothing: cues, keys, dials and slider values read back the same. ✕ on one item removes only
  its ghost.
- **A3.** Keep all puts the dial keys (baked onto Glow, tagged) and the cues with their looks in the scene, as ONE Lab
  step. One Ctrl/⌘+Z puts the scene back exactly.
- **A4.** Kept again, render frames from the hidden export page: in the drop the red channel is 188, early in the build
  it is 74 (the planned 188 / 75).
- **A5.** A tempo plan ("build: dark…", "chorus: bright…") makes the builds dark and the drops bright "from the brief",
  and leaves the outro on its default. ✦ Ask the AI to refine shows the cost first, and Cancel sends nothing.
- **B.** Through the fake engine (real MCP route): first a Lab step (the outro made punchy, kept). Then a reply adds a
  layer, and Ctrl/⌘+Z is pressed from the reply's own finish hook, while its step is still settling.
  - That reply is undone: the scene is exactly as before it.
  - The punchy outro is still kept, and the Lab's steps are untouched.
  - A second Ctrl/⌘+Z then takes the outro back to fading.

Run (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`):
- `sectionmood138` ✓;
- `replydiff137` ✓, `songmap130` ✓, `mooddial135` ✓, `labchat92` ✓, `draft129` ✓;
- `node dev/boot-test.js` ✓ (first screen 62 scripts, 1585 KB of 1586, unchanged; 3115 checks);
- `node dev/lazy-manifest.js --check` ✓, `dev/selfmap118-test.js` ✓.
- `dev/slim116-test.js` reports one problem, in `dev/checks/tour137.js`, which isn't part of this change.

## Risks / not done
- **Cue looks don't render.** Renders play the dial keys, but not cue looks: the export page has never played cue looks.
  Only the preview and Perform play them. The dials carry most of a mood.
- **Dials on the same slider.** A slider on two keyed dials plays the first dial's keys (mooddial135's rule), so a
  Darkness that also maps Glow leaves Glow to Energy. The keep's toast names sliders left alone because they have your
  own keys.
- **A change inside the settle window.** A change you make in the ≤ 3 s after a reply ends, while it settles, becomes
  part of that reply's step.
- **No `/section-mood` command, Ctrl/⌘+K line or Lab features entry.** Each would add to the first-screen manifest, which
  has under 1 KB of room. The way in is the Sections ▾ row.

## For the patch notes
- **Give each part of the song its mood in one click.** With a song loaded in the Lab, open **Sections ▾** under the
  timeline and choose **🎭 Give each section its mood**. Hearth proposes, for every part of the song:
  - where your 🎛 mood dials sit: a calm intro, a build that rises, a punchy drop, an outro that fades;
  - a saved look that fits, like your "Hype" look on the drops.
- **Your project's plan decides first.** If your project brief says "verse: calm, drop: punchy, break: dark", those are
  the moods it uses.
- **You see it first.** It shows as faint dashed ghosts on the timeline, part by part. Keep all, keep one part, or ✕ the
  bits you don't want. Change a part's mood from its little menu. One Undo (Ctrl/⌘+Z) takes a keep back.
- **No dials yet?** It offers to make them for you from your slider names.
- **No AI needed.** It's free and works on your computer. "✦ Ask the AI to refine" shows its cost first.
- **Renders and Perform follow.** The moods play in your renders and in ◉ Perform.
- **Undo right after the AI answers works.** Pressing Ctrl/⌘+Z in the Lab just after a reply now undoes that reply,
  never the thing you did before it. If the scene is still settling, it says "Settling…" and undoes it a moment later.

## For Codex
No Codex-owned file was edited: `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged, and there is nothing to merge on your side.
- The moods read the project's brief only through public calls, the same way the song map does:
  `Projects.ofItem('scene', id)` and `ProjectBrief.get(id).tempo`.
- ✦ Ask the AI to refine runs through `hub.askOnce` on the dock's agent: lean, helper, `Autocompact.CHEAP` model and
  effort, plus `verbosity: 'low'` for Astra. That's the same path as ✦ Suggest dials.
- The undo fix is in LabTxn, so it covers Astra replies the same way as Claude's.
- **Data:** the moods live in the existing places: `sketch.dials` keys, layer slider keys, and cues in kv
  `three-beatmaps`. There's no new store, and sync needs no change.
