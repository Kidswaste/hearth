# Round 130 · songmap130: map the scene to the song

The Lab already knew the song well: its sections, drops, beat grid and drums. It could also put cues, keyframes, looks
and beat links on a scene, but only one at a time, by hand. This round adds **✦ Map to the song**. It proposes all of
them at once, from the song's analysis and the scene's slider names. The plan shows as ghosts on the timeline, and you
keep what you like.

## What existed (and is reused, not duplicated)
- **Song analysis** (`tools/three-music-core.js`, the player's `analysis`): BPM, the beat grid and downbeat, sections
  labelled Intro / Build / Drop / Break / Outro (with loudness and confidence), the drops and the drum hits.
- **Sections ▾ › Mark sections from the song** (`tools/three-media.js` `autoSections`): cues named after the
  sections, snapped to the grid. The map uses the same naming ("Drop 2" for the second drop) and the same cues
  (`editCues`).
- **Cues with looks**: a cue can carry `looks: [{ layer, name }]`. Playback switches each layer to its look when it
  enters the cue (`tools/three.js` `onCue`). Looks are the sliders' saved looks (`looksApi`, `three_looks`).
- **Keyframes** (`three_keyframes`, `director.setKeyframes`, `L.keys[prop]` with `{ t, v, ease }`, eased by
  `ThreeLayers.evalKeys`). **Animate presets** (`three_animate`: pulse on beats, shake on kicks…).
- **Beat links** (round 38, `tools/three-beatlink*.js`): a slider's `{ band, how, lo, hi, … }` link, set with the
  controller's `link(key, link, { undo })`. `BeatLinkCore.make` gives a sensible range from the slider's value.
- **The timeline tools**: `three_timeline` / `three_timeline_edit` (grid, markers, cues, lanes).
- **autoedit** (round 27): a whole music video planned per section on the Lab *sequence* (scenes, cuts, transitions).
  The map works inside one scene instead: its timeline, sliders and looks.
- **The brief's tempo plan** (round 128, `ProjectBrief.get(id).tempo`: `[{ section, plan }]`).
- **Undo**: `LabDirect.push` puts one step in the Lab's Ctrl/⌘+Z (in the timeline's own undo when a song is
  loaded). `LabTxn` makes one AI reply one undo step.

## What's new, and where the owner clicks
**✦ Map** sits in the Lab timeline's song row, next to 🎬. It shows once a song is loaded and analyzed. It's also the
first row of **Sections ▾**, the command **`/map-song`**, and in Ctrl/⌘+K: "Lab: ✦ Map the scene to the song".

A click proposes a plan. The plan is worked out on this computer, with no AI and nothing to pay:
- **Cues** named after the song's sections (Intro, Build, Drop, Break, Outro), each on its downbeat (the section start
  snapped to the nearest bar line of the grid in use).
- **Looks per section**, when the layers have saved looks. A look named like the section wins ("Drop"). Otherwise a
  big-sounding look goes on drops (Hype, Loud, Peak…) and a calm one on the intro, breaks and outro (Calm, Soft,
  Chill…). The looks ride on the cues.
- **Drop moves**: the main layer is the one with the most sliders worth moving (the selected layer breaks a tie). On
  each drop, one of its real sliders jumps up and eases back over one bar. The slider is picked by name: intensity,
  glow, bloom, bright, energy, scale, size, speed, opacity. A slider the brief's tempo plan names for the drop comes
  first. Sliders already at their top, keyframed by you, or following the music are skipped. A layer with no such
  slider gets its Scale instead.
- **Beat links**: kick → a pulse on the most fitting slider (pulse, glow, bloom, flash, scale…); snare → another (spark,
  flash, shake, glitch, hue…). This only happens when nothing in the scene follows the kick or snare yet. The range
  comes from `BeatLinkCore.make`.

The plan shows as **ghosts**:
- dashed, dimmed lines with "✦ name" on the timeline for the cues (◐ when a cue carries looks);
- dashed diamonds on the layer's track for the drop keyframes;
- a list under the song's row, grouped by section, with a "Whole song" group for the links.

**Nothing in the scene changes until you keep it.**
- **Keep all**, **Keep this section** (one per section), **✓** to keep one item, **✕** to skip one item (its ghost
  goes away).
- **Each keep is ONE undo step**: the toast's Undo, the panel's ↶, or Ctrl/⌘+Z in the Lab. It puts the cues (with their
  looks), keyframes and links back exactly as they were.
- **✦ Ask the AI to refine**: the director gets the plan and the scene's outline (sliders with their ranges, looks,
  links). The cost shows first ("≈2,800 tokens with its reply"), and nothing is sent without the OK. The director
  answers with `three_do map_song { plan }`. Its plan replaces the ghosts, titled "(refined by the AI)", and it's kept
  only when you keep it.
- **Close** drops the plan. Nothing is kept.

**The AI can use it.** `three_do map_song` returns the plan (compact text) and shows it to the owner as ghosts.
- `{ plan: { cues, keys, links } }` puts the director's own plan up instead.
- `{ apply: true }` keeps it all. That's one undo step of its reply, so `/undo-edit` or the dock's ↶ takes it back,
  beat links included.

