# loopsong63 — From park loops to a song (round 63)

The owner records loops in the park (parkjam62: each take's dry WAV, layered WAV, ambience WAV, MIDI and notes JSON in
`<data>/creative-park/<sketch>/`). This turns them into a finished song inside Codex's Sound desk (Creative Playground →
Serum 2 / Vital). Nothing new on screen except one **Arrange** button in the existing Park jam fold row. It works offline
and needs no AI.

## What shipped
### Arrange (a panel over the Sound desk)
1. **Arrange** in the Park jam fold (same row as Record loop / Ambience). It opens a panel over the desk. `/song`
   opens it from any chat, and so does Ctrl/⌘+K "Sound desk: arrange park loops into a song".
2. **Takes from any park sketch.** One picker lists every take in every `creative-park/<sketch>/` folder (main reads
   each take's notes JSON), newest first, with place, bars, BPM, notes and "+ ambience".
3. **Four lanes and a re-render lane**, laid out over bars. Clips **snap to bars** and are dragged with the mouse
   (snapped when you let go). With a clip focused, the arrow keys move it one bar or one lane (listed in the keys sheet).
4. **The tempo comes from the takes.** The first take sets the song's BPM. A take at another tempo is **time-stretched
   with the pitch kept** (WSOLA) if it is within −20 %/+25 %. Further off, or with "Fit to … BPM" unticked, it plays at
   its own tempo and the panel **warns** in plain words that it will drift. `/song tempo <bpm>` changes the song's tempo.
5. **Per clip:** repeat (×1–64), trim in whole beats, fade in / fade out (seconds), gain (dB), and **park ambience on/off**
   (the layered or the dry loop).
6. **Per lane:** M mutes the lane, and it can be toggled while the song plays.
7. **Playback in the window's Web Audio graph.** The instrument host is never involved (the check counts zero host
   calls). The playhead runs on the compositor (`el.animate`). Stop closes the AudioContext, so nothing runs while
   idle.
