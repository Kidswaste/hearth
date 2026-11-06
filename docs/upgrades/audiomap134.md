# Round 134 · audiomap134: 🎚 Follow the music, "this slider follows the bass"

The Lab could already move any slider with the music: ♪ Move with the music (round 38) offers 11 drivers and 4 ways to
move. It did not guide the owner, though. It had no live meter of the sound itself, no "low-mids" and no range of
your own, and every click inside it was already a change. This round adds **🎚 Follow the music…**, a small guided
card on top of the same link. It suggests a band, shows a live meter and a small spectrum while the song or live input
plays, and moves the slider in the preview. **Keep** applies it as one undo step. Cancel leaves the slider as it was.

## What existed (and is reused, not duplicated)
- **♪ Move with the music** (round 38, beatlink: `tools/three-beatlink-core.js`, `tools/three-beatlink.js`). A
  slider's link `{ band, how, lo, hi, att, dec, … }` is stored in the scene's `bindings` (kv `three-lab-extras`, per
  layer), so it goes along with looks, 📐 templates and packs. The preview page (`tools/three-sandbox.html`
  `blSrc` / `blValue`) computes it from the song's time alone, using the beat grid, the song's kick / snare / hat
  hits and its 30 fps envelopes. A render is therefore the same every time and matches the preview. Live input uses
  the same shapes on what it hears. `BeatLinkCore.make` builds a new link, and `/move-with` is the command that chats
  and directors use (`three_do run`). The card has a meter, range handles drawn on the slider itself, and one undo step
  per change.
- **The song's analysis** (`tools/three-music-core.js`, in a Worker). It finds the tempo, beats, bar 1 and the kick /
  snare / hat onsets, and makes 30 fps envelopes for level, bass (< 150 Hz), mids (150 Hz–2 kHz) and highs (> 2 kHz),
  plus sections and drops. It had no finer split of the sound (no low-mids, no spectrum).
- **Live input and features** (round 23, labaudio: `tools/three-audio*.js`). An AudioWorklet works out 8 bands
  (sub … air), drum hits, loudness and more. Songs get the same features from a whole-song pass in a Worker, cached.
  The curve editor ("♪ React to a sound (curve)…", `tools/three-audio-map.js`) maps any feature onto a slider with a
  threshold, punch, invert, attack and release. That editor only follows the live analyser, so renders do not repeat
  it exactly.
- **three-music.js**: live tempo and the music helpers for sketches.
- **The Sliders panel** (`tools/three-tweaks.js`). It has the ♪ button, the right-click menu (`rowMenu`), the panel's
  ⋯ (`moreMenu`), the sliders' own undo (`undoStack`, Ctrl/⌘+Z) and `setLink` (one undo step per link change).
- **A layer's "When it plays"** (`tools/three-layers.js`). It sets when the layer starts and ends, its fades and the
  Animate presets. Sliders have no part in it.
- **⚡ Triggers** (`tools/three-triggers.js`). They set which part of the sound fires audio.kick / bass / snare / hats
  / hit for sketches, shown like an EQ.
- **✦ Map to the song** (songmap130). It proposes cues, drop keyframes and kick / snare links (`BeatLinkCore.make`) as
  ghosts.

So 🎚 Follow the music writes **the same beat link**. It adds a few optional fields. Old links read exactly as before.

## What's new, and where the owner clicks
- **Right-click a slider › 🎚 Follow the music…** (the row under ♪ Move with the music…).
- **The Sliders panel's ⋯ › 🎚 Follow the music…**, then pick the slider.
- **The 〰 mark** on a slider that follows the music. Click it to open its card again.
- Ctrl/⌘+K: "Lab: 🎚 Follow the music".

The card (300 px, nothing always visible):
- **Band:** Bass · Low-mids · Mids · Highs · Kick · Snare · Loudness · Custom.
- **A small spectrum** of the sound right now, with the band's range shaded. **Drag across it** to follow a range of
  your own: Custom, shown in Hz.
- **Two live rows.** The first is the band's meter. The second is the slider as the preview moves it, with a dot on
  its range and the value.
- **From → to** on the slider's own scale, and **⇅ Invert**.
- **Response:** Smooth (glides) · Punchy (quick up and down) · On the beat (moves only on the beat, as high as the
  band is then; for a drum, only its hits that land on a beat).
- **Keep** applies it as **one undo step**. **Cancel**, ✕, Esc or a click outside puts back what was there.
  **Remove** takes the link off (one undo step). **♪ More…** opens the full ♪ Move with the music card (pulse, step,
  random, rise / fall times).
- **Auto-suggest, free and local** (`BeatLinkCore.suggest`). The slider's name picks the band and response:
  - glow / bloom / size → Bass, punchy;
  - speed / spin → Loudness, smooth;
  - sparkle / shimmer → Highs, punchy;
  - shake / glitch → Snare, punchy;
  - hue / tone → Low-mids, smooth.

  The song's analysis then checks that choice. If the song barely moves in that band, it switches to the band that
  moves most. A song with few kicks follows its bass instead. The range starts at the slider and covers half its span.