The details are in `three_do help map_song`, which costs nothing until asked. The `three_do` description names
`map_song` in its Time line. Two words were trimmed elsewhere in it, so it stays ≤ 200 tokens and the lean director
stays at 2159 tokens. Full-mode directors (no `three_do`) can use `three_run { command: "/map-song keep" }`.

## Files
- `tools/three-songmap-core.js` (new, pure, loads in Node): sections on downbeats, the main layer, slider picking by
  name and by the brief's tempo plan, drop keys, looks per section, beat links, the AI plan's normalisation, key merging,
  words, compact text and the cost estimate.
- `tools/three-songmap.js` + `tools/three-songmap.css` (new): the ghosts (a timeline `addHooks` draw), the panel,
  keep / ✕ / one-step undo, the refine with its cost, the AI's op, `/map-song` and the Ctrl/⌘+K action. It's the lazy
  group **songmap** (`tier: 'use'`, after `lab`). It loads on ✦ Map, Sections ▾, `/map-song` or the AI's first call.
  `lazy-data.js` has the group and the manifest (`node dev/lazy-manifest.js`), as does `lazy-meta.js`.
  `index.html`'s `lazy-at.js#…projlook,songmap,…` tag and `docs/lazy-groups.md` have its line.
- `tools/three-media.js` (marked): the ✦ Map button and the Sections ▾ row. `editCues` takes `undo: false`, so the map
  keeps its own single undo step.
- `tools/three.js` (marked): `stageHooks.keysOf / setKeys`, a layer's keys read and put back exactly.
- `tools/three-director.js` (marked): `three_map_song` goes to the song map (it loads the group first).
- `tools/three-txn.js` (marked): `map_song` without `apply` counts as a read. An AI reply's snapshot now holds the
  scene's ♪ beat links, and its undo puts them back. Only "how" links are touched; old curves aren't.
- `mcp/three-mcp.js` (marked): `map_song` in `DO_CMDS`, its help line, and the word in `three_do`'s Time line.
- `dev/checks/songmap130.js` (new) and the `songmap130` group in `dev/run-checks.js`.

## Tests
One app check, **`dev/checks/songmap130.js`** (group `songmap130`). It uses the check's own temp data and the fixture
song `/tmp/hearth-autoedit-song.wav` (`dev/make-test-song.js --form`, 128 BPM, made by run-checks). The scene has
sliders glow, intensity, spark and a tint, plus saved looks Calm and Hype:
1. **The plan from a known song.** ✦ Map in the timeline gives a cue per section the analysis finds, each named after
   its section and on a downbeat. The drop cue sits on the song's first drop. The drop carries Hype and a quiet section
   carries Calm. The drop keyframes are on a real slider (intensity): a jump at each drop, back down one bar later.
   Kick goes on glow and snare on spark.
2. **The ghosts change nothing.** Cues, keyframes, links and slider values read back the same.
3. **✕ on one item** (the snare link): its ghost goes, and the scene is still unchanged.
4. **Keep all**: everything left is in the scene, and the ✕'d link isn't. **One Ctrl/⌘+Z** puts the scene back exactly
   (the same JSON).
5. **Keep this section** (Drop) keeps only its cue and its drop move. **✦ Ask the AI to refine** shows the token cost
   first; with Cancel, nothing is sent.
6. **The AI, through the fake engine** (real MCP route). `three_do map_song` shows the ghosts and changes nothing.
   `apply: true` keeps the plan. `/undo-edit` puts cues, keyframes and beat links back exactly.

Run:
- `songmap130` ✓ (53 s), `beat108` ✓, `labchat92` ✓;
- `unit:promptdiet-test` ✓ (lean 2159 ≤ 2170, full 9223 ≤ 9225);
- `unit:director-mcp-test` ✓ (`three_do` 200 ≤ 200);
- `node dev/boot-test.js` ✓ (2895: first screen 62 scripts, 1577 KB of 1586 KB);
- also `tokens-test`, `slim116-test` and `selfmap118-test` ✓.

## For the patch notes
- **Map your scene to the song in one click.** With a song loaded in the Lab, click **✦ Map** next to the song's name
  (or Sections ▾, or type `/map-song`). Hearth reads the song's parts and proposes:
  - a cue for each part (intro, build, drop, break, outro), right on the bar where it starts;
  - your saved looks per part: your "Hype" look on the drops, "Calm" on the quiet parts;
  - a jump on each drop: a slider like intensity or glow kicks up on the drop and eases back over the bar;
  - the kick and the snare moving a slider each.
- **You see it before anything changes.** The plan appears as faint, dashed ghosts on the timeline, with a list
  underneath. Keep all of it, keep one part of the song, or ✕ the bits you don't want. One Undo (or Ctrl/⌘+Z) takes
  a keep back.
- **No AI needed.** The plan is worked out on your computer for free. If you want a smarter plan, **✦ Ask the AI to
  refine** shows what it would cost first; the AI's plan comes back as ghosts too.
- The director can do the same when you ask it to "map the scene to the song".

## For Codex
No Codex-owned file was edited. `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `astra*`,
`codex-*`, `workbench-*` and `engine-watch.js` are unchanged. The song map reads the project's brief only through
public calls: `Projects.ofItem('scene', id)` and `ProjectBrief.get(id).tempo`, when that group is loaded. Astra's
directors get `three_do map_song` exactly as Claude's do, through the same bridge.
