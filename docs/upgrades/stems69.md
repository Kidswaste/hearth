# stems69 — 📤 Send to my DAW (round 69)

The owner wants to finish some tracks in a DAW (Ableton, FL Studio, Logic). This sends a song from the Sound desk
(Creative Playground → Serum 2 / Vital) to a folder the DAW opens without any fixing: every WAV starts at bar 1 and has
exactly the same length, so dropping them all at bar 1 lines them up to the sample. Everything is reached by clicking a
labelled button in places the owner already looks; the chat command comes second. Nothing is uploaded. Edits to other
streams' files and Codex's files are small, additive and marked `(round 69, stems69)`.

## What shipped
### Getting there (all by clicking)
1. **📤 Send to my DAW** in the Sound desk's top row, next to 🎤 Live set / Sessions / 🎧 Reference.
2. **📤 Send to my DAW** in **Arrange**'s head, next to Export (the Arrange song is chosen for you).
3. **📤 Send to my DAW** on a **Live set song** (🎤 Live set → ✎ Edit, in the song's row next to ＋ New song): that
   song is chosen for you. It shows only when the song has clip pads.
4. Ctrl/⌘+K "Sound desk: send to my DAW (stems, mix, MIDI, presets)". `/daw` also works from any chat, but you never
   need it.
### The panel (over the desk, like Arrange and Sessions)
5. **Song**: the Arrange song, and each Live set song that has clip pads, in words ("Live set · Night bus · 3 pads ·
   124 BPM").
6. **What to send**, four ticked boxes with counts:
   - **Stems**: one WAV per pad (Live set) or per lane (Arrange);
   - **Mix**: the whole song in one WAV;
   - **MIDI**: the notes of the parts you played (greyed out with "no played notes in these parts" when there are none);
   - **Presets**: copies of the song's presets.
7. **Key**: guessed from the notes you played ("A minor · guessed from your notes"). You can type your own ("am",
   "F# major", "bb min" are all understood). With no notes and nothing typed, the key is left out of the names.
8. **Where**: the place you chose last time (remembered on each computer; the Music folder the first time), with
   **Change…**.
9. One line says what it makes: "124 BPM · 4/4 · 48 kHz 24-bit WAVs, all starting at bar 1, all the same length, plus a
   README.txt".
10. **📤 Send to my DAW** starts it. A **progress bar** shows what it's doing ("Writing Hats 4 bars… 62 %"), with
    **Cancel**.
11. When it's done: "✓ Sent 8 files to “Night bus — stems 2026-10-26” · 4 bars at 124 BPM · A minor." and
    **Show folder**.
12. **Cancel** stops at once and removes what it had written: "Cancelled: nothing was left behind."
13. An empty state when there's nothing to send yet, saying where to make something (Arrange loops, or Live set pads).
### The folder
14. **"<song> — stems <date>"** in the place you chose. If that name exists, it gets " 2" (nothing is ever written over).
15. **48 kHz, 24-bit, stereo WAVs**. Every file **starts at bar 1** and is **exactly as long as the others**: the longest
    part, rounded up to a whole bar at the song's tempo. A part that ends earlier is followed by silence. Loops are there
    once, so you loop them in the DAW.
16. **Tempo and key in every name**: `00 Mix - 124 BPM - A minor.wav`, `01 Kick 2 bars - 124 BPM - A minor.wav`… The
    number keeps the order in the DAW; the mix is 00.
17. **MIDI next to its stem**, with the same number and name (`01 Kick 2 bars - 124 BPM - A minor.mid`). It starts at bar
    1 at the song's tempo, with the notes where you played them (a take that was fitted to the song's tempo has its
    notes fitted the same way).
18. **Presets/**:
    - a preset file from the plugins' folders (Sound bank) is **copied** as it is (the original is only read);
    - a Vital preset kept in the desk's bank is written as a **.vital**;
    - the sound in the open instrument **right now** is included too.
    A Serum 2 sound that lives only inside Hearth has no preset file to copy: the README says so and how to save it from
    Serum 2.
19. **README.txt** says the tempo, the key (and where it came from), the length in bars and seconds, how to drop the
    files in at bar 1, what each file is, and what wasn't included.
20. **Levels are as you heard them.** Only when the mix would go over −1 dBFS is every file turned down by the same
    amount (the README says how much), so the stems still add up to the mix.
### What goes in, per source
21. **A Live set song**: each clip pad as it plays on the pad (a take fitted to the song's tempo, a loop cut to its bars,
    the arranged song as a one-shot, a sketch), at the pad's gain; the mix = every pad played together from bar 1; the
    MIDI of pads that came from park takes with notes; its preset pads.
22. **Arrange**: one stem per lane (the re-render lane too), rendered exactly as Arrange plays it (bars, repeats, trims,
    fades, stretching, gains); muted lanes are left out (the README lists them); the MIDI per lane; the presets used by
    the re-render lane.
### Also (secondary)
23. `/daw` (open the panel), `/daw list`, `/daw send [arrange | <song>]`, `/daw cancel`.

## How it works
- `tools/dawsend-core.js` (UMD, no DOM, node-tested): names safe on Windows and the Mac (`clean`: no `<>:"/\|?*`, no
  control characters, no trailing dot, no `CON`/`PRN`…), `folderName`, `fileName`, `presetName`; the common length
  `plan` (whole bars, rounded to a sample once; a part that is N bars rounded to a sample stays N bars); `fit` (bar 1,
  stereo, padded / cut); `safeGain` (one gain for every file, only under −1 dBFS); the 24-bit `wavHeader` / `pcm24`
  (written in pieces, byte-for-byte the same as written whole); `guessKey` (Krumhansl–Kessler on the notes, by length;
  no guess with fewer than 6 notes or 3 pitch classes); `keyText`; `padNotes`; `readme`.
- `tools/dawsend.js` (`DawSend`) + `tools/dawsend.css`: the panel; the parts read from the same files the pads / Arrange
  play (`LoopSongCore.prepare` / `render`, `LiveSetCore.fit` / `loopFrames`), then handed to main in 4-second pieces.
  A lazy group `dawsend`, loaded on the button's first click (never at boot). Nothing runs while it's closed.
- `dawsendmain.js` (lazy IPC `dawsend:*`, preload `hub.dawsend`):
  - `begin` takes the folder's free name and makes `<name>.part`;
  - `open` / `write` / `close`: a WAV's whole header first, then its pieces; `close` checks it is exactly the promised
    size;
  - `put` (MIDI, README, a .vital), `copy` (a preset file, only preset types, ≤ 16 MB, `COPYFILE_EXCL`), `state` (a
    bank preset written as .vital only when it is Vital's JSON preset);
  - every file is created with `wx` (never over a file), and names can't leave the folder (`..`, slashes and other types
    are refused);
  - `finish` renames `<name>.part` to `<name>`; `cancel` removes that staging folder and only it.

## Tests (no sound card, no real plugins, no DAW, isolated profile)
- `node dev/stems69-test.js` (`unit:stems69-test`, in the `const UNIT` list, 59 checks):
  - **names**: forbidden characters, trailing dots, `CON` / `nul.txt`, 60 characters, NFC; the folder name; tempo with
    decimals; no key → no key in the name; MIDI shares its stem's name;
  - **length**: 120 BPM (384,000 samples for 4 bars); one sample past a bar → the next bar; 124 BPM where a bar is
    92,903.23 samples (3.3 bars → 4 bars = 371,613); 3/4; too long / no tempo refused; padding, cutting, mono → stereo;
    the shared gain;
  - **24-bit WAV**: pieces = whole, byte for byte; the header fields; read back within ½ LSB; over full scale clipped,
    never wrapped;
  - **alignment**: three generated parts with clicks at known samples (2-bar loop, 4-bar loop with a left-only click,
    3.3-bar one-shot) → every file exactly 371,613 samples, every click at the same sample in its stem and in the mix,
    the stems adding up to the mix within 2 LSB, two loud parts turned down together to −1 dBFS;
  - **key / notes / MIDI / README**: A minor and C major found; too few notes → no guess; typed keys tidied; a stretched
    take's notes on the song's grid, cut at the part's end; the MIDI's tempo and first note at tick 0; the README's
    lines (CRLF);
  - **main**: begin → `.part`; " 2" for a taken name; refused destinations; a WAV in pieces at exactly the promised size
    (more refused, short refused); `wx`; seven escaping names refused and nothing written outside; a preset copy
    byte-for-byte with the original untouched; non-preset / missing files refused; a Vital bank state → .vital; an
    opaque state not written; finish renames; Cancel removes only its staging folder (the owner's file and an earlier
    export stay); " 2" free again after a cancel.
- `dev/checks/stems69.js` (`node dev/smoke.js --fake-vst --script dev/checks/stems69.js`, 32 checks, all by clicking,
  with the fake instrument host). Fixtures: generated clips at 124 BPM with clicks at known samples (a 2-bar kick loop
  with notes in A minor, a 4-bar hats loop, a 3.3-bar one-shot), a Live set song "Night bus" with them on pads and a bank
  preset pad, an Arrange song (kick ×2 on lane 1, hats from bar 2 on lane 2), and a remembered place with the owner's
  own file in it:
  1. Nothing loads before the button; the labelled button is in the top row next to 🎤 Live set.
  2. 🎤 Live set → ✎ Edit → 📤 opens the panel on "Night bus"; the words (Stems 3, MIDI 1 part, Presets 2), the key
     "A minor · guessed from your notes", the remembered place.
  3. 📤: the progress bar with Cancel, then "✓ Sent 8 files…" and Show folder. The folder holds exactly the mix, 3
     stems, the kick's MIDI, Presets/ (the bank preset and the sound now, as .vital), README.txt; no `.part` left.
  4. Every WAV is PCM 24-bit 48 kHz stereo and **exactly 371,613 samples**; every click is at its exact sample in its
     stem and in the mix (a left-only click stays left-only); the one-shot keeps its last sample and is silent after it;
     the stems add up to the mix (0.0 LSB); the MIDI is at 124 BPM with its first note 0.1 s after bar 1; the README
     says tempo / key / length / bar 1 / each file.
  5. Arrange's 📤 opens on Arrange; with Presets unticked: mix + 2 lane stems + lane 1's MIDI + README, no Presets;
     every WAV exactly 464,516 samples (5 bars); every click on the song's bar grid in its lane and in the mix; the stems
     add up to the mix.
  6. The top row's 📤, Arrange chosen, **Cancel** mid-way: "Cancelled: nothing was left behind.", no new folder, no
     staging folder, the owner's file untouched. Nothing sent anywhere (fetch / XHR watched).
- Group: `node dev/run-checks.js stems69`.
- Results (app checks under `flock /tmp/hearth-run.lock`, at most 5 per hold, outputs in my scratch folder):
  - **pass**: stems69, sketchpads67, lazy, unit:boot-test (first screen unchanged: everything new is in the lazy group
    `dawsend`), unit:stems69-test, unit:datasafe-scan, unit:winmac-test, unit:winmac-scan, unit:errorcalm-scan,
    unit:liveset64-test, unit:loopsong63-test. `node dev/lazy-manifest.js` regenerated (`/daw` + the palette line).
  - **known failures on the base too, not from this stream**: `liveset64` ("the pad's knob filters it in the host: Filter
    off", past the editor where the new button is); `loopsong63` ("Open Creative Playground → Serum 2 / Vital first", as
    noted in sketchpads67).

## Risks / notes
- **Serum 2 sounds kept in Hearth's bank aren't written out.** Hearth holds them as the plugin's state, which isn't a
  .SerumPreset file; the README lists them with how to save them from Serum 2. Serum 2 preset files from its preset
  folder (Sound bank with plugin folders on) are copied.
- **Vital bank presets are written as .vital from their state.** Hearth's Sound bank already treats Vital's state as its
  JSON preset; this wasn't checked against a real Vital install here.
- **Loops are there once**, padded with silence to the longest part. A Live set has no fixed arrangement (pads are
  launched live), so the DAW is where you repeat them. Arrange songs come out arranged.
- **Muted Arrange lanes are left out** (as you hear it); unmute one to include it.
- **Memory**: all the parts of one song are held in the window while it's sent (as Arrange's Export does). A song is
  capped at 30 minutes.
- The key guess needs played notes (park takes). Sketches and recorded audio carry none: type the key then.
- Leaving the desk while it sends: it carries on and a toast says when it's done.

## For Codex
No Codex file was touched (`workbench-*`, `creative-vst*`, `tools/quest-*` are unchanged). The panel reads the desk's
project through parkjam62's helpers (`h.state.song`, `h.state.liveset`, `h.state.presets`) and uses
`WorkbenchVST.api.current()` / `exportPatch()` as documented, plus `hub.soundbank.list` / `state` (soundbank63) and
`decodeState` from `soundbankmain.js` (read-only).

Other files touched (small, additive, marked `(round 69, stems69)`):
- `tools/parkjam.js`: the top-row button in `attach`, `DawSend.pause()` in `pause`;
- `tools/loopsong.js`: the button in Arrange's head;
- `tools/liveset.js`: the button in the editor's song row;
- `main.js` (one `lazyIpc` line), `preload.js` (`hub.dawsend`), `index.html` (`dawsend` added to the existing
  `lazy-at.js#…` tag), `lazy-data.js` (the group) + META regenerated, `dev/run-checks.js` (UNIT + the `stems69` group).

## To test on the owner's computer
1. Update Hearth (⬆ Update) and restart it.
2. Creative Playground → Serum 2 / Vital. Press **📤 Send to my DAW** in the top row.
3. Pick your Live set song (or your Arrange song). Check the key it guessed, press **Change…** once to pick where the
   folder goes (your Music folder or a projects folder), then **📤 Send to my DAW**.
4. Press **Show folder**. In Ableton (or FL / Logic): set the project to the tempo in the file names, select all the WAVs
   and drop them at bar 1. They should line up exactly; solo the mix against the stems to hear it.
5. Drop the .mid on a Vital track and load the .vital from Presets/: it should play the part again.
6. Start another send and press **Cancel**: no folder is left behind.

## For the patch notes
- **📤 Send to my DAW: finish your tracks in Ableton, FL Studio or Logic.** In the Sound desk (Creative Playground →
  Serum 2 / Vital), press **📤 Send to my DAW** in the top row. It's also in **Arrange** (next to Export) and on each
  **Live set** song (✎ Edit).
- Pick the song, tick what you want: **Stems** (one file per pad or lane), the **Mix**, the **MIDI** of what you played,
  and copies of your **Presets**.
- You get a new folder, "<song> — stems <date>", wherever you choose (Hearth remembers the place). Every WAV is 48 kHz
  24-bit, starts at bar 1 and is exactly the same length, so they line up when you drop them in at bar 1.
- The tempo and key are in every file name, and a README.txt says what each file is. Hearth guesses the key from the
  notes you played; type your own if it's wrong.
- A progress bar shows how far it is, **Cancel** leaves nothing behind, and **Show folder** opens it when it's done.
- Caveat: a Serum 2 sound saved only inside Hearth can't be copied as a preset file (the README says how to save it
  from Serum 2). Vital presets are included.