**Where it plays.** It plays everywhere a beat link plays: the preview, renders (from the song's analysis, so a frame
matches the preview at the same time), the Lab sequence, ◉ Perform's Stage, the backstage and live input (the
worklet's 8 bands for low-mids and a custom range).

**The AI** uses the existing path, with no new tool and no prompt cost. `three_do run` sends `/move-with`, which now
also understands these words:
`/move-with glow bass punchy`, `/move-with tone 200-800hz smooth`, `/move-with size kick on the beat invert`.

## How it works (files)
- `tools/three-beatlink-core.js` (lab group, also sent to the preview page and loaded in Node):
  - new drivers `lowmids` and `custom` (`fLo`–`fHi` Hz);
  - the how `onbeat`;
  - `inv` (s → 1 − s) in `value()`;
  - `resp` (the card's name for a how and its timing: `respond()`, `respOf()`);
  - `hzOf`, `weights`, `specLevel` / `specAt` (the song's spectrum), `liveLevel` (8 live bands);
  - `suggest()` (the name and the analysis), `wizLink()`;
  - `short()` names the new links ("Custom 200–1.5k Hz · smooth · inverted").
- `tools/three-music-core.js`: the analysis also gives `spec`, a small spectrum of 20 log bands from 30 Hz to 11 kHz
  at 30 fps, stored as (amplitude / the song's peak)^¼ in a Uint8Array (≈ 3 KB a minute). An analysis made before
  this round has no `spec`. Low-mids and custom then fall back to the nearest of bass, mids or highs.
- `tools/three-sandbox.html` `blSrc`: low-mids and custom read `analysis.spec` (songs) or the live bands, and a custom
  range gets its own source (its Hz are in the key).
- `tools/three-tweaks.js`:
  - `modsNow` passes `inv` / `fLo` / `fHi` to the preview (the Lab sequence already copied the whole link);
  - the right-click row and the panel ⋯ row;
  - `openFollow(key)` on the controller.
- `tools/three-beatlink.js`: the 〰 mark (in `decorate`), `BeatLink.follow(adapter)` (lazy-loads the card), the
  `/move-with` words and a Ctrl/⌘+K action. In the ♪ card, Low-mids, Custom and On the beat show up as chips too.
- `tools/three-follow.js` + `.css` (`FollowMusic`): the card. It is the new lazy group **audiomap**, loaded on first
  use, with nothing on the first screen.
- `lazy-data.js`, `lazy-meta.js` (manifest re-run), `index.html` (the `lazy-at.js` tag), `docs/lazy-groups.md`.

## Tests
One check: `dev/checks/audiomap134.js`, in the group `audiomap134`
(`node dev/run-checks.js audiomap134`: it also runs beat108, songmap130, labchat92, unit:beatlink-test and
unit:boot-test). It uses the fixture song `/tmp/hearth-autoedit-song.wav` and its own temp data, and covers:
1. Right-click › 🎚 Follow the music… opens the card. Glow is guessed as Bass, punchy, and previewed with no undo
   step.
2. While the song plays, the card's live meter moves.
3. The slider follows the band. Its values in the preview correlate with the song's bass at the playhead
   (r ≈ 0.9).
4. Keep is ONE undo step, and one Ctrl/⌘+Z takes it off whole. Tone is guessed as Low-mids, smooth.
5. The 〰 mark shows, and a click opens the card again. A drag on the spectrum sets a Custom range in Hz, and Esc
   puts the link back with no undo step.
6. A render frame from the hidden export page matches the preview at the same time, for two sliders: Glow from the
   bass and Tone from the spectrum. The second render gives the same pixels.
7. An old round 38 beat link (kick, pulse) still plays. The card reads it, and Cancel leaves it unchanged.
   `/move-with size bass punchy invert` works. The links are saved with the scene.

`dev/beatlink-test.js` gains one case for the new math (responses, invert, on the beat, the spectrum's level, the
guess, the name).

Run this round:
- audiomap134 ✓
- beat108 ✓
- songmap130 ✓
- labchat92 ✓
- beatlink ✓
- unit:beatlink-test ✓ (18/18)
- `node dev/boot-test.js` ✓ (first screen within budget)
- slim116 and selfmap118 ✓

## For the patch notes
- **🎚 Follow the music.** Right-click a slider (or use the Sliders ⋯) and choose 🎚 Follow the music…. Pick what it
  follows: the bass, low-mids, mids, highs, the kick, the snare, the overall loudness, or drag your own range on the
  little spectrum. While the song or your live sound plays, you see a live meter and the slider moving. Set how far
  it moves, Smooth / Punchy / On the beat, and Invert if you want it backwards. Then press Keep. One Ctrl/⌘+Z undoes it.
- It guesses for you: a "glow" slider starts on the bass, punchy; a "speed" slider on the loudness, smooth; a
  "sparkle" slider on the highs. It also checks your song: if there's barely any bass, it picks what moves most.
- A small 〰 shows on every slider that follows the music. Click it to change it.
- Renders move exactly like the preview, and so do Perform and live input.
- Chats can ask for it too ("make the glow follow the bass, punchy").

## For Codex
No Codex-owned file was changed this round (none of astra*, codex-*, projects*, project-workspace*, sync-engine.js,
cloud-files.js, workbench-*, engine-watch.js). There is nothing to merge on your side.
