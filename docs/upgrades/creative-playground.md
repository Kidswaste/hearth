# Creative Playground

Open **Creative Playground** in the rail, or run `/playground`. All fifteen activities run locally, without model turns, downloads, accounts or new packages. Change the seed or press Shuffle to explore a new variation. The shared BPM controls music and motion; press Apply tempo to rebuild the current preview.

| Activity | Try this | Keep the result |
| --- | --- | --- |
| Palette posters | Shuffle a geometric composition; click a swatch to copy its color | SVG or PNG |
| Seamless tiles | Generate a repeating diamond texture | Tileable SVG or PNG |
| Motion loops | Choose orbit, tunnel or ribbon; loops last four beats | Standalone silent HTML |
| Sprite forge | Generate a mirrored 16 × 16 pixel creature | Transparent SVG or 512px PNG |
| Sound to light | Play an imported sample or generated beat against a visual | Silent visual HTML; reactive playback is in Hearth |
| Beat sketcher | Edit 16 steps across kick, snare, hat and tone; add swing, then render | One-bar WAV |
| Melody garden | Choose root and minor, major or pentatonic scale | Four-bar MIDI and WAV |
| Game sound lab | Make pickup, jump, laser, impact, kick, snare or hat sounds; change pitch | WAV samples |
| Sample cutter | Import audio, choose start/end, reverse and render; short fades and normalization are applied | Trimmed WAV |
| Pocket effects | Process a copy with drive, low-pass, echo and lo-fi hold; compare with original | Processed WAV |
| Arcade builder | Collect light circles, dodge red circles, survive 30 seconds; adjust difficulty | Playable HTML |
| Maze builder | Generate pocket, wandering or labyrinth layouts; navigate to the bright square | Playable HTML and level JSON |
| Rhythm runner | Play 48 beat cues with A/S/D/F or tap the lanes | Playable HTML |
| Daily quests | Three challenges per local calendar day; mark complete, undo, reflect and run a focus timer | Local notebook and completion streak |
| Idea mixer | Generate a visual, music, game or mixed-media brief with constraints and palette | Text brief, saved recipe or an unsent Astra draft |

## Recipes, audio and controls

**My recipes** saves independent snapshots of the seed, pattern and controls. Export current recipe JSON for a portable record of those settings. The notebook uses the new `data/kv/creative-playground.json` key. It does not edit existing scenes, projects, chats or configuration. Imported audio is session-only; export a WAV before closing Hearth. Recipe JSON does not contain imported samples.

Audio imports accept browser-decodable files up to 20 MB and 60 seconds, downmixed to mono. Generated music uses 22050 Hz; imported audio retains its decoded rate. Exported WAVs are mono PCM16 and MIDI is standard type 0 with tempo and 480 ticks per quarter. Preview volume is reduced to 30%. Pocket effects is a built-in processor, not a VST/AU host. No sample packs are downloaded.

Navigation and hiding the app stop audio; game previews pause. Each game preview is an `allow-scripts` sandbox without same-origin access. The standalone HTML includes its source and needs no network. Games support keyboard and pointer/touch input. Optional game sounds are disabled initially. Daily quests refresh when opened; no system notification or background AI task is scheduled. Focus timers last for the current app session and use wall time across sleep.

**Prepare Astra draft** appends the brief to the existing visible draft and activates Astra. It never sends it. Saved recipes do not change when the current controls are edited. If the notebook cannot be read, it is not overwritten; exporting still works.

## Checks

`node dev/creative-test.js` checks seeded generators, SVG/HTML escaping, 60 solvable mazes, MIDI event timing, WAV headers and bounds, slicing, effects, calendar streaks, game startup/pause, rhythm scoring and maze completion.

`node dev/creative-preview-build.js --check` verifies the generated preview and exact script/style CSP hashes. After editing `creative-games.js`, `creative-preview.js` or `creative-preview.css`, regenerate with `node dev/creative-preview-build.js`. The preview bundles only these fixed sources: sandboxed `file:` frames cannot fetch sibling scripts on every Electron platform. It permits no network, eval, same-origin access or arbitrary inline scripts.

`node dev/smoke.js --script dev/checks/creative.js --wait 1500 --shot <output.png> --save-dir <exports>` runs in an isolated Hearth copy: every screen, local WAV import, actual binary/text exports, audio cleanup, effects, slicing, game previews, quest undo, independent recipes, draft handoff and notebook reload. Set `ELECTRON` to the installed Electron executable on Windows.

`node dev/creative-export-test.js <exports>` verifies the actual nine files written by the smoke test: PNG dimensions, SVG, WAV byte lengths/rate, MIDI track length, executable HTML, level JSON and recipe settings.

`node dev/lazy-manifest.js` records the registrations; `node dev/boot-test.js` checks startup budgets. Only the new group changes generated metadata. The first screen retains its existing script and stylesheet counts; all creative JS/CSS loads on first use.

## Claude integration handoff

The user explicitly wants Claude to own integration to main and the updater release. Codex publishes only `codex/creative-playground`. This pass has no live data migration and no automatic updater invocation.

The only existing application files changed are one added lazy group in `lazy-data.js` (plus its generated metadata) and `creative` appended to the existing `lazy-at.js#astraconnect,enginehealth` tag in `index.html`. New implementation files are `tools/creative-*`; tests are `dev/creative-test.js` and `dev/checks/creative.js`.

Verified on Windows with Hearth's installed Electron: 391 core checks; all 15 screens; three games executing in Chromium; nine exported files; notebook reload; 1,354 boot checks; generated lazy registry parity. No Mac run was performed. Audio is mono; no VST/AU loading, external sample downloads, automated daily notifications or video recording is included in this pass.

Fetch the branch and merge it into your current integration branch. Preserve your own index/lazy additions; if either registry changed, regenerate lazy metadata instead of replacing the whole file. Run the checks above, commit the reconciled result, and use Hearth's usual updater path after your main push. Do not copy this branch's config/data over the running app.
