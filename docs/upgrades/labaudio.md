# Lab audio reactivity (round 23, labaudio): live input, deeper analysis, "react" any slider

You make music visuals: this stream makes the Lab hear more (kick / snare / hat / vocal hits, 8 bands, loudness,
brightness, the beat and the bar with how sure it is, the key, builds and drops), hear a live set (a mic, an audio
interface, a DJ mixer's line-in, or the Mac's own sound through a loopback device) with low latency, and lets any
slider follow any of it through a small curve. Nothing new sits on screen: it lives in the slider's ♪ panel and
right-click menu, 🎧 Live ▾ → Input, Ctrl/⌘+K ("Lab: …") and chat commands (area "Three.js Lab").

Files: `tools/three-audio-core.js` (the analysis, AudioFeat: runs in the worklet, the song Worker, the preview and
Node), `tools/three-audio-worklet.js` (the live AudioWorklet), `tools/three-audio.js` (ThreeAudio: live input,
devices, whole-song features, the preview's requests), `tools/three-audio-map.js` (ThreeAudioMap: curve editor,
meters, presets), `tools/three-audio-cmds.js` (commands); loaded with the Lab (lazy-data.js lab group).

## Measured
| | |
|---|---|
| Live analysis | on the audio thread (AudioWorklet), 86 frames a second at 44.1–48 kHz (one every 512 samples ≈ 11 ms) |
| Per frame to the preview | one ArrayBuffer (3.3 KB: 57 floats + spectrum + waveform), no per-frame objects of numbers |
| Main thread while live | the hub only forwards the buffer (auto gain from its first float); 0 slow frames from the audio code in the check |
| A whole song's features | 34 s song: 1.6 s in a Worker in the app; 108 s: 3 s (Node); then cached (IndexedDB, 12 songs) |
| Before anything reads a feature | nothing: no core sent, no Worker, the worklet sends only the spectrum / waveform |
| Live 128 BPM test | kicks 95 % found (100 % precise, ±40 ms), snares 100 %, hats 92 %; tempo 127.9 after 12 s, conf 1.0; beat phase 0.025 beat off |
| Song test (intro, build, drop) | drop found ±0.02 s, the build before it from its first bar (±2 s), kick hits on / off at the playhead |

Tests: `node dev/audio-test.js` (29 checks: generated songs with known answers, the worklet's path in blocks of 128,
loudness calibration, the key of a chord loop, drops / builds, the curve math) and `dev/checks/labaudio.js` in the app
(a generated song + a fake live input through a stubbed getUserMedia / enumerateDevices: 38 steps, see below).
`labhub`, `smooth-lab`, `qa-commands`, `lazy` pass; `music` fails one step ("Ctrl+Z takes the marked kicks back") that
fails the same way on the base commit.

## Upgrades