### Re-render through the synth
8. **Re-render lane:** a take's MIDI plays live through Serum 2 / Vital with **another bank preset**
   (`WorkbenchVST.api.loadPreset`, the same bank soundbank63's picker fills). The take's notes go to the host's
   sequencer and parkjam62's loop recorder records it sample-accurately. The take's lead-in silence is put back, so the
   new audio lines up with the original take. Afterwards **your own sound comes back** (`api.undo()`). The file is saved
   in the sketch folder and the clip shows "↻ <preset>".
### Export
9. **Export:** the mix **normalized to −1 dBFS**, **one stem per lane used** (scaled by the same gain, so the stems add
   up to the mix: within 1 LSB in the check), the **song's MIDI** (every clip's notes where they play, stretched clips on
   the song's beats, muted lanes left out), and the song as JSON. All of it goes into the sketch's folder, each file
   written atomically (`.part`, then renamed).
10. **MP3 too** when ffmpeg is installed (found the way Hearth already finds it, including Settings' ffmpeg path),
    written next to the mix, also atomically. The box only shows when ffmpeg is there.
### Proof
11. **"Finish a track"** is a new personal quest in the Paris quests: pick the loops, bounce the whole thing, listen
    once and name it. The wording is kind: "done beats perfect". **Offer as "Finish a track" proof** after an export
    adds the quest to the journal if it isn't there and submits the song (the MP3, or the mix) through Codex's proof
    contract. No XP and no review happen by themselves, and the same song can't be submitted twice.
12. Every export is also announced as a `hearth:quest-week` event (`kind: 'park-song'`) for the week in review.
### From chat
13. `/song` (open Arrange), `/song takes`, `/song add <n> [lane 1–5] [bar]`, `/song list`, `/song play | stop`,
    `/song repeat|move|trim|fade <clip> …`, `/song mute <lane>`, `/song tempo <bpm>`,
    `/song rerender <clip> [preset]`, `/song export [wav]`, `/song proof`, `/song clear`, `/song close`. Also
    `/jam park arrange …`. The Lab's own `/song` (play / pause / seek / speed / mute / load / zoom) is unchanged (see
    below).

## How it works
- `tools/loopsong-core.js` (pure, Node-tested): `create / validate`, `addClip / move / repeat / trim / fade / remove`
  (snapping), `tempoFrom`, `tempoPlan` (stretch or warn), `warnings`, `schedule` (one list of segments drives both the
  Web Audio playback and the mixdown), `envelope` (fades + 2 ms edge ramps), `render`, `normalize`, `stretch` (WSOLA),
  `prepare`, `songNotes`, `rerenderNotes`, `realign`, `exportNames`, `proofText`, `TRACK_QUEST`.
- `tools/loopsong.js` (`LoopSong`): the panel, sources (decoded → song rate → stretched; at most 16 cached; cleared when
  the desk leaves), playback, re-render, export, proof, `/song`. The song lives in the Sound desk's project
  (`state.vst.song`, next to parkjam62's `state.vst.park`).
- `/song` is registered at start in `jam.js` (eager, like presethover61's `/preset` in astra.js). The name is the Lab's,
  so it is shared with a `when`: Arrange takes its own words anywhere (`arrange, takes, add, export, rerender, proof,
  tempo, list, …`), every word inside Creative Playground, and a bare `/song` outside the Lab. Everything else goes to
  the Lab's `/song`.
- Main (`creative-vstmain.js`): `parkList(dataDir)` (every sketch's take JSONs, never the song JSON) and
  `parkMp3(dataDir, sketch, name, ffmpeg)` (only a `.wav` in that sketch's own folder). IPC `creative-vst:park-list` and
  `creative-vst:park-mp3`. Preload: `hub.parkSong.{ list, mp3 }`.

## Tests (Linux, no sound card, no real plugins)
- `node dev/loopsong63-test.js` (unit:loopsong63-test, 61 checks) covers:
  - the arrangement model and snapping (bars and beats);
  - tempo from the takes, stretch vs warning, the re-render lane staying silent until rendered;
  - the schedule, and the mixdown math (fades, lane / clip gain, mute, −1 dBFS);
  - stems summing to the mix in float and as 16-bit WAVs (≤ 4 LSB);
  - WSOLA keeping 440 Hz at ×1.09 and ×0.85;
  - the song's MIDI (repeats, trim, stretch, mute), re-render notes / realign;
  - export names under parkSave's rules, the proof text against `QuestCore.checkProof`;
  - the "Finish a track" quest (no drift between the template and quest-paris.js);
  - `parkList` across two sketches;
  - `parkMp3` (refusals, and a real MP3 with this machine's ffmpeg).
- `dev/checks/loopsong63.js` (`node dev/smoke.js --fake-vst --script dev/checks/loopsong63.js`, 52 checks) uses the
  fake host and parkjam62's fixtures. Three takes from two sketches: one recorded in the desk with the loop recorder,
  two written as parkjam62 writes them (one with ambience, one at 180 BPM, which gets stretched). The check covers:
  - arranging from the fold's Arrange button: drag snapping, arrow keys, repeat, fade, ambience off;
  - the warning at `/song tempo 140`;
  - one take re-rendered live through the fake Vital with the bank preset "Loud lead": the same length, 1.80×
    louder, the first note at the same sample, and the desk back at its own level;
  - playback with zero host calls, with the compositor playhead;
  - the export: mix at −1.000 dBFS, 4 stems summing to the mix within 1 LSB, 10 MIDI notes, the JSON, the MP3, all
    written whole;
  - the proof submitted to "Finish a track" (no XP, no double submit), and `/song` routing / list / takes.
- Also passed (under `flock /tmp/hearth-run.lock`): parkjam62, vst-live, workbench-vst (its real-plugin part is skipped
  with no runtime here), quest-paris, lazy, unit:boot-test (first screen unchanged: everything is in the `creative`
  lazy group except the 18-line `/song` block in eager jam.js), unit:parkjam62-test, unit:quest-paris-test,
  unit:winmac-scan, unit:datasafe-scan. After merging claude/intelligent-galileo-yaiqem (questwalk63, rewards63) and
  origin/main: loopsong63, quest-paris, lazy, boot-test and the three unit tests were re-run, and all passed.
- Noticed, not ours: `unit:errorcalm-scan` reports 7 places in Codex's `tools/quest-journal.js` (6) and
  `tools/outing-desk.js` (1) that were already there before this round.

## Risks
- The stretch is a plain WSOLA (≈ 43 ms grains). It is clean for loops within ±20 %, but on sharp transients you can
  hear it; further off, the take plays at its own tempo and you get the warning instead.
- Re-render plays out loud through the live output (it is a live performance of the take's notes), and it needs the
  loop to be 1/2/4/8/16 bars and ≤ 64 s (the host's sequencer limit). It uses at most 256 notes.
- Mixing and stretching run in the window (yielding between clips). A long song with many stretched clips can take a
  moment on Export or the first Play. Sources are cached, and the cache is capped.
- `/song` is a shared name. In the Lab, `/song` plus Lab words still drive the Lab's song; `/song export|takes|…`
  in the Lab opens Arrange.
- Real Serum 2 / Vital presets weren't available here. The re-render uses whatever the desk's bank holds (the check
  uses the fake Vital).

## For the patch notes
- **Turn your park loops into a song.** In the Sound desk's Park jam fold, press **Arrange**. Pick loops from any park
  sketch and lay them on four lanes, bar by bar. Repeat, trim and fade them, and switch the park ambience on or off per
  loop.
- Loops recorded at a slightly different tempo are stretched to fit, with the pitch kept. If a loop is too far off, Arrange
  tells you instead of mangling it.
- **Re-render a loop through Serum 2 or Vital with another preset:** your notes are played again live with the new
  sound, and your own sound comes back afterwards.
- **Export** gives you a mix at −1 dBFS, one stem per lane, the MIDI, and an MP3 if ffmpeg is installed. Everything goes
  into the sketch's folder.
- A new personal quest, **"Finish a track"**: offer the exported song as proof in one click. The review and XP stay
  your choice.
- From chat: `/song` opens Arrange; `/song add 1`, `/song export`, `/song proof`. Works offline, no AI needed.

## For Codex
Your files touched (all additive, marked `(round 63, loopsong63)`):
- `creative-vstmain.js`:
  - `parkFolder()` (parkSave's folder rule, read-only), `parkList()`, `parkMp3()`;
  - two IPC handles, `creative-vst:park-list` and `creative-vst:park-mp3`;
  - `register()` accepts an optional `settings` (for the ffmpeg path);
  - exports `parkList`, `parkMp3`.
  `parkSave` itself is unchanged.
- `tools/quest-paris.js`: one personal quest entry, `track` / `c-pq-track` "Finish a track", path `music`, three
  steps. `tools/loopsong-core.js` keeps the same template as a fallback, which `LoopSong.offer` pushes only if a
  journal build lacks it (the unit test guards against drift).
- `tools/workbench-vst.js`: **not touched.** Arrange attaches through parkjam62's hooks (`ParkJam.pause` → `LoopSong.pause`;
  the Arrange button in the fold's existing row; `ParkJam.desk` / `ParkJam.helpers` exported).
- `WorkbenchVST.api` is used as documented: `current / instruments / open / presets / loadPreset / start / undo`, plus
  `hub.vst.request` for `record`, `sequence`, `record-status`, `record-take`, `record-cancel` (the parkjam62 recorder).
- Others: `main.js` (passes `settings` to creative-vstmain's register: one line); `preload.js` (`hub.parkSong`, its own line
  to stay clear of the `vst` line); `jam.js` (the eager `/song` block at the end and nothing else; `/jam park arrange` is
  routed in parkjam.js); `lazy-data.js` (creative group + META regenerated) / `lazy-meta.js`; `dev/run-checks.js` (UNIT
  + group `loopsong`).
