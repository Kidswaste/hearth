# The song's parts: react to the drums only, the bass only, the voice only (round 30, stems)

The Lab could already hear kick / snare / hat hits and bands, but a band is not an instrument: the bass band moves on
kicks, the mids move on everything. This stream splits the loaded song into its parts, on this computer, without any
AI model: **the drums** (and inside them the kick, the snare, the hats), **the bass**, **the voice** and **everything
else**, as smooth 0..1 envelopes at ~100 frames a second, read at the playhead. Nothing new sits on screen: the parts
show up where you already choose what a slider follows (♪ panel, the curve editor, reaction presets), as a Lab
mission, and to sketches as `audio.stems.*`.

Files: `tools/three-stems-core.js` (StemsCore: the math; runs in a Worker, the page and Node), `tools/three-stems.js`
(LabStems: once per song, cache, progress, presets, mission, `/stems`); loaded with the Lab (lazy-data.js lab group).

## How it works
- The song is decoded at 22.05 kHz, then a 2048-point STFT every 10 ms. **Harmonic / percussive separation by median
  filtering** (Fitzgerald 2010): per frequency, the median over ~250 ms of time is what holds still (bass notes,
  voices, pads); per frame, the median over ~180 Hz is what is broad and short (kicks, snares, hats). Soft masks split
  each frame between the two.
- **Drums**: percussive energy in the kick (35–150 Hz), snare (1.5–5 kHz) and hat (6–9 kHz) bands; a snare / hat must
  be mostly percussive in its band *and* noise-like (flat), and only what rises above the part's own running floor
  counts (a held sound leaking into the percussive side stays out). Drums = the strongest of the three.
- **Bass**: harmonic energy 30–120 Hz (+ 120–220 Hz unless it is voice-like), minus what fades like a kick's tail.
- **Voice**: harmonic energy 250–4000 Hz times how voice-like it is (its partials move: vibrato, glides, syllables; a
  held chord doesn't). **Everything else**: the harmonic rest up to 9 kHz.
- Each part is levelled against the song's loudness (a part the song doesn't have stays near 0) and its own loudest
  moments, smoothed (its own attack / release), stored as bytes (≈ 0.7 KB a second of song).

## Measured
| | |
|---|---|
| Unit test, 24 s song (bass alone, kicks alone, a voice alone, a pad alone, then all together) | 23/23: drums 1.0 on every kick, ≤ 0.21 on bass notes, 0 on the voice / pad; bass 0.96 on bass, 0.2 on kicks alone; voice 0.9 on the voice, 0 on bass / kicks, 0.35 on a held pad (which goes to "everything else": 1.0) |
| Speed (Node, busy machine) | 24 s of song in 1.2 s; a 3-minute song in ~9 s, in a Worker (never on the page), once per song |
| The labaudio test song (128 BPM, with snares) | snare 0.8 on snares, 0.03 on kicks; kick 0.8–0.9 on kicks |
| In the app (dev/checks/stems.js) | asked only when a sketch reads a part; 14 s song split + sent in 1.7 s; drums 1.0 on kicks, 0.22–0.25 on bass notes; second time from the cache |
| Before anything reads a part | nothing: no request, no Worker, no decode |

Tests: `node dev/stems-test.js` (unit, in the `unit` group) and `dev/checks/stems.js` (fake engines, lab group and
its own `stems` group: `sh dev/run-checks.sh stems`).

## Upgrades

### Hearing the parts (once per song, on this computer)
1. **The song split into its parts**: the drums, the bass, the voice and everything else, from the loaded song, with no AI model and nothing sent anywhere.
2. **Inside the drums: the kick, the snare and the hats** as their own parts.
3. **The drums don't move on bass notes** (harmonic / percussive separation): a bass line no longer fakes kicks.
4. **The bass follows the bass line, not the kick**: a kick's low tail is taken out.
5. **The voice**: tonal sound whose pitch moves like singing (vibrato, glides, syllables); a held pad or chord is not counted as a voice.
6. **Everything else**: pads, chords, synths, without the drums, the bass or the voice.
7. **A part the song doesn't have stays still** (levelled against the whole song, not blown up to full).
8. **Smooth by default**: each part has its own attack / release (drums snap, the voice swells).
9. **Kept on disk** (12 songs): the next time you load the song it's instant.
10. **A small progress bar** on the Lab's rail icon while it runs (never blocks the Lab), and a short note when it's ready.
11. **Costs nothing until something reads a part**: no decode, no Worker, no request.
12. **Renders match the preview**: the parts are indexed by song time, and the hidden export page gets the same values.

