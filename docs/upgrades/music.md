# Music side of the Lab (music stream, round 5)

You live in the timeline: Tap, the waveform, live sound, presets, Auto bars, K / S markers. This round the app does
the figuring out and you confirm: it finds the tempo, bar 1, the drops and the hits, picks the trigger preset and
offers to make the sketch react, all in one note when a song loads. Nothing new to set: no new settings, two new
buttons at most when they are useful (the "keep them" note on a lane, "✦ Make it react" in the song note).
Everything is also a chat command (area "Three.js Lab", `/help lab`).

## The song, analysed for you (in the background)
1. **Analysis runs in a background Worker**: the Lab stays smooth while a song is analysed (a 107 s song ≈ 1.3 s, a 5-minute song ≈ 3 s); the song name shows "analyzing 40 %".
2. **Better tempo**: onsets from the spectrum (spectral flux) + a comb over the autocorrelation + a straight grid fitted through the beats, so the BPM is exact (128.00, not 127.7).
3. **Produced or played**: it tells a song on a fixed grid from a band whose tempo drifts; played songs keep beat-by-beat tracking.
4. **Bar 1 found automatically** (bass / chord changes, new energy and kicks on the 1, snares on 2 and 4; pickups handled): bar numbers, Loop this bar, Fill on 1 and 3, sections and Freeze on the bar count from the real 1 without you setting it.
5. Grid lines land **on the attacks** (lined up on the kicks), not between them.
6. **How sure** it is of the tempo and of bar 1 (BPM readout tooltip and `/analyze`).
7. **Kick / snare / hi-hat hits** found in the audio, each placed to the millisecond on its attack.
8. **Sections with confidence**: Intro / Build / Drop / Break / Outro from each bar's loudness, bass, highs and kicks, cut on 4- and 8-bar phrases.
9. **Drops** found (the start of each drop).
10. **A style guess** (four-on-the-floor, half-time, breaks, played, soft, by tempo) that picks the trigger preset.
11. Drum & bass heard at half speed is doubled by itself (87 → 174 BPM).
12. Sections ▾ → **Mark sections from the song** now uses those names (the menu shows them), numbers repeats (Drop 2) and says how many it isn't sure of.
13. **One note when a song is ready** (once per song and sketch, not on every sketch switch): tempo, bar 1, the first drop and the triggers it picked.
14. `/analyze` (or `/analyse`, `/song-analysis`): tempo and bar 1 with how sure, sections with confidence, drops, the hits found, the style; `/analyze again` re-runs it (your grid, markers and cues stay).
15. The Three Director's song info now has bar 1, the confidences, the hits found and the style.
16. Video Review's audio analysis (beats and drops on its timeline) runs in the same background Worker: no stall when a video opens.

## "Mark kicks for me"
17. **Ghost hits**: an empty Kick or Snare row shows the hits found as faint outlines with "✦ 77 found · keep them"; **one click keeps them all** as real markers (drag, nudge or delete any after; Ctrl+Z undoes).
18. Right-click **K** or **S** → "✦ Mark kicks (snares) for me", with how many in the loop or the song.
19. Fill ▾ → "✦ Mark the hits from the song": kicks, snares and hats at once (hats get their own row).
20. Your hand-placed markers stay; found hits next to one of yours are skipped; with a loop, only the loop.
21. `/mark-kicks [kicks|snares|hats|all]` (or `/mark-hits`).
22. Ctrl+K → "Lab: Mark kicks for me (from the song)".

