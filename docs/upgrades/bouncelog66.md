# bouncelog66 — Session log for music (round 66)

When you've spent 10 minutes or more making music in the Sound desk (Serum 2 / Vital, the Live set, Arrange), a small
strip shows up under the desk's top row: **"Nice session — 23 min."** with **💾 Save a 30-second sketch** and
**✓ Log it**. Everything is reached by clicking, with visible labels. Nothing is recorded, written or sent until you
click. Touches of other streams' and Codex's files are small, additive and marked `(round 66, bouncelog66)`.

## What shipped
### The session strip (Sound desk)
1. **The session clock.** Time counts while the Sound desk is on screen and something happens: a click or key in the
   window, or sound from the instrument. Playing your MIDI controller counts too, because the instrument host reports
   when it last heard sound. A desk left open on a quiet screen stops counting after 3 minutes.
2. **Breaks.** Leaving the desk (another tool, the window hidden) pauses the clock. Coming back within 20 minutes
   continues the same session; a longer break starts a new one.
3. **The strip at 10 minutes**: "Nice session — N min." with two labelled buttons and ✕. The minutes keep counting.
   - It sits under the desk's top row (Check audio runtime … Sessions) and stays in view while you scroll the desk.
   - It covers no control and is not a dialog.
   - It hides while the 🎤 Live set is open, so nothing ever sits over the pads.
4. **✕ dismisses it.** It never comes back for that session.
### 💾 Save a 30-second sketch
5. **The last 30 seconds of what the desk played** are saved as a **48 kHz stereo WAV**. That's the instrument plus the
   Live set's clips, before the monitor volume (what you heard). If live audio started less than 30 s ago, it saves
   everything since then.
6. **Recorded inside the instrument host.** It's a ring buffer in the audio thread (`creative-vst-sketch.py`), so a busy
   window can't make it glitch. It is written only on click, with 5 ms fades at both ends.
