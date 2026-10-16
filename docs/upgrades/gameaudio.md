# ▶ Play's sound (round 54, gameaudio)

Sound in the ▶ Play window (Clink, the owner's three.js game) should be instant and never hitch the picture. Most
three.js games make their sound lazily: the `AudioListener` (which makes the page's `AudioContext`) and each sound are
loaded and decoded the first time they're needed. On the frame where that happens, the game pays for starting the
sound system and the sound itself comes late. ▶ Play now does that work up front, behind its "Getting ready" card.
Nothing goes into any prompt (0 tokens), there's no new setting or button, and the game's files are never changed:
Hearth only adds one script to the pages it serves to the game window.

New files: `tools/gameaudio-page.js` (runs in the game window, first in each page), `gameaudiomain.js` (main side:
the script's tag, and the sounds each game folder loaded), `dev/checks/gameaudio.js`. Small hooks in
`gamemodemain.js` (serves the script and notes sound files served), `gamemode.js` (the test switch), `playloopmain.js`
(rest / wake), `game-preload.js` (the F chip), `tools/gameready-page.js` (the card waits for the sounds) and
`tools/gameperf-core.js` / `tools/gameperf.js` (the doctor).

## What changed
1. **The sound system starts while the game loads.** The first `AudioContext` in a page costs 50 to 500 ms on the main
   thread here. ▶ Play now makes one at load, plays a single silent sample through it, then suspends it. The game's
   own context (three's `AudioListener`) then costs about 1 ms, wherever the game makes it.
2. **Low-latency sound by default.** When the game makes an `AudioContext` without a `latencyHint`, it now gets
   `'interactive'`: the smallest buffer the system gives without glitches. A game that asks for something else keeps
   it. The context runs straight away, with no click needed: the window allows sound at once, and Hearth adds no input
   listener to the game's page (gameinput's budgets are unchanged).
3. **Sounds decoded before the first frame.**
   - An HTML build: the sound files its folder served last time are noted in `data/game-cache/sounds.json` (50 games
     × 60 sounds; read with datasafe, written atomically). On the next ▶ Play they are read and decoded during
     "Getting ready" (the card shows "sounds n/m").
   - A Lab scene: its sound references (Layers › references) are decoded as soon as they reach the page.
   - When the game later decodes the same bytes, it gets the decoded buffer at once. The match uses the file's size
     and sampled bytes, at the same sample rate. When the game fetches the file, the bytes Hearth already read answer
     the request, so the file isn't read from disk and streamed over the next frames.
4. **Decoded sounds are kept for the session.** Every decode, the game's own included, is kept (up to 384 MB of
   samples), so a game that decodes a sound again each time gets it free. The bytes of files read up front are also
   kept (up to 96 MB).
5. **The sound pauses with the game.** Ctrl/⌘+P (back to editing) suspends the game's `AudioContext`s and pauses its
   playing `<audio>` / `<video>`. Coming back resumes them where they were, with the window unmuted only after they're
   running again. The same happens when the window is hidden: minimized, the Mac's full-screen space left with ⌘Tab, or
   covered on Windows. Losing focus alone does nothing: a game on another screen beside Hearth keeps its sound, just as
   its picture keeps going. Only what Hearth paused is resumed; a context the game suspended itself stays suspended.
6. **The latency shows on the F chip and in the doctor.** The F chip in the game reads like "… · HTML build · sound
   42 ms" (base + output latency, refreshed every 2 s while the chip is open). The same figure appears in the doctor's
   summary line and in the director's `three_do perf` head line ("; sound 42 ms").
7. **The doctor explains slow sounds in plain words.** It reports three kinds of finding:
   - "A sound slowed the picture: music.ogg (5 MB) was decoded while playing and one frame took 190 ms". This means a
     decode landed in a frame clearly longer than the machine's usual long frames.
   - "A sound came late: boom.ogg (68 KB) was decoded the first time it played, which held it back 260 ms".
   - "The game's sound started mid-play: the game froze 120 ms while its sound system switched on".
   Each comes with a fix: decode while loading (`AudioLoader.loadAsync` at the start) and reuse the buffer, stream long
   music through `<audio>`, and make the listener while loading.

## Measured (dev/checks/gameaudio.js; Xvfb, software GL, Chromium's fake sound output)
Each run uses a throwaway three.js game that makes its listener and loads each sound when first needed: a 0.4 s effect,
then a 30 s music track (5 MB). There are three ▶ Plays: **before** (Hearth's sound part off: store `gameaudio.off`),
**first** (on, first launch), and **after** (on, again). Ranges cover four runs on a loaded machine.

| | before | first launch | after |
|---|---|---|---|
| The game's `new AudioListener()` (its AudioContext) on its frame | 47–186 ms | 0.6–1.1 ms | 0.6–0.8 ms |
| The first sound, asked → playing | 59–243 ms | 12–24 ms | 6–10 ms |
| The 5 MB music, asked → playing | 77–302 ms | 77–421 ms (decoded then) | 36–92 ms (decoded already; the loader reading the bytes, about 1 frame) |
| Worst frame around the first sound (median frame 25–110 ms on this machine) | 55–189 ms | 32–124 ms | 31–83 ms |

Hearth's warm-up at load took 1–3 ms. The latency is 42 ms here (base 10 + output 32, Chromium's fake output at
44.1 kHz); on real hardware it's usually 10–25 ms. Other results: the sound suspended while resting, its clock stopped,
and it ran again from where it was after wake. A Lab scene's sound reference was decoded before its first frame and
played 9 ms after it was asked for. The game's files were the same before and after (hashes).

Check: `sh dev/run-checks.sh gameaudio` (gameaudio + unit:gameperf-test, unit:gamemode-test, unit:boot-test): 4/4.

## Upgrades
1. Sound system started behind the "Getting ready" card: a game's first `AudioContext` costs about 1 ms in play.
2. Interactive (low) latency for a game's `AudioContext` when it doesn't ask for its own.
3. Sound runs at once with no click, and with no input listener added to the game.
4. An HTML game's sounds are decoded before its first frame (from what its folder loaded last time).
5. A Lab scene's sound references are decoded before its first frame.
6. The game's own decode of a known sound returns at once, and its fetch is answered from the bytes already read.
7. Decoded sounds are kept for the session, so a sound decoded again is free.
8. The "Getting ready" card waits for the sounds ("sounds n/m").
9. Ctrl/⌘+P pauses the game's sound and brings it back where it was (unmuted only once running).
10. A hidden game window (minimized, ⌘Tab out of its full-screen space, covered on Windows) pauses its sound; a game
    beside Hearth on another screen keeps it.
11. The sound's latency on the F chip ("sound 42 ms").
12. The sound's latency in the performance doctor's summary and the director's perf line.
13. Doctor finding: a sound decoded mid-play that slowed the picture (file, size, frame time).
14. Doctor finding: a sound that came late because it was decoded when first played.
15. Doctor finding: the game's sound system starting mid-play.

## For the patch notes
- **Game sound is instant in ▶ Play.** Hearth starts the sound system and decodes your game's sounds while the game
  loads, behind "Getting ready", so the first sound plays at once and doesn't freeze the picture.
- In a test three.js game, the first sound went from 60–240 ms late to 6–10 ms, and starting the game's sound no longer
  costs a frame (47–186 ms before, about 1 ms now).
- The first time you play an HTML game, Hearth notes which sounds it loads. From the next time, they're ready before
  the first frame. A Lab scene's sound references are ready the first time.
- Sound uses low latency by default and plays without a click.
- **⌘P / Ctrl+P pauses the game's sound with the game**, and it comes back where it was. A minimized or hidden game
  goes quiet too. A game on another screen beside Hearth keeps playing its sound.
- Press **F** in the game to see the sound's latency on the stats chip, next to fps.
- "Why isn't it smooth?" (the performance doctor) now tells you when a sound slowed the picture or came late, names
  the file, and says how to fix it.
- Your game files are never changed. Hearth only adds its own script to the pages it shows in the game window.