### In sketches (the director knows them)
13. **`audio.stems.drums` / `.kick` / `.snare` / `.hats` / `.bass` / `.vocals` / `.other`**, 0..1, smooth, at the playhead (scrub, pause, loop: the same values).
14. **`audio.stems.ready`**: true once the song's parts are in.
15. **The same parts as sound names** everywhere a sound name works: `onHit('stemDrums', fn)`, `audio.env('stemVocals', 40, 400)`, `audio.feat.stemBass`.
16. **A stand-in until it's ready** (and with live input or no song): the kick / snare / hat hits, the low band, the vocals level, so sketches move from the first frame.

### Sliders follow a part (plain words)
17. **The ♪ panel of any slider: "The drums", "The bass", "The voice"** next to Kick, Snare, Bass….
18. **The curve editor's sound list starts with "The song's parts"**: the drums, the bass, the voice, everything else, the kick drum, the snare, the hats.
19. **`/react-to <slider> the drums`** (or `the bass`, `the voice`, `drums`, `bassline`, `singer`…), with an amount and a curve like any sound.
20. Reaction preset **Pump with the drums** (only the drums push it, not the bass or the voice).
21. Reaction preset **Throb with the bass** (the bass line only, not the kick).
22. Reaction preset **Glow with the voice** (rises while someone sings, calm in the instrumental parts).
23. Reaction preset **Drift with everything else** (the pads and chords).

### Chat and the AIs
24. **Lab mission 🥁 "React to the drums, bass and voice"** in the director's ◎: each part drives its own element, with a slider for how much.
25. **`/stems`** (`/song-parts`): how busy each part is in this song, whether it came from the cache; `/stems again` redoes it.
26. **The director's audio guide and the app map know the parts** (one line each, read on demand: no per-message tokens).

## Hooks outside the stream's files (small, additive)
- `tools/three-sandbox.html`: the "stems" block (audio.stems, stand-in, the request), one line in `featVal`, one message route.
- `tools/three-audio.js`: routes `audio-stems-want` to LabStems; typed words ("drums", "the-voice"…) in the alias list.
- `tools/three-audio-cmds.js`: `/react-to` reads "the drums" as one sound.
- `tools/three-tweaks.js`: three chips in the ♪ panel.
- `tools/three-export.js`: the export page gets the song's parts after its media-load.
- `lazy-data.js` (lab group + regenerated manifest), `dev/run-checks.js` (unit, lab, stems), `mcp/three-guide.js`, `mcp/hearth-map.js`.

## Not done / limits
- It's an approximation, not a studio stem split: a bass with a hard pluck still nudges the drums a little (~0.2 on
  the onset vs 1.0 on a kick), a long 808 kick partly counts as bass, a lead synth that bends like a voice counts as
  the voice, and a low male voice under ~120 Hz can leak into the bass.
- Live input (mic / loopback) has no parts: it uses the stand-in (the split needs the whole song).
- The parts arrive a moment after the first read (≈ 5 s a minute of song on a busy machine, once per song); until
  then the stand-in plays. An export started before the split exists uses the stand-in too.
- Not tried on real songs on the owner's Mac: thresholds were tuned on generated songs.

Count: 26 upgrades.

## For the patch notes
- The Lab can now react to **the drums only, the bass only, or the voice only**. It listens to the loaded song once and separates its parts on your computer (no AI, nothing uploaded).
- On any slider, the ♪ panel now offers **The drums**, **The bass** and **The voice**; the curve editor's sound list starts with all the song's parts (also the kick, the snare, the hats, and "everything else").
- New reaction presets: **Pump with the drums**, **Throb with the bass**, **Glow with the voice**, **Drift with everything else**.
- Ask the director, or pick the ◎ mission **"React to the drums, bass and voice"**: each part drives its own thing.
- The first time, a small bar on the Lab icon shows it working (a few seconds a minute of song); after that the song is remembered and it's instant.
- Renders read exactly what the preview showed.
- Good to know: it's a smart approximation, not a studio stem split. A plucky bass can nudge the drums a little, and a synth that bends like a voice may count as the voice. With live input (mic / system sound) it falls back to the kick / bass / vocals hits.