## Tap that learns
23. **Taps near the song's tempo lock to its grid exactly** (the button shows "Tap · 128 ✓" with a green edge) instead of a rough tapped 127.6.
24. **Half / double-time fix**: tapping at half or double speed keeps the song's tempo; the note offers "Use 64" in one click if you meant it.
25. Taps that clearly put the beat elsewhere move the grid's phase onto them (fixes a grid one off-beat late).
26. **It learns how late you tap** (from steady taps on a grid you agree with); K / S / H at the playhead and "this tap is the 1" allow for it. Tap right-click → "Forget how late I tap"; `/tap-latency [forget]`.
27. **Tap the 1** (Shift+T) keeps the tempo and phase: the beat line nearest your tap becomes the 1.
28. Tap right-click → "Back to the song's grid".
29. Tapping in slow motion (½×, ¼×) gives the song's real tempo.
30. **Nudge by ear while it plays**: `,` and `.` move the grid 5 ms earlier / later (Shift 1 ms, Alt 20 ms); a run of nudges is one undo step and one note with the total.
31. `/downbeat [auto|here|<time>]` (or `/bar-one`): bar 1 as detected, at the playhead, or at a time.
32. The BPM readout's tooltip: detected or yours, how sure, bar 1, your tap timing.

## A waveform you can read
33. **3-band waveform**: bass red, mids gold, highs cyan, each as tall as its own loudness, so kicks, bass lines and hats read apart (the RGB toggle, View ▾ → RGB waveform).
34. **Sections as soft colored bands** with a strip and a name tab ("Drop", "Build ?" when unsure).
35. The overview strip is colored by sections too.
36. **Beats and bars clear at every zoom**: zoomed out, every 2nd / 4th / 8th bar with stronger phrase lines; bar numbers spaced so they never pile up.
37. The beat grid is drawn into its own cached picture (redrawn only when the view or the grid changes).
38. **The loop stands out**: while it loops, the rest of the song is dimmed.
39. **Smoother while a song plays**: the timeline canvas isn't redrawn when nothing on it changed, the overview is cached, and sizes no longer force a page layout ten times a second (timeline script time while playing: about 16–43 ms → 1 ms per 3 s in the test).
40. The playheads only touch the page when they actually appear or hide.

## Music → visuals with no setup
41. **✦ Make it react** (one button in the song note when the sketch has sliders and none follows the music yet): sensible sliders follow the music by their names: size / scale / pulse → the kick, glow / bloom → the bass, speed / rotation → the loudness, shake / glitch → the snare, sparkle / grain → the hats; counts, seeds and values only read at build time are left alone; at most five. Undo in the note.
42. `/make-it-react [undo]` (or `/react-music`, `/auto-react`); Ctrl+K → "Lab: Make it react to the music".
43. **The trigger preset is picked from the song** (style and tempo) when the song has no triggers of its own; kept per song after that.
44. The pick **shows on the button** ("Techno ▾", the tooltip says why); Presets ▾ marks the current one ● and offers "✦ From the song: …" to pick it again; Undo in the note.
45. `/auto-preset`: picks it again and says why.
46. `/drops [next|prev|N]` jumps to the drops; Ctrl+K → "Lab: Jump to the next drop", "Lab: What the app found in the song".

## Live sound
47. **Auto gain** (the default until you pick a gain): quiet or loud playback reaches the sketch and the triggers at about the same level; it follows a louder part fast, a quieter one slowly, and holds through silence. 🎧 Live ▾ → Gain shows "Auto (×1.8 now)"; `/live gain auto`.
48. **Beat-lock light** next to 🎧 Live: grey while it listens, a red pulse on the beat it hears once locked (a compositor animation, restarted only when the tempo or phase moves).
49. **Latency from your taps**: with live sound on, tap T 8 times on the beat you hear and the latency offset sets itself (minus your own tap delay), with Undo; `/live calibrate` explains.
50. `/live-status` (or `/beat-lock`): tempo, lock, gain and latency.
51. The Lab keys sheet (?) lists `,` `.` and what T does with live sound.

## For testing (not counted)
- `node dev/music-test.js`: 59 checks of the analysis on synthetic songs with known answers (128 with a pickup, 174 breaks, 140 half-time, 95, a drifting band, a pad, silence).
- `dev/make-test-song.js` gained `--form` (intro / build / drop / break / drop / outro), `--pickup`, `--lead`, `--style four|half|breaks` and, as a module, tempo drift and timing jitter.
- `dev/checks/music.js` (in the app): Worker, no slow frames from the analysis, tempo / bar 1 / drops on a written song, ghost click, Ctrl+Z, taps, nudge, Make it react, every new command, 0 duplicate commands, trace numbers while playing.