7. **Saved in the project's sketches folder**: `<Hearth data>/creative-sketches/<Sound desk project>/Sketch
   2026-10-26 14.05.33.wav`. A second save in the same second gets " 2"; nothing is ever overwritten.
8. **Silence isn't saved.** "The last 30 seconds were silent, so nothing was saved. Play something and save again."
9. After saving, the strip says where the sketch went and shows **▶ Play** (■ Stop) to listen right away.
### ✓ Log it
10. **The session goes in your Sessions list**, with its length, what you played (Vital / Serum 2, Park mode and the
    park, Live set, Arrange) and its sketches.
11. **It goes in My Paris** (Sidequest Studio › Paris map) as a **Music session** moment.
    - Its dot is on the timeline under the map, with the sketch playing in the moment.
    - A session in Park mode is pinned at that park.
    - The month recap counts music sessions.
12. **It's offered to every active music quest whose current step it fits** (Codex's proof contract). **No XP and no
    review happen by themselves**: the review stays your choice, as always. What fits:
    - **Make music at the park**: "Make a two-minute sketch outdoors", when Park mode was on.
    - **Finish a track**: "Pick the loops" / "Bounce the whole thing", when you used Arrange.
    - **Go to an open mic**: "Decide your own next step" / "Play your set", when you used the Live set.
    - **Any other music quest you've taken on** (a music place quest's "Bring it home", a started studio campaign like
      "A loop with somewhere to go"), but only when its step asks for a sketch, loop, patch, demo or bounce you make at
      home, and only with a saved sketch.
    - A step that needs you somewhere ("Get to Le Trabendo", "Find one this week") is never offered.
    - A session is never offered twice to the same step.
    - Codex's untouched starter campaigns are templates, not active quests.
13. **The proof is your sketch.** Without a sketch, a three-line session note (`Session … .txt`, in the same folder) is
    the proof. The proof's coverage says plainly that Astra can't hear audio.
14. The strip says what happened ("Logged ✓ · offered to “Decide your own next step” (Go to an open mic)", or "No music
    quest step fits this session right now"), then goes away.
15. Every logged session is announced as `hearth:quest-week` (`kind: 'music-session'`) for the week in review, and My
    Paris re-reads.
### Sessions (a button in the Sound desk)
16. **Sessions** sits in the desk's top row, after 🎤 Live set. It lists every session of 10 minutes or more, newest
    first ("Mon 26 Oct · 23 min · Vital · Live set"):
    - each sketch with a round **▶ play button**, **Show file** and **Remove sketch**;
    - **✓ Log it** for a session you didn't log yet, or "✓ Logged · Go to an open mic".
17. **Remove sketch moves the file to the Trash.** The session stays. Only files in the sketches folder can be removed.
18. **Empty state**: "No sessions yet. Play in the Sound desk for 10 minutes and Hearth offers to keep it here, with a
    30-second sketch if you want one."
### Also (secondary)
19. `/sessions`, `/sessions sketch`, `/sessions log`, `/sessions now`; Ctrl/⌘+K "Sound desk: my music sessions".

## How it works
- `tools/bouncelog-core.js` (UMD, no DOM, node-tested): the clock (`enter` / `leave` / `activity` / `tick`, `IDLE_MS`
  3 min, `BREAK_MS` 20 min, `OFFER_MIN` 10), `shouldOffer` / `dismiss`, `use`, `fits` / `credits`
  (active = Paris place / personal campaigns, the tracked one, or one with a step started, done or proven), `proofText`,
  `intentOf`, `noteText`, the store (`entry`, `validate`, `upsert` ≤ 200).
- `tools/bouncelog.js` (`BounceLog`) + `tools/bouncelog.css`:
  - plugs into the desk through parkjam62's `ParkJam.attach` / `ParkJam.pause`;
  - while the desk is mounted: one 30-second timer, a capture-phase pointerdown / keydown listener, visibilitychange,
    and one `sketch-status` request per tick, only with an instrument open. Leaving the desk removes them all;
  - the Sessions panel sits over the desk like Arrange does.
- Store: kv `music-sessions` `{ v: 1, sessions: [...] }`, read and saved through `DataSafe.load` / `DataSafe.save` (a
  failed read is never "empty"). It's written when a session reaches 10 minutes, on a save, on a log, and when you leave.
- Journal writes go through the ✦ tracker's careful writer, `QuestHud.write`, which uses the Studio's `mutate` when the
  Studio is open, else read → validate → change → validate → save. So Log it never navigates away from the desk.
- Host: `creative-vst-sketch.py` (`Sketch`):
  - `keep(block)` is one slice copy into a preallocated float32 ring (30.5 s ≈ 11.7 MB at 48 kHz, made on the first live
    block);
  - `sketch-status` reports `{ kept, soundAgo, running }`;
  - `sketch-save` resamples to 48 kHz when the device runs at another rate (the host's `to_target`), adds the fades, and
    writes 16-bit stereo `.part`, then renames it.

  A save skips the 0.5 s spare at the ring's write edge, so it never reads what the audio worker is writing (no lock in
  the audio path).
- Main: `bouncelogmain.js` (lazy IPC):
  - `sketchPath` (used by creative-vstmain for `sketch-save`; a path sent by the window is ignored);
  - `writeNote`, `isOurs`;
  - IPC `bouncelog:note | folder | ours`;
  - preload `hub.bouncelog`.
- My Paris (`tools/parisjournal-core.js` / `tools/parisjournal.js`, parisjournal64):
  - `collect({ sessions })` adds the `music` kind;
  - the recap counts `music` only when there are some (the counts shape is unchanged otherwise), and the image card's 4
    tiles are unchanged;
  - "Sound desk" never counts as a new place.

## Tests (no sound card, no real plugins)
- `node dev/bouncelog66-test.js` (`unit:bouncelog66-test`, in the `const UNIT` list, 57 checks). It covers:
  - **The clock**:
    - no strip at 9 min, the strip at 10;
    - a quiet desk counts only 3 more minutes, and playing again counts from then;
    - host-heard sound counts from when it was heard;
    - a break of 20 minutes or less continues the session, a longer one starts a new session (the old one handed back
      to be saved);
    - dismissed means never again; logged means gone;
    - `use` records Vital, Serum 2, Park mode and the park, the Live set and Arrange.
  - **Credits**, with the real QuestCore and QuestParis:
    - a plain session fits nothing;
    - Arrange → "Finish a track"; Park mode → "Make a two-minute sketch outdoors"; the Live set → open mic only at
      step 3 (not "Find one this week");
    - a paused quest is skipped;
    - a music place quest: never "Get to…", its at-home step only with a sketch;
    - an untouched starter campaign is not offered, the same campaign once started is, and "Name the world" never is.
  - **The proof**: it passes `QuestCore.checkProof`; it's submitted with no review and no XP; the journal still validates;
    it's never offered twice; without a sketch, the note is the proof.
  - **The store**: rows, upsert / replace, damaged rows dropped (never the whole list), capped at 200, newest first.
  - **My Paris**: logged sessions only; pinned at the park, or a dot at home; the recap counts them; "Sound desk" isn't a
    new place.
  - **Main**: the sketch path and folder, never overwriting, the default folder, the note written whole, `isOurs`.
  - **The ring**, through Python with a fake engine:
    - nothing played, or only silence: refused, no file;
    - 40 s played → exactly 30 s (1,440,000 samples) at 48 kHz, and it is the last 30 s (the sample at 15 s holds t =
      25 s);
    - faded ends, written whole.
  - **The real host** (fake Pedalboard / sounddevice):
    - `sketch-status` keeps from the first block, and a note is "heard";
    - silence is refused;
    - `sketch-save` writes to the path made by main (a window path is ignored);
    - the WAV is 48 kHz and has the note in it.
- `dev/checks/bouncelog66.js` (`node dev/smoke.js --fake-vst --script dev/checks/bouncelog66.js`, 35 checks, by
  clicking; the clock is moved with `BounceLog._test.advance`):
  1. Sessions in the top row, its empty state, ✕.
  2. No strip at 9 min. At 10 min, "Nice session — 10 min." with "💾 Save a 30-second sketch · ✓ Log it · ✕". It's
     42 px, covers no control and opens no dialog. The minutes follow.
  3. Hidden under the 🎤 Live set, back after it.
  4. A note played → 💾 → the WAV in `creative-sketches/Sunday session/`: 48 kHz, stereo, the note in it. Then ▶ / ■,
     and the session in kv.
  5. ✕, and 4 minutes later it's still gone.
  6. Sessions row ("18 min · Vital · Live set") with ▶; ✓ Log it → proof on "Decide your own next step" (Go to an open
     mic). It's not reviewed and gives no XP. The row says "✓ Logged · Go to an open mic". The week event fires, and
     My Paris has the moment.
  7. Another tool, 25 minutes away → a new session. Its strip's ✓ Log it → "No music quest step fits", with no second
     proof.
  8. Remove sketch → the Trash, and the row is kept and still logged.
  9. Nothing sent anywhere (fetch / XHR watched).
- Group: `node dev/run-checks.js bouncelog`.
- Results (app checks under `flock /tmp/hearth-run.lock`, at most 5 per hold, output in my scratch folder):
  - pass: bouncelog66, vst-live, parisjournal64, unit:boot-test (the first screen is unchanged: everything is in the
    `creative` lazy group), unit:bouncelog66-test, unit:parisjournal64-test, unit:liveset64-test, unit:parkjam62-test,
    unit:winmac-scan. `node dev/lazy-manifest.js` was regenerated (`/sessions` + the palette line).
  - **These fail identically on the base commit (becd52e) without my change. I checked each on an extracted copy of it.**
    They aren't from this stream:
    - `lazy`: "all held at start", with the `projects` group loaded at start;
    - `liveset64`: "the pad's knob filters it in the host: Filter off";
    - `parkjam62`: "the week's review hears the loop became proof";
    - `unit:vst-live-host-test`: a gain of 0.075 vs 0.1;
    - `unit:datasafe-scan`: tools/quest-chat.js;
    - `unit:winmac-test`: cloud-files.js and sync-engine.js;
    - `unit:errorcalm-scan`: 11 places, none of them mine.
  - bouncelog66 failed once at "Remove sketch". The check read the list before the row was saved after the file moved;
    it now waits for the save. It passed on both runs after the fix.

## Risks / notes
- **Arrange's ▶ Play isn't in the sketch.** Arrange previews through the window's Web Audio, not the instrument host;
  the sketch holds what the host played (the instrument + Live set clips). The time spent in Arrange still counts for
  the session.
- **One instrument's ring.** With both Serum 2 and Vital loaded (two hosts), Save takes the ring of the one open in the
  desk.
- **Memory.** Each live host keeps ≈ 11.7 MB for the ring while it runs.
- **The clock counts the desk on screen.** It doesn't count a session played with Hearth minimised: a hidden window
  pauses the clock, like leaving the desk.
- A session starts fresh after Hearth restarts. Sessions that reached 10 minutes are already in the list by then.
- My Paris reads `music-sessions` read-only. A failed read shows no sessions, and nothing is written there.

## For Codex
Your files touched (all additive, marked `(round 66, bouncelog66)`):
- `creative-vst-host.py`:
  - loads `creative-vst-sketch.py` (new, mine) as `sketch`;
  - `Engine.sketch = sketch.Sketch(self)`;
  - in `produce()`, right after `self.peak = …`: `self.sketch.keep(block)` (one slice copy per block);
  - `command()` routes `sketch.ACTIONS` (`sketch-status`, `sketch-save`) next to the park recorder's actions.
- `creative-vstmain.js`:
  - `SKETCH_ACTIONS` added to `request()`'s allowed actions;
  - for `sketch-save`, `job.output = require('./bouncelogmain.js').sketchPath(dataDir, request.project)` (main makes
    the path).
- **Not touched**: `tools/workbench-vst.js`, `tools/quest-*.js`. The desk hooks go through parkjam62's
  `ParkJam.attach` / `ParkJam.pause`. Journal writes go through `QuestHud.write` with your `QuestCore.submit` /
  `checkProof`; no new journal fields.
- Others: `main.js` (one `lazyIpc` line), `preload.js` (`hub.bouncelog`), `tools/parkjam.js` (two hook lines),
  `tools/parisjournal-core.js` / `tools/parisjournal.js` (the `music` moments), `lazy-data.js` / `lazy-meta.js`
  (`creative` group + META), `dev/run-checks.js` (UNIT + the `bouncelog` group).

## To test on the owner's PC
1. Update Hearth (⬆ Update) and **restart it fully**, because the instrument host has a new part.
2. Creative Playground → Serum 2 / Vital → open Vital (or Serum 2) and play for 10 minutes. The strip appears under the
   top row.
3. Play a phrase, then **💾 Save a 30-second sketch**, then **▶ Play**. You should hear the last 30 s, from the UA
   output as you heard it.
4. **✓ Log it** with the Live set used in the session and the open-mic quest at step 3: it's offered there. Check the
   quest in Sidequest Studio (no XP yet).
5. **Sessions** (top row): the session is there; ▶ plays the sketch. Remove sketch puts it in the Recycle Bin / Trash.
6. Sidequest Studio › Paris map: a purple Music session dot under the map, with the sketch playing in the moment.

## For the patch notes
- **Nice session — your music sessions are kept now.** After 10 minutes in the Sound desk (Creative Playground → Serum 2
  / Vital), a small strip shows up under the desk's buttons: "Nice session — 23 min."
- **💾 Save a 30-second sketch** keeps the last 30 seconds of what you just played, as a WAV, in your project's
  sketches folder. Nothing is recorded to disk until you click, and nothing is uploaded.
- **✓ Log it** puts the session in your **Sessions** list and in **My Paris** (the Paris map's timeline). It's also
  offered as proof to the music quests it fits: the park sketch, Finish a track, your open-mic set. The review and XP
  stay your choice.
- **✕** hides the strip for the rest of that session.
- **Sessions** (a new button in the Sound desk's top row) lists your past sessions with ▶ play buttons for their
  sketches. Remove sketch sends a file to the Trash.
- The clock only counts time you're actually making music: a desk left open on its own stops counting after 3 minutes.
  Playing your MIDI controller counts.
- Caveat: Arrange's ▶ Play isn't in the 30-second sketch (it plays outside the instrument). Everything played through
  Serum 2 / Vital and the Live set is.