### Live input (🎧 Live ▾ → Microphone / line-in…, `/audio-in`)
1. **Live analysis off the main thread**: an AudioWorklet analyses the input on the audio thread; the Lab only forwards one compact buffer every ~11 ms (lower latency than the old 16 ms timer, no analyser reads on the UI thread).
2. **One buffer per frame to the preview**: features, spectrum and waveform in a single ArrayBuffer (no arrays rebuilt as objects every frame).
3. **Input picker**: microphones, audio interfaces and line-ins by name, the chosen one marked (`/audio-in list`, `/audio-in <name>`).
4. **Loopback devices found by name** (BlackHole, Rogue Amoeba Loopback, Soundflower, VB-Cable, VoiceMeeter, Stereo Mix) and listed first with 🔁: the computer's own sound on a Mac (`/audio-in loopback`).
5. **System audio how-to** when none is installed: BlackHole + a Multi-Output Device on the Mac, VB-Cable / Stereo Mix on Windows (`/loopback`, or the input menu's "🔁 System audio…").
6. `/loopback` (`/system-audio`) uses the loopback device straight away when there is one.
7. **Monitoring off by default** (a mic into speakers feeds back); "Hear the input" in the input menu, `/audio-in monitor on|off`.
8. Auto gain and the latency offset work the same on the new path.
9. **Features only while something reads them**: the worklet computes them after the first read, else only the spectrum.
10. **The Stage window's own capture gets the features too** (from its analyser, through the same analysis).

### What the Lab hears now (the same analysis for a song and a live set)
11. **8 bands**: sub, bass, low mids, mids, high mids, presence, brilliance, air, each 0..1 against its own recent range (quiet or loud, they move).
12. **A hit pulse per band** (subHit … airHit).
13. **Kick hits heard in the sound** (kickOn), gated on the low end's loudness so hats don't fake kicks.
14. **Snare hits** (a noise burst with body).
15. **Hat hits**.
16. **Vocal hits and a vocals level** (tonal energy 300 Hz–3.4 kHz).
17. **Loudness, LUFS-ish** (K-weighted, 400 ms; −3 for a full-scale 1 kHz sine) as 0..1 and in dB.
18. **Brightness** (spectral centroid).
19. **Change** (spectral flux, levelled).
20. **Noisiness** (spectral flatness).
21. **Any hit** (an onset pulse over the whole spectrum).
22. **Live tempo with a confidence** (autocorrelation of the onsets, a slight preference for dance tempos).
23. **Live beat phase** (a comb over the last seconds, pulled gently into place each quarter second).
24. **Live bar position with a confidence**: beat in the bar, bar phase, bar count; bar 1 = the beat with the strongest kicks.
25. **Chroma** (12 values) from the spectrum's peaks at their exact pitch.
26. **The key** with how sure it is (`audio.keyName`, e.g. "A minor").
27. **The key as a hue** on the circle of fifths (neighbouring keys, neighbouring colors).
28. **The strongest note**.
29. **Intensity**: where the loudness sits between the quietest and loudest of the last half minute.
30. Live builds and drops (rough: a few seconds without bass, then the bass comes back).

### Songs (found once, kept)
31. **Whole-song features** at 100 frames a second in a Worker the first time a sketch or a slider reads one; the playhead reads them exactly (scrub, pause, loop: same values).
32. **Kept in a cache** by file and length (12 songs): the next time it's instant (`/song-features` says "from the cache").
33. **Drops found** where the bass steps up and it gets louder, merged with the music analysis' drops, landed on the kick.
34. **Builds found** before each drop: from where the tension (brighter, busier hats, more change, less bass) starts to rise, or the bass gap.
35. **build**: a ramp from the build's start to the drop.
36. **drop**: 1 on the drop, fading over ~2 s.
37. **intensity** across the whole song (quiet → loud).
38. On songs the beat, bar phase and their confidences come from the timeline's grid (yours when set).
39. **`/song-features`** (`/song-key`): the key, the drops, the builds, how long it took; `again` recomputes.

### In sketches (the director knows them)
40. **`audio.feat.<name>`** for every feature (`audio.feat.kickOn`, `audio.feat.drop`, `audio.feat.presence`…); `audio.feature(name)`.
41. **`audio.env(name, attackMs, releaseMs)`**: any feature through a follower, smooth at any frame rate.
42. **`audio.chroma`** (12 values) and **`audio.keyName`**.
43. **`onHit('kickOn', fn)`** and any other feature (`onHit('drop', …)`).
44. With no song, every feature has a demo value on the 120 BPM demo beat, so reactive sketches still move.

### React any slider to any sound
45. **Any slider follows any feature**, not only the 10 classic bands (the classic kick / snare markers and triggers stay).
46. **The curve editor**: right-click a slider → "♪ React to a sound (curve)…", the ♪ panel's "⚙ Curve & more sounds…", `/react-curve <slider>`.
47. Sound picker: grouped (drums, bands, band hits, tone, rhythm, song, classic), searchable.
48. **Amount** (−100…100 % of the slider's range).
49. **Threshold** (ignore the sound under a level).
50. **Punch** (soft … punchy curve).
51. **Attack** (how fast it rises).
52. **Release** (how slowly it falls: the smoothing).
53. **Invert** (loud → lower).
54. **The curve live**: the input as a dot on the curve and its last seconds as a trace.
55. **A live meter under each following slider**: what the music does to it now (a compositor-only bar, updated ≤ 12×/s and only while it moves).
56. The curve stays when you change the amount or the band in the ♪ panel.
57. "Stop following" with Undo.
58. The editor closes with Esc or a click outside; "Done" keeps it.

### Reaction presets (in the editor's Presets ▾, Ctrl/⌘+K, `/react-preset`; each picks the slider whose name suits it)
59. **Pump on kick**.
60. **Glow on hats**.
61. **Zoom on drops**.
62. **Rise through builds**.
63. **Shake on snare**.
64. **Breathe with loudness**.
65. **Spin with the change**.
66. **Color from the key**.
67. **Brighter with the highs**.
68. **Wobble on the sub**.
69. **Sparkle in the air**.
70. **Follow the vocals**.
71. **Dim in the quiet parts**.
72. **Sweep each bar**.
73. **Step on the beat**.
74. **Strobe on loud hats**.

### Chat commands (area "Three.js Lab") and Ctrl/⌘+K
75. **`/audio`** (`/hear`): what it hears now, hits, bands as bars, LUFS, brightness, beat and bar with how sure, the key, build / drop.
76. `/audio names`: every feature, for sketches and sliders.
77. **`/audio-in [list|default|loopback|<device>|monitor on|off|off]`**.
78. **`/react-to <slider> <sound> [amount] [attack=ms] [release=ms] [threshold=x] [punch=x] [invert]`** (`/sound-react`); `/react-to` alone lists what follows what; `/react-to <slider> off`.
79. **`/react-preset <preset> [slider]`** (`/reaction`); alone, lists the presets.
80. **`/react-curve <slider>`** opens the editor.
81. **`/react-off <slider|all|everything>`**.
82. Ctrl/⌘+K: Lab: What it hears now (audio features).
83. Ctrl/⌘+K: Lab: React a slider to a sound (curve)….
84. Ctrl/⌘+K: Lab: Reaction presets.
85. Ctrl/⌘+K: Lab: Live input device (mic, interface, loopback)….
86. Ctrl/⌘+K: Lab: The computer's sound via a loopback device.
87. The directors' audio guide and the app map know the features and the commands (one line each, read on demand: no per-message tokens).

## How it works (for the lead)
- Live: `tools/three.js` `__labLiveStart` builds the same context / gain, then `ThreeAudio.attachLive({ ctx, source,
  input: gain, hubLive, io })`; when the worklet starts, the old 16 ms analyser timer isn't started (it stays as the
  fallback). The worklet posts `[ms, hasFeatures, …57 features] + 1024 spectrum bytes + 2048 wave bytes`; the hub
  sends it on as `{ type: 'af', b, F, rate }` after the latency queue. `hubLiveStop` detaches.
- Preview (`tools/three-sandbox.html`, one block after the `audio` helpers): `FX` state, `featVal(name)` (live buffer
  → song track at the playhead → the analyser through the extractor → demo), `audio.feat` (a Proxy), `audio.env`,
  `fxShape` (the curve), `meterNote` → `audio-meter`, and `fxMessage` for `af` / `audio-core` (the core sent as
  text the first time, run with `new Function`) / `audio-track` / `audio-probe`. `valueOf` (sliders) follows any
  feature and applies `m.c`; `onHit` takes feature names.
- Sliders (`tools/three-tweaks.js`, additive): bindings carry `c`, mods carry `mid` (the meter id) and `c`;
  `setBinding(i, band, amount, c)` keeps the curve when `c` is left out; `bandName()` labels features; the controller
  gained `binding(key)` / `mapping(key)` and `bind(key, band, amount, c)`; a "⚙ Curve & more sounds…" chip and a
  right-click item; `meterOn(r)` adds the meter element.
- Other small hooks: `tools/three-media.js` (`player.bytes`), `tools/three.js` (attach, the input menu item, routing
  `audio-*` messages, `onReady`), `lazy-data.js` (lab group + regenerated manifest), `dev/run-checks.js` (labaudio in
  the lab group, audio-test in unit), `mcp/three-guide.js` + `mcp/hearth-map.js` (one line each).

## Not done / limits
- Live builds / drops are a rough guess (a bass gap, then the bass back); songs get the real pass.
- The key needs a few seconds of harmony (it's an average of ~10 s); drums-only music has no key (`keyConf` 0).
- Bar 1 live is "the beat with the strongest kicks": a four-on-the-floor loop with equal kicks gives a low bar
  confidence (the value says so).
- The meters show the selected layer's sliders (two layers with a slider of the same name share a meter id).
- Not tried on a real Mac with BlackHole installed: detection is by the device name the OS reports.

Count: 87 upgrades.
